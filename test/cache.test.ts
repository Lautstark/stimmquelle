import { afterEach, describe, expect, it } from 'vitest';
import { byId, synthesize, usePiperRuntime } from '../src/index.js';
import fixture from './phonemes.fixture.json' with { type: 'json' };

const { cases, thorsten } = fixture as unknown as {
  cases: { text: string; phonemes: string[]; phoneme_ids: number[] }[];
  thorsten: { phoneme_id_map: Record<string, number[]> };
};

/**
 * The model cache, which is the one place a failure survives the session.
 *
 * These go through the real `cached()` rather than the `fetchModel` hook the
 * other tests use, because `fetchModel` is precisely the thing that replaces it.
 */
const config = JSON.stringify({
  phoneme_id_map: thorsten.phoneme_id_map,
  espeak: { voice: 'de' },
  audio: { sample_rate: 22050 },
  inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
});

/** An in-memory OPFS, so a cached file can be inspected and pre-poisoned. */
function fakeOpfs(): Map<string, Uint8Array> {
  const files = new Map<string, Uint8Array>();
  const dir = {
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!opts?.create) throw new Error('NotFoundError');
        files.set(name, new Uint8Array(0));
      }
      return {
        async getFile() {
          const d = files.get(name)!;
          return { size: d.length, arrayBuffer: async () => d.buffer };
        },
        async createWritable() {
          return {
            async write(d: Uint8Array) { files.set(name, new Uint8Array(d)); },
            async close() {},
          };
        },
      };
    },
    async removeEntry(name: string) { files.delete(name); },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) } },
    configurable: true,
  });
  return files;
}

/** A response that promises `claimed` bytes and delivers `bytes`. */
function served(bytes: Uint8Array, claimed = bytes.length) {
  return {
    ok: true,
    headers: { get: (h: string) => (h === 'content-length' ? String(claimed) : null) },
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
        };
      },
    },
    arrayBuffer: async () => bytes.buffer,
  };
}

function serve(handler: (url: string) => unknown): string[] {
  const asked: string[] = [];
  Object.defineProperty(globalThis, 'fetch', {
    value: async (url: string) => { asked.push(url); return handler(url); },
    configurable: true,
  });
  usePiperRuntime({
    wasmBase: '/v/',
    phonemizer: async () => ({
      createPiperPhonemize: async (o: { print(l: string): void }) => ({
        callMain: () => o.print(JSON.stringify({
          phonemes: cases[0]!.phonemes, phoneme_ids: cases[0]!.phoneme_ids,
        })),
      }),
    }) as never,
    onnx: async () => ({
      env: { wasm: {} },
      Tensor: class { constructor(public t: string, public d: unknown) {} } as never,
      InferenceSession: {
        create: async () => ({ run: async () => ({ output: { data: new Float32Array(2048) } }) }),
      },
    } as never),
  });
  return asked;
}

const ID = 'piper:de_DE-thorsten-medium';
const MODEL = 'de_DE-thorsten-medium.onnx';
const CONFIG = 'de_DE-thorsten-medium.onnx.json';
const text = cases[0]!.text;

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'navigator');
  Reflect.deleteProperty(globalThis, 'fetch');
});

describe('a download that stops early', () => {
  it('refuses it instead of caching 40 MB of a 63 MB model', async () => {
    // The failure this exists for: the reader reports done, the loop ends, and
    // a short file is written to a cache that is then certain of it for ever.
    // Nothing throws at the point it happens — onnxruntime fails much later.
    const files = fakeOpfs();
    serve(url => url.endsWith('.json')
      ? served(new TextEncoder().encode(config))
      : served(new Uint8Array(1200), 5000));   // promised 5000, delivered 1200

    await expect(synthesize(text, ID, () => {})).rejects.toThrow(/stopped early/);
    expect(files.has(MODEL), 'a short model must not reach the cache').toBe(false);
  });

  it('says how short, and that trying again is safe', async () => {
    fakeOpfs();
    serve(url => url.endsWith('.json')
      ? served(new TextEncoder().encode(config))
      : served(new Uint8Array(1200), 5000));
    await expect(synthesize(text, ID, () => {}))
      .rejects.toThrow(/1200 bytes arrived of the 5000/);
  });

  it('catches it on the path without a progress callback too', async () => {
    // No onProgress means no streaming read, and the check has to be on both
    // or it is on whichever one nobody uses.
    fakeOpfs();
    serve(() => served(new TextEncoder().encode(config), 99999));
    await expect(synthesize(text, ID)).rejects.toThrow(/stopped early/);
  });
});

describe('a cache entry that is already short', () => {
  it('throws it away and fetches again, healing what the old code wrote', async () => {
    // Somebody running the version without the check has a truncated model in
    // OPFS right now, and nothing short of forgetModels() would ever clear it.
    const files = fakeOpfs();
    files.set(CONFIG, new TextEncoder().encode(config));
    files.set(MODEL, new Uint8Array(40));      // a fragment of a 63 MB model
    const whole = new Uint8Array(900).fill(7);
    const asked = serve(() => served(whole));

    await synthesize(text, ID, () => {});
    expect(asked.some(u => u.endsWith('.onnx')), 'the short model must be re-fetched').toBe(true);
    expect(files.get(MODEL)!.length).toBe(900);
  });

  it('judges it against the size voices.json records', async () => {
    expect(byId(ID)!.bytes).toBeGreaterThan(1_000_000);
  });

  it('leaves a sound entry alone rather than re-fetching it', async () => {
    // The config has no recorded size, so it stands for the general case: a
    // cache hit must still be a cache hit.
    const files = fakeOpfs();
    files.set(CONFIG, new TextEncoder().encode(config));
    files.set(MODEL, new Uint8Array(byId(ID)!.bytes));
    const asked = serve(() => { throw new Error('nothing should be fetched'); });

    await synthesize(text, ID, () => {});
    expect(asked).toEqual([]);
  });
});
