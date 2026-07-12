# Phase 2 Inbox-Tranche Cold Review

**Plan**: `../pij-inbox-no-tmux-plan.md`
**Scope**: T007-T012 only, with T001-T006 as a regression boundary
**Reviewer**: `pij-rural-mollusk` (cold Copilot GPT-5.6 Sol session)
**Date**: 2026-07-12
**Review mode**: read-only except mandatory temporary mutation and this artifact

## A) Verdict

**APPROVE**

F-001, F-002, and F-003 are resolved. The final F-002 addendum introduces an
additive `EventLogPort.appendOnce` seam and an atomic filesystem implementation:
a complete fsynced same-directory temp file is published by one hard-link
attempt to a deterministic key path, with only `EEXIST` treated as an existing
event. Receipt persistence remains event-before-marker and retry-safe.

The genuine stale-snapshot full-consumer regression now produces one event and
one marker. The real two-process hard-link race returns one `appended`, one
`existing`, and one merged event. Legacy append-only NDJSON retains exact
file/append order; logs with atomic events merge by sequence and preserve
filtering, tail, count, last-sequence, and reopen behavior.

All focused adapter/fake/inbox/process proofs, the 203-test Phase 2 set,
typecheck, lint, and quick harness inventory are green.

## B) Files Reviewed

| File | Action | Review result |
|---|---|---|
| `.pi/extensions/pij/core/ports.ts` | modified | Optional additive `appendOnce` leaves every legacy `EventLogPort` consumer source-compatible. |
| `.pi/extensions/pij/adapters/event-log.ts` | modified | Legacy `append()` is unchanged; `appendOnce` uses fsynced temp plus one deterministic hard-link publication and merged read support. |
| `.pi/extensions/pij/adapters/event-log.test.ts` | modified | Original cases/assertions are unchanged; appended cases cover atomic uniqueness, cleanup/errors, reopen/merge, and legacy order. |
| `.pi/extensions/pij/adapters/fakes.ts` | modified | Fake event log models first-writer ownership per idempotence key. |
| `.pi/extensions/pij/adapters/fakes.test.ts` | modified | Covers additive fake `appendOnce` without changing legacy fake behavior. |
| `.pi/extensions/pij/core/inbox.ts` | new | F-001 partial handling and F-002 event-before-marker, retry, and cross-consumer idempotency are complete. |
| `.pi/extensions/pij/core/inbox.test.ts` | new | Covers prevalidation, partial failure, append/mark ordering, retry, and genuinely stale dual consumers. |
| `.pi/extensions/pij/cli.ts` | modified | Invalid ambient signals now fail before fallback; inbox partial output and receipt persistence ordering are wired correctly. |
| `.pi/extensions/pij/core/current-session.ts` | new/modified | Descriptor planning preserves live pane push and creates pull for detached identities; no new finding in the pure planner. |
| `.pi/extensions/pij/core/current-session.test.ts` | new/modified | Covers pane-bound preservation and detached pull planning. |
| `.pi/extensions/pij/cli.integration.test.ts` | modified | Covers registration plus four invalid Copilot/Codex production probes that prevent pane/cwd fallback. |
| `.pi/extensions/pij/cli.inbox.integration.test.ts` | modified | Portable no-tmux/no-daemon proof plus an explicitly timed real two-process hard-link race; included by `windows:check`. |
| `.pi/extensions/pij/core/cli.ts` | modified | Correlated output reduction remains once-only; unrelated durable events can satisfy a later wait. |
| `.pi/extensions/pij/core/cli.test.ts` | modified | Covers event-first/envelope-first output and later correlation of an initially unrelated durable event. |
| `tasks/phase-2-inbox-cli-and-ambient-registration/tasks.md` | modified/new | T007-T012, addendum fences, and completion requirements are satisfied. |
| `tasks/phase-2-inbox-cli-and-ambient-registration/execution.log.md` | modified/new | Records all dispositions, addendum design, real race evidence, sanity corrections, and final gates. |

## C) Findings

| ID | Original severity | Disposition | Evidence / remaining fix |
|---|---|---|---|
| F-001 | Critical | RESOLVED | `.pi/extensions/pij/core/inbox.ts:171-220` prevalidates all receipt envelopes before claims and returns earlier claimed user messages/actions with a surfaced later failure. Tests prove malformed-later yields zero markers and partial claim failure preserves/renderable prior output. |
| F-002 | Critical | RESOLVED | `.pi/extensions/pij/core/inbox.ts:245-303` uses per-envelope `appendOnce` before `markRead`. `FsEventLog.appendOnce` provides atomic first-writer publication; stale full-consumer proof yields one event/marker and the real two-process race yields `appended`/`existing` plus one merged event. |
| F-003 | High | RESOLVED | `.pi/extensions/pij/cli.ts:347-383` returns tagged failures for invalid/missing Copilot/Codex validation. Four production subprocess rows prove no pane/cwd fallback. |

## D) Full Review Rubric

