# Validation — pij-inbox-no-tmux-plan.md

- **Validated**: 2026-07-12T11:54:00+10:00
- **Target**: `docs/plans/041-pij-inbox-no-tmux/pij-inbox-no-tmux-plan.md` @ `a8635bbfe71ce59f3405432048b9f2ad4c80d445`
- **Contract sources**: `original-ask.md`; `research-dossier.md`; `preamble-checkpoint.md`; approved `workshops/001-cli-layout.md`; current pij messaging/control-plane source
- **Checks**: required-heading/gate/AC coverage script; stale-command/gap scan; source inspection of send preflight, receipt wait, daemon ownership/router, pi receipt recording; targeted native-identity tests (86/86); targeted repair recheck; backpressure coverage linkage and 14/14 AC recheck
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: Purpose met; the Full plan is implementation-ready and its CLI, durability, receipt, daemon-ordering, Windows, and review contracts are evidence-backed.
- **Consumers**: Phase 1–3 requirements are explicit; 14/14 acceptance criteria map to executable tasks and proof.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | Pull targets must bypass the universal pid-based `E-DEAD` send preflight while dissolved/dead-push targets still fail. | AC-10; Finding 08; manifest `core/cli.ts`; task 2.3; coverage AC-10 | Resolved |
| MEDIUM | Daemon-free `send --wait` must exclusively claim receipt envelopes without racing `pij inbox`. | AC-05; Finding 09; manifest `cli.ts`; task 2.6; coverage AC-05 | Resolved |
| MEDIUM | Daemon pull non-ownership must be landed, reviewed, restarted, and canaried before registration/check verbs are exposed. | Finding 10; tasks 2.3→2.4→2.5/2.7; deployment risk; coverage AC-10 | Resolved |

## Repairs

- Added explicit pull-vs-push liveness preflight semantics to AC-10, the manifest,
  Finding 08, task 2.3, and coverage.
- Added receipt-inbox claiming and concurrency requirements to AC-05, Finding 09,
  task 2.6, the manifest, and coverage.
- Moved the daemon ownership guard into Phase 2 and inserted a reviewer-approved
  restart/canary gate before the first inbox registration/check verb.
