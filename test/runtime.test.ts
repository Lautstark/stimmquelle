import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { piperRuntime } from '../src/runtime.js';
import type { OnnxModule } from '../src/synthesize.js';

/**
 * The helper builds a description and calls nothing, which is most of what
 * there is to check: the two answers it fills in have to come out the way the
 * page and the build agreed, and the one real choice has to pass through.
 *
 * `wasmBase` is the half that goes wrong silently. It is one string agreed
 * between a plugin writing files and a page fetching them, and every way of
 * getting it slightly wrong — a missing slash, a doubled one, a base path
 * dropped — is a 404 at the first sentence and nothing at all before that.
 */
const onnx = () => Promise.resolve({
  env: { wasm: {} }, InferenceSession: {}, Tensor: class {},
} as unknown as OnnxModule);

describe('piperRuntime', () => {
  it('puts the directory under the base, with exactly one slash between', () => {
    expect(piperRuntime({ onnx, base: '/' }).wasmBase).toBe('/vendor/');
    expect(piperRuntime({ onnx, base: '/vorlaut/' }).wasmBase).toBe('/vorlaut/vendor/');
    // A base without its trailing slash is the easy mistake and must not
    // produce `/vorlautvendor/`.
    expect(piperRuntime({ onnx, base: '/vorlaut' }).wasmBase).toBe('/vorlaut/vendor/');
    // mitreden serves the same four files from `wasm/`, so the name travels.
    expect(piperRuntime({ onnx, base: '/', dir: 'wasm' }).wasmBase).toBe('/wasm/');
    // Slashes on the directory are forgiven rather than doubled.
    expect(piperRuntime({ onnx, base: '/', dir: '/wasm/' }).wasmBase).toBe('/wasm/');
  });

  it('pins onnxruntime to one thread, and lets a consumer opt out', async () => {
    const pinned = await piperRuntime({ onnx, base: '/' }).onnx();
    expect((pinned.env.wasm as { numThreads?: number }).numThreads).toBe(1);

    const asked = await piperRuntime({ onnx, base: '/', threads: 4 }).onnx();
    expect((asked.env.wasm as { numThreads?: number }).numThreads).toBe(4);

    // 0 means "leave onnxruntime's own choice alone", which is not the same as
    // asking for zero threads.
    const untouched = await piperRuntime({ onnx, base: '/', threads: 0 }).onnx();
    expect((untouched.env.wasm as { numThreads?: number }).numThreads).toBeUndefined();
  });

  it('takes a phonemizer over its own, and passes fetchModel through', async () => {
    const mine = async () => ({ createPiperPhonemize: (() => {}) as never });
    const r = piperRuntime({ onnx, base: '/', phonemizer: mine });
    expect(r.phonemizer).toBe(mine);
    expect(piperRuntime({ onnx, base: '/' }).fetchModel).toBeUndefined();
    const fetchModel = async () => new ArrayBuffer(0);
    expect(piperRuntime({ onnx, base: '/', fetchModel }).fetchModel).toBe(fetchModel);
  });
});

describe('the base default, as it reaches a bundler', () => {
  /**
   * The one test that would have caught #2, and it has to read the *built* file
   * rather than call the function.
   *
   * Calling it proves nothing: under node `import.meta.env` is undefined either
   * way, so the broken version and the fixed one both answer `/` here. The
   * defect only existed in somebody else's bundle. Vite replaces
   * `import.meta.env.BASE_URL` textually and only where it is written out whole,
   * so binding `import.meta` to a local first — which the first version did, to
   * keep node happy — put it out of reach and every consumer build resolved the
   * base to `/` whatever it was set to.
   *
   * So this asserts the shape of the emitted text. Run `npm run build` first;
   * `npm test` in CI runs after it.
   */
  const built = readFileSync(new URL('../dist/runtime.js', import.meta.url), 'utf8');

  it('emits import.meta.env.BASE_URL written out in full', () => {
    expect(built).toMatch(/return import\.meta\.env\?\.BASE_URL \?\? '\/'/);
  });

  it('never binds import.meta to a local on the way', () => {
    // The exact regression: `const meta = import.meta` anywhere in this module
    // means the substitution is gone again.
    expect(built).not.toMatch(/=\s*import\.meta\s*;/);
  });

  it('still answers under node, where import.meta.env does not exist', () => {
    // The reason the alias was there in the first place. `?.` has to carry it.
    expect(() => piperRuntime({ onnx })).not.toThrow();
    expect(piperRuntime({ onnx }).wasmBase).toBe('/vendor/');
  });
});
