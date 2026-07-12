# Phase 3 Push-Path Cold Review

**Plan**: `../pij-inbox-no-tmux-plan.md`  
**Scope**: Phase 3 T001-T010 against base `e6f36be`  
**Reviewer**: `pij-vicious-swift` (Copilot GPT-5.6 Sol xhigh)  
**Date**: 2026-07-12  
**Review mode**: read-only except reversible mutations/probes and this artifact

## A) Verdict

**FIX_REQUIRED**

The core post-outcome marker path works for a single successful/unverified
message, pull/pi non-ownership remains intact, receipt events precede daemon
receipt markers, the s043 control-plane baseline is additive-only, and the
operator/domain guidance is directionally correct.

Approval is blocked by three findings: a later send exception replays earlier
successful messages in the same target inbox, the full test gate is red because
the existing watch-delivery regression still asserts deleted history, and the
AC-14 skill test remains green when the push/pull receive mapping is inverted.

## B) Findings

### F-001 — HIGH — Same-target partial failure replays successful injections

**Evidence**:

- `.pi/extensions/pij/core/daemon/loop.ts:431-446` accumulates completed
  outcomes but returns them only after the whole message loop finishes.
- `.pi/extensions/pij/daemon.ts:393-405` publishes markers only after
  `drainTmuxInbox()` returns.
- Reviewer probe: two unread messages for one bound tmux target; `sendText`
  succeeds for the first and throws for the second. The first marker assertion
  failed (`expected true, received false`).

**Impact**: the first message was already injected but remains unread. The next
tick injects it again, potentially duplicating an LLM turn or remote command and
emitting duplicate receipts. This violates T003's per-message successful-outcome
marker contract and AC-06.

**Smallest fix**: make delivery/marking progress per message. Preserve completed
outcomes when a later send throws, publish each completed marker/receipt before
continuing or surfacing the later error, and add a same-target two-message test
that proves the first is marked/not replayed while the failed second stays
unread.

### F-002 — CRITICAL — Full suite is red on retained watch delivery history

**Evidence**:

- `harness boot` and `harness checks --quick` fail in
  `.pi/extensions/pij/core/daemon/watch.test.ts:452-455`.
- The test still expects zero `msg-*` files after daemon injection, but Phase 3
  intentionally retains the envelope and publishes a `read-*` marker.
- Focused reproduction:
  `npx vitest run .pi/extensions/pij/core/daemon/watch.test.ts -t "does not create a phantom pij-watch inbox after a watch delivery is injected"`
  fails with one retained message.

**Impact**: a previously passing repository test is now red, so the deterministic
done gate cannot pass. The stale assertion also contradicts the new immutable
history contract.

**Smallest fix**: obtain a fence addendum for
`.pi/extensions/pij/core/daemon/watch.test.ts` only, then keep the phantom
`pij-watch` inbox assertion while replacing the deletion assertion with retained
`msg-*`, matching `read-*`, and `listUnread(...)=[]` assertions. Do not change
the watcher adapter or smoke harness.

### F-003 — HIGH — AC-14 test does not guard the mode-to-receive mapping

**Evidence**:

- `.pi/extensions/pij/cli.integration.test.ts:44-58` checks only independent
  substring presence (`pij inbox --wait`, `tmux`, `push`, `non-tmux`).
- Reviewer mutation inverted the C1 receive row so pi and tmux used
  `pij inbox --wait` while external pull used daemon injection.
- The named test still passed: 1 passed, 34 skipped.

**Impact**: `/pij` can regress to exactly the wrong push/pull branch while the
AC-14 regression remains green. Dimension 0 requires a load-bearing test for
the behavioral association, not vocabulary presence.

**Smallest fix**: assert the exact C1 receive mapping (or parse it structurally)
and exact peer-route clauses: pi = automatic in-process push, tmux = automatic
daemon push, external = `pij inbox --wait [ms]`. Re-run the inversion mutation
and require RED.

## C) Mandatory Dimension-0 Mutation Proof

### Marker ownership and post-outcome timing

- **Source**: `.pi/extensions/pij/daemon.ts`
- **Pre/post SHA-256**:
  `f0793d364f315ca821177771a1c2cab3362b9a111c99a6de1b996f41f155a1bf`
- **Mutation**: temporarily marked every listed user message immediately before
  calling `drainTmuxInbox`.
- **RED**: the named retained-message test failed at
  `.pi/extensions/pij/daemon.test.ts:164`; the marker was visible during
  `sendText` (`expected false, received true`).
- **GREEN**: after byte-identical restoration, the same named test passed
  (1 passed, 20 skipped).

