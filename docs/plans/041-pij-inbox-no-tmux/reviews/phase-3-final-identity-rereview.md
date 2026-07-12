# Phase 3 Final Identity Residual Cold Re-Review

## Verdict

**APPROVE**

Both residual findings from
`phase-3-contaminated-identity-rereview.md` are fixed with
mutation-sensitive production coverage.

## Residual Dispositions

### F-001 - Explicit-id ambient-validation bypass

**FIXED**

- `.pi/extensions/pij/core/cli.ts:490-517` resolves detectable ambient identity
  before accepting `PIJ_SESSION_ID`, propagates resolver failures, rejects an
  explicit/ambient mismatch with `E-AMBIG`, accepts an exact match, and retains
  direct explicit-id compatibility when no ambient identity exists.
- `.pi/extensions/pij/cli.ts:387-401` subjects the ambient reverse join to the
  same pane/delivery-owner validation reviewed previously.
- `.pi/extensions/pij/core/cli.ts:1010-1020` keeps a narrow phonehome bootstrap
  exception for a pending spawned peer that cannot be reverse-joined until
  phonehome establishes its native binding.
- `.pi/extensions/pij/core/cli.test.ts:258-302` covers resolver failure,
  exact/mismatched ids, and no-ambient compatibility.
- `.pi/extensions/pij/cli.integration.test.ts:293-441` rejects the contaminated
  descriptor with explicit `PIJ_SESSION_ID` before repair and accepts that same
  explicit id only after in-place pull repair.

### F-002 - Append-only report history deleted by repair

**FIXED**

- `.pi/extensions/pij/core/current-session.ts:151-184` removes `agentOnce` and
  stale pane/push/spawn runtime without removing `reportedAt`.
- `.pi/extensions/pij/core/current-session.test.ts:102-146` and
  `.pi/extensions/pij/cli.integration.test.ts:397-417` prove report history
  survives pure and production repair.
- `.pi/extensions/pij/core/agent-peer.ts:112-121` still requires both
  `agentOnce` and `reportedAt` for once-close. Existing
  `.pi/extensions/pij/core/agent-peer.test.ts:100-118` proves `reportedAt`
  alone does not close a peer.

## Independent Dimension 0

1. Restored the explicit-id early return ahead of ambient validation. The named
   contaminated production regression went RED because explicit `whoami`
   returned exit `0` instead of `2` at
   `.pi/extensions/pij/cli.integration.test.ts:374`. Restore returned GREEN.
2. Removed `reportedAt` during external repair. The durable-history regression
   went RED because the repaired descriptor lacked the expected timestamp at
   `.pi/extensions/pij/core/current-session.test.ts:116`. Restore returned
   GREEN.

Both production files restored byte-identically:

- `.pi/extensions/pij/core/cli.ts`:
  `b6f95a832fd96fe58999aaabf56143055b2b39ab75f3b7ecae93480edf960501`
- `.pi/extensions/pij/core/current-session.ts`:
  `bfc2be7d3332acee4d51421806e6995b0f8db7f31f951fccfabe6336a83c2ceb`

## Gates and Scope

- Focused residual suites: 132 passed.
- Full suite: 1,878 passed, 10 skipped.
- `just pij-skill-check`, `just typecheck`, and `just lint` passed. Lint retained
  10 pre-existing warnings and one Biome schema informational notice.
- `harness checks --quick` passed typecheck, lint, tests, Windows compatibility,
  package audit, and snapshots; smoke was intentionally skipped by `--quick`.
- Package-audit timestamp-only drift was restored. Package/settings files have
  no final diff, and `git diff --check` passed.
- Tracked scope is the Seq 113 path set plus the two residual CLI core files and
  their plan ledgers. The one-line `tasks.md` compact-discipline update was
  already present, explicitly recorded as concurrent/unowned in the execution
  log, and was not changed by this review.

