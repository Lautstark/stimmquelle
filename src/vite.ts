/**
 * The build half of driving piper: getting the runtime's files onto the page.
 *
 * `usePiperRuntime` takes a `wasmBase` — one directory answering for the
 * phonemizer's wasm and its espeak data *and* onnxruntime's binaries. Those
 * live in two different npm packages, so no CDN directory is ever that base:
 * something has to put four files from two packages side by side under a URL
 * the page serves. A library cannot do it. An npm package lands in
 * `node_modules` on a build machine, and only a consumer's own build decides
 * what becomes a URL on the consumer's own origin.
 *
 * What a library *can* do is stop each consumer working it out again. Both
 * products wrote this plugin independently — vorlaut for the runtime, mitreden
 * a year earlier to rewrite vits-web's two hardcoded CDN constants — and both
 * arrived at the same four files, the same directory and the same failure
 * modes. This is that plugin, once.
 *
 * Deliberately not typed against vite: the return value is a plain object with
 * the hooks vite calls, so this package does not take a dependency on a build
 * tool to describe a build tool's plugin.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/** One file to serve, as `[package, path inside it, name on the page]`. */
type Vendored = readonly [string, string, string];

const PHONEMIZER: Vendored[] = [
  ['@diffusionstudio/piper-wasm', 'build/piper_phonemize.wasm', 'piper_phonemize.wasm'],
  ['@diffusionstudio/piper-wasm', 'build/piper_phonemize.data', 'piper_phonemize.data'],
];

/**
 * The single-threaded pair, and that is the default for a reason.
 *
 * onnxruntime only uses the threaded binaries on a cross-origin-isolated page,
 * and neither GitHub Pages nor most static hosts send the headers that make
 * one. Copying all four would put 20 MB on a site to answer a request that is
 * never made. `threaded: true` is there for a consumer that really does send
 * COOP and COEP.
 */
const ONNX_SINGLE: Vendored[] = [
  ['onnxruntime-web', 'dist/ort-wasm-simd.wasm', 'ort-wasm-simd.wasm'],
  ['onnxruntime-web', 'dist/ort-wasm.wasm', 'ort-wasm.wasm'],
];

const ONNX_THREADED: Vendored[] = [
  ['onnxruntime-web', 'dist/ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.wasm'],
  ['onnxruntime-web', 'dist/ort-wasm-threaded.wasm', 'ort-wasm-threaded.wasm'],
];

export interface PiperVendorOptions {
  /**
   * Directory under the site root, and it has to be the one `piperRuntime()`
   * was told about — they are two ends of the same string. Default `vendor`.
   */
  dir?: string;
  /** Also serve the threaded onnxruntime binaries. Only useful on a page that sends COOP and COEP. */
  threaded?: boolean;
}

/**
 * Where a file really is, without asking `exports` for permission.
 *
 * `onnxruntime-web` publishes an `exports` map with no entry for `./dist/*`,
 * so `require.resolve('onnxruntime-web/dist/ort-wasm.wasm')` throws — the file
 * is right there and the package has simply not declared it reachable. That is
 * a fact about a `.wasm` binary nobody imports as a module, so the honest way
 * to find it is to walk `node_modules` the way the resolver would, which also
 * works for the hoisted, the nested and the workspace layouts.
 */
function findFile(from: string, pkg: string, inside: string): string | null {
  let dir = resolve(from);
  for (;;) {
    const candidate = join(dir, 'node_modules', pkg, inside);
    if (existsSync(candidate)) return candidate;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** `.wasm` must arrive as `application/wasm` or `instantiateStreaming` refuses it. */
const contentType = (name: string) =>
  name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';

/**
 * Serve piper's runtime files from the page's own origin.
 *
 * ```js
 * import { piperVendor } from '@lautstark/stimmquelle/vite';
 * export default defineConfig({ plugins: [piperVendor()] });
 * ```
 *
 * In dev the files are answered straight out of `node_modules`; in a build
 * they are copied beside the bundle. Same names and same directory either way,
 * so `wasmBase` does not care which server it is talking to.
 */
export function piperVendor(options: PiperVendorOptions = {}) {
  const dir = (options.dir ?? 'vendor').replace(/^\/+|\/+$/g, '');
  const wanted = [...PHONEMIZER, ...ONNX_SINGLE, ...(options.threaded ? ONNX_THREADED : [])];
  let root = process.cwd();
  let outDir = 'dist';

  return {
    name: 'stimmquelle:piper-vendor',

    configResolved(config: { root?: string; build?: { outDir?: string } }) {
      root = config.root ?? root;
      outDir = config.build?.outDir ?? outDir;
    },

    configureServer(server: { middlewares: { use(path: string, fn: MiddlewareFn): void } }) {
      server.middlewares.use(`/${dir}`, (request, response, next) => {
        const asked = (request.url ?? '').split('?')[0].replace(/^\//, '');
        const file = wanted.find(([, , name]) => name === asked);
        if (!file) return next();
        const source = findFile(root, file[0], file[1]);
        if (!source) return next();
        response.setHeader('Content-Type', contentType(file[2]));
        response.end(readFileSync(source));
      });
    },

    closeBundle() {
      const out = isAbsolute(outDir) ? outDir : resolve(root, outDir);
      const target = join(out, dir);
      mkdirSync(target, { recursive: true });
      for (const [pkg, inside, name] of wanted) {
        const source = findFile(root, pkg, inside);
        if (!source) {
          throw new Error(
            `Cannot serve ${name} from this origin: ${pkg}/${inside} is not installed. ` +
            `Add ${pkg} to this project's dependencies — the runtime fetches this file ` +
            'at the first sentence, and a build that omits it fails there instead, as a ' +
            'network error nobody connects to a build.');
        }
        const destination = join(target, name);
        copyFileSync(source, destination);
        // What arrived, not only what was read. A copy that stops early leaves a
        // file that exists, carries the right name and is a prefix of the right
        // bytes — 1 MB of an 18 MB espeak archive was found in a consumer's
        // `dist/` exactly this way, after a build that reported success. Nothing
        // downstream reports it either: the wasm still instantiates and the
        // phonemizer fails later, on a language whose data was in the part that
        // never arrived, which reads as a broken voice rather than a broken
        // build. A consumer's own tests cannot see it, because standing in for
        // the phonemizer is how they avoid waiting on 30 MB of wasm.
        const wantedBytes = statSync(source).size;
        const arrived = statSync(destination).size;
        if (arrived !== wantedBytes) {
          throw new Error(
            `${name} was copied short: ${arrived} bytes of ${wantedBytes}. The published ` +
            'runtime would be incomplete in a way nothing downstream reports, so this ' +
            `build stops. Delete ${join(dir, name)} and build again.`);
        }
      }
    },
  };
}

type MiddlewareFn = (
  request: { url?: string },
  response: { setHeader(name: string, value: string): void; end(body: unknown): void },
  next: () => void,
) => void;
