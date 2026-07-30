# Phase 2 — Execution Log

**Run**: 2026-07-29T01-17-05Z-github.com-AI-Substr
**Agent**: pij-panicky-caribou
**Delegation**: dlg-0003

---

## T001-T002 — Projection and conflict RED

**Status**: complete

- Added four table-driven `projectOrchestrationRole` shapes: prime precedence,
  stored PM, stored worker, and explicit `null`.
- Added the complete `hasRoleConflict` truth table.
- Before production changes, the focused run reported 29 failures and 71 passes.
  The failures named the missing projection, conflict, service, command, audit,
  projection, anomaly, and link contracts; the T008 non-change lock was already green.

## T003 — RoleService

**Status**: complete

- Added `RoleService.set` and `unset`, shaped on `PrimeService`.
- Every change re-reads the descriptor, compares the stored role, preserves unrelated
  fields, and writes with authority `"cli"`.
- Added the required `RAW_WRITE_ALLOWLIST` governance row with the ownership-specific
  reason; `persistDaemonWrite` was deliberately not used because the field is CLI-owned.

## T004 — Orchestration role verbs

**Status**: complete

- Added `pij orchestration role set [<id>] <pm|worker> [--json]`.
- Added `pij orchestration role unset [<id>] [--json]`.
- Optional IDs use the same self-resolution path as prime designation.
- Wired `RoleService` and designation audit at the real CLI composition root.

## T005-T006 — Link designation and audit history

**Status**: complete

- Added `pij link --role <pm|worker>` so adoption and designation happen in one call.
- The link path calls `RoleService`; a source contract rejects a future direct
  `orchestrationRole` write from the verb.
- Added `role-set` and `prime-set` spine kinds.
- Designation history is uncoupled, recovers pending platform writes, and appends under
  the platform write lock.
- Role events occur on change only. First designation omits `prev`; unset omits `next`.
- Prime set/retire/unset now records the winning designation history while preserving
  the existing successful JSON output byte shape.

## T007 — Total-union projections

**Status**: complete

- `list --json`, `tree --json`, and `node show --json` always emit
  `orchestrationRole: "prime" | "pm" | "worker" | null`.
- All three use the single `projectOrchestrationRole` join.
- The tree serializer re-stamps the total projection over its raw descriptor spread.
- Tests cover prime and unknown values on every projection without adding a join or
  per-row read.

## T008-T009 — Adoption non-change and human marker

**Status**: complete

- Locked `isUnadopted` to `prime !== true`: a designated PM remains in the adoption
  sweep until it has an effective parent.
- Extended the one-character list marker to `P`, `O`, `M`, or blank.
- Workers remain blank; `P` and `O` keep precedence over a conflicting stored PM role.

## T010b — Compiled alias exactness

**Status**: complete

- Added exported compiled exactness invariants beside both role aliases.
- The proofs live in `role.ts`, not a test file excluded by `tsconfig`.

## T011 — Fail-loud arguments

**Status**: complete

- Missing roles, unknown role words, unknown flags, malformed target counts, and bad
  `link --role` values return named `E-ARG` failures.
- Error text names the closed `pm|worker` vocabulary.
- Bad link role input leaves both the descriptor and spine unchanged.

## T012 — Gates

**Status**: complete

- The first full suite correctly refused the unregistered raw writer:
  `core/orchestration/role.ts` was absent from `RAW_WRITE_ALLOWLIST`.
- After the authorized governance enrollment, the full suite and all harness sensors
  passed with zero failures.

## Fix round — Legacy prime unset audit

**Status**: complete

- Added a regression for an unset on a legacy descriptor with neither `prime` nor
  `oldPrime`.
- The regression preserves the shipped descriptor behavior: both flags are
  materialized as `false` and the command reports `changed: true`.
- Prime audit is now gated on a designation transition
  (`previousDesignation !== designation`) rather than raw flag materialization, so
  the legacy unset appends no hollow `prime-set` event.

RED before the dispatch fix:

```text
Test Files  1 failed (1)
Tests  1 failed | 54 passed (55)

expected [ { kind: 'prime-set', id: 'pij-a' } ] to deeply equal []
```

GREEN after the dispatch fix:

```text
Test Files  1 passed (1)
Tests  55 passed (55)
```

- The full suite is now 3,684 passed, 0 failed, and 19 skipped across 200
  passing and 4 skipped files. The passed count increased by exactly one from
  Phase 2's 3,683 because this round adds one regression case.
- T010 was optional consistency work but touched `PrimeService`, a shipped service
  with five live consumers. Optional work on load-bearing code needs the same
  edge-case and mutation scrutiny as required work; its optional label does not
  reduce its blast radius.

## Projection mutation transcript

Mutation: removed prime precedence from the one join:

```ts
return descriptor.orchestrationRole ?? null;
```

Targeted RED:

```text
Test Files  2 failed (2)
Tests  3 failed | 20 passed (23)

expected "pm" to be "prime"
expected null to be "prime"
```

The three failures covered the pure helper, list projection, and mandatory tree
re-stamp. Restoring the join returned:

```text
Test Files  2 passed (2)
Tests  23 passed (23)
```

## Alias mutation transcript

Mutation 1 widened the stored alias:

```ts
export type StoredOrchestrationRole = "pm" | "worker" | "prime";
```

`just typecheck` RED:

```text
.pi/extensions/pij/core/orchestration/role.ts(28,2): error TS2344:
Type 'false' does not satisfy the constraint 'true'.
```

Mutation 2 narrowed the projected alias:

```ts
export type OrchestrationRole = StoredOrchestrationRole;
```

`just typecheck` RED included the compiled invariant:

```text
.pi/extensions/pij/core/orchestration/role.ts(31,2): error TS2344:
Type 'false' does not satisfy the constraint 'true'.
```

It also surfaced the expected downstream incompatibilities for `"prime"`. Restoring
both aliases returned `just typecheck` to exit 0.

## Final gates

| Gate | Result |
|------|--------|
| `just typecheck` | exit 0 |
| `just lint` | exit 0; 9 pre-existing warnings and one Biome schema-version info remain |
| `just test` | 200 files passed, 4 skipped; 3,684 tests passed, 0 failed, 19 skipped |
| `harness checks` | all 8 sensors passed; none skipped |

## Friction

- Capability enrollment is distributed across four surfaces:
  `DESCRIPTOR_FIELD_OWNER`, the raw-write allowlist, the platform spine-kind
  vocabulary, and the production CLI composition root. The packet named
  implementation paths but did not enumerate the enrollment paths. A packet preflight
  or capability-enrollment manifest should expand the allowed scope from those
  deterministic registries instead of relying on a worker to discover each one
  through a gate failure.
