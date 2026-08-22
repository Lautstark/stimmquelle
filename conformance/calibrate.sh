#!/bin/sh
# Regenerate conformance/calibration.json from ffmpeg.
#
# The numbers in that file are the only check on this package's loudness
# measurement that does not come from this package. They were frozen when
# mitreden still shipped ffmpeg; this script is how to get them again, on any
# machine that has one, without needing either consumer.
#
#     sh conformance/calibrate.sh
#
# It writes each tone with the module's own encodeWav — so what ffmpeg reads is
# exactly what a consumer would be handed — and prints ebur128's integrated
# loudness beside the value on record.
set -e
command -v ffmpeg >/dev/null || { echo "needs ffmpeg" >&2; exit 1; }
cd "$(dirname "$0")/.."
[ -f dist/browser/index.js ] || npm run build >/dev/null
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

node --input-type=module -e "
import { encodeWav } from './dist/browser/index.js';
import { writeFileSync } from 'node:fs';
const spec = JSON.parse(await import('node:fs').then(m => m.readFileSync('conformance/calibration.json','utf8')));
for (const t of spec.tones) {
  const n = spec.rate * spec.seconds, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = t.amplitude * Math.sin(2 * Math.PI * t.hz * i / spec.rate);
  writeFileSync('$tmp/' + t.hz + '-' + t.amplitude + '.wav', encodeWav(x, spec.rate));
}
"
node -e "
const s = require('./conformance/calibration.json');
for (const t of s.tones) console.log([t.hz, t.amplitude, t.lufs].join(' '));
" | while read hz amp want; do
  got=$(ffmpeg -hide_banner -nostats -i "$tmp/$hz-$amp.wav" -af ebur128=framelog=quiet -f null - 2>&1 \
        | awk '/I:/ && /LUFS/ { v=$2 } END { print v }')
  printf '%5s Hz at %-5s on record %-7s ffmpeg says %s\n' "$hz" "$amp" "$want" "$got"
done
