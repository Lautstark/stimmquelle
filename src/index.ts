/**
 * Speech for German AAC tools, in a browser tab.
 *
 * Three things, and they are independent enough to be used separately:
 *
 *   the catalogue   which voices may be shipped and which actually speak
 *   speak()         a sentence and a voice id in, a finished WAV out
 *   the chain       trim, measure, level — usable on its own, and free of the
 *                   browser, so the same code runs under node and can be
 *                   checked against ffmpeg
 *
 * The rules all of it keeps are in CONTRACT.md, and the reason it is one
 * package rather than three copies is in README.md.
 */
export * from './catalogue.js';
export {
  MEASURE_RATE, PIPELINE_VERSION, TARGET_LUFS, TARGET_PEAK_DBTP, TRIM, VERSION,
} from './contract.js';
export {
  decodeWav, encodeWav, fadeEnds, integratedLufs, limitTruePeak, pad, postprocess, resample,
  toPcm16, trim, truePeakDb,
  type Levelled, type LevelOptions,
} from './level.js';
export {
  listVoices, piperVoices,
  type ListOptions, type Offered, type VoiceSource,
} from './list.js';
export { DEFAULT_BITRATE, encodeMp3 } from './mp3.js';
export {
  hasSystemVoices, loadSystemVoices, say, systemVoices, type SayOptions,
} from './system.js';
export { remapPhonemeIds, type PhonemeIdMap, type Remapped } from './phonemes.js';
export {
  downloadedModels, forgetModels, hasPiperRuntime, phonemise, synthesize, usePiperRuntime,
  type OnnxModule, type Phonemised, type PhonemizerFactory, type PiperRuntime,
  type Synthesised, type SynthesizeOptions, type SynthesizeProgress,
} from './synthesize.js';
export {
  asBlob, AZURE_FORMAT, AZURE_RATE, azureVoices, buildSsml, downloaded, forget,
  localeOf, speak, usePiper,
  type AzureOptions, type PiperModule, type Progress, type SpeakOptions, type Spoken,
} from './speak.js';
