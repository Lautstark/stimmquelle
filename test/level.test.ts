import { describe, expect, it, vi } from 'vitest';
import {
  decodeWav, encodeWav, integratedLufs, limitTruePeak, postprocess, resample,
  TARGET_LUFS, TARGET_PEAK_DBTP, trim, truePeakDb,
} from '../src/index.js';
import { MAX_GAIN_DB } from '../src/level.js';

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

  it('holds the ceiling by limiting the peak, not by giving up loudness', () => {
    // A quiet sentence with one loud consonant. The gain that reaches the target
    // would breach the ceiling, and the ceiling used to win — the recording came
    // out quiet and said so with `clamped`. Now the peak moves and the loudness
    // does not, which is the whole change: CONTRACT.md §1, PIPELINE_VERSION 2.
    const rate = 22050;
    const x = new Float32Array(rate * 2);
    for (let i = 0; i < x.length; i++) x[i] = 0.005 * Math.sin((2 * Math.PI * 220 * i) / rate);
    for (let i = 0; i < 200; i++) x[rate + i] = 0.99;
    const out = postprocess(encodeWav(x, rate), { rate: 16000 });
    expect(out.clamped, 'the limiter should have engaged').toBe(true);
    expect(out.limitedDb).toBeGreaterThan(0);
    expect(out.peakDb).toBeLessThanOrEqual(TARGET_PEAK_DBTP + 0.05);
    // And it still arrives at the target, which is the part that used to fail.
    const w = decodeWav(out.wav);
    const got = integratedLufs(resample(w.samples, w.rate, 48000));
    expect(Math.abs(got - TARGET_LUFS)).toBeLessThan(1);
  });

  it('lands a peaky voice and a smooth one at the same loudness', () => {
    // The regression this replaced, in the small: de_DE-kerstin-low measured
    // 3.0 dB quieter than de_DE-thorsten-medium through the identical chain,
    // both marked levelled, because she is peakier and the ceiling took her gain
    // away. Two voices at two volumes is the failure levelling exists to stop.
    const rate = 22050, n = rate * 2;
    const smooth = new Float32Array(n);
    const peaky = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = Math.sin((2 * Math.PI * 220 * i) / rate);
      smooth[i] = 0.08 * s;
      // Same body, with transients ten times its height every 200 ms.
      peaky[i] = 0.08 * s * (i % Math.round(rate * 0.2) < 60 ? 10 : 1);
    }
    const measure = (x: Float32Array) => {
      const w = decodeWav(postprocess(encodeWav(x, rate), { rate: 16000 }).wav);
      return integratedLufs(resample(w.samples, w.rate, 48000));
    };
    expect(Math.abs(measure(smooth) - measure(peaky))).toBeLessThan(0.5);
  });

  it('reports what it did, because a levelling nobody can check hides 13 dB', () => {
    const out = postprocess(tone(2, 0.1), { rate: 16000 });
    expect(out.lufs).toBeLessThan(0);
    expect(Number.isFinite(out.gainDb)).toBe(true);
    expect(out.seconds).toBeGreaterThan(0);
  });
});

