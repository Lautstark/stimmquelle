import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSystemVoices, listVoices, say, speak, systemVoices } from '../src/index.js';

/**
 * The operating system's own voices, which speak and save nothing.
 *
 * Most of what matters here is what they are *not* allowed to pretend to be, so
 * these mostly assert that the difference stays visible.
 */
const voices = [
  { voiceURI: 'Anna', name: 'Anna', lang: 'de-DE', localService: true, default: true },
  { voiceURI: 'Markus', name: 'Markus', lang: 'de-DE', localService: true, default: false },
  { voiceURI: 'Samantha', name: 'Samantha', lang: 'en-US', localService: true, default: false },
  // Chrome's Google voices are synthesised on Google's servers. Same list, same
  // shape, and silence on a page with no network.
  { voiceURI: 'Google Deutsch', name: 'Google Deutsch', lang: 'de-DE', localService: false, default: false },
];

function stubSpeech(list = voices, speakImpl?: (u: unknown) => void) {
  const listeners: Record<string, (() => void)[]> = {};
  const s = {
    getVoices: () => list,
    speak: speakImpl ?? ((u: { onend?: () => void }) => queueMicrotask(() => u.onend?.())),
    cancel: () => {},
    addEventListener: (t: string, f: () => void) => { (listeners[t] ??= []).push(f); },
    removeEventListener: () => {},
    fire: (t: string) => (listeners[t] ?? []).forEach(f => f()),
  };
  Object.defineProperty(globalThis, 'speechSynthesis', { value: s, configurable: true });
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    value: class { text: string; voice: unknown; lang = ''; rate = 1; pitch = 1; volume = 1;
      onend?: () => void; onerror?: (e: { error: string }) => void;
      constructor(t: string) { this.text = t; } },
    configurable: true,
  });
  return s;
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'speechSynthesis');
  Reflect.deleteProperty(globalThis, 'SpeechSynthesisUtterance');
});

describe('system voices', () => {
  it('is empty, not broken, where there is no speech synthesis', () => {
    expect(hasSystemVoices()).toBe(false);
    expect(systemVoices()).toEqual([]);
  });

  it('offers what the OS has, in the same shape as everything else', () => {
    stubSpeech();
    const anna = systemVoices().find(v => v.id === 'system:Anna')!;
    expect(anna.name).toBe('Anna');
    expect(anna.lang).toBe('de');
    expect(anna.locale).toBe('de-DE');
    expect(anna.source).toBe('system');
    expect(anna.downloadBytes).toBe(0);
    expect(anna.needsKey).toBe(false);
  });

  it('says plainly that it cannot make a file', async () => {
    // The one fact a product must not lose: these cannot be levelled, cached,
    // exported, or written to a talker's flash.
    stubSpeech();
    for (const v of systemVoices()) expect(v.makesFile).toBe(false);
    const piper = (await listVoices()).filter(v => v.source === 'piper');
    for (const v of piper) expect(v.makesFile).toBe(true);
  });

  it('claims no gender rather than guessing one from a name', () => {
    // Anna is not a woman because she is called Anna. The API publishes a name
    // and a language and nothing else.
    stubSpeech();
    for (const v of systemVoices()) expect(v.gender).toBe('');
  });

  it('is left out of a gender filter, since it has none to match', async () => {
    stubSpeech();
    const women = await listVoices({ gender: 'female', system: true });
    expect(women.every(v => v.source !== 'system')).toBe(true);
  });

  it('says which of them the OS actually speaks on the device', () => {
    // Not a detail. "The OS has voices, so they work offline" was true of most
    // and not all, and the difference is invisible until a tablet is somewhere
    // with no signal — which for a talker is the moment it matters most.
    stubSpeech();
    const got = Object.fromEntries(systemVoices().map(v => [v.id, v.offline]));
    expect(got['system:Anna']).toBe(true);
    expect(got['system:Google Deutsch']).toBe(false);
  });

  it('reports offline as the API\'s own answer, not as a guess from the name', () => {
    // localService is the only answer there is. Nothing here may infer it from
    // a name, a locale, or the fact that the OS listed it at all.
    stubSpeech();
    for (const v of systemVoices()) {
      const said = voices.find(o => `system:${o.voiceURI}` === v.id)!.localService;
      expect(v.offline).toBe(said);
    }
  });
});

describe('listVoices with system voices', () => {
  it('leaves them out until asked', async () => {
    stubSpeech();
    expect((await listVoices()).every(v => v.source !== 'system')).toBe(true);
    expect((await listVoices({ system: true })).some(v => v.source === 'system')).toBe(true);
  });

  it('gives a German voice a page can use with no key and no download', async () => {
    // The reason this source exists: piper publishes one licence-clear German
    // female voice and Azure needs a key. The OS has had one all along.
    stubSpeech();
    const german = await listVoices({ lang: 'de', system: true });
    const free = german.filter(v => v.downloadBytes === 0 && !v.needsKey);
    expect(free.length).toBeGreaterThan(0);
  });

  it('waits for a voice list that arrives late', async () => {
    // Chrome answers getVoices() with [] until it is ready, so a picker built on
    // the synchronous call shows nothing on a cold load and everything after a
    // refresh — which reads as a bug in the picker.
    let list: typeof voices = [];
    const s = stubSpeech(list as never);
    (s as unknown as { getVoices: () => typeof voices }).getVoices = () => list;
    const pending = listVoices({ system: true });
    list = voices;
    (s as unknown as { fire(t: string): void }).fire('voiceschanged');
    expect((await pending).some(v => v.source === 'system')).toBe(true);
  });
});

describe('say(), which is a different verb on purpose', () => {
  it('speaks and resolves when the browser has finished', async () => {
    stubSpeech();
    await expect(say('Hallo', 'system:Anna')).resolves.toBeUndefined();
  });

  it('hands the utterance the voice that was asked for', async () => {
    const spoken: { voice?: { voiceURI: string } }[] = [];
    stubSpeech(voices, (u: unknown) => {
      spoken.push(u as { voice?: { voiceURI: string } });
      queueMicrotask(() => (u as { onend?: () => void }).onend?.());
    });
    await say('Hallo', 'system:Markus');
    expect(spoken[0].voice!.voiceURI).toBe('Markus');
  });

  it('refuses a piper voice, and points at the one that returns audio', () => {
    stubSpeech();
    expect(() => say('Hallo', 'piper:de_DE-thorsten-medium')).toThrow(/Use speak\(\)/);
  });

  it('says an id may simply not exist on this device', () => {
    // The voice list is the user's own. A saved id is not a promise.
    stubSpeech();
    expect(() => say('Hallo', 'system:Gertrud')).toThrow(/not among this system's voices/);
  });
});

describe('speak() and system voices', () => {
  it('refuses them, because there would be no audio to hand back', async () => {
    stubSpeech();
    await expect(speak('Hallo', 'system:Anna')).rejects.toThrow(/Use say\(\)/);
  });
});
