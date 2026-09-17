/*
 * Everything the voice list says, and the four small answers it says it with.
 *
 * Split out of `voice-picker.ts` on 2026-09-17, when the Svelte twin beside it
 * arrived. conventions.md §6.8 asks the two versions for "same options, same
 * emitted markup, same words, same `WORDS` tables" — and the only way to keep
 * a table the same in two renderers is to have one table. A copy would compile,
 * pass both suites and drift on the first correction somebody made to whichever
 * file they had open.
 *
 * Nothing here is new: every word, every comment and every rule below was
 * `voice-picker.ts`'s and is unchanged. That file's header holds the reading
 * the three products were measured against and stays where it is, because it is
 * about the *surface* rather than about these strings.
 *
 * Not exported from `index.ts`, deliberately, for the same reason the picker is
 * not: a consumer vendoring `dist/browser` by hand has no list to draw and
 * should not pay for one in bytes. `voice-picker.ts` re-exports the three names
 * that were already public — `PickerLang`, `Pickable`, `factsOf` — so the
 * vanilla module's door is exactly the one it was.
 */

import type { Distinguishable, VoiceSource } from './list.js';

export type PickerLang = 'de' | 'en';

/**
 * What this picker reads off a voice, and nothing else.
 *
 * `Offered` satisfies it, and so does a product's own voice shape while that
 * product still has one — which is the same courtesy `Distinguishable` extends
 * next door and for the same reason: a consumer should not have to map into a
 * picker's type to be allowed to ask a picker's question. It is why the fields
 * are listed rather than the interface re-exported.
 */
export interface Pickable extends Distinguishable {
  /** Exactly the id `speak()` takes and a product stores. */
  readonly id: string;
  /** `de_DE` for piper, `de-DE` for Azure — each as its own backend writes it. */
  readonly locale: string;
  readonly gender: string;
  readonly source: VoiceSource;
  readonly downloadBytes: number;
  readonly needsKey: boolean;
  readonly rushesFragments?: boolean;
}

/**
 * Every word this picker can say, in one shape per language.
 *
 * Declared rather than inferred, so that a key present in one language and
 * missing from the other does not compile — `backup-panel`'s reason, and it was
 * earned there: mitreden's English arm carried German quotation marks for as
 * long as it existed because nothing compared the two.
 */
export interface Words {
  /** The radio group's accessible name. vorlaut-editor's group has none. */
  group: string;
  searchLabel: string;
  /** A placeholder is an example, never the label: it goes when typing starts. */
  searchHint: string;
  anyLanguage: string;
  noMatch: string;
  needsKey: string;
  source: Record<VoiceSource, string>;
  gender: Record<'female' | 'male' | 'mixed', string>;
  rushes: string;
  gone: string;
  hearTitle: string;
  hear: (name: string) => string;
  hearing: (name: string) => string;
}

export const WORDS: Record<PickerLang, Words> = {
  de: {
    group: 'Stimme',
    searchLabel: 'Stimme suchen',
    /* wochenwerk's idea — an example of what may be typed — with its example
       generalised. „z. B. Katja" names a voice a catalogue need not hold; these
       two words are printed on the rows themselves, which is also the rule the
       search matches by. */
    searchHint: 'z. B. Azure, weiblich',
    anyLanguage: 'Alle Sprachen',
    noMatch: 'Keine Stimme passt dazu.',
    needsKey: 'Schlüssel nötig',
    source: { piper: 'Mitgeliefert', azure: 'Azure', system: 'Vom Gerät' },
    gender: { female: 'weiblich', male: 'männlich', mixed: 'gemischt' },
    /* mitreden's and vorlaut-editor's sentence, which differ by one word
       („nimmt sie sich Zeit" against „nimmt sie sich mehr Zeit") and by a dash.
       wochenwerk's drops the example. The example stays: „Hallo!" is the fix
       said rather than described, and it is a fix the person typing can apply
       in the field they are already in. */
    rushes: 'Spricht einzelne Wörter sehr kurz. Mit einem Satzzeichen am Ende — Hallo! — '
      + 'nimmt sie sich Zeit.',
    gone: 'hier nicht verfügbar',
    hearTitle: 'Probe hören',
    hear: (name) => `${name} probehören`,
    hearing: (name) => `${name} wird abgespielt`,
  },
  en: {
    group: 'Voice',
    searchLabel: 'Search voices',
    searchHint: 'e.g. Azure, female',
    anyLanguage: 'All languages',
    noMatch: 'No voice matches that.',
    needsKey: 'needs a key',
    source: { piper: 'Bundled', azure: 'Azure', system: 'From this device' },
    gender: { female: 'female', male: 'male', mixed: 'mixed' },
    rushes: 'Speaks single words very briefly. With a punctuation mark at the end — Hello! — '
      + 'the voice takes its time.',
    gone: 'not available here',
    hearTitle: 'Listen',
    hear: (name) => `Hear ${name}`,
    hearing: (name) => `${name} is playing`,
  },
};

