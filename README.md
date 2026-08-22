# stimmquelle

Piper voices for German AAC tools. Two files, and no code yet:

- **[`voices.json`](voices.json)** — which voices may be shipped, which actually
  speak in a browser, and why each rejected one was rejected.
- **[`CONTRACT.md`](CONTRACT.md)** — the loudness, trimming and fingerprint rules
  every implementation has to follow, in any language.

Extracted from [mitreden](https://github.com/Lautstark/mitreden) and
[vorlaut](https://github.com/Lautstark/vorlaut), which had written the same
answers down separately. The sibling of
[bildquelle](https://github.com/Lautstark/bildquelle), and here for the same
reason: the point of sharing it is not the line count — it is the licensing rule
below, which belongs in one audited place.

---

## Voices and licensing

> **This repository contains no voice models.** Nothing is checked in here and
> nothing is downloaded by it. `voices.json` is a list of answers about models
> that live on Hugging Face.

### The rule this repository exists for

Piper models are third-party artefacts under their own licences, and **the
licence lives in the `MODEL_CARD` next to the model, never in its file name.**

- **CC0 and public domain** may be handed on unconditionally.
- **CC-BY** may be handed on where the attribution is actually rendered.
- **CC BY-NC-SA may not be handed on at all.** A recording made for somebody
  else's child cannot carry a non-commercial condition.
- A `MODEL_CARD` naming no licence and pointing at a dataset instead is
  *unclear*, and unclear is not a yes.

A page that hands somebody a finished audio file is handing the voice on exactly
as a container image is. It is not the smaller act — it reaches more people.

### Why this is not a paragraph in a README somewhere

It was, three times. mitreden's README, mitreden's Dockerfile and vorlaut's
`tts.py` each stated this rule independently, in their own words, all correct.
Two of the products also carried their own copy of the same four voices — same
mirror, same paths, same order — arrived at separately rather than copied.

And it still failed. `en_US-hfc_female-medium` speaks perfectly in a browser, so
it went into mitreden's browser build. Its `MODEL_CARD` says **CC BY-NC-SA 4.0**.
Nothing broke, because nothing ever does: the voice spoke and the file played.
It was caught by a second product reading model cards while building its own
list, which is a way of finding things that does not scale and cannot be relied
on.

**Running is not shipping**, and the licence question is the easier of the two to
lose precisely because failing it is silent.

---

## What `voices.json` answers

Three independent questions per voice. Passing one says nothing about the others.

| | |
| --- | --- |
| **licence** | May it be handed on? `licence.ship` |
| **quality** | Does it speak in a browser? Only `medium` and `high` survive `@diffusionstudio/vits-web` — every `low` and `x_low` model dies with `idx=… must be within the inclusive range [-130,129]`, because vits-web phonemizes against one fixed symbol table instead of the `phoneme_id_map` inside each model's own `.onnx.json`. A browser limit only; a container speaks them all |
| **reach** | Can vits-web fetch it? Its `voices()` call advertises 124 voices; its hardcoded `PATH_MAP` holds 119. The other five cannot be downloaded by it |

Every voice anyone has considered is in the file, including the rejected ones,
with the reason. A list holding only what passed cannot stop a voice being
reconsidered on the same evidence that let it in the first time.

`proof` records how each runtime answer was established — `spike`, `vorlaut`,
`container`, `rule` — because a list that says *tested* and means *assumed* is
worth less than no list.

### Reading it

```js
const shippable = voices.filter(v => v.licence.ship && v.browser === 'ok');
```

```python
shippable = [v for v in voices if v["licence"]["ship"] and v["container"] == "ok"]
```

```sh
jq -r '.voices[] | select(.licence.ship and .container=="ok") | .id' voices.json
```

The third one is the reason this is a file rather than a constant inside a
module: both Dockerfiles need it, and neither has a language runtime to spare.

### As it stands

**Six voices are shippable in a browser** — Thorsten in three flavours,
`de_DE-mls-medium`, Kristin and LJ Speech. **Eight in a container**, which adds
Kerstin and John.

**There is no German female voice in a browser.** Not "none in the catalogue" —
piper publishes three, Kerstin, Eva K and Ramona, and all three are `low` or
`x_low`. `de_DE-mls-medium` is a 236-speaker corpus with no name a picker can
show, and it is the closest thing that runs. Reading each model's own
`phoneme_id_map` instead of vits-web's fixed table would unlock the whole tier,
Kerstin included — and would mean owning the phonemizer glue rather than calling
a library. That is the piece of work which decides whether these tools have a
German female voice.

It would not save much download: `de_DE-kerstin-low` is 63.1 MB against
`de_DE-thorsten-medium`'s 63.2 MB. Only `x_low` is genuinely smaller. But `low`
and `x_low` models are **16 kHz native**, which for a device that wants 16 kHz
means no resampling at all.

---

## What it does

Three things, independent enough to use separately.

**Speak a sentence.** piper compiled to WASM, or Azure straight from the tab.

```ts
import { speak, usePiper, asBlob } from '@lautstark/stimmquelle';

usePiper(() => import('./vendor/vits-web.js'));   // wherever this app serves it from

const out = await speak('Ich möchte noch nicht ins Bett.', 'piper:de_DE-thorsten-medium',
                        { rate: 16000, onProgress: p => show(p.share) });
audio.src = URL.createObjectURL(asBlob(out.wav));
```

`speak` **checks the catalogue before it fetches anything.** A voice that may not
be shipped, or that cannot speak in a browser, or that is not in the list at all,
throws with the reason. The licensing rule is only worth something if something
enforces it at the moment a voice is about to be used, rather than in a README.

Azure needs a key, which is passed per call and never stored here — see the
warning in `CONTRACT.md` §8, because a static site that speaks with Azure has
given its key to everyone who opens it.

**Level a recording.** Trim the silence, measure to ITU-R BS.1770-4, apply one
static gain, clamp at the ceiling, write a WAV.

```ts
import { postprocess } from '@lautstark/stimmquelle';

const { wav, lufs, gainDb, clamped, peakDb } = postprocess(rawWav, { rate: 44100 });
```

It is **free of the browser** — no AudioContext, no DOM, no fetch — so the same
code runs under node and can be measured against ffmpeg. That is not an
accident: this is a second implementation of a chain that already exists in
`ffmpeg`, and the only thing that makes a second implementation defensible is
that it is checked against the first. Web Audio would have done the decoding and
resampling in a line each and made that check impossible.

The defaults are the contract's: trim at −50 dB keeping 50 ms, target −16 LUFS,
ceiling −1.5 dBTP, **no compression and no limiter**. A device may add a fade and
a tail pad — `fadeSec`, `padSec` — which do not change measured loudness and are
documented extras rather than part of the contract.

**Ask about a voice.** The catalogue, above.

### What it deliberately is not

- **not a storage layer** — no phrases, no collections, no cache, no fingerprints
  beyond the terms in `CONTRACT.md` §3
- **not an MP3 encoder** — roughly 250 KB of `lamejs` that a talker reading
  16 kHz WAV never calls. `postprocess` returns a WAV; a consumer that wants MP3
  encodes it itself
- **not a key store** — Azure credentials are passed per call
- **not a promise of identical audio between two runtimes.** piper is a VITS
  model that samples: three renders of one sentence gave three different files.
  What two implementations can agree on is the *level*, and `CONTRACT.md` §7 says
  how closely

## Using it

It is a package, consumed **straight from GitHub and pinned by commit** — the
same as bildquelle, and there is no registry publish. A consumer who has not run
an update is byte-for-byte on a known version, and nobody has to trust a version
range for a file whose whole job is being the audited answer.

```
npm install github:Lautstark/stimmquelle#<commit-sha>
```

```ts
import { shippable, isAllowed, attributionsFor, modelUrls } from '@lautstark/stimmquelle';

// What this runtime may offer. Both halves matter and they are unrelated:
// the licence says it may be handed on, the runtime says it will speak.
const voices = shippable('browser');

// Before fetching anything. An id that reaches Hugging Face unchecked is a
// licensing decision made by whoever typed it.
if (!isAllowed(id, 'browser')) throw new Error(`not an offerable voice: ${id}`);

const { onnx, config } = modelUrls(id, 'browser')!;

// Whatever ends up on screen or in an exported file, render what is owed.
const notices = attributionsFor(usedVoiceIds);
```

`shippable`, `isAllowed`, `byId`, `displayName`, `qualityOf`, `parseVoiceId`,
`attributionsFor`, `modelUrls`, and `VOICES`, `MIRRORS`, `LIBRARY`, `CHECKED`.
No network, no disk, no synthesis — `displayName` in particular works from an id
alone, including for a model that is not in the catalogue, because a machine that
cannot render a WAV still has to know what the file would have been called.

### For a page with no bundler

mitreden's browser build has no npm and no bundler, deliberately, and vorlaut has
none yet either. So the package also ships a **committed** self-contained ESM
build with no bare imports and the catalogue inlined — 13 kB, one file, loadable
from a relative path or from behind an import map:

```
dist/browser/stimmquelle.js
```

Committed rather than produced by `prepare`, because a consumer with no package
manager cannot run `prepare`. CI fails if it stops matching the source.

Fetch it with `tools/vendor.py` and pin it by sha256 in `vendor.lock.json`, or
drop it in `static/vendor/stimmquelle/` with a `VENDORED.md` recording the commit.
Both work; they are the two conventions the two consumers already have.

### Just the data

`voices.json` sits at the root and is exported as `@lautstark/stimmquelle/voices.json`,
so anything that can parse JSON can read it without the module — a `jq` line, a
`json.load`, a build script. It stays a plain file rather than becoming a
constant inside the module for that reason, and because a change to it should
review as a data diff rather than as code.

## Developing

```
npm install
npm run typecheck
npm test
npm run build
```

The tests are the licensing rule made executable rather than a description of
the module. Documentation is the weakest form of enforcement: all three of the
prose statements of this rule were correct on the day a CC BY-NC-SA voice reached
a browser build. **A failure in `test/catalogue.test.ts` is a licence problem, not
a broken test.**

## Licence

MIT — see [LICENSE](LICENSE). It covers this list and these rules. It says
nothing about the voices, which are governed by their own `MODEL_CARD`s and are
the whole point of the file.
