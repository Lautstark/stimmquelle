// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { factsOf, voicePicker, type Pickable, type PickerLang } from '../src/voice-picker.js';

/*
 * The picker three products drew for themselves.
 *
 * What is asserted here is what the three copies disagreed about, rather than
 * that the module runs: both languages carrying every word, the language being
 * read on every paint, the radio-group contract all three claimed and one
 * silently did not keep, and — the reason `metacom-panel` has the same test —
 * that every class name this module emits is one `components.css` draws. A test
 * that only mounted the node would have passed against all three copies,
 * including the one whose Tab key walks three hundred rows.
 */

const voice = (over: Partial<Pickable> & { id: string; name: string }): Pickable => ({
  locale: 'de_DE', gender: 'female', source: 'piper', downloadBytes: 63_000_000,
  needsKey: false, ...over,
});

const THORSTEN_MEDIUM = voice({
  id: 'piper:de_DE-thorsten-medium', name: 'Thorsten', quality: 'medium', gender: 'male',
  downloadBytes: 63_000_000,
});
const THORSTEN_HIGH = voice({
  id: 'piper:de_DE-thorsten-high', name: 'Thorsten', quality: 'high', gender: 'male',
  downloadBytes: 114_000_000,
});
const KERSTIN = voice({
  id: 'piper:de_DE-kerstin-low', name: 'Kerstin', quality: 'low', rushesFragments: true,
  downloadBytes: 22_000_000,
});
const KATJA = voice({
  id: 'azure:de-DE-KatjaNeural', name: 'Katja', locale: 'de-DE', source: 'azure',
  downloadBytes: 0, needsKey: true,
});
const AMY = voice({
  id: 'azure:en-GB-AmyNeural', name: 'Amy', locale: 'en-GB', source: 'azure',
  downloadBytes: 0, needsKey: true,
});
const ANNA = voice({
  id: 'system:Anna', name: 'Anna', locale: 'de-DE', source: 'system', gender: '',
  downloadBytes: 0, needsKey: false,
});

const GERMAN = [THORSTEN_MEDIUM, THORSTEN_HIGH, KERSTIN, KATJA, ANNA];

interface MountOptions {
  voices?: readonly Pickable[];
  current?: string | undefined;
  lang?: PickerLang | (() => PickerLang);
  hear?: (voice: Pickable, onProgress: (share: number) => void) => Promise<void>;
  notes?: (voice: Pickable) => readonly string[];
  chosenName?: () => string;
}

function mount(options: MountOptions = {}) {
  let live = options.current;
  const picked: string[] = [];
  const picker = voicePicker({
    voices: () => options.voices ?? GERMAN,
    current: () => live,
    pick: (id) => { picked.push(id); live = id; picker.refresh(); },
    ...(options.lang === undefined ? {} : { lang: options.lang }),
    ...(options.hear ? { hear: options.hear } : {}),
    ...(options.notes ? { notes: options.notes } : {}),
    ...(options.chosenName ? { chosenName: options.chosenName } : {}),
  });
  // Attached, because focus() does nothing to a detached node and the roving
  // tabindex is half of what this file is about.
  document.body.replaceChildren(picker.node);
  return { picker, picked };
}

const rows = (picker: { node: HTMLElement }) =>
  [...picker.node.querySelectorAll<HTMLButtonElement>('.voice')];
const names = (picker: { node: HTMLElement }) =>
  rows(picker).map((row) => row.querySelector('.voice__name')!.textContent);
const chips = (picker: { node: HTMLElement }) =>
  [...picker.node.querySelectorAll<HTMLButtonElement>('.chip')].map((chip) => chip.textContent);
const search = (picker: { node: HTMLElement }) =>
  picker.node.querySelector<HTMLInputElement>('input.field')!;

const type = (picker: { node: HTMLElement }, text: string): void => {
  const field = search(picker);
  field.value = text;
  field.dispatchEvent(new Event('input'));
};

