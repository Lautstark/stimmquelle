/**
 * One sentence, one voice id, one finished WAV.
 *
 * Two backends under the ids products already use — `piper:de_DE-thorsten-medium`
 * and `azure:de-DE-GiselaNeural`, exactly as they stand in a saved file. Keeping
 * the ids identical is what lets a set of sentences move between a container and
 * a page without being renamed.
 *
 * Ported from vorlaut's `static/tts/speak.js`, with one addition: the catalogue
 * is consulted before anything is fetched. An id that reaches Hugging Face
 * unchecked is a licensing decision made by whoever typed it.
 */
import { parseVoiceId, refuse, type Offering } from './catalogue.js';
import { encodeWav, postprocess, type LevelOptions, type Levelled } from './level.js';
import type { Offered } from './list.js';
import { hasPiperRuntime, synthesize } from './synthesize.js';

// --- piper -------------------------------------------------------------------

/**
 * vits-web, however this consumer gets hold of it.
 *
 * Injected rather than imported, because the two consumers get it from two
 * different places and neither should have to change to suit the other:
 * mitreden vendors it into its own `docs/app/vendor/` and serves it same-origin
 * so that nothing is fetched from a CDN at runtime; vorlaut resolves a bare
 * specifier through an import map. Hard-coding a URL here would break the first
 * and hard-coding a bare import would break the second.
 *
 * It must resolve to a module with `predict`, `stored`, `flush` and `PATH_MAP`.
 */
export interface PiperModule {
  predict(
    input: { text: string; voiceId: string },
    onProgress?: (p: { url: string; loaded: number; total: number }) => void,
  ): Promise<Blob>;
  stored(): Promise<string[]>;
  flush(): Promise<void>;
  PATH_MAP: Record<string, string>;
}

let loadPiper: (() => Promise<PiperModule>) | null = null;

/** Say where vits-web comes from. Call once, before the first piper sentence. */
export function usePiper(load: () => Promise<PiperModule>): void {
  loadPiper = load;
}

async function piper(): Promise<PiperModule> {
  if (!loadPiper) {
    throw new Error(
      'No piper module. Call usePiper(() => import(…)) with wherever this app '
      + 'serves @diffusionstudio/vits-web from.',
    );
  }
  return loadPiper();
}

/** The models already in this browser's storage, by voice id. */
export async function downloaded(): Promise<string[]> {
  return (await piper()).stored();
}

/** Throw the downloaded models away. */
export async function forget(): Promise<void> {
  return (await piper()).flush();
}

export interface Progress { url: string; loaded: number; total: number; share: number }

async function synthesizePiper(
  text: string, model: string, onProgress?: (p: Progress) => void,
): Promise<Uint8Array> {
  const tts = await piper();
  // vits-web looks the id up in a table it ships and hands the mirror the
  // string "undefined" when it is not there — which arrives as a 404 about a
  // file nobody asked for. Five of the voices its own voices() call advertises
  // are missing from that table. Say so here, where the id is still in hand.
  if (!(model in tts.PATH_MAP)) {
    throw new Error(`${model} is not in vits-web's PATH_MAP and cannot be fetched by it. `
      + 'See voices.json for what can.');
  }
  const blob = await tts.predict({ text: text.trim(), voiceId: model }, p => {
    if (onProgress && p && p.total) {
      onProgress({ url: p.url, loaded: p.loaded, total: p.total, share: p.loaded / p.total });
    }
  });
  return new Uint8Array(await blob.arrayBuffer());
}

// --- Azure -------------------------------------------------------------------

/**
 * Reachable straight from a tab: both endpoints answer the preflight with
 * `access-control-allow-origin: *`, and so does the synthesis itself. Measured,
 * not assumed — see CONTRACT.md §8.
 *
 * Which means **the key lives in the browser.** For a page somebody runs on
 * their own machine that is the same exposure as the `.env` file it replaces;
 * for a page served to anyone else it is not, and nothing here can tell the
 * difference. This package never stores a key: it is passed in per call, so the
 * decision about where one lives stays with the product.
 */
export const AZURE_FORMAT = 'riff-16khz-16bit-mono-pcm';
export const AZURE_RATE = '-5%';

