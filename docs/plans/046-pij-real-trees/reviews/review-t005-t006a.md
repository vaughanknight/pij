# T005-T006A cold review

## Verdict

**FIX_REQUIRED**

The reviewed implementation is behaviorally coherent, in scope, and green across the required gates. The mandatory daemon-null and repository refresh/preservation guards both proved load-bearing. However, the explicit failure-path durability claim is not mutation-resistant: removing both `parentId` and `gitCommonDir` immediately before the daemon persists a failed descriptor leaves all 42 daemon-loop tests green. Under the Dimension 0 rubric, that unguarded required behavior blocks approval.

## Findings

### High - Failure-path parent/repository durability has no load-bearing regression

The implementation preserves metadata correctly because `.pi/extensions/pij/core/daemon/loop.ts:393-397` spreads the complete descriptor through `markFailed()` before `writeMerged()`. The required behavior is nevertheless unproved by the worker-authored suite:

- `.pi/extensions/pij/core/daemon/loop.test.ts:303-324` exercises the watchdog failure transition and notification, but seeds no `parentId` or `gitCommonDir` and asserts only lifecycle/notice behavior.
- `.pi/extensions/pij/core/binding.test.ts:51-55` checks only that `markFailed()` changes `lifecycle`.
- No failure assertion requires either an explicit parent id or `parentId:null`, the repository key, and `spawnedBy` to survive together.

Empirical mutation removed `parentId` and `gitCommonDir` from the descriptor inside `fail()` before `markFailed()`:

```ts
const { parentId: _parentId, gitCommonDir: _gitCommonDir, ...withoutStructuralMetadata } =
	descriptor;
const failed = {
	...markFailed(withoutStructuralMetadata),
	...(deathReason ? { failureReason: deathReason } : {}),
};
```

`just test .pi/extensions/pij/core/daemon/loop.test.ts` still passed 42/42. This directly contradicts the mandatory claim that failure preserves the new structural/repository metadata.

Add an actual daemon failure regression, preferably table-driven over an explicit parent id and `null`, that asserts `parentId`, `gitCommonDir`, and `spawnedBy` remain unchanged while lifecycle becomes `failed`. The test must go RED under the mutation above.

## Mandatory-check assessment

### Tri-state parent and repository identity

- **Pending descriptor**: `.pi/extensions/pij/core/spawn.ts:324-345` uses presence checks for both fields. `.pi/extensions/pij/core/spawn.test.ts:538-562` covers explicit id and `null` while keeping `spawnedBy`, model, effort, planned session, and branch metadata distinct.
- **Pi registration/reload/hydration**: `.pi/extensions/pij/index.ts:273-305` resolves the repository before `session.boot()` and forwards `PIJ_PARENT_ID` only when present. `.pi/extensions/pij/core/session.ts:137-164` spreads durable state first, refreshes supplied values, and preserves absent values. The focused session and index tests cover explicit id, `null`, refresh, absence, reload, and durable hydration.
- **Reattachment**: `.pi/extensions/pij/core/binding.ts:212-229` preserves durable metadata and refreshes only a supplied repository key. `.pi/extensions/pij/core/binding.test.ts:311-351` also keeps `deliveryMode`, transcript path, structural root, and close owner intact.
- **Daemon merge**: `.pi/extensions/pij/core/daemon/loop.ts:143-179` treats `parentId` and `gitCommonDir` as latest-disk-authoritative only when the latest descriptor contains them. Existing `prime`, `reportedAt`, daemon-owned clear, and state behavior remains intact.
- **Snapshot/hydration/dissolve**: `.pi/extensions/pij/adapters/fs-registry.test.ts:275-314` performs real registry writes, descriptor removal, durable snapshot resolution, hydration, dissolve, second removal, and second snapshot resolution. It characterizes the actual snapshot machinery rather than restating an object literal.
- **Failure**: implementation preserves the fields, but the finding above shows the required test proof is absent.

### Ownership

Every new state assertion keeps `spawnedBy:"pij-close-owner"` separate from structural parent metadata, including `.pi/extensions/pij/core/spawn.test.ts:541-561`, `.pi/extensions/pij/core/session.test.ts:172-237`, and `.pi/extensions/pij/core/binding.test.ts:311-351`.

The negative close assertion remains `.pi/extensions/pij/core/close.test.ts:76-87`: a caller whose id does not equal `spawnedBy` receives `ok:false` and `E-OWN` without `--force`. The close suite passed 15/15.

### Merged invariants

