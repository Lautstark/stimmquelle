/**
 * Which piper voices may be shipped, and which of them actually speak.
 *
 * Everything here is derived from `voices.json` at the root of this package,
 * which is the audited list and is readable on its own by anything that can
 * parse JSON. This module is the typed way in, plus the handful of questions
 * every consumer was otherwise going to answer for itself.
 *
 * There is no network here and no disk. Nothing in this file fetches a model,
 * synthesises anything or levels anything — that is `speak.ts` and `level.ts`
 * next door. See CONTRACT.md for the rules they keep.
 */
import catalogue from '../voices.json' with { type: 'json' };
import type { ParsedVoiceId, Quality, Runtime, Voice } from './types.js';

export type { Licence, ParsedVoiceId, Quality, Runtime, RuntimeStatus, Voice } from './types.js';

/** Every voice anyone has considered, including the ones that were turned down. */
export const VOICES: readonly Voice[] = Object.freeze(
  (catalogue.voices as unknown as Voice[]).map(v => Object.freeze(v)),
);

/** Where the models are fetched from, per runtime. Both carry identical bytes. */
export const MIRRORS = Object.freeze(catalogue.mirrors);

/** The browser library these answers were established against. */
export const LIBRARY = Object.freeze(catalogue.library);

/** The date every licence and byte count was last read from its source. */
export const CHECKED: string = catalogue.checked;

const QUALITIES: readonly Quality[] = ['x_low', 'low', 'medium', 'high'];

/**
 * The voices a product may offer in this runtime.
 *
 * Both halves matter and they are unrelated: `licence.ship` says the model may
 * be handed on at all, the runtime field says it will actually speak there. A
 * voice can pass either and fail the other, and the licence one is the easier to
 * lose because nothing breaks when it is wrong — the voice speaks and the file
 * plays.
 */
export function shippable(runtime: Runtime): readonly Voice[] {
  return VOICES.filter(v => v.licence.ship && v[runtime] === 'ok');
}

/** A voice by id, with or without a backend prefix. */
export function byId(id: string): Voice | undefined {
  const model = parseVoiceId(id)?.model ?? id;
  return VOICES.find(v => v.id === model);
}

/**
 * Is this voice allowed here? The question `speak()` must ask before it fetches
 * anything, because an id that reaches Hugging Face unchecked is a licensing
 * decision made by whoever typed it.
 */
export function isAllowed(id: string, runtime: Runtime): boolean {
  const voice = byId(id);
  return !!voice && voice.licence.ship && voice[runtime] === 'ok';
}

/** `piper:de_DE-thorsten-medium` -> its two halves. `null` if it has no backend. */
export function parseVoiceId(id: string): ParsedVoiceId | null {
  const at = id.indexOf(':');
  if (at < 1 || at === id.length - 1) return null;
  return { backend: id.slice(0, at), model: id.slice(at + 1) };
}

/**
 * What to call a voice, derivable from the id alone — no disk and no network.
 *
 * That constraint is the point: a machine which cannot render a WAV still has to
 * know what the file would have been called. A model outside the catalogue —
 * somebody's own, which is their licence and their decision — still gets a name
 * rather than an error.
 */
export function displayName(id: string): string {
  const model = parseVoiceId(id)?.model ?? id;
  const known = VOICES.find(v => v.id === model);
  if (known) return known.name;
  const withoutLocale = model.includes('-') ? model.slice(model.indexOf('-') + 1) : model;
  const stem = QUALITIES.reduce((s, q) => (s.endsWith(`-${q}`) ? s.slice(0, -q.length - 1) : s), withoutLocale);
  return stem.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/** The quality tier, which is part of the id rather than a decoration. */
export function qualityOf(id: string): Quality | null {
  const model = parseVoiceId(id)?.model ?? id;
  return QUALITIES.find(q => model.endsWith(`-${q}`)) ?? null;
}

/**
 * The licence notices owed by a set of voices, deduplicated.
 *
 * The direct parallel of bildquelle's `attributionsFor`, and owed for the same
 * kind of reason: rendering these is a condition of being allowed to use the
 * voice, not a courtesy. A product that ships a CC-BY voice without showing one
 * has not met the licence.
 */
export function attributionsFor(ids: readonly string[]): readonly string[] {
  const owed = new Set<string>();
  for (const id of ids) {
    const a = byId(id)?.licence.attribution;
    if (a) owed.add(a);
  }
  return [...owed];
}

/**
 * The speaker part of an id: `de_DE-thorsten-medium` -> `thorsten`. Everything
 * between the locale and the quality tier, both of which are fixed positions.
 */
function speakerOf(voice: Voice): string {
  return voice.id.slice(voice.locale.length + 1, voice.id.length - voice.quality.length - 1);
}

/**
 * Where to fetch a model's two files.
 *
 * A model is only usable together with its `.onnx.json` — that file is piper's
 * own description of the voice, and without it the model is a blob. Both are
 * returned because fetching one without the other is never right.
 *
 * The two mirrors serve identical bytes; they are separate entries because the
 * browser library fetches from its own and a container from piper's, and which
 * one a runtime asks is a fact a consumer needs.
 */
export function modelUrls(id: string, runtime: Runtime): { onnx: string; config: string } | null {
  const voice = byId(id);
  if (!voice) return null;
  const base = runtime === 'browser' ? MIRRORS.browser : MIRRORS.container;
  const dir = `${voice.lang}/${voice.locale}/${speakerOf(voice)}/${voice.quality}`;
  return { onnx: `${base}/${dir}/${voice.id}.onnx`, config: `${base}/${dir}/${voice.id}.onnx.json` };
}
