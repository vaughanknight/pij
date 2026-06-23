# Research Report: pij spawn-pi-in-tmux-window + report-ready + close

**Generated**: 2026-06-23
**Research Query**: "Extend the pij extension to fire up a new pi instance in a new tmux window under the current session (settable model), have it report back when ready, and close/remove it when done — so dynamic workflows can spawn N pis, do work, then tear them down."
**Mode**: Pre-Plan
**Location**: docs/plans/017-pij-spawn-tmux-windows/research-dossier.md
**FlowSpace**: Not used (targeted in-repo read of `.pi/extensions/pij/` + live CLI/tmux probes)
**Findings**: 22

## Executive Summary

### What It Does (today)
pij is a file-backed peer-messaging + observability bus for co-located pi sessions. Each session auto-registers a descriptor in `~/.pij/<id>.json`, captures its activity to `events.ndjson`, receives messages via an atomic-write inbox watched with `fs.watch`+poll, and exposes a `pij_send` tool + `pij` CLI. It has **no ability to create or destroy sessions** — peers must already exist (a human opens each tmux pane/window and runs `pi`).

### What we're adding
A **lifecycle** capability: a `pij_spawn` tool that opens a new tmux **window** in the current session running `pi [--model X]`, injects env so the child auto-pings "ready" back to the spawner, optionally hands it a first task; and a `pij_close` tool that kills that window by id. This turns pij from a *messaging* bus into a *fleet-orchestration* surface (spawn → drive via existing `pij_send`/`tail` → close).

### Key Insights
1. **The hexagonal architecture absorbs this cleanly.** All behaviour lives in pi-free `core/` against 5 injected ports; the only pi-importing file is `adapters/pi-runtime.ts`. Spawn/close add **one new port (`TmuxPort`)** + one new impure adapter (`adapters/tmux.ts`) + pure logic in a new `core/spawn.ts`, tested against a `FakeTmux` — no architectural change (Patterns P2/P3/P8 hold).
2. **"Report ready" is free via the existing message bus.** The child already boots pij, gets an id, and can `deliver()` to the spawner. A new `PIJ_ANNOUNCE_TO` env makes the child auto-send "ready" on fresh boot — the spawner learns the child's pij id from the framed `[pij from <child>]` with zero new transport.
3. **Proven tmux primitives already exist** in `harness/driver/tmux.ts` (argv-only `execFileSync`, pane-id capture, kill). They can't be imported (extension must not depend on `harness/`), but they are a **copy-from reference** that de-risks the new adapter.
4. **Closing needs an id→pane map.** The spawner creates the window so it knows the pane id (`%N`); passing it to the child as env so the child writes it into its own descriptor lets *any* peer close it by pij id (`kill-window -t %N`).

### Quick Stats
- **Components**: pij extension = `index.ts` (wiring) + `core/` (10 pure modules) + `adapters/` (5 fs/pi adapters).
- **Net-new**: `core/spawn.ts`, `adapters/tmux.ts`, `TmuxPort`, 2 tools, 1 descriptor field.
- **Test Coverage**: pij is store/core-tested (vitest); fakes exist (`adapters/fakes.ts`). New logic is fakes-testable.
- **Complexity**: Medium (CS-3) — see plan.
- **Prior Learnings**: 4 directly relevant (D-040/D-041/D-042, subagent-child guard).
- **Domains**: `pij-messaging` (docs/domains/pij-messaging/).

## How It Currently Works (the seams we touch)

### Entry Points
| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `session_start` handler | pi event | `index.ts` (P10, all reasons) | derive id, register descriptor, announce, open inbox watcher |
| `pij_send` tool | model tool | `index.ts` → `core/cli.ts dispatch()` | the one send path (reused by CLI + tool) |
| `/pij` command | slash cmd | `index.ts` | arms `commandControl` (new/reload), status readout |
| `PijSession` | coordinator | `core/session.ts` | ALL behaviour: boot/announce/capture/inject/command/receipt/shutdown |
| `FsChannel` | DeliveryPort + watcher | `adapters/channel.ts` | atomic inbox write + `fs.watch`/poll receive |
| `PiRuntimeAdapter` | PiRuntimePort | `adapters/pi-runtime.ts` | the ONLY `@earendil-works/*` import; isIdle/inject/compact/control |

