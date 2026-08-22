/**
 * MP3, for the consumers that want one.
 *
 * A talker reading 16 kHz WAVs off its own flash never calls this, and lamejs
 * is a quarter of a megabyte — which was the argument for leaving MP3 out of
 * the package altogether and letting each consumer bring its own encoder.
 *
 * That argument does not survive contact with a lazy import. `lamejs` is
 * behind a dynamic `import()`, so it is a separate chunk that a consumer only
 * fetches the first time it asks for an MP3. vorlaut never does, and never
 * pays. bildquelle does the same thing with JSZip for the same reason.
 *
 * And leaving it out had a real cost: the encoder needs the identical
 * quantisation the WAV writer uses, and two copies of that are two roundings
 * free to disagree by a bit — an MP3 and a WAV of one recording that are not
 * quite the same file, which nobody would ever go looking for. In here they
 * cannot drift, because there is only one.
 */
import { toPcm16 } from './level.js';

/** What lamejs offers, which is one class and one method more than we use. */
interface Lame {
  Mp3Encoder: new (channels: number, rate: number, bitrate: number) => {
    encodeBuffer(pcm: Int16Array): Uint8Array | number[];
    flush(): Uint8Array | number[];
  };
}

let lame: Promise<Lame> | null = null;
const load = (): Promise<Lame> =>
  (lame ??= import('@breezystack/lamejs') as unknown as Promise<Lame>);

/**
 * These formats throw audio away to get small. Left alone, an encoder picks a
 * bitrate that makes a voice sound thin and hollow, so one is set here — the
 * same 192k the container used to write.
 */
export const DEFAULT_BITRATE = 192;

/**
 * Levelled samples to MP3 bytes.
 *
 * Takes what `postprocess` hands back, so nothing has to decode a finished file
 * to re-encode it. Mono, because everything in this family is.
 */
export async function encodeMp3(
  samples: Float32Array, rate: number, bitrate: number = DEFAULT_BITRATE,
): Promise<Uint8Array> {
  const { Mp3Encoder } = await load();
  const encoder = new Mp3Encoder(1, rate, bitrate);
  const pcm = toPcm16(samples);
  const parts: Uint8Array[] = [];
  // 1152 is one MPEG frame's worth of samples; lamejs wants them a frame at a
  // time and returns nothing for the buffers it is still filling.
  for (let i = 0; i < pcm.length; i += 1152) {
    const block = encoder.encodeBuffer(pcm.subarray(i, i + 1152));
    if (block.length) parts.push(new Uint8Array(block));
  }
  const rest = encoder.flush();
  if (rest.length) parts.push(new Uint8Array(rest));

  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
