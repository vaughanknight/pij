# Execution log — plan 035 (o-prime routing skill)

## 2026-07-11 · T001 sequencing gate — CLOSED

- **Ruling (Jordan)**: commit the entangled working tree now (019 build-f WIP + FX001/FX002, ~1,850 lines) rather than fence or detangle. FX002's doc records a full repository gate pass on this tree.
- **Commit**: `cb87bbd` — extension edits (T013–T016) unblocked on a clean base.
- **Pre-fix gate baseline recorded (validation HIGH)**: `bash harness/scripts/pij-skill-check.sh` was **exit 1** before this plan's work — `watch` registry row (SKILL.md:29) has no module and its marker misses the script's pending-row regex (script line 18). T003 repairs this first.
- **⚠ Step-on (orchestrator fault, ledgered)**: the T001 `git add -A` ran while coder pij-54n2cu was mid-packet (dlg-0001) in the same tree — its first three vendored files (`skills/pij/references/prime/orient-oprime.md`, `orient-global.md`, `prime-flow.schema.json`) were swept into `cb87bbd`. Consequence: the dlg-0001 review diff must be computed against the **pre-cb87bbd baseline for the allowed paths** (`cb87bbd^`) plus worktree, or the coder's earliest work drops out of the diff. Lesson (flow-pair learn candidate): an orchestrator-side commit during an open delegation must exclude the delegation's allowed paths (`git add -- . ':!<allowed paths>'`), or wait.

## 2026-07-11 · Fleet + dispatch

