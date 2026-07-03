# Phase 3 — Agent pack as peer (`pij agent spawn`) · Execution Log

Delegation: dlg-0003 · Implemented: 2026-07-03

## Summary

All of Phase 3 implemented TDD (red → green) with `just self-check` exiting 0
(typecheck + lint + 114 test files + smoke + report-only pkg audit + snapshots).

## Task-by-task

- **T001 `peer-packet.ts`** — `renderPeerPacket(pack, params, opts)` reads
  prompt.md (frontmatter stripped via minih `parseFrontmatter`) + instructions.md +
  output-schema.json from the pack dir; renders the coerced params and the **literal**
  `REPORT_COMMAND` (`pij agent report --json '<json matching the schema below>'`) with
  the schema inlined when present. `boundary.test.ts` extended to explicitly assert the
  two new pure files are scanned. 5 tests.
- **T002 `report.ts`** — `validateReport(payload, schemaJson?)` wraps minih
  `validateOutput` (which takes file **paths**) by materialising payload + schema to
  temp files; no schema → `{valid:true}` pass-through; AJV lines verbatim; never throws.
  5 tests.
- **T003 `cli-args.ts`** — `spawn`/`report` added to `AgentSubverb`; `spawn` takes
  slug/`--prompt` + `-p` + `--once` + overrides; `report --json '<payload>'` consumes a
  VALUE for the report subverb only (plain `--json` stays boolean elsewhere); `--once`
  scoped to spawn. `dispatchAgent` gets a defensive spawn/report case (bin intercepts).
  +14 tests.
- **T004 `types.ts`** — additive optional `SessionDescriptor` fields: `agentPack`,
  `agentPackDir`, `agentOnce`, `reportedAt`. `lifecycle` untouched. tsc green.
- **T005 `agent-peer.ts` (pure)** — `buildAgentPeerEnv`, `permissionsAdvisory`,
  `extractLifecycle` + `lifecycleFor` (flag > frontmatter > resident), `planOnceClose`
  (`agentOnce && reportedAt`). 15 tests (precedence + once-close truth tables).
- **T006 spawn** — `prepareAgentSpawn` (pure-ish: resolve pack / inline synth,
  **AJV input validation before any pane**, derive harness/model/effort, advisory,
  lifecycle, render packet) + `finalizeAgentSpawn` (write descriptor with agent fields,
  copy output-schema, write packet.md, deliver pointer to the new peer's inbox) live in
  `agent-peer.ts`; the bin's `runAgentSpawn` (cli.ts) mints the id, resolves the caller,
  does the tmux split (`spawnAgentPane`), and wires the two. `agentOnce` derives from
  `lifecycleFor` (never the raw flag) so a frontmatter `lifecycle: once` is honoured.
  `pij spawn --agent <slug>` alias = pure `aliasAgentSpawnArgs` in core/spawn.ts,
  dispatched in `main()`. Effect tests in `agent-peer.test.ts` (bad input → no
  finalize; descriptor fields; frontmatter-once → agentOnce true; packet written;
  pointer in inbox; spawnedBy stamped; advisory-once) + alias tests in `spawn.test.ts`.
- **T007 report** — `executeAgentReport(self, payload, deps)` resolves self's
  descriptor → `spawnedBy`, validates against `~/.pij/<self>/output-schema.json`,
  pushes a valid report to the spawner + stamps `reportedAt`; invalid → nothing
  delivered; repeatable. Bin `runAgentReport` resolves self via `resolveSelf`
  (`PIJ_SESSION_ID`, **not** a new `PIJ_SELF`). Effect tests: no-descriptor,
  no-spawner, invalid-blocked, valid-delivered+stamped, second-delivers.
- **T008 daemon `--once`** — added `killPane` to `DaemonPorts` + `DaemonTmux`; the
  tick calls `planOnceClose(d)` → `killPane` + `registry.remove` (+ latch cleanup),
  guarded so resident / un-reported-once / non-agent descriptors are untouched. 4
  fixture tests (load-bearing: flips when the guard is removed).
  **NOTE (fleet addendum):** the shared daemon was NOT restarted — it still runs the
  pre-T008 tick off source. Daemon restart is orchestrator-owned; flagged in the report.
- **T009 live gate** — `peer.live.test.ts` (`describe.skipIf(!PIJ_AGENT_LIVE)`)
  written in full: the resident leg (spawn flowspace-search → descriptor/packet/pointer
  asserted → poll the spawner inbox for the schema-valid report → `pij send` follow-up →
  peer stays resident) rides the live daemon as-is; the `--once` auto-close leg is
  `it.skip` with a **DAEMON-RESTART-PENDING** marker because it needs the T008 tick the
  running daemon hasn't loaded. **NOT run live in this delegation** (fleet rule: don't
  restart the daemon / touch the fleet); deferred to the orchestrator post-restart —
  hence `[~]`, not `[x]`.
