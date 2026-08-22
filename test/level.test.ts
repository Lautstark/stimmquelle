import { describe, expect, it } from 'vitest';
import {
  decodeWav, encodeWav, integratedLufs, postprocess, resample, TARGET_LUFS,
  TARGET_PEAK_DBTP, trim, truePeakDb,
} from '../src/index.js';

/**
 * The promises, not the arithmetic.
 *
 * These are written so they would still be the right checks if the inside were
 * rewritten — which matters, because this chain has to keep agreeing with an
 * ffmpeg one it cannot call, and eventually with nothing at all once the
 * containers are gone.
 */

/** A sine at a given amplitude, as a synthesiser's WAV would arrive. */
function tone(seconds: number, amplitude: number, rate = 22050, hz = 220): Uint8Array {
  const n = Math.round(seconds * rate);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate);
  return encodeWav(x, rate);
}

/** Silence, a burst, silence — what a trimmer is actually for. */
function burst(quietSec: number, loudSec: number, amplitude: number, rate = 22050): Uint8Array {
  const pad = Math.round(quietSec * rate), n = Math.round(loudSec * rate);
  const x = new Float32Array(pad * 2 + n);
  for (let i = 0; i < n; i++) x[pad + i] = amplitude * Math.sin((2 * Math.PI * 220 * i) / rate);
  return encodeWav(x, rate);
}

describe('levelling', () => {
  it('brings recordings 40 dB apart to within half a decibel of each other', () => {
    // The whole point of the product: one sentence must not be louder than the
    // next on the same talker.
    const results = [1, 0.1, 0.01].map(a => postprocess(tone(2, a), { rate: 16000 }));
    const measured = results.map(r => decodeWav(r.wav)).map(w => integratedLufs(resample(w.samples, w.rate, 48000)));
    for (const lufs of measured) expect(Math.abs(lufs - TARGET_LUFS)).toBeLessThan(0.5);
    expect(Math.max(...measured) - Math.min(...measured)).toBeLessThan(0.5);
  });

  it('never lets a finished file past the ceiling, at any input level', () => {
    for (const a of [1, 0.5, 0.05, 0.005]) {
      const out = postprocess(tone(2, a), { rate: 16000 });
      const w = decodeWav(out.wav);
      expect(truePeakDb(w.samples, w.rate)).toBeLessThanOrEqual(TARGET_PEAK_DBTP + 0.05);
      expect(out.peakDb).toBeLessThanOrEqual(TARGET_PEAK_DBTP + 0.05);
    }
  });

  it('gives up loudness rather than clipping when the peak would breach', () => {
    // A quiet sentence with one loud consonant: the gain that would reach the
    // target would also breach the ceiling, so the ceiling wins and says so.
    const rate = 22050;
    const x = new Float32Array(rate * 2);
    for (let i = 0; i < x.length; i++) x[i] = 0.005 * Math.sin((2 * Math.PI * 220 * i) / rate);
    for (let i = 0; i < 200; i++) x[rate] = 0.99;
    const out = postprocess(encodeWav(x, rate), { rate: 16000 });
    expect(out.clamped).toBe(true);
    expect(out.peakDb).toBeLessThanOrEqual(TARGET_PEAK_DBTP + 0.05);
  });

  it('reports what it did, because a levelling nobody can check hides 13 dB', () => {
    const out = postprocess(tone(2, 0.1), { rate: 16000 });
    expect(out.lufs).toBeLessThan(0);
    expect(Number.isFinite(out.gainDb)).toBe(true);
    expect(out.seconds).toBeGreaterThan(0);
  });
});

describe('trimming', () => {
  it('takes the silence off both ends and keeps a little of it', () => {
    const rate = 22050;
    const { samples } = decodeWav(burst(1, 0.5, 0.5, rate));
    const cut = trim(samples, rate);
    // Half a second of tone plus 50 ms either side, not two and a half seconds.
    expect(cut.length / rate).toBeGreaterThan(0.5);
    expect(cut.length / rate).toBeLessThan(0.72);
  });

  it('leaves an all-silent recording alone rather than returning nothing', () => {
    // A zero-length WAV is a worse answer than the silence: it does not play,
    // so it looks like a bug in the player rather than a bad recording.
    const rate = 16000;
    const silence = new Float32Array(rate);
    expect(trim(silence, rate).length).toBe(silence.length);
  });

  it('measures after trimming, not before', () => {
    // Leading silence would drag the integrated loudness down and the sentence
    // would come out too loud. Same tone, one padded: same finished level.
    const bare = postprocess(tone(1.5, 0.2), { rate: 16000 });
    const padded = postprocess(burst(1.5, 1.5, 0.2), { rate: 16000 });
    expect(Math.abs(bare.lufs - padded.lufs)).toBeLessThan(0.5);
  });
});

describe('resampling', () => {
  it('lands on the right length and stays inside the signal', () => {
    const x = new Float32Array(22050);
    for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 220 * i) / 22050);
    const y = resample(x, 22050, 16000);
    expect(y.length).toBe(16000);
    for (let i = 0; i < y.length; i++) expect(Math.abs(y[i])).toBeLessThan(1);
  });

  it('is a no-op when the rates match', () => {
    const x = new Float32Array([0.1, -0.2, 0.3]);
    expect(resample(x, 16000, 16000)).toBe(x);
  });

  it('does not fold high frequencies back in on the way down', () => {
    // 7 kHz at 22.05 kHz is above the 8 kHz Nyquist of 16 kHz output, so a
    // resampler without a low pass would alias it into the speech as noise
    // instead of losing it.
    const rate = 22050;
    const x = new Float32Array(rate);
    for (let i = 0; i < x.length; i++) x[i] = 0.9 * Math.sin((2 * Math.PI * 9000 * i) / rate);
    const y = resample(x, rate, 16000);
    let energy = 0;
    for (let i = 0; i < y.length; i++) energy += y[i] * y[i];
    expect(Math.sqrt(energy / y.length)).toBeLessThan(0.1);
  });
});

describe('WAV', () => {
  it('round-trips samples and rate', () => {
    const x = new Float32Array([0, 0.5, -0.5, 0.25]);
    const { samples, rate } = decodeWav(encodeWav(x, 16000));
    expect(rate).toBe(16000);
    for (let i = 0; i < x.length; i++) expect(samples[i]).toBeCloseTo(x[i], 3);
  });

  it('does not wrap full scale into a click', () => {
    // Rounding +1 to 32768 wraps to the loudest possible negative sample.
    const { samples } = decodeWav(encodeWav(new Float32Array([1, -1]), 16000));
    expect(samples[0]).toBeGreaterThan(0.99);
    expect(samples[1]).toBeLessThan(-0.99);
  });

  it('refuses something that is not a WAV rather than producing silence', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow(/RIFF/);
  });
});

describe('the licence gate on speak()', () => {
  it('refuses a voice that may not be shipped, before anything is fetched', async () => {
    await expect(speakOf('piper:en_US-hfc_female-medium')).rejects.toThrow(/may not be shipped/);
  });

  it('refuses a voice that cannot speak in a browser', async () => {
    await expect(speakOf('piper:de_DE-kerstin-low')).rejects.toThrow(/does not speak/);
  });

  it('refuses an id that is not in the catalogue at all', async () => {
    await expect(speakOf('piper:en_GB-someone-medium')).rejects.toThrow(/not in the catalogue/);
  });

  async function speakOf(vid: string) {
    const { speak } = await import('../src/index.js');
    return speak('Hallo', vid);
  }
});
