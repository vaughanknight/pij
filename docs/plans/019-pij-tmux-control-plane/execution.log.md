# Execution Log — pij tmux Control Plane (Plan 019, Simple mode)

One Simple-mode phase, implemented by task group (A–H). Each entry: what changed,
the proof, and any discovery. Testing approach: Hybrid — TDD (real fakes) for the
pure core (ⓣ), lightweight Driver smoke for impure seams (ⓢ).

---

## Group A — foundation (T001–T003)

### T002 — ⓣ Shared `tmux-keys` primitives + tests
- **Files**: `.pi/extensions/pij/adapters/tmux-keys.ts` (+ `.test.ts`).
- **What**: Extracted the send-keys/paste/capture layer of the tmux seam into one
  argv-only lib operating on a raw pane **target string** (`%N` or `session:win.pane`):
  `typeLiteral` / `pressKey` / `pasteBuffer` (bracketed) / `capturePane`. The tmux
  invocation is an injectable `TmuxRunner` so tests assert exact argv against a fake
  recorder — no tmux spawned. Argv matches both `harness/driver/tmux.ts` and the live
  `probe.sh` (`send-keys -t … -l <text>`, `send-keys -t … Enter`, `capture-pane -p -J`).
- **Proof**: `tmux-keys.test.ts` — 11 specs (literal payload not shell-split; Enter/Escape;
  `-N` repeat; bracketed `-p`; capture `-J`/scrollback/ansi/join:false).

### T003 — Re-delegate the harness driver to the shared lib (parity)
- **Files**: `harness/driver/tmux.ts`.
- **What**: `type`/`press`/`paste`/`capture` now delegate to `typeLiteral`/`pressKey`/
  `pasteBuffer`/`capturePane` (via `targetStr(t)`). One argv implementation; the driver's
  `Target`-based public surface is unchanged, so the harness test suite is unaffected.
- **Discovery (Noteworthy)**: the shared lib lives under `.pi/extensions/pij/adapters/`
  per the Domain Manifest, so `harness/driver/tmux.ts` imports *up and over* into the
  extension tree (`../../.pi/extensions/pij/adapters/tmux-keys.js`). Same package, NodeNext —
  resolves fine; it inverts the historical "harness owns tmux" direction, which the plan
  intends (single source of truth for argv).

### T001 — `pij-control-plane` domain doc + register
- **Files**: `docs/domains/pij-control-plane/domain.md` (new); `docs/domains/registry.md`,
  `docs/domains/domain-map.md` (node `PCP` + 3 edges + Health Summary rows + History).
- **What**: New domain documenting the control-plane boundary (owns daemon/transport/
  binding/readiness; excludes `pi.sendUserMessage`, wire framing, user-file watching).

**Group A proof**: `npm run typecheck` clean; `tmux-keys.test.ts` 10/10; Biome clean.

---

## Group B — identity + spawn descriptor (T004–T006)

### T004 — ⓣ `SessionDescriptor` control-plane fields (migration-safe)
- **Files**: `core/types.ts`, `adapters/fs-registry.test.ts`.
- **What**: Added `harness?: HarnessKind`, `harnessSessionId?`, `initInjectedAt?`, and a
  spawn-lifecycle field. **Decision (Noteworthy)**: the plan named the new field `state`,
  but `SessionDescriptor.state` already exists as the live-turn `working|idle` signal —
  widening it would break `persist({state:"working"})` and the idle/working reads. So the
  spawn lifecycle is a **separate** field `lifecycle: "pending"|"ready"|"bound"|"failed"`,
  documented as distinct from `state`. `HarnessKind`/`SessionLifecycle` live in `types.ts`
  (shared vocabulary) so `pij-messaging` needn't import from `pij-control-plane` (clean
  dependency direction). All new fields optional ⇒ migration-safe.
- **Proof**: `fs-registry.test.ts` — new fields round-trip; a pre-019 descriptor (none of
  the new keys) still parses with the new fields `undefined`.

