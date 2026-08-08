# Stream s098 — `daemon-perf` — seat record

Recorded so this stream is revivable: a merged PR without the seat that holds the
reasoning behind it is an answer with no way back to the argument.

| | |
|---|---|
| **Seat id** | `pij-related-anglerfish` |
| **Harness** | copilot (`claude-opus-5`) |
| **Role** | PM, stream `daemon-perf`, wave `w1-hardening` |
| **Prime** | `pij-continuing-ermine` |
| **Worktree** | `/Users/jordanknight/pi-hacking/pij-worktrees/s098-daemon-perf` |
| **Branch** | `s098/daemon-perf` |
| **PR** | [#184](https://github.com/AI-Substrate/pij/pull/184), merged 2026-08-08T05:38:59Z as `9590dfc` |
| **Charter** | `~/.pij/pij-continuing-ermine/briefs/07-daemon-perf.md` (investigation-first; no production code) |
| **Ledger block** | `F-700`–`F-705`, `W-700`–`W-701`, `S-700`–`S-702` in `docs/how/fleet/ledger.md` |

## What this stream established

The daemon tick is **linear in the working set**, and two lines are 79% of it:

- `daemon.ts:292` — the `lastTickAt` heartbeat fsyncs a full identity-claiming registry
  publish per daemon-owned descriptor. All 132 registry writes in a tick come from this one
  line. **52.5%** ([#180](https://github.com/AI-Substrate/pij/issues/180))
- `core/daemon/runtime-axis.ts:116` — one `ps` subprocess per descriptor carrying a pane,
  548 of 549. **26.2%** ([#181](https://github.com/AI-Substrate/pij/issues/181))

Also filed: [#182](https://github.com/AI-Substrate/pij/issues/182) (staleness verdicts measure
how long since the *observer* looked, so a slow tick manufactures false "stalled" alerts) and
[#183](https://github.com/AI-Substrate/pij/issues/183) (`~/.pij` is 1.7G with no retention
bound).

**The correction that matters most for anyone scoping a fix**: `eligible()` is *not* the
performance mechanism. It does no I/O, never appears in the profile, and `isAlive(pid)` already
retires 511 of 549 corpses. The coupling between the liveness defects and the performance
defect is `registry.list()` **breadth**, not the watchdog. Do not sell an `eligible()` change
as a performance fix.

## Reproducing the measurements

Harnesses are in `docs/plans/098-daemon-perf/bench/` and run against an **isolated clone** of
`~/.pij`; none touches the live home, and `growth-law-realio.ts` stubs every *mutating* tmux
method so a profile can never type into a pane or kill one. Full method, evidence and citation
verification: `docs/plans/098-daemon-perf/findings.md`.

Known trap for whoever picks this up: a linked worktree has no `node_modules`, and
`npm install` currently fails with `--min-release-age cannot be provided when using --before`.
Symlink the main checkout's `node_modules` (ledger `F-700`).