### Core boot flow (where spawn-child behaviour hooks in)
`session_start` → `deriveSelfId(piSessionId, pid)` → register descriptor → `PijSession.boot()`:
- on **fresh** boot only (`existing === null`), injects `announceText(...)` via `pi.inject(..., "immediate")`.
- exports `PIJ_SESSION_ID` / `PIJ_ROLE` to `process.env` (child-CLI self-resolution).
- seeds inbox `seen` set so reload never replays history.

**Hook point for "report ready"**: extend `boot()` (or the index `session_start` handler) so that on a **fresh** boot where `PIJ_ANNOUNCE_TO` is set, after announce it (a) writes `paneId` into the descriptor, (b) `delivery.deliver()` a "ready" message to the announce-to peer, and (c) optionally self-injects `PIJ_SPAWN_TASK`. Guard on `fresh` so reload/resume never re-pings.

### Message + receipt protocol (reused as-is)
- Raw body on wire; **receiver frames** `[pij from <id>] <body>` on inject.
- idle peer → immediate turn; busy → `deliverAs:"steer"`.
- `kind:"receipt"` messages recorded as events, never injected.
- The "ready" ping is just an ordinary text message — no protocol change; an optional `parseReadyBody()` helper (mirroring `parseReceiptBody`) lets the spawner recognise it structurally.

### Subagent-child guard (critical precedent)
`index.ts` first line: `if (isSubagentChild(process.env)) return;` — a pi spawned by pi-subagents (`pi --mode json -p`) skips ALL pij wiring because its announce `sendUserMessage` races the `-p` task prompt → "Agent is already processing" (D in `discovery.ts`). **Our spawned pi is a full interactive session, not a subagent child**, so it activates pij normally — but this is the canonical evidence for the *initial-prompt race* risk below.

## Verified external facts (live probes)

| ID | Fact | Evidence |
|----|------|----------|
| IC-01 | `pi --model <pattern>` accepts `provider/id` and `:<thinking>` shorthand | `pi --help`: `--model <pattern> … "provider/id" and optional ":<thinking>"` |
| IC-02 | pi takes an **initial prompt as a positional arg** in interactive mode (`pi "do X"`) | `pi --help` examples: `pi @prompt.md … "What color is the sky?"` |
| IC-03 | pi has `--name`/`-n`, `--session-id`, `--no-session`, `--session-dir` | `pi --help` |
| IC-04 | tmux **3.6a** supports `new-window -e KEY=VAL` (repeatable) | `tmux -V` = 3.6a; harness already uses `-e` on `new-session` |
| IC-05 | We are inside tmux now: `$TMUX` set, `$TMUX_PANE=%72`, session `pij` | live `echo $TMUX_PANE`, `tmux display-message -p '#{session_name}'` |
| IC-06 | A window can be killed via any pane id: `tmux kill-window -t %N` | tmux semantics; pane-id is rename-proof (harness TC-08) |

## Architecture & Design (the change)

### Component Map (net-new in **bold**)
```
.pi/extensions/pij/
  index.ts                 register pij_spawn + pij_close tools; wire TmuxAdapter; ready-ping on boot
  core/
    spawn.ts      (NEW)    pure: buildSpawnCommand(), readyBody()/parseReadyBody()
    ports.ts               + TmuxPort interface
    types.ts               + SessionDescriptor.paneId?, spawnedBy?
    session.ts             + spawn()/close()/ready-ping/self-task
    message.ts             (reuse frame; optional ready-body helpers may live in spawn.ts)
  adapters/
    tmux.ts       (NEW)    impure seam #2: newWindow()/killWindow()/currentSession()
    fakes.ts               + FakeTmux for tests
```

### Design patterns (already in repo — we conform)
1. **Hexagonal ports + DI** (P3): `TmuxPort` joins the 5 ports; `PijSession` ctor injects it. Real `TmuxAdapter` in index, `FakeTmux` in tests.
2. **Pure-core / single impure seam** (P2/P9): spawn argv+env decisions in `core/spawn.ts` (no I/O, fakes-tested); `adapters/tmux.ts` is the only new file touching `child_process`.
3. **Tagged-union returns** (P4): `spawn()/close()` return `Result<…>` with new/existing error codes (E-NOTMUX, reuse E-NOID/E-DEAD).
4. **Reuse the one send path**: `pij_close`/`pij_spawn` tools are thin like `pij_send` — construct deps, call into core.

