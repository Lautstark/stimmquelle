# Changelog

Consumers pin this package **by tag or by commit**, so nothing here reaches
anybody by itself. This file exists to say what changed and — where it matters —
what a consumer has to edit before the update compiles.

Every release from 2.0.0 on has a tag, so a pin can read as a version —
`#v2.0.1` — rather than as a sha. Tags are what a human moves deliberately; the
sha is still there for anyone who wants the stronger guarantee.

`VERSION` is exported, so a vendored `dist/browser/index.js` can say which one it
is without anybody having to remember.

---

## 2.2.0

### Every recording re-renders. This is the one that changes how things sound.

**`PIPELINE_VERSION` is 2.** Bump the constant in each consumer's fingerprint and
let the caches rebuild. Nothing else in this release needs anything.

### The ceiling stopped deciding how loud a voice is

`de_DE-kerstin-low` came out **3.0 dB quieter** than `de_DE-thorsten-medium`
through the identical chain, both marked levelled, in the same product. She is
peakier; the ceiling took her gain back and she landed at −19.0 LUFS against his
−16.0. Two voices at two volumes is the failure levelling exists to prevent.

CONTRACT.md §1 forbade a limiter, on the reasoning that a browser must not level
better than the container it shared a cache with. There is no container, and the
rule was costing the thing it was written to protect. So the gain now comes from
the target and the ceiling is held by a look-ahead true-peak limiter. Limiting
costs a little loudness of its own, so the result is measured again and the
shortfall added back, up to four passes.

Kerstin now lands at **−16.2** against Thorsten's **−16.0** by ffmpeg's own
`ebur128`, and her crest factor falls from 17.5 dB to 14.5 — where his already
was. She was the outlier, and she is not squashed.

`Levelled.clamped` still exists but means something new: **the limiter engaged**,
not *the recording came out quiet*. `limitedDb` says by how much. `limitTruePeak`
is exported for anyone who wants the piece on its own.

Levelling a recording that needs limiting takes about three times as long — one
extra loudness measurement per make-up pass. It is still milliseconds against
seconds of synthesis, and untouched for a recording that needs none.

---

## 2.1.1

**Evidence, not code.** Nothing changed in the chain, the catalogue's answers or
the API. `PIPELINE_VERSION` is still 1 and nothing re-renders — this is here so
the version a consumer pins moves when the file it reads does.

- **The browser chain was cleared.** "Worse than the Python app" was the right
  observation about the wrong thing: a real recording measures **−16.0 LUFS** by
  ffmpeg's ebur128 against a target of −16, and MP3 costs 0.2 LUFS taken
  uniformly off every band. The container defaulted to Kerstin and the browser
  offers Thorsten, and Kerstin — `low`, 16 kHz, nothing above 8 kHz — is the
  worse of the two. Her `voices.json` note now says so.
- **The frozen calibration references were re-run**, for the first time since
  they were frozen: ffmpeg 9.0.1, all five tones still agreeing to the tenth of a
  decibel ffmpeg prints. Recorded in `conformance/calibration.json` under
  `verified`, because CI has no ffmpeg and is not getting one.
- **One thing turned up and is not written down anywhere yet.** The true-peak
  ceiling stops Kerstin short of the target, so she lands quieter than Thorsten
  through the same chain and two voices in one app do not match. The figure
  reported alongside it — about 2.4 dB — is in the commit message for `6ec49a0`
  and in no test, no fixture and no measurement in this repository, so treat it
  as an observation and not as a number. §1 gives the ceiling priority over the
  target on purpose; hitting both would mean limiting, which changes the sound.
  Whether that is worth doing is open.

### What to edit

Nothing.

---

## 2.1.0

### The operating system's voices, as a third source

`listVoices({ system: true })` adds whatever voices the OS already has. They cost
nothing, need no key, and work with no network — and every OS has a German female
one, which after piper turned out to publish exactly one licence-clear German
female voice and MLS turned out not to speak German is the point of them.

**They make no file.** The Web Speech API returns no samples, so nothing can be
trimmed, levelled, cached under a fingerprint, or written to a talker's flash.
They go through the new `say()` rather than `speak()` — a different verb because
it is a different act — and `speak()` refuses a `system:` id with a pointer to it.

`Offered` gains **`makesFile`**, which is the fact a picker most needs: the
difference between a voice that saves and one that does not is invisible until
somebody tries to save one.

Two consequences to state to a user rather than imply: a system voice is **not
levelled**, so it will not match the piper voices beside it; and it has **no
gender**, because the API publishes a name and a language and nothing else, so a
gender filter excludes them. Guessing from the name is how somebody is told their
voice is a woman because it is called Anna.

### Also

- The `speak()` example in the README no longer passes `rate: 16000`. On a
  22.05 kHz model that discards everything above 8 kHz — measured 38 dB down in
  the 8–11 kHz band. `postprocess` always defaulted to 44100; only the example
  disagreed.
- `de_DE-mls-medium` is recorded as **not** a route to a German female voice. All
  236 speakers were rendered and none sounds like German.

---

## 2.0.2

**The committed browser build had quietly become three files, and only two of
them are vendored.** Anyone dropping `dist/browser/index.js` into a page by hand
on 2.0.0 or 2.0.1 has a 3 kB re-export shim importing a `./chunk.js` that their
vendor script never fetched. It does not run.

