/**
 * Driving piper ourselves: phonemise, remap, infer.
 *
 * vits-web's `predict()` does all three in one call and exposes no seam, so
 * there is nowhere to put `remapPhonemeIds` — and without it every `low` and
 * `x_low` voice is unreachable, which in German means every female voice piper
 * publishes. Owning the three steps is the only way to get between them.
 *
 * What that costs is that the model fetch and its cache become ours too, since
 * `predict()` was doing those. What it buys, besides the voices: ids come from
 * the model's own table (see `phonemes.ts`), and models are fetched from the
 * mirror in `voices.json` rather than from a hardcoded `PATH_MAP` that omits
 * five of the voices its own catalogue advertises.
 *
 * THE INVARIANT THIS PATH MUST HOLD. A voice that already speaks must come out
 * of it unchanged. Identical phoneme ids mean identical inference input, which
 * means the same synthesis and no reason to re-render anything — so no pipeline
 * bump for the consumers that adopt this. Only voices that could not speak
 * before may sound different, because before they made no sound at all.
 * `test/phonemes.test.ts` asserts it against captured fixtures.
 *
 * Note that "identical audio" is not the test and cannot be: piper is a VITS
 * model with a stochastic duration predictor, and three renders of one sentence
 * give three different files. Identical *ids* is the property that carries.
 */
import { byId, modelUrls, refuse, type Offering } from './catalogue.js';
import { remapPhonemeIds, type PhonemeIdMap } from './phonemes.js';

/** The Emscripten factory from `@diffusionstudio/piper-wasm`. */
export type PhonemizerFactory = (options: {
  print(line: string): void;
  printErr(line: string): void;
  locateFile(path: string): string;
}) => Promise<{ callMain(args: string[]): void }>;

/** The slice of onnxruntime-web this uses. */
export interface OnnxModule {
  InferenceSession: {
    create(model: ArrayBuffer | Uint8Array): Promise<{
      run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
    }>;
  };
  Tensor: new (type: string, data: ArrayLike<number> | BigInt64Array, dims?: number[]) => unknown;
  env: { wasm: { wasmPaths?: string }; allowLocalModels?: boolean };
}

/**
 * Where the pieces come from.
 *
 * Injected rather than imported because each consumer serves them differently
 * and neither should have to change to suit the other: mitreden vendors them
 * into its own `vendor/` and serves same-origin so nothing reaches a CDN at
 * run time, vorlaut resolves bare specifiers through an import map.
 */
export interface PiperRuntime {
  phonemizer(): Promise<{ createPiperPhonemize: PhonemizerFactory }>;
  onnx(): Promise<OnnxModule>;
  /**
   * Directory holding `piper_phonemize.wasm`, `piper_phonemize.data` and the
   * onnxruntime binaries, as the page serves them. Trailing slash optional.
   */
  wasmBase: string;
  /** Overrides model fetching, for a consumer with its own cache or a test. */
  fetchModel?(url: string): Promise<ArrayBuffer>;
}

let runtime: PiperRuntime | null = null;

/** Say where piper's pieces come from. Call once, before the first sentence. */
export function usePiperRuntime(r: PiperRuntime): void {
  runtime = r;
}

export const hasPiperRuntime = (): boolean => runtime !== null;

function need(): PiperRuntime {
  if (!runtime) {
    throw new Error(
      'No piper runtime. Call usePiperRuntime({ phonemizer, onnx, wasmBase }) '
      + 'with wherever this app serves piper_phonemize and onnxruntime from.',
    );
  }
  return runtime;
}

// --- the model and its config -------------------------------------------------

interface VoiceConfig {
  readonly phoneme_id_map: PhonemeIdMap;
  readonly num_symbols?: number;
  readonly espeak: { voice: string };
  readonly audio: { sample_rate: number };
  readonly inference: { noise_scale: number; length_scale: number; noise_w: number };
  readonly speaker_id_map?: Record<string, number>;
}

/**
 * The origin private file system, when there is one.
 *
 * A medium model is 63 MB and a high one 114, so the first sentence in a voice
 * pays for a download and every one after it should not. OPFS is per origin and
 * survives clearing history, which is what `predict()` used and what a consumer
 * expects to still be true after this change.
 *
 * Absent — node, a private window, an older browser — everything still works
 * and every sentence re-fetches. Slow is a better failure than broken.
 */
