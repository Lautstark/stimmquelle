import { IDBFactory, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cacheStore, keyFor, remember } from '../src/key.js';

/**
 * cacheStore(), against fake-indexeddb.
 *
 * Neither node nor jsdom has an IndexedDB, and a hand-written fake would be
 * the one thing here deciding whether a transaction stays open across an
 * await — which is the question the budget's single transaction stakes
 * everything on. fake-indexeddb implements the spec's lifetimes, so a store
 * that commits too early fails here as it would in a browser.
 *
 * A fresh factory per test: databases are global state, and a test that left
 * one behind would pass the next test's "kept across a reload" for it.
 */

let factory: IDBFactory;
beforeEach(() => {
  factory = new IDBFactory();
  vi.stubGlobal('indexedDB', factory);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PIPER = 'piper:de_DE-thorsten-medium';
const bytes = (n: number, fill = 1) => new Uint8Array(n).fill(fill);

/** A database built by hand, the way some other code left it. */
function raw(name: string, version: number, upgrade: (db: IDBDatabase) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
}

describe('cacheStore()', () => {
  it('keeps a recording across a reload', async () => {
    await cacheStore('bildhaft-stimme').put('k', new Uint8Array([1, 2, 3]));
    // A second store of the same name is what the page builds after a reload.
    expect(await cacheStore('bildhaft-stimme').get('k')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('is what remember() reads from, under the §3 name', async () => {
    const store = cacheStore('bildhaft-stimme');
    const key = await keyFor('Hallo', PIPER);
    await store.put(key, new Uint8Array([7]));

    // speak() would throw here — there is no piper runtime under vitest — so a
    // hit is the only way this resolves.
    const got = await remember(store, 'Hallo', PIPER);
    expect(got.cached).toBe(true);
    expect(got.wav).toEqual(new Uint8Array([7]));
  });

  it('keeps each product in its own database', async () => {
    await cacheStore('bildhaft-stimme').put('k', bytes(1));
    expect(await cacheStore('vorlaut-stimme').get('k')).toBeUndefined();
  });

  it('keeps the bytes of a view, not the buffer behind it', async () => {
    await cacheStore('c').put('k', new Uint8Array(1000).subarray(10, 14));
    const kept = (await cacheStore('c').get('k'))!;
    expect(kept.byteLength).toBe(4);
    expect(kept.buffer.byteLength).toBe(4);
  });

  it('does not open anything until it is used', async () => {
    const open = vi.spyOn(factory, 'open');
    const store = cacheStore('c');
    expect(open).not.toHaveBeenCalled();
    await store.get('k');
    await store.get('k');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('forgets everything on clear()', async () => {
    const store = cacheStore('c');
    await store.put('a', bytes(1));
    await store.put('b', bytes(1));
    await store.clear();
    expect(await store.get('a')).toBeUndefined();
    expect(await cacheStore('c').get('b')).toBeUndefined();
  });
});

describe('cacheStore(), over bildhaft\'s version 1', () => {
  /* bildhaft wrote `bildhaft-stimme` at version 1 with one store, `wav`, before
     this existed. Its recordings are worth an Azure call each. */
  const bildhaft = (held: Record<string, Uint8Array>) =>
    raw('bildhaft-stimme', 1, (db) => {
      const wav = db.createObjectStore('wav');
      for (const [key, value] of Object.entries(held)) wav.put(value, key);
    });

  it('reads what bildhaft already kept', async () => {
    await bildhaft({ old: new Uint8Array([4, 5]) });
    expect(await cacheStore('bildhaft-stimme').get('old')).toEqual(new Uint8Array([4, 5]));
  });

  it('counts it against a budget at its real size, as the oldest', async () => {
    await bildhaft({ old: bytes(6) });
    const store = cacheStore('bildhaft-stimme', { budget: 10 });
    await store.put('new', bytes(6));   // 12 > 10: one has to go, and it is the old one
    expect(await store.get('old')).toBeUndefined();
    expect(await store.get('new')).toEqual(bytes(6));
  });
});

describe('cacheStore() with a budget', () => {
  it('forgets the least recently written first', async () => {
    const store = cacheStore('c', { budget: 10 });
    await store.put('a', bytes(4));
    await store.put('b', bytes(4));
    await store.put('c', bytes(4));
    expect(await store.get('a')).toBeUndefined();
    expect(await store.get('b')).toEqual(bytes(4));
    expect(await store.get('c')).toEqual(bytes(4));
  });

  it('counts a hit as a use, so what is being heard stays', async () => {
    const store = cacheStore('c', { budget: 10 });
    await store.put('a', bytes(4));
    await store.put('b', bytes(4));
    await store.get('a');             // a is now the more recent
    await store.put('c', bytes(4));
    expect(await store.get('b')).toBeUndefined();
    expect(await store.get('a')).toEqual(bytes(4));
  });

  it('never forgets the recording it has just been handed', async () => {
    // Over budget on its own: kept, because evicting it would throw away the
    // synthesis just paid for. The next write makes it evictable.
    const store = cacheStore('c', { budget: 3 });
    await store.put('big', bytes(4));
    expect(await store.get('big')).toEqual(bytes(4));
    await store.put('next', bytes(2));
    expect(await store.get('big')).toBeUndefined();
    expect(await store.get('next')).toEqual(bytes(2));
  });

  it('keeps writes inside one millisecond in the order they were made', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000);
    const store = cacheStore('c', { budget: 8 });
    // Keys chosen so that their own order is the reverse of the writes': a tie
    // left to the key would forget `z`, the newest but one.
    await store.put('z', bytes(4));
    await store.put('y', bytes(4));
    await store.put('x', bytes(4));
    expect(await store.get('z')).toBeUndefined();
    expect(await store.get('y')).toEqual(bytes(4));
  });

  it('forgets nothing without one', async () => {
    const store = cacheStore('c');
    for (const key of ['a', 'b', 'c', 'd']) await store.put(key, bytes(64 * 1024));
    expect(await store.get('a')).toEqual(bytes(64 * 1024));
  });
});

describe('cacheStore(), where the browser keeps nothing', () => {
  /* Every case reads as "not kept", never as an error: to remember() that
     means speaking again, which for a cache is always the right answer. */
  const notKept = async () => {
    const store = cacheStore('c', { budget: 100 });
    await expect(store.put('k', bytes(1))).resolves.toBeUndefined();
    expect(await store.get('k')).toBeUndefined();
    await expect(store.clear()).resolves.toBeUndefined();
  };

  it('with no IndexedDB at all, as under node', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await notKept();
  });

  it('with an open() that throws', async () => {
    vi.stubGlobal('indexedDB', { open: () => { throw new DOMException('denied', 'SecurityError'); } });
    await notKept();
  });

  it('with IndexedDB refusing to open, as in some private windows', async () => {
    vi.stubGlobal('indexedDB', {
      open: () => {
        const request: { onerror?: () => void } = {};
        setTimeout(() => request.onerror?.(), 0);
        return request;
      },
    });
    await notKept();
  });

  it('with the disk full', async () => {
    // The way a browser reports it: the request succeeds, the commit does not.
    const put = FakeObjectStore.prototype.put;
    vi.spyOn(FakeObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
      const request = put.apply(this, args as Parameters<typeof put>);
      if (this.name === 'wav') this.transaction.abort();
      return request;
    });
    await notKept();
  });

  it('with a database of that name shaped otherwise', async () => {
    await raw('c', 2, (db) => { db.createObjectStore('something-else'); });
    await notKept();
  });

  it('with a database of that name from a newer layout', async () => {
    await raw('c', 9, () => {});
    await notKept();
  });
});
