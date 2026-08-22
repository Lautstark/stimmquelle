import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `.claude/worktrees/` holds full checkouts of this repo, each with its own
    // `test/`. Without this, a local `npm test` collects every copy and runs the
    // suite three times over — including against whatever half-finished state a
    // branch happens to be in. CI never saw it, because a fresh checkout has no
    // worktrees in it.
    include: ['test/**/*.test.ts'],
    exclude: ['**/node_modules/**', '.claude/**'],
  },
});
