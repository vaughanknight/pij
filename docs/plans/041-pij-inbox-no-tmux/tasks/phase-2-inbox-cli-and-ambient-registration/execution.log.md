# Phase 2 Execution Log

## Ownership tranche — T001-T005

**Status**: COMPLETE
**Date**: 2026-07-12
**Boundary**: Stopped before T006. No live daemon restart, reviewer approval, or inbox CLI enablement was performed.

### Delivered

- T001/T002: added pure Claude/Copilot/Codex ambient identity resolution, Codex `CODEX_THREAD_ID` phonehome support, durable exact-native self lookup before pane/cwd fallback, duplicate-join ambiguity checks, and pull descriptor planning.
- T003/T004: added optional `deliveryMode: "push" | "pull"` semantics across transport selection, daemon ownership, routing, send liveness/receipt classification, and ambient reattachment.
- Legacy descriptors without `deliveryMode` retain existing pi/tmux behavior. Pull targets accept durable sends when their pid is gone; dissolved and dead push targets still fail.
- Daemon/router ownership excludes pull descriptors, so their inbox files remain on disk and are never injected or buffered.
- Review fix F-001: orchestration notice delivery now validates target existence/lifecycle before persistence; missing or dissolved targets return `unverified` without creating a message, while a live pull target persists one queued notice.

### Exact File Manifest

- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/orchestration-notice.integration.test.ts`
- `.pi/extensions/pij/core/binding.test.ts`
- `.pi/extensions/pij/core/binding.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/current-session.test.ts`
- `.pi/extensions/pij/core/current-session.ts`
- `.pi/extensions/pij/core/daemon/router.test.ts`
- `.pi/extensions/pij/core/daemon/router.ts`
- `.pi/extensions/pij/core/harness/pi.test.ts`
- `.pi/extensions/pij/core/harness/pi.ts`
- `.pi/extensions/pij/core/harness/types.test.ts`
- `.pi/extensions/pij/core/harness/types.ts`
- `.pi/extensions/pij/core/types.ts`
- `.pi/extensions/pij/daemon.test.ts`
- `.pi/extensions/pij/daemon.ts`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-2-inbox-cli-and-ambient-registration/execution.log.md`

### Decisions

1. **Ambient validation**: Claude requires a non-empty trimmed id; Copilot uses only a canonical UUID already validated against matching session-state metadata by the bin; Codex requires a canonical `CODEX_THREAD_ID` plus its exact readable rollout path. More than one valid ambient harness signal is `E-AMBIG`.
2. **Durable/live ambiguity**: `PIJ_SESSION_ID` remains authoritative. Otherwise the exact durable `(harness, harnessSessionId)` join resolves before pane/cwd compatibility fallbacks. Duplicate exact live descriptors or disagreement between durable and live ids is `E-AMBIG`; an unregistered ambient tuple is `E-NOID`.
3. **Pull pid liveness**: `deliveryMode:"pull"` is a durable mailbox target, so a gone pid does not reject send and the initial receipt remains queued for inbox check. Dissolved targets always fail; dead explicit-push or legacy external targets retain `E-DEAD`.
4. **Daemon ownership guards**: pull is excluded at all three daemon ownership gates: heartbeat stamping, pending-session driving, and bound-session flush/drain/activity handling. Router transport selection independently returns `observe`, so pull is never injected or buffered.
5. **T006 ordering**: the ownership guard must be cold-reviewed, the daemon-restart baton granted, the live daemon restarted from worktree source, pull-mail survival canaried, and existing tmux delivery re-proven before registration/check CLI work is enabled. This coder stops before that gate.

### Proof

```text
npx vitest run \
  .pi/extensions/pij/core/current-session.test.ts \
  .pi/extensions/pij/core/binding.test.ts \
  .pi/extensions/pij/core/harness/types.test.ts \
  .pi/extensions/pij/core/harness/pi.test.ts \
  .pi/extensions/pij/core/daemon/router.test.ts \
  .pi/extensions/pij/core/cli.test.ts \
  .pi/extensions/pij/daemon.test.ts --reporter=dot
→ 136 passed

npx vitest run .pi/extensions/pij/daemon.test.ts \
  -t "external pull target is never tick-owned, driven, buffered, or drained" \
  --reporter=dot
→ 1 passed; deterministic isolated pull-mail canary

just flow-pair-test
→ 148 passed

just typecheck
→ passed

just lint
→ exit 0

npx vitest run .pi/extensions/pij/orchestration-notice.integration.test.ts --reporter=dot
→ 8 passed, including missing/dissolved no-persist and live-pull queued rows
```

