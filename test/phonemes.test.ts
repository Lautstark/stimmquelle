import { describe, expect, it } from 'vitest';
import { remapPhonemeIds } from '../src/index.js';
import fixture from './phonemes.fixture.json' with { type: 'json' };

/**
 * The fixtures were captured from the real phonemizer wasm and from the two
 * models' own `.onnx.json`. They are not derived from the code under test, and
 * re-deriving them from it would make every assertion below circular.
 */
const { cases, thorsten, kerstin } = fixture as unknown as {
  cases: { text: string; phonemes: string[]; phoneme_ids: number[] }[];
  thorsten: { num_symbols: number; phoneme_id_map: Record<string, number[]> };
  kerstin: { num_symbols: number; phoneme_id_map: Record<string, number[]> };
};

describe('reading ids from the model rather than from the phonemizer', () => {
  it('changes nothing for a model that agrees with the phonemizer', () => {
    // de_DE-thorsten-medium works today. Whatever this fix does for the older
    // voices, it must not move a voice that already speaks — the recordings
    // exist and the fingerprints name them.
    for (const c of cases) {
      const { ids, exact, dropped } = remapPhonemeIds(c.phonemes, c.phoneme_ids, thorsten.phoneme_id_map);
      expect(ids, c.text).toEqual(c.phoneme_ids);
      expect(exact, c.text).toBe(true);
      expect(dropped, c.text).toEqual([]);
    }
  });

  it('brings every id inside the older model’s range', () => {
    // The whole point: de_DE-kerstin-low is num_symbols 130 and the phonemizer
    // hands out 140 for the ich-Laut's combining cedilla.
    for (const c of cases) {
      const { ids } = remapPhonemeIds(c.phonemes, c.phoneme_ids, kerstin.phoneme_id_map);
      expect(Math.max(...ids), c.text).toBeLessThan(kerstin.num_symbols);
    }
  });

  it('loses no phoneme doing it', () => {
    // Dropping the cedilla would also put every id in range, and would quietly
    // turn "ich" into something else. Nothing here is dropped: the sound exists
    // in the old map, precomposed.
    for (const c of cases) {
      expect(remapPhonemeIds(c.phonemes, c.phoneme_ids, kerstin.phoneme_id_map).dropped, c.text).toEqual([]);
    }
  });

  it('keeps exactly one pad between phonemes', () => {
    // Composing two slots into one leaves the second slot's pad behind unless
    // it is removed. Two pads in a row is a token the model never saw in
    // training, and it would show up as a pause rather than as an error.
    const pad = kerstin.phoneme_id_map['_'][0];
    for (const c of cases) {
      const { ids } = remapPhonemeIds(c.phonemes, c.phoneme_ids, kerstin.phoneme_id_map);
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i] === pad && ids[i - 1] === pad, `${c.text} at ${i}`).toBe(false);
      }
    }
  });

  it('keeps piper’s sentence splitting', () => {
    // "Guten Morgen! Wo ist Mama?" is two sentences, and the phonemizer says so
    // with an end and a begin in the middle of the ids. The flat phonemes array
    // does not, so rebuilding from it alone would merge them and change the
    // prosody. Structure comes from the ids; only the symbols are remapped.
    const two = cases.find(c => c.text === 'Guten Morgen! Wo ist Mama?')!;
    const eos = kerstin.phoneme_id_map['$'][0], bos = kerstin.phoneme_id_map['^'][0];
    const { ids } = remapPhonemeIds(two.phonemes, two.phoneme_ids, kerstin.phoneme_id_map);
    let breaks = 0;
    for (let i = 1; i < ids.length; i++) if (ids[i] === bos && ids[i - 1] === eos) breaks++;
    expect(breaks).toBe(1);
    expect(ids.filter(i => i === bos).length).toBe(2);
  });

  it('reports a phoneme it cannot place instead of guessing', () => {
    const bare = { '^': [1], '$': [2], '_': [0], a: [10] };
    const { dropped, exact } = remapPhonemeIds(['a', 'ʁ'], [1, 0, 10, 0, 99, 0, 2], bare);
    expect(dropped).toEqual(['ʁ']);
    expect(exact).toBe(false);
  });
});
