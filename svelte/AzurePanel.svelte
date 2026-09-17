<script module lang="ts">
  /**
   * Azure's own region names.
   *
   * A `<datalist>` suggests rather than restricts, so a region newer than this
   * file still works when it is typed — and the region is what a rejected key
   * usually turns out to be. All three products carry this list, character for
   * character and in the same order; this is the one copy.
   */
  export const AZURE_REGIONS = [
    'westeurope', 'northeurope', 'germanywestcentral', 'switzerlandnorth',
    'francecentral', 'uksouth', 'swedencentral', 'norwayeast', 'eastus', 'eastus2',
    'westus', 'westus2', 'westus3', 'centralus', 'southcentralus', 'canadacentral',
    'brazilsouth', 'australiaeast', 'southeastasia', 'eastasia', 'japaneast',
    'japanwest', 'koreacentral', 'centralindia', 'southafricanorth', 'uaenorth',
  ];

  /** Where the field lands when nothing else says. All three products' default. */
  export const DEFAULT_REGION = 'westeurope';

  /** A key and the region it belongs to. `key` absent means "the stored one
   *  stands" — which is what an untouched field means, and what vorlaut's
   *  editor, whose key lives on a machine it cannot read back, always sends. */
  export interface AzureAccess {
    key?: string;
    region: string;
  }

  /**
   * How Azure answered.
   *
   * Shaped after the three products' own, which are character-identical: a
   * region name that is not one is a hostname that never resolves, so the fetch
   * dies as a `TypeError` before any status exists, while a live region with a
   * wrong key answers 401 and `speak.ts` relays Azure's refusal as a sentence.
   * `words` is Azure's own message and is handed on rather than dropped — see
   * `words.failed`.
   */
  export type AzureAnswer =
    | { ok: true; count: number }
    | { ok: false; code: 'unreachable' | 'refused' | 'failed'; words: string };

  /**
   * Every sentence this panel can say, all of them the product's.
   *
   * conventions.md §6.0: a shared component carries no German. The voice picker
   * beside it is the exception that rule names — fixed furniture carrying its
   * own words in both languages — and this panel is not: three products have
   * three sets of these strings already, two of them behind a `t()` that
   * changes language without reloading, and §6.9 requires the plural formatter
   * to come in from outside, which is only meaningful if the words do too. So
   * `lang` is not a prop here; the language arrives with the words, and a
   * product whose `t()` is reactive gets a new object when its reader switches.
   */
  export interface AzureWords {
    /** The key field's label. */
    key: string;
    /** The region field's label. */
    region: string;
    /** Under the region field. Where to find it in the Azure portal, usually. */
    regionHint?: string;
    save: string;
    /** On the save button while the probe is out. A button that does nothing
     *  visible for two seconds is a button somebody presses again. */
    saving: string;
    forget: string;
    /** On the probe line while the first probe is out. */
    asking: string;
    /** Nothing typed and nothing stored. */
    typeFirst: string;
    /** §6.9: the plural formatter, because the count is a number this panel
     *  has and only the product can put into its own language's plural. */
    answers: (count: number) => string;
    /** Said through `announce` after a save that Azure agreed to. */
    saved: (count: number) => string;
    /** The region did not resolve. */
    unreachable: string;
    /** Azure refused the key, on the probe line. */
    refused: string;
    /** Azure refused it at the moment of saving. mitreden's is longer than the
     *  line above on purpose: a key belongs to one region, and the wrong
     *  pairing answers exactly the same 401 as a wrong key, so saying which is
     *  more use than repeating Azure. Falls back to `refused`. */
    refusedOnSave?: string;
    /**
     * Azure answered with something else, and this is where its own message
     * arrives.
     *
     * §6.9: the probe is injected rather than owned, and a codes-only seam
     * would silently delete Azure's message — mitreden prints it. A product
     * that does not want it ignores the argument.
     */
    failed: (words: string) => string;
  }
</script>

