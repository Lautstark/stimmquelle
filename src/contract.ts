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

/** Where loudness is measured. The BS.1770 coefficients are the 48 kHz ones. */
export const MEASURE_RATE = 48000;

/**
 * Bumped whenever §1 or §2 of the contract changes.
 *
 * It goes in the fingerprint, so bumping it is what makes every consumer
 * re-render rather than keeping recordings made under the old rules under names
 * claiming to match the new ones.
 */
export const PIPELINE_VERSION = 1;
