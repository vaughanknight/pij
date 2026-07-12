# Phase 2 Ownership-Tranche Cold Review

**Plan**: `../pij-inbox-no-tmux-plan.md`
**Scope**: T001-T005 only
**Reviewer**: `pij-rural-mollusk` (cold Copilot GPT-5.6 Sol session)
**Date**: 2026-07-12
**Diff source**: path-scoped worktree diff; no flow-pair diff artifact existed for this tranche

## A) Verdict

**APPROVE**

F-001 and F-002 are resolved. `CliBatonNoticeSink` now validates target
existence and lifecycle before delivery: missing and dissolved pull targets
return `unverified` with zero persisted messages, while a live pull target
returns `queued` with exactly one persisted message. The production subprocess
table has both an explicit 10-second child-process timeout and a 30-second
Vitest-case timeout.

The daemon ownership guard itself is mutation-resistant: removing one
delivery-mode ownership argument made the named pull canary RED, the source was
restored byte-identically, and both the pull canary and a named tmux regression
returned GREEN.

The execution log now contains the exact ownership-tranche file manifest and
decision notes for ambient validation, durable/live ambiguity, pull liveness,
all three daemon ownership guards, and T006 ordering.

**T006 may proceed.** T007-T012 remain closed until T006 completes its daemon
baton, restart, live pull-mail canary, and tmux regression steps.

## B) Files Reviewed

| File | Action | Review result |
|---|---|---|
| `.pi/extensions/pij/core/current-session.ts` | new | Pure Claude/Copilot/Codex ambient identity, durable reverse-join validation, and pull descriptor planning are structurally sound. |
| `.pi/extensions/pij/core/current-session.test.ts` | new | Covers valid identities, zero/multiple signals, durable/live ambiguity, E-NOID, and descriptor metadata preservation. |
| `.pi/extensions/pij/core/binding.ts` | modified | Adds canonical Codex phonehome and optional delivery mode on reattachment without changing existing harness rules. |
| `.pi/extensions/pij/core/binding.test.ts` | modified | Covers Codex UUID phonehome and pull reattachment while preserving prior identity tests. |
| `.pi/extensions/pij/core/cli.ts` | modified | Ambient self precedence and normal send pull/dead/dissolved behavior match the contract. |
| `.pi/extensions/pij/core/cli.test.ts` | modified | Covers override precedence, ambient lookup, dead pull acceptance, dead push rejection, dissolved pull rejection, and queued wording. |
| `.pi/extensions/pij/cli.ts` | modified | Ambient metadata/path validation is wired correctly; target existence/lifecycle now precede baton notice persistence. |
| `.pi/extensions/pij/orchestration-notice.integration.test.ts` | modified | Production subprocess table covers missing/dissolved zero-persist and live-pull queued persistence with explicit process and case timeouts. |
| `.pi/extensions/pij/core/types.ts` | modified | Optional `DeliveryMode` and `SessionDescriptor.deliveryMode` are additive; absence remains legacy behavior. |
| `.pi/extensions/pij/core/harness/types.ts` | modified | Explicit pull selects inbox; push/absence preserve the existing harness matrix. |
| `.pi/extensions/pij/core/harness/types.test.ts` | modified | Covers pull/push for all external harnesses and the legacy absence matrix. |
| `.pi/extensions/pij/core/harness/pi.ts` | modified | Daemon ownership delegates to the delivery-mode-aware transport selector. |
| `.pi/extensions/pij/core/harness/pi.test.ts` | modified | Covers daemon non-ownership for external pull and ownership for push. |
| `.pi/extensions/pij/core/daemon/router.ts` | modified | Pull routes to observe and never injects or buffers. |
| `.pi/extensions/pij/core/daemon/router.test.ts` | modified | Covers bound and pending pull plus existing pi/tmux routes. |
| `.pi/extensions/pij/daemon.ts` | modified | All three delivery-ownership guards receive `deliveryMode`; no delete-to-marker change exists. |
| `.pi/extensions/pij/daemon.test.ts` | modified | Contains the deterministic one-tick pull-mail canary, pending-pull guard, and unchanged tmux drain regression. |
| `tasks/phase-2-inbox-cli-and-ambient-registration/tasks.md` | new | T001-T005 boundaries, fences, and T006 stop gate are explicit. |
| `tasks/phase-2-inbox-cli-and-ambient-registration/execution.log.md` | new | Records the exact file manifest, decisions, delivered behavior, gates, and T006 boundary. |

## C) Findings

| ID | Severity | Disposition | Evidence |
|---|---|---|---|
| F-001 | High | RESOLVED | `.pi/extensions/pij/cli.ts:1551-1564` reads and rejects a missing/dissolved target before `channel.deliver()`. Production subprocess rows prove missing and dissolved pull produce `unverified` plus zero new messages, while live pull produces `queued` plus one new message. |
| F-002 | Medium | RESOLVED | The execution log now lists the exact 18-file ownership/fix manifest and five explicit decision notes covering every requested non-obvious choice. |

## D) T001-T005 and Contract Coverage

