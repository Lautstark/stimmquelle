import { describe, expect, it } from 'vitest';
import { remapPhonemeIds } from '../src/index.js';
import fixture from './phonemes.fixture.json' with { type: 'json' };

/**
 * The fixtures were captured from the real phonemizer wasm and from the two
 * models' own `.onnx.json`. They are not derived from the code under test, and
 * re-deriving them from it would make every assertion below circular.
 */
const { cases, thorsten, kerstin, native_piper: native } = fixture as unknown as {
  cases: { text: string; phonemes: string[]; phoneme_ids: number[] }[];
  thorsten: { num_symbols: number; phoneme_id_map: Record<string, number[]> };
  kerstin: { num_symbols: number; phoneme_id_map: Record<string, number[]> };
  native_piper: {
    text: string; thorsten_ids: number; kerstin_ids: number;
    /** Captured from native piper, so the equality assertion is not circular. */
    kerstin_id_sequence: number[];
  };
};

describe('reading ids from the model rather than from the phonemizer', () => {
  // THE INVARIANT. Not a happy consequence of the rule — the reason a consumer
  // can adopt the new path without re-rendering anything.
  //
  // Identical phoneme ids mean identical inference input, which means the same
  // synthesis path and no reason to bump a pipeline version. vorlaut re-rendered
  // every recording on every device to adopt the loudness contract; this must
  // not cost it a second one in the same week.
  //
  // "Identical audio" is not the test and cannot be: piper has a stochastic
  // duration predictor and three renders of one sentence give three different
  // files. Identical ids is the property that carries.
  it('gives a voice that already speaks byte-identical ids, so nothing re-renders', () => {
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

  it('drops the mark the model has no symbol for, and says which', () => {
    // This used to assert the opposite — that nothing was ever dropped, because
    // the pair was composed onto the precomposed ç. It is not any more: the
    // composition was removed in 2.7.0 after a blind listening test preferred
    // the dropped form six times out of six. See CONTRACT.md §3a.
    //
    // What matters is that the drop is *reported* rather than silent. A caller
    // that wants to know gets `dropped` and `exact`; nothing guesses.
    const one = cases.find(c => c.text === 'Ich möchte noch nicht ins Bett.')!;
    const { dropped, exact } = remapPhonemeIds(one.phonemes, one.phoneme_ids, kerstin.phoneme_id_map);
    expect(dropped).toEqual(['\u0327', '\u0327', '\u0327']);
    expect(exact).toBe(false);
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

describe('where this used to disagree with native piper, and no longer does', () => {
  const one = cases.find(c => c.text === native.text)!;

  it('reaches native’s length, so nothing is being added or lost', () => {
    // The theory this replaced was that native kept a slot for the phoneme it
    // could not map, and that our sequence was six tokens short. It is not:
    // native drops the mark too, and lands on the same length we do. Pinned so
    // the dead theory cannot be revived by someone counting tokens again.
    expect(remapPhonemeIds(one.phonemes, one.phoneme_ids, kerstin.phoneme_id_map).ids)
      .toHaveLength(native.kerstin_ids);
    expect(one.phoneme_ids).toHaveLength(native.thorsten_ids);
  });

  it('agrees with native piper id for id, which is the point of 2.7.0', () => {
    // THE ASSERTION THIS RELEASE EXISTS FOR. It used to be the reverse: ç at 40
    // in three places where native leaves the bare c at 16.
    //
    // The reasoning for composing was that her map holding 40 meant she was
    // trained on it. That does not follow — the 130-entry table is generic and
    // carries 40 under English and French, which have no ich-Laut at all
    // (conformance/phoneme-tables.mjs). And the ear went the other way: five
    // German sentences, three renders a side, labels shuffled, native preferred
    // five out of five, plus a deterministic trial and a symbol ranking with a
    // control. Six for six.
    //
    // The sequence compared against is captured from native piper, not derived
    // from this code, so this cannot pass by agreeing with itself.
    const ours = remapPhonemeIds(one.phonemes, one.phoneme_ids, kerstin.phoneme_id_map).ids;
    expect(ours).toEqual(native.kerstin_id_sequence);

    const ç = kerstin.phoneme_id_map['ç'][0];
    const c = kerstin.phoneme_id_map['c'][0];
    expect(ours.filter(i => i === ç), 'no composed ç').toHaveLength(0);
    expect(ours.filter(i => i === c), 'the bare plosive, as native leaves it').toHaveLength(3);
  });

  it('leaves a model that has the mark alone, which is why the disagreement is safe', () => {
    // Thorsten's map carries the combining mark, so nothing is composed and he
    // comes out exactly as native does. The disagreement only ever touches a
    // voice native cannot render properly in the first place.
    const { ids, exact } = remapPhonemeIds(one.phonemes, one.phoneme_ids, thorsten.phoneme_id_map);
    expect(exact).toBe(true);
    expect(ids).toEqual(one.phoneme_ids);
  });
});
