/**
 * The voices the operating system already has, through the Web Speech API.
 *
 * Every browser has German female voices and always has. They cost nothing to
 * download and need no key — which for the German female slot, after piper turned
 * out to publish exactly one licence-clear voice and MLS turned out not to speak
 * German, is worth more than it sounds.
 *
 * **They make no file, and that is not a limitation to be worked around.** The
 * Web Speech API hands back no samples: `speak()` is the browser making a noise,
 * not a synthesiser returning audio. Nothing here can trim it, measure it, level
 * it to −16 LUFS, cache it under a fingerprint, or write it to a talker's flash.
 * So these voices do not go through `speak()` at all — `say()` is a different
 * verb because it is a different act, and a `Spoken` with no `wav` in it would be
 * a lie the type system would have to be talked out of.
 *
 * What follows from that, and a product has to state rather than imply:
 *
 *   - **nothing is levelled.** A system voice is as loud as the OS makes it, and
 *     it will not match the piper voices next to it. CONTRACT.md §1 does not
 *     reach here and cannot
 *   - **nothing is reproducible.** The voice list is the user's own, changes with
 *     their OS, and is not the same list on the next device
 *   - **no gender.** The API publishes a name and a language and nothing else, so
 *     a gender filter cannot include these. Guessing from the name is how you
 *     tell somebody their voice is a woman because it is called Anna
 *   - **not all of them are offline.** This file used to say they all were.
 *     Chrome's Google voices are synthesised on Google's servers, and a page
 *     with no network gets silence from them — `offline` on each entry is
 *     `localService`, which is the API's own answer and the only one there is
 */
import type { Offered } from './list.js';

interface Speech {
  getVoices(): SpeechSynthesisVoice[];
  speak(u: SpeechSynthesisUtterance): void;
  cancel(): void;
  addEventListener(t: string, f: () => void): void;
  removeEventListener(t: string, f: () => void): void;
}

const speech = (): Speech | null =>
  (globalThis as { speechSynthesis?: Speech }).speechSynthesis ?? null;

/** Whether this runtime has any at all. False under node, and on a locked-down page. */
export const hasSystemVoices = (): boolean => !!speech();

const asOffered = (v: SpeechSynthesisVoice): Offered => ({
  id: `system:${v.voiceURI}`,
  name: v.name,
  lang: (v.lang || '').split('-')[0].toLowerCase(),
  locale: v.lang || '',
  // The API does not say, so neither do we. A gender filter will exclude these
  // rather than be told something nobody checked.
  gender: '',
  source: 'system',
  downloadBytes: 0,
  needsKey: false,
  makesFile: false,
  // Not every voice the OS lists is on the device: Chrome's Google voices are
  // synthesised on Google's servers. The API distinguishes them and this is the
  // only place that answer is available, so it is passed on rather than assumed.
  offline: v.localService,
  recommended: false,
});

/** Whatever the OS is offering right now. Empty where there is no speech synthesis. */
export function systemVoices(): readonly Offered[] {
  const s = speech();
  if (!s) return [];
  return s.getVoices().map(asOffered);
}

/**
 * The same, having waited for the list to arrive.
 *
 * Chrome populates `getVoices()` asynchronously and answers with an empty array
 * until it has, so a picker built on the synchronous call shows nothing on a cold
 * load and everything after a refresh — which reads as a bug in the picker.
 */
export function loadSystemVoices(timeoutMs = 1000): Promise<readonly Offered[]> {
  const s = speech();
  if (!s) return Promise.resolve([]);
  const now = systemVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      s.removeEventListener('voiceschanged', done);
      resolve(systemVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    s.addEventListener('voiceschanged', done);
  });
}

export interface SayOptions {
  /** 0.1–10, where 1 is the voice's own pace. Not a sample rate — see `LevelOptions.rate`. */
  speed?: number;
  pitch?: number;
  volume?: number;
}

/**
 * Say it out loud now, and hand back nothing.
 *
 * Resolves when the browser has finished speaking, so a caller can sequence.
 * Deliberately not `speak()`: there is no audio to return, nothing was levelled,
 * and nothing can be saved.
 */
export function say(text: string, vid: string, o: SayOptions = {}): Promise<void> {
  const s = speech();
  if (!s) throw new Error('This runtime has no speech synthesis.');
  if (!text || !text.trim()) throw new Error('Nothing to say.');
  if (!vid.startsWith('system:')) {
    throw new Error(
      `say() speaks the operating system's own voices, and ${vid} is not one. `
      + 'Use speak() for a piper: or azure: voice — it returns a levelled file, '
      + 'which is the thing say() cannot do.',
    );
  }
  const uri = vid.slice('system:'.length);
  const voice = s.getVoices().find(v => v.voiceURI === uri);
  if (!voice) {
    throw new Error(
      `${vid} is not among this system's voices. They are the user's own and `
      + 'differ per device, so a saved id may not exist here — offer a fallback.',
    );
  }
  return new Promise((resolve, reject) => {
    const u = new SpeechSynthesisUtterance(text.trim());
    u.voice = voice;
    u.lang = voice.lang;
    if (o.speed !== undefined) u.rate = o.speed;
    if (o.pitch !== undefined) u.pitch = o.pitch;
    if (o.volume !== undefined) u.volume = o.volume;
    u.onend = () => resolve();
    u.onerror = e => reject(new Error(`The browser stopped speaking: ${e.error ?? 'unknown'}`));
    s.speak(u);
  });
}