### Canary handoff for T006

The isolated canary command above seeds a bound external pull descriptor and message, executes one worktree `Daemon.tick()`, and proves the message remains on disk with no injection or daemon heartbeat ownership.

## T006 Orchestrator Gate

### Review

- Cold reviewer: `pij-rural-mollusk`, Copilot GPT-5.6 Sol xhigh.
- Initial verdict: `FIX_REQUIRED`.
  - F-001 HIGH: `CliBatonNoticeSink` persisted a notice for dissolved pull.
  - F-002 MEDIUM: execution log lacked exact manifest and decisions.
- Fix re-review: `APPROVE`; F-001/F-002 resolved.
- Dim-0: removing `deliveryMode` from a daemon ownership guard made the named
  pull canary RED; `daemon.ts` restored byte-identically at SHA-256
  `1af793b39f63ead972643ca7ac0aa27f6aaecc4034b8833eca6d96676ab87450`;
  pull and bound-tmux named tests returned GREEN.

### Daemon restart baton

- Request: `request-36d8cdd6-bf42-45b4-8a0d-070d9cfe745a`
- Lease: `lease-6e4e6354-d4ce-43d1-9c12-3e48f431e8a5`
- Restarted from worktree source; live daemon pid `34705`.
- Baton returned with evidence after both canaries.

### Live ownership proof

- Seeded `pij-s041-pull-canary` as a bound Copilot pull descriptor with one inbox
  message.
- After worktree daemon ticks, `lastTickAt` remained absent and the message file
  remained present.
- Existing bound reviewer pane received
  `CANARY-S041-P2-TMUX-4408`, proving tmux delivery remained live.
- The sender's `--wait` timed out because control-plane receipt-event capture is
  not implemented yet; pane capture proved delivery, and T010 owns receipt wait.

**T006 result**: PASS. T007–T012 may dispatch.

## Inbox tranche — T007-T012

**Status**: COMPLETE — cold review APPROVE
**Boundary**: T006 ownership guard and live daemon proof are preserved.

### T007 — Pure inbox contract tests

- Started the Workshop 001 grammar, projection, receipt suppression/action, timeout, and rendering contract suite before production implementation.
- RED confirmed: `core/inbox.test.ts` failed because `core/inbox.ts` did not exist.

### T008 — Pure inbox core

- Started the pi-free parser, claim processor, receipt action, projection, timeout, and rendering implementation.
- GREEN: 10 pure inbox tests pass; no filesystem, timer, or process globals were introduced.

### T009 — Ambient registration and aliases

- Started pre-E-NOREG registration, grouped inbox interception, `adopt --current`, and pane-preservation coverage.
- GREEN: empty `PIJ_HOME` registration, idempotent reuse, durable metadata preservation, `adopt --current`, and pane-bound push preservation pass.

### T010 — Wait and receipt loops

- Started indefinite/finite wait polling and dual-source receipt convergence over one shared inbox/delivery adapter.
- GREEN: pure event-first/envelope-first reduction emits each terminal state once, appends only envelope-first events, and preserves ordered broadcast correlation.

### T011 — Portable two-shell round trip

- Started platform-neutral Claude/Copilot/Codex registration fixtures, finite JSON timeout proof, and concurrent no-daemon sender/receiver receipt flow.
- GREEN: all three ambient harness fixtures register idempotently and time out with stable JSON; the concurrent receiver wait, dead-pid durable send, hidden receipt race, sender wait, and durable receipt event pass without tmux or daemon.

### T012 — Phase 2 completion proof

- Started targeted suites, Windows compatibility, static gates, quick harness inventory, and exact fence/package audit.
- COMPLETE: all required Phase 2 gates passed and the inbox tranche stayed inside its granted fence.

### Inbox Tranche File Manifest