<script lang="ts">
  /**
   * The Azure key, and whether Microsoft answers for it. conventions.md §6.9.
   *
   * Three consumers, not two: wochenwerk's „Sprachdienst" panel, mitreden's
   * „Azure Speech", and vorlaut-editor's — what the editor reads from a server
   * environment variable is the *firmware's* key, in the vendored talker
   * repository, and it is the same panel. It lives here because stimmquelle
   * owns Azure as a backend.
   *
   * ## The placeholder holds the key, and that is the whole design
   *
   * The stored key sits in the placeholder, never in the value: a value can be
   * revealed or resubmitted and a placeholder cannot. Three consequences, and
   * all three are required rather than incidental —
   *
   * - **the field starts empty on every draw**, which is the `$effect` below;
   * - **the save reads `typed || stored`**, so an untouched field keeps the key
   *   it shows. `stored` is a thunk read at save time rather than a value held
   *   here, because two products read the secret back out of their own database
   *   and the third cannot read it at all;
   * - **removal is its own button**, because clearing the field cannot mean it.
   *   Until vorlaut grew that button there was no way to remove a key at all.
   *
   * ## The probe is injected, not owned
   *
   * The panel takes a probe and renders what it returns. It does not own one:
   * mitreden has exactly one regex for Azure's refusal and it lives in `core`,
   * where the picker's own catalogue call shares it, and a panel that brought a
   * second would be duplicating a function that product already has. What the
   * panel owns is *when* — on arrival, and again before a save is written, so a
   * typo is a sentence now rather than a failed recording later.
   *
   * It is asked once per key-and-region and deliberately not on every act: this
   * panel holds a field somebody is typing into.
   *
   * ## What is the product's, and stays the product's
   *
   * mitreden's comment records the invariant the bare class names in its own
   * markup live under — they are hooks for its suite, and none of them may be a
   * name `components.css` owns. That inverts the moment a package starts
   * emitting them. So **the ids are props and the hook classes stay the
   * product's**: this panel emits only names `components.css` draws, and every
   * element a suite currently reaches by name takes an id.
   *
   * For the same reason the extra notice is a snippet. mitreden draws
   * `.notice.bad.warn` there, which is a product rule, and §6.0 forbids the
   * package emitting one. `children` is the explanatory prose beside it, also
   * the product's — three products say three different things about what a key
   * costs and where it goes.
   *
   * vorlaut's `local` gate does not come in: it is a vestige of a Python backend
   * that no longer exists.
   */
  import { onDestroy, type Snippet } from 'svelte';

  let {
    id,
    fieldId,
    regionId,
    hintId,
    saveId,
    forgetId,
    probeId,
    hasKey,
    placeholder = '',
    region,
    stored,
    probe,
    save,
    forget,
    words,
    warning,
    announce,
    children,
  }: {
    /** §6.0: every shared component takes an `id`. */
    id?: string;
    /** The key field's id. Paired with its `<label for>`, and the handle a
     *  suite reaches the field through. */
    fieldId?: string;
    regionId?: string;
    /**
     * The region hint's id — the paragraph `words.regionHint` fills.
     *
     * §6.9 gave the five props above and skipped this one, which left the only
     * way to the line an expression about markup order: mitreden reached it as
     * `#cloud > datalist + p`, which stops resolving the first time anything is
     * inserted between the two. A promised name instead, like its siblings.
     */
    hintId?: string;
    saveId?: string;
    forgetId?: string;
    /** The live region's id. mitreden's baselines mask by id. */
    probeId?: string;
    /**
     * Whether a key is stored. Drives the placeholder's meaning and the forget
     * button's `hidden`, and it is what the panel knows instead of the secret.
     */
    hasKey: boolean;
    /**
     * What the empty field shows. The four characters the stored key ends in
     * behind enough dots to read as a secret, or whatever a product says where
     * it cannot see even that much.
     */
    placeholder?: string;
    /** The stored region. Seeds the field, and re-seeds it when it moves. */
    region?: string;
    /**
     * The stored key, read at save time.
     *
     * Absent where the key is not this page's to read — vorlaut's lives on the
     * machine the editor talks to — and then an untouched field sends no key at
     * all, which is exactly that product's rule.
     */
    stored?: () => string | undefined | Promise<string | undefined>;
    /** Whether Azure answers. Injected; see the header. */
    probe?: (access: AzureAccess) => Promise<AzureAnswer>;
    /** Write it. `key` absent means the stored one stands. */
    save: (next: AzureAccess) => void | Promise<void>;
    /** Drop the stored key. Its own act, and the only one that can mean it. */
    forget: () => void | Promise<void>;
    words: AzureWords;
    /**
     * Anything else this product has to say beside the fields, drawn between
     * the prose and the key field. mitreden's is a `.notice.bad.warn`, which is
     * a product rule this package must not emit.
     */
    warning?: Snippet;
    /**
     * Where the panel's own sentences go besides the probe line — a page status
     * line, a toast. The panel says the same words in both places; a product
     * with nowhere to put them passes nothing.
     */
    announce?: (said: string) => void;
    /** The prose above the fields. The product's: three of them say three
     *  different things about what a key costs and where it goes. */
    children?: Snippet;
  } = $props();

  /* The datalist needs an id for the field's `list` to point at, and it is not
     one a suite ever names — so it is generated rather than asked for, which
     also means two panels on one page cannot collide. */
  const uid = $props.id();
  const regionsId = `${uid}-regions`;

  /** What the field holds. Empty on every draw; see the header. */
  let typed = $state('');
  /** What the region field holds — seeded from the prop, not emptied.
   *
   * The initial value on purpose, which is what the compiler asks about here: a
   * field somebody types into cannot be a `$derived` of the stored region, or
   * the first keystroke would be overwritten by the database. Re-seeding is the
   * `$effect` below, and only when the stored region actually moves. */
  // svelte-ignore state_referenced_locally
  let where = $state(region ?? DEFAULT_REGION);
  /** The live region's text. Emptied rather than hidden. */
  let line = $state('');
  let checking = $state(false);

  /* A probe may still be out when the sheet closes. §6.8: a component that can
     be unmounted mid-flight is a different proposition from a node a page
     kept. */
  let dead = false;
  onDestroy(() => { dead = true; });

  /** Which key-and-region the panel has already drawn itself for. */
  let drawn: string | null = null;

  /* A draw is a new key or a new region, and neither is a keystroke. Everything
     that has to be true "on every draw" is here, in one place, so that the
     three consequences in the header cannot come apart: the field is emptied,
     the region field is re-seeded, and the probe is asked once. */
  $effect(() => {
    const at = `${hasKey} ${region ?? ''}`;
    if (drawn === at) return;
    drawn = at;
    typed = '';
    where = region ?? DEFAULT_REGION;
    if (!hasKey) {
      line = '';
      return;
    }
    if (!probe) return;
    const ask = probe;
    void (async () => {
      line = words.asking;
      const answer = await ask({ key: await stored?.(), region: region ?? DEFAULT_REGION });
      if (!dead) line = sentence(answer);
    })();
  });

  /** A refusal put into words. `saving` picks the longer sentence where the
   *  product has one, because a save is the moment the pairing is being made. */
  function sentence(answer: AzureAnswer, saving = false): string {
    if (answer.ok) return words.answers(answer.count);
    if (answer.code === 'unreachable') return words.unreachable;
    if (answer.code === 'refused') return (saving && words.refusedOnSave) || words.refused;
    return words.failed(answer.words);
  }

  function say(said: string): void {
    line = said;
    announce?.(said);
  }

  /**
   * Checked before it is stored, so a typo is a sentence now rather than a
   * failed recording later.
   */
  async function keep(): Promise<void> {
    const entered = typed.trim();
    // An untouched field must not mean „kein Schlüssel": a save that only moves
    // the region keeps the key it already has.
    const secret = entered || (await stored?.()) || undefined;
    if (!secret && !hasKey) {
      say(words.typeFirst);
      return;
    }
    const at = where.trim() || DEFAULT_REGION;
    checking = true;
    try {
      // Nothing to probe with where the key is not this page's to read; that
      // product asks its own machine afterwards.
      const answer = probe && secret ? await probe({ key: secret, region: at }) : undefined;
      if (answer && !answer.ok) {
        say(sentence(answer, true));
        return;
      }
      await save({ key: secret, region: at });
      typed = '';
      // Already answered, so neither the line nor the product asks again.
      if (answer?.ok) {
        line = words.answers(answer.count);
        announce?.(words.saved(answer.count));
      }
    } catch (error) {
      say(words.failed(error instanceof Error ? error.message : String(error)));
    } finally {
      checking = false;
    }
  }

  async function drop(): Promise<void> {
    await forget();
    line = '';
  }