async function opfs(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const root = await navigator?.storage?.getDirectory?.();
    return (await root?.getDirectoryHandle('stimmquelle-models', { create: true })) ?? null;
  } catch { return null; }
}

async function cached(name: string, url: string, onProgress?: (share: number) => void): Promise<ArrayBuffer> {
  const r = need();
  if (r.fetchModel) return r.fetchModel(url);

  const dir = await opfs();
  if (dir) {
    try {
      const handle = await dir.getFileHandle(name);
      return await (await handle.getFile()).arrayBuffer();
    } catch { /* not cached yet */ }
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: the mirror said ${response.status}`);
  const total = Number(response.headers.get('content-length')) || 0;
  let bytes: Uint8Array;
  if (onProgress && total && response.body) {
    const reader = response.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      onProgress(loaded / total);
    }
    bytes = new Uint8Array(loaded);
    let at = 0;
    for (const p of parts) { bytes.set(p, at); at += p.length; }
  } else {
    bytes = new Uint8Array(await response.arrayBuffer());
  }

  if (dir) {
    try {
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await (handle as unknown as { createWritable(): Promise<{ write(d: Uint8Array): Promise<void>; close(): Promise<void> }> }).createWritable();
      await writable.write(bytes);
      await writable.close();
    } catch { /* a cache that cannot be written is still not an error */ }
  }
  return bytes.buffer as ArrayBuffer;
}

/** Which voices are already downloaded, by id. */
export async function downloadedModels(): Promise<string[]> {
  const dir = await opfs();
  if (!dir) return [];
  const out: string[] = [];
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) {
    if (name.endsWith('.onnx')) out.push(name.slice(0, -'.onnx'.length));
  }
  return out;
}

/** Throw the downloaded models away. */
export async function forgetModels(): Promise<void> {
  const dir = await opfs();
  if (!dir) return;
  const names: string[] = [];
  for await (const name of (dir as unknown as { keys(): AsyncIterable<string> }).keys()) names.push(name);
  for (const name of names) await dir.removeEntry(name).catch(() => {});
}

// --- phonemising ---------------------------------------------------------------

export interface Phonemised {
  readonly phonemes: string[];
  readonly phonemeIds: number[];
}

/** espeak's answer for one sentence, both forms, straight from the wasm. */
export async function phonemise(text: string, espeakVoice: string): Promise<Phonemised> {
  const r = need();
  const { createPiperPhonemize } = await r.phonemizer();
  const base = r.wasmBase.endsWith('/') ? r.wasmBase : `${r.wasmBase}/`;
  if (!espeakVoice) {
    throw new TypeError(
      'phonemise(text, espeakVoice) wants espeak\'s language code — the '
      + "`espeak.voice` field of a model's .onnx.json, usually 'de' or 'en-us'. "
      + 'A piper voice id is not it.',
    );
  }
  const line = await new Promise<string>((resolve, reject) => {
    createPiperPhonemize({
      print: resolve,
      printErr: message => reject(new Error(
        message || 'the phonemizer failed and said nothing about why',
      )),
      locateFile: path => path.endsWith('.wasm') ? `${base}piper_phonemize.wasm`
                        : path.endsWith('.data') ? `${base}piper_phonemize.data`
                        : path,
    }).then(module => module.callMain([
      '-l', espeakVoice,
      '--input', JSON.stringify([{ text: text.trim() }]),
      '--espeak_data', '/espeak-ng-data',
    ])).catch(reject);
  });
  const parsed = JSON.parse(line) as { phonemes: string[]; phoneme_ids: number[] };
  return { phonemes: parsed.phonemes, phonemeIds: parsed.phoneme_ids };
}

// --- the whole thing -----------------------------------------------------------

/**
 * Either a bare callback or the options object below.
 *
 * `speak()` next door takes a whole options object, so handing this one the
 * same object is the obvious slip. It used to fail with "onProgress is not a
 * function" from somewhere inside; now it either works or says which it wanted.
 */
export type SynthesizeProgress = ((share: number) => void) | SynthesizeOptions;

/**
 * How this path may be varied: progress, and the licence claim.
 *
 * `Offering` is here rather than alongside it because the attribution claim has
 * to reach this function from `speak()` — both ask the licence question, and a
 * claim that did not travel would have the second gate refuse what the first
 * allowed.
 */
export interface SynthesizeOptions extends Offering {
  onProgress?(share: number): void;
}

export interface Synthesised {
  readonly samples: Float32Array;
  readonly rate: number;
  /** True when the model's table agreed with the phonemizer and nothing was composed. */
  readonly exact: boolean;
  readonly dropped: string[];
}

/**
 * Text in, raw samples out, at whatever rate the model speaks.
 *
 * Levelling is a separate step on purpose — `postprocess` takes it from here.
 *
 * **The licence gate is asked here too, not only in `speak()`.** This function
 * fetches models from Hugging Face on its own account, which makes it a place a
 * licence can be broken, and for one commit it was: it checked only that the id
 * was in the catalogue, so `en_US-hfc_female-medium` — the CC BY-NC-SA voice
 * this whole repository exists because of — downloaded and spoke through it
 * without anything asking. Being the lower-level of the two doors is not a
 * reason to ask less; it is why it gets used by something that has not asked.
 *
 * The *runtime* half is deliberately not asked, and that is the difference
 * between the two questions rather than a hole in this one. `browser` in the
 * catalogue records what `@diffusionstudio/vits-web` can do, and this path
 * exists precisely because it can do more — it is the route to the `low` and
 * `x_low` voices vits-web cannot reach and to the five its `PATH_MAP` omits.
 */
export async function synthesize(
  text: string, id: string, progress?: SynthesizeProgress,
): Promise<Synthesised> {
  const options: SynthesizeOptions = typeof progress === 'function'
    ? { onProgress: progress }
    : progress ?? {};
  // An object carrying keys but none this function knows is speak()'s options
  // object, handed to the wrong one of two neighbours. `{}` and an object whose
  // known keys are all undefined are not that — speak() builds exactly such an
  // object when a caller asked for neither progress nor an attribution claim.
  const known = ['onProgress', 'rendersAttribution'];
  const keys = typeof progress === 'object' && progress !== null ? Object.keys(progress) : [];
  if (keys.length && !keys.some(k => known.includes(k))) {
    throw new TypeError(
      'synthesize() takes a progress callback, or { onProgress }. It sits next '
      + 'to speak(), which takes a whole options object — passing speak\'s '
      + 'options here is the easy mistake and this is it being caught.',
    );
  }
  const refusal = refuse(id, null, options);
  if (refusal) throw new Error(refusal);
  const r = need();
  const voice = byId(id)!;
  const urls = modelUrls(voice.id, 'browser')!;

  const configBytes = await cached(`${voice.id}.onnx.json`, urls.config);
  const config = JSON.parse(new TextDecoder().decode(configBytes)) as VoiceConfig;

  const { phonemes, phonemeIds } = await phonemise(text, config.espeak.voice);
  const { ids, dropped, exact } = remapPhonemeIds(phonemes, phonemeIds, config.phoneme_id_map);

  const model = await cached(`${voice.id}.onnx`, urls.onnx, options.onProgress);
  const ort = await r.onnx();
  ort.env.allowLocalModels = false;
  ort.env.wasm.wasmPaths = r.wasmBase.endsWith('/') ? r.wasmBase : `${r.wasmBase}/`;

  const session = await ort.InferenceSession.create(model);
  const feeds: Record<string, unknown> = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([ids.length], BigInt)),
    scales: new ort.Tensor('float32', Float32Array.from([
      config.inference.noise_scale, config.inference.length_scale, config.inference.noise_w,
    ])),
  };
  // Multi-speaker models — thorsten_emotional's moods, mls's 236 voices — want
  // to be told which one. The first, as piper does when nobody says.
  if (config.speaker_id_map && Object.keys(config.speaker_id_map).length) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]));
  }

  const output = await session.run(feeds);
  const audio = (output.output ?? Object.values(output)[0]).data;
  return { samples: audio, rate: config.audio.sample_rate, exact, dropped };
}