- `.pi/extensions/pij/core/inbox.ts`
- `.pi/extensions/pij/core/inbox.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/core/current-session.ts`
- `.pi/extensions/pij/core/current-session.test.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `.pi/extensions/pij/cli.inbox.integration.test.ts`
- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-2-inbox-cli-and-ambient-registration/tasks.md`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-2-inbox-cli-and-ambient-registration/execution.log.md`

### Inbox Tranche Decisions

1. `pij inbox` and `pij adopt --current` intercept before E-NOREG and share one ambient registration operation.
2. New/no-pane ambient registrations use pull delivery; a reusable pane-bound descriptor retains its pane, pid, folder, state, heartbeat, and legacy/explicit push mode.
3. One `FsChannel` instance supplies both delivery and exclusive inbox claims in the standalone CLI.
4. Bare inbox wait has no deadline; numeric wait returns exit 0 with `timedOut:true`; an arrival wakes one scan that claims every currently unread user message.
5. Inbox check hides receipt envelopes and atomically publishes each receipt event before its read marker; normal claims emit delivered receipts. Sender wait reduces durable events plus prepared envelopes, so either race winner produces one terminal update.
6. Commands and attachments are projected for the caller and never executed by pull processing.

### Inbox Tranche Proof

```text
npx vitest run <11 Phase 2 targeted files> --reporter=dot
→ 11 files, 192 tests passed

just flow-pair-test
→ 16 files, 148 tests passed

just windows-compat
→ typecheck, lint, 3 focused files / 29 tests passed

just typecheck
→ passed

just lint
→ exit 0

harness checks --quick
→ typecheck, lint, test, windows-compat, pkg-audit, snapshots passed; smoke skipped
```

### Shared-Surface Audit

- `.pi/packages.yaml` audit-only vet timestamp drift was removed.
- `package.json` and `package-lock.json` have no implementation diff.
- No inbox-tranche writes were made to flow files, government, `.flow-pair/`, `fs-registry.ts`, `discovery.ts`, `spawn.ts`, or `core/harness/copilot.ts`.

### Deferred Phase 3 Convergence

- Tmux and pi push consumers still own post-consumption marker convergence.
- Skill/operator/domain guidance and the full smoke/ship gate remain Phase 3 work.
- Full immutable inbox history retention/GC remains an explicit non-goal.

## Inbox Cold-Review Fix — F-001/F-002/F-003

**Status**: COMPLETE — F-001/F-003 resolved; F-002 superseded by the atomic addendum.

### Finding Dispositions

1. **F-001 — no destructive partial batch**: all listed receipt envelopes are parsed before the first claim. A malformed later receipt leaves every envelope unread/unmarked. Later claim failures return prior claimed user messages/actions plus a terminal failure; the bin renders those messages before executing fallible actions and surfacing the error.
2. **F-002 — receipt event before marker**: receipt envelopes are never passed to `claimUnread()`. `persistReceiptEnvelope()` reuses or appends the equivalent durable terminal event, then calls `markRead()`. Append failure leaves no marker; mark failure leaves the event for idempotent retry. Uncorrelated envelopes follow the same durability path before wait correlation.
3. **F-003 — invalid ambient probes fail loudly**: present invalid Copilot/Codex UUIDs, missing Copilot session-state metadata, and missing Codex rollouts return tagged `E-AMBIG`/`E-NOID` errors before pane/cwd fallback. Absent signals and valid ambient identities remain unchanged.

### Required Regression Proof

```text
npx vitest run .pi/extensions/pij/core/inbox.test.ts \
  -t "prevalidates|returns earlier|receipt envelope durability" --reporter=dot
→ 6 passed

npx vitest run .pi/extensions/pij/core/cli.test.ts \
  -t "event-first|uncorrelated" --reporter=dot
→ 2 passed

npx vitest run .pi/extensions/pij/cli.integration.test.ts \
  -t "prevents pane/cwd fallback" --reporter=dot
→ 4 production subprocess rows passed
```

### Completion Gates

```text
11-file Phase 2 targeted suite
→ 11 files, 201 tests passed

just windows-compat
→ typecheck, lint, 3 focused files / 29 tests passed

just typecheck
→ passed

just lint
→ exit 0

