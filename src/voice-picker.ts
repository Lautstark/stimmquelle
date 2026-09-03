/*
 * The list a voice is chosen from — once, for every product.
 *
 * `@lautstark/bildquelle/metacom-panel` is the precedent and the shape: a
 * module that hands back a finished block, carries its own words in both
 * languages, and leaves the product only what the product alone knows. This is
 * the same correction applied to the other surface three products drew
 * separately — and it is the harder half of conventions.md §4.12, because here
 * the *markup* had already converged and only the drawing had not.
 *
 * ## What was measured, on 2026-09-03
 *
 * Read side by side: mitreden `src/ui/voicepicker.ts` (220 lines) with its
 * rules in `src/styles/app.css`, wochenwerk `src/views/voice-panel.ts` (163)
 * with `src/kalender.css`, vorlaut-editor `src/shell/voices.ts` (934 — the
 * picker is `voiceRow`, `renderFilters`, `renderVoices` and `matches`; the
 * fetch loop, the Azure key, the two language controls and both sheet openers
 * are that product's own and are not this module's subject) with
 * `src/styles/ui.css`.
 *
 * All three already emit `.voices`, `.voice`, `.voice__name`, `.voice__facts`
 * and `.voice__hint`, with `role="radiogroup"` / `role="radio"` and
 * `aria-checked`. **None of those names is in `components.css`.** So the
 * vocabulary had converged and the appearance had not, which is §4.12's failure
 * in its purest form: three products drawing one component, three times, each
 * copy internally consistent.
 *
 * | | mitreden | vorlaut-editor | wochenwerk |
 * | --- | --- | --- | --- |
 * | `.voice` layout | `display:block; width:100%` | `flex:1 1 auto; min-width:0` | `flex:1 1 auto; min-width:0` |
 * | `.voices` | `max-height:min(46vh,340px); overflow:auto` | no box — the sheet scrolls | `max-height:min(46vh,340px); overflow-y:auto` |
 * | `.voice__facts` | 12px, `--text-faint` | 12px, `--text-faint` | **no rule** — `class="voice__facts small muted"` |
 * | `.voice__hint` | 12px, `--text-faint`, `text-wrap:pretty` | 12px, `--text-faint` | **no size** — `--text-dim`, and `.small` in the markup |
 * | the four facts | source · language · gender · cost | source · language · gender · (tier) · cost · note | source · gender · cost |
 * | the tier | inside the name, via `labelOf` | translated, in the facts line, beside the size | inside the name, via `labelOf` |
 * | hear before choosing | — | `▶`, `.btn play` | `▶`, `.btn quiet play`, with a per-cent |
 * | language chips | always, plus „Alle Sprachen" | only when the list holds two languages | none — the list is German |
 * | roving tabindex | yes, with a fallback row | **none at all** | yes, with a fallback row |
 * | arrow keys | yes, and they work once | **none** | yes, and they work once |
 * | the group is named | `aria-label` | **unnamed** | `aria-label` |
 * | a chosen voice that is gone | not drawn | drawn, `▶` disabled, „hier nicht verfügbar" | not drawn |
 * | nothing matches | `<p class="hint">` | `<p class="note">` | `<p class="empty">` |
 *
 * wochenwerk reached the appearance a different way: two utility classes in the
 * markup carrying what the other two put on the component class. Measured in a
 * browser that is 13.5px against 12px and `--text-dim` against `--text-faint`.
 * Nobody decided that. **This module emits no `.small`, `.muted` or `.faint`**
 * — none of the three is drawn in `components.css` either, so a module emitting
 * them would hand two products markup nothing there draws, which is the exact
 * failure §4.12 was written after. At migration wochenwerk's utility-class
 * spelling goes, and its facts line drops to 12px in `--text-faint` and its
 * hint line to 12px.
 *
 * ## What was taken, and from whom
 *
 * - **The row's shape: vorlaut-editor's and wochenwerk's.** A wrapper holding
 *   two buttons, because hearing a voice and choosing it are two decisions and
 *   the first must not commit to the second — and because a button inside a
 *   button is not something a browser will render. mitreden's row *is* the
 *   button, which is why it has no way to offer a preview at all. The wrapper
 *   is drawn even where no preview is offered, so that a product adding one
 *   later changes nothing about the row it sits in.
 * - **The preview button: wochenwerk's.** vorlaut's `▶` hands the whole errand
 *   to the product; wochenwerk's takes a progress share and prints whole
 *   per cent on the button. A piper voice arrives as a 63 MB download on its
 *   first sentence, and a button that says nothing for a minute is a button
 *   somebody presses again.
 * - **`.voices` with no scroll box of its own: vorlaut-editor's**, and this is
 *   the one place a majority lost. The other two nest a 340px scroller inside
 *   the sheet's own scrolling body; vorlaut had that too, measured what it did,
 *   and took it out — a wheel gesture latches to the element under the pointer
 *   for its whole run, so the sheet did not move and the panel below could not
 *   be reached. `components.css` states the rule one floor up in its own words.
 *   A long scroll that works beats a short one that swallows the gesture.
 * - **The roving `tabindex`, the arrow keys and the fallback row: mitreden's
 *   and wochenwerk's.** vorlaut-editor has none of the three: every row is a
 *   plain button, so with an Azure key Tab walks several hundred of them to
 *   reach the settings underneath — which is the thing its own comments say the
 *   search field exists to prevent.
 * - **Keeping the keyboard's place across a repaint: nobody's.** It came out of
 *   writing the test, and it is the reason the table above says the arrows work
 *   *once*. In both products that have them the repaint belongs to somebody
 *   else — an arrow moves the choice, choosing calls back into the product, the
 *   product redraws, and the row that had focus is a detached node — so focus
 *   falls to the document and the second arrow key does nothing. Neither
 *   product can see it from the inside, because neither owns both halves. This
 *   module does, and `paint()` puts the keyboard back where it was standing.
 * - **Searching what the row actually shows: wochenwerk's.** mitreden also
 *   matches the raw locale code, so a list can answer to something invisible.
 *   The label is taken against the whole catalogue rather than against the rows
 *   on screen, which is wochenwerk's other rule and `labelOf`'s own argument:
 *   the tier leaves a name at the moment the query that names it removes the
 *   twin, and matching what is drawn would make „Thorsten (high)" unfindable by
 *   typing „high".
 * - **The language chips only where there is more than one language:
 *   vorlaut-editor's.** mitreden draws „Alle Sprachen" plus one chip even for a
 *   catalogue of one language, which narrows nothing. It is also what makes
 *   wochenwerk's deliberate absence a consequence of the rule rather than an
 *   option: that list is German, so no chips appear and no product has to ask
 *   for that.
 * - **The language dropped out of the facts line on a single-language list:
 *   wochenwerk's**, on the same test as the chips. „Deutsch" printed on every
 *   row of a German list is a word that decides nothing.
 * - **A chosen voice that is not in the list, drawn anyway: vorlaut-editor's.**
 *   A key withdrawn, a model deleted, a layout carried from another machine —
 *   the choice stays stored on purpose, so it has to be visible, or the list
 *   shows nothing ticked and the next save quietly drops a decision somebody
 *   made. Its preview is disabled rather than removed, which is conventions.md
 *   §4.13's rule and `metacom-panel`'s.
 * - **The tier inside the name, via `labelOf`: mitreden's and wochenwerk's.**
 *   vorlaut-editor translates it and puts it in the facts line beside the size,
 *   gated on the same twin test. Two reasons the name wins: `labelOf` is this
 *   package's own published answer to "what do I call this voice", and a picker
 *   shipped *in* this package must not be a second one; and the ambiguity is in
 *   the name, so the thing that resolves it belongs on the name rather than
 *   four words away in a line where a reader has to work out which item differs.
 *
 * ## What deliberately stays with the product
 *
 * - **Where the voices come from, and when they are asked for.** `voices()` is
 *   read on every paint. mitreden holds a module-level catalogue, wochenwerk
 *   asks `offered()` per open, vorlaut-editor reloads after a key is saved.
 *   Three answers to when, one question to this module.
 * - **What a preview is spoken with, and on what text.** vorlaut speaks a
 *   sentence off the board being edited and falls back to a specimen;
 *   wochenwerk speaks one fixed sentence through the board's own speech path
 *   with its own interruption rule. Neither is a fact about a picker.
 * - **The second language control beside it.** mitreden and vorlaut-editor both
 *   have a page language and vorlaut has a Sammlung language as well; those are
 *   `@lautstark/design/language` and a `.menu`, and a picker that also drew one
 *   would be sharing a menu, which is another package's subject.
 * - **What else a row has to say.** `notes()` is the hook, and it exists
 *   because the same catalogue fact does not mean the same thing in three
 *   products. `offline: false` on a wall-mounted board is silence; in a browser
 *   tab at a desk it is a slow start. `makesFile: false` means "will not be
 *   levelled to match the others" on a board and "cannot be saved at all" in
 *   the product whose whole output is a recording. Same fact, opposite weights
 *   — conventions.md §4's own shape — so this module says neither, and says the
 *   one sentence all three had already agreed on instead.
 * - **vorlaut-editor's „zur Sprache dieser Sammlung gewählt".** It marks a
 *   voice that is in force without having been chosen, which is a distinction
 *   only that product's storage makes. It goes through `notes()` at migration
 *   and lands as a line under the facts rather than as a sixth item inside
 *   them, which is what that file's own comment asks for and does not do.
 *
 * ## The words are the picker's, and the one place they are not
 *
 * conventions.md §4.12: a status code is a fact a host phrases in its own
 * voice, and the fixed furniture of one surface is the opposite kind of thing.
 * „Schlüssel nötig" on a row this module builds is not a fact being phrased; it
 * is the row. Two of the three products already had that string character for
 * character in both languages, which is the evidence rather than the argument.
 *
 * The exception is `quality`, and it stays an exception: `labelOf` prints the
 * catalogue's own code, `(medium)` and `(high)`, and this module does not
 * translate it. A tier in words reads as a ranking — vorlaut-editor's file
 * argues it at length and it is right — and `de_DE-kerstin-low` is `low` for a
 * reason that belongs to vits-web rather than to her.
 *
 * wochenwerk is German by policy and passes no `lang`; the other two change
 * language without reloading, which is why `lang` may be a function and is read
 * on every paint.
 */

