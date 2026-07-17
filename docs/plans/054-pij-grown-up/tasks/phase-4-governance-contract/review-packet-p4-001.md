# P4 review packet 001 — cold cross-model review (cycle 1, PLAN-CLOSING)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Reviewer**: cold copilot `gpt-5.6-sol` @ xhigh — you reviewed P1(6c)/P2(1c)/P3(1c); compacted — re-derive from artifacts. This verdict closes plan 054's review loop.

## Who you are
Cold reviewer. Report ONLY via `pij send pij-civilian-takin`. Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` · branch `s054/pij-grown-up`. Read-only except your ONE output file.

## Target
Range `fec9032..5b7e65c` — Phase 4 (Governance contract), 9 commits: T001 `0ef6839` pure render · T002 `8acd2c6` spine render verb (bin-intercept) · T003 `8a7c593` migration doc · T004 `713c123` skill node route + gate · T005/6 `4e0efb2` platform doc + README + T006c ruling · T007 `42f4c0f` 12-AC acceptance sweep · T008 `5b7e65c` ship checklist + wrap. Diff: `git -C <worktree> diff fec9032..5b7e65c`.

## Authorities
Plan §Phase 4 + AC-10/AC-12 + the FULL 12-AC table + Acceptance Coverage Map · R3/R4 constraints · `tasks/phase-4-governance-contract/tasks.md` (validated; 4 folded findings incl. the mandated 12-AC sweep chain + ruled bin-intercept + ruled fence amendment) + `coder-packet.md` · execution log (claims not truth) · your p1–p3 verdicts (all pins hold).

## Review dimensions
1. **The sweep IS the phase (highest weight)**: audit `acceptance-sweep.test.ts` against the plan's 12 ACs — for EACH AC verify the sweep GENERATES its evidence (not comment-mapped to assertions the flow never produces) and the assertion is field-level: AC-01 all clauses (create/list/set), AC-02 filter EXACTNESS (set equality, not containment), AC-03 coupling + duplicate-append idempotence, AC-04 all three verdicts, AC-05 two-axis + implicit general + worst-first, AC-06 verify flip, AC-07 alert-once, AC-08 caller-truth + unadopted, AC-09 full card, AC-10 render, AC-11 pre-seeded legacy round-trip, AC-12 (doc-based — see dim 4). Attack: could a wrong implementation still pass any AC's assertion?
2. **R3/R4 INDEPENDENT verification (CRITICAL if violated)**: `git hash-object government/prime-flow.json` == `git rev-parse HEAD:government/prime-flow.json`; grep the diff + all new tests/scripts for `pij-skill-install` (must appear ONLY in the ship checklist + justfile), real `~/.pij` usage, live daemon invocation; `government/**` absent from the diff.
3. **Render correctness**: byte-stability pin real (double-render byte equality); unknown-kind/additive-field honesty (never drops); bin-intercept as ruled (core row E-NOREGs naming bin; integration byte-identity); `writeTextAtomic` extraction behavior-preserving for existing `writeJsonAtomic` callers.
4. **Docs as contract (AC-12)**: spot-check `docs/how/pij-platform.md` field claims against types.ts (the coder ran a scripted parity check — re-run its spirit on a sample: descriptor node-truth block, Assignment, SpineEvent envelope, badge order vs BADGE_SEVERITY); migration doc's dual-run/cutover language unambiguous (AC-10); adoption-nudge content in node.md consistent with P3's shipped contract.
5. **Rulings to adjudicate (5)**: (a) writeTextAtomic extraction; (b) gate script THIRD extension at :89 coverage list beyond the two ruled anchors; (c) T006c default upheld (rollout window unwired, documented); (d) bin-intercept mechanism; (e) pkg-audit side-effect revert (verify no residual .pi/packages.yaml mutation in the committed diff).
6. **Skill gate enforcement**: `just pij-skill-check` green AND node actually policed (grep the script for node in the :47 list, :69 hard loop, :89 coverage — all three).
7. **Regression + fence**: all P1/P2/P3 pins; frozen legacy block; sw-zones (discovery/current-session/close/daemon.ts) ABSENT from diff; fence vs packet (harness/scripts/pij-skill-check.sh amendment was RULED — in-fence).
8. **Ship-readiness exposure**: is the ship checklist complete + honest (R3-annotated, SW-7 reconciliation step present, nothing pre-executed)?

## Gates you may run
`npx vitest run .pi/extensions/pij` (incl. the sweep) · `just typecheck` · `just pij-skill-check`. Baseline flake outside scope: release-age-policy.

## Output contract
1. ONE file `docs/plans/054-pij-grown-up/reviews/p4-review-001.md`: verdict first; findings severity/file:line/scenario/smallest-fix; rulings section (a–e); APPROVE requires per-AC sweep confirmation (all 12), the R3/R4 independent verification statement, and a WHOLE-OF-PLAN closing attestation (P1–P4 all review-clean, every prior finding root-cause dead).
2. Then: `pij send pij-civilian-takin "P4 REVIEW <APPROVE|FINDINGS n> · docs/plans/054-pij-grown-up/reviews/p4-review-001.md · <one-liner>"`

## Forbidden
Everything except reading + your one output file — no code edits, no the-flow files, no `government/**`, no other docs writes, no commit/push/PR, no canonical-repo writes, no daemon/tmux mutation.
