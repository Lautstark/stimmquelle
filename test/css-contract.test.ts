/* The CSS contract, conventions.md §4.12: a shared module that emits markup
 * brings its CSS.
 *
 * Every class name a module puts on a node has to be one
 * @lautstark/design/components.css draws - a selector in that file names it.
 * Each is rendered in every state it has, the class tokens of every node under
 * it are collected, and the difference against the stylesheet has to be empty.
 * A name that is missing is either a rule that belongs in components.css and is
 * not there yet, or a class the module should not be emitting at all - §4.12
 * says which, and neither is this test's to decide.
 *
 * components.css comes in as a devDependency for exactly this: the package
 * does not import it at runtime, the products do, and what is asserted here
 * is that what they import draws what this package emits.
 *
 * ## Two halves now, and one pair of helpers
 *
 * Until 2026-09-17 `drawnClasses()` and `emittedClasses()` were written out
 * here, in a copy character-identical to sicherung's and bildquelle's, under a
 * note saying they belonged in design beside the file they read. design v1.33.1
 * carries them, so they are imported. The `KNOWN_MISSING` map below stays here:
 * it is a dated local exception list, and it is the only half of this that is
 * this package's own.
 *
 * `emittedClasses()` also gained the one change the Svelte versions needed. A
 * component with a `<style>` block puts its scoping hash into `classList`
 * beside the real names - `["panel", "svelte-1fnslke", "section", ...]` - and
 * the hash has no selector in components.css and never will. The helper skips
 * it, which is why this file can hold the declarative versions to exactly the
 * same rule as the imperative ones.
 */
import { drawnClasses, emittedClasses } from '@lautstark/design/css';

// @vitest-environment jsdom
import { flushSync, mount as render, unmount, type Component } from 'svelte';
import { describe, expect, it } from 'vitest';
/* `dist`, not `src`: what is being held to the stylesheet here is what a
   product draws, and a product draws the build. The components beside it take
   the same copy — `svelte-components.test.ts` has the whole reasoning and the
   guard that keeps it true. */
import { voicePicker, type Pickable } from '../dist/voice-picker.js';
import AzurePanel from '../svelte/AzurePanel.svelte';
import PlayButton from '../svelte/PlayButton.svelte';
import VoicePicker from '../svelte/VoicePicker.svelte';

const voice = (over: Partial<Pickable> & { id: string; name: string }): Pickable => ({
  locale: 'de_DE', gender: 'female', source: 'piper', downloadBytes: 63_000_000,
  needsKey: false, ...over,
});
const VOICES: Pickable[] = [
  voice({ id: 'piper:de_DE-thorsten-medium', name: 'Thorsten', quality: 'medium', gender: 'male' }),
  voice({ id: 'piper:de_DE-thorsten-high', name: 'Thorsten', quality: 'high', gender: 'male',
    downloadBytes: 114_000_000 }),
  voice({ id: 'piper:de_DE-kerstin-low', name: 'Kerstin', quality: 'low', rushesFragments: true,
    downloadBytes: 22_000_000 }),
  voice({ id: 'azure:de-DE-KatjaNeural', name: 'Katja', locale: 'de-DE', source: 'azure',
    downloadBytes: 0, needsKey: true }),
  voice({ id: 'azure:en-GB-AmyNeural', name: 'Amy', locale: 'en-GB', source: 'azure',
    downloadBytes: 0, needsKey: true }),
  voice({ id: 'system:Anna', name: 'Anna', locale: 'de-DE', source: 'system', gender: '',
    downloadBytes: 0, needsKey: false }),
];

/* Nothing tolerated on the day this was written. If a name ever has to be
 * listed here, it needs a date and a reason, the way sicherung's does. */
const KNOWN_MISSING = new Map<string, string>();

const drawn = drawnClasses();
const missingFrom = (node: Element) =>
  [...emittedClasses(node)].filter((name) => !drawn.has(name) && !KNOWN_MISSING.has(name));

const mount = (extra: Record<string, unknown> = {}) => {
  let live: string | undefined = 'piper:de_DE-kerstin-low';
  const picker = voicePicker({
    voices: () => VOICES,
    current: () => live,
    pick: (id) => { live = id; picker.refresh(); },
    hear: async (_voice, onProgress) => { onProgress(0.5); },
    notes: (v) => (v.rushesFragments ? ['eilt'] : []),
    ...extra,
  });
  document.body.replaceChildren(picker.node);
  return picker;
};

