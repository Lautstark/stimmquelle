/**
 * Everything that happens to a recording after something has spoken it: trim
 * the silence off both ends, level it, write a WAV.
 *
 * In a container that is one call to ffmpeg. In a tab there is no ffmpeg, and
 * the obvious replacement cannot be used: the newest `@ffmpeg/core` is built
 * from ffmpeg 5.1.4, whose `loudnorm` gets the gain wrong by about 13 dB on
 * half of all short sentences, silently. CONTRACT.md §6 has the measurement.
 *
 * So this is a second implementation of a chain that already exists, and what
 * makes that allowable rather than reckless is that it is checked against the
 * first one — see `conformance/` and CONTRACT.md §7.
 *
 * **Deliberately free of the browser.** No AudioContext, no DOM, no fetch. Web
 * Audio would do the decoding and the resampling in a line each, and then this
 * file could only run where there is a window, which is exactly where comparing
 * it against ffmpeg is hardest. Plain arrays instead, so node runs the same
 * code the tab does — measured byte-identical across twenty sentences.
 *
 * Ported from vorlaut's `static/tts/level.js`, which is where all of the above
 * was worked out and measured.
 */
import { TARGET_LUFS, TARGET_PEAK_DBTP, TRIM } from './contract.js';

/** How the chain may be varied. Everything omitted follows CONTRACT.md. */
export interface LevelOptions {
  /** Output sample rate. mitreden wants 44100; vorlaut's device wants 16000. */
  rate?: number;
  /**
   * A short fade at each end, in seconds. **Not part of the contract** — a
   * device extra against clicks on a class-D amplifier. vorlaut uses 0.012.
   */
  fadeSec?: number;
  /**
   * Quiet appended, in seconds. **Not part of the contract** — a device extra
   * so an amplifier does not switch off mid-syllable. vorlaut uses 0.06.
   */
  padSec?: number;
  /** Overrides for the trim. Changing these changes what gets measured. */
  thresholdDb?: number;
  keepHeadSec?: number;
  keepTailSec?: number;
}

export interface Levelled {
  /** The finished file, 16 bit PCM, one channel. */
  readonly wav: Uint8Array;
  readonly rate: number;
  readonly seconds: number;
  /** What the trimmed recording measured before the gain was applied. */
  readonly lufs: number;
  readonly gainDb: number;
  /** True when the ceiling, not the target, decided the gain. */
  readonly clamped: boolean;
  /** True peak of the finished file, in dBTP. Never above the ceiling. */
  readonly peakDb: number;
}

// --- WAV in ------------------------------------------------------------------

const magic = (view: DataView, at: number): string =>
  String.fromCharCode(view.getUint8(at), view.getUint8(at + 1),
                      view.getUint8(at + 2), view.getUint8(at + 3));

/**
 * The samples and the rate out of a RIFF/WAVE file, as one mono track.
 *
 * Written out rather than handed to `decodeAudioData` for the reason at the top
 * of this file. The two synthesisers deliver exactly two shapes — piper writes
 * 16 bit PCM, Azure is asked for `riff-16khz-16bit-mono-pcm` — but float and
 * 24 bit are handled anyway, because they cost four lines and turn "why is it
 * silent" into an error message if a third source ever appears.
 */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; rate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (magic(view, 0) !== 'RIFF' || magic(view, 8) !== 'WAVE') throw new Error('not a RIFF/WAVE file');

  let format = 0, channels = 0, rate = 0, bits = 0;
  let data: { at: number; size: number } | null = null;
  // Chunk by chunk rather than assuming fmt at 12 and data at 36: piper's
  // header is that plain, Azure's has a LIST chunk in between.
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const id = magic(view, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      rate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      data = { at: body, size: Math.min(size, bytes.byteLength - body) };
    }
    at = body + size + (size % 2);        // chunks are padded to even length
  }
  if (!rate || !data || !channels) throw new Error('WAVE file without fmt or data');

  const float = format === 3;
  const width = bits / 8;
  const frames = Math.floor(data.size / (width * channels));
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const at = data.at + (i * channels + c) * width;
      if (float) sum += bits === 64 ? view.getFloat64(at, true) : view.getFloat32(at, true);
      else if (bits === 16) sum += view.getInt16(at, true) / 32768;
      else if (bits === 24) sum += (view.getUint8(at) | (view.getUint8(at + 1) << 8)
                                    | (view.getInt8(at + 2) << 16)) / 8388608;
      else if (bits === 32) sum += view.getInt32(at, true) / 2147483648;
      else if (bits === 8) sum += (view.getUint8(at) - 128) / 128;
      else throw new Error(`WAVE with ${bits} bit samples`);
    }
    out[i] = sum / channels;              // mixed down, not first channel
  }
  return { samples: out, rate };
}

