# Releasing

**Since 2026-09-16 the release is cut by CI, from the commit subjects.**
Nobody runs `npm version` any more and nobody writes a tag. There is still
no registry: a **git tag is the release**, consumers pin
`github:Lautstark/stimmquelle#vX.Y.Z` as they always have, npm runs this package's
`prepare` on their machine, and Renovate moves the pin when a new tag
appears. The tag is still the thing that must never move. What changed is
who cuts it.

## What happens on a push to main

`.github/workflows/release.yml` calls the family's reusable workflow in
`Lautstark/.github`, which runs the gate — `npm run typecheck && npm run build && npm test && npm run check:exports` — and then
`semantic-release`, configured in `release.config.mjs`.

semantic-release reads every commit since the last `v*` tag and decides:

| subjects since the last tag contain | bump |
|---|---|
| `feat!:`, or a `BREAKING CHANGE:` trailer | **major** |
| `feat:` | **minor** |
| `fix:`, `perf:` | **patch** |
| only `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:` | none — green, nothing tagged |

If there is a bump, it writes the version into `package.json` and the
lockfile's mirror of it, prepends the notes to `CHANGELOG.md`, writes the same number into
`src/contract.ts` through `tools/set-version.mjs` and rebuilds the committed
`dist/browser` so the vendored bundle carries it (`tools/check-exports.mjs`
refuses a mismatch), commits all of it as `chore(release): x.y.z`, tags that commit `vx.y.z`, and writes a
GitHub release with the same notes. Then it checks that the tag on the commit
and `package.json` are one number — the check the old tag-triggered CI made,
asked of the commit it just tagged.

**So the bump is decided when the commit is written, not when the release is
cut.** The commit subject is the release note and the version at once, which
is why `commit-messages.yml` refuses a subject without a prefix. The notes go
in the commit body, where the tag annotation used to carry them.

## Which prefix

Consumers pin this package by tag, and Renovate merges a minor or a patch
into them on its own once their tests pass; a major waits for a
person. The number is a resolver input again, so the prefix has to be honest.

- **`fix:`** — a fix with no API change.
- **`feat:`** — a new export, a new voice in `voices.json`, a new optional
  option.
- **`feat!:`** — anything a consumer must change code for: a removed or
  renamed export, a changed return shape. A change to the loudness contract in
  `CONTRACT.md` is a major whatever the diff size — both halves of a talker
  agreed on it, and only one of them is in this repository. Put the reason in
  a `BREAKING CHANGE:` trailer.

`onnxruntime-web`'s pin is not a version bump and never was; `renovate.json5`
says why it stays by hand.

## Never move a published tag

If a tag is wrong, cut the next version: a `fix:` commit. Re-pointing a tag
leaves consumers with lockfiles pinned to a commit that no longer matches it,
and nothing warns them.
