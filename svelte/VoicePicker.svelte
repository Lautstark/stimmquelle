<script lang="ts">
  /**
   * The list a voice is chosen from, declared. conventions.md §6.8.
   *
   * The twin of `src/voice-picker.ts`, beside it and not instead of it: same
   * options, same emitted markup, same words, same `WORDS` — literally the same
   * table, which is what `src/picker-words.ts` exists for. The vanilla version
   * stays until no consumer is left, and mitreden's `ui/pieces/VoicePicker.svelte`
   * shows what a host currently pays to drive it: a `Vanilla`, an `$effect` that
   * reads three things to sign the picker up for them, and an `onDestroy`.
   *
   * ## What the framework takes over, and what it must not
   *
   * The repaint is the framework's now, and one measured behaviour comes free.
   * `voice-picker.ts` ends with twenty lines that remember which row the
   * keyboard was standing on, because its `paint()` replaces every row and the
   * focused one becomes a detached node — the defect that makes arrow keys in
   * all three products work exactly once. A keyed `{#each}` does not replace the
   * rows at all: the same buttons stay, their `tabindex` and `aria-checked`
   * change, and focus never leaves. So that block is absent here rather than
   * ported, and this comment is why.
   *
   * Everything else is kept deliberately, because each of them was a defect in
   * at least one product:
   *
   * - **The search field is built once and never replaced.** In markup that is
   *   what an `<input>` outside every block already is, and `bind:value` writes
   *   only when the value differs — so the caret survives, which is the bug two
   *   of the three products carry the same note about.
   * - **Arrow keys move the answer, not only the focus.** It is a radio group;
   *   a group whose arrows move a focus ring without moving the choice is a
   *   listbox wearing the wrong role.
   * - **The roving `tabindex`, with a fallback row.** With an Azure key the list
   *   runs to several hundred, and tabbing through it to reach the settings
   *   underneath is not a way out. Nothing is chosen on a first run and
   *   narrowing can hide the one that is, so the entry point falls to the first
   *   row rather than to nothing.
   * - **`aria-checked` in both directions.** `aria-checked={live}` and not a
   *   ternary: §6.0 measured that Svelte's `set_attribute` removes only on
   *   `null`, so `false` reaches the DOM as the word. The appearance hangs off
   *   the attribute in `components.css`, so what a reader is told and what an
   *   eye is shown cannot come apart.
   * - **The chips only where the catalogue holds two languages**, and the
   *   `.voice-picker__filters` box drawn either way, because
   *   `.voice-picker__filters:empty` is what stops an empty one from spending
   *   the grid gap.
   * - **The `▶` only where a `hear` hook is passed, and the row wrapper drawn
   *   either way**, so the day a page grows a sample player nothing else moves.
   *   That row wrapper is also where `svelte/PlayButton.svelte` will sit.
   * - **No `.small`, `.muted` or `.faint`.** `components.css` has drawn all
   *   three since design v1.32.0, so this is no longer "markup nothing draws" —
   *   it is the rest of the rule, which is that the facts line and the hint line
   *   carry their size and colour on their own class in two of the three
   *   products and must not gain a second spelling here.
   *
   * ## What stays with the product
   *
   * Unchanged from the vanilla module, and its header holds the reading behind
   * each: where the voices come from, what a preview is spoken with, the second
   * language control beside it, and what else a row has to say. `notes()` is the
   * hook for the last of those.
   */
  import { onDestroy } from 'svelte';
  /* A component imports what a consumer imports: `dist`, never `../src/`.
     2.11.0 shipped these three lines reading `../src/list.js` and
     `../src/picker-words.js`, and a consumer compiling this file resolved them
     to the TypeScript beside the JavaScript it had already imported. mitreden
     measured what that costs — `vite build --sourcemap` listing both
     `stimmquelle/dist/browser/index.js` and `stimmquelle/src/list.ts` as
     modules of one bundle, so every consumer shipped two compiled copies of
     these tables and functions. Nothing misbehaved at runtime, which is why it
     survived a release: they are pure functions and a words table.

     The second cost is not in the bundle. A `../src/` specifier pulls this
     package's source into the *consumer's* type program, and with it everything
     beside it — `list.ts` reaches `speak.ts` reaches `synthesize.ts`, whose
     `0n` made wochenwerk's typecheck fail with „BigInt literals are not
     available when targeting lower than ES2020" and pushed that product's
     `target` up from ES2017. A packaging defect that can move a consumer's
     `tsconfig` is not a tidiness problem.

     `picker-words` is *not* a public entry and does not become one: nothing a
     consumer holds comes from it. `Pickable`, `PickerLang` and `factsOf` are
     the three names it declares that a consumer does hold, and they have always
     had a door — `voice-picker.ts` re-exports them, so this file takes them
     from `@lautstark/stimmquelle/voice-picker`'s build and the nominal identity
     is the consumer's own. `WORDS`, `speaks`, `language` and `languagesIn` stay
     internal; they come from the compiled module rather than the source only so
     that neither cost above has a way back in. */
  import { labelOf } from '../dist/index.js';
  import { factsOf, type Pickable, type PickerLang } from '../dist/voice-picker.js';
  import { language, languagesIn, speaks, WORDS } from '../dist/picker-words.js';

  let {
    voices,
    current,
    pick,
    hear,
    notes,
    chosenName,
    lang = 'de',
    id,
  }: {
    /** The catalogue, read on every paint rather than passed once — a key
     *  entered in the meantime, a model that has arrived, a different Sammlung
     *  on screen. Reading a rune in here is what subscribes this to it. */
    voices: () => readonly Pickable[];
    /** Which one is ticked, read on every paint for `voices()`'s reason. */
    current: () => string | undefined;
    pick: (id: string) => void;
    /**
     * Speak a sample in this voice, reporting how far a download has got.
     *
     * Omitted, no preview button is drawn: mitreden has nothing to play a
     * sample through. Everything it reports it reports itself — nothing is
     * thrown back here, because a failure belongs in whatever this product says
     * out loud.
     */
    hear?: (voice: Pickable, onProgress: (share: number) => void) => Promise<void>;
    /**
     * Anything else this product has to say about a row, under the facts.
     *
     * For the catalogue facts whose *weight* is a product's own, never for
     * restating one this component already says.
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
     * A value, or a function. §6.8: `lang` is a prop and reactivity is the
     * framework's, which removes the asymmetry where three panels read it per
     * paint and one resolved it once.
     */
    lang?: PickerLang | (() => PickerLang);
    /** §6.0: every shared component takes an `id`. The suites are built on
     *  them — mitreden's visual baselines mask by id. */
    id?: string;
  } = $props();

  const langNow = $derived(typeof lang === 'function' ? lang() : lang);
  const say = $derived(WORDS[langNow]);

  /** What is in the search field, and what the rows are matched against. */
  let typed = $state('');
  const query = $derived(typed.trim().toLowerCase());

  /** Which language chip is pressed, if the catalogue has chips at all. */
  let chip = $state<string | null>(null);

  let list: HTMLElement;

  const all = $derived(voices());
  const live = $derived(current());
  const codes = $derived(languagesIn(all));
  /* Nothing to narrow with one language in the list, which is also why a
     single-language product never has to ask for the chips to be left out. The
     answer is derived rather than written back, so a catalogue that arrives
     with one language and then grows a second does not need a repaint to agree
     with itself. */
  const only = $derived(codes.length < 2 ? null : chip);
  const ordered = $derived(
    [...codes].sort((a, b) => speaks(a, langNow).localeCompare(speaks(b, langNow), langNow)),
  );

  interface Drawn {
    voice: Pickable;
    live: boolean;
    name: string;
    facts: string;
    notes: readonly string[];
    /** Drawn and disabled rather than removed, so the row keeps its shape and
     *  the act stays visible as one that exists and cannot run right now. */
    canHear: boolean;
  }

  const rows: Drawn[] = $derived.by(() => {
    /* Two lists, and the difference is deliberate. A row is named against the
       whole catalogue, because `labelOf` drops the tier as soon as the twin
       that made the name ambiguous is gone — so matching against what is drawn
       would make „Thorsten (high)" unfindable by typing „high". */
    const hits = all.filter((voice) => {
      if (only && language(voice.locale) !== only) return false;
      if (!query) return true;
      return `${labelOf(voice, all)} ${factsOf(voice, all, langNow)}`.toLowerCase()
        .includes(query);
    });

    const drawn: Drawn[] = hits.map((voice) => ({
      voice,
      live: voice.id === live,
      name: labelOf(voice, all),
      facts: factsOf(voice, all, langNow),
      notes: [
        ...(voice.rushesFragments ? [say.rushes] : []),
        ...(notes?.(voice) ?? []),
      ],
      canHear: true,
    }));

    /* A voice can be chosen and not be here: a key withdrawn, a model deleted,
       a layout carried over from another machine. It stays chosen on purpose,
       so it has to be visible — otherwise the list shows nothing ticked and the
       next save quietly drops a decision somebody made. Its preview is disabled
       rather than removed: there is nothing to listen to, and a button that is
       not there says nothing where a disabled one says the act exists. */
    if (live && !all.some((voice) => voice.id === live)) {
      const absent: Pickable = {
        id: live, name: chosenName?.() || live, locale: '', gender: '',
        source: 'piper', downloadBytes: 0, needsKey: false,
      };
      drawn.push({
        voice: absent, live: true, name: absent.name, facts: say.gone, notes: [],
        canHear: false,
      });
    }
    return drawn;
  });

  /* The one row the Tab key can land on. The answer where the answer is drawn,
     and otherwise the first row: a group the keyboard cannot enter at all is
     worse than one whose entry point is not the answer. */
  const entry = $derived(rows.find((row) => row.live)?.voice.id ?? rows[0]?.voice.id);

  /**
   * One preview at a time, with the button reporting how far the model has got.
   *
   * Disabled while it runs, so a second press cannot start a second fetch of
   * the same 63 MB. Whole per cent, because it is a number read at a glance —
   * and unlike `PlayButton`, whose face deliberately never changes, this one is
   * the only thing on screen that can say a 63 MB download is happening.
   */
  let playing = $state<string | null>(null);
  let share = $state(0);

  /* A preview may still be in flight when the sheet closes: a model finishing
     after the component went would otherwise write into state nobody is
     reading. §6.8 — a component that can be unmounted mid-flight is a different
     proposition from a node a page kept. */
  let dead = false;
  onDestroy(() => { dead = true; });

  async function preview(voice: Pickable): Promise<void> {
    playing = voice.id;
    share = 0;
    try {
      await hear?.(voice, (reached) => {
        if (!dead) share = reached;
      });
    } finally {
      if (!dead) {
        playing = null;
        share = 0;
      }
    }
  }

  /** What the preview button says. `…` until there is a share worth printing. */
  const glyph = (row: Drawn): string => (playing !== row.voice.id ? '▶'
    : share > 0 && share < 1 ? String(Math.round(share * 100)) : '…');

  /** Arrow keys move the choice, as they do in any radio group. */
  function step(event: KeyboardEvent): void {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const here = [...list.querySelectorAll<HTMLElement>('.voice')];
    const at = here.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || !here.length) return;
    event.preventDefault();
    const to = event.key === 'Home' ? 0
      : event.key === 'End' ? here.length - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? (at + 1) % here.length
          : (at - 1 + here.length) % here.length;
    const next = here[to]!;
    next.focus();
    pick(next.dataset.id ?? '');
  }
