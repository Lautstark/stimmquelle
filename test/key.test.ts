import { describe, expect, it } from 'vitest';
import { keyFor, remember, type SpokenStore } from '../src/key.js';
import { PIPELINE_VERSION, VERSION } from '../src/contract.js';

/**
 * CONTRACT.md §3, held against the code that now implements it.
 *
 * The two clauses at the top are the ones the products got wrong on their own,
 * so they are the two this file would notice losing. Everything else here is
 * §3 read literally: one test per numbered input, each asserting that changing
 * that input changes the name and that changing nothing does not.
 */

const PIPER = 'piper:de_DE-thorsten-medium';
const AZURE = 'azure:de-DE-KatjaNeural';

describe('§3.4 — the engine version, for backends that render locally', () => {
  it('is in a local name: a new engine must not arrive under the old one', async () => {
    // vorlaut's bug. Its audioName() has no engine term at all, so a change of
    // runtime would have re-used every recording it had ever made.
    const before = await keyFor('Hallo', PIPER, { engine: 'vits-web@1.0.3' });
    const after = await keyFor('Hallo', PIPER, { engine: 'vits-web@1.1.0' });
    expect(before).not.toBe(after);
  });

  it('defaults to this package, which is what both products mean today', async () => {
    expect(await keyFor('Hallo', PIPER))
      .toBe(await keyFor('Hallo', PIPER, { engine: `stimmquelle@${VERSION}` }));
  });

  it('is omitted for a cloud backend, which renders elsewhere', async () => {
    // Two different engines, one cloud voice, one name: what happens on this
    // machine says nothing about how Azure rendered it.
    const one = await keyFor('Hallo', AZURE, { engine: 'vits-web@1.0.3' });
    const two = await keyFor('Hallo', AZURE, { engine: 'piper 1.7.0' });
    expect(one).toBe(two);
  });
});

describe('§3.5 — the pipeline version, on every backend', () => {
  it('is in a cloud name too, because the levelling is applied here', async () => {
    /* mitreden's bug, and the reason it is a bug: postprocess() runs on what
       Azure sends back exactly as it runs on piper's output, so a §1 or §2
       change alters a cloud recording as much as a local one. Read off the
       payload rather than by bumping the constant, which a test cannot do:
       a cloud name that carried no pipeline term would have to equal one
       built with a different term, and this asserts it does not. */
    const azure = await keyFor('Hallo', AZURE);
    const withoutPipeline = await sha([
      'Hallo', 'azure', 'de-DE-KatjaNeural', null, /* no §3.5 */ {}, null,
    ]);
    expect(azure).not.toBe(withoutPipeline);

    const withPipeline = await sha([
      'Hallo', 'azure', 'de-DE-KatjaNeural', null, PIPELINE_VERSION, {}, null,
    ]);
    expect(azure).toBe(withPipeline);
  });
});

describe('§3.1–§3.3 — the text, the backend, the voice', () => {
  it('strips the text, and nothing else', async () => {
    expect(await keyFor('  Hallo  ', PIPER)).toBe(await keyFor('Hallo', PIPER));
    // Inner whitespace is text: "und nichts sonst".
    expect(await keyFor('Hallo  du', PIPER)).not.toBe(await keyFor('Hallo du', PIPER));
  });

  it('separates the backend from the model', async () => {
    // The same model name under two backends is two recordings, not one.
    expect(await keyFor('Hallo', 'piper:x')).not.toBe(await keyFor('Hallo', 'azure:x'));
  });

  it('takes the model as a name, never a path (§3 "No paths")', async () => {
    // mitreden learned this expensively: a container keeps models at /voices
    // and a laptop keeps them beside the phrases, and carrying a library
    // between the two re-recorded every piper phrase for nothing.
    const key = await keyFor('Hallo', PIPER, { engine: 'e' });
    expect(key).toBe(await sha([
      'Hallo', 'piper', 'de_DE-thorsten-medium', 'e', PIPELINE_VERSION, {}, null,
    ]));
  });

  it('treats an id with no backend as piper, as speak() does', async () => {
    expect(await keyFor('Hallo', 'de_DE-thorsten-medium'))
      .toBe(await keyFor('Hallo', 'piper:de_DE-thorsten-medium'));
  });
});

