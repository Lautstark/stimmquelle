# stimmquelle

Speech for German AAC tools: which piper voices may be shipped, which actually
speak in a browser, and the loudness contract both halves of a talker agree on.

- **[`voices.json`](voices.json)** — which voices may be shipped, which actually
  speak in a browser, and why each rejected one was rejected.
- **[`CONTRACT.md`](CONTRACT.md)** — the loudness, trimming, phoneme and
  fingerprint rules every implementation has to follow, in any language.
- **[`src/`](src)** — the implementation the two consumers share, so that the
  rules above are enforced by something rather than described by something.

Extracted from [mitreden](https://github.com/Lautstark/mitreden) and
[vorlaut](https://github.com/Lautstark/vorlaut), which had written the same
answers down separately. The sibling of
[bildquelle](https://github.com/Lautstark/bildquelle), and here for the same
reason: the point of sharing it is not the line count — it is the licensing rule
below, which belongs in one audited place.

---

## Voices and licensing

> **This repository contains no voice models.** Nothing is checked in here and
> nothing is downloaded by it until a consumer asks for a sentence. `voices.json`
> is a list of answers about models that live on Hugging Face.

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

### And it failed again in here, which is why the gate is where it is

The same voice, the same silence, one layer down. When this package learned to
drive piper itself, `synthesize()` was written checking that an id was *in the
catalogue* — and not what the catalogue said about it. `speak()` had the whole
rule; the new door beside it had none, and `en_US-hfc_female-medium` downloaded
and spoke through it without anything asking.

So the refusal is now one function, [`refuse`](src/catalogue.ts), and every door
calls it. A rule enforced at one call site is a rule that holds exactly until
somebody adds a second call site, and adding one is not the kind of change
anybody reviews for licensing.

---

## What `voices.json` answers

Three independent questions per voice. Passing one says nothing about the others.

| | |
| --- | --- |
| **licence** | May it be handed on? `licence.ship` |
| **quality** | Does it speak in a browser? Only `medium` and `high` survive `@diffusionstudio/vits-web` — every `low` and `x_low` model dies with `idx=… must be within the inclusive range [-130,129]`, because vits-web phonemizes against one fixed symbol table instead of the `phoneme_id_map` inside each model's own `.onnx.json`. A fault in the library, not the model — driving piper directly reaches them |
| **reach** | Can vits-web fetch it? Its `voices()` call advertises 124 voices; its hardcoded `PATH_MAP` holds 119. The other five cannot be downloaded by it |

Every voice anyone has considered is in the file, including the rejected ones,
with the reason. A list holding only what passed cannot stop a voice being
reconsidered on the same evidence that let it in the first time.

`proof` records how each runtime answer was established — `spike`, `vorlaut`,
`container`, `rule` — because a list that says *tested* and means *assumed* is
worth less than no list.

### Reading it

```js
import { shippable } from '@lautstark/stimmquelle';
const offerable = shippable();
```

`shippable` withholds a voice that owes an attribution until the consumer says
it renders one — `shippable({ rendersAttribution: true })`. CC-BY is a
**conditional** permission, and a product showing no notice has not met the
condition. Defaulting the other way would hand out a conditional permission as
though it were unconditional, and nothing would ever say so, because a missing
notice fails exactly as silently as a wrong licence.

```python
shippable = [v for v in voices if v["licence"]["ship"] and v["browser"] == "ok"]
```

```sh
jq -r '.voices[] | select(.licence.ship and .browser=="ok") | .id' voices.json
```

The third one is the reason this is a file rather than a constant inside a
module: both Dockerfiles need it, and neither has a language runtime to spare.

### As it stands

15 voices considered, last read from their sources on **2026-08-22**, against
`@diffusionstudio/vits-web` 1.0.3.

**Six voices are offerable today** — Thorsten in three flavours,
`de_DE-mls-medium`, Kristin and LJ Speech. Two more are free to ship and wait
only on vits-web: Kerstin, and `en_US-john-medium`, which the direct-piper path
below already reaches.

**There is still no German female voice in a browser — but the reason has
narrowed to one thing.** It used to be that nothing could read the older models.
Now something can, and the harness has reported: driven through
`usePiperRuntime`, Kerstin speaks. 63 ids, nothing dropped, the ich-Laut landing
on `ç` at 40 — the form she was actually trained on.

What that turned up is worth more than the fix. **Native piper 1.7.0 is the one
mispronouncing her.** Her map has no combining mark at all, so native drops it
and leaves the bare `c` at 16 — a plosive where the ich-Laut belongs, three
times in one short sentence: *Ik, mökte, nikt.* Both paths phonemise to the same
33 phonemes and both produce 63 ids, so length was never the difference; the
sound is, in exactly three positions. She predates the decomposing espeak
entirely. So this package composes and native does not, the disagreement runs in
our favour, and it only ever touches a voice native cannot render properly
anyway — a model whose map holds the mark comes out byte-identical either way.
That is written into `CONTRACT.md` beside the ffmpeg true-peak entry, for the
same reason: a deliberate disagreement with a reference implementation gets
quietly fixed back by the next person unless the evidence sits next to it.

The consequence is what keeps her out. **Native piper cannot arbitrate a voice
it is mispronouncing** — comparing spectra against native Kerstin compares two
recordings saying different words, which is why an earlier band comparison
pointed the wrong way. So `browser_with_own_ids` reads `ok by measurement, not
yet by ear`, and `browser` stays `quality`. A machine has heard her. A person
has not, and that is the only thing left that can move it.

`de_DE-mls-medium` is not the answer either, and that is now measured rather
than assumed. All 236 of its speakers were rendered saying the same sentence —
same model, only `sid` changed — and **none of them sounds like German.** Not a
pacing problem and not a pitch problem: they do not sound like the language.
Kerstin went through the same harness as a control and came out fine, so the
phoneme path was not at fault. `conformance/audition-speakers.mjs` is the script,
kept so nobody re-derives the question from the speaker count.

It would not save much download: `de_DE-kerstin-low` is 63.1 MB against
`de_DE-thorsten-medium`'s 63.2 MB. Only `x_low` is genuinely smaller. But `low`
and `x_low` models are **16 kHz native**, which for a device that wants 16 kHz
means no resampling at all.

---

## What it does

Three things, independent enough to use separately: it speaks a sentence, it
levels a recording, and it answers questions about a voice.

### Speak a sentence

piper compiled to WASM, or Azure straight from the tab.

```ts
import { speak, usePiper, asBlob } from '@lautstark/stimmquelle';

usePiper(() => import('./vendor/vits-web.js'));   // wherever this app serves it from

const out = await speak('Ich möchte noch nicht ins Bett.', 'piper:de_DE-thorsten-medium',
                        { onProgress: p => show(p.share) });
audio.src = URL.createObjectURL(asBlob(out.wav));
```

**Leave `rate` alone in a browser.** It defaults to 44100 and that is the right
answer there. A `medium` model speaks at 22.05 kHz, so asking for `rate: 16000`
discards everything above 8 kHz — measured at **38 dB** down in the 8–11 kHz band
on `de_DE-thorsten-medium`, with the rest of the spectrum untouched. That is
audible, and it is what "the browser sounds duller than the container" turns out
to be. 16 kHz is vorlaut's amplifier asking, not a browser limit, and this example
used to pass it for no reason.

`speak` **checks the catalogue before it fetches anything.** A voice that may not
be shipped, that owes an attribution this consumer has not claimed to render,
that cannot speak in a browser, or that is not in the list at all, throws with
the reason. So does a backend this package does not speak: an id like
`elevenlabs:…` is refused rather than quietly handed to piper. The licensing rule
is only worth something if something enforces it at the moment a voice is about
to be used, rather than in a README.

Azure needs a key, which is passed per call and never stored here — see the
warning in `CONTRACT.md` §8, because a static site that speaks with Azure has
given its key to everyone who opens it.

#### Driving piper directly, for the voices vits-web cannot reach

Opt-in, and the reason it exists is in `CONTRACT.md` §3a. vits-web's `predict()`
phonemises, remaps and infers in one call and exposes no seam, so there is
nowhere to correct the one thing that is wrong — it feeds the *phonemizer's*
symbol ids to a model that was trained against its own, older table. Every `low`
and `x_low` voice dies of it, and in German that is every female voice piper
publishes.

```ts
import { usePiperRuntime, speak } from '@lautstark/stimmquelle';

usePiperRuntime({
  phonemizer: () => import('./vendor/piper_phonemize.js'),
  onnx: () => import('./vendor/ort.wasm.js'),
  wasmBase: '/vendor/',
});
```

Configure it and `speak()` takes this route instead; leave it out and nothing
changes. That opt-in is deliberate — refreshing a vendored copy must not change
how anything already speaks.

**The invariant that makes adopting it free:** a voice that already speaks comes
out of this path with *byte-identical phoneme ids*, so the inference input is the
same and no consumer has to re-render anything. `test/phonemes.test.ts` asserts
it against fixtures captured from the real phonemizer. Identical *audio* is not
the test and cannot be — piper is a VITS model with a stochastic duration
predictor, and three renders of one sentence give three different files.

The fault itself is narrower than "the tables differ": the phonemizer writes the
ich-Laut decomposed, as `c` followed by U+0327 COMBINING CEDILLA. Newer maps
carry that combining mark as a symbol of its own at id 140 — outside Kerstin's
130. Her map has the precomposed `ç` at 40. Both know the sound; only the newer
spelling was ever asked for. So `remapPhonemeIds` looks each phoneme up exactly
as emitted and composes it onto the one before **only** where the model has never
heard of that form.

This path owns the model fetch too, since `predict()` was doing it. Models come
from the mirror in `voices.json` rather than a `PATH_MAP` that omits five of the
voices its own catalogue advertises — which brings back `en_US-john-medium`,
confirmed speaking. It asks the same licence question `speak()` does. It does
*not* ask the runtime question, because answering that for itself is the entire
point of it.

**It keeps its own model cache**, in an OPFS directory named
`stimmquelle-models`. That is *not* where `predict()` kept its copies, so **the
first sentence in a voice downloads again — 63 MB for a medium model — even for
a voice already cached by the old path.** It reads as a broken fetch and is not
one. `forgetModels()` clears this cache; vits-web's own `flush()` clears the
other, and on a tablet it is worth clearing the one you have stopped using.

What the cache will not do is keep half a model. A download that stops early
does not raise anything by itself — the reader reports done and a 40 MB fragment
of a 63 MB file looks finished — so the bytes received are checked against the
`content-length` that was promised, and a short one throws instead of being
cached. A `.onnx` already in the cache that is shorter than the size
`voices.json` records is thrown away and fetched again, which is what heals a
copy written before that check existed.

### Level a recording

Trim the silence, measure to ITU-R BS.1770-4, apply one static gain, clamp at the
ceiling, write a WAV.

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

A sample rate must be a **positive finite number**, and a caller holding one as a
string parses it first. `postprocess(wav, { rate: '-5%' })` was reachable — it is
Azure's prosody rate passed where the sample rate goes — and it did not throw. It
returned a **44 byte WAV**: a valid header with no audio under it, which plays as
silence and reports nothing. On a talker, that is a key a child presses that
makes no sound. `'44100'` happened to work by coercion, which is worse than
either extreme, so the check is on the type as well as the value.

### Ask about a voice, or list them for a picker

`listVoices` is the one call a picker needs. Every voice comes back in the same
shape whatever renders it, so a product filtering by language or gender does not
have to know that piper writes `de_DE` and Azure writes `de-DE`, or that one
downloads 63 MB once and the other needs the network every sentence.

```ts
import { listVoices } from '@lautstark/stimmquelle';

const voices = await listVoices({ lang: 'de', gender: 'female', azure: { key, region } });
// → [{ id, name, lang, locale, gender, source, downloadBytes, needsKey, attribution? }]
```

Azure appears **only when a key is passed**, and a key that does not work throws
rather than quietly returning the piper voices alone — a picker silently short of
half its voices fails exactly the way a wrong licence does, and only the person
who typed the key can fix it.

`id` is precisely what `speak()` takes, so a picker's selection is a voice id and
nothing has to be translated. The licence gate is not re-applied here because
`shippable` already applied it: a voice in this list is a voice `speak()` will
accept, and a test asserts the two cannot disagree.

`listVoices({ system: true })` adds the **operating system's own voices**. They
cost nothing, need no key, work offline, and every OS has a German female one —
which, after piper turned out to publish exactly one licence-clear German female
voice, is not nothing.

**They make no file, and that is the whole shape of them.** The Web Speech API
returns no samples, so nothing can be trimmed, levelled, cached under a
fingerprint, or written to a talker's flash. They go through `say()` rather than
`speak()`:

```ts
import { say, listVoices } from '@lautstark/stimmquelle';

const [voice] = await listVoices({ lang: 'de', system: true });
await say('Ich möchte noch nicht ins Bett.', voice.id);   // speaks, returns nothing
```

`makesFile` on every entry is how a picker tells them apart, and `speak()` refuses
a `system:` id rather than inventing a `Spoken` with no audio in it. Two things a
product has to say out loud rather than imply: a system voice is **not levelled**,
so it will not match the piper voices beside it, and it has **no gender**, so a
gender filter excludes it — the API publishes a name and a language and nothing
else, and guessing from the name is how somebody gets told their voice is a woman
because it is called Anna.

There is no `age` filter either. piper does not publish one and neither does the
Web Speech API, so it would be a field with nothing behind it.

`piperVoices()` is the same thing without the network, for a page with no key.
The lower-level catalogue — `shippable`, `byId`, `displayName` — is unchanged.

**`listVoices({ recommended: true })` gives the four.** One voice per
language-and-gender slot, so a picker can lead with four and keep the rest behind
*more voices*:

| slot | voice | |
| --- | --- | --- |
| German male | `de_DE-thorsten-medium` | speaks today |
| English female | `en_US-kristin-medium` | speaks today |
| German female | `de_DE-kerstin-low` | needs `usePiperRuntime`, and a listen |
| English male | `en_US-john-medium` | needs `usePiperRuntime` |

The flag is **editorial, not a runtime or licence answer**, so each carries a
`recommended_why` — a bare flag is a decision nobody can argue with, which is the
failure `proof` exists to prevent one field up. Thorsten high is left out for
114 MB against 63; `thorsten_emotional` because its moods would have to be
exposed first; `de_DE-mls-medium` because 236 speakers have no name a picker can
show. A test holds the four to one per slot and refuses to recommend anything
unshippable.

Two of the four need the direct-piper path, and that is the honest state of it:
**through vits-web alone there is no German female voice and no English male
one**, because the only licence-clear candidates for those slots are exactly the
two vits-web cannot reach.

### What it deliberately is not

- **not a storage layer** — no phrases, no collections, no cache beyond the
  models themselves, no fingerprints; `CONTRACT.md` §3 says how a consumer builds
  one, and `PIPELINE_VERSION` is exported for it
- **not a key store** — Azure credentials are passed per call
- **not a promise of identical audio between two runtimes.** piper is a VITS
  model that samples: three renders of one sentence gave three different files.
  What two implementations can agree on is the *level*, and `CONTRACT.md` §7 says
  how closely

## Is the ruler itself right?

Every loudness check that measures output with the same function that decided the
gain is circular — a wrong BS.1770 satisfies all of them, and did satisfy
mitreden's whole audio suite until somebody noticed.

[`conformance/calibration.json`](conformance/calibration.json) is the one outside
opinion this family has left. The numbers came from ffmpeg's `ebur128` reading
files this code wrote, frozen on the last day any repository here had ffmpeg in
it; neither consumer can render a reference file any more.
[`conformance/calibrate.sh`](conformance/calibrate.sh) regenerates them on any
machine that has one.

The tones are chosen where K-weighting is *not* flat — 60 Hz down the high-pass
skirt, 10 kHz up on the head shelf — because a merely plausible filter passes
1 kHz and fails the ends, which sounds fine on a test tone and wrong on a voice.

One reference records a **disagreement on purpose**: on a pure sine, whose true
peak is exactly its amplitude, ffmpeg's interpolator overshoots by about 0.55 dB
and this chain lands within 0.1 dB of the analytic answer. ffmpeg is the oracle
everywhere else here, so the next person to notice the gap will be tempted to
close it. Closing it would make the chain wrong and cost that much headroom on
every recording.

**A failure in `test/calibration.test.ts` is not a test to adjust.**

## Using it

It is a package, consumed **straight from GitHub and pinned** — the same as
bildquelle, and there is no registry publish. A consumer who has not run an
update is byte-for-byte on a known version, and nobody has to trust a version
range for a file whose whole job is being the audited answer.

```
npm install github:Lautstark/stimmquelle#v2.0.1
```

Every release from 2.0.0 on is tagged, so the pin reads as a version rather than
as a sha — the same shape `@lautstark/design` is already pinned at. A sha still
works, and is the stronger guarantee of the two: a tag is a name somebody can
move, a sha is not.

```
npm install github:Lautstark/stimmquelle#<commit-sha>
```

Either way an update is somebody moving that pin deliberately, and nothing here
reaches a consumer by itself. [`CHANGELOG.md`](CHANGELOG.md) is what to read when
moving it — it says what changed and, where the API moved, exactly what to edit.

`VERSION` is exported for the copy that has no package manager: mitreden vendors
`dist/browser/index.js` by hand, and a file that cannot say which version it is
gets updated by whoever remembers.

```ts
import { shippable, isAllowed, attributionsFor, modelUrls } from '@lautstark/stimmquelle';

// What may be offered. Both halves matter and they are unrelated: the licence
// says it may be handed on, `browser` says vits-web will actually speak it.
const voices = shippable();

// Before fetching anything. An id that reaches Hugging Face unchecked is a
// licensing decision made by whoever typed it.
if (!isAllowed(id)) throw new Error(`not an offerable voice: ${id}`);

const { onnx, config } = modelUrls(id)!;

// Whatever ends up on screen or in an exported file, render what is owed.
const notices = attributionsFor(usedVoiceIds);
```

**The catalogue.** `shippable`, `isAllowed`, `refuse`, `byId`, `displayName`,
`qualityOf`, `parseVoiceId`, `attributionsFor`, `modelUrls`, and `VOICES`,
`MIRRORS`, `LIBRARY`, `CHECKED`. No network, no disk, no synthesis —
`displayName` in particular works from an id alone, including for a model that is
not in the catalogue, because a machine that cannot render a WAV still has to
know what the file would have been called.

**Choosing.** `listVoices`, `piperVoices`, `azureVoices`, `systemVoices`,
`loadSystemVoices`, `hasSystemVoices`.

**Speaking.** `speak`, `say`, `asBlob`, `usePiper`, `downloaded`, `forget`, and for the
direct path `usePiperRuntime`, `synthesize`, `phonemise`, `remapPhonemeIds`,
`hasPiperRuntime`, `downloadedModels`, `forgetModels`. Azure's own helpers —
`buildSsml`, `azureVoices`, `localeOf`, `AZURE_FORMAT`, `AZURE_RATE`.

**The chain.** `postprocess`, and its pieces separately: `decodeWav`, `encodeWav`,
`toPcm16`, `resample`, `trim`, `fadeEnds`, `pad`, `integratedLufs`, `truePeakDb`.
Plus `encodeMp3` and `DEFAULT_BITRATE`, and the contract's own numbers — `TARGET_LUFS`,
`TARGET_PEAK_DBTP`, `TRIM`, `MEASURE_RATE`, `PIPELINE_VERSION`.

### For a page with no bundler

mitreden's browser build has no npm and no bundler, deliberately, and vorlaut has
none yet either. So the package also ships a **committed** self-contained ESM
build with no bare imports and the catalogue inlined, loadable from a relative
path or from behind an import map:

```
dist/browser/index.js      the module, 49 kB
dist/browser/lamejs.js     254 kB, fetched only if something asks for an MP3
```

Two files rather than one, and the second is the point: `encodeMp3` sits behind
a dynamic import, so a consumer that only writes WAV never fetches the encoder.
**Two, and never three.** `--splitting` will hoist shared code into a third file
the moment anything dynamically imports an internal module, and `index.js`
becomes a shim pointing at a sibling no vendor script fetches. `check:exports`
fails if it stops being self-contained.
That is what makes it safe for the package to own MP3 at all — the alternative
was every consumer bringing its own, and two copies of the 16-bit rounding free
to disagree by a bit.

Committed rather than produced by `prepare`, because a consumer with no package
manager cannot run `prepare`. CI fails if it stops matching the source.

Both consumers already have a convention for vendoring a file like this — a
`tools/vendor.py` pinning it by sha256 in `vendor.lock.json`, or a drop into
`static/vendor/stimmquelle/` with a `VENDORED.md` recording the commit. Either
works; neither lives here.

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
npm run check:exports
```

`check:exports` loads every entry point `package.json` declares, by the specifier
a consumer writes rather than by a relative path. It runs after the build
because it reads `dist/`, and it exists because a package cannot see its own
entry points from the inside: all of 2.0.0's were wrong and nothing noticed.

121 tests. They are the rules made executable rather than a description of the
module. Documentation is the weakest form of enforcement: all three of the prose
statements of the licensing rule were correct on the day a CC BY-NC-SA voice
reached a browser build, and the rule was correct in this README on the day
`synthesize()` fetched the same voice without asking.

**A failure in `test/catalogue.test.ts`, or in the licence gate of
`test/synthesize.test.ts`, is a licence problem, not a broken test.**

## Licence

MIT — see [LICENSE](LICENSE). It covers this list and these rules. It says
nothing about the voices, which are governed by their own `MODEL_CARD`s and are
the whole point of the file.
