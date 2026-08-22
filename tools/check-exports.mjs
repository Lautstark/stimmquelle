/**
 * Every entry point package.json declares has to be one the build emits, and
 * has to load.
 *
 * This exists because for the whole of 2.0.0 none of them did. `main`, `types`
 * and `exports["."]` pointed at `dist/index.js`, while `tsc` — with rootDir
 * inferred rather than pinned, because `catalogue.ts` imports `../voices.json`
 * from outside `src` — was writing `dist/src/index.js`. Nothing caught it: the
 * build passed, the tests passed, and the only consumer imported `./browser`
 * behind a `paths` override in its own tsconfig that pointed straight at the
 * real file. A broken entry point is invisible from inside the package.
 *
 * Run after `npm run build`. Node resolves the specifiers below by
 * self-reference, through the same `exports` map a consumer would use, so this
 * fails the way an install would rather than the way a relative import would.
 */
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const declared = [...new Set([
  pkg.main,
  pkg.types,
  ...Object.values(pkg.exports).flatMap(e => (typeof e === 'string' ? [e] : Object.values(e))),
])];

const missing = declared.filter(f => !existsSync(new URL(`../${f}`, import.meta.url)));
if (missing.length) {
  console.error('declared in package.json but not produced by the build:');
  for (const f of missing) console.error(`  ${f}`);
  process.exit(1);
}

// Resolution is the half `existsSync` cannot answer: a file can be there and
// still be unreachable under the name a consumer writes.
for (const specifier of ['@lautstark/stimmquelle', '@lautstark/stimmquelle/browser']) {
  const mod = await import(specifier);
  if (mod.VERSION !== pkg.version) {
    console.error(`${specifier} reports VERSION ${mod.VERSION}, package.json says ${pkg.version}`);
    process.exit(1);
  }
}

console.log(`${declared.length} declared entry points, all present and loading.`);
