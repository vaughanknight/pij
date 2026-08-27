# Checkpoint — plan validated, Phase 1 dispatched (s392-day3-codex-doctrine)

**Seat**: pij-falling-outside · **Date**: 2026-08-27T08:5xZ

## claim
Unified plan v1.3.0 (sha 4946aac20e24544eb6123e2c11f0f942bc482c9d9d647cb0679469d0a80bcbb4) validated through three cold validate-v2 passes; Codex (item 2) deferred by Vaughan's ruling; Phase 1 (3b) dispatched to canaried coder pij-gunboat-diplomat as flow-pair dlg-0001.

## artifacts[]
- docs/plans/392-day3-codex-doctrine/day3-codex-doctrine-plan.md (v1.3.0)
- docs/plans/392-day3-codex-doctrine/tasks/phase-1-telegram-sqlite-forwarder/tasks.md (sha a88705ea437e3de92a73ef561cf3ca75be030722a58ee952d905fd04f6d10e37)
- docs/plans/392-day3-codex-doctrine/reports/validate-v2-plan.md (v1.0.0 → NEEDS ATTENTION, 5 HIGH)
- docs/plans/392-day3-codex-doctrine/reports/validate-v2-plan-v1.1.md (v1.1.0 → NEEDS ATTENTION, 1 HIGH 2 MED)
- docs/plans/392-day3-codex-doctrine/reports/validate-v2-plan-v1.2.md (v1.2.0 → semantic fixes PASS, 1 MED anchor)
- docs/plans/392-day3-codex-doctrine/reports/validate-v2-plan-v1.3-orchestrator-note.md (deviation stated: no 4th cold pass for the one-token anchor fix)
- docs/plans/392-day3-codex-doctrine/deferred-codex-phase.md (Phase 3 + validator findings 1–3, entry brief for resumption)
- docs/plans/392-day3-codex-doctrine/rulings.md · roster.md · pending-decisions.md · thesis.md
- .flow-pair/runs/2026-08-27T08-21-56Z-github.com-vaughankn/prompts/dlg-0001.md (packet; ledger gitignored)

## shas[]
- plan v1.0.0 29abeee3ce93962330f5802d652c0e6fe931538f11c98fab6a2e6500c3977a16 · v1.1.0 1647778cc070a648a44e11f00e015780283a0fb28a7a4fb0fd3915f594b3b3fa · v1.2.0 f3934168b3fc1dd4bae30ed18e6281242c92604b4e25f6a0cde7d0953d0152dd · v1.3.0 4946aac20e24544eb6123e2c11f0f942bc482c9d9d647cb0679469d0a80bcbb4
- base HEAD 2953d7599b3b8a498295f9e07b766a4fff49edc9 (no code commits yet)

## gates[]
- cold validate-v2 ×3 (copilot gpt-5.6-sol xhigh, --once): verdict files above
- coder canary: pij-gunboat-diplomat process args `--model gpt-5.6-sol --effort xhigh --ui-server --port 56697`; dispatch-de34e194 acked (spine 24002)
- flow-pair dispatch dlg-0001 promptHash 4d122d3e

## observations[]
- obs-06 / friction / planning / three validation rounds were spent on my own wording drift (exactly-once vs at-least-once, stale anchors) rather than substance — encode: a `harness` check that greps a plan for banned-promise words and verifies `file:line` anchors mechanically before a cold pass
- obs-07 / win / validation / the cold validator caught a real lost-message defect in the plan (forwarder swallows send errors → would ack) that the source survey missed — the cold pass is load-bearing, keep it
- obs-08 / friction / tooling / `pij canary` timed out ~2 s before the copilot seat's ack landed (E-CANARY-TIMEOUT while the pane showed the ack) — encode: longer default wait or a `--wait` flag
- obs-01/02 carried (thesis skill location; pwsh known-red)

## open[]
- Contract deviation for the o-prime to accept or bounce: v1.3.0 differs from the last cold-verified v1.2.0 by one anchor token; note file above.
- Follow-ups (not this plan): `--skip-backlog`; token-scoped `resetClaimsOnStart`; durable retry on Telegram API failure; `pij queue retire` (s391); Codex phase (deferred).
- Build config: default profile used as pre-confirmed (ruling 5); reviewer `claude-opus-5` xhigh acquired at first REVIEW.
- Bridge restart + row-149 retirement + AC-07 live proof: o-prime baton, on Phase 1 handover.
