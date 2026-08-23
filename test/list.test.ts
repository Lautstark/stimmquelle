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
      expect(typeof v.offline, `${v.id} offline`).toBe('boolean');
    }
  });

  it('separates what a voice costs to fetch from whether it needs a host', async () => {
    // piper pays once and then reaches nothing; Azure downloads nothing and
    // needs the network every sentence. downloadBytes cannot express that on
    // its own, and a picker promising offline speech has to be able to say it.
    azureServes(azureList);
    const all = await listVoices({ azure: key });
    for (const v of all.filter(v => v.source === 'piper')) expect(v.offline).toBe(true);
    for (const v of all.filter(v => v.source === 'azure')) expect(v.offline).toBe(false);
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

/**
 * The four picks. Editorial rather than derived, so what is asserted here is
 * that the editing is coherent — one per slot, each one actually offerable, each
 * with its reasoning attached.
 */
describe('the recommended four', () => {
  const picks = VOICES.filter(v => v.recommended);

  it('covers each language-and-gender slot exactly once', () => {
    const slots = picks.map(v => `${v.lang} ${v.gender}`);
    expect([...slots].sort()).toEqual(['de female', 'de male', 'en female', 'en male']);
    expect(new Set(slots).size, 'two voices claiming one slot').toBe(slots.length);
  });

  it('never recommends a voice that may not be shipped', () => {
    // The flag is editorial and the licence is not. A picker leading with a
    // voice the gate then refuses would be the worst version of both.
    for (const v of picks) {
      expect(v.licence.ship, `${v.id} is recommended and unshippable`).toBe(true);
    }
  });

  it('says why each one, so the next person argues rather than guesses', () => {
    for (const v of picks) expect(v.recommended_why, `${v.id}`).toBeTruthy();
  });

  it('filters down to what a picker shows first', async () => {
    const shown = await listVoices({ recommended: true, rendersAttribution: true });
    expect(shown.every(v => v.recommended)).toBe(true);
    // Only two are reachable through vits-web today: Kerstin needs the phoneme
    // remap and John is missing from its PATH_MAP. Both need usePiperRuntime,
    // and that gap is the honest state of the four rather than a bug here.
    expect(shown.map(v => v.id)).toEqual([
      'piper:de_DE-thorsten-medium', 'piper:en_US-kristin-medium',
    ]);
  });

  it('reaches all four once the caller drives piper itself', () => {
    const reachable = picks.filter(v => refuse(v.id, { ownsInference: true }) === null);
    expect(reachable).toHaveLength(4);
  });

  it('leaves Azure unrecommended, having no opinion on hundreds of voices', async () => {
    azureServes(azureList);
    const azure = (await listVoices({ azure: key })).filter(v => v.source === 'azure');
    expect(azure.length).toBeGreaterThan(0);
    expect(azure.every(v => !v.recommended)).toBe(true);
  });
});

describe('rushesFragments', () => {
  it('reaches a picker on the one voice that has it, and no other', () => {
    const offered = piperVoices({ ownsInference: true });
    const carrying = offered.filter(v => v.rushesFragments).map(v => v.id);
    expect(carrying).toEqual(['piper:de_DE-kerstin-low']);
    // Absent rather than false everywhere else, so a picker can test the field
    // without a list of voices of its own.
    const thorsten = offered.find(v => v.id === 'piper:de_DE-thorsten-medium');
    expect(thorsten?.rushesFragments).toBeUndefined();
  });

  it('carries its evidence, the way recommended does', () => {
    const kerstin = VOICES.find(v => v.id === 'de_DE-kerstin-low');
    expect(kerstin?.rushesFragments).toBe(true);
    // A bare flag is a claim nobody can check; the measurements travel with it.
    expect(kerstin?.rushesFragments_why).toMatch(/0\.2|58%|terminal punctuation/i);
  });
});
