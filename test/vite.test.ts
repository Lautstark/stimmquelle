import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/* A copy that stops early cannot be produced honestly - copyFileSync either
 * finishes or throws - so the one way to stand where a real one left things is
 * to make the copy itself land short. That is the whole point of the check
 * being there, and a test that planted the short file by hand would assert its
 * own writeFileSync rather than the guard. */
const partial = vi.hoisted(() => ({ bytes: 0 }));
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>();
  return {
    ...real,
    copyFileSync: (source: string, destination: string) => {
      if (partial.bytes > 0) {
        real.writeFileSync(destination, real.readFileSync(source).subarray(0, partial.bytes));
        return;
      }
      real.copyFileSync(source, destination);
    },
  };
});

import { piperVendor } from '../src/vite.js';

/**
 * A fake consumer: a project root with the two packages installed under it,
 * holding files of known length. Nothing here is a real wasm binary — what is
 * being checked is the copying, the finding and the refusing, none of which
 * reads a byte of what it moves.
 */
const roots: string[] = [];

function project(sizes: Record<string, number> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'stimmquelle-vite-'));
  roots.push(root);
  const files: [string, string][] = [
    ['@diffusionstudio/piper-wasm', 'build/piper_phonemize.wasm'],
    ['@diffusionstudio/piper-wasm', 'build/piper_phonemize.data'],
    ['onnxruntime-web', 'dist/ort-wasm-simd.wasm'],
    ['onnxruntime-web', 'dist/ort-wasm.wasm'],
  ];
  for (const [pkg, inside] of files) {
    const full = join(root, 'node_modules', pkg, inside);
    mkdirSync(join(full, '..'), { recursive: true });
    const name = inside.split('/').pop()!;
    writeFileSync(full, Buffer.alloc(sizes[name] ?? 32, 7));
  }
  return root;
}

const build = (root: string, outDir = 'dist', options = {}) => {
  const plugin = piperVendor(options);
  plugin.configResolved({ root, build: { outDir } });
  plugin.closeBundle();
  return join(root, outDir);
};

afterEach(() => {
  partial.bytes = 0;
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});

describe('piperVendor', () => {
  it('puts all four files under the served directory, whole', () => {
    const root = project({ 'piper_phonemize.data': 4096 });
    const out = build(root);
    for (const name of ['piper_phonemize.wasm', 'piper_phonemize.data',
                        'ort-wasm-simd.wasm', 'ort-wasm.wasm']) {
      expect(statSync(join(out, 'vendor', name)).size).toBeGreaterThan(0);
    }
    expect(statSync(join(out, 'vendor', 'piper_phonemize.data')).size).toBe(4096);
    // The threaded pair costs 20 MB to answer a request a page without COOP and
    // COEP never makes, so it is not copied unless asked for.
    expect(() => statSync(join(out, 'vendor', 'ort-wasm-simd-threaded.wasm'))).toThrow();
  });

  it('follows the directory the page was told about', () => {
    const root = project();
    const out = build(root, 'dist', { dir: 'wasm' });
    expect(statSync(join(out, 'wasm', 'piper_phonemize.wasm')).size).toBeGreaterThan(0);
  });

  it('refuses to build when a package is not installed, naming what to add', () => {
    const root = mkdtempSync(join(tmpdir(), 'stimmquelle-vite-bare-'));
    roots.push(root);
    expect(() => build(root)).toThrow(/piper-wasm.*dependencies/s);
  });

  it('refuses a copy that landed short, naming both sizes', () => {
    const root = project({ 'piper_phonemize.data': 18_077_249 });
    partial.bytes = 1_073_152;   // what a stopped copy actually left in a consumer's dist/
    expect(() => build(root)).toThrow(/copied short: 1073152 bytes of 18077249/);
  });

  it('leaves nothing half-written to be trusted later', () => {
    // The build stops, but the short file is still on disk - so the message has
    // to say which one to delete, or the next build reads it back and the
    // failure looks like it moved somewhere else.
    const root = project({ 'piper_phonemize.data': 4096 });
    partial.bytes = 100;
    expect(() => build(root)).toThrow(/Delete .*piper_phonemize\.data and build again/);
  });
});
