# pij Broadcast Send
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-11
**Status**: COMPLETE
**Spec source**: unified (this file)

## Business Specification

### Research Context

📚 Incorporates `research-dossier.md`: send parsing and waiting are singular today, while delivery and receipt paths are already independently keyed by recipient and message id.

### Summary

Extend `pij send` with repeatable `--to` flags so one command can send the same text to multiple named peers. Preserve existing single-target behavior and report honest results per recipient.

### Goals

- Support `pij send --to pij-a --to pij-b "message"`.
- Preserve `pij send <id> "message"` output and behavior.
- Deliver the raw text once to each recipient in input order.
- Surface independent `queued`, `delivered`, `unverified`, or error outcomes.
- Make `--wait` wait for every successful recipient, not the first receipt.

### Non-Goals

- No `pij orchestration broadcast` or new top-level `broadcast` verb.
- No multi-target remote commands or file attachments in v1.
- No transactional or simultaneous transport guarantee.
- No daemon, inbox protocol, or receipt-state redesign.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-messaging` | existing | **modify** | Extend send grammar, fan-out dispatch, output, and receipt waiting. |
| `pij-control-plane` | existing | consume | Reuse per-message daemon delivery and honest receipts unchanged. |
| `pij-skill` | existing | **modify** | Teach the peer route the broadcast syntax. |

### Testing Strategy

- **Approach**: Full TDD for parser, dispatch, output, and multi-receipt waiting.
- **Rationale**: repeated flags and first-receipt exit behavior are compact but regression-prone state transitions.
- **Focus Areas**: legacy compatibility, duplicate/mixed syntax rejection, all-target preflight, independent results, global wait completion.
- **Excluded**: transport/injection internals, which remain unchanged.
- **Mock Usage**: avoid mocks; use existing fake ports plus the real filesystem integration harness.

### Documentation Strategy

Update `docs/how/pij.md`, the `pij-messaging` domain record, and the `/pij peer` route. No README expansion.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=1, N=1, F=0, T=1
- **Confidence**: 0.91
- **Assumptions**: two or more `--to` flags select broadcast mode; input order is meaningful; one global wait timeout is sufficient.
- **Dependencies**: existing `DeliveryPort`, receipt body/parser, daemon receipt emission, fake adapters, and sandboxed CLI integration tests.
- **Risks**: parser compatibility, partial runtime failures, and premature `--wait` exit.
- **Phases**: one.

### Acceptance Criteria

1. **AC-01**: Existing `pij send <id> "<text>"` human and JSON output remains compatible.
2. **AC-02**: `pij send --to a --to b "<text>"` writes the identical raw body once to each target, in target order, with a unique message id per recipient.
3. **AC-03**: Broadcast rejects fewer than two targets, duplicate targets, positional-target mixing, missing text, and `--command`/`--file`/`--caption` with `E-ARG`.
4. **AC-04**: Self, missing, dead, or dissolved recipients fail preflight before any recipient receives the message.
5. **AC-05**: Human output prints one recipient row; broadcast JSON is `{from, results:[...]}` with target, message id, receipt, liveness, and daemon-tick fields where applicable.
6. **AC-06**: A delivery-port failure for one preflight-valid recipient is reported without suppressing later recipients; the command exits non-zero if any recipient failed.
7. **AC-07**: Broadcast `--wait` prints target-prefixed receipt changes and exits only when every successful send is `delivered`/`unverified`, or the single global timeout expires; single-target wait output is unchanged.
8. **AC-08**: Pure tests, sandboxed two-recipient integration, `just pij-skill-check`, and the repository done gate pass.

### Risks & Assumptions

| Risk | Evidence | Mitigation |
|------|----------|------------|
| Repeated flags overwrite silently today. | `research-dossier.md` F-02 | Add an explicit repeatable-flag path used only by `--to`; preserve scalar flag behavior. |
| Current wait exits after the first terminal receipt. | plan scout finding 02 | Track all target/message pairs and terminate only when the pending set is empty. |
| Fan-out can partially succeed after preflight. | `DeliveryPort` returns per-call `Result`. | Continue attempts, report each result, and return non-zero when any delivery fails. |
| s036 may edit top-level `cli.ts`. | government SW-3 | Serialize that file at plan validation; no `daemon.ts` change is planned. |

### Open Questions

None.

### Workshop Opportunities

None; current contracts and the selected CLI shape are sufficient.

### Clarifications

#### Session 2026-07-11

- Jordan selected the messaging surface and repeatable `--to`; single-target send stays unchanged.
- Jordan selected Simple mode and requested a concise plan plus cold-subagent `/validate-v2`.
- Under `--skip-clarify`, testing defaults to repo-standard TDD, existing fakes, and focused how/route/domain documentation.
- V1 is text-only; multi-target commands and files remain deliberately out of scope.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | yes | Defines the parser, dispatch, wait, compatibility, and sequencing constraints. |
| workshops/*.md | no | No authoritative workshop decisions. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | `--skip-clarify`; CLI, scope, mode, and receipt behavior are settled. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; plan follows the existing pi-free core/ports split. |
| G4 | ADR Compliance | N/A | No accepted ADRs. |
| G5 | Structure | PASS | Both halves, manifest, tasks, coverage, and risks are complete. |
| G6 | Testing Alignment | PASS | RED tests precede implementation; acceptance criteria are observable. |
| G7 | Domain Completeness | PASS | All three existing domains and every task path are mapped. |

### Summary

Add a repeatable `--to` parser path, normalize single and broadcast sends into ordered targets, preflight the full set, then reuse the existing per-target delivery and receipt logic. Extend the wait loop to correlate multiple message ids while preserving legacy output for positional single-target sends.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/cli.ts` | `pij-messaging` | contract | Send grammar, normalized targets, result projection, and wait follow shape. |
| `.pi/extensions/pij/core/cli.test.ts` | `pij-messaging` | internal | Pure parser/dispatch/wait-state regressions. |
| `.pi/extensions/pij/cli.ts` | `pij-messaging` | internal | Multi-message receipt polling; SW-3 shared file. |
| `.pi/extensions/pij/cli.integration.test.ts` | `pij-messaging` | internal | Real CLI and filesystem fan-out proof. |
| `docs/how/pij.md` | `pij-messaging` | contract | Operator syntax and per-recipient output. |
| `docs/domains/pij-messaging/domain.md` | `pij-messaging` | contract | Record one-to-many send as a domain capability. |
| `skills/pij/references/routes/peer.md` | `pij-skill` | cross-domain | Teach the installed peer route the CLI extension. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `lex()` stores one scalar per flag, so repeated `--to` would overwrite. | Add a narrowly scoped repeatable-value channel without changing other flags. |
| 02 | Critical | `waitReceipt()` exits on the first terminal receipt. | Track pending message ids and exit only when all are terminal or timed out. |
| 03 | High | Parsed send, dispatch, output, and follow hints all assume one target. | Normalize internally while keeping positional single-target output compatible. |
| 04 | High | Delivery and receipts are already per target/message id. | Loop over existing primitives; do not touch daemon/session transport. |
| 05 | High | No all-target validation or duplicate helper exists. | Add ordered preflight before the first delivery and reject duplicates as `E-ARG`. |
| 06 | High | Only top-level `cli.ts` overlaps s036's likely files. | Trigger SW-3 for `cli.ts`; keep `daemon.ts` outside the manifest. |