`listVoices` reached `azureVoices` through `await import('./speak.js')`, a
dynamic import of an *internal* module. That is all esbuild's `--splitting`
needs to hoist every shared byte into a sibling chunk and leave the entry point
a stub. `speak.ts` only ever took a *type* from `list.ts`, so there was no
runtime cycle to dodge and nothing to gain: `index.ts` re-exports speak
statically anyway, so it was in the bundle either way.

It is a static import now, and `index.js` is one self-contained 45 kB file
again. `check:exports` fails if it ever stops being one.

### What to edit

Nothing, in source. **Re-run your vendor script**, and delete any
`docs/vendor/chunk.js` or `static/vendor/stimmquelle/chunk.js` it may have left.

No API changed and nothing re-renders.

---

## 2.0.1

**The package's own entry points, which had never worked.** No behaviour
changed, nothing sounds different, and nothing needs re-rendering.

### What to edit

mitreden's `tsconfig.json` carries a `paths` override for
`@lautstark/stimmquelle/browser` pointing at
`node_modules/@lautstark/stimmquelle/dist/src/index.d.ts`. **Delete it.** The
subpath now carries its own `types`, and the file it names no longer exists —
the build emits `dist/index.d.ts`, which is what `package.json` was claiming all
along.

### What was wrong

`main`, `types` and `exports["."]` all pointed at `./dist/index.js` and
`./dist/index.d.ts`. The build wrote `dist/src/index.js`, because `catalogue.ts`
imports `../voices.json` and an un-pinned `rootDir` widened to the package root
to take it in. So `import { speak } from '@lautstark/stimmquelle'` did not
resolve at all, for the whole of 2.0.0.

Nothing caught it. Typecheck and tests read `src`, the browser bundle is built
by esbuild and never touched the broken paths, and the one consumer reached past
`exports` entirely with the override above. A package cannot see its own entry
points from the inside.

`rootDir` is now pinned to `src`, so the build is flat and `../voices.json`
still resolves to the single audited copy at the root rather than to a second
one emitted beside it. `npm run check:exports` loads every declared entry point
by its public specifier, and CI runs it.

### Also

`exports["./browser"]` now has a `types` condition. It never had one, which is
the reason the override existed.

Two findings landed in this release alongside the fix, neither of them code:

- **mls is ruled out as a German female voice**, on the evidence of all 236
  speakers rendered and listened to. The entry stays in `voices.json` with what
  was measured attached, so nobody has the idea again. Kerstin holds the slot.
- **`speak()`'s README example no longer passes `rate: 16000`.** It was the line
  anybody would copy, and against a 22.05 kHz model it threw away everything
  above 8 kHz — 38 dB down in the 8–11 kHz band. The default of 44100 was always
  right; only the example disagreed. No behaviour changed, but a consumer that
  copied that line should drop it and re-render.

---

## 2.0.0

**Breaking. Both consumers need edits.** Everything below is a rename or a
signature, none of it changes how anything sounds, and no recording needs
re-rendering.

### What to edit

| was | now |
| --- | --- |
| `shippable('browser')` | `shippable()` |
| `isAllowed(id, 'browser')` | `isAllowed(id)` |
| `modelUrls(id, 'browser')` | `modelUrls(id)` |
| `azureVoices(o)` → `string[]` | → `Offered[]`; the id is now `azure:<ShortName>` |
| `Runtime`, `Voice.container`, `MIRRORS.container` | gone |

An `elevenlabs:` or misspelled backend now **throws** instead of being handed to
piper. If anything was relying on that, it was fetching a model nothing had
checked.

### The licence gate reaches every door

`synthesize()` checked only that an id was in the catalogue, so
`en_US-hfc_female-medium` — CC BY-NC-SA, the voice this repository exists because
of — downloaded and spoke through it. `speak()` had a second hole: it gated on
`backend === 'piper'` while routing everything that was not Azure to piper.

Both are closed, and the refusal is one function, `refuse(id, offering)`, that
every entry point calls. `refuse(id, null, …)` is now
`refuse(id, { ownsInference: true })`.

### One list for a picker

`listVoices({ lang, gender, recommended, azure })` returns every voice a product
can offer, in one shape, from every backend it is configured for. Azure appears
only when a key is passed and throws on a bad one rather than quietly returning
half the list.

`recommended` marks one voice per language-and-gender slot — Thorsten, Kristin,
Kerstin, John — so a picker can lead with four. **Two of the four need
`usePiperRuntime`**: vits-web cannot phonemise Kerstin and does not list John.

### Smaller

- A download that stops early is refused instead of cached, and a cached model
  shorter than `voices.json` says is re-fetched. **Anyone running an earlier
  version may have a truncated model in OPFS**; this heals it on the next call,
  no `forgetModels()` needed.
- `MEASURE_RATE` is now actually used by the levelling rather than described by
  it, and pinned at 48 kHz by a test.
- The container runtime is gone from the catalogue. No consumer has one.

### Not changed

Loudness, trimming, phoneme ids, fingerprints. `PIPELINE_VERSION` is still 1.
Nothing re-renders.

---

## 1.0.0

The catalogue, the levelling chain, `speak()`, MP3, the conformance references,
and driving piper directly for the voices vits-web cannot reach.