### T005 — ⓣ Pre-allocate `pij-id` before launch
- **Files**: `core/spawn.ts`.
- **What**: `allocatePijId(spawnToken, pid)` seeds the existing `deriveSelfId` with the
  daemon's spawn token — a non-pi harness can't mint its own id, so the daemon allocates it
  up front (known before the pane exists) and `buildControlSpawnCommand` threads it via
  `PIJ_SESSION_ID` (+ `PIJ_HARNESS`), so the agent's later `pij phonehome` self-resolves to
  the same id. **Deviation (Noteworthy)**: the plan listed `core/session.ts`; left untouched
  — the pi-spawn path in `PijSession.spawn` is unchanged, and control-plane spawn is daemon-
  orchestrated (Groups E/F), so the pure builders belong in `spawn.ts` only.
- **Proof**: `spawn.test.ts` — id deterministic + `pij-`-prefixed pre-launch; distinct tokens → distinct ids; env carries the id.

### T006 — ⓣ Spawn builds the pending descriptor (paneId from split `-P`)
- **Files**: `core/spawn.ts`.
- **What**: `buildPendingDescriptor(...)` produces `(id, paneId, cwd, harness, lifecycle:"pending")`.
  The atomic write is the existing `FsRegistry.write` (tmp+rename); the impure split→paneId→write
  orchestration lands in the daemon (Groups E/F).
- **Proof**: `spawn.test.ts` — pending descriptor shape; not-yet-bound (no `harnessSessionId`/`initInjectedAt`).

**Group B proof**: `npm run typecheck` clean; `spawn.test.ts` 37/37 + `fs-registry.test.ts` 8/8; Biome clean.

---

## Group C — classifiers (T007–T009)

### T007 — ⓣ `HarnessKind` + transport-selection
- **Files**: `core/harness/types.ts`.
- **What**: `selectTransport(harness)` → `inbox` (pi) | `sendkeys` (claude/copilot). Encodes
  the one immovable seam: only pi keeps the in-process inbox; everything else is send-keys.
  Re-exports `HarnessKind` from `core/types.ts`.
- **Proof**: `harness/types.test.ts` — table-driven (3 kinds) + the pi-only-inbox invariant.

### T008 — ⓢ→ⓣ Readiness gate (R-01 frozen into a classifier)
- **Files**: `core/readiness.ts`.
- **What**: `classifyReadiness(paneText)` → `booting|interstitial|ready|busy|dead`. The R-01
  markers from the live prototype are frozen here (one version-sensitive classifier):
  `ready` = footer `auto mode on`/`shift+tab to cycle` AND not busy; `busy` = `esc to
  interrupt` (negative guard wins even if a footer marker co-occurs); interstitial delegates
  to T009; `dead` is a best-effort text signal (authoritative death = tmux `pane_dead`, daemon).
  **This is the F6 gate** — the marker is now frozen before the daemon/transport tasks (D+).
- **Proof**: `readiness.test.ts` — real prototype fixtures (ready footer / busy / booting /
  chrome-interstitial / dead); busy-guard-wins case.

### T009 — ⓣ Interstitial classifier (dismiss vs needs-human)
- **Files**: `core/interstitial.ts`.
- **What**: `classifyInterstitial(paneText)` → `{ action: dismiss|needs-human|none, label }`.
  Chrome-extension prompt → dismiss (Esc); folder-trust / login → needs-human (never auto-
  answered). NEEDS-HUMAN is matched first so a trust prompt that also shows "Enter to confirm"
  is never mis-dismissed (the load-bearing prototype discovery).
- **Proof**: `interstitial.test.ts` — chrome→dismiss; trust(+"Enter to confirm")→needs-human;
  login→needs-human; ready-footer→none.

**Group C proof**: `npm run typecheck` clean; readiness 6 + interstitial 4 + transport 4 = 14/14; Biome clean.

---

## Group D — claude transport + deterministic binding (T010–T012)