| Coverage | Status | Evidence |
|---|---|---|
| T001 ambient identity tests | PASS | Claude non-empty identity, canonical Copilot/Codex UUIDs, Codex exact path, zero signals, multiple valid signals, override precedence, durable/live duplicate joins, and ambient-before-pane/cwd are covered. |
| T002 implementation | PASS | Pure adapter is pi-free; bin reuses matching Copilot session-state validation and exact readable Codex rollout lookup; Codex phonehome is harness-specific; excluded registry/discovery/spawn/Copilot harness files are untouched. |
| T003 delivery-mode tests | PASS | Transport, daemon ownership, router behavior, dead pull, dead push, dissolved normal send, baton notice classification, receipt wording, one-tick pull mail, and tmux drain are covered. |
| T004 delivery-mode implementation | PASS | Optional field, legacy behavior, normal send preflight, baton notices, router, and all daemon ownership guards match the pull/dissolved contract. |
| T005 proof and stop boundary | PASS | Targeted tests and deterministic pull canary are green; the execution log is complete; no T007+ inbox parser/command implementation exists. |
| Ambient exact-one rule | PASS | Multiple validated harness candidates produce E-AMBIG; invalid Copilot/Codex metadata is not promoted to an ambient tuple. |
| Durable identity precedence | PASS | `PIJ_SESSION_ID` remains highest priority, then exact durable ambient identity, then pane/cwd compatibility fallback. Duplicate live joins and durable/live contradictions fail E-AMBIG. |
| Legacy descriptors | PASS | Absence of `deliveryMode` preserves pi inbox and external tmux/sendkeys behavior. |
| Daemon scope | PASS | Only ownership predicates changed; message deletion/marker behavior is untouched and remains Phase 3 work. |

## E) Fresh Gates

| Command / probe | Result |
|---|---|
| `harness boot` | PASS - typecheck and full test readiness stages green. |
| Targeted ownership Vitest command from the execution log | PASS - 7 files, 136 tests. |
| `just typecheck` | PASS. |
| `just lint` | PASS, exit 0 - nine existing warnings plus Biome schema-version info. |
| `npx vitest run .pi/extensions/pij/orchestration-notice.integration.test.ts --reporter=verbose` | PASS - 8 production subprocess cases, including missing/dissolved zero-persist and live-pull queued-plus-one. |
| Re-review targeted ownership Vitest command | PASS - 7 files, 136 tests. |
| Path-scoped `git diff --check` | PASS. |
| F-001 disposition | PASS - target validation occurs before delivery; missing/dissolved return `unverified` with zero persistence; live pull returns `queued` with one persisted notice. |
| `harness checks --quick` | PASS - typecheck, lint, test, Windows compatibility, package audit, and snapshots. |
| `harness checks` | FAIL in the unrelated smoke sensor only - Pi remained at its `Do not trust (this session only)` prompt until the driver timed out; every other sensor passed. Recorded as harness difficulty DL-004. |

## F) Mandatory Dimension-0 Mutation Proof

**Invariant removed**: a pull descriptor must not be tick-owned by the daemon's
heartbeat/ownership pass.

**Source**: `.pi/extensions/pij/daemon.ts`

**Pre-mutation SHA-256**:

```text
1af793b39f63ead972643ca7ac0aa27f6aaecc4034b8833eca6d96676ab87450
```

**Mutation**: temporarily changed the first ownership guard from:

```ts
daemonOwnsDelivery(snapshot.harness ?? "pi", snapshot.deliveryMode)
```

to:

```ts
daemonOwnsDelivery(snapshot.harness ?? "pi")
```

**RED command**:

```bash
npx vitest run .pi/extensions/pij/daemon.test.ts \
  -t "external pull target is never tick-owned, driven, buffered, or drained" \
  --reporter=verbose
```

**RED result**: FAIL as required. The named test observed
`lastTickAt = "2026-06-28T00:00:00.000Z"` instead of `undefined` at
`daemon.test.ts:302`.

**Post-restore SHA-256**:

```text
1af793b39f63ead972643ca7ac0aa27f6aaecc4034b8833eca6d96676ab87450
```

The pre/post hashes are identical.

**GREEN command**:

```bash
npx vitest run .pi/extensions/pij/daemon.test.ts \
  -t "external pull target is never tick-owned, driven, buffered, or drained|drains a BOUND claude target's inbox" \
  --reporter=verbose
```

**GREEN result**: PASS - both the named pull ownership canary and the named
bound-tmux drain regression passed.

## G) Scope and Exclusions

The implementation diff contains only the T001-T005 production/test paths listed
above. There are no changes to `adapters/fs-registry.ts`, `core/discovery.ts`,
`core/spawn.ts`, or `core/harness/copilot.ts`, and no `core/inbox.ts` or inbox
parser/command implementation has been added.

The following dirty worktree changes are orchestrator-owned and excluded from
this verdict: `requested-fences.md`, `the-flow.json`, `the-flow.md`,
`reports/phase-2-fleet.md`, and the Phase 2 task-validation artifact. The review
did not edit or attribute those changes.

**Review result**: APPROVE
**T006 may proceed**: Yes
**Finding dispositions**: F-001 RESOLVED; F-002 RESOLVED.
