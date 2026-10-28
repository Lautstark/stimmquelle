import { afterEach, describe, expect, it, vi } from 'vitest';
import { cacheStore, keyFor, remember } from '../src/key.js';

/**
 * cacheStore(), against an in-memory IndexedDB.
 *
 * Neither node nor jsdom has one, and the store only ever opens a database,
 * gets and puts — so the fake below is those three, asynchronous the way the
 * real thing is, with a switch for each way a browser refuses. Values go
 * through structuredClone, as they do in IndexedDB, which is what lets the
 * test about views see what would really be kept.
 */

type Failure = 'refuse-open' | 'quota';

function fakeIndexedDB(fail?: Failure) {
  const databases = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();
  const later = (f: () => void) => setTimeout(f, 0);
  let opens = 0;

  const factory = {
    open(name: string) {
      opens++;
      const request: Record<string, unknown> & { result?: unknown } = {};
      later(() => {
        if (fail === 'refuse-open') { (request.onerror as () => void)?.(); return; }
        const fresh = !databases.has(name);
        if (fresh) databases.set(name, new Map());
        const stores = databases.get(name)!;
        const db = {
          createObjectStore: (store: string) => { stores.set(store, new Map()); },
          close() {},
          transaction(store: string) {
            const held = stores.get(store);
            if (!held) throw new DOMException('no such store', 'NotFoundError');
            const tx: Record<string, unknown> = {};
            const finish = (abort: boolean) =>
              later(() => (tx[abort ? 'onabort' : 'oncomplete'] as () => void)?.());
            tx.objectStore = () => ({
              get(key: IDBValidKey) {
                const r = { result: structuredClone(held.get(key)) };
                finish(false);
                return r;
              },
              put(value: unknown, key: IDBValidKey) {
                if (fail !== 'quota') held.set(key, structuredClone(value));
                finish(fail === 'quota');
                return { result: key };
              },
            });
            return tx;
          },
        };
        request.result = db;
        if (fresh) (request.onupgradeneeded as () => void)?.();
        (request.onsuccess as () => void)();
      });
      return request;
    },
  };
  return { factory, databases, opens: () => opens };
}

function install(fake: unknown) {
  vi.stubGlobal('indexedDB', fake);
}

afterEach(() => { vi.unstubAllGlobals(); });

const PIPER = 'piper:de_DE-thorsten-medium';

describe('cacheStore()', () => {
  it('keeps a recording across a reload', async () => {
    install(fakeIndexedDB().factory);
    await cacheStore('bildhaft-stimme').put('k', new Uint8Array([1, 2, 3]));
    // A second store of the same name is what the page builds after a reload.
    expect(await cacheStore('bildhaft-stimme').get('k')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('is what remember() reads from, under the §3 name', async () => {
    install(fakeIndexedDB().factory);
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
    install(fakeIndexedDB().factory);
    await cacheStore('bildhaft-stimme').put('k', new Uint8Array([1]));
    expect(await cacheStore('vorlaut-stimme').get('k')).toBeUndefined();
  });

  it('lays the database out as bildhaft did, so its recordings carry over', async () => {
    const fake = fakeIndexedDB();
    install(fake.factory);
    await cacheStore('bildhaft-stimme').put('k', new Uint8Array([1]));
    expect([...fake.databases.get('bildhaft-stimme')!.keys()]).toEqual(['wav']);
  });

  it('keeps the bytes of a view, not the buffer behind it', async () => {
    const fake = fakeIndexedDB();
    install(fake.factory);
    const whole = new Uint8Array(1000);
    await cacheStore('c').put('k', whole.subarray(10, 14));

    const kept = fake.databases.get('c')!.get('wav')!.get('k') as Uint8Array;
    expect(kept.byteLength).toBe(4);
    expect(kept.buffer.byteLength).toBe(4);
  });

  it('does not open anything until it is used', async () => {
    const fake = fakeIndexedDB();
    install(fake.factory);
    const store = cacheStore('c');
    expect(fake.opens()).toBe(0);
    await store.get('k');
    await store.get('k');
    expect(fake.opens()).toBe(1);
  });
});

describe('cacheStore(), where the browser keeps nothing', () => {
  /* Every case reads as "not kept", never as an error: to remember() that
     means speaking again, which for a cache is always the right answer. */
  const notKept = async () => {
    const store = cacheStore('c');
    await expect(store.put('k', new Uint8Array([1]))).resolves.toBeUndefined();
    expect(await store.get('k')).toBeUndefined();
  };

  it('with no IndexedDB at all, as under node', async () => {
    install(undefined);
    await notKept();
  });

  it('with IndexedDB refusing to open, as in some private windows', async () => {
    install(fakeIndexedDB('refuse-open').factory);
    await notKept();
  });

  it('with the disk full', async () => {
    install(fakeIndexedDB('quota').factory);
    await notKept();
  });

  it('with a database of that name shaped otherwise', async () => {
    const fake = fakeIndexedDB();
    fake.databases.set('c', new Map([['something-else', new Map()]]));
    install(fake.factory);
    await notKept();
  });

  it('with an open() that throws', async () => {
    install({ open: () => { throw new DOMException('denied', 'SecurityError'); } });
    await notKept();
  });
});
