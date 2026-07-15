# Execution log — s050 focus-agents (canonical build record)
**Owner**: pij-bored-pelican (orchestrator) · **Plan**: focus-agents-plan.md v1.0.1 · **Branch**: s050/focus-agents @ base af7dcc8
**Fence**: Seq 258 (write set) + Seq 286 (this log + plan checkboxes added). No commit/push/PR.

## Build configuration (human-confirmed, Seq 250)
- Coder: `pij-forward-condor` — copilot gpt-5.6-sol @ xhigh (worktree cwd). Canary PASS (pid 8137, sol back, no-400).
- Reviewer: `pij-grubby-marten` — copilot gpt-5.6-sol @ xhigh, clean-room. Canary PASS (pid 84680, distinct context).
- flow-pair run `2026-07-14T20-39-49Z-github.com-AI-Substr`.

## Timeline
| When | Event | Outcome |
|------|-------|---------|
| Seq 258 | Fence granted; ff-only merge 5830b27→af7dcc8; boot GREEN (typecheck+test) | ready |
| — | Dispatch dlg-0002 (whole phase T01→T11, TDD) to coder | delivered |
| — | Coder preflight: release-age pwsh ETIMEDOUT | orchestrator-adjudicated FLAKE (green standalone 6/6); DL-001 recorded |
| — | Coder COMPLETE: 12 files, testsRun 2028/passed 2017, all 8 sensors green, flow-pair 148/148 | claim received |
| — | Compact coder (fire-and-forget) → spawn+canary reviewer → dispatch review | in review |
| — | Reviewer verdict: **FIX_REQUIRED** — 2 critical, 2 high, 1 med; Dim-0 mutation-proven | verified |
| — | Orchestrator sanity pass: F-01 & F-02 confirmed real against focus.ts | verdict holds |
| — | Compact reviewer → render fix packet → dispatch to warm coder | fix in progress |
| — | Coder fix COMPLETE: F-01/F-02/F-03/F-05/AC-10, 6 new tests, focus suite 140 green, full harness checks 8/8 (release-age flake re-adjudicated) | claim received |
| — | Compact coder → dispatch RE-REVIEW (round 2) to warm reviewer w/ Dim-0 on the 2 critical-path fixes | re-review in flight |

## Findings under fix (dlg-0002 → fix loop)
| ID | Sev | Summary | Owner |
|----|-----|---------|-------|
| F-01 | critical | pi launch returns orphaned id — pi self-registers, doesn't adopt `PIJ_SESSION_ID` | coder |
| F-02 | critical | claude materializes under donor id → same-cwd collision (writeMaterialized refuses) | coder |
| F-03 | high | launch reports success before relaunch canary/bind gate (AC-03) | coder (contract) + orchestrator (live T10) |
| F-04 | high | execution.log.md + plan checkboxes absent | **orchestrator (this file, Seq 286)** |
| F-05 | med | post-spawn hash read leaks descriptor on failure | coder |
| Dim-4 | — | AC-10 tests only copilot-save + codex-launch, not both ops × both harnesses | coder |

## Decisions
- **D1**: pi launch must use pi's self-register/ready-ping path (return the id pi actually allocates); preallocate+promote stays for daemon-bound harnesses only. (F-01)
- **D2**: claude snapshot materializes under a fresh focus-owned filename id (claude resolves by filename — proven). (F-02)
- **D3**: sol/sol (not cross-model) per human authority Seq 250 — recorded despite grant's cross-model default.
- **D4**: final acceptance + full `harness checks` deferred until special-finch declares r4 `pij-skill-check` settled (Seq 287). → **CLEARED Seq 290**: r4 accepted, frozen SHA `05f7e8ae…` (15 files), pij-skill-check all green/zero warnings. Final gate unblocked (still pending the coder fix).
- **D5 (baseline caveat for final gate)**: the untracked `.pi-subagents` artifact fails lint + windows-compat **baseline-wide** (pre-existing, NOT s050). My accept decision must exclude this known failure and confirm every OTHER sensor green; a pij-skill-check/lint/windows result attributable only to `.pi-subagents` is not an s050 regression.

## Harness observations (paid forward)
- DL-001: release-age-policy pwsh test load-flake (green standalone).
- DL-002: `just flow-pair-mutate` can't target product suites — blocks the product Dim-0 gate.
- DL-003 (T10): `pij spawn` doesn't thread `PIJ_HOME` into child panes (spawn.ts:85-114) → custom-home children self-register into the DEFAULT `~/.pij`. Not a production-focus bug (focus runs under default `~/.pij`); blocks hermetic `PIJ_HOME` test isolation. **T10 resolution: Path A — private `tmux -L` server with `PIJ_HOME` in its launch env** (no product change, no fence expansion). Executor detected the leak, remediated (removed `pij-willing-condor`, real store restored), stopped for direction — correct discipline. Candidate future work: thread caller `PIJ_HOME` into the child `-e` env (Path B).

