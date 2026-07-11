# Validation — pij-broadcast-plan.md

- **Validated**: 2026-07-11T19:43:08+10:00
- **Target**: `docs/plans/037-pij-broadcast/pij-broadcast-plan.md` (sha256 `5cb389d82ca6fde6b3fa3c04afdfeb4d58d7533a2fcdb1436ae7313995425261`)
- **Contract sources**: `original-ask.md`, `rulings.md` #1–2, `research-dossier.md` F-01…F-09/H-01…H-03, `government/spine.md` §Sequencing watch (SW-3), `government/briefs/s037-adoption.md`
- **Checks**: source verification of every research finding against live code — `core/cli.ts:57-101` (singular send/follow, F-01), `core/cli.ts:125-177` (one-scalar-per-flag lexer, `--to` unlisted, `MAX_POS.send=2`, F-02), `core/cli.ts:215-271,502-606` (single-target parse + dispatch, F-03), `adapters/channel.ts:42-54` (per-call unique messageId, F-04), `core/types.ts:209-227` + `daemon.ts:340-368` (per-message receipts/drain, F-05), `cli.ts:281-310,1958-1959` (single-id waiter, F-06); manifest file existence (7/7); domain registry (`docs/domains/registry.md:12,15,18` — 3 active domains); `justfile:163` (`pij-skill-check`); follow-shape consumer census; N/A-gate confirmation (no `docs/project-rules/{constitution,architecture}.md`, no ADRs)
- **Verdict**: VALIDATED
- **Thesis / proof**: Purpose met — a repeatable `--to` fan-out extension to `pij send` (per `rulings.md` #1, not `pij orchestration`) with honest per-recipient receipts and no single-target regression; the plan's Decision/Contract-level claims match current code at every cited seam.
- **Consumers**: 1/1 — the only consumer of the `CliResult.follow` (wait) contract is `cli.ts:1958-1959`, itself named in the Domain Manifest and covered by task T004; new broadcast JSON `{from, results:[...]}` is emitted only on the new multi-`--to` syntax, so existing single-target JSON consumers are unaffected.

## Findings
| Severity | Finding | Evidence | Status |
|---|---|---|---|
| — | no_material_findings | — | — |

## Notes (non-blocking, LOW — recorded, not gating)
- Ownership of `cli.integration.test.ts` is shared by T001 (RED) and T005 (real two-recipient integration); reading the two tasks together resolves it (T001 authors the failing case, T005 confirms + live-smoke). Not a defect.
- A single `--to a "text"` is rejected as `E-ARG` (AC-03; broadcast requires ≥2 targets). This is a deliberate, documented decision (Complexity §Assumptions; research handoff "repeatable `--to`"), positional single-target being the one-recipient path. Surprising but internally consistent — not a defect.

### Evidence the key gate claims are honest
- **Avoids unnecessary daemon changes**: `daemon.ts` is explicitly excluded from the Domain Manifest and Finding 04/06; verified against F-05 — `daemon.ts:340-368` `drainInbox` and receipt emission are already per-`messageId`, so fan-out reuses existing primitives with no transport change.
- **SW-3 honesty**: `government/spine.md` SW-3 requires the manifest to name the shared `cli.ts`/`daemon.ts` touch-list; the manifest names `.pi/extensions/pij/cli.ts` (marked "SW-3 shared file") for the multi-message waiter and correctly omits `daemon.ts`, matching the code evidence.
- **CLI compatibility**: current parser (`core/cli.ts:152-177`) makes `--to` an unknown flag for `send` today and caps `send` at two positionals; AC-01/AC-02/AC-05 preserve positional single-target output byte-for-byte and branch broadcast output only on ≥2 `--to`.
- **Receipt/wait semantics**: `ReceiptState = queued|delivered|unverified` (`core/types.ts:209`) and the single-id `waitReceipt` exit-on-first-terminal (`cli.ts:296-301`) are correctly identified; AC-07/T004 extend to a pending-set completion with one global timeout without collapsing recipient outcomes (aligns with H-01 honest-receipts constraint).
- **Gate honesty**: G2–G4 `N/A` confirmed — only `agent-harness.md`/`harness.md` under `docs/project-rules/`, no `constitution.md`/`architecture.md`, no ADRs. G5–G7 `PASS` confirmed — both halves present, TDD RED-first task order (T001 precedes T002–T004), and all 7 manifest paths map to 3 active domains.