export interface AzureOptions {
  key: string;
  region: string;
  rate?: string;
  languages?: string[];
}

const endpoint = (region: string) =>
  `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
const voiceList = (region: string) =>
  `https://${region}.tts.speech.microsoft.com/cognitiveservices/voices/list`;

/** `de-DE-GiselaNeural` -> `de-DE`. */
export function localeOf(name: string): string {
  const parts = name.split('-');
  return parts.length >= 3 ? parts.slice(0, 2).join('-') : 'de-DE';
}

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The SSML body, down to the attribute order.
 *
 * Not tidiness: Azure renders from this, so a request that differs is a
 * recording that differs from the one already in the cache under that name.
 */
export function buildSsml(text: string, voice: string, rate: string = AZURE_RATE): string {
  return '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
    + `xml:lang="${xml(localeOf(voice))}">`
    + `<voice name="${xml(voice)}">`
    + `<prosody rate="${xml(rate)}">${xml(text.trim())}</prosody>`
    + '</voice></speak>';
}

async function synthesizeAzure(text: string, voice: string, o: AzureOptions): Promise<Uint8Array> {
  if (!o.key) throw new Error('No Azure key.');
  const response = await fetch(endpoint(o.region), {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': o.key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': AZURE_FORMAT,
    },
    body: buildSsml(text, voice, o.rate ?? AZURE_RATE),
  });
  if (!response.ok) {
    // 401 gets its own sentence: it is nearly always a key belonging to a
    // different region rather than a key that is wrong, and the region is in
    // the URL, where nobody looks.
    if (response.status === 401) throw new Error(`Azure rejected the key for ${o.region}.`);
    throw new Error(`Azure said ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * The Azure voices for these locales. Not cached — a page that keeps state can.
 *
 * Returns the same shape the piper catalogue does, because a picker wants one
 * shape and Azure's list already carries what it needs. It used to return bare
 * `ShortName` strings and throw the rest away, which meant every consumer that
 * wanted to show a voice's name or filter by gender either re-fetched the list
 * or did without — the API had already answered and the answer was discarded.
 */
export async function azureVoices(o: AzureOptions): Promise<readonly Offered[]> {
  const response = await fetch(voiceList(o.region), {
    headers: { 'Ocp-Apim-Subscription-Key': o.key },
  });
  if (!response.ok) throw new Error(`Azure said ${response.status} to the voice list.`);
  const want = (o.languages ?? ['de-DE', 'en-US']).map(l => l.toLowerCase());
  const all = (await response.json()) as {
    Locale?: string; ShortName: string; LocalName?: string;
    DisplayName?: string; Gender?: string;
  }[];
  return all
    .filter(v => want.some(w => (v.Locale ?? '').toLowerCase() === w
                              || (v.Locale ?? '').toLowerCase().startsWith(`${w}-`)))
    .map(v => ({
      id: `azure:${v.ShortName}`,
      name: v.LocalName ?? v.DisplayName ?? v.ShortName,
      lang: (v.Locale ?? '').split('-')[0],
      locale: v.Locale ?? '',
      gender: (v.Gender ?? '').toLowerCase(),
      source: 'azure' as const,
      // Nothing is downloaded and nothing is kept: a cloud voice needs the
      // network for every sentence instead of once for the model.
      downloadBytes: 0,
      needsKey: true,
      makesFile: true,
      // Azure publishes hundreds and this package has no opinion on which to
      // put in front of somebody. The catalogue's picks are about the four
      // voices it can actually vouch for.
      recommended: false,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// --- What a product calls ----------------------------------------------------

/**
 * Azure's settings are nested rather than spread alongside the levelling ones,
 * and that is not tidiness. Both halves want a field called `rate`, meaning two
 * unrelated things: the output sample rate in samples per second, and Azure's
 * prosody rate as a percentage string. Flattened, one call site silently hands
 * `"-5%"` to a resampler or `16000` to SSML. Keeping them apart makes the two
 * impossible to confuse, and the type system refuses the flattened version
 * outright, which is how this was noticed.
 */
export interface SpeakOptions extends LevelOptions, Offering {
  azure?: AzureOptions;
  onProgress?: (p: Progress) => void;
}

export interface Spoken extends Levelled {
  readonly voice: string;
  readonly rawBytes: number;
  readonly synthesisMs: number;
  readonly levellingMs: number;
}

/**
 * One sentence, one voice id, one finished WAV — trimmed and levelled to the
 * contract.
 *
 * A piper id is checked against the catalogue first. Refusing here rather than
 * letting the fetch happen is the point: the licence rule is only worth
 * anything if something enforces it at the moment a voice is about to be used.
 *
 * Timings come back alongside the numbers, because the synthesiser is seconds
 * and the levelling is milliseconds, and anyone looking at a slow page should
 * be able to tell which without a profiler.
 */
export async function speak(text: string, vid: string, options: SpeakOptions = {}): Promise<Spoken> {
  if (!text || !text.trim()) throw new Error('Nothing to say.');
  const parsed = parseVoiceId(vid);
  const backend = parsed?.backend ?? 'piper';
  const model = parsed?.model ?? vid;

  // Everything that is not Azure is handed to piper further down, so everything
  // that is not Azure has to pass the licence gate here. Naming only `piper`
  // was enough exactly once and then silently stopped being: CONTRACT.md §4
  // already reserves `elevenlabs`, and an `elevenlabs:` id — like a typo'd
  // `pipe:` — reached vits-web with no licence asked at all. An unknown backend
  // is refused rather than assumed, because assuming is what fetched the model.
  if (backend === 'system') {
    throw new Error(
      `${vid} is one of the operating system's own voices, which return no audio. `
      + 'Use say() — it speaks and hands back nothing, because that is all the Web '
      + 'Speech API does. Nothing is levelled and nothing can be saved.',
    );
  }
  if (backend !== 'piper' && backend !== 'azure') {
    throw new Error(`${backend}: is not a backend this package speaks. Use piper: or azure:.`);
  }

  if (backend === 'piper') {
    const refusal = refuse(model, options);
    if (refusal) throw new Error(refusal);
  }

  const started = performance.now();
  // The path that owns the inference, when a consumer has configured one. It is
  // the only one that can reach a low or x_low voice, because those need ids
  // from the model's own table and vits-web's predict() never exposes the seam.
  //
  // Opt-in rather than the default, so that refreshing the vendored copy does
  // not change how anything speaks. A consumer switches when it is ready, and
  // for the voices that already worked the ids are identical either way —
  // asserted in test/phonemes.test.ts, which is what makes the switch free.
  if (backend === 'piper' && hasPiperRuntime()) {
    const spoken = await synthesize(text, model, {
      // Carried through rather than defaulted: `synthesize` asks the licence
      // question again on its own account, and it must get the same answer this
      // call already got rather than a stricter one.
      rendersAttribution: options.rendersAttribution,
      ownsInference: true,
      onProgress: options.onProgress
        ? share => options.onProgress!({ url: model, loaded: share, total: 1, share })
        : undefined,
    });
    const synthesisedAt = performance.now();
    const result = postprocess(encodeWav(spoken.samples, spoken.rate), options);
    return {
      ...result,
      voice: vid,
      rawBytes: spoken.samples.length * 2,
      synthesisMs: Math.round(synthesisedAt - started),
      levellingMs: Math.round(performance.now() - synthesisedAt),
    };
  }

  if (backend === 'azure' && !options.azure) {
    throw new Error('An azure: voice needs options.azure with a key and a region.');
  }
  const raw = backend === 'azure'
    ? await synthesizeAzure(text, model, options.azure!)
    : await synthesizePiper(text, model, options.onProgress);
  const spoken = performance.now();
  const result = postprocess(raw, options);

  return {
    ...result,
    voice: vid,
    rawBytes: raw.length,
    synthesisMs: Math.round(spoken - started),
    levellingMs: Math.round(performance.now() - spoken),
  };
}

/** The finished WAV as something an `<audio>` can play. */
export const asBlob = (wav: Uint8Array): Blob => new Blob([wav as BlobPart], { type: 'audio/wav' });
