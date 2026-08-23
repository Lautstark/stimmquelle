/**
 * Phoneme ids from the model's own table, so that the older voices work.
 *
 * THE FAULT. `@diffusionstudio/vits-web` takes `phoneme_ids` straight out of
 * the phonemizer's printed JSON and feeds them to the model:
 *
 *     print: (l) => resolve(JSON.parse(l).phoneme_ids)
 *
 * Those ids come from the phonemizer's own built-in symbol table, which is
 * newer and larger than the table an older model was trained against. The
 * model's `.onnx.json` carries the table it actually wants, as
 * `phoneme_id_map` — vits-web downloads that file, reads `espeak.voice`,
 * `audio.sample_rate` and `inference.*` out of it, and never looks at the map.
 *
 * So every `low` and `x_low` voice dies with an index out of range, and with
 * them the only German female voices piper publishes.
 *
 * WHAT IT ACTUALLY IS, which is narrower than "the tables differ". Measured on
 * `de_DE-kerstin-low` against `de_DE-thorsten-medium`:
 *
 *   - the phonemizer emits the ich-Laut **decomposed**: `c` (U+0063) followed
 *     by U+0327 COMBINING CEDILLA, as two separate phonemes
 *   - Thorsten's 152-entry map has the combining mark as a symbol of its own,
 *     id 140 — which is what the failure reports, and which is outside
 *     Kerstin's `num_symbols: 130`
 *   - Kerstin's 130-entry map has no combining marks at all. It has the
 *     precomposed `ç` (U+00E7), id 40
 *
 * WHAT THIS USED TO DO ABOUT IT, AND WHY IT NO LONGER DOES. Until 2.7.0 a
 * phoneme the model had no entry for was *composed* onto the one before it, so
 * `c` + U+0327 became `ç` at 40 and Kerstin said the ich-Laut. The argument was
 * that her map holding 40 meant 40 was the form she was trained on.
 *
 * **That argument was wrong and the result was worse.** The 130-entry table is
 * generic — `conformance/phoneme-tables.mjs` shows the same `ç` at 40 under
 * `en_GB-alan-low` and `fr_FR-gilles-low`, and English has no ich-Laut at all.
 * A symbol's presence records what piper's table contained, never what a model
 * saw in training. Asked properly, the ear went the other way: five German
 * sentences, three renders a side, labels shuffled, **native piper's dropped
 * form preferred five out of five**, plus a deterministic trial and a blind
 * ranking of every candidate symbol in her table with a wrong control. Six for
 * six. CONTRACT.md §3a carries the method and the numbers.
 *
 * THE RULE NOW: a phoneme is looked up exactly as the phonemizer emitted it,
 * and if the model has no entry for that form it is **dropped and reported** —
 * which is what native piper does, so the two now agree id for id. A model
 * whose map contains the combining mark is untouched either way, verified
 * byte-identical to vits-web's own ids on eight German sentences.
 *
 * What survives from the old rule is the half that was never in question: ids
 * come from the model's own table. That is what stops a `low` voice dying with
 * an index out of range, and it is the whole reason this file exists.
 *
 * The phonemizer's `phoneme_ids` is used for its *structure* rather than
 * thrown away: it carries the sentence splitting, which the flat `phonemes`
 * array does not. "Guten Morgen! Wo ist Mama?" is two sentences, and the ids
 * say so with an end-of-sentence and a begin-of-sentence in the middle.
 * Rebuilding from the phonemes alone would silently merge them.
 */

/** A model's `phoneme_id_map`: each phoneme to the ids it stands for. */
export type PhonemeIdMap = Record<string, number[]>;

export interface Remapped {
  readonly ids: number[];
  /** Phonemes this model has no symbol for, in any form. Normally empty. */
  readonly dropped: string[];
  /** True when nothing had to be composed — the model agrees with the phonemizer. */
  readonly exact: boolean;
}

/**
 * The phonemizer's output, expressed in one model's own symbols.
 *
 * @param phonemes    `phonemes` from the phonemizer's JSON
 * @param phonemeIds  `phoneme_ids` from the same JSON, for its structure
 * @param map         `phoneme_id_map` from the model's `.onnx.json`
 */
export function remapPhonemeIds(
  phonemes: readonly string[], phonemeIds: readonly number[], map: PhonemeIdMap,
): Remapped {
  const bos = map['^']?.[0], eos = map['$']?.[0], pad = map['_']?.[0];
  if (bos === undefined || eos === undefined || pad === undefined) {
    throw new Error("phoneme_id_map is missing '^', '$' or '_'");
  }
  const structural = new Set([bos, eos, pad]);
  const out: number[] = [];
  const dropped: string[] = [];
  let k = 0, exact = true, dropPad = false;

  for (const id of phonemeIds) {
    if (structural.has(id)) {
      // A composed pair took two slots and now takes one, so the pad that
      // separated them goes with it: piper puts exactly one between phonemes,
      // and two would be a token the model was never trained to see there.
      if (dropPad && id === pad) { dropPad = false; continue; }
      out.push(id);
      continue;
    }
    const phoneme = phonemes[k++];
    if (phoneme === undefined) { out.push(id); continue; }   // shapes disagree; keep piper's
    if (map[phoneme]) { out.push(...map[phoneme]); continue; }

    // Unknown to this model, in the form the phonemizer emitted it. Dropped —
    // which is what native piper does, and since 2.7.0 what this does too. The
    // composition that used to happen here is gone; the header says why.
    // piper's own --allow-missing-phonemes drops these rather than refusing the
    // sentence, and a caller that wants to know is told.
    dropped.push(phoneme);
    exact = false;
    dropPad = true;
  }
  return { ids: out, dropped, exact };
}
