# Fix FX001: Control-plane trio — --task delivery, cross-repo self, --layout

**Created**: 2026-07-03
**Status**: Complete — all four tasks done, all acceptance boxes live-verified 2026-07-03
**Plan**: docs/plans/029-pij-agents-minih (control-plane domain)
**Source**: plan 030 Phase-1 retro record `.harness/records/retro/2026-07-03/002-030-pij-router-skill-phase-1.md` (DL-002, DL-003, SUGG-001 — all live-hit during dogfooding)
**Domain(s)**: pij-control-plane (modify)

## Problem

Three live-proven control-plane defects: (1) `pij spawn --task` sets `PIJ_SPAWN_TASK` env that only pi children read — daemon-bound claude/copilot/codex peers silently never receive the task (2/2 dogfood failures); (2) `selfId()` folder-filters the registry before `resolveSelf`'s pane match, so cross-repo calls lose `spawnedBy` → reports die `E-NOREPORTTARGET`, once-mode never auto-closes; (3) spawn placement follows the attached tmux client's session — peers land in "random" windows with no caller control.

## Proposed Fix

(1) Queue `--task` into the new peer's inbox at spawn (same `FsChannel.deliver` mechanism as agent packets; daemon injects after bind). (2) Pane-first self-resolution against the FULL registry (pane ids are server-global) before the folder-filtered fallback. (3) `--layout right|below|window` on `pij spawn` + `pij agent spawn` (`window` uses the existing `TmuxAdapter.newWindow`; `headless` deferred — needs a pty-less runner, out of scope).

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | FX001-1 | Pane-first `selfId()` | pij-control-plane | .pi/extensions/pij/core/cli.ts | cross-repo `pij agent spawn` stamps spawnedBy; unit test | DL-003 |
| [x] | FX001-2 | `--task` → inbox for daemon-bound spawns | pij-control-plane | .pi/extensions/pij/cli.ts | live: claude spawn --task receives task post-bind | DL-002 |
| [x] | FX001-3 | `--layout right\|below\|window` (spawn + agent spawn) + `planPlacement` pure fn + usage text | pij-control-plane | .pi/extensions/pij/core/spawn.ts, cli.ts | unit tests for planPlacement/parse; live: `--layout window` lands in caller's session | SUGG-001 |
| [x] | FX001-4 | Targeted tests green + `just self-check` + daemon restart + live verify all three | — | — | evidence in log | daemon: tsx, no hot-reload |

## Acceptance

- [x] `--task` on a claude spawn arrives as the peer's first post-bind turn (transcript hit)
- [x] `cd <other-repo> && pij agent spawn --once …` completes report round-trip + auto-close
- [x] `--layout below` stacks under main; `--layout window` opens a window in the caller's session; default unchanged; explicit right/below at cap → E-FULL
- [x] `pij-skill` peer.md updated: --task un-marked as broken (now supported), --layout documented

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
