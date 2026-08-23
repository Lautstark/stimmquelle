import { beforeEach, describe, expect, it, vi } from 'vitest';
import { phonemise, speak, synthesize, usePiper, usePiperRuntime } from '../src/index.js';
import fixture from './phonemes.fixture.json' with { type: 'json' };

const { cases, thorsten, kerstin } = fixture as unknown as {
  cases: { text: string; phonemes: string[]; phoneme_ids: number[] }[];
  thorsten: { num_symbols: number; phoneme_id_map: Record<string, number[]> };
  kerstin: { num_symbols: number; phoneme_id_map: Record<string, number[]> };
};

/**
 * The plumbing, with the two expensive halves stubbed.
 *
 * A real run needs a 63 MB model and onnxruntime; vorlaut's tools/ttscheck.py
 * does that against real piper and real ffmpeg, and is where the audio gets
 * judged. What is checked here is everything between: that the config is read,
 * that the ids handed to the session are the model's own and not the
 * phonemizer's, and that a voice which could not previously speak now produces
 * ids inside its range.
 */
const config = (map: Record<string, number[]>, rate = 22050) => JSON.stringify({
  phoneme_id_map: map,
  espeak: { voice: 'de' },
  audio: { sample_rate: rate },
  inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 },
  speaker_id_map: {},
});

let sessionInput: number[] = [];
let fetched: string[] = [];

function stub(map: Record<string, number[]>, phonemes: string[], phonemeIds: number[]) {
  fetched = [];
  usePiperRuntime({
    wasmBase: '/vendor/',
    phonemizer: async () => ({
      createPiperPhonemize: async (o: { print(l: string): void }) => ({
        callMain: () => o.print(JSON.stringify({ phonemes, phoneme_ids: phonemeIds })),
      }),
    }),
    onnx: async () => ({
      env: { wasm: {} },
      Tensor: class { constructor(public type: string, public data: BigInt64Array | Float32Array) {} } as never,
      InferenceSession: {
        create: async () => ({
          run: async (feeds: Record<string, { data: BigInt64Array }>) => {
            sessionInput = [...feeds.input.data].map(Number);
            return { output: { data: new Float32Array(2048).fill(0.1) } };
          },
        }),
      },
    } as never),
    fetchModel: async url => {
      fetched.push(url);
      return new TextEncoder().encode(
        url.endsWith('.json') ? config(map) : 'not-a-real-model',
      ).buffer as ArrayBuffer;
    },
  });
}

describe('driving piper directly', () => {
  const one = cases[0]!;
  beforeEach(() => { sessionInput = []; });

  it('feeds the session the model’s own ids, not the phonemizer’s', async () => {
    stub(kerstin.phoneme_id_map, one.phonemes, one.phoneme_ids);
    const out = await synthesize(one.text, 'piper:de_DE-kerstin-low');
    expect(Math.max(...sessionInput)).toBeLessThan(kerstin.num_symbols);
    expect(out.rate).toBe(22050);
    // The mark her map has no symbol for is dropped and reported, as native
    // piper does — 2.7.0 removed the composition that used to hide it here.
    expect(out.dropped).toEqual(['\u0327', '\u0327', '\u0327']);
    expect(out.exact).toBe(false);
  });

  it('leaves a working voice’s ids exactly as they were', async () => {
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    await synthesize(one.text, 'piper:de_DE-thorsten-medium');
    expect(sessionInput).toEqual(one.phoneme_ids);
  });

  it('refuses a voice that is not in the catalogue before fetching anything', async () => {
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    await expect(synthesize('Hallo', 'piper:en_GB-nobody-medium')).rejects.toThrow(/not in the catalogue/);
  });

  it('reads phonemes and ids out of the phonemizer', async () => {
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    const p = await phonemise(one.text, 'de');
    expect(p.phonemes).toEqual(one.phonemes);
    expect(p.phonemeIds).toEqual(one.phoneme_ids);
  });

  it('goes through speak(), levelled, when a runtime is configured', async () => {
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    const out = await speak(one.text, 'piper:de_DE-thorsten-medium', { rate: 16000 });
    expect(out.rate).toBe(16000);
    expect(out.wav.byteLength).toBeGreaterThan(44);
    expect(out.voice).toBe('piper:de_DE-thorsten-medium');
  });

  it('still refuses a voice that may not be shipped, on the new path too', async () => {
    // The licence gate is not something the faster route gets to skip.
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    await expect(speak('Hallo', 'piper:en_US-hfc_female-medium')).rejects.toThrow(/may not be shipped/);
  });
});

