import { afterEach, describe, expect, it } from 'vitest';
import { listVoices, piperVoices, refuse, VOICES } from '../src/index.js';

/**
 * The list a picker is built from.
 *
 * Its whole job is that one shape covers every backend, so most of these check
 * the shape holds rather than that a particular voice is in it.
 */
const azureList = [
  { ShortName: 'de-DE-GiselaNeural', LocalName: 'Gisela', Locale: 'de-DE', Gender: 'Female' },
  { ShortName: 'de-DE-ConradNeural', LocalName: 'Conrad', Locale: 'de-DE', Gender: 'Male' },
  { ShortName: 'en-US-JennyNeural', LocalName: 'Jenny', Locale: 'en-US', Gender: 'Female' },
];

function azureServes(body: unknown, ok = true) {
  Object.defineProperty(globalThis, 'fetch', {
    value: async () => ({ ok, status: ok ? 200 : 401, json: async () => body }),
    configurable: true,
  });
}
const key = { key: 'k', region: 'westeurope' };

afterEach(() => Reflect.deleteProperty(globalThis, 'fetch'));

describe('the offered list', () => {
  it('gives every voice the same six facts, whatever renders it', async () => {
    azureServes(azureList);
    for (const v of await listVoices({ azure: key })) {
      expect(v.id, 'id').toBeTruthy();
      expect(v.name, `${v.id} name`).toBeTruthy();
      expect(v.locale, `${v.id} locale`).toBeTruthy();
      expect(['piper', 'azure']).toContain(v.source);
      expect(typeof v.downloadBytes).toBe('number');
      expect(typeof v.needsKey).toBe('boolean');
    }
  });

  it('offers only ids the licence gate would also accept', async () => {
    // The list and the gate must not disagree: a picker showing a voice that
    // speak() then refuses is the licence rule surfacing as a broken button.
    for (const v of piperVoices()) {
      expect(refuse(v.id), `${v.id} is offered but would be refused`).toBeNull();
    }
  });

  it('withholds a voice owing an attribution until the consumer claims it', () => {
    const owing = VOICES.find(v => v.licence.ship && v.licence.attribution)!;
    expect(piperVoices().map(v => v.id)).not.toContain(`piper:${owing.id}`);
    expect(piperVoices({ rendersAttribution: true }).map(v => v.id))
      .toContain(`piper:${owing.id}`);
  });

  it('carries the notice with the voice that owes it', () => {
    const owing = piperVoices({ rendersAttribution: true }).find(v => v.attribution);
    expect(owing, 'somebody owes one').toBeTruthy();
    expect(owing!.attribution).toMatch(/CC BY/i);
  });
});

describe('filtering, which is the point of it', () => {
  it('matches a language however the two backends spell it', async () => {
    azureServes(azureList);
    // piper writes de_DE, Azure writes de-DE, a picker asks for de.
    for (const ask of ['de', 'de-DE', 'de_DE']) {
      const got = await listVoices({ lang: ask, azure: key });
      expect(got.length, ask).toBeGreaterThan(0);
      for (const v of got) expect(v.lang, `${v.id} for ${ask}`).toBe('de');
    }
  });

  it('filters by gender across both backends at once', async () => {
    azureServes(azureList);
    const women = await listVoices({ gender: 'female', azure: key });
    expect(women.map(v => v.source)).toContain('piper');
    expect(women.map(v => v.source)).toContain('azure');
    for (const v of women) expect(v.gender).toBe('female');
  });

  it('does not pass a multi-speaker corpus off as a man or a woman', async () => {
    // de_DE-mls-medium is 236 speakers and has no gender to offer a picker.
    const all = piperVoices({ rendersAttribution: true });
    const mixed = all.find(v => v.gender === 'mixed')!;
    expect(mixed).toBeTruthy();
    for (const g of ['female', 'male']) {
      expect((await listVoices({ gender: g, rendersAttribution: true })).map(v => v.id))
        .not.toContain(mixed.id);
    }
  });
});

describe('Azure, which is there only when a key is', () => {
  it('is absent until one is passed', async () => {
    azureServes(azureList);
    expect((await listVoices()).every(v => v.source === 'piper')).toBe(true);
  });

  it('arrives named and gendered, not as a bare ShortName', async () => {
    azureServes(azureList);
    const gisela = (await listVoices({ azure: key })).find(v => v.id.endsWith('GiselaNeural'))!;
    expect(gisela.name).toBe('Gisela');
    expect(gisela.gender).toBe('female');
    expect(gisela.locale).toBe('de-DE');
    expect(gisela.downloadBytes).toBe(0);
    expect(gisela.needsKey).toBe(true);
  });

  it('gives a German female voice the piper catalogue cannot', async () => {
    // The slot that is empty without a key. Worth asserting because it is the
    // reason a product offers Azure at all.
    azureServes(azureList);
    const found = await listVoices({ lang: 'de', gender: 'female', azure: key });
    expect(found.length).toBeGreaterThan(0);
  });

  it('throws on a bad key rather than quietly listing half the voices', async () => {
    // A picker silently short of half its voices fails the same way a wrong
    // licence does, and only the person who typed the key can fix it.
    azureServes({}, false);
    await expect(listVoices({ azure: key })).rejects.toThrow(/Azure said 401/);
  });
});