/**
 * `63_201_294` → `63 MB`.
 *
 * The same expression as `@lautstark/werkzeuge/bytes`, which is where the
 * family's copy lives and where the argument for whole megabytes is written
 * down. Not imported: this package has exactly one runtime dependency and it is
 * an encoder, and making four products resolve a second shared package to save
 * one line of arithmetic is a version pin nobody asked for. If `weighs` ever
 * stops being one expression, that trade turns around.
 */
const weighs = (bytes: number): string => `${Math.round(bytes / 1e6)} MB`;

/** `de_DE`, `de-DE` and `de` all compare equal at the language. */
export const language = (code: string): string =>
  (code || '').toLowerCase().replaceAll('_', '-').split('-')[0]!;

/**
 * What it speaks, named in the language of whoever is reading.
 *
 * Asked twice with two different arguments, deliberately. A row is given the
 * whole tag, so `de-DE` and `de-AT` read as „Deutsch (Deutschland)" and
 * „Deutsch (Österreich)" — two voices that differ only in region are two
 * different answers, and a fact line that calls both „Deutsch" hides the one
 * thing that separates them. A chip is given the bare language, because that is
 * exactly what the chip filters by; a pill saying „Deutsch (Deutschland)" that
 * also matches an Austrian voice would be lying about its own effect. Both
 * products that have this do the same thing and neither says why.
 */
export function speaks(code: string, lang: PickerLang): string {
  const tag = (code || '').replaceAll('_', '-');
  if (!tag) return '';
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * Whose voice it is.
 *
 * Three published values, and a corpus of several speakers is `mixed` rather
 * than a guess. Anything the catalogue adds later is shown as it came, which is
 * honest, rather than as the name of a missing translation — all three products
 * had worked this out and written it in their own margin. A system voice has no
 * gender at all: the Web Speech API publishes a name and a language, and
 * guessing from the name is how somebody is told their voice is a woman because
 * it is called Anna.
 */
export function genderOf(gender: string, say: Words): string {
  return gender === 'female' || gender === 'male' || gender === 'mixed'
    ? say.gender[gender] : gender;
}

/**
 * The line that decides between two voices: who renders it, what it speaks,
 * whose voice it is, and what it costs to have.
 *
 * Four facts and no verdict. `recommended` is not among them and must not be:
 * the flag is this package's editorial pick inside its own piper catalogue and
 * is false for every cloud voice, so a badge here would sit on two rows and not
 * on the several hundred an Azure key had just unlocked — and "we have no
 * opinion" and "not as good" look identical from the outside.
 *
 * The language drops out where every voice speaks the same one, which is the
 * same test the chips are drawn on. Exported for the test that holds it, and
 * because the search matches on exactly this string: a list that answers to
 * something invisible looks like it is ignoring what was typed.
 */
export function factsOf(
  voice: Pickable, among: readonly Pickable[], lang: PickerLang = 'de',
): string {
  const say = WORDS[lang];
  const manyLanguages = languagesIn(among).length > 1;
  return [
    say.source[voice.source],
    manyLanguages ? speaks(voice.locale, lang) : '',
    genderOf(voice.gender, say),
    // The download is a shipped voice's one real cost and a cloud voice's is
    // the key, so each row says the one that applies to it and neither says
    // both. A system voice costs neither and says nothing.
    voice.needsKey ? say.needsKey : voice.downloadBytes ? weighs(voice.downloadBytes) : '',
  ].filter(Boolean).join(' · ');
}

/** Every language the catalogue in hand actually holds, sorted for the chips. */
export function languagesIn(voices: readonly Pickable[]): string[] {
  return [...new Set(voices.map((voice) => language(voice.locale)))].filter(Boolean).sort();
}