### T010 — ⓣ Claude transport: mangle + transcript dir + **new-path discovery**
- **Files**: `core/harness/claude.ts` (+ `.test.ts`).
- **What**: `mangleCwd` (`/[^a-zA-Z0-9]/g → '-'`), `transcriptDir(home,cwd)` →
  `~/.claude/projects/<mangled>/`, `transcriptSessionId(path)` (basename stem),
  and `discoverNewTranscript(before, after)` → `found|pending|ambiguous`. Plus
  `buildInitInjection(pijId)` (the once-only init body + the standalone
  `pij phonehome` confirm line the watchdog re-sends). Discovery keys on **new
  path appearance** (set-difference of `*.jsonl` paths), never mtime.
- **Decision (Noteworthy)**: the plan's finding-07 pointed at a reusable
  `claude-adapter.ts:59-66` mangle — that file no longer exists in this repo, so
  the mangle was re-derived and **pinned to telemetry by test** against the live
  `~/.claude/projects` tree (`-Users-jordanknight-pi-hacking-pij`, `…-github-jk-claw`).
- **Proof**: `claude.test.ts` — mangle/dir/stem parity; the load-bearing case
  (a pre-existing active transcript in the same cwd is **never** chosen → pending);
  one-new→found; two-new→ambiguous; non-jsonl noise ignored. 10 specs.

### T011 — ⓣ Deterministic binding + watchdog + creator notice
- **Files**: `core/binding.ts` (+ `.test.ts`).
- **What**: pure lifecycle decisions — `applyBinding` (→ `lifecycle:"bound"` +
  `harnessSessionId`), `shouldInjectInit`/`markInitInjected` (init-exactly-once
  via persisted `initInjectedAt`, survives restart), `markFailed`, the
  `evaluateWatchdog` state machine (`bound|wait|resend-phonehome|fail` — two
  timeout windows; the re-send is the **confirm line only**, never the init body,
  so `initInjectedAt`/init-once hold per AC-04), and `buildBoundNotice`/
  `buildFailedNotice` (→ `spawnedBy`, `null` when no creator).
- **Proof**: `binding.test.ts` — bind/init-once/fail transitions; watchdog
  windows incl. fail-after-resend; creator notices incl. the no-creator null. 11 specs.

### T012 — ⓣ `pij phonehome` verb (confirmatory)
- **Files**: `core/cli.ts` (+ `core/cli.test.ts`).
- **What**: new verb `pij phonehome [--json]` — resolves self (PIJ_SESSION_ID),
  reads `CLAUDE_CODE_SESSION_ID`, and **confirms/creates** the binding via
  `applyBinding` + `registry.write` (idempotent; converges on the same id the
  daemon's transcript-discovery finds, and resolves the ambiguous concurrent-boot
  case). `--json` emits `{id,harness,harnessSessionId,lifecycle,confirmed}`. The
  thin bin needs no change — it dispatches generically.
- **Decision (Noteworthy)**: phonehome **writes the descriptor directly** (vs an
  inbox the daemon drains). Discovery is primary and both paths converge on the
  identical `harnessSessionId` (= the transcript stem = `CLAUDE_CODE_SESSION_ID`),
  the `FsRegistry` write is atomic (tmp+rename), and T014's index-state rebuild
  reads from `~/.pij/` — so a direct confirmatory write is safe and last-write-wins
  is a no-op.
- **Proof**: `cli.test.ts` — parse (bare/`--json`/reject pos+unknown flags);
  dispatch binds+persists from `CLAUDE_CODE_SESSION_ID`; idempotent re-run;
  no-env → `confirmed:false`; E-NOID on missing self. +5 specs (20 total).

**Group D proof**: `npm run typecheck` clean; `claude` 10 + `binding` 11 +
`cli` 20 green; Biome clean; **full suite 769 passed / 4 skipped / 0 fail** —
no regression from the new verb or import.

---

## Group E — the daemon switchboard (T013–T017)

### T013 — ⓣ Router + delivery ownership + pre-bind buffer
- **Files**: `core/daemon/router.ts`, `core/harness/pi.ts` (+ `.test.ts`).
- **What**: `route(target, message)` → `inject|buffer|observe`; `injectionText`
  (command→`/compact`, text verbatim); `SendBuffer` (FIFO per target, flush on
  bind, R-02). `pi.ts` owns the immovable seam as `daemonOwnsDelivery(harness)`
  (true for sendkeys, false for pi). AC-07/08 encoded as pure decisions.