import { labelOf, type Distinguishable, type VoiceSource } from './list.js';

export type PickerLang = 'de' | 'en';

/**
 * What this picker reads off a voice, and nothing else.
 *
 * `Offered` satisfies it, and so does a product's own voice shape while that
 * product still has one — which is the same courtesy `Distinguishable` extends
 * next door and for the same reason: a consumer should not have to map into a
 * picker's type to be allowed to ask a picker's question. It is why the fields
 * are listed rather than the interface re-exported.
 */
export interface Pickable extends Distinguishable {
  /** Exactly the id `speak()` takes and a product stores. */
  readonly id: string;
  /** `de_DE` for piper, `de-DE` for Azure — each as its own backend writes it. */
  readonly locale: string;
  readonly gender: string;
  readonly source: VoiceSource;
  readonly downloadBytes: number;
  readonly needsKey: boolean;
  readonly rushesFragments?: boolean;
}

export interface VoicePickerOptions {
  /**
   * The catalogue, read on every paint rather than passed once.
   *
   * All three products do this and each for a different reason — a key entered
   * in the meantime, a model that has arrived, a different Sammlung on screen —
   * so the list this module holds is never the list, only the last one drawn.
   */
  voices: () => readonly Pickable[];
  /** Which one is ticked, read on every paint for `voices()`'s reason. */
  current: () => string | undefined;
  pick: (id: string) => void;
  /**
   * Speak a sample in this voice, reporting how far a download has got.
   *
   * Omitted, no preview button is drawn: mitreden has nothing to play a sample
   * through. Everything it reports it reports itself — nothing is thrown back
   * here, because a failure belongs in whatever this product says out loud.
   */
  hear?: (voice: Pickable, onProgress: (share: number) => void) => Promise<void>;
  /**
   * Anything else this product has to say about a row, under the facts.
   *
   * See the header: this is for the catalogue facts whose *weight* is a
   * product's own, never for restating one this module already says.
   */
  notes?: (voice: Pickable) => readonly string[];
  /**
   * What to call the chosen voice when it is not in the list any more.
   *
   * Without it the row still appears — a stored choice must never go quiet —
   * but it is labelled with the id, and an id is `azure:de-DE-KatjaNeural`.
   */
  chosenName?: () => string;
  /**
   * A value, or a function read on every paint.
   *
   * `backup-panel`'s rule, carried over unchanged: two of the three consumers
   * change language without reloading, and a locale captured once goes on
   * answering in the language the reader has just left — perfectly well-formed
   * the whole time, which is what makes it hard to notice.
   */
  lang?: PickerLang | (() => PickerLang);
}