// --- WAV out -----------------------------------------------------------------

/** 16 bit PCM, one channel, the given rate. */
export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);           // fmt chunk length
  view.setUint16(20, 1, true);            // PCM
  view.setUint16(22, 1, true);            // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);     // bytes per second
  view.setUint16(32, 2, true);            // bytes per frame
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    // Asymmetric on purpose: -1 has an integer, +1 does not, and rounding +1 to
    // 32768 wraps to the loudest possible negative sample — a click.
    view.setInt16(44 + i * 2, Math.round(v < 0 ? v * 32768 : v * 32767), true);
  }
  return bytes;
}

// --- Resampling --------------------------------------------------------------

const sinc = (x: number): number => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * How many zero crossings of the sinc are kept either side. Generous for a
 * second and a half of speech, and nowhere near the cost of the synthesiser.
 */
const ZEROS = 24;

/**
 * Above this the repeat is so long that precomputing it is the wasteful way
 * round — which happens only for two rates with no common factor worth the
 * name. Then the arithmetic is done per sample instead.
 */
const MAX_PHASES = 4096;

interface Phase { start: number; taps: Float64Array; norm: number }
interface Kernels { phaseCount: number; stride: number; phases: Phase[] }

const kernelCache = new Map<string, Kernels | null>();

/**
 * Every kernel a pair of rates ever needs, worked out once.
 *
 * The taps depend only on where an output sample falls between two input
 * samples, and with whole-number rates there are only so many of those places:
 * 22,050 to 16,000 is 441 input samples to 320 output ones, and then it
 * repeats. So there are 320 kernels rather than one per output sample, and the
 * sines and cosines — which are what actually costs — are computed 320 times
 * instead of twenty thousand.
 *
 * Measured on a two-second sentence: 866 ms of levelling became 78 ms, and a
 * browser came down from five seconds. Tablets are where this runs, and they
 * are not M-series Macs.
 */
function kernels(inRate: number, outRate: number): Kernels | null {
  const key = `${inRate}>${outRate}`;
  const known = kernelCache.get(key);
  if (known !== undefined) return known;

  const common = gcd(inRate, outRate);
  const phaseCount = outRate / common;
  const stride = inRate / common;
  if (phaseCount > MAX_PHASES) {
    kernelCache.set(key, null);
    return null;
  }
  const fc = 0.5 * Math.min(1, outRate / inRate);
  const halfWidth = ZEROS / (2 * fc);
  const phases: Phase[] = [];
  for (let r = 0; r < phaseCount; r++) {
    const exact = (r * stride) / phaseCount;
    const whole = Math.floor(exact);
    const offset = exact - whole;
    const first = Math.ceil(offset - halfWidth);
    const last = Math.floor(offset + halfWidth);
    const taps = new Float64Array(last - first + 1);
    let norm = 0;
    for (let k = first; k <= last; k++) {
      const t = k - offset;
      const angle = (Math.PI * t) / halfWidth;
      const h = 2 * fc * sinc(2 * fc * t)
        * (0.42 + 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle));
      taps[k - first] = h;
      norm += h;
    }
    phases.push({ start: whole + first, taps, norm });
  }
  const built = { phaseCount, stride, phases };
  kernelCache.set(key, built);
  return built;
}

/**
 * Windowed-sinc resampling, any ratio.
 *
 * Needed twice and for different reasons: piper's medium models speak at
 * 22.05 kHz and a consumer may want 16 or 44.1, and the loudness measurement is
 * only defined at 48 kHz. Linear interpolation would do neither — going down to
 * 16 kHz without a low pass folds everything above 8 kHz back into the speech
 * as noise, and it is the loud consonants that get folded.
 */