describe('a recording with almost nothing in it', () => {
  /*
   * The levelling is the one stage that can make something louder than it
   * arrived, and until this was written it had no idea when to stop. Below the
   * −70 LUFS gate the measurement is −Infinity, the gain +Infinity, and every
   * sample ±Infinity or NaN — which `toPcm16` clamps to full scale. A breath of
   * an answer from a synthesiser played on a child's talker as a full-scale
   * square wave.
   */
  const fullScale = (wav: Uint8Array): number =>
    decodeWav(wav).samples.filter((v) => Math.abs(v) > 0.99).length;
  const allFinite = (x: Float32Array): boolean => x.every((v) => Number.isFinite(v));

  it('hands a tone under the gate on unlevelled rather than as a square wave', () => {
    // −68 dBFS: under the trim threshold, so nothing is cut, and under the
    // absolute gate once its RMS is counted.
    const out = postprocess(tone(1, Math.pow(10, -68 / 20)), { rate: 16000 });
    expect(out.lufs).toBe(-Infinity);
    expect(out.gainDb).toBe(0);
    expect(allFinite(out.samples)).toBe(true);
    expect(fullScale(out.wav)).toBe(0);
    expect(out.peakDb).toBeLessThan(-60);
  });

  it('hands pure silence on as silence, not as NaN', () => {
    const out = postprocess(encodeWav(new Float32Array(22050), 22050), { rate: 16000 });
    expect(out.gainDb).toBe(0);
    expect(allFinite(out.samples)).toBe(true);
    expect(decodeWav(out.wav).samples.every((v) => v === 0)).toBe(true);
  });

  it('raises a quiet one by no more than the cap, and says it fell short', () => {
    // −60 dBFS measures about −63.7 LUFS and asks for 47.7 dB. It gets the
    // cap, and the shortfall is visible in the numbers rather than in a hiss.
    const out = postprocess(tone(1, Math.pow(10, -60 / 20)), { rate: 16000 });
    expect(Number.isFinite(out.lufs)).toBe(true);
    expect(out.gainDb).toBe(MAX_GAIN_DB);
    expect(out.lufs + out.gainDb).toBeLessThan(TARGET_LUFS - 5);
    expect(allFinite(out.samples)).toBe(true);
    expect(fullScale(out.wav)).toBe(0);
  });

  it('leaves a recording that needs less than the cap exactly where it was', () => {
    // The cap must not touch anything that ever levelled correctly — which is
    // why it needs no PIPELINE_VERSION bump.
    const out = postprocess(tone(2, 0.01), { rate: 16000 });
    expect(out.gainDb).toBeLessThan(MAX_GAIN_DB);
    const got = integratedLufs(resample(decodeWav(out.wav).samples, 16000, 48000));
    expect(Math.abs(got - TARGET_LUFS)).toBeLessThan(0.5);
  });
});

