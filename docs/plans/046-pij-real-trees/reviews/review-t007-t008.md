# T007-T008 cold review

## Verdict

**APPROVE**

No correctness, compatibility, scope, or mutation-resistance findings remain. The implementation adds migration-safe old-prime state, preserves legacy set/unset JSON receipts, keeps `list --prime` current-prime-only, and protects daemon persistence in both boolean directions.

## Behavior assessment

- `.pi/extensions/pij/core/types.ts:53-56` adds optional `oldPrime`; absence projects as false at list boundaries.
- `.pi/extensions/pij/core/orchestration/prime.ts:16-33` writes the complete pairs `(true,false)`, `(false,true)`, and `(false,false)` for set, retire, and unset. Pair-aware idempotence avoids writes only when both stored values already match. Descriptor spread preserves unrelated metadata, and no cross-session uniqueness logic was introduced.
- `.pi/extensions/pij/core/orchestration/cli.ts:206-236` accepts `retire` under the same optional exact-target and strict argument contracts as set/unset. Dispatch at lines 426-463 uses explicit targets without self resolution, otherwise uses the existing exact-self resolver and error/exit mapping.
- Service results always carry `oldPrime`. Set/unset JSON deliberately retain the legacy `{id, prime, changed}` shape; retire JSON exposes `{id, prime, oldPrime, changed}`.
- `.pi/extensions/pij/core/cli.ts:706-755` leaves `filterPrime()` as the `--prime` gate, so old-prime-only rows are excluded. Ordinary JSON adds `oldPrime:boolean`; human output renders current `P`, old-only `O`, and both-true corruption as `P` while retaining the existing column and self-marker layout.
- `.pi/extensions/pij/core/daemon/loop.ts:143-179` treats `oldPrime` as latest-disk-authoritative beside `prime`, `parentId`, and `gitCommonDir`. Explicit persisted `true` and `false` override stale opposite or absent daemon snapshots without changing daemon-owned state or append-only `reportedAt` behavior.

## Dimension 0 mutation matrix

| Mutation | RED proof | Restore |
|---|---|---|
| Make `set` write `oldPrime:true` instead of clearing it | Prime service: 3 failed, 7 passed. Clearing, pair-idempotence, and multi-prime preservation guards failed. | `prime.ts` restored to SHA-256 `e460394329aea10218956a0ea8f6d41db8dcebba47d52ac5941bcf9b488c6f28`. |
| Make `retire` retain `prime:true` | Prime service: 2 failed, 8 passed. Transition and pair-idempotence guards failed. | `prime.ts` restored byte-identically. |
| Remove `oldPrime` from daemon mutable external fields | Daemon loop: 3 failed, 44 passed. Latest false, latest true over stale false, and latest true over stale absence all failed. | `loop.ts` restored to SHA-256 `f732a5c8d0e3b77e6d7239be0e659eaeacb2d3466dcf28529f087845a18a5733`. |
| Admit old-prime-only descriptors to `list --prime` | Core CLI: 1 failed, 49 passed; `w3` incorrectly joined the expected current-prime rows. | `cli.ts` restored to SHA-256 `c2033d8df75a7b93bcfc03dc7ddd8658a5fcbbdd8a7dc18e00fd6a2ed63484e9`. |

After all restorations, the four focused files passed 145/145.

## Commands and results

| Command | Result |
|---|---|
| Four focused T007-T008 test files | 145/145 passed after restoration. |
| Six T005-T006A persistence regression files | 276/276 passed. |
| `just test .pi/extensions/pij/core/close.test.ts` | 15/15 passed. |
| `just typecheck` | Passed. |
| `just lint` | Exited 0 with ten pre-existing warnings and one Biome schema-version notice. |
| `harness checks --quick` | Passed typecheck, lint, full tests, Windows compatibility, package audit, and snapshots; smoke was intentionally skipped by `--quick`. |

The package audit refreshed five report-only vet dates in `.pi/packages.yaml`; that incidental churn was restored, leaving no reviewer product or manifest edit.

## Exact scope

Reviewed product/test paths:

1. `.pi/extensions/pij/core/orchestration/prime.test.ts`
2. `.pi/extensions/pij/core/orchestration/cli.test.ts`
3. `.pi/extensions/pij/core/cli.test.ts`
4. `.pi/extensions/pij/core/daemon/loop.test.ts`
5. `.pi/extensions/pij/core/types.ts`
6. `.pi/extensions/pij/core/orchestration/prime.ts`
7. `.pi/extensions/pij/core/orchestration/cli.ts`
8. `.pi/extensions/pij/core/cli.ts`
9. `.pi/extensions/pij/core/daemon/loop.ts`

Immutable patch SHA-256: `a7161883ae39b4fca71410b93c563df88737036778c25503503253ffe4949ca2`.

The coder-owned product/test delta is confined to those nine granted paths. Patch changes to the fleet roster and grant request are orchestrator-owned evidence and were excluded from the coder scope. There are no top-level CLI/integration, tree/link/adopt/session-join, docs/skills, s044, smoke/live, package, dependency, schema, or other excluded-path product changes.

## Compatibility assessment

Legacy descriptor absence remains non-prime and non-old-prime in ordinary list JSON. Existing set/unset CLI JSON consumers continue receiving their prior fields, while retire and ordinary list expose old-prime additively. Baton grammar/dispatch, folder filtering, list columns and self marker, merged inbox/delivery/Codex/effort behavior, T005-T006A parent/repository persistence, dissolve handling, and `spawnedBy` close ownership remain green.

## Remaining uncertainty

Full tmux smoke/live behavior and daemon-restart proof are outside this core tranche and were not widened into the review. `harness checks --quick` therefore skipped smoke by contract; the reviewed pure transitions and persistence merge are otherwise fully guarded.
