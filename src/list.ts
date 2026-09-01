/**
 * One list of voices a product may offer, whatever renders them.
 *
 * A picker wants the same six facts about every voice — what to call it, what
 * language it speaks, whose voice it is, and what using it costs. Where the
 * audio comes from is the one thing it does not want to care about, and until
 * this file existed every consumer cared about it twice: once walking the piper
 * catalogue, once mapping Azure's own list into a different shape.
 *
 * The licence gate is not repeated here. `shippable` already applies it, and a
 * voice reaching this list has passed the same question `speak()` asks before it
 * fetches anything.
 */
import { shippable, type Offering } from './catalogue.js';
import { azureVoices, type AzureOptions } from './speak.js';
import { loadSystemVoices } from './system.js';
import type { Quality } from './types.js';

/** What actually renders a voice. It decides what the other fields can promise. */
export type VoiceSource = 'piper' | 'azure' | 'system';

/** One voice, as a picker needs it. */
export interface Offered {
  /** Exactly the id `speak()` takes and a saved file records. */
  readonly id: string;
  readonly name: string;
  /** Two letters: `de`. */
  readonly lang: string;
  /** `de_DE` for piper, `de-DE` for Azure — each as its own backend writes it. */
  readonly locale: string;
  /** `female`, `male`, or `mixed` for a multi-speaker corpus. */
  readonly gender: string;
  /**
   * The model's quality tier, where the backend publishes one. Absent for Azure
   * and for a system voice: neither names a tier, and reading one out of a
   * `ShortName` would be inventing it rather than reporting it.
   *
   * It is here because `labelOf` needed it and there was no honest way to ask.
   * A consumer wanting the tier had only `id.split('-').at(-1)` — a product
   * treating an id as structure after this package promised nothing about it
   * beyond being *exactly what `speak()` takes*. The catalogue has held
   * `quality` since 1.0.0; the picker's shape was simply not passing it on, and
   * the one product that got by without it told two Thorstens apart by their
   * download sizes, 63 MB against 114, which works and explains nothing.
   *
   * **A code, never a word.** A product that wants a term a person would use
   * writes it from this, in its own language and its own tone. This package
   * must not: bildquelle shipping a German `message` is what made bildhaft
   * print German at an English reader.
   */
  readonly quality?: Quality;
  readonly source: VoiceSource;
  /**
   * Bytes fetched before this voice first speaks. 0 for a cloud backend, which
   * downloads nothing and instead needs the network every time.
   */
  readonly downloadBytes: number;
  /** True when the voice needs a key, and therefore a network call per sentence. */
  readonly needsKey: boolean;
  /**
   * Whether `speak()` can hand back a levelled WAV for this voice.
   *
   * False for a system voice, and it is the fact a product most needs: those go
   * through `say()`, are not levelled to the contract, and cannot be cached,
   * exported, or written to a talker's flash. A picker that offers them beside
   * the others has to say so, because the difference is invisible until somebody
   * tries to save one.
   */
  readonly makesFile: boolean;
  /**
   * Whether this voice speaks with no network at all.
   *
   * True for piper once its model is downloaded — `downloadBytes` is what that
   * costs and it is paid once. False for Azure, which needs the network every
   * sentence. For a system voice it is exactly `localService`, and that is the
   * reason this field exists: **not every voice the OS lists is on the device.**
   * Chrome's Google voices are synthesised on Google's servers, and the API says
   * so while nothing here was passing it on.
   *
   * A picker that cannot see this offers a voice that works at the desk and
   * silently does nothing in a car — which for a talker is the moment it
   * matters most.
   */
  readonly offline: boolean;
  /** The notice owed wherever this voice's audio is used, when one is owed. */
  readonly attribution?: string;
  /**
   * True when this voice crams an unterminated word into a near-fixed span, so
   * single words arrive as mush while sentences are fine.
   *
   * Wordless on purpose: a picker that shows it says so in its own language and
   * its own tone, and the fix it suggests — ending the word with `!` or `.` —
   * is a sentence about a product's own text field, not about this package.
   * `de_DE-kerstin-low` is the only voice carrying it, and the catalogue's
   * `rushesFragments_why` holds the measurements behind it.
   *
   * It matters most where it is least visible: a talker's keys are mostly
   * single words, which is exactly the case that breaks.
   */
  readonly rushesFragments?: boolean;

  /**
   * The pick for this language-and-gender slot. A picker can show these four
   * and put the rest behind "more voices". Always false for a cloud backend,
   * which publishes hundreds and about which this package has no opinion.
   */
  readonly recommended: boolean;
}

export interface ListOptions extends Offering {
  /** `de`, or a full locale in either spelling. Matches the language by prefix. */
  lang?: string;
  /** `female` or `male`. A `mixed` corpus matches neither. */
  gender?: string;
  /** Only the pick for each slot — what a picker shows before "more voices". */
  recommended?: boolean;
  /** Include Azure's voices, which needs a key and a request. Omitted, none are. */
  azure?: AzureOptions;
  /**
   * Include the operating system's own voices. Off by default: they speak but
   * make no file, so a product opts in once it can say that to a user.
   */
  system?: boolean;
}

