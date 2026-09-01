/**
 * The numbers CONTRACT.md is normative about, in one place so that a consumer
 * reading the document can find them in the code without hunting.
 *
 * Changing any of these changes what every consumer's recordings sound like, so
 * a change here means bumping PIPELINE_VERSION and re-rendering everything.
 */

/** CONTRACT.md §1. */
export const TARGET_LUFS = -16;
/** CONTRACT.md §1. Not 0 dBFS: the headroom is for inter-sample peaks. */
export const TARGET_PEAK_DBTP = -1.5;

/** CONTRACT.md §2. Device extras — a fade, a tail pad — are *not* in here. */
export const TRIM = Object.freeze({
  thresholdDb: -50,
  keepHeadSec: 0.05,
  keepTailSec: 0.05,
});

/**
 * Where loudness is measured, and the rate `integratedLufs` must be handed.
 *
 * **A name for 48 kHz, not a setting.** The K-weighting coefficients in
 * `level.ts` are the published 48 kHz ones, so moving this number without
 * deriving new ones would not measure at a different rate — it would measure
 * wrongly, and by an amount nothing in the package could report. The
 * conformance references were captured from ffmpeg at this rate too, so they
 * would stop meaning anything at the same moment.
 *
 * A test pins it, in the same way and for the same reason CONTRACT.md §3 pins
 * the engine version: two files that cannot read each other drift silently.
 */
export const MEASURE_RATE = 48000;

/**
 * What this package is, so a copy of it can say so.
 *
 * mitreden has no package manager and vendors `dist/browser/index.js` by hand,
 * which means the one thing it cannot otherwise answer is which version it has.
 * A file that cannot identify itself gets updated by whoever remembers.
 *
 * Written down here rather than read from `package.json`, for the same reason
 * every other constant is: the bundle has no disk. A test ties the two together,
 * because they live in files that cannot read each other.
 */
export const VERSION = '2.9.0';

/**
 * Bumped whenever a change alters what a recording sounds like — §1 and §2, and
 * since 2.7.0 §3a as well, because the ids reaching the model decide the audio
 * every bit as much as the levelling applied to it afterwards.
 *
 * It goes in the fingerprint, so bumping it is what makes every consumer
 * re-render rather than keeping recordings made under the old rules under names
 * claiming to match the new ones.
 *
 * **3 costs more than it strictly has to, and that is deliberate.** Removing
 * the phoneme composition changes only the voices whose map lacks the combining
 * mark — the `low` and `x_low` ones. Thorsten and every other voice with a
 * complete map come out byte-identical, and their recordings did not need
 * remaking. The fingerprint has no per-voice granularity, so the choice is
 * between re-rendering some recordings that did not need it and leaving others
 * under a name that lies about how they were made. The second is the failure
 * this constant exists to prevent.
 */
export const PIPELINE_VERSION = 3;