- **Proof**: `router.test.ts` 10 (pi→observe, legacy→observe, bound→inject,
  `/compact`→inject, unbound→buffer, no-pane→buffer, FIFO flush) + `pi.test.ts` 2.

### T014 — ⓣ Daemon index-state (rebuild from ~/.pij/)
- **Files**: `core/daemon/index-state.ts`.
- **What**: `IndexState` indexes by id / harnessSession / pane; `pending()`,
  `needsInit()` (from the persisted `initInjectedAt`), `rebuild()` total + pure
  → a restart loses no binding and duplicates no init (AC-12).
- **Proof**: `index-state.test.ts` 5 (3-way index, pending filter, init-marker
  survives restart, stale pane/harness mappings dropped on rebuild).

### T015 — ⓣ Single-instance lock
- **Files**: `core/daemon/lock.ts`.
- **What**: `evaluateLock(existing, isAlive, selfPid)` → `acquire|refuse|reclaim`
  (no lock / own pid → acquire; live holder → refuse; dead holder → reclaim) +
  `parse/serializeLockFile` (corrupt → acquirable). AC-10.
- **Proof**: `lock.test.ts` 6 (round-trip, corrupt→null, the 4 decisions).

### T016 — ⓢ The daemon loop + bin
- **Files**: `core/daemon/loop.ts`, `daemon.ts`, `adapters/daemon-tmux.ts` (+ tests).
- **What**: `driveSession()` — the spawn→bind state machine, composing the
  TDD'd pure pieces (readiness/interstitial classify → dismiss Esc | needs-human
  notify | init-once inject | new-transcript bind | watchdog resend→fail | creator
  notice). `Daemon.tick()` rebuilds the index, drives pending tmux spawns, drains
  bound tmux inboxes (receipts never injected), flushes buffers on bind.
  `runDaemon()` takes the single-instance lock, runs the timer, releases on stop.
  `DaemonTmux` is the real impure seam (tmux-keys capture/send + `#{pane_dead}` +
  transcript listing), every read best-effort.
- **Deviation (Noteworthy)**: the plan put it all in `daemon.ts`; the testable
  orchestration was split into `core/daemon/loop.ts` (deps-injected, unit-tested
  with fakes) so the bin stays thin glue — keeps the hexagonal discipline.
- **Proof (unit)**: `loop.test.ts` 9 (every state-machine branch incl. the
  load-bearing "never bind the pre-existing transcript" + the two-window
  watchdog) + `daemon.test.ts` 3 (real tmp `~/.pij`: drive→init-inject, bound
  inbox drained, **pi inbox NEVER drained** — AC-08 live).
- **Proof (LIVE smoke, claude v2.1.195 / Opus 4.8)**: spawned a real claude in a
  tmux split-right; the **real** `DaemonTmux` + frozen classifiers read `ready`
  at the live footer marker; init injected via real send-keys; **deterministic
  binding picked the newly-appeared transcript `9b58ec18-…jsonl`, not any of the
  4 pre-existing transcripts in the same cwd** (AC-03 proven against the live
  harness); claude replied `PIJ-SMOKE-OK` (inject+capture round-trip); pane torn
  down. RESULT: BOUND ✅. The R-01 markers, the mangle, the discovery and the
  daemon loop all hold against real Claude Code.

### T017 — Thin the extension to own-inbox receiver only
- **Files**: `index.ts` (doc).
- **What**: the per-session receiver already watches ONLY `self`'s inbox
  (`channel.watch(self, …)`) — so the "thinning" is satisfied by construction;
  the daemon takes over cross-session tmux delivery and only *observes* pi
  inboxes. Made the delivery-ownership boundary explicit in a comment (finding
  01/06, AC-08): this in-process receiver is the SOLE consumer of a pi inbox.