### Implementation

**Objective**: Ship one-command text fan-out with independent, honest recipient outcomes and no single-target regression.
**Testing Approach**: TDD over the pure CLI core, then sandboxed real-CLI integration and one live two-peer smoke.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Write RED tests for repeatable `--to`, mixed/duplicate/invalid syntax, all-target preflight, ordered fan-out/results, partial delivery failure, and multi-message wait completion | `pij-messaging` | `core/cli.test.ts`, `cli.integration.test.ts` | Each AC-02..07 failure is observed before implementation; legacy AC-01 tests remain green | Findings 01–05 |
| [x] | T002 | Extend parsing with a repeatable `--to` channel and normalize positional single-target vs flag broadcast commands | `pij-messaging` | `core/cli.ts` | Two-or-more `--to` values parse in order; scalar flags retain current behavior; invalid combinations return `E-ARG` | Finding 01 |
| [x] | T003 | Add ordered all-target preflight, per-target delivery/result projection, broadcast human/JSON output, and non-zero partial-failure status | `pij-messaging` | `core/cli.ts` | No delivery occurs before preflight passes; successful targets receive one raw body and unique ids; later targets still run after a port failure | Findings 03–05 |
| [x] | T004 | Replace the single-id wait hint/loop with target-message tracking and terminal-set completion | `pij-messaging` | `core/cli.ts`, `cli.ts` | Broadcast wait reports each target and cannot exit after the first receipt; timeout names unresolved targets; positional wait output is unchanged | Finding 02; SW-3 |
| [x] | T005 | Add real two-recipient integration, update how/domain/peer-route docs, run targeted gates, live-smoke two peers, then run the full done gate | cross-domain | `cli.integration.test.ts`, `docs/how/pij.md`, `docs/domains/pij-messaging/domain.md`, `skills/pij/references/routes/peer.md` | AC-01..08 pass; `just pij-skill-check` and `harness checks` are green; each live peer receives exactly one copy | No daemon restart required |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002, T003, T004 | Existing parser/dispatch/wait snapshots and integration stay green. |
| AC-02 | T001, T003, T005 | Fake outbox order plus two real inbox files. |
| AC-03 | T001, T002 | Parser error table. |
| AC-04 | T001, T003 | Empty outbox after invalid-target preflight. |
| AC-05 | T001, T003 | Human and JSON result assertions. |
| AC-06 | T001, T003 | Failing fake delivery with later-target success. |
| AC-07 | T001, T004 | Multi-receipt state tests and CLI wait integration. |
| AC-08 | T005 | Targeted gates, live smoke, and `harness checks`. |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Scalar flag parsing regresses | Medium | High | Keep repeatable storage isolated to `--to`; retain existing parser tests. |
| Broadcast JSON breaks single-target scripts | Low | High | Branch output by syntax mode; never change positional single-target JSON. |
| Wait hangs or exits early | Medium | High | Pure pending-set tests, one global timeout, explicit unresolved-target output. |
| cli.ts edit collides with s036 | Medium | High | O-prime grants a serialized SW-3 window before implementation. |
| Live skill text changes immediately | Low | Medium | Run `just pij-skill-check`; request o-prime look before the commit touching `peer.md`. |