</script>

<div {id} class="voice-picker"
  ><!-- A wrapping <label>, so the field's accessible name needs no generated id
        and cannot come apart from it. The visible caption is a label and the
        placeholder is an example: a placeholder used as the label leaves the
        field unnamed the moment somebody types in it. -->
  <label class="voice-picker__search"
    ><span class="lbl">{say.searchLabel}</span
    ><input class="field" type="search" autocomplete="off"
      placeholder={say.searchHint} bind:value={typed} /></label
  ><!-- Drawn whether or not it holds chips: `.voice-picker__filters:empty` is
        what keeps an empty one from spending the grid gap, and it can only do
        that if the box is there and has no whitespace in it. -->
  <div class="voice-picker__filters"
    >{#if codes.length > 1}<button class="chip" type="button"
        aria-pressed={only === null} onclick={() => { chip = null; }}
        >{say.anyLanguage}</button
      >{#each ordered as code (code)}<button class="chip" type="button"
          aria-pressed={only === code}
          onclick={() => { chip = chip === code ? null : code; }}
          >{speaks(code, langNow)}</button
        >{/each}{/if}</div
  >
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- The group is deliberately not a tab stop. A radio group is entered on the
       radio that is the answer and moved through with the arrow keys — that is
       what the roving `tabindex` below is — and a `tabindex` here would add a
       second stop in front of it, which is the thing the roving one exists to
       remove. The vanilla module emits none either, and „same emitted markup"
       is not a slogan here: the test next door compares the two node for
       node. -->
  <div class="voices" role="radiogroup" aria-label={say.group}
    bind:this={list} onkeydown={step}
    >{#each rows as row (row.voice.id)}<div class="voices__row"
        >{#if hear}<button class="btn quiet voices__play" type="button"
            title={say.hearTitle}
            aria-label={playing === row.voice.id ? say.hearing(row.name) : say.hear(row.name)}
            disabled={!row.canHear || playing === row.voice.id}
            onclick={() => void preview(row.voice)}>{glyph(row)}</button
          >{/if}<button class="voice" type="button" data-id={row.voice.id}
          role="radio" aria-checked={row.live}
          tabindex={row.voice.id === entry ? 0 : -1}
          onclick={() => pick(row.voice.id)}
          ><span class="voice__name">{row.name}</span
          ><span class="voice__facts">{row.facts}</span
          >{#each row.notes as note, index (index)}<span class="voice__hint"
              >{note}</span
            >{/each}</button
        ></div
      >{:else}<p class="voices__none">{say.noMatch}</p>{/each}</div
  >
</div>
