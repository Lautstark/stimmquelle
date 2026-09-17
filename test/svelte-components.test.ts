// @vitest-environment jsdom
/*
 * The three Svelte components, held to what they were extracted to keep.
 *
 * conventions.md §6.8 asks a twin for "same options, same emitted markup, same
 * words". The CSS contract next door asserts the vocabulary; this file asserts
 * the rest of that sentence, and the behaviours §6.9 and §6.10 name — every one
 * of which was a defect in at least one of the products these came from, which
 * is why each has a test rather than a comment alone.
 *
 * `sameShape` is the load-bearing one. It walks both renderings of the picker
 * and compares tag, attributes and text, node for node: "same emitted markup"
 * is checkable rather than aspirational, and a twin that drifts by one class or
 * one `aria-checked` fails here rather than in a product's baseline.
 */
import { flushSync, mount as render, tick, unmount, type Component } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { voicePicker, type Pickable } from '../src/voice-picker.js';
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
];
const GERMAN = VOICES.filter((v) => !v.id.startsWith('azure:en'));

/** Mounts a component into a fresh container and hands back its root element. */
function draw(
  component: unknown, props: Record<string, unknown>,
): { root: HTMLElement; done: () => void } {
  const target = document.createElement('div');
  document.body.replaceChildren(target);
  const app = render(component as Component<Record<string, unknown>>, { target, props });
  flushSync();
  return { root: target.firstElementChild as HTMLElement, done: () => void unmount(app) };
}

/* The panel's own work is asynchronous — a `stored` thunk, then a probe, then
   a save, and Svelte's own flush after each. `tick()` alone answers for the
   framework and not for the promises in between, so this waits for both in
   turn. Rounds rather than a timer: nothing here is on a clock. */
async function settle(rounds = 6): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await Promise.resolve();
    await tick();
  }
}

/* Tag, attributes and own text, for every element under a node. Svelte's
   scoping hash is dropped — it is the mechanism by which a component's own
   arrangement travels with it, and the vanilla module has no equivalent.
   Comment nodes are skipped: Svelte anchors its blocks with them, they are not
   markup anybody sees, and `:empty` ignores them for the same reason. */
function sameShape(root: Element): string[] {
  const out: string[] = [];
  const walk = (el: Element): void => {
    const attrs = [...el.attributes]
      .map((a) => (a.name === 'class'
        ? `class="${a.value.split(/\s+/).filter((n) => !/^svelte-[0-9a-z]+$/.test(n)).join(' ')}"`
        : `${a.name}="${a.value}"`))
      .sort();
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').trim();
    out.push(`${el.tagName.toLowerCase()} ${attrs.join(' ')}${own ? ` :: ${own}` : ''}`);
    for (const child of el.children) walk(child);
  };
  walk(root);
  return out;
}

describe('the Svelte picker emits what the vanilla one emits', () => {
  const both = (options: Record<string, unknown>, live: string | undefined) => {
    const picker = voicePicker({
      voices: () => VOICES, current: () => live, pick: () => {}, ...options,
    } as never);
    document.body.replaceChildren(picker.node);
    const vanilla = sameShape(picker.node);
    picker.dispose();
    const { root, done } = draw(VoicePicker, {
      voices: () => VOICES, current: () => live, pick: () => {}, ...options,
    });
    const svelte = sameShape(root);
    done();
    return { vanilla, svelte };
  };

  it('with one chosen, two languages and a preview', () => {
    const { vanilla, svelte } = both(
      { hear: async () => {}, notes: (v: Pickable) => (v.rushesFragments ? ['eilt'] : []) },
      'piper:de_DE-kerstin-low',
    );
    expect(svelte).toEqual(vanilla);
  });

  it('with nothing chosen, no preview, and in English', () => {
    const { vanilla, svelte } = both({ lang: 'en' }, undefined);
    expect(svelte).toEqual(vanilla);
  });

  it('with a chosen voice that is not in the list', () => {
    const { vanilla, svelte } = both(
      { hear: async () => {}, chosenName: () => 'Gisela' }, 'azure:de-DE-GoneNeural',
    );
    expect(svelte).toEqual(vanilla);
  });
});

