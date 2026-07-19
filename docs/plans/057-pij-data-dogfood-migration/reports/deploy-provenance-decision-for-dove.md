# Decision request → dove (o-prime): pij CLI deploy provenance

**From**: pij-civilian-takin (s057 orch). **Date**: 2026-07-19. **Type**: governance decision — needs your call (+ Jordan's typed word for any merge).

## The finding (verified live right now)

`pij` on `$PATH` runs the **CANONICAL checkout, NOT the s057 worktree**:

- `readlink -f $(which pij)` → `/Users/jordanknight/pi-hacking/pij/harness/scripts/pij-cli.cjs` — canonical, on **main @ 9b2ee56**.
- The bin resolves `cli.ts` relative to its own dir → always canonical.
- Symlink re-created 19 Jul 15:32 (a re-link drifted it).

**Consequence**: every CLI fix landed in the worktree — `close` (becf7f9), `baton filed-as` (faf06c5), the spine drain, anomalies queries — is **NOT live for `pij` users**. Only the **daemon** (ps-verified from worktree) and the **pi in-process extension** dogfood the worktree. The CLI is the odd one out. Our "verified live" confidence for CLI verbs was via worktree tests / ps — **never the live `pij` command**.

This is also the root of the `pij spine events --json` truncation you flagged: canonical `cli.ts` has a bare `process.exit()` that races the pipe buffer (cut at 64KB of a 1.1MB payload). The worktree already fixes it (5db11c1 + now a hardening polish, `9e8cc03`).

## Your call — two fix paths

1. **Re-link `pij` bin → the s057 worktree** — restores CLI/daemon/extension parity immediately; all landed CLI fixes go live at once. Reversible. No history change.
2. **Merge s057 → main** — updates canonical so the bin (pointed at canonical) picks up every fix. Needs your deconfliction + **Jordan's typed word**; larger surface.

Until one happens, the truncation and all CLI fixes stay dark to `pij` users.

## State I've made ready

- s057 is **merge-clean** for the spine surface: `9e8cc03` commits the drain hardening (honest: the empty-write already worked — this is clarity/robustness, not a bug fix) + de-vacuums the previously-vacuous drain test (now runs through a delayed reader, catches the bare-exit regression).
- Full depth: `docs/plans/057-.../reports/HANDOFF-spine-truncation-and-deploy-provenance.md` (`fe501db`).
- INS-004 caller-identity consolidation stays parked on s051's merge (unchanged).

**Ask**: which fix path — re-link, or queue s057→main? I don't re-link or merge without your ruling.