export function resample(x: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate || x.length === 0) return x;
  const outLen = Math.max(1, Math.round((x.length * outRate) / inRate));
  const y = new Float32Array(outLen);
  const built = kernels(inRate, outRate);
  if (built === null) return resampleSlowly(x, inRate, outRate, y);

  const { phaseCount, stride, phases } = built;
  for (let i = 0, r = 0, block = 0; i < outLen; i++) {
    const phase = phases[r];
    const taps = phase.taps;
    const from = block * stride + phase.start;
    let sum = 0;
    for (let n = 0; n < taps.length; n++) {
      const j = from + n;
      // Outside the signal counts as silence, and still counts towards norm:
      // dividing by only the taps that landed inside would amplify the first
      // and last few samples instead of letting them fade.
      if (j >= 0 && j < x.length) sum += x[j] * taps[n];
    }
    y[i] = phase.norm ? sum / phase.norm : 0;
    if (++r === phaseCount) { r = 0; block++; }
  }
  return y;
}

function resampleSlowly(x: Float32Array, inRate: number, outRate: number, y: Float32Array): Float32Array {
  const ratio = outRate / inRate;
  const fc = 0.5 * Math.min(1, ratio);
  const halfWidth = ZEROS / (2 * fc);
  for (let i = 0; i < y.length; i++) {
    const centre = i / ratio;
    let sum = 0, norm = 0;
    for (let j = Math.ceil(centre - halfWidth); j <= Math.floor(centre + halfWidth); j++) {
      const t = j - centre;
      const angle = (Math.PI * t) / halfWidth;
      const h = 2 * fc * sinc(2 * fc * t)
        * (0.42 + 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle));
      norm += h;
      if (j >= 0 && j < x.length) sum += x[j] * h;
    }
    y[i] = norm ? sum / norm : 0;
  }
  return y;
}

// --- Trim, fade, pad ---------------------------------------------------------

/**
 * Both ends at once: cut until the first sample louder than the threshold, then
 * hand a little of the quiet back. Once forwards and once backwards, each with
 * its own allowance — a word needs longer to ring out than it needs to start,
 * which is why the contract's two keeps are separate numbers even though they
 * are currently equal.
 */
export function trim(x: Float32Array, rate: number, o: LevelOptions = {}): Float32Array {
  const threshold = Math.pow(10, (o.thresholdDb ?? TRIM.thresholdDb) / 20);
  let a = 0, b = x.length - 1;
  while (a < x.length && Math.abs(x[a]) <= threshold) a++;
  while (b > a && Math.abs(x[b]) <= threshold) b--;
  // Nothing above the threshold anywhere. ffmpeg would hand back an empty
  // stream; a zero-length WAV is a worse answer than the silence itself, which
  // at least plays and shows up as a mistake in the recording.
  if (a >= b) return x;
  const from = Math.max(0, a - Math.round((o.keepHeadSec ?? TRIM.keepHeadSec) * rate));
  const to = Math.min(x.length, b + Math.round((o.keepTailSec ?? TRIM.keepTailSec) * rate) + 1);
  return x.subarray(from, to);
}

/** A linear fade at both ends, against the click of a waveform starting away from zero. */
export function fadeEnds(x: Float32Array, rate: number, seconds: number): Float32Array {
  const n = Math.min(Math.round(seconds * rate), Math.floor(x.length / 2));
  const y = Float32Array.from(x);
  for (let i = 0; i < n; i++) {
    const g = i / n;
    y[i] *= g;
    y[y.length - 1 - i] *= g;
  }
  return y;
}

/** A little quiet at the end, before an amplifier switches off. */
export function pad(x: Float32Array, rate: number, seconds: number): Float32Array {
  const y = new Float32Array(x.length + Math.round(seconds * rate));
  y.set(x, 0);
  return y;
}

// --- Loudness ----------------------------------------------------------------

function biquad(x: Float32Array, b0: number, b1: number, b2: number, a1: number, a2: number): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * Integrated loudness to ITU-R BS.1770-4, in LUFS.
 *
 * The two filters are the K weighting: a shelf for the head, then a high pass.
 * Their coefficients are the published 48 kHz ones, **so the caller has to hand
 * this a 48 kHz signal.** Measuring at another rate is wrong, not approximate.
 *
 * Then 400 ms blocks overlapping by three quarters, and the two gates that make
 * this *integrated* rather than an average: below −70 LUFS is not programme
 * material, and more than 10 LU below what is left is a pause. Without them the
 * silence deliberately kept by the trim would drag the answer down and every
 * sentence would come out too loud.
 */