export interface VoicePicker {
  node: HTMLElement;
  /**
   * Paint again against whatever `voices()` and `current()` now answer.
   *
   * The products call this `draw()`. It is `refresh` here so that the three
   * shared panels in this family hand back one shape.
   */
  refresh: () => void;
  /**
   * Must be called when the picker's container goes.
   *
   * There is nothing subscribed to unsubscribe — unlike `backup-panel` and
   * `metacom-panel`, this module is driven by its two callbacks and owns no
   * listener outside its own node. What it does own is a preview that may still
   * be in flight: a 63 MB model finishing after the sheet was closed would
   * otherwise write a label onto a button in a tree nobody can see. So this is
   * small, and it is still not optional.
   */
  dispose: () => void;
}

/**
 * Every word this picker can say, in one shape per language.
 *
 * Declared rather than inferred, so that a key present in one language and
 * missing from the other does not compile — `backup-panel`'s reason, and it was
 * earned there: mitreden's English arm carried German quotation marks for as
 * long as it existed because nothing compared the two.
 */
interface Words {
  /** The radio group's accessible name. vorlaut-editor's group has none. */
  group: string;
  searchLabel: string;
  /** A placeholder is an example, never the label: it goes when typing starts. */
  searchHint: string;
  anyLanguage: string;
  noMatch: string;
  needsKey: string;
  source: Record<VoiceSource, string>;
  gender: Record<'female' | 'male' | 'mixed', string>;
  rushes: string;
  gone: string;
  hearTitle: string;
  hear: (name: string) => string;
  hearing: (name: string) => string;
}

