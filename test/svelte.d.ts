/*
 * What `tsc` is told a `.svelte` file is, so that a test may import one.
 *
 * `tsc` cannot read a component: svelte2tsx can, and `svelte-check` is the half
 * of `npm run typecheck` that holds these components to their own props and
 * their imports from `src/` to their signatures — measured, and it catches real
 * errors across that boundary. This declaration exists only so that the other
 * half, `tsc -p tsconfig.json`, can walk a `.ts` test that mounts one; a real
 * file resolution wins over a wildcard, so svelte-check still sees the precise
 * types and loses nothing to it.
 *
 * It does not ship. `test/` is not in `files`, and the `.svelte` sources
 * consumers compile carry their own types through svelte2tsx.
 */
declare module '*.svelte' {
  import type { Component } from 'svelte';

  const component: Component<Record<string, unknown>>;
  export default component;
}