describe('the words', () => {
  /*
   * Both languages, every word. §5's note on the backup extraction says why
   * this is asserted twice over: vorlaut's first version of the equivalent test
   * ran in whichever language the runner picked, so taking a whole clause out
   * of the German string left it green.
   */
  it.each(['de', 'en'] as const)('has every fixed word in %s', (lang) => {
    const { picker } = mount({ lang, current: KERSTIN.id, hear: async () => {} });
    const said = [
      picker.node.querySelector('.lbl')!.textContent,
      search(picker).placeholder,
      picker.node.querySelector('.voices')!.getAttribute('aria-label'),
      picker.node.querySelector('.voice__hint')!.textContent,
      picker.node.querySelector<HTMLButtonElement>('.voices__play')!.getAttribute('aria-label'),
      picker.node.querySelector<HTMLButtonElement>('.voices__play')!.title,
      ...rows(picker).map((row) => row.querySelector('.voice__facts')!.textContent),
    ];
    for (const line of said) {
      expect(line, JSON.stringify(said)).toBeTruthy();
      expect(line).not.toContain('undefined');
    }
    type(picker, 'zzz');
    expect(picker.node.querySelector('.voices__none')!.textContent).toBeTruthy();
  });

  /* The one failure mode a two-language table has that a one-language table
     does not: an arm translated by hand from the other, with a word left in it.
     Every line that is a sentence rather than a proper noun has to differ. */
  it('does not leave German standing in the English arm', () => {
    const de = mount({ lang: 'de', current: KERSTIN.id, hear: async () => {} }).picker;
    const en = mount({ lang: 'en', current: KERSTIN.id, hear: async () => {} }).picker;
    const readable = (picker: { node: HTMLElement }) => [
      picker.node.querySelector('.lbl')!.textContent,
      search(picker).placeholder,
      picker.node.querySelector('.voices')!.getAttribute('aria-label'),
      picker.node.querySelector('.voice__hint')!.textContent,
      picker.node.querySelector<HTMLButtonElement>('.voices__play')!.title,
    ];
    for (const [german, english] of readable(de).map((line, at) => [line, readable(en)[at]]))
      expect(english, `${german}`).not.toBe(german);
  });

  /* stimmquelle publishes three genders and a system voice has none at all: the
     Web Speech API answers with a name and a language, and guessing from the
     name is how somebody is told their voice is a woman because it is called
     Anna. Whatever the catalogue adds later is shown as it came rather than as
     the name of a missing translation. */
  it('names the three genders and invents no fourth', () => {
    expect(factsOf(KERSTIN, [KERSTIN], 'de')).toContain('weiblich');
    expect(factsOf(THORSTEN_HIGH, [THORSTEN_HIGH], 'en')).toContain('male');
    expect(factsOf(voice({ id: 'x', name: 'X', gender: 'neutral' }), [], 'de')).toContain('neutral');
    expect(factsOf(ANNA, [ANNA], 'de')).toBe('Vom Gerät');
  });

  /* The download is a shipped voice's one real cost and a cloud voice's is the
     key, so each row says the one that applies and neither says both. */
  it('says a size or a key, never both', () => {
    expect(factsOf(THORSTEN_HIGH, [THORSTEN_HIGH], 'de')).toContain('114 MB');
    expect(factsOf(KATJA, [KATJA], 'de')).toContain('Schlüssel nötig');
    expect(factsOf(KATJA, [KATJA], 'de')).not.toMatch(/MB/);
  });
});

describe('the facts line', () => {
  /*
   * wochenwerk's rule, and it is why a German-only product never has to ask for
   * the language to be left out: „Deutsch" on every row of a German list is a
   * word that decides nothing.
   */
  it('drops the language where every voice speaks the same one', () => {
    expect(factsOf(KATJA, GERMAN, 'de')).not.toContain('Deutsch');
    expect(factsOf(KATJA, [...GERMAN, AMY], 'de')).toContain('Deutsch');
  });

  /* `recommended` is not among the four and must not be: it is false for every
     cloud voice, so a badge would sit on the shipped rows and not on the
     several hundred an Azure key had just unlocked. */
  it('carries four facts and no verdict', () => {
    expect(factsOf(THORSTEN_MEDIUM, [...GERMAN, AMY], 'de'))
      .toBe('Mitgeliefert · Deutsch (Deutschland) · männlich · 63 MB');
  });

  /* A row gets the whole tag and a chip gets the bare language, and the two
     really are different questions: two voices that differ only in region are
     two different answers, while a pill saying „Deutsch (Deutschland)" would be
     lying about what it filters by. */
  it('names the region on a row and not on a pill', () => {
    const austrian = voice({ id: 'x', name: 'Ida', locale: 'de-AT' });
    expect(factsOf(austrian, [austrian, AMY], 'de')).toContain('Österreichisches Deutsch');
    expect(chips(mount({ voices: [austrian, AMY] }).picker)).toEqual(
      ['Alle Sprachen', 'Deutsch', 'Englisch'],
    );
  });
});