harness checks --quick
→ typecheck, lint, test, windows-compat, pkg-audit, snapshots passed; smoke skipped
```

Audit-only `.pi/packages.yaml` timestamp drift was removed after the quick gate; package and lock surfaces remain outside the implementation diff.

## Residual F-002 Addendum — Atomic `appendOnce`

**Status**: COMPLETE — final re-review APPROVE.

### Design

- `EventLogPort.appendOnce` is additive and optional, preserving every legacy structural implementation and all existing `append()` consumers.
- `FsEventLog.appendOnce()` hashes the idempotence key into a deterministic final filename, writes one unique same-directory temp file, performs one fsync, closes it, performs one hard-link attempt, treats `EEXIST` as `existing`, and removes the temp in every outcome. There is no retry/wait loop.
- Event reads merge legacy NDJSON plus atomic unique event files, sort by ascending sequence, and retain existing filter/tail/count/lastSeq behavior across a fresh adapter reopen.
- `FakeEventLog.appendOnce()` models exact per-key first-writer ownership.
- `persistReceiptEnvelope()` retains event-first compatibility, otherwise calls `appendOnce("receipt-envelope:<envelope-id>", event)` before `markRead()`. The check-then-append race is removed for envelope-first consumers.

### Permanent Proof

```text
npx vitest run \
  .pi/extensions/pij/adapters/event-log.test.ts \
  .pi/extensions/pij/adapters/fakes.test.ts \
  .pi/extensions/pij/core/inbox.test.ts --reporter=dot
→ 3 files, 33 tests passed

npx vitest run .pi/extensions/pij/cli.inbox.integration.test.ts \
  -t "appendOnce hard-link race" --reporter=dot
→ 1 real two-process hard-link race passed

11-file Phase 2 targeted suite
→ 11 files, 203 tests passed

just windows-compat
→ typecheck, lint, 3 focused files / 31 tests passed; real hard-link race included

just typecheck
→ passed

just lint
→ exit 0

harness checks --quick
→ typecheck, lint, test, windows-compat, pkg-audit, snapshots passed; smoke skipped
```

All pre-existing `event-log.test.ts` cases and assertions remain unchanged; only new cases were appended. The CLI integration now reads receipt evidence through the required merged `FsEventLog.read()` surface rather than assuming every event resides in the legacy NDJSON file.

Audit-only `.pi/packages.yaml` timestamp drift was removed after the quick gate; package and lock surfaces remain clean.

## `appendOnce` Orchestrator Sanity Corrections

**Status**: COMPLETE — final re-review APPROVE.

1. **Legacy append-only ordering**: `FsEventLog.readAll()` now returns NDJSON events unchanged when no atomic event files exist. Sequence sorting happens only when atomic events must be merged. A new appended test proves out-of-order legacy sequences retain file/append order and tail semantics.
2. **Genuinely stale consumers**: the permanent dual-consumer inbox regression now delegates writes/count/sequence to one `FakeEventLog` while its `read()` seam returns the same stale empty snapshot to both calls. Both consumers therefore reach `appendOnce`; results are `appended` then `existing`, with exactly one backing receipt event and one marker.

```text
npx vitest run \
  .pi/extensions/pij/adapters/event-log.test.ts \
  .pi/extensions/pij/adapters/fakes.test.ts \
  .pi/extensions/pij/core/inbox.test.ts --reporter=dot
→ 3 files, 34 tests passed

npx vitest run .pi/extensions/pij/cli.inbox.integration.test.ts \
  -t "appendOnce hard-link race" --reporter=dot
→ 1 real two-process hard-link race passed

just typecheck
→ passed

just lint
→ exit 0

harness checks --quick
→ typecheck, lint, test, windows-compat, pkg-audit, snapshots passed; smoke skipped
```

No existing event-log test line/assertion was changed; the new legacy ordering case was appended. Audit-only `.pi/packages.yaml` timestamp drift was removed.

## Final Cold Re-review

**Verdict**: APPROVE

- F-001 RESOLVED: receipt batches prevalidate before claims and partial claimed
  user results render before later failures surface.
- F-002 RESOLVED: per-envelope `appendOnce` is atomic and idempotent across stale
  consumers and real concurrent processes; event publication precedes marking.
- F-003 RESOLVED: invalid present Copilot/Codex signals fail before pane/cwd
  fallback.
- Addendum proof: 34 adapter/fake/inbox tests, one real two-process hard-link
  race, 203 Phase 2 targeted tests, typecheck, lint, and
  `harness checks --quick`.
- Windows compatibility includes the real hard-link race and passed 31 focused
  tests.

**Phase 2 result**: COMPLETE. Phase 3 may proceed.

## Delivery Ruling

Jordan ruled the fresh-worktree Pi trust timeout and main-pinned peacock smoke
expectation to be shared, unowned harness debt and explicitly non-blocking for
s041. The full inventory passed typecheck, lint, tests, Windows compatibility,
package audit, and snapshots; only the ruled-out smoke sensor failed at the
folder-trust picker. No further s041 smoke-harness work is permitted.
