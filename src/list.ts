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

/** What actually renders a voice. It decides what the other fields can promise. */
export type VoiceSource = 'piper' | 'azure';

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
  /** The notice owed wherever this voice's audio is used, when one is owed. */
  readonly attribution?: string;
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
    recommended: v.recommended === true,
    ...(v.licence.attribution ? { attribution: v.licence.attribution } : {}),
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
 */
export async function listVoices(o: ListOptions = {}): Promise<readonly Offered[]> {
  const all = [...piperVoices(o), ...(o.azure ? await azureVoices(o.azure) : [])];
  return all.filter(v => matches(v, o));
}
