import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * No source file carries a raw control byte.
 *
 * `svelte/AzurePanel.svelte` held a literal NUL inside a template literal — the
 * separator joining the key flag and the region into one cache key — and the
 * cost was not the byte. It was that **grep classifies the whole file as binary
 * and skips it in silence**. A sweep of `svelte/` for import statements
 * reported that this component had none, which is how it was found: the tool
 * did not say it had skipped anything, it said there was nothing there.
 *
 * A source file that searches cannot see is worse than a wrong one. The escape
 * `\u0000` produces exactly the same character at runtime and keeps the file
 * text, which is also what the rest of the family already writes where it joins
 * on a NUL.
 *
 * Tab, newline and carriage return are the three that belong in source.
 */
const ROOTS = ['src', 'svelte', 'test', 'tools'];
const ALLOWED = new Set([9, 10, 13]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else out.push(path);
  }
  return out;
}

describe('no source file carries a raw control byte', () => {
  const found = ROOTS.filter((dir) => {
    try { return statSync(dir).isDirectory(); } catch { return false; }
  }).flatMap((dir) => files(dir));

  it('there are files to check', () => {
    expect(found.length).toBeGreaterThan(20);
  });

  it.each(found)('%s', (path) => {
    const bytes = readFileSync(path);
    const at = bytes.findIndex((b) => b < 32 && !ALLOWED.has(b));
    expect(at, `control byte 0x${bytes[at]?.toString(16)} at offset ${at}`).toBe(-1);
  });
});
