# Research Dossier: pij broadcast send

**Generated**: 2026-07-11T09:38:00Z
**Query**: "Add repeatable --to broadcast sends with honest per-recipient receipts"
**Effort**: Quick
**Tools**: Mixed
**Evidence**: 9 current sources · 3 historical sources

## Answer

- Keep `pij send <id> "<text>"` byte-compatible and add broadcast as `pij send --to <id> --to <id> "<text>"`.
- Fan-out belongs in the CLI/core dispatch layer: delivery, daemon injection, and receipt emission are already independently keyed by target and `messageId`.
- Broadcast must produce one result per recipient; there is no honest aggregate `delivered` state.
- V1 should broadcast text only. Multi-target `--command` and `--file` add avoidable blast radius and are out of scope.
- Validate the whole target set before delivery, reject duplicates, then continue independent deliveries so one adapter failure does not suppress healthy recipients.
- `--wait` needs a multi-message correlation loop with one global timeout and target-prefixed receipt updates.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | The send command and follow-up contract are singular: one `to`, one `messageId`. | `.pi/extensions/pij/core/cli.ts:57-69,88-101` | Widen the parsed send command and wait hint to ordered recipient/result collections while preserving the single-target shape. | High |
| F-02 | The lexer stores one value per flag, repeated flags overwrite, `--to` is not allowed, and send accepts at most two positionals. | `.pi/extensions/pij/core/cli.ts:122-177` | Repeatable `--to` requires an explicit repeatable-flag representation; do not silently comma-split or replace the last target. | High |
| F-03 | Dispatch currently performs target validation, one delivery, and one initial receipt projection in one branch. | `.pi/extensions/pij/core/cli.ts:502-606` | Extract/reuse a per-target send operation, preflight all targets, and render single vs broadcast output separately. | High |
| F-04 | Each delivery already creates a unique message id and atomically writes one target inbox entry. | `.pi/extensions/pij/adapters/channel.ts:42-54` | Fan-out can call the existing delivery port once per recipient; no transport protocol or shared batch id is required. | High |
| F-05 | Receipt state is already per message (`queued|delivered|unverified`), and both pi and daemon paths emit receipts back to the sender by message id. | `.pi/extensions/pij/core/types.ts:208-227`; `.pi/extensions/pij/core/session.ts:467-476`; `.pi/extensions/pij/daemon.ts:346-368` | Preserve independent recipient truth; daemon/session code should not need changes. | High |
| F-06 | `--wait` polls for one message id and exits on its terminal receipt. | `.pi/extensions/pij/cli.ts:281-305,1958-1960` | Replace the single-id waiter with an ordered target-to-message correlation set; finish when all are terminal or the existing timeout expires. | High |
| F-07 | Pure CLI tests already cover strict parsing, raw-body delivery, receipt hints, daemon staleness, and target errors. | `.pi/extensions/pij/core/cli.test.ts:53-180,227-388` | Add parser, preflight, fan-out, output, and per-recipient receipt tests at the existing pure seam. | High |
| F-08 | The real CLI integration test proves inbox writes and receipt round-trips over a sandboxed `PIJ_HOME`. | `.pi/extensions/pij/cli.integration.test.ts:86-162` | Add one two-recipient integration case and one multi-receipt wait case without requiring live tmux. | High |
| F-09 | `pij-messaging` owns send/receipt contracts; `pij-control-plane` extends the transport and already isolates per-session delivery. | `docs/domains/registry.md:12-15`; `docs/domains/domain-map.md:97-99` | This is primarily a `pij-messaging` CLI change; the only known shared s036 seam is top-level `cli.ts`, not `daemon.ts`. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Honest receipts established that `delivered` means positively confirmed and `unverified` is retriable. | `docs/plans/032-pij-honest-send-receipts/pij-honest-send-receipts-plan.md:10-26,56-64` | Direct | Never collapse recipient outcomes into one optimistic broadcast success. |
| H-02 | FX001 established an at-most-once boundary after the first Enter and explicitly left routing/receipts unchanged. | `docs/fixes/FX001-duplicate-injection-composer-retype.md:65-73,99-104` | Direct | Reject duplicate recipient ids before fan-out; do not redesign injection. |
| H-03 | FX002 made delivery failures non-throwing and isolated one peer from unrelated peers without expanding the protocol. | `docs/fixes/FX002-stale-pane-daemon-head-of-line-blocking.md:34-48,50-67` | Direct | A failed recipient must not prevent later valid recipients from being attempted and reported. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Top-level `cli.ts` is shared with s036. | `government/spine.md:42`; `government/briefs/s037-adoption.md:30-36` | `--wait` fan-out needs that file, so simultaneous edits would violate the fence. | Name `cli.ts` exactly in the Domain Manifest; o-prime serializes SW-3 at plan validation. |
| Broadcast output is a new machine contract. | F-01, F-06 | Changing single-target JSON would break scripts. | Keep single-target output byte-compatible; use `{from, results:[...]}` only when multiple `--to` values are supplied. |
| "At the same time" cannot mean transactional simultaneity over independent inbox files. | F-04 | A batch transaction would require a new protocol with little user value. | Define it as one command that fans out immediately in recipient order, with independent outcomes. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-messaging` | modify | CLI send grammar, raw body preservation, per-message receipt correlation | F-01 through F-08 |
| `pij-control-plane` | consume unchanged | Existing daemon delivery and honest receipt emission remain per message | F-05, H-01 through H-03 |

## Planning Handoff

- **Preserve**: existing single-target syntax/output, raw message body, strict `E-ARG` parsing, per-message honest receipts, at-most-once injection, and per-peer failure isolation.
- **Change carefully**: repeatable flag lexing, all-target preflight, multi-result rendering, and multi-message `--wait`.
- **Likely files/symbols**: `.pi/extensions/pij/core/cli.ts` (`lex`, `ParsedCommand`, `CliResult.follow`, send dispatch), `.pi/extensions/pij/cli.ts` (`waitReceipt`), their tests, `docs/how/pij.md`, and `docs/domains/pij-messaging/domain.md`.
- **Decisions settled**: repeatable `--to`; text-only broadcast; duplicate targets are `E-ARG`; preflight static target errors before fan-out; ordered per-recipient results; one global wait timeout; single-target compatibility.
- **Decisions still required**: none.
