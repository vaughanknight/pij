# Validation 004 — Phase 3 tasks dossier

**Target**: `docs/plans/055-pij-watchdog/tasks/phase-3-isolated-proof-parity-docs/tasks.md`
**Validator**: Opus subagent + validate-v2 (human-ruled pattern)
**Date**: 2026-07-17
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s055-pij-watchdog` (branch `s055/pij-watchdog`)

## Verdict: VALIDATED (1 medium, 0 critical / 0 high)

The dossier is actionable and faithful to the pinned plan. Every phase-specific
gate the task set out was checked and passes except one self-limiting
locate-hint defect (phantom `s051` precedent) worth correcting before
implementation.

## Validation Contract

- **Purpose**: Break plan Phase 3 (rows 3.1–3.5) into executable tasks that
  prove all ten ACs against a temp daemon (never the live one) and ship
  discoverability + the s054 convergence note.
- **Promise**: A coder can execute T001–T009 and produce the AC-09 proof log,
  a green smoke scenario, verb/etiquette/defaults docs, and the convergence
  note — with zero risk to the live `~/.pij` daemon.
- **Proof target**: Implementation-readiness of a tasks dossier.
- **Upstream**: `pij-watchdog-plan.md` (sha pinned), `s054-p2-contract-b36edf0.md`.
- **Consumers**: the implement verb / coder fleet for Phase 3.
- **Sources**: plan Phase 3 + AC map + decisions D1–D8 + risks; cross-stream
  contract; shipped P1/P2 code.

## Deterministic proof run

| Check | Result |
|-------|--------|
| Plan sha pin `14b03626cf3c9dd…` vs `shasum -a 256` | MATCH `14b03626cf3c9ddb942350d40ebb60c1b59a05dcd0c65f206142f3a1a6618345` — no drift |
| Cross-stream contract path + ref (647076a per RE-SYNC banner) | Present; T008 + Exec Briefing use 647076a and name Seq 442/447 — correct |
| `.pi/extensions/pij/core/daemon/watchdog-manager.ts` | Exists (11.7 KB) |
| `.pi/extensions/pij/adapters/watchdog-store.ts` | Exists (dossier path `adapters/watchdog-store.ts` correct) |
| `.pi/extensions/pij/core/watchdog.ts` | Exists |
| daemon.ts:253-257 D4 paneSig attribution guard | REAL (`isPaneChangeWatchdogAttributed`, paneSig gate) |
| core/cli.ts exempt-downgrade rejection (claimed 868-871) | REAL (`pause cannot downgrade a non-expiring exemption`, ~867-873) |
| `DEFAULT_WATCHDOG_INTERVAL_MS` = 1_200_000 | REAL — `20 * 60 * 1_000` = 1,200,000 |
| spawn.ts `--no-watchdog` / `noWatchdog` | REAL (spawn.ts:42/115/532/580) |
| PIJ_HOME isolation is a genuine capability | REAL — `daemon.ts:523 opts.pijHome ?? process.env.PIJ_HOME ?? ~/.pij` (temp-home baton rule is achievable) |
| `core/daemon/loop.ts` exists (SW-6 zero-diff subject) | Exists |
| Commits P1 bb863b0 / P2 de6789a + ff64d91 | All present in git log |
| Gate recipes (`just smoke`/`self-check`/`local-path-check`/`flow-pair-mutate`) | All present in justfile (95/141/103/245) |
| `docs/how/pij-peer-watch.md` sibling precedent | Exists |
| `skills/pij/SKILL.md` + `grep -rl "CLI-verb coverage" skills/` | Resolves to `skills/pij/SKILL.md` |
| **`docs/plans/051-*` (claimed s051 precedent)** | **DOES NOT EXIST — folder list jumps 050 → 055** |

## Phase-3-specific checks (task-directed)

1. **AC coverage (AC-01..AC-10 each → ≥1 task; AC-09 = proof log)** — PASS.
   AC-01/02/03→T002, AC-04/05/06→T003, AC-07/08/10→T004, AC-09→T005 (the proof
   log itself). Matches plan's Acceptance Coverage Map 1:1. AC definitions
   (plan lines 107-144) align with each task's scenario description (e.g.
   AC-06 "exactly once via shared latch" ↔ T003 "exactly ONE stalled notice").
2. **Baton rule (no live-daemon touch; temp PIJ_HOME only)** — PASS. T001
   "start/stop INSIDE the temp home — never the live daemon"; Done-When "zero
   reads/writes of the real ~/.pij"; Non-Goals + Context Brief constraints
   restate it as ABSOLUTE. T004 capture path written `~<temp PIJ_HOME>/…`
   (reinforces temp). T006 smoke + T009 gate both scoped to isolated home /
   worktree. No ambiguity that could route a coder to `~/.pij` found; PIJ_HOME
   override is real (daemon.ts:523).
3. **SW-6 loop.ts untouched** — PASS. Stated twice (Phase-2 gotcha lines 62-63;
   Context Brief domain constraint "core/daemon/loop.ts stays ZERO-diff (SW-6)").
4. **b36edf0 descriptor discipline (no events.ndjson; D7 paneless event-advance-only)** —
   PASS. T002 "assert DESCRIPTOR + pane text evidence"; T003 "assert descriptor
   fields, never events.ndjson"; T004 "paneless: event-advance-only, no pane
   evidence faked"; Context Brief "Never read/tail events.ndjson (b36edf0)".
   Pane evidence is used only for tmux peers (legal); pi peers stay
   event-advance-only.
5. **Fix-or-remove flake on tmux smoke (no retry-loops)** — PASS. T006 Done-When:
   "flake = fix-or-remove (Jordan doctrine), never retry-loops".
6. **File placements / locate-hints** — MOSTLY PASS, one defect (M1 below).
   Proofs under plan folder ✓, smoke in harness/scripts/smoke.ts ✓, docs/how
   sibling pij-peer-watch.md exists ✓, skills/pij/SKILL.md grep-hint resolves ✓.
   Defect: the `s051` temp-daemon precedent pointer is a phantom.
7. **Jordan's three ruled defaults verbatim by T007** — PASS. T007 lists
   "capture defaults 40-line/4KiB anomaly-only + always opt-in, --no-watchdog,
   … pause tiers incl. exempt strength" and Done-When "doc names Jordan's three
   ruled defaults verbatim" — covering (a) explicit pause verbs, (b)
   `--no-watchdog` non-expiring exempt, (c) 40-line/4KiB anomaly-only capture.

## Findings

| Sev | Finding | Evidence | Impact | Smallest fix |
|-----|---------|----------|--------|--------------|
| MEDIUM | Phantom `s051` temp-daemon precedent: dossier tells the coder to "check `docs/plans/051-*/` and mirror" an isolated-PIJ_HOME harness, but no `051-*` plan exists (folder list goes 050 → 055). | tasks.md:72, :122 (T001 Notes), :163 (Reusable — stated as fact); inherited from plan AC-09 (line 140) and Phase 3.1. `ls docs/plans/` has no 051. The real isolated-PIJ_HOME precedent is `docs/plans/046-pij-real-trees/` (grep `PIJ_HOME` hits its plan + tasks + execution logs). | Coder greps a non-existent folder, finds nothing, either reinvents the temp-daemon lifecycle or stalls. Self-limiting (PIJ_HOME override at daemon.ts:523 is real, and 046 is discoverable), so not a blocker. | Repoint the three occurrences to `docs/plans/046-pij-real-trees/` (real isolated-PIJ_HOME precedent), or drop the "if one exists" hedge and say "no committed precedent — build the temp-daemon lifecycle fresh against `daemon.ts` `pijHome`/`PIJ_HOME` override". Human-gated since it also lives in the pinned plan. |

## Notes (non-findings)

- cli.ts exempt-downgrade line range in the dossier (868-871) is off by ~1-2
  lines vs the actual `fail(...)` block (~869-873) — within tolerance, not a
  finding.
- "harness checks (report-only)" in T009 — `harness/` tree present; treated as
  a real report-only gate, not verified end-to-end (out of scope for a tasks
  validation).

**Thesis**: advanced — the dossier proves it will exercise the real P1/P2 code
through a temp daemon and covers every AC, baton, SW-6, and b36edf0 constraint.
The one medium is a stale locate-hint, not a design or coverage gap.
**Consumers**: 1/1 (the Phase 3 coder) — actionable as written once M1 is noted.