- `deliveryMode` remains preserved by reattachment and its existing regression.
- Codex phonehome still selects and normalizes `CODEX_THREAD_ID`.
- Daemon post-outcome routing still returns the send outcome only after injection and leaves Pi-owned messages unread.
- Durable inbox injection, mark-read ordering, receipt persistence, retry, and replay tests remain green.
- Existing GPT-5.6 model/effort coverage remains green.
- No old-prime, top-level CLI/wiring, T011, smoke/live, package, schema, dependency, or s044 product path is present in the immutable coder change set.

## Commands and results

| Command | Result |
|---|---|
| `harness boot` | Ready; typecheck and full unit-test stages passed. |
| Focused six-file tranche test command | 271/271 passed. |
| `just test .pi/extensions/pij/core/close.test.ts` | 15/15 passed. |
| `just typecheck` | Passed. |
| `just lint` | Exited 0 with ten pre-existing warnings and one schema-version notice, all outside reviewed paths. |
| `harness checks --quick` | Typecheck, lint, full tests, Windows compatibility, package audit, and snapshots passed; smoke skipped by `--quick` as T012-owned. |

`harness checks --quick` refreshed five package-vetting timestamps. Those date-only side effects were restored; `.pi/packages.yaml` is byte-identical to `HEAD` with SHA-256 `c5fc45ee468a4e7293b1e508a498234a087e8698de5df4580509a40936832840`.

## Dimension 0 mutation evidence

### Daemon latest-null guard - mandatory proof

- **Guard**: `.pi/extensions/pij/core/daemon/loop.ts:149`, membership of `"parentId"` in `MUTABLE_EXTERNALLY_OWNED_FIELDS`.
- **Mutation**: removed `"parentId"` from the array.
- **RED**: daemon-loop suite failed 1/42; `.pi/extensions/pij/core/daemon/loop.test.ts:606-610` received `"pij-stale-parent"` instead of `null`.
- **GREEN after restore**: 42/42 passed.
- **Byte-identical restore**: SHA-256 `9d2da964401076c627c0a8632e6a31061bb839de8b537fdb2ff6b91c808c36cf`.

### Repository refresh and preservation guards - mandatory proof

- **Refresh mutation**: changed the session conditional from `input.gitCommonDir !== undefined` to `input.gitCommonDir === undefined`.
- **RED**: session suite failed 3/41; stale `/old/.git` survived fresh refresh, durable hydration failed to refresh, and a new dissolve fixture lost `/repo/.git`.
- **Preservation mutation**: replaced the conditional spread with unconditional `gitCommonDir: input.gitCommonDir`.
- **RED**: session suite failed 1/41; absent input cleared the durable `/old/.git` to `undefined`.
- **GREEN after each restore**: 41/41 passed.
- **Byte-identical restore**: SHA-256 `c0ba46fad07ef0e2684e46b670259ba5383636f43df45e1a26cf80662eb58c8c`.

### Failure durability mutation - blocking gap

- **Mutation**: stripped `parentId` and `gitCommonDir` inside daemon `fail()` before persistence.
- **Unexpected GREEN**: daemon-loop suite remained 42/42.
- **Restore**: suite returned green and `loop.ts` returned to SHA-256 `9d2da964401076c627c0a8632e6a31061bb839de8b537fdb2ff6b91c808c36cf`.

This surviving mutation is the basis for the `FIX_REQUIRED` verdict.

## Scope

Immutable patch SHA-256: `9e41b03af5a449b3752bdc22a5be912087a1e1d34309eb9ca1038dc1ad4271af`.

The immutable patch contains the following coder-owned paths:

- `.pi/extensions/pij/adapters/fs-registry.test.ts`
- `.pi/extensions/pij/core/binding.test.ts`
- `.pi/extensions/pij/core/binding.ts`
- `.pi/extensions/pij/core/daemon/loop.test.ts`
- `.pi/extensions/pij/core/daemon/loop.ts`
- `.pi/extensions/pij/core/session.test.ts`
- `.pi/extensions/pij/core/session.ts`
- `.pi/extensions/pij/core/spawn.test.ts`
- `.pi/extensions/pij/core/spawn.ts`
- `.pi/extensions/pij/index.test.ts`
- `.pi/extensions/pij/index.ts`

Allowed `.pi/extensions/pij/adapters/fs-registry.ts` is intentionally unchanged because the characterization was already green. The patch also contains orchestrator-owned `docs/plans/046-pij-real-trees/reports/fleet-roster.md`, which the brief explicitly excludes from coder scope. The execution log was reviewed separately because it is not embedded in the immutable patch.

## Remaining uncertainty

This review covers only T005-T006A core persistence and Pi registration. Top-level control-plane spawn/adopt/reattach repository wiring remains deferred to T009-T010, and full daemon-restart/live proof remains T012-owned. No functional data-loss defect was reproduced in the reviewed implementation; the blocker is the missing mutation-resistant failure-path regression required before that durability claim can be trusted.