describe('the Svelte picker keeps what the extraction was for', () => {
  it('is a radio group, and says `false` as well as `true`', () => {
    const { root, done } = draw(VoicePicker, {
      voices: () => VOICES, current: () => 'piper:de_DE-thorsten-high', pick: () => {},
    });
    const list = root.querySelector('.voices')!;
    expect(list.getAttribute('role')).toBe('radiogroup');
    expect(list.getAttribute('aria-label')).toBe('Stimme');
    const rows = [...root.querySelectorAll('.voice')];
    expect(rows.map((r) => r.getAttribute('role'))).toEqual(rows.map(() => 'radio'));
    // Both directions as words. A radio that is not the answer has to say
    // `false` rather than say nothing.
    expect(rows.map((r) => r.getAttribute('aria-checked')))
      .toEqual(['false', 'true', 'false', 'false', 'false']);
    done();
  });

  it('has exactly one row the Tab key can land on, and it is the answer', () => {
    const { root, done } = draw(VoicePicker, {
      voices: () => VOICES, current: () => 'azure:de-DE-KatjaNeural', pick: () => {},
    });
    const entry = [...root.querySelectorAll('.voice')].filter((r) => r.getAttribute('tabindex') === '0');
    expect(entry).toHaveLength(1);
    expect(entry[0]!.getAttribute('data-id')).toBe('azure:de-DE-KatjaNeural');
    done();
  });

  it('offers a way in even where nothing is chosen', () => {
    const { root, done } = draw(VoicePicker, {
      voices: () => VOICES, current: () => undefined, pick: () => {},
    });
    const entry = [...root.querySelectorAll('.voice')].filter((r) => r.getAttribute('tabindex') === '0');
    expect(entry).toHaveLength(1);
    expect(entry[0]!.getAttribute('data-id')).toBe('piper:de_DE-thorsten-medium');
    done();
  });

  it('moves the answer with the arrow keys, not only the focus', () => {
    const pick = vi.fn();
    const { root, done } = draw(VoicePicker, {
      voices: () => VOICES, current: () => 'piper:de_DE-thorsten-medium', pick,
    });
    const rows = [...root.querySelectorAll<HTMLElement>('.voice')];
    rows[0]!.focus();
    root.querySelector('.voices')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(pick).toHaveBeenCalledWith('piper:de_DE-thorsten-high');
    expect(document.activeElement).toBe(rows[1]);
    done();
  });

  it('keeps the search field it started with, caret and all', async () => {
    const { root, done } = draw(VoicePicker, {
      voices: () => VOICES, current: () => undefined, pick: () => {},
    });
    const field = root.querySelector<HTMLInputElement>('input')!;
    field.value = 'katja';
    field.dispatchEvent(new Event('input'));
    await tick();
    expect(root.querySelector('input')).toBe(field);
    expect(root.querySelectorAll('.voice')).toHaveLength(1);
    done();
  });

  it('draws chips only where the catalogue holds two languages', () => {
    const many = draw(VoicePicker, { voices: () => VOICES, current: () => undefined, pick: () => {} });
    expect(many.root.querySelectorAll('.chip').length).toBeGreaterThan(1);
    many.done();
    const one = draw(VoicePicker, { voices: () => GERMAN, current: () => undefined, pick: () => {} });
    expect(one.root.querySelectorAll('.chip')).toHaveLength(0);
    /* The box is still drawn — `.voice-picker__filters:empty` is what hides it,
       and it can only do that if there is nothing inside, whitespace included. */
    const box = one.root.querySelector('.voice-picker__filters')!;
    expect(box).not.toBeNull();
    expect([...box.childNodes].filter((n) => n.nodeType !== 8)).toHaveLength(0);
    one.done();
  });

  it('draws the row wrapper whether or not a preview is offered', () => {
    const without = draw(VoicePicker, { voices: () => VOICES, current: () => undefined, pick: () => {} });
    expect(without.root.querySelectorAll('.voices__row')).toHaveLength(VOICES.length);
    expect(without.root.querySelectorAll('.voices__play')).toHaveLength(0);
    without.done();
    const with_ = draw(VoicePicker, {
      voices: () => VOICES, current: () => undefined, pick: () => {}, hear: async () => {},
    });
    expect(with_.root.querySelectorAll('.voices__play')).toHaveLength(VOICES.length);
    with_.done();
  });

  it('emits no .small, .muted or .faint', () => {
    const { root, done } = draw(VoicePicker, {
      voices: () => VOICES, current: () => undefined, pick: () => {}, hear: async () => {},
      notes: () => ['eine Anmerkung'],
    });
    const names = new Set([...root.querySelectorAll('*')].flatMap((el) => [...el.classList]));
    for (const utility of ['small', 'muted', 'faint']) expect(names.has(utility)).toBe(false);
    done();
  });
});

