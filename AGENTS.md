# pij — Agent Rules

> **The harness is the product.** pij is engineering infrastructure for
> building pi extensions. Every extension is an exercise; every difficulty
> is a gift to encode. If a session ends without the harness improving,
> something went wrong.

## Inherited from pi-mono (do not violate without explicit user approval)

- No `any` types unless absolutely necessary.
- No inline imports — never `await import("./foo.js")`, never
  `import("pkg").Type` in type positions, no dynamic imports for types.
  Always top-level standard imports.
- Never hardcode keybindings; use a configurable matching object
  (`DEFAULT_*_KEYBINDINGS`).
- Biome check (errors and warnings) before commit: `npm run lint`.
- Type-check: `npm run typecheck` (`tsc --noEmit`).
- Tests: `npm test`. Run from the package root.
- Read files in full before wide-ranging changes; do not rely solely on
  search snippets.
- Never use `git add -A` / `git add .`. Use specific file paths.
- Never bypass hooks (`--no-verify`, `--no-gpg-sign`).
- Never `git reset --hard`, `git checkout .`, `git clean -fd`,
  `git stash` without explicit user approval.

## pij-specific (Patterns P1–P10 from workshop 003)

1. **T2 layout by default**: `.pi/extensions/<name>/{index,store,test}.ts`.
   T1 (single file) only for <80 LOC, single-concern extensions.
2. **Pi-free store**: `store.ts` imports nothing from `@earendil-works/*`.
3. **Inject side effects via constructor.** No global mutable state.
4. **Tagged-union returns** (`{ ok, ... }`) over throws.
5. **Constants live in `store.ts`** next to the data they constrain.
6. **Structural entry types** at the boundary (no cast at the call site).
7. **`.js` extension on relative imports** (NodeNext / ESM).
8. **Tests target the store**, not the wiring.
9. **Persist before mutate** (event-sourced consistency).
10. **One handler for `session_start`**, all reasons (`startup`, `reload`,
    `new`, `resume`, `fork`).

## Workflow

1. New extension: **`npm run new -- <name>`** — never hand-roll the T2
   boilerplate.
2. Iterate: `pi` from pij root + `/reload`. Type-check in another tab
   (`npm run typecheck` or watch mode).
3. Test: `npm test` (vitest). Tests target `store.ts`.
4. Smoke: `npm run smoke -- <name>` before merging.
5. Self-check before any release: `npm run self-check`.

## Difficulty ledger

- Every difficulty encountered → `docs/difficulties.md` with severity.
- Every workaround → either an immediate fix (encode it) or a wishlist
  entry (`stretch:` tag).
- Every fix is preferred to be a *generator/template/lint rule* improvement,
  not a markdown paragraph.

## Velocity log

- Every phase end → row in `docs/velocity.md` with start/end and output.
- Goal: each successive extension is faster than the last (compounding
  judged against the v1 build wall-clock baseline; see spec § Clarifications
  session 2026-05-09b — no fixed minute thresholds are gates).

## When something is unclear

- Read workshop 001/002/003/004 in `docs/plans/001-pi-extensions/workshops/`.
- The research dossier at `docs/plans/001-pi-extensions/research-dossier.md`
  has the wider context.
- The pi-mono source at `/Users/jordanknight/pi-hacking/pi-mono/` is the
  source of truth; query it via the FlowSpace `pi-mono` graph.

## Forbidden without explicit user approval

- Modifying the installed pi binary or the pi-mono checkout.
- Skipping any of P1–P10 in a new extension.
- Replacing the toolchain (npm scripts → just/make/pnpm/etc.).
- Publishing to npm.
- Pushing to a public remote.
