// semantic-release, for this package.
//
// The version is a function of the commit subjects since the last tag, and
// nothing else: feat is a minor, fix and perf a patch, feat! or a BREAKING
// CHANGE trailer a major. docs, test, ci, chore, refactor and build cut no
// release. Written 2026-09-16; RELEASING.md says what a person still does.
//
// The order of the plugins is the order of the release:
//
//   commit-analyzer          which bump, if any
//   release-notes-generator  the notes, from the same commits
//   changelog                prepends them to CHANGELOG.md
//   npm                      bumps package.json (and the lockfile's mirror of
//                            it), publishes the tarball
//   git                      commits the files back to main as
//                            "chore(release): x.y.z", which is where the tag
//                            goes
//   github                   the GitHub release with the same notes, and an
//                            issue if a release fails
//
// The `conventionalcommits` preset rather than the default Angular one, so
// the changelog uses the words commit-messages.yml holds the subjects to.
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    '@semantic-release/npm',
    // This package carries the version in more places than package.json, and
    // the release commit has to carry all of them. See the script.
    ['@semantic-release/exec', { prepareCmd: 'node tools/set-version.mjs ${nextRelease.version} && npm run build && npm run check:exports' }],
    ['@semantic-release/git', {
      assets: ['package.json', 'package-lock.json', 'CHANGELOG.md', 'src/contract.ts', 'dist/browser'],
      message: 'chore(release): ${nextRelease.version}\n\n${nextRelease.notes}',
    }],
    '@semantic-release/github',
  ],
};
