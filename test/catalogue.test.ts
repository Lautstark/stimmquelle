import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attributionsFor, byId, CHECKED, displayName, isAllowed, LIBRARY, MIRRORS,
  modelUrls, qualityOf, refuse, shippable, VERSION, VOICES,
} from '../src/index.js';

/**
 * The licensing rule, executable.
 *
 * This is the reason the repository exists, and documentation is the weakest
 * form of enforcement — mitreden's README, mitreden's Dockerfile and vorlaut's
 * tts.py all stated this rule correctly and a CC BY-NC-SA voice still reached a
 * browser build. A failure here is a licence problem, not a broken test.
 */
describe('the licensing rule', () => {
  it('gives every voice a licence somebody actually read', () => {
    for (const v of VOICES) {
      expect(v.licence.name, `${v.id} has no licence name`).toBeTruthy();
      expect(typeof v.licence.ship, `${v.id} has no ship verdict`).toBe('boolean');
    }
  });

  it('never marks a non-commercial or unclear licence shippable', () => {
    for (const v of VOICES.filter(v => v.licence.ship)) {
      const name = v.licence.name.toLowerCase();
      for (const forbidden of ['nc', 'non-commercial', 'noncommercial', 'unclear', 'see url']) {
        expect(name, `${v.id} is marked shippable under ${v.licence.name}`).not.toContain(forbidden);
      }
    }
  });

  it('requires an attribution wherever one is owed', () => {
    // CC-BY may be handed on only where the notice is rendered, so a shippable
    // CC-BY entry without the text to render is a licence breach waiting to be
    // committed by whichever consumer trusts the flag.
    for (const v of VOICES.filter(v => v.licence.ship && /cc[- ]?by/i.test(v.licence.name))) {
      expect(v.licence.attribution, `${v.id} is CC-BY and carries no attribution`).toBeTruthy();
    }
  });

  it('keeps the two voices that failed this rule out', () => {
    for (const id of ['en_US-hfc_female-medium', 'en_US-hfc_male-medium']) {
      const v = byId(id)!;
      expect(v.licence.name).toContain('BY-NC-SA');
      expect(v.licence.ship, `${id} must not be shippable`).toBe(false);
      // It runs. That is the whole trap: nothing fails when the licence is wrong.
      expect(v.browser).toBe('ok');
    }
  });

  it('keeps the voices whose card names no licence out', () => {
    for (const id of ['de_DE-eva_k-x_low', 'de_DE-ramona-low', 'de_DE-karlsson-low']) {
      expect(byId(id)!.licence.ship, `${id} is unclear, which is not a yes`).toBe(false);
    }
  });

  it('withholds a voice owing attribution until the consumer says it renders one', () => {
    // CC-BY is a conditional permission. A consumer that shows no notice has
    // not met the condition, and would never find out: a missing attribution
    // fails exactly as silently as a wrong licence. So the default is to
    // withhold, and asking for it is an explicit claim.
    const owing = VOICES.filter(v => v.licence.ship && v.licence.attribution);
    expect(owing.length).toBeGreaterThan(0);
    for (const v of owing) {
      expect(shippable().map(x => x.id)).not.toContain(v.id);
      expect(isAllowed(v.id)).toBe(false);
      expect(isAllowed(v.id, { rendersAttribution: true })).toBe(v.browser === 'ok');
      // And the notice is actually available to render.
      expect(attributionsFor([v.id])).toHaveLength(1);
    }
  });

  it('offers nothing unshippable through shippable() or isAllowed()', () => {
    for (const v of shippable()) {
      expect(v.licence.ship).toBe(true);
      expect(v.browser).toBe('ok');
    }
    for (const v of VOICES.filter(v => !v.licence.ship)) {
      expect(isAllowed(v.id, { rendersAttribution: true }),
             `${v.id} must not be allowed`).toBe(false);
      expect(isAllowed(v.id, { rendersAttribution: true, ownsInference: true }),
             `${v.id} must not be allowed to a caller that drives piper either`).toBe(false);
    }
  });

  it('asks the licence question even of a caller that drives piper itself', () => {
    // `ownsInference` says the caller has answered the runtime question for
    // itself. It is not a way past the licence one — which is the whole
    // distinction, and the one that was lost when synthesize() had no gate.
    const owns = { ownsInference: true };
    for (const v of VOICES.filter(v => !v.licence.ship)) {
      expect(refuse(v.id, owns), `${v.id} must be refused whoever is inferring`).toBeTruthy();
    }
    for (const v of VOICES.filter(v => v.licence.ship && v.licence.attribution)) {
      expect(refuse(v.id, owns)).toMatch(/owes an attribution/);
      expect(refuse(v.id, { ...owns, rendersAttribution: true })).toBeNull();
    }
  });

  it('lets a caller that drives piper reach what only vits-web could not', () => {
    // The runtime half is genuinely optional and the licence half is not. This
    // is the pair that says so: Kerstin is CC0 and refused only because
    // @diffusionstudio/vits-web cannot phonemise her.
    expect(refuse('de_DE-kerstin-low')).toMatch(/does not speak/);
    expect(refuse('de_DE-kerstin-low', { ownsInference: true })).toBeNull();
  });

  it('refuses an id that is not in the catalogue', () => {
    // An id that reaches Hugging Face unchecked is a licensing decision made by
    // whoever typed it.
    expect(isAllowed('piper:en_GB-someone-medium')).toBe(false);
    expect(byId('en_GB-someone-medium')).toBeUndefined();
  });
});