const WORDS = {
  key: 'Schlüssel',
  region: 'Region',
  regionHint: 'Steht im Azure-Portal.',
  save: 'Speichern',
  saving: 'Wird geprüft …',
  forget: 'Schlüssel entfernen',
  asking: 'Frage Azure …',
  typeFirst: 'Erst einen Schlüssel eintippen.',
  answers: (count: number) => `${count === 1 ? '1 Stimme' : `${count} Stimmen`} verfügbar`,
  saved: (count: number) => `Azure Speech freigeschaltet — ${count} Stimmen.`,
  unreachable: 'Die Region antwortet nicht.',
  refused: 'Azure nimmt den Schlüssel nicht an.',
  refusedOnSave: 'Azure hat den Schlüssel abgelehnt. Meistens ist es die Region.',
  failed: (words: string) => `Azure hat nicht geantwortet (${words}).`,
};

const panel = (props: Record<string, unknown>) => draw(AzurePanel, {
  words: WORDS, save: () => {}, forget: () => {}, hasKey: false,
  fieldId: 'azurekey', regionId: 'azureregion', saveId: 'azuresave',
  forgetId: 'azureforget', probeId: 'azureprobe', ...props,
});

describe('the Azure panel', () => {
  it('holds the key in the placeholder and starts empty', () => {
    const { root, done } = panel({ hasKey: true, placeholder: '••••4321' });
    const field = root.querySelector<HTMLInputElement>('#azurekey')!;
    expect(field.type).toBe('password');
    expect(field.getAttribute('placeholder')).toBe('••••4321');
    expect(field.value).toBe('');
    done();
  });

  it('pairs every label with the field it names', () => {
    const { root, done } = panel({});
    const pairs = [...root.querySelectorAll('label')]
      .map((l) => [l.getAttribute('for'), root.querySelector(`#${l.getAttribute('for')}`) !== null]);
    expect(pairs).toEqual([['azurekey', true], ['azureregion', true]]);
    done();
  });

  it('suggests regions rather than restricting them', () => {
    const { root, done } = panel({});
    const field = root.querySelector<HTMLInputElement>('#azureregion')!;
    const list = root.querySelector<HTMLElement>(`#${field.getAttribute('list')}`)!;
    expect(list.tagName.toLowerCase()).toBe('datalist');
    expect(list.querySelectorAll('option')).toHaveLength(26);
    expect(field.value).toBe('westeurope');
    done();
  });

  it('draws the forget button hidden rather than removing it', () => {
    const away = panel({ hasKey: false });
    expect(away.root.querySelector('#azureforget')).not.toBeNull();
    expect(away.root.querySelector('#azureforget')!.hasAttribute('hidden')).toBe(true);
    away.done();
    const here = panel({ hasKey: true });
    expect(here.root.querySelector('#azureforget')!.hasAttribute('hidden')).toBe(false);
    here.done();
  });

  it('keeps the probe line empty rather than hiding it', async () => {
    const { root, done } = panel({ hasKey: false });
    const line = root.querySelector('#azureprobe')!;
    expect(line.getAttribute('role')).toBe('status');
    expect(line.hasAttribute('hidden')).toBe(false);
    // Childless rather than holding an empty string, which is what lets
    // `:empty` take its margin away.
    expect(line.textContent).toBe('');
    expect([...line.childNodes].some((n) => n.nodeType === 3)).toBe(false);
    done();
  });

  it('asks the injected probe on arrival and renders what it answers', async () => {
    const probe = vi.fn(async () => ({ ok: true as const, count: 3 }));
    const { root, done } = panel({ hasKey: true, region: 'uksouth', stored: () => 'k', probe });
    await settle();
    expect(probe).toHaveBeenCalledWith({ key: 'k', region: 'uksouth' });
    expect(root.querySelector('#azureprobe')!.textContent).toBe('3 Stimmen verfügbar');
    done();
  });

  it("keeps Azure's own message in the sentence a failure produces", async () => {
    const probe = vi.fn(async () => ({ ok: false as const, code: 'failed' as const, words: 'HTTP 500' }));
    const { root, done } = panel({ hasKey: true, stored: () => 'k', probe });
    await settle();
    expect(root.querySelector('#azureprobe')!.textContent)
      .toBe('Azure hat nicht geantwortet (HTTP 500).');
    done();
  });

  it('saves the key it shows when the field was not touched', async () => {
    const save = vi.fn();
    const probe = vi.fn(async () => ({ ok: true as const, count: 7 }));
    const announce = vi.fn();
    const { root, done } = panel({
      hasKey: true, region: 'eastus', stored: () => 'gespeichert', probe, save, announce,
    });
    await tick();
    root.querySelector<HTMLButtonElement>('#azuresave')!.click();
    await settle();
    expect(save).toHaveBeenCalledWith({ key: 'gespeichert', region: 'eastus' });
    expect(announce).toHaveBeenCalledWith('Azure Speech freigeschaltet — 7 Stimmen.');
    done();
  });

  it('saves what was typed over the key it shows', async () => {
    const save = vi.fn();
    const probe = vi.fn(async () => ({ ok: true as const, count: 1 }));
    const { root, done } = panel({ hasKey: true, stored: () => 'alt', probe, save });
    await tick();
    const field = root.querySelector<HTMLInputElement>('#azurekey')!;
    field.value = ' neu ';
    field.dispatchEvent(new Event('input'));
    await tick();
    root.querySelector<HTMLButtonElement>('#azuresave')!.click();
    await settle();
    expect(save).toHaveBeenCalledWith({ key: 'neu', region: 'westeurope' });
    // Empty again, so the placeholder is the only thing saying a key is held.
    expect(field.value).toBe('');
    done();
  });

  it('refuses to save with nothing typed and nothing stored', async () => {
    const save = vi.fn();
    const announce = vi.fn();
    const { root, done } = panel({ hasKey: false, save, announce });
    root.querySelector<HTMLButtonElement>('#azuresave')!.click();
    await tick();
    expect(save).not.toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Erst einen Schlüssel eintippen.');
    done();
  });

  it('writes nothing when the probe refuses, and says which', async () => {
    const save = vi.fn();
    const probe = vi.fn(async () => ({ ok: false as const, code: 'refused' as const, words: '401' }));
    const { root, done } = panel({ hasKey: true, stored: () => 'k', probe, save });
    await settle();
    root.querySelector<HTMLButtonElement>('#azuresave')!.click();
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(root.querySelector('#azureprobe')!.textContent).toBe(WORDS.refusedOnSave);
    done();
  });

  it('sends no key at all where the page cannot read the stored one', async () => {
    const save = vi.fn();
    const { root, done } = panel({ hasKey: true, region: 'uksouth', save });
    await tick();
    root.querySelector<HTMLButtonElement>('#azuresave')!.click();
    await settle();
    expect(save).toHaveBeenCalledWith({ key: undefined, region: 'uksouth' });
    done();
  });

  it('removes the key through its own button', async () => {
    const forget = vi.fn();
    const { root, done } = panel({ hasKey: true, forget });
    root.querySelector<HTMLButtonElement>('#azureforget')!.click();
    await tick();
    expect(forget).toHaveBeenCalled();
    done();
  });
});

