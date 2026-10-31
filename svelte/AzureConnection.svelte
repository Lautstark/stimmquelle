<script module lang="ts">
  import type { AzureWords } from './AzurePanel.svelte';

  /**
   * The connection's words on top of the form's. The product's, for
   * `AzurePanel`'s reason: three products already have their own and two of
   * them change language without reloading.
   */
  export interface AzureConnectionWords extends AzureWords {
    /** What this is, in the reader's words. „Stimmen von Microsoft Azure". */
    title: string;
    /** The state beside the title. */
    off: string;
    on: string;
    asking: string;
    refusedState: string;
    /** Under the title. */
    offNote: string;
    onNote: (hint: string, region: string) => string;
    refusedNote: string;
    /** The one button under the box, for each state. */
    connect: string;
    change: string;
    check: string;
  }
</script>

<script lang="ts">
  /**
   * Azure as a connection that is either there or not.
   *
   * bildhaft's settings had „Stimme" and „Azure Speech" as two panels, and the
   * second was a key field and a region field with no word for what they were
   * for. This is the box under the voice list instead: what it is („Stimmen
   * von Microsoft Azure"), whether it is connected, and one button. The button
   * unfolds `AzurePanel`, so the key and the region are entered together and
   * changed together, with a cancel beside the save.
   *
   * The box is design's `.where`, with the dot in the three colours
   * components.css gives it: `ready` (accent) for a key Azure answers to,
   * `.bad` (danger) for one it refuses, and anything else faint — nothing
   * stored, or the first probe still out.
   *
   * The probe is the product's, as in `AzurePanel`, and it is asked once per
   * key and region, here, to know which of the three to draw. The form asks
   * again when it is opened, which is the moment somebody wants to see it.
   */
  import type { Snippet } from 'svelte';
  import AzurePanel, { type AzureAccess, type AzureAnswer } from './AzurePanel.svelte';

  let {
    id,
    formId,
    fieldId,
    regionId,
    saveId,
    forgetId,
    probeId,
    hasKey,
    hint = '',
    region,
    regionName = (code: string) => code,
    stored,
    probe,
    save,
    forget,
    words,
    announce,
    changed,
    children,
  }: {
    id?: string;
    /** The form's id, and the ids of its parts — `AzurePanel`'s. */
    formId?: string;
    fieldId?: string;
    regionId?: string;
    saveId?: string;
    forgetId?: string;
    probeId?: string;
    hasKey: boolean;
    /** The last four characters of the stored key, or nothing. */
    hint?: string;
    region?: string;
    /** How a region code reads to a person, e.g. `germanywestcentral` →
     *  „Frankfurt". The code itself where nothing is passed. */
    regionName?: (code: string) => string;
    stored?: () => string | undefined | Promise<string | undefined>;
    probe?: (access: AzureAccess) => Promise<AzureAnswer>;
    save: (next: AzureAccess) => void | Promise<void>;
    forget: () => void | Promise<void>;
    words: AzureConnectionWords;
    announce?: (said: string) => void;
    /** Told the box's state whenever it changes, for a heading. */
    changed?: (state: 'off' | 'asking' | 'on' | 'refused') => void;
    /** The prose over the fields while connecting for the first time: what
     *  Azure costs and where the words go. The product's. */
    children?: Snippet;
  } = $props();

  let open = $state(false);
  let answer = $state.raw<AzureAnswer | null>(null);

  /* Asked once per key-and-region, and only the newest answer may land. */
  let asked = 0;
  $effect(() => {
    const at = `${hasKey}\u0000${region ?? ''}`;
    void at;
    const mine = ++asked;
    answer = null;
    if (!hasKey || !probe) return;
    const ask = probe;
    void (async () => {
      let said: AzureAnswer;
      try {
        said = await ask({ key: await stored?.(), region: region ?? '' });
      } catch (error) {
        said = { ok: false, code: 'failed', words: error instanceof Error ? error.message : String(error) };
      }
      if (mine === asked) answer = said;
    })();
  });

  const phase = $derived<'off' | 'asking' | 'on' | 'refused'>(
    !hasKey ? 'off'
    : answer === null ? (probe ? 'asking' : 'on')
    : answer.ok ? 'on' : 'refused',
  );
  $effect(() => { changed?.(phase); });

  const where = $derived(regionName(region ?? ''));
</script>

<div {id} class="where-panel">
  <div class="where{phase === 'refused' ? ' bad' : ''}"
    data-state={phase === 'on' ? 'ready' : phase === 'asking' ? 'loading' : phase === 'refused' ? 'failed' : 'off'}>
    <b><span class="dot"></span>{words.title} · {phase === 'off' ? words.off
      : phase === 'asking' ? words.asking : phase === 'on' ? words.on : words.refusedState}</b>
    <span class="small faint">{phase === 'off' ? words.offNote
      : phase === 'refused' ? words.refusedNote : words.onNote(hint, where)}</span>
  </div>
  {#if open}
    <AzurePanel id={formId} {fieldId} {regionId} {saveId} {forgetId} {probeId}
      {hasKey} placeholder={hasKey && hint ? `••••${hint}` : ''} {region} {stored} {probe}
      save={async (next) => { await save(next); open = false; }}
      forget={async () => { await forget(); open = false; }}
      cancel={() => { open = false; }}
      {words} {announce}>{#if !hasKey}{@render children?.()}{/if}</AzurePanel>
  {:else}
    <div class="acts">
      <button type="button" class="btn sm{phase === 'refused' ? ' primary' : ''}"
        onclick={() => { open = true; }}>{phase === 'off' ? words.connect
          : phase === 'refused' ? words.check : words.change}</button>
    </div>
  {/if}
</div>
