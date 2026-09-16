/* The CSS contract, conventions.md §4.12: a shared module that emits markup
 * brings its CSS. Until 2026-09-16 that was prose; this is the check.
 *
 * Every class name the module puts on a node has to be one
 * @lautstark/design/components.css draws - a selector in that file names it.
 * The panel is rendered in every state it has, the class tokens of every node
 * under it are collected, and the difference against the stylesheet has to be
 * empty. A name that is missing is either a rule that belongs in
 * components.css and is not there yet, or a class the module should not be
 * emitting at all - §4.12 says which, and neither is this test's to decide.
 *
 * components.css comes in as a devDependency for exactly this: the package
 * does not import it at runtime, the products do, and what is asserted here
 * is that what they import draws what this package emits.
 *
 * drawnClasses() is three copies today - sicherung, bildquelle, stimmquelle -
 * and belongs in @lautstark/design beside the file it reads, the day a
 * release of design can carry it there. Written 2026-09-16.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Every class name that has a rule in components.css. */
function drawnClasses(): Set<string> {
  const path = createRequire(import.meta.url).resolve('@lautstark/design/components.css');
  const css = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const drawn = new Set<string>();
  // The text before each `{` is a selector list (or an at-rule prelude, which
  // holds no class). Declarations never reach this: they sit after the brace.
  for (const [, prelude] of css.matchAll(/([^{};]+)\{/g)) {
    for (const [, name] of prelude.matchAll(/\.([A-Za-z_][\w-]*)/g)) drawn.add(name);
  }
  return drawn;
}

/** Every class token on a node and everything under it. */
function emittedClasses(root: Element): Set<string> {
  const names = new Set<string>();
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const name of el.classList) names.add(name);
  }
  return names;
}

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { voicePicker, type Pickable } from '../src/voice-picker.js';

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
  const drawn = drawnClasses();
  const missingFrom = (node: Element) =>
    [...emittedClasses(node)].filter((name) => !drawn.has(name) && !KNOWN_MISSING.has(name));

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