const WORDS: Record<PickerLang, Words> = {
  de: {
    group: 'Stimme',
    searchLabel: 'Stimme suchen',
    /* wochenwerk's idea — an example of what may be typed — with its example
       generalised. „z. B. Katja" names a voice a catalogue need not hold; these
       two words are printed on the rows themselves, which is also the rule the
       search matches by. */
    searchHint: 'z. B. Azure, weiblich',
    anyLanguage: 'Alle Sprachen',
    noMatch: 'Keine Stimme passt dazu.',
    needsKey: 'Schlüssel nötig',
    source: { piper: 'Mitgeliefert', azure: 'Azure', system: 'Vom Gerät' },
    gender: { female: 'weiblich', male: 'männlich', mixed: 'gemischt' },
    /* mitreden's and vorlaut-editor's sentence, which differ by one word
       („nimmt sie sich Zeit" against „nimmt sie sich mehr Zeit") and by a dash.
       wochenwerk's drops the example. The example stays: „Hallo!" is the fix
       said rather than described, and it is a fix the person typing can apply
       in the field they are already in. */
    rushes: 'Spricht einzelne Wörter sehr kurz. Mit einem Satzzeichen am Ende — Hallo! — '
      + 'nimmt sie sich Zeit.',
    gone: 'hier nicht verfügbar',
    hearTitle: 'Probe hören',
    hear: (name) => `${name} probehören`,
    hearing: (name) => `${name} wird abgespielt`,
  },
  en: {
    group: 'Voice',
    searchLabel: 'Search voices',
    searchHint: 'e.g. Azure, female',
    anyLanguage: 'All languages',
    noMatch: 'No voice matches that.',
    needsKey: 'needs a key',
    source: { piper: 'Bundled', azure: 'Azure', system: 'From this device' },
    gender: { female: 'female', male: 'male', mixed: 'mixed' },
    rushes: 'Speaks single words very briefly. With a punctuation mark at the end — Hello! — '
      + 'the voice takes its time.',
    gone: 'not available here',
    hearTitle: 'Listen',
    hear: (name) => `Hear ${name}`,
    hearing: (name) => `${name} is playing`,
  },
};

/**
 * `63_201_294` → `63 MB`.
 *
 * The same expression as `@lautstark/werkzeuge/bytes`, which is where the
 * family's copy lives and where the argument for whole megabytes is written
 * down. Not imported: this package has exactly one runtime dependency and it is
 * an encoder, and making four products resolve a second shared package to save
 * one line of arithmetic is a version pin nobody asked for. If `weighs` ever
 * stops being one expression, that trade turns around.
 */
const weighs = (bytes: number): string => `${Math.round(bytes / 1e6)} MB`;

/** `de_DE`, `de-DE` and `de` all compare equal at the language. */
const language = (code: string): string =>
  (code || '').toLowerCase().replaceAll('_', '-').split('-')[0]!;

