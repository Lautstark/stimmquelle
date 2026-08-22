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

## What is not here yet

No code. Deliberately, and only for now.

The catalogue and the contract are the parts that were already duplicated and
already wrong, and they are the parts a container, a browser with no build step,
a bundler and a shell script can all consume without an adapter. They are worth
having on their own.

The implementations follow, in this order:

1. **`js/`** — synthesis, trim, BS.1770 measurement, gain and peak clamp,
   resample, `encodeWav`. Two of these exist already and agree on where the seam
   goes: vorlaut's `static/tts/level.js` and mitreden's `docs/app/audio.js`, each
   written for its own reasons and each putting everything up to the gain stage
   on one side and the encoder on the other. `level.js` reaches further — it owns
   its resampler and WAV decoder, so the whole chain runs under node — and
   `audio.js` brings the tests.
2. **`conformance/`** — the twenty sentences with expected values checked in, and
   a runner per implementation. See `CONTRACT.md` §7, in particular the rule that
   the same recording is levelled twice and never rendered twice.
3. **`python/stimmquelle.py`** — one stdlib-only module, because mitreden's
   container has no pip dependencies and is not getting one.

**MP3 encoding is not coming.** It is roughly 250 KB of `lamejs` that a talker
reading 16 kHz WAV never calls. The package returns levelled PCM and its sample
rate; the consumer encodes.

## Using it

**There is nothing to install, and there is no registry publish.** Same as
bildquelle: this is consumed straight from GitHub and pinned by commit, so a
consumer that has not run an update is byte-for-byte on a known version and
nobody has to trust a version range.

Today that means one file: **copy `voices.json` in and pin where it came from.**
It is 6 KB of JSON, every consumer already has something that can read JSON, and
a copy that records its source commit is a vendored dependency rather than a
duplicate.

```
https://raw.githubusercontent.com/Lautstark/stimmquelle/<commit-sha>/voices.json
```

Alongside the copy, a `VENDORED.md` — or a line in an existing lock file —
holding the commit it came from and the command that refreshes it. Prose is
enough; it carries the same facts a lock entry would.

### The four consumers, concretely

**A container image.** `mitreden/Dockerfile` and `vorlaut/Dockerfile` each
hardcode the same four voice paths in a shell loop. Both replace that with the
pinned file and derive the paths from it. Neither image gains a dependency —
`python:3.12-slim` already has Python, so no `jq` is needed:

```sh
ARG STIMMQUELLE=<commit-sha>
ADD https://raw.githubusercontent.com/Lautstark/stimmquelle/${STIMMQUELLE}/voices.json /voices.json
RUN python3 -c "import json;       print('\n'.join(v['id'] for v in json.load(open('/voices.json'))['voices']             if v['licence']['ship'] and v['container'] == 'ok'))" > /wanted.txt
```

The `ARG` is the pin, and bumping it is a visible one-line diff.

**A Python module.** `tts.py` reads the same file instead of holding
`VOICE_CATALOGUE`. Standard library only — `json.load`, and a filter on
`licence.ship`.

**A page with a vendoring tool.** mitreden's `tools/vendor.py` already fetches
third-party files, pins them by sha256 in `tools/vendor.lock.json` and serves
them same-origin. `voices.json` becomes one more entry in its `CODE` list, lands
in `docs/app/vendor/`, and `--check` verifies it like everything else.

**A page with an import map.** vorlaut vendors to
`static/vendor/stimmquelle/voices.json` with a `VENDORED.md` beside it, the same
shape bildquelle is vendored in.

### When there is code

The same two routes, because the two consumers are shaped differently and
neither should have to change to suit the other:

```
npm install github:Lautstark/stimmquelle#<commit-sha>
```

for anything with a bundler — and for a repository with no bundler, a
**committed** self-contained ESM build with no bare imports, dropped into
`static/vendor/` or fetched by a `vendor.py` and pinned by sha256. Committed
rather than built by `prepare`, because a consumer with no package manager cannot
run `prepare`.

The Python module is one stdlib-only file, so it is `pip install` from a git
commit for a repository that has a `requirements.txt`, and a vendored copy for
one that does not. mitreden's container has no pip dependencies at all and is not
getting one for this.

## Licence

MIT — see [LICENSE](LICENSE). It covers this list and these rules. It says
nothing about the voices, which are governed by their own `MODEL_CARD`s and are
the whole point of the file.
