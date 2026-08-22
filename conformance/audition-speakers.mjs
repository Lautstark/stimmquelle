/**
 * Render every speaker of a multi-speaker piper model, so somebody can listen.
 *
 * A model like `de_DE-mls-medium` carries 236 voices behind one id and
 * `synthesize()` only ever asks for the first, so "is there a usable German
 * female voice in there" cannot be answered by reading anything. This renders
 * them all — same sentence, same model, only `sid` changed — and measures median
 * pitch and duration, which is enough to sort 236 files into an order worth
 * listening to. It is not enough to judge them, and does not try.
 *
 * **Render a control you already trust through the same harness.** When all 236
 * mls speakers came back sounding nothing like German, the thing that made that
 * a finding rather than a suspected bug was Kerstin coming out of this same code
 * sounding fine.
 *
 *     npm i --no-save onnxruntime-node
 *     mkdir -p out && curl -sSLO <mirror>/de/de_DE/mls/medium/de_DE-mls-medium.onnx
 *     curl -sSLO <mirror>/de/de_DE/mls/medium/de_DE-mls-medium.onnx.json
 *     node conformance/audition-speakers.mjs 236 de_DE-mls-medium
 *
 * onnxruntime-node is deliberately not a dependency: nothing ships it and
 * nothing else here needs it, the same way conformance/calibrate.sh wants an
 * ffmpeg that is not vendored either. The phonemes come from the captured
 * fixture rather than the wasm phonemizer, so this needs no espeak.
 *
 * The one run this exists because of: mls is not a route to a German female
 * voice. Its note in voices.json says so, with what was measured.
 */
import ort from 'onnxruntime-node';
import { readFileSync, writeFileSync } from 'node:fs';
import { remapPhonemeIds, encodeWav, postprocess } from '../dist/browser/index.js';

const model = process.argv[3] ?? 'de_DE-mls-medium';
const cfg = JSON.parse(readFileSync(`${model}.onnx.json`, 'utf8'));
const fx = JSON.parse(readFileSync(new URL('../test/phonemes.fixture.json', import.meta.url), 'utf8'));
const one = fx.cases[0];
const { ids, dropped } = remapPhonemeIds(one.phonemes, one.phoneme_ids, cfg.phoneme_id_map);
console.log('text:', one.text, '| ids:', ids.length, '| dropped:', dropped.length);

const session = await ort.InferenceSession.create(`${model}.onnx`);
const speakers = Object.entries(cfg.speaker_id_map);

/** Median f0 by autocorrelation — a rough but honest proxy for voice pitch. */
function medianF0(x, rate) {
  const lo = Math.floor(rate / 300), hi = Math.floor(rate / 70), win = 2048, est = [];
  for (let s = 0; s + win + hi < x.length; s += win) {
    let energy = 0;
    for (let i = s; i < s + win; i++) energy += x[i] * x[i];
    if (Math.sqrt(energy / win) < 0.02) continue;           // skip silence
    let best = 0, bestLag = 0;
    for (let lag = lo; lag <= hi; lag++) {
      let c = 0;
      for (let i = s; i < s + win; i++) c += x[i] * x[i + lag];
      if (c > best) { best = c; bestLag = lag; }
    }
    if (bestLag) est.push(rate / bestLag);
  }
  if (!est.length) return 0;
  est.sort((a, b) => a - b);
  return Math.round(est[Math.floor(est.length / 2)]);
}

const take = Number(process.argv[2] || 3);
const rows = [];
for (const [name, sid] of speakers.slice(0, take)) {
  const t0 = Date.now();
  const out = await session.run({
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([ids.length], BigInt)),
    scales: new ort.Tensor('float32', Float32Array.from([
      cfg.inference.noise_scale, cfg.inference.length_scale, cfg.inference.noise_w])),
    sid: new ort.Tensor('int64', BigInt64Array.from([BigInt(sid)])),
  });
  const raw = out.output.data;
  const rate = cfg.audio.sample_rate;
  const levelled = postprocess(encodeWav(raw, rate), { rate: 22050 });
  const f0 = medianF0(levelled.samples, levelled.rate);
  rows.push({ name, sid, seconds: +levelled.seconds.toFixed(2), f0, ms: Date.now() - t0 });
  writeFileSync(`out/${String(sid).padStart(3,'0')}-spk${name}-f0_${f0}.wav`, levelled.wav);
  console.log(`sid ${String(sid).padStart(3)} spk ${name.padStart(5)}  ${levelled.seconds.toFixed(2)}s  f0 ${String(f0).padStart(3)} Hz  (${Date.now()-t0} ms)`);
}
writeFileSync('out/rows.json', JSON.stringify(rows, null, 1));