/**
 * What it speaks, named in the language of whoever is reading.
 *
 * Asked twice with two different arguments, deliberately. A row is given the
 * whole tag, so `de-DE` and `de-AT` read as „Deutsch (Deutschland)" and
 * „Deutsch (Österreich)" — two voices that differ only in region are two
 * different answers, and a fact line that calls both „Deutsch" hides the one
 * thing that separates them. A chip is given the bare language, because that is
 * exactly what the chip filters by; a pill saying „Deutsch (Deutschland)" that
 * also matches an Austrian voice would be lying about its own effect. Both
 * products that have this do the same thing and neither says why.
 */
function speaks(code: string, lang: PickerLang): string {
  const tag = (code || '').replaceAll('_', '-');
  if (!tag) return '';
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/**
 * Whose voice it is.
 *
 * Three published values, and a corpus of several speakers is `mixed` rather
 * than a guess. Anything the catalogue adds later is shown as it came, which is
 * honest, rather than as the name of a missing translation — all three products
 * had worked this out and written it in their own margin. A system voice has no
 * gender at all: the Web Speech API publishes a name and a language, and
 * guessing from the name is how somebody is told their voice is a woman because
 * it is called Anna.
 */
function genderOf(gender: string, say: Words): string {
  return gender === 'female' || gender === 'male' || gender === 'mixed'
    ? say.gender[gender] : gender;
}

/**
 * The line that decides between two voices: who renders it, what it speaks,
 * whose voice it is, and what it costs to have.
 *
 * Four facts and no verdict. `recommended` is not among them and must not be:
 * the flag is this package's editorial pick inside its own piper catalogue and
 * is false for every cloud voice, so a badge here would sit on two rows and not
 * on the several hundred an Azure key had just unlocked — and "we have no
 * opinion" and "not as good" look identical from the outside.
 *
 * The language drops out where every voice speaks the same one, which is the
 * same test the chips are drawn on. Exported for the test that holds it, and
 * because the search matches on exactly this string: a list that answers to
 * something invisible looks like it is ignoring what was typed.
 */
export function factsOf(
  voice: Pickable, among: readonly Pickable[], lang: PickerLang = 'de',
): string {
  const say = WORDS[lang];
  const manyLanguages = languagesIn(among).length > 1;
  return [
    say.source[voice.source],
    manyLanguages ? speaks(voice.locale, lang) : '',
    genderOf(voice.gender, say),
    // The download is a shipped voice's one real cost and a cloud voice's is
    // the key, so each row says the one that applies to it and neither says
    // both. A system voice costs neither and says nothing.
    voice.needsKey ? say.needsKey : voice.downloadBytes ? weighs(voice.downloadBytes) : '',
  ].filter(Boolean).join(' · ');
}

/** Every language the catalogue in hand actually holds, sorted for the chips. */
function languagesIn(voices: readonly Pickable[]): string[] {
  return [...new Set(voices.map((voice) => language(voice.locale)))].filter(Boolean).sort();
}

const make = (tag: string, cls?: string, text?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Builds the block.
 *
 * Always a node: unlike `backup-panel`, which answers null where the browser
 * has no directory picker, there is no browser in which a list of voices has
 * nothing to offer. An empty catalogue is a sentence rather than an absence,
 * and what to do about it is the product's — the offer that fixes it is a
 * download, a key, or the operating system, and no two of the three agree about
 * which.
 */
export function voicePicker(options: VoicePickerOptions): VoicePicker {
  const reading = options.lang ?? 'de';
  const langNow = (): PickerLang => (typeof reading === 'function' ? reading() : reading);

  let query = '';
  let onlyLang: string | null = null;
  let dead = false;

  /* Built once and never replaced — only the rows under it are. A field rebuilt
     on every keystroke loses the caret, which is the bug two of the three
     products carry the same note about. Its words are assigned on every paint
     instead, so a language switch reaches them without the node moving. */
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'field';
  search.autocomplete = 'off';
  const caption = make('span', 'lbl');
  /* A wrapping <label>, so the field's accessible name needs no generated id
     and cannot come apart from it. wochenwerk's shape. The visible caption is a
     label and the placeholder is an example: a placeholder used as the label
     leaves the field unnamed the moment somebody types in it. */
  const field = make('label', 'voice-picker__search');
  field.append(caption, search);

  const filters = make('div', 'voice-picker__filters');
  const list = make('div', 'voices');
  list.setAttribute('role', 'radiogroup');

  const node = make('div', 'voice-picker');
  node.append(field, filters, list);

  /**
   * One preview, with the button reporting how far the model has got.
   *
   * Disabled while it runs, so a second press cannot start a second fetch of
   * the same 63 MB. Whole per cent, because it is a number read at a glance.
   */
  async function preview(voice: Pickable, press: HTMLButtonElement, name: string): Promise<void> {
    const idle = press.textContent;
    press.disabled = true;
    press.textContent = '…';
    press.setAttribute('aria-label', WORDS[langNow()].hearing(name));
    try {
      await options.hear?.(voice, (share) => {
        if (dead) return;
        press.textContent = share > 0 && share < 1 ? String(Math.round(share * 100)) : '…';
      });
    } finally {
      // The picker may be gone by now: a model finishing after the sheet closed
      // would otherwise paint a button nobody can see. See `dispose`.
      if (!dead) {
        press.disabled = false;
        press.textContent = idle;
        press.setAttribute('aria-label', WORDS[langNow()].hear(name));
      }
    }
  }

  /**
   * One row: the thing that chooses, and — where a product can play one — the
   * thing that lets it be heard first.
   *
   * A radio, not a pressed button. `aria-pressed` on a set where exactly one is
   * ever on describes toggles that happen to agree; this is one choice with
   * several answers, and a reader should hear "3 of 17" rather than infer the
   * exclusivity from the drawing.
   *
   * `aria-checked` is written as a word in both directions. A radio that is not
   * the answer has to say `false` rather than say nothing — @lautstark/werkzeuge
   * `src/dom.ts` carries the same rule, and names the two call sites in this
   * family that wrote neither state and only looked right because a class
   * beside them was carrying the paint. Nothing here carries that paint: the
   * appearance hangs off the attribute in `components.css`, so what a reader is
   * told and what an eye is shown cannot come apart.
   */
  function row(
    voice: Pickable, live: boolean, name: string, facts: string, notes: readonly string[],
    canHear: boolean,
  ): HTMLElement {
    const say = WORDS[langNow()];
    const wrap = make('div', 'voices__row');

    if (options.hear) {
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'btn quiet voices__play';
      play.textContent = '▶';
      play.title = say.hearTitle;
      play.setAttribute('aria-label', say.hear(name));
      // Drawn and disabled rather than removed, so the row keeps its shape and
      // the act stays visible as one that exists and cannot run right now.
      play.disabled = !canHear;
      play.addEventListener('click', () => void preview(voice, play, name));
      wrap.append(play);
    }

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'voice';
    pick.dataset.id = voice.id;
    pick.setAttribute('role', 'radio');
    pick.setAttribute('aria-checked', String(live));
    // Roving tabindex: with a key the list runs to several hundred, and tabbing
    // through it to reach the settings underneath is not a way out.
    pick.tabIndex = live ? 0 : -1;
    pick.append(make('span', 'voice__name', name), make('span', 'voice__facts', facts));
    for (const note of notes) pick.append(make('span', 'voice__hint', note));
    pick.addEventListener('click', () => options.pick(voice.id));

    wrap.append(pick);
    return wrap;
  }

  /** One pill per language the catalogue holds, plus the way back. */
  function paintFilters(voices: readonly Pickable[], say: Words): void {
    filters.replaceChildren();
    const codes = languagesIn(voices);
    // Nothing to narrow with one language in the list, which is also why a
    // single-language product never has to ask for these to be left out.
    if (codes.length < 2) {
      onlyLang = null;
      return;
    }
    const lang = langNow();
    const pill = (label: string, on: boolean, run: () => void): void => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = label;
      // On the attribute rather than a class: a filter a screen reader cannot
      // hear toggling is not a filter. components.css says the same.
      chip.setAttribute('aria-pressed', String(on));
      chip.addEventListener('click', () => { run(); paint(); });
      filters.append(chip);
    };
    pill(say.anyLanguage, onlyLang === null, () => { onlyLang = null; });
    for (const code of [...codes].sort((a, b) => speaks(a, lang).localeCompare(speaks(b, lang), lang)))
      pill(speaks(code, lang), onlyLang === code, () => { onlyLang = onlyLang === code ? null : code; });
  }

  function paint(): void {
    const lang = langNow();
    const say = WORDS[lang];
    const all = options.voices();
    const live = options.current();

    caption.textContent = say.searchLabel;
    search.placeholder = say.searchHint;
    list.setAttribute('aria-label', say.group);

    paintFilters(all, say);

    /* Two lists, and the difference is deliberate. A row is named against the
       whole catalogue, because `labelOf` drops the tier as soon as the twin
       that made the name ambiguous is gone — so matching against what is drawn
       would make „Thorsten (high)" unfindable by typing „high". Against the
       full list every name that can ever appear is reachable, which is the
       direction to be wrong in. */
    const hits = all.filter((voice) => {
      if (onlyLang && language(voice.locale) !== onlyLang) return false;
      if (!query) return true;
      return `${labelOf(voice, all)} ${factsOf(voice, all, lang)}`.toLowerCase().includes(query);
    });

    const rows = hits.map((voice) => row(
      voice, voice.id === live, labelOf(voice, all), factsOf(voice, all, lang),
      [
        ...(voice.rushesFragments ? [say.rushes] : []),
        ...(options.notes?.(voice) ?? []),
      ],
      true,
    ));

    if (!rows.length) rows.push(make('p', 'voices__none', say.noMatch));

    /* A voice can be chosen and not be here: a key withdrawn, a model deleted,
       a layout carried over from another machine. It stays chosen on purpose,
       so it has to be visible — otherwise the list shows nothing ticked and the
       next save quietly drops a decision somebody made. Its preview is disabled
       rather than removed: there is nothing to listen to, and a button that is
       not there says nothing where a disabled one says the act exists. */
    if (live && !all.some((voice) => voice.id === live)) {
      const absent: Pickable = {
        id: live, name: options.chosenName?.() || live, locale: '', gender: '',
        source: 'piper', downloadBytes: 0, needsKey: false,
      };
      rows.push(row(absent, true, absent.name, say.gone, [], false));
    }

    /* Where the keyboard was standing, so that it is still standing there after
       every row has been replaced.
     *
     * This is a defect all three products share and none of them can see from
     * the inside, because in all three the repaint is somebody else's: an arrow
     * key moves the choice, choosing calls back into the product, the product
     * redraws, and the row that had focus is a detached node — so focus lands
     * on the document and the *second* arrow key does nothing at all. Arrows
     * that work exactly once look like arrows that work.
     *
     * It is fixed here rather than in three places because this module now owns
     * both halves for the first time: it reads the key and it paints the list.
     * Restored only when the focus was inside this list — a repaint while
     * somebody is typing in the search field above must not pull them out of
     * it. */
    const wasIn = list.contains(document.activeElement);
    const standing = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.voices__row');
    const at = standing?.querySelector<HTMLElement>('.voice')?.dataset.id;
    const onPlay = (document.activeElement as HTMLElement | null)?.classList.contains('voices__play');

    list.replaceChildren(...rows);

    /* Nothing is chosen on a first run, and narrowing can hide the one that is:
       a group the keyboard cannot enter at all is worse than one whose entry
       point is not the answer. */
    if (!list.querySelector('.voice[tabindex="0"]'))
      list.querySelector<HTMLElement>('.voice')?.setAttribute('tabindex', '0');

    if (wasIn) {
      const row = at
        ? list.querySelector<HTMLElement>(`.voice[data-id="${CSS.escape(at)}"]`)
        : null;
      // The row it was on if that row is still drawn; otherwise the way back
      // in, which is the same one a first paint offers.
      const back = row ?? list.querySelector<HTMLElement>('.voice[tabindex="0"]');
      const wrap = back?.closest('.voices__row');
      (onPlay ? wrap?.querySelector<HTMLElement>('.voices__play') : back)?.focus();
    }
  }

  /** Arrow keys move the choice, as they do in any radio group. */
  function step(event: KeyboardEvent): void {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const rows = [...list.querySelectorAll<HTMLElement>('.voice')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || !rows.length) return;
    event.preventDefault();
    const to = event.key === 'Home' ? 0
      : event.key === 'End' ? rows.length - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? (at + 1) % rows.length
          : (at - 1 + rows.length) % rows.length;
    const next = rows[to]!;
    next.focus();
    options.pick(next.dataset.id ?? '');
  }

  search.addEventListener('input', () => {
    query = search.value.trim().toLowerCase();
    paint();
  });
  list.addEventListener('keydown', (event) => step(event as KeyboardEvent));

  paint();
  return { node, refresh: paint, dispose: () => { dead = true; } };
}
