# Releasing

**Since 2026-09-16 this package is published to npmjs.org as
`@lautstark/stimmquelle`, prebuilt, by CI, from the commit subjects.** Nobody
runs `npm version` any more and nobody writes a tag. `dist/` is in the tarball
and there is no `prepare` script: a consumer with a package manager installs
compiled output and compiles nothing. The consumer without one — the page that
vendors `dist/browser/index.js` by hand — is unchanged: that bundle stays
committed, and CI still refuses a push where it is stale.

The `github:Lautstark/stimmquelle#vX.Y.Z` pins still resolve for every tag cut
before that date. No tag cut after it carries a build step, so a consumer that
wants anything newer than v2.10.0 takes it from npm:

```
npm install @lautstark/stimmquelle@^2.10.0
```

A **git tag is still the release**, and it is still the thing that must never
move. What changed is who cuts it.

## What happens on a push to main

`.github/workflows/release.yml` calls the family's reusable workflow in
`Lautstark/.github`, which runs the gate — `npm run typecheck && npm test &&
npm run build && npm run check:exports` — checks that the tarball `npm pack`
would ship carries every entry point `package.json` declares and no `prepare`
script, and then runs `semantic-release`, configured in `release.config.mjs`.

semantic-release reads every commit since the last `v*` tag and decides:

| subjects since the last tag contain | bump |
|---|---|
| `feat!:`, or a `BREAKING CHANGE:` trailer | **major** |
| `feat:` | **minor** |
| `fix:`, `perf:` | **patch** |
| only `docs:`, `test:`, `ci:`, `build:`, `chore:`, `refactor:` | none — green, nothing published |

If there is a bump, it writes the version into `package.json` and the
lockfile's mirror of it, prepends the notes to `CHANGELOG.md`, and then does
the two things this package needs on top of the family's usual four: it
writes the same number into `src/contract.ts` through `tools/set-version.mjs`
— `VERSION` is exported so a vendored bundle can say which release it is —
and rebuilds `dist/browser`, so the committed bundle carries that number.
`tools/check-exports.mjs` runs again on the result and refuses a mismatch.
Then it commits all of it as `chore(release): x.y.z`, tags that commit
`vx.y.z`, publishes the tarball to npmjs.org with provenance, and writes a
GitHub release with the same notes. Last, it checks that the tag on the
commit, `package.json` and what the registry answers for that version are one
number — the check the old tag-triggered CI made, asked of the commit it just
tagged.

**So the bump is decided when the commit is written, not when the release is
cut.** The commit subject is the release note and the version at once, which
is why `commit-messages.yml` refuses a subject without a prefix.

The narrative in `CHANGELOG.md` — what a consumer has to edit before an update
compiles, and why — is still worth writing, and semantic-release prepends its
generated section above whatever is there. Write the paragraph that matters
into the commit body of the `feat:` or `feat!:` commit; it lands in the
changelog and the GitHub release without a second edit.

## Which prefix

Consumers take this package as a caret range now, and Renovate merges a minor
or a patch into them on its own once their tests pass; a major waits for a
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

## What a person still does, once

The workflow stops before semantic-release, green, with a notice, until the
npm side exists. That side is an account and cannot be created from a
repository: the `lautstark` organisation on npmjs.org, the first publish of
this package by hand (`npm ci && npm run build && npm publish --access
public` from a clean checkout), and then either trusted publishing for
`release.yml` plus a repository variable `NPM_TRUSTED_PUBLISHING=true`, or an
organisation secret `NPM_TOKEN`. `@lautstark/sicherung`'s RELEASING.md spells
the three out; they are the same for every package in the family.

## Never move a published tag

If a tag is wrong, cut the next version: a `fix:` commit. Re-pointing a tag
leaves consumers with lockfiles pinned to a commit that no longer matches it,
and nothing warns them. Since 2026-09-16 that goes for the npm side too — a
published version cannot be replaced, only deprecated and superseded.
