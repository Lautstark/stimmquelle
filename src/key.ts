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
import { AZURE_FORMAT, AZURE_RATE, speak, type SpeakOptions, type Spoken } from './speak.js';

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
export async function keyFor(
  text: string, vid: string, options: KeyOptions & Pick<SpeakOptions, 'azure'> = {},
): Promise<string> {
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
    /* What the cloud is asked for, on an azure: id and nowhere else.

       The prosody rate is in the SSML Azure renders from, so `-5%` and `+40%`
       are two recordings of one sentence — and through 2.12.1 they had one
       name, so `remember()` handed back a recording made at whatever rate a
       product had used first. The format is the same kind of fact: it decides
       the sample rate `postprocess` starts from. Both are spelled exactly as
       `speak()` spends them, the default included, so a caller leaving the
       rate out and one passing `AZURE_RATE` share a name.

       Appended only for azure, so that every piper name — the ones whose
       recordings take a 63 MB download to make again — stays what it was.
       Azure names change once, and a cache of them re-renders once. */
    ...(backend === 'azure'
      ? [{ format: AZURE_FORMAT, rate: options.azure?.rate ?? AZURE_RATE }]
      : []),
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
 * and the part they both got wrong alone. A product that wants the cache kind
 * need not write it: `cacheStore()` below is that one, ready-made.
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

/**
 * A `SpokenStore` that is a cache: its own IndexedDB database, one object store,
 * the WAVs under their §3 names, and the browser free to clear it.
 *
 * The vorlaut kind of store from `remember()`'s note, ready-made, because it
 * is the kind every product wanting one wrote the same way: bildhaft's Anybook
 * recordings had it word for word. mitreden's library is the other kind and
 * stays its own — a recording owned by a sentence, deleted with it and carried
 * in a Sicherung is not something a browser may throw away.
 *
 * **`name` is the database, and it is the product's.** One per product
 * (`bildhaft-stimme`), never one shared across the family: §3 lets each product
 * truncate the name its own way, and a database apart from the product's
 * material needs no version of that one and cannot touch it when cleared. The
 * layout — version 1, one store called `wav`, the bytes as a `Uint8Array` — is
 * exactly bildhaft's, so its recordings carry over without a migration.
 *
 * **Nothing here fails.** A refused IndexedDB (a private window, a browser with
 * site data off, node), a full disk, a database of that name shaped otherwise:
 * each answers `get` with `undefined` and lets `put` resolve, which to
 * `remember()` means speaking again next time. That is the decision its note
 * asks a store to make inside `put`, and for a cache it is always the same
 * one — every byte in it can be made again.
 *
 * Opened on first use, not when called, so a module may build its store at
 * load time and still be imported where there is no IndexedDB at all.
 */
export function cacheStore(name: string): SpokenStore {
  let opening: Promise<IDBDatabase | null> | null = null;

  const open = (): Promise<IDBDatabase | null> => (opening ??= new Promise((resolve) => {
    try {
      const request = globalThis.indexedDB.open(name, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore(WAVS); };
      request.onsuccess = () => {
        const db = request.result;
        /* Another tab deleting or upgrading the database waits for every open
           connection to close. Close, and open afresh on the next call. */
        db.onversionchange = () => { db.close(); opening = null; };
        db.onclose = () => { opening = null; };
        resolve(db);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);   // no indexedDB at all, or one that throws on open
    }
  }));

  /** One request in its own transaction; `undefined` for anything but success. */
  const run = async <T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>):
      Promise<T | undefined> => {
    const db = await open();
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(WAVS, mode);
        const request = act(tx.objectStore(WAVS));
        /* Resolved on `complete` rather than on the request's success, so a put
           has landed by the time it resolves; a quota failure arrives as an
           abort, after the request itself has succeeded. */
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => resolve(undefined);
        tx.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);   // no `wav` store in a database of that name, or closed
      }
    });
  };

  return {
    async get(key) {
      const held = await run('readonly', (store) => store.get(key));
      return held instanceof Uint8Array ? held : undefined;
    },
    async put(key, wav) {
      /* A copy, not the view as handed over: IndexedDB keeps a view's whole
         buffer, so a WAV that is a window onto something larger would carry
         the rest of it into the database. */
      await run('readwrite', (store) => store.put(wav.slice(), key));
    },
  };
}

const WAVS = 'wav';