- **Proof**: `daemon.test.ts` "pi inbox NEVER drained" is the cross-check; pi↔pi
  unregressed (full suite green).

**Group E proof**: `npm run typecheck` clean; new pure tests router 10 + pi 2 +
index 5 + lock 6 + loop 9 + daemon-bin 3 = 35; Biome clean; **full suite 804
passed / 4 skipped / 0 fail**; **plus the live claude+tmux end-to-end smoke
(BOUND ✅)**.

---

## Group F — integration + the code-review DOGFOOD (T018/T019/T022 done; T020/T021/T023 next)

### T018 — ⓢ `pij spawn --harness claude` (returns the id immediately)
- **Files**: `core/spawn.ts` (`parseSpawnArgs`, `transcriptsAtSpawn`), `cli.ts` (`runSpawn`).
- **What**: `pij spawn --harness claude [--task …] [--model …] [--json]` — splits a
  pane right under a PRE-ALLOCATED pij-id (`buildControlSpawnCommand`), records the
  pane's `#{pane_pid}` + a **spawn-time transcript snapshot**, writes the `pending`
  descriptor, and returns the id at once. The running daemon drives ready→bound.
- **Proof (LIVE)**: `pij spawn --harness claude --json` → `{id:pij-…,lifecycle:pending}`
  returned immediately (no boot block); the daemon logged `injected-init` → `bound ↔
  7643acea-…` within ~2–4s; `pij state` flipped pending→bound automatically. + unit:
  `parseSpawnArgs` 3 specs.

### T019 — ⓢ Ungated `pij send` to a claude target (send-keys + Enter)
- **Proof (LIVE)**: `pij send <claude-id> "<text>"` → the daemon drained the inbox and
  injected via send-keys+Enter; the bound claude received it, submitted, and replied
  (`PIJ-SEND-OK`). The injected **init** also worked: claude ran `pij phonehome` itself
  and self-confirmed the binding (the confirmatory path, AC-02/03, live).

### T022 — ⓣ `pij tail <pij-id>` streams a bound claude transcript
- **Files**: `core/harness/claude.ts` (`transcriptPathFor`, `summarizeTranscriptLine`),
  `cli.ts` (`tailTranscript`).
- **What**: a bound claude writes a JSONL transcript (not pij's events.ndjson), so tail
  resolves `~/.claude/projects/<mangled>/<sid>.jsonl` and renders `[role] text` (tool
  calls → `⚙ name`); `--follow` polls.
- **Proof (LIVE)**: `pij tail <claude-id>` showed the live conversation (init → `⚙ Bash`
  for phonehome → binding confirmed → send → reply). + unit: 4 specs.

### DOGFOOD — the code review, run THROUGH the control plane (the headline goal)
- Spawned Opus 4.8 in a tmux split, tasked it to review the new Plan 019 code, and
  tracked it two ways the user asked for: **`pij tail`** (watched it read files + narrate)
  and **file-change watch** (the review file appearing). It wrote
  `reviews/dogfood-review.md` (139 lines) — a real, file:line-specific review.
- **The dogfood found a real HIGH bug + MEDIUMs, now fixed**:
  - **H1 (HIGH)** — the `before` snapshot was taken on the daemon's first tick, racing
    Claude's early transcript write → deterministic discovery (AC-03) could systematically
    miss. **Fix**: snapshot at spawn (before the pane exists), persist `transcriptsAtSpawn`
    on the descriptor, seed `drive.before` from it. **Confirmed live**: a fresh spawn
    captured 7 transcripts at spawn and bound deterministically to the new one even though
    Claude's transcript already existed by the first tick.
  - **M1** — `SendBuffer.flush` could drop buffered sends when a bound session had no pane;
    guard the flush itself (R-02).
  - **M2** — the single-instance lock had a read→write TOCTOU; now an atomic `O_EXCL` (`wx`)
    create with EEXIST→evaluate(refuse|reclaim) (AC-10).
  - **M3** — a pane `busy` *before* init wrongly started the watchdog; now the clock anchors
    only once init is injected.
  - **M4** — `ambiguous` discovery (concurrent boots) is now a distinct `DriveOutcome`/log
    rather than masquerading as a timeout. (L3 dead-param also dropped.)
- **Proof**: +3 regression specs (H1 seed-from-descriptor, M3 no-anchor-pre-init, M4
  ambiguous); full suite **814 passed / 4 skipped / 0 fail**.

### Remaining (next turns)
- **Group F tail** — T020 (mid-turn `send-keys` R-02 observation), T021 (claude→pi delivery +
  pi↔pi no-regression), T023 (`pij adopt <pane>` — own discovery rule).
- **Group G** — chalk TUI (AC-11), `pij daemon` verb, two-harness smoke, operator guide
  (`docs/how/pij-daemon.md`), domain-map Health Summary finalize (T028).

### EXT — GitHub Copilot CLI as a second control-plane harness (post-plan extension)
Original plan listed `copilot` as *reserved / Non-Goal*. Added it as a real driven
harness (v1.0.66), live-verified end-to-end against the daemon.

- **Spawn** (`pij spawn --harness copilot`): emits `copilot --yolo --session-id <uuid>`.
  `--yolo` (= --allow-all-tools/paths/urls) is the Copilot analog of claude's
  `--dangerously-skip-permissions` (driven pane, no human to approve). `core/spawn.ts`
  `buildControlSpawnCommand` + `ControlSpawnInput.copilotSessionId`.
- **Deterministic, race-free binding** — the key asymmetry vs Claude: `--session-id`
  **SETS a new session's UUID**, so pij CHOOSES the id at spawn (`randomUUID()` in the
  bin), persists it as `SessionDescriptor.plannedHarnessSessionId`, and the daemon binds
  to it the instant the pane is interactive (`core/daemon/loop.ts` binding branch) — **no
  transcript discovery, no `transcriptsAtSpawn` snapshot, no phonehome needed to bind**.