| Dimension | Status | Evidence |
|---|---|---|
| 0 - Mutation resistance | PASS | Removing receipt classification made the named suppression test RED; byte-identical restore returned it GREEN. |
| 1 - Scope | PASS | Inbox implementation files stay inside the granted T007-T012 fence. Flow/report changes are orchestrator-owned and excluded. |
| 2 - Contract | PASS | All three findings are resolved; receipt events are durable, ordered, and first-writer-idempotent. |
| 3 - Plan alignment | PASS | T010 ordering and race-safe receipt persistence now match the task contract. |
| 4 - Acceptance criteria | PASS | AC-01/05/09 and ownership regressions are covered by focused and full proofs. |
| 5 - Tests | Delegated to Dimension 0 | Mutation proof plus stale/full-consumer and real two-process races establish non-vacuity. |
| 6 - Domain currency | DEFERRED BY PLAN | Phase 3 owns skill/operator/domain documentation refresh. |
| 7 - Progress log | PASS | The log accurately records the addendum design, corrections, proof, and remaining Phase 3 work. |
| 8 - Regression | PASS | Ownership guard tests, legacy/push behavior, typecheck, lint, Windows compatibility, and quick harness inventory remain green. |
| 9 - Prompt follow | PASS | Every focused re-review and final addendum directive is satisfied. |
| 10 - Learning | PASS | The execution log records the major implementation choices and deferred Phase 3 work. |

## E) T007-T012 Coverage

| Task | Status | Evidence |
|---|---|---|
| T007 pure contract tests | PASS | Grammar, projection, receipt hiding, malformed prevalidation, partial failures, and durability ordering are covered. |
| T008 pure inbox core | PASS | F-001 is resolved with prevalidation and partial-result handling. |
| T009 ambient registration/aliases | PASS | F-003 is resolved; invalid ambient signals fail before fallback. |
| T010 wait/receipt loops | PASS | Event-first/envelope-first output remains once-only; event publication is atomic per envelope and precedes marking. |
| T011 portable round trip | PASS | Claude/Copilot/Codex fixtures, finite timeout, dead-pid send, wait/read/receipt flow, no tmux/daemon, and explicit timeouts are present. |
| T012 completion proof | PASS | Focused, real-process, full targeted, static, Windows, and quick harness gates are green. |

## F) Fresh Proof

| Command / probe | Result |
|---|---|
| `harness boot` | PASS - typecheck and full test readiness stages green. |
| Focused inbox repair commands | PASS - prior 6 inbox-core, 2 receipt-reduction, and 4 production invalid-ambient cases remain green. |
| Addendum adapter/fake/inbox command | PASS - 3 files, 34 tests. |
| Real two-process hard-link race | PASS - one `appended`, one `existing`, one merged event. |
| 11-file Phase 2 targeted Vitest command | PASS - 11 files, 203 tests. |
| `just typecheck` | PASS. |
| `just lint` | PASS, exit 0 - nine existing warnings plus Biome schema-version information. |
| `harness checks --quick` | PASS - typecheck, lint, tests, Windows compatibility, package audit, and snapshots; smoke skipped as requested. |
| F-001 focused proof | PASS - malformed-later leaves zero markers; later claim failure retains earlier user result/action and surfaces failure. |
| F-002 ordering/retry proof | PASS - append failure leaves no marker; mark failure reuses one event then marks; unrelated event resolves later wait. |
| F-003 production proof | PASS - invalid UUID/missing metadata or rollout return E-AMBIG/E-NOID with no fallback. |
| Genuine stale-snapshot full-consumer proof | PASS - both consumers reach `appendOnce`; results are appended/existing with one event and one marker. |
| Legacy/additive ordering proof | PASS - NDJSON-only logs preserve append order; mixed logs merge by sequence and survive filters/count/lastSeq/reopen. |
| Excluded source/package audit | PASS - `package.json`, `package-lock.json`, `.pi/packages.yaml`, `fs-registry.ts`, `discovery.ts`, `spawn.ts`, and `core/harness/copilot.ts` have no content diff. |

## G) Mandatory Dimension-0 Mutation Proof

**Invariant removed**: receipt envelopes must remain hidden from user-facing
messages and produce an internal receipt-event action.

**Source**: `.pi/extensions/pij/core/inbox.ts`

**Pre-mutation SHA-256**:

```text
dc2cfe920b208cd45fe6a6918750219ac06195ec9e97e9427e53fe02361ffaf7
```

**Mutation**: temporarily changed:

```ts
if (message.kind === "receipt") {
```

to:

```ts
if (false) {
```

**RED command**:

```bash
npx vitest run .pi/extensions/pij/core/inbox.test.ts \
  -t "hides receipt envelopes while returning a durable event action" \
  --reporter=verbose
```

**RED result**: FAIL as required. The receipt envelope appeared in
`messages`, and the expected `append-receipt-event` action was replaced by a
user-message delivered-receipt action at `core/inbox.test.ts:130`.

**Post-restore SHA-256**:

```text
dc2cfe920b208cd45fe6a6918750219ac06195ec9e97e9427e53fe02361ffaf7
```

The pre/post hashes are identical.

**GREEN result**: PASS - the same named test passed after restoration
(1 passed, 9 skipped).

## H) Scope, Exclusions, and Handover

The approved T001-T006 daemon ownership boundary remains intact: pull descriptors
stay daemon-unowned and existing push/tmux regression tests remain green. No live
daemon restart was performed.

Orchestrator-owned `requested-fences.md`, `the-flow.json`, `the-flow.md`,
reports, validations, and the ownership review are excluded from this verdict.
The quick package audit refreshed vet timestamps during review; that review-side
drift was restored byte-identically, leaving `.pi/packages.yaml` equal to HEAD.

**Review result**: APPROVE
**Finding dispositions**: F-001 RESOLVED; F-002 RESOLVED; F-003 RESOLVED.
**Required re-review**: None.
**Phase 2 may close**: Yes.
