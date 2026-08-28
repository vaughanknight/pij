# Item 10a execution log — pane-resolution guard

**Delegation**: `dlg-0008`
**Worker**: `pij-gunboat-diplomat`
**Base in history**: `fa6378a`
**Implementation commit**: `6948e14a4cc661cffe445df60538293c8df29413`

## TDD

- RED: two new tests failed on the unguarded index:
  - a dissolved pane resolved instead of `undefined`;
  - a later terminal descriptor overwrote the fresh bound seat on a reused pane.
- GREEN: `index-state.test.ts` passes 9/9.

## Change

`IndexState.rebuild` now excludes `lifecycle:"dissolved"` and `lifecycle:"failed"` from
`byPane`. Bound, pending, ready, and legacy descriptors retain pane resolution.
`byId`, `byHarnessSession`, and `byHarnessIdentity` are unchanged, so terminal descriptors
remain available for audit and state inspection.

## Gates

- `npx vitest run .pi/extensions/pij/core/daemon/index-state.test.ts`: 9/9 passed.
- `just typecheck`: passed.
- Changed-file Biome: passed.
- No `loop.ts` change.