- **Tail** (`pij tail <id>`) reads Copilot's LIVE per-session stream
  `~/.copilot/session-state/<uuid>/events.jsonl` (`core/harness/copilot.ts`
  `sessionEventsPath` + `summarizeCopilotEvent`) — reusing claude's exact file-tail loop,
  swapping path + summarizer. **NOT** the sqlite `session-store.db` `turns` table — its
  `assistant_response` is persisted lazily (null while the pane already shows the reply).
- **Readiness** (`core/readiness.ts`): added Copilot's footer markers to the one shared
  classifier — idle `? help` / `tab next tab`, busy `esc cancel` (`◎ Working`).
- **Live dogfood** (Copilot v1.0.66, GPT-5.5): `spawn` → daemon `injected-init` →
  `bound ↔ <chosen-uuid>` → Copilot ran the injected `pij phonehome` (proving `--yolo`) →
  `pij send` framed `[pij from …]` relay → Copilot replied `COPILOT-OVER-TMUX-WORKS` →
  `pij tail` rendered the whole exchange incl. `⚙ bash`. **Proof**: +14 unit specs
  (copilot summarizer/path, spawn argv, readiness footers, daemon deterministic bind);
  full suite **833 passed / 4 skipped / 0 fail**.
- **Skill**: `flow-pair/references/harness-modes.md` + `SKILL.md` updated (copilot model
  names, `--yolo`, the `events.jsonl` tail source, deterministic-bind gotcha).
- **Tooling**: `just flow-pair-install` symlinks `skills/flow-pair` into `~/.claude/skills`
  + `~/.copilot/skills` (machine-wide, for control-plane dogfooding).

## Group H — restart-stable identity re-attachment (T029)