export function integratedLufs(x: Float32Array): number {
  let k = biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285,
                 -1.69065929318241, 0.73248077421585);
  k = biquad(k, 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
  const block = Math.round(0.4 * 48000), step = Math.round(0.1 * 48000);
  const power: number[] = [];
  for (let s = 0; s + block <= k.length; s += step) {
    let sum = 0;
    for (let i = s; i < s + block; i++) sum += k[i] * k[i];
    power.push(sum / block);
  }
  // Shorter than one block — a hard-trimmed "Ja!" can be. Measure what there is
  // rather than refusing: BS.1770 has nothing to say about it, and an
  // unlevelled word among levelled ones is the failure this exists to stop.
  if (!power.length && k.length) {
    let sum = 0;
    for (let i = 0; i < k.length; i++) sum += k[i] * k[i];
    power.push(sum / k.length);
  }
  if (!power.length) return -Infinity;
  const loudness = (v: number) => -0.691 + 10 * Math.log10(v || 1e-12);
  const mean = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  let gated = power.filter(v => loudness(v) > -70);
  if (!gated.length) return -Infinity;
  const relative = loudness(mean(gated)) - 10;
  gated = gated.filter(v => loudness(v) > relative);
  return gated.length ? loudness(mean(gated)) : -Infinity;
}

/**
 * True peak in dBTP: the loudest point of the waveform *between* the samples,
 * not the loudest sample. Four times oversampled, which is what BS.1770-4 asks
 * for at these rates.
 *
 * It matters more at 16 kHz than at 44.1: a peak sitting between two samples
 * can be most of a dB above both of them, and a ceiling of −1.5 exists to leave
 * room for exactly that.
 */
export function truePeakDb(x: Float32Array, rate: number): number {
  const dense = resample(x, rate, rate * 4);
  let peak = 0;
  for (let i = 0; i < dense.length; i++) peak = Math.max(peak, Math.abs(dense[i]));
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  return 20 * Math.log10(peak || 1e-12);
}

// --- The whole chain ---------------------------------------------------------

/**
 * A synthesiser's WAV in, a finished WAV out.
 *
 * Trim, then the device extras if any, then level — levelling last, so it
 * measures what the trim actually left rather than the silence that went in.
 *
 * The gain is **one static gain for the whole sentence**, pulled back if it
 * would breach the ceiling. That is a clamp and not a limiter, and it is
 * deliberate. A limiter was written and measured: it lands closer to −16 LUFS
 * than ffmpeg does, and that is the argument *against* it. Two halves of one
 * product speak the same sentences into the same cache, and a browser that
 * levels better than the container is a device on which the sentence recorded
 * yesterday is quieter than the one recorded today. The container is the
 * oracle, not the target. CONTRACT.md §1.
 *
 * Numbers come back with the bytes, because a levelling nobody can check is how
 * 13 dB of error in ffmpeg.wasm stayed invisible for three years.
 */
export function postprocess(wavBytes: Uint8Array, o: LevelOptions = {}): Levelled {
  const rate = o.rate ?? 44100;
  const { samples, rate: inRate } = decodeWav(wavBytes);

  let shaped = trim(samples, inRate, o);
  if (o.fadeSec) shaped = fadeEnds(shaped, inRate, o.fadeSec);
  if (o.padSec) shaped = pad(shaped, inRate, o.padSec);

  // Measured at the rate it was spoken at, not at the output rate: the K
  // weighting reaches above 8 kHz, and measuring after a downsample to 16 kHz
  // would quietly leave that energy out of the answer.
  const lufs = integratedLufs(resample(shaped, inRate, 48000));

  const out = resample(shaped, inRate, rate);

  // The peak is measured on the finished signal, after the resample rather than
  // before it: resampling can push a peak higher than anything in the input,
  // and a ceiling checked beforehand would be a ceiling the output can exceed.
  let gainDb = TARGET_LUFS - lufs;
  const peakDb = truePeakDb(out, rate);
  const headroom = TARGET_PEAK_DBTP - peakDb;
  const clamped = gainDb > headroom;
  if (clamped) gainDb = headroom;

  const gain = Math.pow(10, gainDb / 20);
  const levelled = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) levelled[i] = out[i] * gain;

  return {
    wav: encodeWav(levelled, rate),
    rate,
    seconds: levelled.length / rate,
    lufs,
    gainDb,
    clamped,
    peakDb: peakDb + gainDb,
  };
}