## Gates
- Preflight boot: PASS. Coder self-reported all-8-sensors: to be RE-PROVEN post-fix AND post-r4-settle (Seq 287).
- Dim-0 mutation gate: 2 guards RED→GREEN proven by reviewer (subdir invariant; fork-never-resume).
- T10 live smoke (pi+claude relaunch canary): ORCHESTRATOR-OWNED — pending post-fix.

## Changed files (final, this branch vs af7dcc8)
NEW: `core/focus.ts`, `core/focus.test.ts`, `adapters/focus-store.ts`, `adapters/focus-store.test.ts`, `core/harness/transcript.test.ts`, `docs/how/pij-focus.md`
MODIFIED: `core/types.ts`, `core/spawn.ts`, `core/spawn.test.ts`, `core/harness/transcript.ts`, `cli.ts` (+~285 lines, pi self-register focus path), `README.md`
(Excluded/untouched: `.pi/packages.yaml`, `docs/plans/**` except this log + plan checkboxes per Seq 286.)

## Per-task record (honest status — corrects the earlier "mirrored" overstatement)
| Task | Status | Evidence |
|------|--------|----------|
| T01 store/manifest round-trip + T02 subdir guard | ✅ done | focus-store.test.ts; Dim-0 mutation RED→GREEN |
| T03a pi transcript locator (real, non-mocked) | ✅ done | transcript.test.ts real fixture |
| T03 save core + T04 redactor | ✅ done | focus.test.ts (bound-copy, unbound-refusal, gitBranch strip) |
| T05 pi fork arm (supportsBranching(pi)=false) | ✅ done | spawn.test.ts |
| T06 launch plan + T07 boot/cwd guards + immutability | ✅ done (fix round) | focus.test.ts; F-01/F-02/F-03/F-05 fixes + Dim-0 |
| T08 list + AC-10 adapter-unavailable | ✅ done (fix round) | both ops × copilot+codex |
| T09 CLI wiring | ✅ done | cli.ts runFocus; harness checks green |
| T11 docs (README + docs/how/pij-focus.md) | ✅ done | present |
| **T10 live pi+claude relaunch canary** | ✅ **PASS** (orchestrator-owned, delegated + verified) | Path A private tmux server; both harnesses verbatim recall |

All T01–T11 complete. Plan-file checkboxes reconciled to this table.

## T10 live acceptance proof (delegated to pij-vital-tortoise, orchestrator-verified)
- **pi**: plant→save(immutable `-r--------`)→launch→cold recall `RECALL GOLDEN-T10-pi-7Q4X | azure/1789/pangolin` **PASS**. F-01 live: launch returned the child's OWN self-registered id (fork appeared in list under it), not a reserved seed.
- **claude**: same, `RECALL GOLDEN-T10-claude-9K2M | crimson/2718/narwhal` **PASS**. F-02 live: fresh focus-owned materialization id + same-cwd success despite a LIVE donor file; no cross-bind.
- **Immutability**: both snapshots byte-unchanged after launch (AC-04).
- **Containment (independently re-verified by orchestrator)**: real `~/.pij` 1179→1179, no real focus store, no `t10-*` leak; 3 memorable-id collisions with the live fleet were pre-existing and all 3 real namesakes remain PRESENT (teardown was temp-only). GOLDEN-T10 hits = coordination-inbox text only.
- Evidence: `.harness/temp/s050/snapshots/t10/` (99-SUMMARY.md + per-step logs).

## Review outcome — ACCEPTED
Round 1: FIX_REQUIRED (F-01…F-05, AC-10). Round 2: **APPROVE_WITH_NOTES** — all 5 fixes confirmed, Dim-0 RED→GREEN on both criticals, `harness checks` 8/8 (pij-skill-check settled green; suite 2019 passed/11 skipped). Orchestrator sanity pass: F-01 `waitForFocusPiRegistration` verified in cli.ts. **T10 live proof PASS (above).** → **ORCHESTRATOR ACCEPTANCE RECORDED 2026-07-15.** Fleet (coder/reviewer/executor) torn down. **Commit/push/PR remain HELD pending separate authorization (Seq 258).**