/**
 * The two facts a label is decided from, so that either shape can ask.
 *
 * `Offered` satisfies it and so does the catalogue's own `Voice`: a consumer
 * building its list from `shippable()` rather than `piperVoices()` is asking
 * the same question about the same two fields, and should not have to map into
 * a picker shape first to be allowed to ask it.
 */
export interface Distinguishable {
  readonly name: string;
  readonly quality?: Quality;
}

/**
 * What to call this voice in the list it is being shown in.
 *
 * `de_DE-thorsten-medium` and `de_DE-thorsten-high` are both named "Thorsten",
 * because a name is the speaker's and both are him. A picker offering both
 * therefore shows one name twice, and nobody looking at it can tell the 63 MB
 * one from the 114 MB one. The tier is appended only where a twin forces it, so
 * a list holding one Thorsten still says "Thorsten".
 *
 * **`among` is the whole argument, and it is why this is not a field.** Whether
 * a name is ambiguous is a fact about the list on screen, not about the voice.
 * `listVoices` could label what it is about to return, and the label would be
 * wrong the moment a picker showed a subset of it — the recommended four, a
 * search, one language, "more voices" — every one of which is a smaller list
 * where the twin may be gone. A label fixed against a list nobody is looking at
 * moves the ambiguity rather than removing it, and does it invisibly.
 *
 * The tier appears only when a twin's tier actually **differs**: two voices
 * sharing a name and a tier are not told apart by printing it on both, and a
 * name whose twin has no tier at all — Azure publishes none — is left alone
 * rather than decorated with something the other row cannot answer with.
 *
 * It reads as the catalogue's code, `medium` and `high`, and that is a
 * deliberate limit rather than the best wording available. It is a word off a
 * model file, not one a parent choosing a voice would reach for; the word they
 * would reach for is German or English or neither, and this package answers in
 * codes precisely so a host is never handed a sentence in the wrong language.
 * `Offered.quality` is the field a product builds its own wording from — and
 * vorlaut already does, showing a translated tier beside the size rather than
 * inside the name, which is a judgement about its own picker that this function
 * has no business making for it.
 *
 * Written here rather than in each picker because whether two voices share a
 * name is a fact about the catalogue, and the catalogue is here. Three products
 * had answered it separately: mitreden appended the tier off the id, vorlaut
 * kept a set of the names it holds twice, and the third told them apart by
 * download size alone. All three were right, which is exactly the state this
 * package was made out of — see README, "Why this is not a paragraph in a
 * README somewhere".
 */
export function labelOf(voice: Distinguishable, among: readonly Distinguishable[]): string {
  if (!voice.quality) return voice.name;
  const twin = among.some(o => o.name === voice.name && o.quality !== voice.quality);
  return twin ? `${voice.name} (${voice.quality})` : voice.name;
}

/** `de_DE`, `de-DE` and `de` all compare equal at the language. */
const language = (s: string): string => s.toLowerCase().replace(/_/g, '-').split('-')[0];

function matches(v: Offered, o: ListOptions): boolean {
  if (o.lang && language(v.locale) !== language(o.lang)) return false;
  if (o.gender && v.gender !== o.gender.toLowerCase()) return false;
  if (o.recommended && !v.recommended) return false;
  return true;
}

/** The piper voices this consumer may offer, in the shape a picker wants. */
export function piperVoices(offering: Offering = {}): readonly Offered[] {
  return shippable(offering).map(v => ({
    id: `piper:${v.id}`,
    name: v.name,
    lang: v.lang,
    locale: v.locale,
    gender: v.gender,
    // Off the catalogue entry in hand rather than through `qualityOf()`, which
    // would re-derive from an id what this object is already holding.
    quality: v.quality,
    source: 'piper' as const,
    downloadBytes: v.bytes,
    needsKey: false,
    makesFile: true,
    // Once. `downloadBytes` is the price, and after it nothing reaches a host.
    offline: true,
    recommended: v.recommended === true,
    ...(v.licence.attribution ? { attribution: v.licence.attribution } : {}),
    ...(v.rushesFragments ? { rushesFragments: true as const } : {}),
  }));
}

/**
 * Every voice this product can offer right now, from every backend it is
 * configured for.
 *
 * Azure appears only when a key is passed, and a key that does not work throws
 * rather than quietly returning the piper voices alone: a picker silently short
 * of half its voices is the same failure as a licence silently wrong, and the
 * person who typed the key is the only one who can fix it.
 *
 * System voices appear only when asked for, and never match a `gender` filter —
 * the Web Speech API does not publish one, and inferring it from a name is how
 * somebody gets told their voice is a woman because it is called Anna.
 */
export async function listVoices(o: ListOptions = {}): Promise<readonly Offered[]> {
  const all = [
    ...piperVoices(o),
    ...(o.azure ? await azureVoices(o.azure) : []),
    ...(o.system ? await loadSystemVoices() : []),
  ];
  return all.filter(v => matches(v, o));
}
