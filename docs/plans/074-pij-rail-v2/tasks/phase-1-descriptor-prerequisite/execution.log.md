# Phase 1 — Execution Log

**Run**: 2026-07-29T01-17-05Z-github.com-AI-Substr
**Agent**: pij-panicky-caribou
**Delegation**: dlg-0002

---

## T001 — Ownership-law RED

**Status**: ✅ complete

- Added one AC-01 `applyWriteLaw` pair for each of `stateNote`, `statusPrev`,
  `statusNext`, `statusAt`, `statusSeq`, and `orchestrationRole`.
- Before any production change, the targeted file reported six failures and twelve
  passes. Every failure was the daemon-restores-disk assertion; every CLI-wins
  assertion already passed.

## T002 — Optional descriptor fields

**Status**: ✅ complete

- Added all six fields to `SessionDescriptor` as optional, migration-safe metadata.
- `stateNote` is the required nested `{ text, state, at }` shape with
  `state: SemanticState`.
- No reader or writer of any new field was added.

## T003 — Descriptor ownership rows

**Status**: ✅ complete

- Added all six fields to `DESCRIPTOR_FIELD_OWNER` with owner `"cli"`.
- Kept the rows together under the incident #1 explanation.
- The six AC-01 pairs turned green without changing `applyWriteLaw`.

## T004 — Orchestration role aliases

**Status**: ✅ complete

- Added `StoredOrchestrationRole = "pm" | "worker"`.
- Added `OrchestrationRole = "prime" | StoredOrchestrationRole`.
- Documented the load-bearing distinction: `"prime"` is never stored in
  `orchestrationRole`; projections join `prime?: boolean` with the stored partial role.

## T005 — Role and PIJ_ROLE regression lock

**Status**: ✅ complete

- Moved the exact-union proof that `Role` remains `"parent" | "worker"` into compiled
  `core/types.ts`.
- Added a source contract for the read-only `index.ts` narrowing: it accepts exactly
  those two words and falls back to `undefined` for a third word.
- `index.ts` was read but not edited.

## T006 — Gates

**Status**: ✅ complete

- Updated the stale task wording that still granted the C1 baseline exception.
  Phase 6 closed that red, so this phase used the parent's zero-failure bar.
- Confirmed no diff exists in `core/cli.ts`; this phase ships no behavior.

## Mutation transcript

Mutation: removed only this ownership row from `core/registry-write.ts`:

```ts
orchestrationRole: "cli",
```

Targeted RED:

```text
Test Files  1 failed (1)
Tests  1 failed | 17 skipped (18)
AssertionError: expected 'worker' to be 'pm'
Expected: "pm"
Received: "worker"
```

Restored GREEN:

```text
Test Files  1 passed (1)
Tests  1 passed | 17 skipped (18)
```

## Fix-round Role mutation transcript

Mutation: widened the compiled descriptor role in `core/types.ts`:

```ts
export type Role = "parent" | "worker" | "pm";
```

`just typecheck` RED:

```text
.pi/extensions/pij/core/types.ts(23,45): error TS2344:
Type 'false' does not satisfy the constraint 'true'.
error: Recipe `typecheck` failed on line 75 with exit code 2
```

Restored `"parent" | "worker"` and reran `just typecheck`:

```text
> tsc --noEmit
```

Exit 0.

## Final gates

| Gate | Result |
|------|--------|
| `just typecheck` | ✅ exit 0 |
| `just lint` | ✅ exit 0; 9 pre-existing warnings and one Biome schema-version info remain |
| `just test` | ✅ 198 files passed, 4 skipped; 3,644 tests passed, 19 skipped |
| `harness checks` | ✅ all 8 sensors passed; none skipped |

## Friction

- The phase task file still named the now-closed C1 baseline red. The parent dispatch
  supplied the current zero-failure ruling; the task record now matches it.
- `tsconfig.json` excludes every `*.test.ts`, so any type-level assertion placed in a
  test file is erased by Vitest and never checked by `just typecheck`. Type proofs in
  phases 2, 3, and 4 must live in a compiled non-test `.ts` file; tests should prove
  executed runtime or source contracts instead.