describe('the gain it reports', () => {
  it('is the gain the audio received, even when the limiter runs out of passes', () => {
    /* A quiet tone with one short burst far above it: the limiter engages on
       every pass and the shortfall never drops under 0.1 dB, so the loop ends
       by running out. It used to add the last shortfall after the last
       application, and reported 26.95 dB on this signal while the audio had
       received 17.10. Read off a stretch the limiter never touched, at the
       input's own rate so no resampler stands between the two. */
    const rate = 16000;
    const x = new Float32Array(rate * 2);
    for (let i = 0; i < x.length; i++) x[i] = 0.005 * Math.sin((2 * Math.PI * 220 * i) / rate);
    for (let i = 0; i < 200; i++) x[rate + i] = 0.9 * Math.sin((2 * Math.PI * 300 * i) / rate);
    const wav = encodeWav(x, rate);
    const out = postprocess(wav, { rate });
    expect(out.clamped).toBe(true);

    const input = decodeWav(wav).samples;
    let cross = 0, power = 0;
    for (let i = 100; i < 300; i++) {
      cross += out.samples[i] * input[i];
      power += input[i] * input[i];
    }
    expect(out.gainDb).toBeCloseTo(20 * Math.log10(cross / power), 2);
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

  /** A float WAV, written by hand, optionally in the extensible wrapper. */
  const floatWav = (x: Float32Array, extensible: boolean): Uint8Array => {
    const fmtSize = extensible ? 40 : 16;
    const bytes = new Uint8Array(12 + 8 + fmtSize + 8 + x.length * 4);
    const view = new DataView(bytes.buffer);
    const text = (at: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
    };
    text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE');
    text(12, 'fmt '); view.setUint32(16, fmtSize, true);
    view.setUint16(20, extensible ? 0xfffe : 3, true);
    view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
    view.setUint32(28, 64000, true); view.setUint16(32, 4, true); view.setUint16(34, 32, true);
    if (extensible) {
      view.setUint16(36, 22, true); view.setUint16(38, 32, true); view.setUint32(40, 4, true);
      view.setUint16(44, 3, true);          // the sub-format GUID starts with the real code
    }
    const data = 20 + fmtSize;
    text(data, 'data'); view.setUint32(data + 4, x.length * 4, true);
    for (let i = 0; i < x.length; i++) view.setFloat32(data + 8 + i * 4, x[i], true);
    return bytes;
  };

  it('reads float inside WAVE_FORMAT_EXTENSIBLE as float, not as integers', () => {
    const x = new Float32Array([0, 0.5, -0.25]);
    for (const extensible of [false, true]) {
      const { samples } = decodeWav(floatWav(x, extensible));
      expect([...samples]).toEqual([...x]);
    }
  });

  it('says what it cannot read instead of failing on an array length', () => {
    const wav = encodeWav(new Float32Array(4), 16000);
    new DataView(wav.buffer).setUint16(34, 0, true);          // zero bits per sample
    expect(() => decodeWav(wav)).toThrow(/0 bit/);
    const law = encodeWav(new Float32Array(4), 16000);
    new DataView(law.buffer).setUint16(20, 7, true);          // µ-law
    expect(() => decodeWav(law)).toThrow(/format 7/);
  });
});

describe('a rate that is not a rate', () => {
  const rate = 22050;
  const x = new Float32Array(rate);
  for (let i = 0; i < x.length; i++) x[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / rate);
  const wav = encodeWav(x, rate);

  it('refuses rather than returning a 44 byte file with nothing in it', () => {
    // This was reachable: Azure's prosody rate, "-5%", passed where the sample
    // rate goes. It did not throw. It returned a valid WAV header with no audio
    // under it, which plays as silence and reports nothing — on a talker, a key
    // a child presses that makes no sound.
    for (const bad of ['-5%', 0, -16000, NaN, Infinity, null]) {
      expect(() => postprocess(wav, { rate: bad as unknown as number }), String(bad)).toThrow(TypeError);
    }
  });

  it('still lets a caller leave it out', () => {
    // Not specifying a rate is not the same as specifying a bad one, and the
    // guard must not turn the default into an error.
    expect(postprocess(wav).rate).toBe(44100);
    expect(postprocess(wav, {}).rate).toBe(44100);
  });

  it('refuses a numeric string too, so the failure does not depend on the string', () => {
    // '44100' would have worked by coercion while '-5%' produced silence. One
    // rule for both is worth more than being lenient about one of them.
    expect(() => postprocess(wav, { rate: '44100' as unknown as number })).toThrow(TypeError);
  });

  it('guards the pieces as well as the whole chain', () => {
    expect(() => encodeWav(x, 0)).toThrow(TypeError);
    expect(() => resample(x, 22050, -1)).toThrow(TypeError);
  });
});

describe('the device extras, which default off', () => {
  const rate = 16000;
  const n = rate * 2;
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / rate);
  const wav = encodeWav(x, rate);

  it('adds nothing unless asked', () => {
    // The contract's chain is trim and level. A fade and a tail pad are
    // vorlaut's amplifier, not the family's agreement.
    const plain = postprocess(wav, { rate });
    const padded = postprocess(wav, { rate, padSec: 0.06 });
    expect(padded.samples.length - plain.samples.length).toBe(Math.round(0.06 * rate));
  });

  it('fades without changing what the loudness measures', () => {
    // Both extras are permitted precisely because they do not move the level.
    // If they did, the two products would disagree about how loud a sentence is
    // while both believing they had followed the contract.
    const plain = postprocess(wav, { rate });
    const faded = postprocess(wav, { rate, fadeSec: 0.012 });
    expect(Math.abs(faded.lufs - plain.lufs)).toBeLessThan(0.1);
    expect(faded.samples[0]).toBe(0);
  });

  it('is the path vorlaut actually uses', () => {
    // 16 kHz mono, a 12 ms fade at each end and 60 ms of quiet after, because
    // of what the MAX98357A does when it switches off mid-syllable.
    const out = postprocess(wav, { rate: 16000, fadeSec: 0.012, padSec: 0.06 });
    expect(out.rate).toBe(16000);
    expect(out.peakDb).toBeLessThanOrEqual(TARGET_PEAK_DBTP + 0.05);
    expect(Math.abs(out.lufs - TARGET_LUFS)).toBeLessThan(25);
    const tail = out.samples.subarray(out.samples.length - Math.round(0.05 * rate));
    expect(tail.every(v => v === 0)).toBe(true);
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

describe('an Azure region that is not one', () => {
  /* The region is pasted into the hostname and the key goes in a header to
     wherever that resolves. `evil.example/x#` made it somebody else's server. */
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    void init;
    return new Response(url.endsWith('/list') ? '[]' : new Uint8Array(0));
  });

  async function azure(region: string) {
    const { azureVoices, speak } = await import('../src/index.js');
    vi.stubGlobal('fetch', fetch);
    fetch.mockClear();
    try {
      const options = { azure: { key: 'geheim', region } };
      const voices = await azureVoices(options.azure).then(() => 'ok', (e: Error) => e);
      const spoken = await speak('Hallo', 'azure:de-DE-KatjaNeural', options)
        .then(() => 'ok', (e: Error) => e);
      return { voices, spoken, urls: fetch.mock.calls.map(([url]) => url) };
    } finally {
      vi.unstubAllGlobals();
    }
  }

  it('never sends the key anywhere a region did not name', async () => {
    for (const region of ['evil.example/x#', 'evil.example?', 'westeurope.evil.example',
      'west europe', '', 'westeurope/']) {
      const { voices, spoken, urls } = await azure(region);
      expect(urls, region).toEqual([]);
      expect(voices, region).toBeInstanceOf(TypeError);
      expect(spoken, region).toBeInstanceOf(TypeError);
      expect(String(spoken), region).toMatch(/not an Azure region/);
    }
  });

  it('still reaches a real region, in whatever case it was stored', async () => {
    const { urls } = await azure('WestEurope');
    expect(urls).toEqual([
      'https://westeurope.tts.speech.microsoft.com/cognitiveservices/voices/list',
      'https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1',
    ]);
  });
});

describe('the limiter itself', () => {
  const rate = 22050;

  it('leaves a signal already under the ceiling completely alone', () => {
    const x = new Float32Array(rate);
    for (let i = 0; i < x.length; i++) x[i] = 0.1 * Math.sin((2 * Math.PI * 220 * i) / rate);
    const { samples, reducedDb } = limitTruePeak(x, rate, TARGET_PEAK_DBTP);
    expect(reducedDb).toBe(0);
    for (let i = 0; i < x.length; i++) expect(samples[i]).toBe(x[i]);
  });

  it('holds the true peak under the ceiling, not just the sample peak', () => {
    // The peak between two samples is the one that matters, and it is why the
    // gain is worked out on a four-times oversampled copy. A limiter that only
    // looked at samples would leave the ceiling breached exactly where a −1.5 dB
    // ceiling exists to leave room.
    const x = new Float32Array(rate);
    for (let i = 0; i < x.length; i++) {
      x[i] = 0.95 * Math.sin((2 * Math.PI * 4000 * i) / rate + Math.PI / 4);
    }
    const { samples } = limitTruePeak(x, rate, TARGET_PEAK_DBTP);
    expect(truePeakDb(samples, rate)).toBeLessThanOrEqual(TARGET_PEAK_DBTP + 0.05);
  });

  it('reports how far it pulled anything down', () => {
    const x = new Float32Array(rate);
    for (let i = 0; i < x.length; i++) x[i] = 0.99 * Math.sin((2 * Math.PI * 220 * i) / rate);
    expect(limitTruePeak(x, rate, TARGET_PEAK_DBTP).reducedDb).toBeGreaterThan(1);
  });
});