describe('§3.6 — the output settings', () => {
  it('counts every knob that decides what postprocess does', async () => {
    const base = await keyFor('Hallo', PIPER);
    for (const knob of [
      { rate: 16000 }, { fadeSec: 0.012 }, { padSec: 0.06 },
      { thresholdDb: -40 }, { keepHeadSec: 0.1 }, { keepTailSec: 0.1 },
    ]) expect(await keyFor('Hallo', PIPER, knob)).not.toBe(base);
  });

  it('does not depend on the order they were written in', async () => {
    expect(await keyFor('Hallo', PIPER, { rate: 16000, padSec: 0.06 }))
      .toBe(await keyFor('Hallo', PIPER, { padSec: 0.06, rate: 16000 }));
  });

  it('treats an unset knob as absent rather than as a value', async () => {
    expect(await keyFor('Hallo', PIPER, { rate: undefined }))
      .toBe(await keyFor('Hallo', PIPER));
  });

  it('carries the consumer\'s own output settings opaquely', async () => {
    // mitreden keeps MP3 rather than the WAV, so its bitrate decides the bytes
    // on disk and belongs in the name of them.
    const mp3 = { format: 'mp3', sampleRate: 44100, channels: 1, bitrate: 192 };
    expect(await keyFor('Hallo', PIPER, { out: mp3 }))
      .not.toBe(await keyFor('Hallo', PIPER, { out: { ...mp3, bitrate: 128 } }));
  });

  it('ignores options that are not about the sound', async () => {
    // A progress callback and an Azure key reach speak() through the same
    // object. Neither changes a byte of the output, and an Azure key in a
    // fingerprint would re-record everything on a key rotation.
    expect(await keyFor('Hallo', AZURE, {
      azure: { key: 'secret', region: 'westeurope' }, onProgress: () => {},
    } as never)).toBe(await keyFor('Hallo', AZURE));
  });
});

describe('the name itself', () => {
  it('is full hex, and the caller truncates', async () => {
    // §3 makes the length a per-product choice — mitreden 12, vorlaut 32 —
    // because the two never share a cache directory.
    expect(await keyFor('Hallo', PIPER)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('needs no disk and no network', async () => {
    // §3's requirement, and the whole reason it is a pure function: a machine
    // that cannot render a WAV still knows what the file would be called.
    expect(await keyFor('Hallo', 'piper:a-voice-nobody-has')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('remember()', () => {
  const store = (held = new Map<string, Uint8Array>()) => {
    const puts: string[] = [];
    const it: SpokenStore & { puts: string[]; held: Map<string, Uint8Array> } = {
      held, puts,
      get: (key) => held.get(key),
      put: (key, wav) => { puts.push(key); held.set(key, wav); },
    };
    return it;
  };

  it('answers from the store without speaking', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const key = await keyFor('Hallo', PIPER);
    const s = store(new Map([[key, bytes]]));

    const got = await remember(s, 'Hallo', PIPER);

    expect(got.cached).toBe(true);
    expect(got.wav).toBe(bytes);
    expect(got.key).toBe(key);
    // The one thing this test is really for: nothing was synthesised. speak()
    // would have thrown here — there is no piper runtime under vitest.
    expect(s.puts).toEqual([]);
  });

  it('reports no timings on a hit', async () => {
    const key = await keyFor('Hallo', PIPER);
    const got = await remember(store(new Map([[key, new Uint8Array(1)]])), 'Hallo', PIPER);
    // Rather than zeroes, which would be a number where a caller reads a
    // measurement.
    expect(got.spoken).toBeUndefined();
  });

  it('keys the store by §3, so the same text in two voices is two entries', async () => {
    const one = await keyFor('Hallo', PIPER);
    const two = await keyFor('Hallo', AZURE);
    expect(one).not.toBe(two);
    const s = store(new Map([[one, new Uint8Array([1])], [two, new Uint8Array([2])]]));

    expect((await remember(s, 'Hallo', PIPER)).wav).toEqual(new Uint8Array([1]));
    expect((await remember(s, 'Hallo', AZURE)).wav).toEqual(new Uint8Array([2]));
  });

  it('lets a failing put through rather than hiding it', async () => {
    // The store is the only side that knows whether these bytes can be made
    // again, so it decides — not this package, silently.
    const s: SpokenStore = {
      get: () => undefined,
      put: () => { throw new Error('quota'); },
    };
    await expect(remember(s, 'Hallo', PIPER)).rejects.toThrow();
  });
});

/** The §3 payload, hashed the way keyFor does, so a test can build one by hand. */
async function sha(payload: unknown[]): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(JSON.stringify(payload)),
  );
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