### Proposed env contract (child reads at boot)
| Var | Set by | Read by | Purpose |
|-----|--------|---------|---------|
| `PIJ_ANNOUNCE_TO` | spawner | child boot | peer id to ping "ready" |
| `PIJ_SPAWN_ID` | spawner | child boot | correlation token echoed in ready ping |
| `PIJ_SPAWN_TASK` | spawner (optional) | child boot | first task, self-injected after ready |
| `PIJ_PANE_ID` | spawner (= new window's `%N`) | child boot | written to descriptor for close-by-id |
| `PIJ_ROLE=worker` | spawner | existing boot | role label (already supported) |

## Dependencies & Integration

### What this depends on
| Dependency | Type | Purpose | Risk if Changed |
|------------|------|---------|-----------------|
| `tmux` binary (3.x, `-e` env) | external | spawn/close windows | Low — gate on `$TMUX`; clean E-NOTMUX otherwise |
| `pi` on PATH | external | the child process | Low — window opens; if pi missing, no ready ping arrives (documented timeout behaviour) |
| `FsChannel.deliver` | internal | "ready" ping transport | None — reused unchanged |
| `FsRegistry` descriptor | internal | store `paneId` for close | Low — additive optional field |
| pi `ExtensionContext` cwd / `$TMUX_PANE` | internal | target current session | Low |

### What depends on this
- **No existing consumer** — purely additive tools. `pij list`/`tail`/`state` continue to work and now also observe spawned children (they register as normal peers).

## Prior Learnings (from the pij build itself)

### 📚 PL-01: Announce is deliberately NON-imperative (D-040)
**Source**: `core/message.ts` `announceText` doc + docs/plans/014.
**What**: a directive boot briefing made fresh sessions run every `pij` command and snoop their own inbox.
**Action**: the "ready" ping and any self-injected task must be **specific and bounded** — the ready ping is a short status line to ONE peer, not a behavioural instruction to the child. The self-task (if provided) is the child's actual work, injected once.

### 📚 PL-02: Identity changes on /new and /fork, stable on /reload (D-041)
**Source**: `core/discovery.ts deriveSelfId`.
**Action**: a spawned pi is a brand-new pi process → it mints its own fresh pij id. The spawner cannot predict it; it must learn it from the ready ping (hence `PIJ_ANNOUNCE_TO`). Do **not** try to pre-assign the child's pij id.

### 📚 PL-03: Slash commands can't be injected; control needs arming (D-042)
**Source**: `index.ts`/`pi-runtime.ts` `control()`; docs/how/pij.md § Remote control.
**Action**: spawn/close are **not** slash commands — they run on the long-lived `ExtensionContext` (like `compact`), so they need NO arming and work from the background. Good: the spawn/close tools are factory-level (like `pij_send`), callable any time.

### 📚 PL-04: Subagent children must not activate pij (race on initial prompt)
**Source**: `discovery.ts isSubagentChild`.
**Relevance**: direct evidence that a pi booting with an initial prompt + a pij `sendUserMessage` announce can collide ("Agent is already processing"). **This is the central risk for passing a task at spawn** (see below).

## Critical Discoveries

### 🚨 CF-01: Initial-prompt vs announce race (task delivery method)
**Impact**: High — drives a core design decision.
**What**: Two ways to give the child its first task: (a) `pi "<task>"` positional prompt, or (b) env `PIJ_SPAWN_TASK` + pij self-injects after boot. Option (a) risks the same "Agent is already processing" collision that forced the subagent guard, because pij's fresh-boot announce is itself a `sendUserMessage`.
**Recommended action**: **prefer (b)** — env-carry the task and self-inject it via `pi.inject(task, "immediate")` *after* the announce, all on pij's own turn-aware path (it already distinguishes idle vs steer). This avoids racing pi's own startup prompt processing. The plan should validate this with a smoke before committing. (Fallback: suppress the announce when spawning with a positional prompt — but that's more invasive.)

### 🚨 CF-02: Window vs pane and cleanup target
**Impact**: Medium.
**What**: user said both "pane" and "windows"; decision locked to **new window per child** (clarified) — cleaner to kill, no split-layout fights at N>2. `kill-window -t <paneId>` tears down the whole window via any pane in it.
**Action**: store the **pane id** (`%N`) in the descriptor; close via `kill-window`. Optionally auto-name the window `pi:<spawnId>` (`new-window -n`) for human legibility.

### 🚨 CF-03: Close authority
**Impact**: Low–Medium (policy).
**What**: should `pij_close` only close children *I* spawned, or any peer's window?
**Action (for plan/clarify)**: default allow closing any peer whose descriptor carries a `paneId`, but record `spawnedBy` so a future "close all mine" can scope. Warn (not block) if closing a non-spawned-by-self peer.

## Modification Considerations

### ✅ Safe to Modify
- **`core/spawn.ts` (new)** — pure, isolated, fully fakes-tested. Zero blast radius.
- **`types.ts` descriptor** — additive optional fields; old descriptors still parse.
- **New tools in `index.ts`** — additive registrations; don't touch existing handlers.

### ⚠️ Modify with Caution
- **`PijSession.boot()`** — adding the ready-ping/self-task must be gated on `fresh` (no re-ping on reload) and on `PIJ_ANNOUNCE_TO` presence (no behaviour change for normal sessions). Cover with a fakes test asserting reload does NOT re-ping.
- **`adapters/tmux.ts`** — argv-only `execFileSync` (never shell strings) — lift the discipline from `harness/driver/tmux.ts` (closes the smoke shell-quoting class of bug, D-014).

### 🚫 Danger Zones
- **The fresh/reload idempotency** in boot is load-bearing for the whole "no replay" guarantee — do not let the ready-ping leak onto the reload path.
- **Self-injecting a task** must not double-fire if the child reloads — same `fresh` guard.

### Extension Points (designed for this)
- The 5-port DI seam is explicitly built to add capabilities by adding a port + adapter + fake; `TmuxPort` is a textbook fit.

## Recommendations

### If implementing
1. **Add `TmuxPort` + `adapters/tmux.ts`** mirroring `harness/driver/tmux.ts` (argv arrays; capture `%N` from `new-window`; `kill-window` swallow-on-missing).
2. **Put all argv/env construction in `core/spawn.ts`** (`buildSpawnCommand({model, task, spawnId, announceTo, cwd}) → {cmd:"pi", args, env}`) so the matrix (model present/absent, task present/absent, special chars) is unit-tested without tmux.
3. **Ready-ping via the existing bus** — child `boot()` on fresh + `PIJ_ANNOUNCE_TO` → `deliver({to: announceTo, body: readyBody(spawnId, model)})`; persist `paneId` from `$TMUX_PANE`/`PIJ_PANE_ID`.
4. **Self-inject `PIJ_SPAWN_TASK`** after announce (CF-01 path b), `fresh`-guarded.
5. **`pij_close({to})`** → descriptor → `TmuxPort.killWindow(paneId)` → `registry.remove(to)`.
6. **Smoke** (`harness/`, tmux-gated): real `new-window`, assert child registers + ready ping lands, drive one `pij_send`, then `pij_close` removes the window.

### If extending later (out of scope now)
- "Close all I spawned" bulk teardown (uses `spawnedBy`).
- Auto-close spawned children on spawner `session_shutdown`.
- Block-until-ready spawn variant (we chose fire-and-forget).

## External Research Opportunities
No external research gaps. The only uncertainty (CF-01 initial-prompt race) is resolvable by a local smoke test, not by external knowledge.

## Open Questions for the plan/clarify pass
1. **Close authority** — any peer vs only spawned-by-self (CF-03). Recommend: any, warn if not mine.
2. **Window naming** — auto-name `pi:<spawnId>`? Recommend: yes (cheap legibility).
3. **Default model** — when `model` omitted, omit `--model` (pi's own default) vs inherit spawner's. Recommend: omit (pi default; no reliable "current model" env).
4. **Ready-ping content** — include child model + cwd for a self-describing log? Recommend: yes.

---
**Research Complete**: 2026-06-23
**Report Location**: docs/plans/017-pij-spawn-tmux-windows/research-dossier.md
