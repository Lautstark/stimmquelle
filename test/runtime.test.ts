import { describe, expect, it } from 'vitest';
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
