/**
 * CONTRACT.md §3, as code rather than as prose two consumers copy out by hand.
 *
 * §3 has specified the fingerprint since 1.0.0 — six numbered inputs and one
 * rule about which of them a cloud backend drops. Both products implemented it
 * themselves, and on 2026-08-29 a reading of the two found each had got a
 * different clause wrong:
 *
 *   mitreden  omits §3.5, the pipeline version, for `azure:` voices. It reads
 *             §3.4's "omitted for cloud backends" as covering both version
 *             terms. It does not: the levelling and the trim are applied *here*
 *             to whatever the cloud sends back, so a §1 or §2 change alters an
 *             Azure recording exactly as much as a piper one.
 *   vorlaut   omits §3.4, the engine version, for local voices — the term is
 *             simply absent from `audioName()`. A new engine would arrive in
 *             the middle of a Sammlung under names claiming it had not, which
 *             §3's own "Two engines do not share a cache" calls the one failure
 *             this family exists to prevent.
 *
 * Neither had noticed, because neither had anything to invalidate: vorlaut's
 * hash names a WAV inside a zip and is never read back, and mitreden's cloud
 * bug needs a §1 change to become visible. They were latent, and both would
 * have gone live the moment a cache was added — which is the change this
 * function exists to make safe.
 *
 * **Why here and not in a helpers package.** Every input but one is this
 * package's own: the backend grammar, the model name, the engine identity, the
 * pipeline number, and the six knobs that decide what postprocess() does. A
 * consumer can assemble them, but only by knowing which of *our* changes affect
 * which backend — and that is the question both got wrong. The sixth input,
 * what the consumer does with the WAV afterwards, is the only thing it knows
 * better, and it is passed through opaquely.
 */

import { parseVoiceId } from './catalogue.js';
import { PIPELINE_VERSION, VERSION } from './contract.js';
import type { LevelOptions } from './level.js';
import { speak, type SpeakOptions, type Spoken } from './speak.js';

/** The §3.6 term, and the one input this package cannot supply. */
export interface KeyOptions extends LevelOptions {
  /**
   * What the consumer stores, when that is not the WAV handed back.
   *
   * mitreden encodes MP3 through lamejs and keeps that, so its bitrate and
   * sample rate decide the bytes on disk as surely as anything above; vorlaut
   * keeps the WAV and has nothing to add. Encoded verbatim into the hash, so
   * any JSON-stable value will do — `{ format: 'mp3', bitrate: 192 }` is the
   * shape mitreden passes.
   */
  out?: unknown;
  /**
   * §3.4's term, for backends that render locally. Defaults to this package,
   * which is what both products' local path means today.
   *
   * Overridable because §3 names *the engine* — "the container names its engine
   * `piper 1.7.0`; a browser names its own `vits-web@1.0.3`" — and this package
   * is neither of those, it is the thing that drives them. A consumer that
   * pins its own runtime and knows its version should say so. One that does not
   * gets a term that changes on every release of this package, which
   * over-invalidates rather than under-invalidates and is the direction §3
   * chooses everywhere else it has the choice.
   */
  engine?: string;
}

/**
 * The name a recording of `text` in `vid` would have, per CONTRACT.md §3.
 *
 * Full SHA-256 hex. **Truncation is the caller's**, because §3 makes the length
 * a per-product choice — mitreden takes 12 characters, vorlaut 32 — on the
 * grounds that the two never share a cache directory.
 *
 * No disk and no network, which §3 requires: a machine that cannot render a WAV
 * still knows what the file would have been called.
 */
export async function keyFor(text: string, vid: string, options: KeyOptions = {}): Promise<string> {
  const parsed = parseVoiceId(vid);
  const backend = parsed?.backend ?? 'piper';
  const model = parsed?.model ?? vid;

  /* §3.4. The test is "does this machine render it", not "is it named azure" —
     an `elevenlabs:` id is reserved by §4 and is a cloud backend too, so
     naming piper is the term that stays right when the second one arrives. */
  const local = backend === 'piper';

  const payload = JSON.stringify([
    text.trim(),                       // §3.1 — stripped, and nothing else
    backend,                           // §3.2
    model,                             // §3.3 — a name, never a path (§3 "No paths")
    local ? (options.engine ?? `stimmquelle@${VERSION}`) : null,  // §3.4
    PIPELINE_VERSION,                  // §3.5 — every backend, see the header
    sound(options),                    // §3.6, the half this package decides
    options.out ?? null,               // §3.6, the half it does not
  ]);

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The knobs that decide what `postprocess` does, in a stable order and with the
 * unset ones absent.
 *
 * Listed rather than spread, so that a field added to LevelOptions for some
 * other purpose cannot quietly join the hash and re-render every recording in
 * the family. The list is `LevelOptions` in full as of 2.8.0; a genuine new
 * knob belongs here *and* in a PIPELINE_VERSION bump.
 */
function sound(o: LevelOptions): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of
    ['rate', 'fadeSec', 'padSec', 'thresholdDb', 'keepHeadSec', 'keepTailSec'] as const) {
    const value = o[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

/** Somewhere to keep finished audio. Both halves may be synchronous. */
export interface SpokenStore {
  get(key: string): Promise<Uint8Array | undefined> | Uint8Array | undefined;
  put(key: string, wav: Uint8Array): Promise<void> | void;
}

export interface Remembered {
  /** The finished file, from the store or freshly spoken. */
  readonly wav: Uint8Array;
  /** Its §3 name, full hex. Worth having on a hit as well as a miss. */
  readonly key: string;
  /** True when the store answered and nothing was synthesised. */
  readonly cached: boolean;
  /**
   * Absent on a hit, and deliberately: `Spoken` carries `synthesisMs` and
   * `levellingMs`, and a hit has neither. Returning zeroes would put a number
   * that is not a measurement where a caller reads measurements.
   */
  readonly spoken?: Spoken;
}

/**
 * Look it up; speak it if it is not there; keep it.
 *
 * The store is the consumer's, and stays the consumer's. The two products want
 * genuinely different lifetimes for the same bytes — mitreden's are a library,
 * owned by a sentence, deleted with it and carried in a Sicherung, where
 * vorlaut's would be a cache, shared between sentences and evictable at any
 * moment — so a package that owned the storage would have to make one of them
 * wrong. What it owns instead is the name, which is the part they must agree on
 * and the part they both got wrong alone.
 *
 * A failing `put` is not caught. A store that may be full should decide inside
 * its own `put` whether that is fatal, because it is the only side that knows
 * whether these bytes can be made again.
 */
export async function remember(
  store: SpokenStore, text: string, vid: string,
  options: SpeakOptions & KeyOptions = {},
): Promise<Remembered> {
  const key = await keyFor(text, vid, options);

  const held = await store.get(key);
  if (held) return { wav: held, key, cached: true };

  const spoken = await speak(text, vid, options);
  await store.put(key, spoken.wav);
  return { wav: spoken.wav, key, cached: false, spoken };
}