- **T010 docs** — `docs/how/pij-agents.md` § "Spawn mode — a pack as a pij peer"
  (verbs, packet, report round-trip, lifecycle table, permissions posture + advisory,
  errors table, alias, live gate); AGENTS_README + RUNBOOK quick-start lines. Workshop
  003 linked as the contract.

## Gates

`just self-check` → exit 0. `just test` (full): 114 files, 925+ pass, live gate skipped.

## Deferred to orchestrator

1. **Daemon restart** so the running daemon picks up the T008 `planOnceClose` tick.
2. **Live gate run** (`PIJ_AGENT_LIVE=1 npx vitest run peer.live` with a resolvable
   `PIJ_SESSION_ID`) — resident leg now, `--once` leg after the restart.

## Fix iteration — rev-0004 (FIX_REQUIRED: 2 HIGH, 1 LOW)

- **Finding 1 (HIGH) — daemon descriptor lost-update clobbered `reportedAt`.** The
  tick rebuilds its index at tick start, then derives an activity/failure write from
  that stale snapshot and `registry.write`s the whole JSON — clobbering the `reportedAt`
  that `executeAgentReport` stamps mid-tick from the peer's own pane (a *different*
  process). The peer flips working→idle at report time, so the activity write is
  near-guaranteed. `planOnceClose` never latched → `--once` peers stayed open forever.
  **Fix:** new `writeMerged(registry, computed)` in `core/daemon/loop.ts` — re-reads the
  latest on-disk descriptor and carries forward any externally-owned field (`reportedAt`)
  the daemon's snapshot-derived value lacks, then writes and returns the merged value.
  Routed **every** daemon descriptor write through it: `daemon.ts` activity write + all
  4 failureReason writes (dead/stalled/provider-set/provider-clear), and `loop.ts`
  bind-flow writes (initInjected/bind-planned/bind-discovered/fail). The loop.ts writes
  are provably pre-report (`driveSession` runs only for `lifecycle: pending` sessions,
  which can't have reported), but routed uniformly for structural safety.
  **Regression (unit):** `daemon.test.ts` "preserves a reportedAt stamped concurrently
  mid-tick, then auto-closes next tick" — a `capturePane` side effect stamps `reportedAt`
  on disk between index rebuild and the activity write (exactly where the real report
  lands); RED on the old code (reportedAt undefined after tick 1), GREEN on the fix, and
  the next tick auto-closes. Plus 4 focused `writeMerged` contract tests in `loop.test.ts`.
- **Finding 2 (HIGH) — live report assertions polled daemon-drained evidence.** The
  daemon `rmSync`s each report message file the instant it injects it into the driver's
  pane, so polling `inboxBodies(self)` is a race the daemon always wins (both live legs
  failed while the product worked). **Fix:** assert on the DURABLE `reportedAt` stamp on
  the *peer's own descriptor* (never drained; Finding 1 keeps it) via a `hasReported(id)`
  helper. Resident leg polls `hasReported(meta.id)`; once leg accepts `reportedAt` **or**
  an already-removed descriptor (the auto-close can win the race, and removal itself
  proves the report). Dropped the transient inbox-pointer assertion (packet.md existence
  is the durable proof) and removed the now-unused `inboxBodies`/`readdirSync`.
- **Finding 3 (LOW) — DOCS ONLY.** Documented the split-cap constraint: `spawn` always
  splits right and `E-FULL`s at the pane cap (run from a scratch window / `TMUX_PANE`
  override). Added to the `peer.live.test.ts` header + a **Pane placement** note and an
  `E-FULL` row in `docs/how/pij-agents.md`. No layout option built (Phase 4 scope).

## Fix gates

`just self-check` → exit 0. New: 1 concurrent-writer regression + 4 writeMerged unit
tests. Fleet rules honoured: daemon NOT restarted, no live legs run, no fleet panes
touched. Live re-verification (both legs, post daemon-restart) remains orchestrator-owned.
