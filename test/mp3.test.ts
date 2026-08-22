import { describe, expect, it } from 'vitest';
import { encodeMp3, encodeWav, postprocess } from '../src/index.js';

/**
 * The encoder is here rather than in each consumer so that the quantisation
 * cannot fork — an MP3 and a WAV of one recording that round differently would
 * be a difference nobody goes looking for.
 */
describe('mp3', () => {
  const rate = 44100;
  const x = new Float32Array(rate);
  for (let i = 0; i < x.length; i++) x[i] = 0.2 * Math.sin((2 * Math.PI * 220 * i) / rate);

  it('writes something a decoder would recognise', async () => {
    const mp3 = await encodeMp3(x, rate);
    expect(mp3.length).toBeGreaterThan(1000);
    // Every MPEG frame starts with eleven set bits; the first one is at the top
    // of the file because lamejs writes no ID3 header.
    expect(mp3[0]).toBe(0xff);
    expect(mp3[1] & 0xe0).toBe(0xe0);
  });

  it('takes what postprocess hands back, without a decode in between', async () => {
    const { samples, rate: out } = postprocess(encodeWav(x, rate), { rate });
    const mp3 = await encodeMp3(samples, out);
    expect(mp3.length).toBeGreaterThan(1000);
  });

  it('is not in the main bundle', async () => {
    // The reason MP3 is allowed to live here at all: lamejs is behind a dynamic
    // import, so a consumer that never asks for an MP3 never fetches the
    // quarter of a megabyte. If this ever becomes a static import, a talker
    // reading WAVs starts paying for an encoder it does not call.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/mp3.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/import\(['"]@breezystack\/lamejs['"]\)/);
    expect(src).not.toMatch(/^import .* from ['"]@breezystack/m);
  });
});