describe('the runtime answers', () => {
  it('fails every low and x_low voice through vits-web', () => {
    // The fault is the library's fixed symbol table, not the model — which is
    // why driving piper directly reaches them. CONTRACT.md §3a.
    for (const v of VOICES.filter(v => v.quality === 'low' || v.quality === 'x_low')) {
      expect(v.browser, `${v.id} is ${v.quality} and vits-web cannot speak it`).toBe('quality');
    }
  });

  it('agrees with the quality tier in each id', () => {
    for (const v of VOICES) expect(qualityOf(v.id)).toBe(v.quality);
  });

  it('records how each answer was established', () => {
    for (const v of VOICES) expect(v.proof, `${v.id} has no proof`).toBeTruthy();
  });

  it('has no German female voice in a browser', () => {
    // Not an accident to be fixed by choosing a different file: piper publishes
    // three and all three are low or x_low. Reading each model's phoneme_id_map
    // would change this, and nothing else will.
    const german = shippable().filter(v => v.lang === 'de');
    expect(german.every(v => v.gender !== 'female')).toBe(true);
    expect(german.length).toBeGreaterThan(0);
  });
});

describe('ids and names', () => {
  it('names a voice from its id alone, with or without a backend', () => {
    expect(displayName('piper:de_DE-thorsten-medium')).toBe('Thorsten');
    expect(displayName('de_DE-thorsten-medium')).toBe('Thorsten');
  });

  it('names a model it has never heard of rather than failing', () => {
    // Somebody's own model is their licence and their decision, and a machine
    // that cannot speak still has to say what the file would be called.
    expect(displayName('piper:en_GB-alan-medium')).toBe('Alan');
    expect(displayName('de_DE-eva_k-x_low')).toBe('Eva K');
  });

  it('builds both halves of a model url from the id', () => {
    const u = modelUrls('piper:de_DE-thorsten-medium')!;
    expect(u.onnx).toBe(
      `${MIRRORS.browser}/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx`);
    expect(u.config).toBe(`${u.onnx}.json`);
  });

  it('points at the mirror the library actually fetches from', () => {
    expect(modelUrls('de_DE-thorsten-medium')!.onnx).toContain('diffusionstudio');
  });
});

describe('the catalogue itself', () => {
  it('says when it was last checked, and against what', () => {
    expect(CHECKED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(LIBRARY.version).toBeTruthy();
    expect(MIRRORS.browser).toMatch(/^https:\/\//);
  });

  it('says which version it is, and agrees with package.json about it', () => {
    // A vendored dist/browser/index.js has no package.json beside it, so the
    // constant is what a copy of this uses to identify itself. The two live in
    // files that cannot read each other, which is the whole reason for the test.
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(VERSION).toBe(pkg.version);
  });

  it('has no duplicate ids', () => {
    expect(new Set(VOICES.map(v => v.id)).size).toBe(VOICES.length);
  });

  it('owes exactly the attributions of the voices asked about', () => {
    expect(attributionsFor(['de_DE-thorsten-medium'])).toEqual([]);
    expect(attributionsFor(['piper:de_DE-mls-medium'])).toHaveLength(1);
    expect(attributionsFor(['de_DE-mls-medium', 'de_DE-mls-medium'])).toHaveLength(1);
  });
});
