# T005-T006A focused R2 review

## Verdict

**APPROVE**

The sole R1 blocker is closed. The new daemon regression covers both an explicit structural parent and `parentId:null`, preserves repository and close-owner metadata through failure, retains the existing failure outcome/reason/notice behavior, and goes RED under the exact reviewer mutation.

## Repair assessment

`.pi/extensions/pij/core/daemon/loop.test.ts:378-411` is table-driven over:

- `parentId:"pij-structural-parent"`;
- `parentId:null`.

Each case starts from a bound descriptor with `gitCommonDir:"/repo/.git"` and `spawnedBy:"pij-close-owner"`, takes the dead-pane daemon failure path, and asserts:

- the returned failure outcome and reason;
- persisted lifecycle `failed`;
- unchanged `parentId`, `gitCommonDir`, and `spawnedBy`;
- classified `failureReason:"dead"`;
- the existing creator notification destination and message.

This directly guards `.pi/extensions/pij/core/daemon/loop.ts:393-397`, where the complete descriptor is passed through `markFailed()` and persisted with `writeMerged()`.

## Dimension 0 mutation evidence

The exact R1 mutation stripped `parentId` and `gitCommonDir` inside `fail()` before `markFailed()`:

```ts
const { parentId: _parentId, gitCommonDir: _gitCommonDir, ...withoutStructuralMetadata } =
	descriptor;
const failed = {
	...markFailed(withoutStructuralMetadata),
	...(deathReason ? { failureReason: deathReason } : {}),
};
```

- **RED**: daemon-loop suite failed the two new cases, with 2 failed and 42 passed. Both persisted descriptors lacked the expected parent and repository fields while `spawnedBy` remained present.
- **Restore**: `.pi/extensions/pij/core/daemon/loop.ts` returned byte-identically to SHA-256 `9d2da964401076c627c0a8632e6a31061bb839de8b537fdb2ff6b91c808c36cf`.
- **GREEN**: daemon-loop suite passed 44/44 after restoration.

## Commands and results

| Command | Result |
|---|---|
| `just test .pi/extensions/pij/core/daemon/loop.test.ts` | 44/44 passed after restoration. |
| Focused six-file tranche suite | 273/273 passed. |
| `just test .pi/extensions/pij/core/close.test.ts` | 15/15 passed. |
| `just typecheck` | Passed. |
| `just lint` | Exited 0 with the same ten pre-existing warnings and one schema-version notice outside the repair. |

## Scope

Current immutable patch SHA-256: `4eb199f949a1353603b44b7218d014ec806fe83a934f4b4b820d9c549c2bd203`.

Comparing `diff-0004.patch` with `diff-0005.patch`, the only R1 coder-owned product/test delta is the 35-line regression in `.pi/extensions/pij/core/daemon/loop.test.ts`. No implementation file changed. The execution log separately records the RED/GREEN evidence and unchanged implementation hash. Additional patch-document deltas are reviewer/orchestrator-owned review packets and roster status, not coder repair scope.

The reviewer mutation was fully restored; the pre- and post-mutation hashes are identical for both `loop.ts` and `loop.test.ts`.

## Remaining uncertainty

This focused re-review proves the required in-process daemon failure persistence contract. Full live daemon-restart proof remains T012-owned, and top-level control-plane repository wiring remains deferred to T009-T010. Neither is widened into this repair.