### Push/pull guidance branch

- **Source**: `skills/pij/references/00-routing.md`
- **Pre/post SHA-256**:
  `bcf1f7dbbcc65d33a02e10618adafd2d3f5ebb16344389dbe70af3e440a44adf`
- **Mutation**: replaced `pij inbox --wait` with `pij state`.
- **RED**: the named CLI/skill guidance test failed (1 failed).
- **GREEN**: `flow-pair-mutate.sh` restored byte-identically and the named test
  passed.
- **Adversarial follow-up**: inverting the C1 receive-mode columns stayed GREEN,
  producing F-003.

All temporary source/test mutations were restored. Final reviewer hashes:

```text
f0793d364f315ca821177771a1c2cab3362b9a111c99a6de1b996f41f155a1bf  .pi/extensions/pij/daemon.ts
c71b68c868bdd74b2bdd4dd3a27c316584674854f25a634a28e073e201388ea2  .pi/extensions/pij/daemon.test.ts
bcf1f7dbbcc65d33a02e10618adafd2d3f5ebb16344389dbe70af3e440a44adf  skills/pij/references/00-routing.md
```

## D) Review Rubric

| Dimension | Status | Evidence |
|---|---|---|
| 0 - Mutation resistance | FAIL | Required mutations RED/GREEN, but the exact push/pull association survives inversion (F-003). |
| 1 - Scope | PASS WITH BLOCKER | Changed files match the granted Phase 3 fence; F-002 requires a narrow test-path addendum. Package/lock, registry, discovery, spawn, Copilot harness, watcher adapter, smoke harness, and CI have no diff. |
| 2 - Contract | FAIL | Batch return semantics lose earlier completed outcomes when a later same-target send throws (F-001). |
| 3 - Plan alignment | FAIL | T003 requires successful injections to mark while failed messages stay unread; the current batch behavior does not. |
| 4 - Acceptance criteria | FAIL | AC-06 fails under same-target partial failure; AC-14's behavioral mapping is not load-bearing. |
| 5 - Tests | Delegated to Dimension 0 | Focused worker tests pass, but full-suite and mutation evidence expose missing/obsolete coverage. |
| 6 - Domain currency | PASS | Messaging, control-plane, skill, registry, map, and operator docs describe immutable history and push/pull ownership. |
| 7 - Progress log | PASS | The execution log records implementation choices, source baseline, mutations, and pre-review gates. |
| 8 - Regression | FAIL | `just test` is red through the watch-delivery regression (F-002). |
| 9 - Prompt follow | PASS | No forbidden production/package/daemon-restart/live-proof action occurred; s043 content is preserved additively. |
| 10 - Learning | PASS | The no-pane duplicate-buffer and held-domain additive-edit decisions are captured. |

## E) Contract and Scope Evidence

- `docs/domains/pij-control-plane/domain.md` versus approved s043 commit
  `a831930bdcc190f58abf31f153131c0953227d9c`: **6 additions, 0 deletions**.
- Approved source blob:
  `844464ee03dcbc54e3a660245ddac93095b0a5a7`.
- No diff in package/lock, `.pi/packages.yaml`, `fs-registry.ts`,
  `discovery.ts`, `spawn.ts`, `core/harness/copilot.ts`, watcher adapter,
  harness, or workflow paths.
- Pull descriptors remain excluded at daemon heartbeat, pending drive, bound
  ownership, buffer/flush, and drain gates. Legacy descriptors without
  `deliveryMode` retain push ownership.

## F) Fresh Proof

| Command / probe | Result |
|---|---|
| Focused Phase 3 Vitest set | PASS - 5 files, 116 tests. |
| `just typecheck` | PASS. |
| `just lint` | PASS exit 0; 9 pre-existing warnings and one schema-version info notice. |
| `just pij-skill-check` | PASS. |
| `harness checks --quick` | FAIL - test sensor only; typecheck, lint, Windows compatibility, package audit, and snapshots pass; smoke skipped. |
| Watch regression focused test | FAIL - retained target envelope conflicts with obsolete zero-message assertion. |
| Same-target partial failure probe | FAIL - first successful injection has no marker after later send throws. |
| `git diff --check e6f36be` | PASS. |

## G) Required Re-review

Re-review F-001 through F-003 after:

1. per-message same-target failure handling and regression coverage;
2. a granted update to the stale watch regression; and
3. an exact push/pull mapping assertion that goes RED under inversion.

Do not restart the daemon or begin live proof until the re-review verdict is
`APPROVE` or `APPROVE_WITH_NOTES`.
