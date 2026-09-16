#!/usr/bin/env node
/**
 * Writes a version into src/contract.ts, which is the third place this
 * package carries its number.
 *
 *     node tools/set-version.mjs 2.11.0
 *
 * package.json has one, the lockfile mirrors it, and src/contract.ts exports
 * VERSION so that a vendored dist/browser/index.js can say which release it
 * is without anybody remembering. Until 2026-09-16 a person kept the three in
 * step by hand at `npm version` time. semantic-release bumps the first two
 * and calls this for the third, then rebuilds dist/browser so the committed
 * bundle carries the same number - release.config.mjs has the order, and
 * tools/check-exports.mjs is what refuses a mismatch.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('usage: node tools/set-version.mjs <x.y.z>');
  process.exit(2);
}

const file = new URL('../src/contract.ts', import.meta.url);
const source = readFileSync(file, 'utf8');
const line = /^export const VERSION = '[^']*';$/m;
if (!line.test(source)) {
  console.error('src/contract.ts has no `export const VERSION = ...` line to write.');
  process.exit(1);
}
writeFileSync(file, source.replace(line, `export const VERSION = '${version}';`));
console.log(`src/contract.ts: VERSION = '${version}'`);