describe('the two entry points that sit next to each other', () => {
  const one = cases[0]!;

  it('tells you which shape it wanted instead of failing inside', async () => {
    // speak() takes an options object and synthesize() takes a progress
    // callback. Handing the first to the second used to fail with "onProgress
    // is not a function" from somewhere in the middle.
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    await expect(
      synthesize(one.text, 'piper:de_DE-thorsten-medium', { rate: 16000 } as never),
    ).rejects.toThrow(/progress callback, or \{ onProgress \}/);
  });

  it('takes either a callback or an object with one', async () => {
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    await expect(synthesize(one.text, 'piper:de_DE-thorsten-medium', () => {})).resolves.toBeTruthy();
    await expect(synthesize(one.text, 'piper:de_DE-thorsten-medium', { onProgress: () => {} }))
      .resolves.toBeTruthy();
  });

  it('says what phonemise wants rather than throwing an empty error', async () => {
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    await expect(phonemise('Hallo', '')).rejects.toThrow(/espeak's language code/);
  });
});

/**
 * The licence rule holds at every door, not at the one somebody remembered.
 *
 * A failure here is a licence problem, not a broken test — the same rule as
 * test/catalogue.test.ts, asserted where a model is actually fetched.
 */
describe('the licence gate on every door', () => {
  const one = cases[0]!;

  it('refuses an unshippable voice on the direct path, before fetching anything', async () => {
    // Not hypothetical. synthesize() shipped for one commit checking only that
    // an id was in the catalogue, so en_US-hfc_female-medium — CC BY-NC-SA, the
    // voice this repository exists because of — downloaded and spoke through
    // it, silently, exactly as it did the first time.
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    await expect(synthesize('Hallo', 'piper:en_US-hfc_female-medium'))
      .rejects.toThrow(/may not be shipped/);
    expect(fetched, 'a voice that may not be shipped must not be fetched').toEqual([]);
  });

  it('withholds a voice owing an attribution until the caller claims it renders one', async () => {
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    await expect(synthesize('Hallo', 'piper:de_DE-mls-medium'))
      .rejects.toThrow(/owes an attribution/);
    expect(fetched).toEqual([]);
    await synthesize('Hallo', 'piper:de_DE-mls-medium', { rendersAttribution: true });
    expect(fetched.length).toBeGreaterThan(0);
  });

  it('carries the attribution claim from speak() into synthesize()', async () => {
    // Both doors ask, so the answer has to travel. If it did not, the second
    // gate would refuse what the first allowed and every CC-BY voice would be
    // unreachable through the front door for a reason nobody could see.
    stub(thorsten.phoneme_id_map, one.phonemes, one.phoneme_ids);
    const out = await speak(one.text, 'piper:de_DE-mls-medium',
                            { rate: 16000, rendersAttribution: true });
    expect(out.voice).toBe('piper:de_DE-mls-medium');
  });

  it('refuses a backend it does not speak instead of handing it to piper', async () => {
    // speak() gated on `piper` while routing everything that was not azure to
    // piper. CONTRACT.md §4 already reserves `elevenlabs`, so an elevenlabs: id
    // — or a typo'd pipe: — reached vits-web with no licence asked at all.
    let asked: string | null = null;
    usePiper(async () => ({
      predict: async (input: { voiceId: string }) => {
        asked = input.voiceId;
        return new Blob([]);
      },
      stored: async () => [],
      flush: async () => {},
      PATH_MAP: { 'en_US-hfc_female-medium': 'x' },
    } as never));
    for (const vid of ['elevenlabs:en_US-hfc_female-medium', 'pipe:en_US-hfc_female-medium']) {
      await expect(speak('Hallo', vid), vid).rejects.toThrow(/is not a backend/);
    }
    expect(asked, 'vits-web must not be asked for a voice nothing checked').toBeNull();
  });
});
