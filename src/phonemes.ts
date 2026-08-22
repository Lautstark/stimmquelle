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
 * So nothing is missing from the older model. The two write the same sound in
 * two Unicode forms, and only the newer one is asked.
 *
 * THE RULE BELOW is therefore conservative on purpose: a phoneme is looked up
 * exactly as the phonemizer emitted it, and only if the model has never heard
 * of it is it composed onto the one before. A model whose map contains the
 * combining mark is untouched — verified byte-identical to vits-web's own ids
 * on eight German sentences.
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

    const previous = phonemes[k - 2];
    const composed = previous === undefined ? null : (previous + phoneme).normalize('NFC');
    if (composed && [...composed].length === 1 && map[composed]) {
      for (let i = out.length - 1; i >= 0; i--) {
        if (!structural.has(out[i])) { out.splice(i, 1, ...map[composed]); break; }
      }
      exact = false;
      dropPad = true;
      continue;
    }
    // Unknown in every form. piper's own --allow-missing-phonemes drops these
    // rather than refusing the sentence; a caller that wants to know is told.
    dropped.push(phoneme);
    exact = false;
    dropPad = true;
  }
  return { ids: out, dropped, exact };
}