</script>

<div {id}>
  <!-- The probe line is a live region and it is never hidden — §3.8 names
       `[hidden]` as one of the two ways to get silence, because the element
       leaves the accessibility tree and comes back carrying its next message.
       What is emptied is the text. The `{#if}` is what keeps that true: a bound
       expression that is currently the empty string is still a child, and only
       a genuinely childless element is `:empty`. -->
  <p id={probeId} role="status">{#if line}{line}{/if}</p>
  {@render children?.()}
  {@render warning?.()}
  <label for={fieldId}>{words.key}</label>
  <input id={fieldId} class="field" type="password" autocomplete="off"
    {placeholder} bind:value={typed} />
  <label for={regionId}>{words.region}</label>
  <input id={regionId} class="field" type="text" list={regionsId}
    spellcheck="false" bind:value={where} />
  <datalist id={regionsId}
    >{#each AZURE_REGIONS as name (name)}<option value={name}></option>{/each}</datalist
  >
  {#if words.regionHint}<p id={hintId}>{words.regionHint}</p>{/if}
  <div class="acts">
    <button id={saveId} class="btn primary" type="button" disabled={checking}
      onclick={() => void keep()}>{checking ? words.saving : words.save}</button>
    <!-- §6.8: blocked is drawn, not removed. `hidden` rather than an `{#if}`,
         so the row keeps its shape and nothing moves under the pointer when a
         key arrives or goes. -->
    <button id={forgetId} class="btn quiet" type="button" hidden={!hasKey}
      onclick={() => void drop()}>{words.forget}</button>
  </div>
</div>

<style>
  /* The component's own arrangement, which travels with it by construction —
     §4.12 and §6.0. One rule, and it is the half of the probe line that markup
     cannot carry: an empty live region must take no room, or a panel with no
     key stored has a blank line in it where a sentence will later be.

     Nothing here is a name the products already speak. The line's own class is
     the product's — mitreden draws `.hint.probe` on it — and this selector
     cannot collide with one, which is also what keeps §6.0's rule about source
     order irrelevant here: it beats nothing, because no product rule sets a
     margin on an empty status line. */
  p[role='status']:empty {
    margin: 0;
  }
</style>