### T029 — ⓣ Restart-safe identity for Pi and external harnesses
- **Status**: complete (2026-07-11).
- **Files**: `core/discovery.ts`, `core/binding.ts`, `core/daemon/index-state.ts`, `core/spawn.ts`, `core/session.ts`, `adapters/fs-registry.ts`, `cli.ts`, `index.ts` and focused tests; `docs/how/pij.md`; both pij domain docs.
- **What**: external restart re-adoption accepts authoritative `--session-id`; two-way durable identity records under `PIJ_HOME/identities/` survive live-descriptor removal; exact `(harness,harnessSessionId)` lookup uses zero/one/many semantics; zero-match claims are deterministic and first-writer-wins; candidate collisions and duplicate mappings fail `E-AMBIG`. Claims stage+fsync a temp then atomically hard-link no-replace; provisional owner/tuple records roll back on incompatible publication. Pi persists `harness:"pi"` + its exact native id, hydrates durable metadata, restores role, and refreshes pane/state while clearing stale lifecycle/failure on non-reload starts. Codex authoritative adoption requires an exact readable rollout path.
- **Proof (TDD)**: initial RED = 14 missing-behavior failures; every peer-review finding added its own RED→GREEN regression. Final reviewer packet-scope suite = **231/231 green**; `just typecheck` clean; full `harness checks` green for typecheck, lint, test, smoke, package audit, and snapshots. Temp-`PIJ_HOME` proofs covered descriptor-delete/re-adopt identity+metadata recovery, occupied pending-id preservation, conflicting tuple rejection, and missing Codex rollout with zero persisted files.
- **Review**: Copilot CLI GPT-5.6 Sol xhigh (`pij-1qiec0g`) completed five findings rounds plus a final approval pass, raised 12 material findings, and returned **APPROVE — no material findings** after all were addressed. Reconciliation: `reviews/t029-restart-identity-review.md`. The reviewer was compacted after the final verdict.
- **Noteworthy discovery**: a live descriptor alone is not durable identity because Pi removes it on clean shutdown. T029 therefore split presence from identity with a durable metadata snapshot; runtime descriptors remain disposable, avoiding a return to registry corpses.
- **Coordination**: FX002 remained isolated to `pij-rtxerq`'s daemon/adapter paths; T029 did not touch them or alter `Daemon.tick()` iteration/continue-after-failure behavior.

### EXT — daemon lifecycle: auto-start on demand + `pij daemon` verb (post-plan extension)
A control-plane spawn is inert without a daemon. Made the daemon self-managing so an
agent never has to hand-start it, and added a clean teardown.

- **Auto-start** (`core/daemon/lifecycle.ts` `needsAutoStart` + bin `ensureDaemonRunning`):
  `pij spawn` checks for a live daemon (lock pid alive) and, if none, creates a
  **background** tmux window (`-d`, no focus steal — `NewWindowOpts.detached`) named
  **`pij-daemon`** running the daemon, and **prints a note** so the calling agent knows
  one was started. Idempotent: skips if the lock is live OR a `pij-daemon` window already
  exists (convention guard against a double-start race before the lock is written).
- **Convention-based ownership** (user steer): a tmux window named `pij-daemon` IS pij's.
  `daemonWindows()` (`tmux list-windows -a`) is the lock-independent signal — finds the
  window even with a missing/stale lock, and finds orphans. The daemon also records its
  own `#{window_id}` in the lock (`LockFile.window`, set only when `PIJ_DAEMON_OWNED=1`),
  so stop has both signals.
- **`pij daemon [start|status|stop|kill]`** (`runDaemonVerb`): `status` reports
  running/stale/absent + the owned window; `stop` SIGTERMs the daemon AND kills every
  `pij-daemon` window pij owns (never a window a human started the daemon in), then clears
  the lock. `planStop` (pure) decides nothing|cleanup|kill.
- **Live dogfood**: `status` → `running (pid …, window @150)`; `stop` → SIGTERM + window
  torn down + lock cleared + `not running`; `pij spawn` with no daemon → `⚙ no pij daemon
  was running — started one in tmux window 'pij-daemon' …` → peer driven to **bound**, with
  the client's **active window unchanged** (background launch verified: daemon window
  `active=0`). **Proof**: +9 lifecycle specs; full suite **842 passed / 4 skipped / 0 fail**.
- **Skill**: `harness-modes.md` + `SKILL.md` updated — auto-start, the `pij daemon` verbs,
  and the `pij-daemon` naming convention, so agents know the daemon is self-managing.