describe('the play button', () => {
  const press = (props: Record<string, unknown>) => draw(PlayButton, {
    label: 'Probe hören', text: () => 'Hallo', trouble: () => {},
    nothing: 'Erst einen Namen eintippen.', hear: async () => undefined, ...props,
  });

  it('keeps its face while it is busy, and says so with `disabled` alone', async () => {
    let release = (): void => {};
    const hear = vi.fn(() => new Promise<undefined>((resolve) => {
      release = () => resolve(undefined);
    }));
    const { root, done } = press({ hear });
    const button = root as HTMLButtonElement;
    expect(button.textContent).toBe('▶');
    button.click();
    await tick();
    expect(button.disabled).toBe(true);
    // The glyph never changes: a `▶` swapped for `…` resizes the pill, and a
    // control that jumps under the pointer reads as a different control.
    expect(button.textContent).toBe('▶');
    release();
    await settle();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('▶');
    done();
  });

  it('reads the text at press time', async () => {
    let held = 'erst';
    const hear = vi.fn(async () => undefined);
    const { root, done } = press({ text: () => held, hear });
    held = 'dann';
    (root as HTMLButtonElement).click();
    await tick();
    expect(hear).toHaveBeenCalledWith('dann');
    done();
  });

  it('says beside the thing when there is nothing to speak', async () => {
    const trouble = vi.fn();
    const hear = vi.fn(async () => undefined);
    const { root, done } = press({ text: () => '', trouble, hear });
    (root as HTMLButtonElement).click();
    await tick();
    expect(hear).not.toHaveBeenCalled();
    expect(trouble).toHaveBeenLastCalledWith('Erst einen Namen eintippen.');
    done();
  });

  it('hands a reason on, and clears a stale one first', async () => {
    const trouble = vi.fn();
    const { root, done } = press({ trouble, hear: async () => 'Keine Stimme gewählt.' });
    (root as HTMLButtonElement).click();
    await settle();
    expect(trouble.mock.calls.map((c) => c[0])).toEqual(['', 'Keine Stimme gewählt.']);
    done();
  });
});
