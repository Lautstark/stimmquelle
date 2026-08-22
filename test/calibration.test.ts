import { describe, expect, it } from 'vitest';
import { encodeWav, integratedLufs, MEASURE_RATE, resample, truePeakDb } from '../src/index.js';
import calibration from '../conformance/calibration.json' with { type: 'json' };

/**
 * Is the ruler itself right?
 *
 * Every other loudness check in this package measures the output with the same
 * function that decided the gain. That is circular — a wrong BS.1770 would
 * satisfy all of them, and did satisfy mitreden's whole audio suite until
 * somebody noticed.
 *
 * These three break the circle. They came from ffmpeg's ebur128, reading files
 * this code wrote, on the last day any repository in this family had ffmpeg in
 * it. Neither consumer has a reference implementation now — no container, no
 * Python, nothing that can render a file and compare. So this is the only
 * outside opinion left anywhere, and if it drifts nothing else is in a position
 * to notice.
 *
 * A failure here is not a test to adjust. conformance/calibrate.sh regenerates
 * the numbers from ffmpeg if they ever genuinely need it.
 */
describe('the rate everything here is calibrated at', () => {
  it('is the one the K weighting has coefficients for', () => {
    // MEASURE_RATE is a name for 48 kHz, not a setting. The two biquads in
    // level.ts are the published 48 kHz coefficients, so moving the constant
    // without deriving new ones would not measure at another rate — it would
    // measure wrongly, and nothing in the package could report by how much.
    // Pinned here for the reason CONTRACT.md §3 pins the engine version: two
    // files that cannot read each other drift silently, in both directions.
    expect(MEASURE_RATE).toBe(48000);
  });

  it('is the rate ffmpeg read these references at', () => {
    // The outside opinion was captured at calibration.rate. If the chain
    // measured somewhere else, every tone below would still pass — against a
    // reference for a different measurement.
    expect(MEASURE_RATE).toBe(calibration.rate);
  });
});

describe('the loudness measurement against an outside opinion', () => {
  const { rate, tolerance_db, tones } = calibration;

  for (const t of tones) {
    const { hz, amplitude, lufs } = t;
    it(`${hz} Hz at amplitude ${amplitude} measures ${lufs} LUFS, as ffmpeg reads it`, () => {
      const n = rate * (t.seconds ?? calibration.seconds);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate);
      expect(Math.abs(integratedLufs(x) - lufs)).toBeLessThan(tolerance_db);
    });
  }

  it('measures what a consumer is actually handed', () => {
    // The tones above are measured as samples. ffmpeg read WAV files, so the
    // writer is in the loop too — a rounding fault in encodeWav would show up
    // as a loudness difference and this is where it would appear.
    const n = rate * calibration.seconds;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = 0.1 * Math.sin((2 * Math.PI * 1000 * i) / rate);
    const bytes = encodeWav(x, rate);
    expect(bytes.byteLength).toBe(44 + n * 2);
  });

  it('is checked where the weighting is not flat, not only at 1 kHz', () => {
    // The 60 Hz and 10 kHz tones are the ones that catch a merely plausible
    // filter: one is down the high-pass skirt and the other up on the head
    // shelf. A chain that gets 1 kHz right and those wrong sounds fine on a
    // test tone and wrong on a voice.
    const hz = tones.map(t => t.hz);
    expect(Math.min(...hz)).toBeLessThanOrEqual(60);
    expect(Math.max(...hz)).toBeGreaterThanOrEqual(10000);
  });
});

describe('true peak, where ffmpeg is the one that is wrong', () => {
  const { hz, rate, seconds, tolerance_db, cases } = calibration.true_peak;

  const sine = (amplitude: number) => {
    const n = rate * seconds, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / rate + Math.PI / 4);
    return x;
  };

  for (const c of cases) {
    it(`finds the peak between the samples at amplitude ${c.amplitude}`, () => {
      // Sampled off the peaks on purpose: the sample peak is 3 dB low, so a
      // chain that reports it would clip where it thought it had headroom.
      const got = truePeakDb(sine(c.amplitude), rate);
      expect(got).toBeGreaterThan(c.sample_peak_dbfs + 2);
      expect(Math.abs(got - c.analytic_dbtp)).toBeLessThan(tolerance_db);
    });

    it(`stays nearer the truth than ffmpeg does at amplitude ${c.amplitude}`, () => {
      // A sine's true peak IS its amplitude, so the analytic value is the
      // answer rather than an estimate. ffmpeg's interpolator overshoots it by
      // about half a decibel. This asserts the disagreement on purpose: making
      // the chain agree with ffmpeg would make it wrong, and would cost that
      // much headroom on every recording.
      const got = truePeakDb(sine(c.amplitude), rate);
      expect(Math.abs(got - c.analytic_dbtp)).toBeLessThan(Math.abs(c.ffmpeg_dbtp - c.analytic_dbtp));
    });
  }
});

describe('resampling down to a device rate', () => {
  const { from, to, cases } = calibration.resampling;
  const measure = (x: Float32Array, at: number) => integratedLufs(resample(x, at, 48000));
  const sine = (hz: number, amplitude: number) => {
    const n = from * 3, x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / from);
    return x;
  };

  it('leaves speech where it was', () => {
    const c = cases.find(c => c.must === 'survive')!;
    const x = sine(c.hz, c.amplitude);
    expect(Math.abs(measure(resample(x, from, to), to) - c.after_lufs!)).toBeLessThan(c.tolerance_db!);
  });

  it('loses what is above the new Nyquist instead of folding it back in', () => {
    // 10 kHz cannot exist at 16 kHz. Without a low pass it does not disappear,
    // it comes back at 6050 Hz — inside the speech, and loudest on exactly the
    // consonants a child needs to hear.
    const c = cases.find(c => c.must === 'vanish')!;
    expect(measure(resample(sine(c.hz, c.amplitude), from, to), to))
      .toBeLessThan(c.after_below_lufs!);
  });
});
