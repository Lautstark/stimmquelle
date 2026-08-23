/**
 * The page half of driving piper: saying where the pieces are.
 *
 * `usePiperRuntime` asks for three things, and two of them have the same
 * answer in every product that has ever configured it — the phonemizer is the
 * one npm package that ships it, and `wasmBase` is wherever the build put the
 * files, which `piperVendor()` next door decides. Only the third is a real
 * choice, so only the third is required here.
 *
 * Separate from the browser bundle on purpose. `dist/browser/index.js` is one
 * self-contained file that consumers without a bundler drop into a page by
 * hand, and `check:exports` fails if it ever stops being one; a module that
 * dynamically imports 120 kB of somebody else's Emscripten glue cannot live in
 * it. This is compiled TypeScript for a consumer's own bundler to resolve,
 * which is also what makes the phonemizer import work: it resolves in the
 * consumer's dependency graph, where the package actually is.
 *
 * It builds a description and calls nothing. `usePiperRuntime` stays the
 * consumer's own call, against the copy of this package the consumer imported,
 * so there is no way for this to configure a second module instance's state.
 */
import type { OnnxModule, PiperRuntime } from './synthesize.js';

export interface PiperRuntimeOptions {
  /**
   * Where onnxruntime's module comes from, and the one piece with no sensible
   * default: the two products that drive piper disagree, for reasons that are
   * about them rather than about this package. mitreden bundles it from
   * `node_modules` because it promises to work offline and asserts in a test
   * that its bundle names no host; vorlaut imports a pinned CDN URL to keep the
   * engine's weight off a bundle it pays for at first use. Both are right.
   *
   * Whatever it resolves to must be the same version as the binaries
   * `piperVendor()` copies, since those are what it runs on.
   */
  onnx(): Promise<OnnxModule>;
  /** The directory `piperVendor()` was told about. Default `vendor`. */
  dir?: string;
  /**
   * The site's base path. Defaults to vite's `import.meta.env.BASE_URL`, which
   * is what makes a project site served from `/<repo>/` work without anybody
   * writing the repository name down.
   */
  base?: string;
  /**
   * How many threads onnxruntime may use. Default 1, and that is not a
   * performance opinion: it sizes its pool off `hardwareConcurrency` and then
   * warns that threads want a cross-origin-isolated page, which most static
   * hosts are not. It falls back by itself, so this changes no behaviour — what
   * it changes is that the single-threaded arrangement is the arrangement
   * rather than a recovery, and that a first recording stops writing a warning
   * nobody can act on into the console. It also matches what `piperVendor()`
   * copies by default. Pass 0 to leave onnxruntime's own choice alone.
   */
  threads?: number;
  /** The phonemizer, for a consumer serving it some other way. */
  phonemizer?: PiperRuntime['phonemizer'];
  /** Overrides model fetching, for a consumer with its own cache or a test. */
  fetchModel?: PiperRuntime['fetchModel'];
}

/**
 * The three answers `usePiperRuntime` wants, with the two obvious ones filled in.
 *
 * ```ts
 * import { usePiperRuntime } from '@lautstark/stimmquelle/browser';
 * import { piperRuntime } from '@lautstark/stimmquelle/runtime';
 *
 * usePiperRuntime(piperRuntime({ onnx: () => import('onnxruntime-web/wasm') }));
 * ```
 *
 * Configuring it is opt-in and stays that way: `speak()` routes piper through
 * the owned path only once a runtime is there, and a voice that already spoke
 * comes out with identical phoneme ids either way, so nothing re-renders.
 */
export function piperRuntime(options: PiperRuntimeOptions): PiperRuntime {
  const dir = (options.dir ?? 'vendor').replace(/^\/+|\/+$/g, '');
  const base = options.base ?? viteBase();
  const threads = options.threads ?? 1;

  return {
    phonemizer: options.phonemizer ?? (async () => ({
      // The deep path, because the package's `main` is an absolute path that
      // resolves nowhere, and there is no `exports` map to do better. Its file
      // is Emscripten's UMD, whose exports exist only for a bundler — which is
      // why this is a bare specifier for the consumer's bundler and never a
      // URL: a browser importing that URL gets a module with nothing in it.
      createPiperPhonemize: (
        await import('@diffusionstudio/piper-wasm/build/piper_phonemize.js')
      ).default,
    })),
    onnx: async () => {
      const onnx = await options.onnx();
      if (threads > 0) (onnx.env.wasm as { numThreads?: number }).numThreads = threads;
      return onnx;
    },
    wasmBase: `${base.endsWith('/') ? base : `${base}/`}${dir}/`,
    ...(options.fetchModel ? { fetchModel: options.fetchModel } : {}),
  };
}

/**
 * Vite's base path when there is one.
 *
 * **`import.meta.env.BASE_URL` has to survive into the emitted JavaScript
 * written out in full, or this silently answers `/` for ever.** Vite replaces
 * that expression *textually*, and only where it appears whole. This function
 * used to bind `import.meta` to a local first — defensively, because the module
 * is also loaded under plain node by `check:exports`, where `import.meta.env`
 * does not exist. That defence put the expression out of vite's reach: it
 * survived into consumers' bundles as a real property lookup, `env` was
 * undefined in a browser module, and every build resolved the base to `/`
 * whatever it was set to. Silent, and only visible on a site served from a
 * subpath — where all four runtime files were then fetched from the wrong
 * directory and the first sentence 404'd inside somebody else's glue.
 *
 * The cast is on the expression rather than on a binding, so TypeScript is
 * satisfied without vite types and the emitted text still reads
 * `import.meta.env?.BASE_URL`. The optional chain is what keeps node happy —
 * `import.meta.env` is undefined there, and `?.` answers rather than throws.
 *
 * `test/runtime.test.ts` reads the built file for that literal, because this is
 * a defect whose whole character is that it typechecks, builds, and passes
 * every test that does not deploy.
 */
function viteBase(): string {
  return (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
}