- Run: `.flow-pair/runs/2026-07-11T06-09-55Z-github.com-AI-Substr` · coder **pij-54n2cu** (copilot gpt-5.6-sol, xhigh) — canary PASS: nonce 035-CODER-4411 ✓, footer model ✓, effort verified **mechanically via process args** after a loose self-report said "high" (live P-02/T013 evidence: self-reports lie, pins don't — the spawn's `--effort xhigh` was present in ps output). Reviewer: not yet spawned (lazy, first REVIEW; Jordan's spec: same copilot gpt-5.6-sol xhigh — deliberate same-model override of the route's cross-model default).
- dlg-0001 dispatched: T002–T012 + T017 (skill-text block), allowed paths = skills/pij/** + vendored/ + pij-skill-check.sh + docs/how pair. Orchestrator-held: T013–T016 (now unblocked), T018 (o-prime review), T019 (AC-0 run).

## 2026-07-11 · Delegation cycle status

- **dlg-0001 COMPLETE → rev-0001 FIX_REQUIRED** (reviewer pij-1rhmgrt, canary PASS w/ mechanical effort check). 3 high + 1 medium, all mutation-evidenced — star catch: gate never required the `prime` registry row itself (row-removal mutation stayed green). Verdict: `reviews/review-dlg-0001-verdict.md`; record: `reviews/rev-0001.json`; **fix-0001** rendered (3 files) and delivered to the coder post-dlg-0002. Reviewer also verified 3-way hash identity (local/worker/upstream) and noted upstream encode-candidates drifted (+E-19) AFTER our vendor snapshot — not attributed.
- **dlg-0002 COMPLETE** (T013–T015, TDD RED→GREEN per task, 1225 tests green, no commit/restart). Orchestrator glance verified: `dissolved` in lifecycle+liveness vocab (types.ts:26,44), pinned `effort` field (types.ts:117-120), `lastTickAt` daemon→receipts (daemon.ts:94, receipts.ts:24-37). New receipt staleness note already visible in live CLI sends ("daemon tick stale (never old)") — running daemon predates the field; C6 restart lands at T016. Review dispatched (review-dlg-0002.md, surface pinned to .pi/extensions/pij/, per-task Dim-0 mandatory).
- **P9 gap (mine, ledgered)**: dlg-0001's worker report was not persisted to the ledger before review dispatch — reviewer caught it; now at `reports/worker-report-dlg-0001.json`. Flow-pair learn candidates queued: ① orchestrator commits during open delegations must exclude delegation paths; ② persist worker reports before review dispatch.
## 2026-07-11 · Fleet teardown + T019 handoff

- Fleet closed with stand-down notes (coder pij-54n2cu, reviewer pij-1rhmgrt; smoke peer pij-1pm08ey closed earlier). All three verify `done · dissolved` — distinct from dead, zero resurrections across the drain window. Runbook step 13's re-run-close workaround is obsolete post-T015.
- **T019 mode (Jordan's ruling)**: Jordan runs the o-prime himself; pij-3vetx8 checks in on it (cold-reader audit posture, E-12; freeze+hash before judging artifacts, R5.4).

## 2026-07-11 · T018 CLOSED — o-prime fidelity verdict FAITHFUL, zero blocking (AC-09 ✓)

- Verdict vendored (source repo is transitional): `vendored/pij-prime-route-fidelity-r1.md` (sha256 17cfc4f0…) + `reviews/t018-oprime-fidelity-r1.md`. Headlines: all 16 files read (1,206 lines); levers verified verbatim by the o-prime's own diff; doctrine-coverage table spot-checked every hard-won rule to its rung; leg-b canary + dissolved-state judged STRONGER than run-01; all 3 workshop-001 notes confirmed landed.
- **Addendum folded (items 1–3, one-liners, gate re-run green)**: E-16 commits-as-yield-points → kickoff.md:72 (77/90); SHA re-pin at activation + queued-stream scratch posture → batons.md hard paths (50/90). **Item 4 (diff-snapshot untracked-file blindness) → backlog**: it's a flow-pair/observe engine lesson (H-04 adjacent — our own diff-0001 exhibited the class); belongs to a flow-pair ordinal, not this plan's payload.

## 2026-07-11 · dlg-0002 APPROVED + T016 complete

- **dlg-0002 APPROVED**: fix-0002 round 2 (notice-source guards, idle path) → reviewer "fix-0002: RESOLVED"; resolution at `reviews/rev-0002-resolution.md`; T013–T015 ticked.
- **T016 COMPLETE**: commit `5d2b2a1` (full 035 implementation); daemon restarted per C6 (pid 75408; status showed a transient "orphan" boot race, cleared in seconds); **live smoke green with all three P-fix behaviors observed first-hand**: spawn printed pinned "(claude, model sonnet, effort low)"; `pij state` carried model+effort+`daemon tick: fresh` (registry-read canary leg b, AC-04); legacy peers show "—" for the new fields (migration safety live); round-trip 'ok'; `pij close` → "descriptor **dissolved**", state `done · dissolved`, pid gone, **zero false death notices** (AC-03 observed live). P-03 staleness note visible in receipts pre-restart ("daemon tick stale (never old)") and fresh post-restart — the discriminator works in both directions.
- **T018 dispatched**: o-prime (pij-uec99o) route-text fidelity review, pointers sent, blocking-findings-only contract.

- **fix-0002 SURVIVING finding** (reviewer, 2026-07-11): the repair guarded only the activity-write seam — an already-idle/READY peer dissolved during capture (observeActivity → null) still emits the false death notice via the stale in-memory descriptor. Follow-up dispatched: guard the NOTICE SOURCE (re-read registry truth before any dead/stalled/provider push, skip on dissolved) + idle-path regression RED-first. Lesson: fix the seam the *symptom* flows through, not just the seam the *probe* used.
- **dlg-0001 APPROVED** (2026-07-11): reviewer "fix-0001: RESOLVED" + orchestrator sanity pass (first-hand mutation re-run) → approval recorded at `reviews/rev-0001-resolution.md`; plan tasks T001–T012 + T017 ticked. dlg-0002 fix cycle continues (fix-0002 in flight: false-death-notice on dissolved close + busy-peer comparator).
- **fix-0001 COMPLETE + orchestrator-verified**: all four findings landed (gate requires the prime row — I re-ran the row-removal mutation myself: mutated exit 1 / real tree exit 0; `--layout window` kickoff:19; briefs+canaries unconditional bootstrap:45; R8.6 workshop-recording bootstrap:54). Coder's own mutation run used a temp PIJ_SKILL_ROOT copy to respect the 3-file write boundary. 1630/1640 passed (10 skipped — pre-existing). Formal reviewer confirmation queued behind its dlg-0002 verdict.
