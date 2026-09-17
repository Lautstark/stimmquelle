<script lang="ts">
  /**
   * One kind of play button, made in one place, for every surface that offers
   * to say something. conventions.md §6.10.
   *
   * **Here rather than in design**, and §6.10 says why: it reports a *reason
   * string* and it exists to preview speech, which is a speech contract rather
   * than a design one. The evidence was already in this package — the voice
   * picker draws the row wrapper whether or not a `hear` hook is passed, "so
   * the day this page grows a sample player nothing else moves", and this is
   * that player.
   *
   * ## Busy is the button dimming, and the face never changes
   *
   * This is the measured decision wochenwerk's copy carries and it is kept
   * exactly: a `▶` swapped for `…` inside a pill resizes the pill, and a control
   * that jumps under the pointer reads as a different control. `.btn:disabled`
   * already carries the dimming, so `disabled` is the whole of it.
   *
   * It is the opposite of what `VoicePicker`'s own `▶` does, and the two are
   * both right. That one is the only thing on screen that can say a 63 MB model
   * is being fetched, and it prints whole per cent; this one sits beside a field
   * and speaks a word, which is over before a face could usefully change.
   *
   * ## `text` is a thunk, and the speech call is injected
   *
   * `text` is read at press time, not at render time: the field this sits beside
   * is being typed into, and a value captured when the button was drawn is the
   * name somebody had half-finished. `hear` is injected for the reason `speak`'s
   * own runtime is — two products reach their speech path two different ways,
   * and hard-importing one would break the other. What comes back is a reason
   * or nothing, which is the contract this component is named for.
   *
   * ## Said beside the thing
   *
   * `trouble` is called with the empty string first and with a reason after,
   * rather than the reason being thrown upwards: every surface this sits on is a
   * panel with no status line of its own, and a problem with one word belongs
   * next to that word rather than at the far end of a sheet.
   */
  let {
    label,
    text,
    hear,
    trouble,
    nothing,
    class: extra = 'btn quiet icon sm',
    id,
  }: {
    /** The accessible name. A button whose face is a glyph has none otherwise. */
    label: string;
    /** What to say, read when the button is pressed. See the header. */
    text: () => string;
    /**
     * Speak it, and answer with what went wrong.
     *
     * Empty or absent means it worked. Injected rather than imported: wochenwerk
     * speaks through the board's own path with its own interruption rule, and
     * neither that path nor its rule is a fact about a button.
     */
    hear: (said: string) => Promise<string | undefined | void>;
    /** Where a reason goes. Called with `''` first, so a stale one clears. */
    trouble: (said: string) => void;
    /** What to say when there is nothing to speak yet. The product's words —
     *  wochenwerk's names what the field holds, and „Namen" is that page's. */
    nothing: string;
    /** The pill. `btn quiet icon sm` where a product does not say otherwise,
     *  which is every one of them today. */
    class?: string;
    id?: string;
  } = $props();

  let busy = $state(false);

  async function press(): Promise<void> {
    const said = text();
    trouble('');
    if (!said) {
      trouble(nothing);
      return;
    }
    busy = true;
    try {
      const why = await hear(said);
      if (why) trouble(why);
    } finally {
      busy = false;
    }
  }
</script>

<button {id} class={extra} type="button" aria-label={label} disabled={busy}
  onclick={() => void press()}>▶</button>
