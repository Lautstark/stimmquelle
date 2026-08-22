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
export const VERSION = '2.0.1';

/**
 * Bumped whenever §1 or §2 of the contract changes.
 *
 * It goes in the fingerprint, so bumping it is what makes every consumer
 * re-render rather than keeping recordings made under the old rules under names
 * claiming to match the new ones.
 */
export const PIPELINE_VERSION = 1;
