/**
 * Whose table is `phoneme_id_map`, and what its contents are evidence of.
 *
 * `remapPhonemeIds` exists because the phonemizer writes the ich-Laut
 * decomposed and older models have no combining mark. The fix composes it onto
 * the precomposed `ç`, and CONTRACT.md §8 used to justify that by saying `ç` at
 * id 40 is "the form she was trained on", reasoning from the fact that her map
 * holds it.
 *
 * **That inference does not hold, and this is the check that shows why.** The
 * 130-entry table is not Kerstin's. It is one base table piper shipped with
 * every voice of that era, in every language — `en_GB-alan-low` and
 * `fr_FR-gilles-low` carry `ç` at 40 as well, and English has no ich-Laut at
 * all. Every symbol keeps its id between the 130-entry table and the 152-entry
 * one; the newer table only ever appended (digits at 130-139, the combining
 * marks after). So a symbol's presence says what piper's table contained, not
 * what any particular model ever saw in training.
 *
 * That does not make composing wrong. It removes one argument for it — the
 * strongest-sounding one — and what is left is the phonemizer's intent, which
 * is a weaker claim and has to be written as one.
 *
 *     node conformance/phoneme-tables.mjs
 *
 * Configs only: a few kB each, no models, no onnxruntime, no espeak. That is
 * the point of it being cheap — it is a fact about published files, and anybody
 * doubting the paragraph in CONTRACT.md can have it back in a few seconds.
 */
const MIRROR = 'https://huggingface.co/rhasspy/piper-voices/resolve/main';

/** Voices chosen so that a shared table cannot be explained by a shared language. */
const VOICES = [
  ['de/de_DE/kerstin/low', 'de_DE-kerstin-low'],
  ['de/de_DE/eva_k/x_low', 'de_DE-eva_k-x_low'],
  ['de/de_DE/ramona/low', 'de_DE-ramona-low'],
  ['en/en_GB/alan/low', 'en_GB-alan-low'],
  ['fr/fr_FR/gilles/low', 'fr_FR-gilles-low'],
  ['de/de_DE/thorsten/medium', 'de_DE-thorsten-medium'],
];

const CEDILLA = '̧';
const rows = [];
for (const [dir, id] of VOICES) {
  const r = await fetch(`${MIRROR}/${dir}/${id}.onnx.json`);
  if (!r.ok) throw new Error(`${id}: the mirror said ${r.status}`);
  const cfg = await r.json();
  const m = cfg.phoneme_id_map;
  rows.push({ id, lang: cfg.espeak?.voice ?? '?', symbols: Object.keys(m).length,
              cedilla: m['ç']?.[0] ?? null, mark: m[CEDILLA]?.[0] ?? null, map: m });
}

console.log(`${'voice'.padEnd(24)} ${'lang'.padEnd(10)} symbols  ç  U+0327`);
for (const r of rows) {
  console.log(`${r.id.padEnd(24)} ${r.lang.padEnd(10)} ${String(r.symbols).padStart(7)}  `
    + `${String(r.cedilla ?? '-').padStart(3)}  ${String(r.mark ?? '-').padStart(6)}`);
}

// The two claims the paragraph in CONTRACT.md rests on.
const nonGerman = rows.filter(r => !r.lang.startsWith('de'));
const cedillaEverywhere = nonGerman.every(r => r.cedilla === 40);
const base = rows.find(r => r.id === 'de_DE-kerstin-low');
const newer = rows.find(r => r.id === 'de_DE-thorsten-medium');
const idsAgree = Object.entries(base.map)
  .every(([s, v]) => newer.map[s] && newer.map[s][0] === v[0]);

console.log();
console.log(`ç sits at 40 in languages with no ich-Laut: ${cedillaEverywhere}`);
console.log(`every symbol keeps its id in the newer table: ${idsAgree}`);
console.log(`the newer table only appended: ${Object.entries(newer.map)
  .filter(([s]) => !base.map[s]).every(([, v]) => v[0] >= base.symbols)}`);
console.log();
console.log(cedillaEverywhere && idsAgree
  ? 'So the table is generic. A symbol being in it is not evidence of training.'
  : 'The published tables no longer match what CONTRACT.md §8 describes.');
