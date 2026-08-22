# Changelog

Consumers pin this package **by commit**, so nothing here reaches anybody by
itself. This file exists to say what changed and — where it matters — what a
consumer has to edit before the update compiles.

`VERSION` is exported, so a vendored `dist/browser/index.js` can say which one it
is without anybody having to remember.

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
