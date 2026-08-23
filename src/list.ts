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