describe('every class name the picker emits is drawn by components.css', () => {
  it('components.css was found and has rules', () => {
    expect(drawn.size).toBeGreaterThan(20);
  });

  it('with the list, one chosen, two languages of voices', () => {
    const picker = mount();
    expect(missingFrom(picker.node)).toEqual([]);
    picker.dispose();
  });

  it('after a search that finds nothing', () => {
    const picker = mount();
    const field = picker.node.querySelector<HTMLInputElement>('input')!;
    field.value = 'zzzz';
    field.dispatchEvent(new Event('input'));
    expect(missingFrom(picker.node)).toEqual([]);
    picker.dispose();
  });

  it('in English, with nothing chosen', () => {
    const picker = mount({ lang: 'en', current: () => undefined });
    expect(missingFrom(picker.node)).toEqual([]);
    picker.dispose();
  });

  it('with no voices at all', () => {
    const picker = mount({ voices: () => [] });
    expect(missingFrom(picker.node)).toEqual([]);
    picker.dispose();
  });
});

/* The declarative half. Same rule, same stylesheet, same helpers - the reason
 * it is worth asserting twice is that the two versions emit their markup in two
 * completely different ways, and "same emitted markup" is the whole of what
 * §6.8 asks of a twin. A name that drifts in one of them is exactly what this
 * catches. */

/** Mounts a component, hands its root to `check`, and takes it down again. */
function drawing(
  component: unknown,
  props: Record<string, unknown>,
  check: (root: Element) => void,
): void {
  const target = document.createElement('div');
  document.body.replaceChildren(target);
  const app = render(component as Component<Record<string, unknown>>, { target, props });
  flushSync();
  try {
    check(target.firstElementChild!);
  } finally {
    void unmount(app);
  }
}

const AZURE_WORDS = {
  key: 'Schlüssel',
  region: 'Region',
  regionHint: 'Steht im Azure-Portal bei deiner Speech-Ressource.',
  save: 'Speichern',
  saving: 'Wird geprüft …',
  forget: 'Schlüssel entfernen',
  asking: 'Frage Azure …',
  typeFirst: 'Erst einen Schlüssel eintippen.',
  answers: (count: number) => `${count} Stimmen verfügbar`,
  saved: (count: number) => `Azure Speech freigeschaltet — ${count} Stimmen.`,
  unreachable: 'Die Region antwortet nicht.',
  refused: 'Azure nimmt den Schlüssel nicht an.',
  failed: (words: string) => `Azure hat nicht geantwortet (${words}).`,
};

describe('every class name the Svelte twins emit is drawn by components.css', () => {
  it('the picker, with the list, one chosen, two languages of voices', () => {
    drawing(VoicePicker, {
      voices: () => VOICES,
      current: () => 'piper:de_DE-kerstin-low',
      pick: () => {},
      hear: async () => {},
      notes: (v: Pickable) => (v.rushesFragments ? ['eilt'] : []),
    }, (root) => expect(missingFrom(root)).toEqual([]));
  });

  it('the picker in English, with nothing chosen and no preview', () => {
    drawing(VoicePicker, {
      voices: () => VOICES,
      current: () => undefined,
      pick: () => {},
      lang: 'en',
    }, (root) => expect(missingFrom(root)).toEqual([]));
  });

  it('the picker with no voices at all', () => {
    drawing(VoicePicker, {
      voices: () => [], current: () => undefined, pick: () => {},
    }, (root) => expect(missingFrom(root)).toEqual([]));
  });

  it('the picker with a chosen voice that is not in the list', () => {
    drawing(VoicePicker, {
      voices: () => VOICES,
      current: () => 'azure:de-DE-GoneNeural',
      pick: () => {},
      hear: async () => {},
      chosenName: () => 'Gisela',
    }, (root) => expect(missingFrom(root)).toEqual([]));
  });

  it('the Azure panel with no key stored', () => {
    drawing(AzurePanel, {
      hasKey: false, words: AZURE_WORDS, save: () => {}, forget: () => {},
    }, (root) => expect(missingFrom(root)).toEqual([]));
  });

  it('the Azure panel with a key stored', () => {
    drawing(AzurePanel, {
      hasKey: true,
      placeholder: '••••4321',
      region: 'germanywestcentral',
      words: AZURE_WORDS,
      save: () => {},
      forget: () => {},
    }, (root) => expect(missingFrom(root)).toEqual([]));
  });

  it('the play button', () => {
    drawing(PlayButton, {
      label: 'Probe hören',
      text: () => 'Hallo',
      hear: async () => undefined,
      trouble: () => {},
      nothing: 'Erst einen Namen eintippen.',
    }, (root) => expect(missingFrom(root)).toEqual([]));
  });
});
