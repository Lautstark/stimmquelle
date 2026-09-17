import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  /* The `svelte/` directory ships as raw source and is compiled by whichever
     consumer imports it — that is the whole bargain in conventions.md §6.0, and
     it is why this package still has no bundler. The plugin is here for the one
     place the package has to compile its own components: the test that mounts
     them.

     `@sveltejs/vite-plugin-svelte@^6` rather than the `^7.3` the four apps run.
     7.3 requires vite ^8, and vite is not this package's to choose — it arrives
     under vitest, which is ^3 here and brings vite 7. A test-time compiler is
     the one dependency in this family that may differ from the apps', because
     nothing it produces is shipped. */
  plugins: [svelte()],
  /* Without this, vitest resolves svelte's `server` export, `mount()` throws
     `lifecycle_function_unavailable`, and every test in the file fails at once
     with a message that says nothing about configuration. Measured 2026-09-17;
     conventions.md §6.0 asks every package shipping components to carry it. */
  resolve: { conditions: ['browser'] },
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
