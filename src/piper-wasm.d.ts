/* The phonemizer's Emscripten glue, which ships no types.
 *
 * An optional peer dependency: a consumer that drives piper installs it, and
 * one that only uses Azure, the system voices or the levelling chain never
 * does. Declared here so `runtime.ts` compiles either way — the emitted
 * `runtime.d.ts` describes the factory in this package's own
 * `PhonemizerFactory` terms and never leaks this module's name to a consumer.
 */
declare module '@diffusionstudio/piper-wasm/build/piper_phonemize.js' {
  import type { PhonemizerFactory } from './synthesize.js';
  const createPiperPhonemize: PhonemizerFactory;
  export default createPiperPhonemize;
}