describe('the name', () => {
  /* labelOf's contract, asked against the whole catalogue rather than against
     the rows on screen — see the module header. */
  it('tells two voices of one name apart, and only then', () => {
    const { picker } = mount();
    expect(names(picker)).toContain('Thorsten (medium)');
    expect(names(picker)).toContain('Thorsten (high)');
    expect(names(picker)).toContain('Kerstin');
  });

  it('keeps the tier on a row a search has narrowed to one', () => {
    const { picker } = mount();
    type(picker, 'high');
    expect(names(picker)).toEqual(['Thorsten (high)']);
  });
});

describe('the radio group', () => {
  /*
   * `aria-checked="false"` as a word rather than an absent attribute. Two call
   * sites in this family wrote neither state and only looked right because a
   * class beside them carried the paint — @lautstark/werkzeuge `src/dom.ts`
   * names them. Nothing here carries that paint: components.css hangs the
   * selected row off this attribute.
   */
  it('says false out loud on every row that is not the answer', () => {
    const { picker } = mount({ current: KERSTIN.id });
    const checked = rows(picker).map((row) => row.getAttribute('aria-checked'));
    expect(checked).toEqual(['false', 'false', 'true', 'false', 'false']);
    expect(picker.node.querySelector('.voices')!.getAttribute('role')).toBe('radiogroup');
    expect(rows(picker).every((row) => row.getAttribute('role') === 'radio')).toBe(true);
  });

  /* vorlaut-editor's group has no name at all, so a reader reaching it is told
     only that it is a radio group. */
  it('is named', () => {
    expect(mount().picker.node.querySelector('.voices')!.getAttribute('aria-label')).toBe('Stimme');
  });

  /*
   * The roving tabindex vorlaut-editor has none of: with an Azure key that list
   * is several hundred plain buttons, and tabbing through them to reach the
   * settings underneath is the thing its own search field exists to prevent.
   */
  it('is one tab stop, not one per voice', () => {
    const { picker } = mount({ current: KERSTIN.id });
    expect(rows(picker).map((row) => row.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
  });

  /* Nothing is chosen on a first run, and narrowing can hide the one that is. A
     group the keyboard cannot enter at all is worse than one whose entry point
     is not the answer. */
  it('keeps a way in when nothing on screen is chosen', () => {
    expect(rows(mount().picker)[0]!.tabIndex).toBe(0);
    const { picker } = mount({ current: KERSTIN.id });
    type(picker, 'thorsten');
    expect(rows(picker).filter((row) => row.tabIndex === 0)).toHaveLength(1);
  });

  it('walks with the arrows and wraps at both ends', () => {
    const { picker, picked } = mount({ current: THORSTEN_MEDIUM.id });
    rows(picker)[0]!.focus();
    picker.node.querySelector('.voices')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(picked).toEqual([THORSTEN_HIGH.id]);
    picker.node.querySelector('.voices')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(picked.at(-1)).toBe(ANNA.id);
  });
});

describe('what is offered', () => {
  /*
   * conventions.md §4.13's rule and `metacom-panel`'s: what cannot run is drawn
   * disabled, never removed. A chosen voice that is no longer in the catalogue
   * — a key withdrawn, a model deleted — stays chosen on purpose, so it has to
   * stay visible; otherwise the list shows nothing ticked and the next save
   * quietly drops a decision somebody made. vorlaut-editor is the only product
   * that had this.
   */
  it('draws a chosen voice that has gone, with nothing to listen to', () => {
    const { picker } = mount({
      current: 'azure:de-DE-KatjaNeural-old', hear: async () => {},
      chosenName: () => 'Katja',
    });
    const gone = rows(picker).at(-1)!;
    expect(gone.querySelector('.voice__name')!.textContent).toBe('Katja');
    expect(gone.querySelector('.voice__facts')!.textContent).toBe('hier nicht verfügbar');
    expect(gone.getAttribute('aria-checked')).toBe('true');
    const plays = picker.node.querySelectorAll<HTMLButtonElement>('.voices__play');
    expect(plays[plays.length - 1]!.disabled).toBe(true);
    expect([...plays].slice(0, -1).every((play) => !play.disabled)).toBe(true);
  });

  /* Without a name to use it falls back to the id, which is ugly and is still
     the right way round: a stored choice that shows as nothing is how one gets
     dropped. */
  it('falls back to the id rather than showing nothing chosen', () => {
    const { picker } = mount({ current: 'azure:de-DE-KatjaNeural-old' });
    expect(names(picker).at(-1)).toBe('azure:de-DE-KatjaNeural-old');
  });

  /* mitreden has nothing to play a sample through, and must not be handed a
     button it cannot wire up. The row keeps its wrapper either way, so a
     product adding a preview later moves nothing. */
  it('draws no preview button where a product offers no preview', () => {
    const { picker } = mount();
    expect(picker.node.querySelectorAll('.voices__play')).toHaveLength(0);
    expect(picker.node.querySelectorAll('.voices__row')).toHaveLength(GERMAN.length);
  });

  it('reports how far a download has got, in whole per cent', async () => {
    let report: (share: number) => void = () => {};
    let finish: () => void = () => {};
    const { picker } = mount({
      hear: (_voice, onProgress) => {
        report = onProgress;
        return new Promise<void>((resolve) => { finish = resolve; });
      },
    });
    const play = picker.node.querySelector<HTMLButtonElement>('.voices__play')!;
    play.click();
    expect(play.disabled).toBe(true);
    report(0.42);
    expect(play.textContent).toBe('42');
    finish();
    await vi.waitFor(() => expect(play.disabled).toBe(false));
    expect(play.textContent).toBe('▶');
  });

  /* A 63 MB model finishing after the sheet closed would otherwise paint a
     button in a tree nobody can see. */
  it('stops painting a preview once it has been disposed of', async () => {
    let finish: () => void = () => {};
    const { picker } = mount({ hear: () => new Promise<void>((resolve) => { finish = resolve; }) });
    const play = picker.node.querySelector<HTMLButtonElement>('.voices__play')!;
    play.click();
    picker.dispose();
    finish();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(play.textContent).toBe('…');
  });
});

describe('narrowing it', () => {
  /* Searched on exactly what the row shows. A list that answers to something
     invisible — a locale code, an id — looks like it is ignoring what was
     typed, and one that will not answer to „Azure" or „weiblich" when both are
     printed on the row looks the same way. */
  it('matches the name and the facts, and nothing invisible', () => {
    const { picker } = mount();
    type(picker, 'azure');
    expect(names(picker)).toEqual(['Katja']);
    type(picker, 'männlich');
    expect(names(picker)).toEqual(['Thorsten (medium)', 'Thorsten (high)']);
    type(picker, 'de_de');
    expect(names(picker)).toEqual([]);
  });

  it('says so when nothing matches, in the list’s own line', () => {
    const { picker } = mount();
    type(picker, 'nobody');
    expect(picker.node.querySelector('.voices__none')!.textContent)
      .toBe('Keine Stimme passt dazu.');
    expect(picker.node.querySelectorAll('.empty')).toHaveLength(0);
  });

  /* vorlaut-editor's rule: nothing to narrow with one language in the list. It
     is what makes a German-only product's missing chips a consequence rather
     than an option — and the container is emptied rather than hidden, so the
     block's gap is not spent on nothing. */
  it('offers language pills only where there is more than one language', () => {
    expect(chips(mount().picker)).toEqual([]);
    expect(chips(mount({ voices: [...GERMAN, AMY] }).picker))
      .toEqual(['Alle Sprachen', 'Deutsch', 'Englisch']);
  });

  it('narrows by a language pill and back again', () => {
    const { picker } = mount({ voices: [...GERMAN, AMY] });
    const english = [...picker.node.querySelectorAll<HTMLButtonElement>('.chip')][2]!;
    english.click();
    expect(names(picker)).toEqual(['Amy']);
    expect([...picker.node.querySelectorAll('.chip')]
      .map((chip) => chip.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true']);
    english.click();
    expect(names(picker)).toHaveLength(GERMAN.length + 1);
  });

  /* A field rebuilt on every keystroke loses the caret, which is a note two of
     the three products carry. Its words are assigned instead, so a language
     switch reaches them without the node moving. */
  it('never replaces the field somebody is typing in', () => {
    const { picker } = mount();
    const field = search(picker);
    type(picker, 'thor');
    picker.refresh();
    expect(search(picker)).toBe(field);
    expect(field.value).toBe('thor');
  });
});

describe('the language is read on every paint', () => {
  /* backup-panel's rule, and the reason it is a rule: two of the three
     consumers change language without reloading, and a locale captured once
     goes on answering in the language the reader has just left — well-formed
     the whole time, which is what makes it hard to notice. */
  it('follows a function between paints', () => {
    let lang: PickerLang = 'de';
    const { picker } = mount({ lang: () => lang, current: KERSTIN.id });
    expect(picker.node.querySelector('.lbl')!.textContent).toBe('Stimme suchen');
    expect(picker.node.querySelector('.voice__hint')!.textContent).toContain('Hallo!');
    lang = 'en';
    picker.refresh();
    expect(picker.node.querySelector('.lbl')!.textContent).toBe('Search voices');
    expect(picker.node.querySelector('.voice__hint')!.textContent).toContain('Hello!');
  });
});

describe('what a row has to say', () => {
  /* The one note all three products already said, in words two of them had
     already agreed on. The flag arrives from the catalogue wordless on purpose:
     this module says it in its own register, and it says the fix — typing
     „Hallo!" — rather than the diagnosis. */
  it('says the catalogue’s one trait, on the row that carries it', () => {
    const { picker } = mount();
    const hints = rows(picker).map((row) => row.querySelector('.voice__hint')?.textContent ?? '');
    expect(hints.filter(Boolean)).toHaveLength(1);
    expect(hints[2]).toContain('Satzzeichen');
  });

  /* The same catalogue fact does not weigh the same in three products —
     `offline: false` is a slow start in a browser tab and silence on a wall —
     so this module says neither and takes what a product has to add. */
  it('takes a product’s own notes under the facts, after its own', () => {
    const { picker } = mount({ notes: (voice) => voice.source === 'azure' ? ['Braucht Netz.'] : [] });
    const kerstin = rows(picker)[2]!;
    const katja = rows(picker)[3]!;
    expect([...kerstin.querySelectorAll('.voice__hint')]).toHaveLength(1);
    expect(katja.querySelector('.voice__hint')!.textContent).toBe('Braucht Netz.');
    // Under the facts and never inside them: a sentence among four words stops
    // the line being scannable.
    expect(katja.querySelector('.voice__facts')!.textContent).not.toContain('Netz');
  });
});

describe('the block itself', () => {
  /*
   * Every class this module emits, against the list @lautstark/design draws.
   * conventions.md §4.12: a shared module that emits markup brings its CSS, and
   * the way that rule gets broken is by reaching for a name one product happens
   * to have. `.small`, `.muted` and `.faint` are exactly that — wochenwerk
   * carries `class="voice__facts small muted"`, and nothing in components.css
   * draws any of the three.
   */
  it('emits only class names components.css owns', () => {
    const { picker } = mount({
      voices: [...GERMAN, AMY], current: 'gone', hear: async () => {},
      notes: () => ['etwas'], chosenName: () => 'Katja',
    });
    type(picker, '');
    const drawn = new Set([
      'voice-picker', 'voice-picker__search', 'voice-picker__filters',
      'voices', 'voices__row', 'voices__play', 'voices__none',
      'voice', 'voice__name', 'voice__facts', 'voice__hint',
      'lbl', 'field', 'chip', 'btn', 'quiet',
    ]);
    for (const node of picker.node.querySelectorAll('[class]'))
      for (const name of node.classList) expect(drawn, name).toContain(name);
    expect([...picker.node.classList]).toEqual(['voice-picker']);
    // And the empty line too, which only appears once nothing matches.
    type(picker, 'zzz');
    for (const node of picker.node.querySelectorAll('[class]'))
      for (const name of node.classList) expect(drawn, name).toContain(name);
  });

  it('emits none of the utility classes one product reached for', () => {
    const { picker } = mount({ hear: async () => {} });
    for (const name of ['small', 'muted', 'faint', 'hint', 'empty', 'note', 'play', 'voiceRow'])
      expect(picker.node.querySelectorAll(`.${name}`), name).toHaveLength(0);
  });
});
