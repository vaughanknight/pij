# Research Dossier: pij tmux control plane + machine-wide daemon

**Generated**: 2026-06-27
**Query**: "How to extend pij to control Claude Code (and later Copilot) via tmux — pij-id assigned before launch, phone-home handshake binding pij-id↔harness-session-id, a machine-wide daemon that centralizes file-mon + routing + registry + a chalk TUI, fire-and-forget send-keys messaging, and id-linked transcript tailing. What is reusable vs greenfield?"
**Effort**: Deep (3 parallel workers + direct verification)
**Tools**: Standard (grep/read; FlowSpace not used)
**Evidence**: 10 current sources · 1 historical

## Answer

1. **The spawn/registry/close machinery already exists and is reusable as-is.** pij already spawns into tmux windows/splits, injects `PIJ_*` env at boot, generates a deterministic `spawnId`, persists `paneId`/`spawnedBy` in `~/.pij/<id>.json`, and kills+removes on close (F-03, F-05). The new work layers on top, it does not replace this.
2. **The hardest-looking parts — send-keys injection and capture-pane readiness — are already solved in a different file.** `harness/driver/tmux.ts` is a full tmux driver with literal send-keys (`type`), key-press (`press`, incl. Enter), **bracketed paste** (`paste`), and `capture-pane` (`capture`) — built for smoke tests, directly reusable for injection + "is-it-ready" detection (F-02). The pij *extension's* own `TmuxPort` lacks these (F-01) — so the decision is **reuse the driver vs. add methods to the extension port**, not "build from scratch."
3. **Exactly one seam cannot move to the daemon: injecting into a running *pi* process** (`pi.sendUserMessage`, in-process only — F-06). Everything else — inbox watching, routing, registry, event log — is pure I/O and portable to a daemon (F-07). So the daemon is a switchboard; **pi self-injects via a thin local receiver, claude/copilot get send-keys** from the daemon directly.
4. **Identity + phone-home reuse the env-var join that already works.** `deriveSelfId`/`resolveSelf` resolve "who am I" from `PIJ_SESSION_ID` (F-08); the CLI's `dispatch()` is where a `phonehome`/`daemon` verb slots cleanly (F-08). The cross-harness link to a Claude session is the same env→transcript-path trick the telemetry collector uses (F-09).
5. **Genuinely greenfield: the daemon process itself, the chalk TUI, and any Claude-transcript awareness in pij.** No long-running process, no TUI lib (only `picomatch` in runtime deps), and zero `CLAUDE_CODE_SESSION_ID`/`~/.claude` references exist in pij today (F-10).

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | The pij extension's `TmuxPort` has 7 methods (newWindow/splitWindow/killWindow/killPane/currentSession/currentPane/currentWindowPanes) and **no** send-keys or capture-pane. | `.pi/extensions/pij/core/ports.ts:103-120`; adapter `adapters/tmux.ts` (argv-only via `execFileSync`, `:21-25`) | If we route injection through the extension port, two new methods (+ adapter impls + fakes) are needed. But F-02 offers a ready-made alternative. | High |
| F-02 | A full tmux driver already exists with literal send-keys (`type` `:190`), key-press (`press` `:193`, for Enter), **bracketed paste** (`paste` `:200`), and `capture-pane -p` (`capture` `:211`), plus `inspect`/`assertAlive` pane introspection. | `harness/driver/tmux.ts:188-223,163-186` | **Primary reuse lever.** Solves send-keys injection, multi-line/paste safety, and pane-reading for readiness in one proven module. Decision: reuse in place, extract to a shared lib, or port the pattern. | High |
| F-03 | Spawn is fully built: `buildSpawnCommand()` injects `PIJ_ANNOUNCE_TO/SPAWN_ID/ROLE/SPAWN_MODEL/SPAWN_TASK`; `spawn()` branches window vs split (cap 3) with parent-side pane tracking; `spawnId = s<clock>-<counter>` (deterministic). | `core/spawn.ts:62-125`; `core/session.ts:180-261,101-102,186` | Reusable as-is. The new harnesses just need a different launch `cmd` (claude vs pi) and a pij-id generated **before** launch passed in env. | High |
| F-04 | A ready-ping already exists: child persists its descriptor then `deliver()`s a `readyBody()` to its parent; `parseReadyBody()` decodes it. | `core/spawn.ts:95-125`; `core/session.ts:144-163` | This is pi's built-in "phone home." Claude has no extension to send it, so the **CLI `phonehome` verb is the claude-side equivalent** — it should converge on the same registry binding. | High |
| F-05 | Registry persists `id/folder/paneId?/spawnedBy?/role` to `~/.pij/<id>.json` atomically (tmp+rename); list/read/write/remove API. | `core/types.ts:22-49`; `adapters/fs-registry.ts:16-50` | The binding `pij-id↔pane↔spawnedBy` is already a persisted fact. Add `harness` + `harnessSessionId` fields for the cross-harness link. | High |
| F-06 | **The immovable seam**: `inject()` → `pi.sendUserMessage()` is in-process only; called from `onInbound()` (idle→immediate / busy→steer). | `adapters/pi-runtime.ts:41-47`; `core/session.ts:360` | Daemon cannot inject into pi. pi keeps a thin "watch my inbox → sendUserMessage" receiver; the daemon owns everything upstream. claude/copilot need no in-process anything (send-keys). | High |
| F-07 | `FsChannel.watch()` is the portable file-mon loop: dir `fs.watch` + 20ms debounce + 1500ms unref'd fallback poll + dedupe-by-id; wired per-session at boot, disposed at shutdown. | `adapters/channel.ts:63-110`; `index.ts:240,266,284-285` | This logic moves wholesale into the daemon (one watcher over all `~/.pij/*/inbox/`). The per-session wiring at `index.ts:266` is what gets thinned to a local-inbox-only receiver. | High |
| F-08 | Identity + CLI seam: `deriveSelfId(piSessionId,pid)`→`pij-<fnv slug>`; `resolveSelf(envId,locals)` prefers `PIJ_SESSION_ID`; CLI `dispatch()` is a pure tagged-union over verbs (whoami/list/send/tail/state/path). | `core/discovery.ts:16-32,73-90`; `core/cli.ts:266-455`; `index.ts:255-256` (exports `PIJ_SESSION_ID`) | `phonehome` (a child inheriting the harness's session env reports its binding) and `daemon` slot into `dispatch()` following the existing pattern + the `commands.ts` allow-list. | High |
| F-09 | Claude transcript path is deterministic: `~/.claude/projects/<repoRoot with [^A-Za-z0-9]→'-'>/<CLAUDE_CODE_SESSION_ID>.jsonl`; session id read from env. | `…/harness-engineering/harness/cli/src/services/telemetry/adapters/claude-adapter.ts:59-61,66` | Once the daemon knows `(cwd, CLAUDE_CODE_SESSION_ID)` from a phone-home, it can locate + tail the transcript with no agent cooperation. Reuse the exact mangle. | High |
| F-10 | Greenfield: no daemon/long-running process in pij; no TUI lib (runtime dep = `picomatch` only; `@earendil-works/pi-tui` is a *peer* dep for pi); zero `CLAUDE_CODE_SESSION_ID`/`~/.claude` refs in pij. Toolchain: `tsx`, node `>=24`, bins via `#!/usr/bin/env -S npx tsx`. | `package.json:51,59-61,67`; `.pi/extensions/pij/cli.ts:1`; grep (0 hits) | Add a TUI dep (chalk or ink). Daemon + transcript-tailing are net-new modules. tsx bin pattern is established to copy. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | A tmux `/compact`-style readiness/assertion harness already reads pane content to assert agent state in tests. | `harness/driver/compact-assert.test.ts`; plans `017-pij-spawn-tmux-windows` (spawn), `015-file-watch-notify` (steer-if-busy/immediate-if-idle inject model) | Direct | Prior art for "read the pane to know what the agent is doing" — mine it for the **readiness signal** (R-01) and for `/compact`-injection behaviour. The 015 inject-mode model informs send-keys-while-busy (R-02). |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| R-01 **Readiness signal** — what exact `capture-pane` text/state means "Claude is up and at its prompt, ready to receive." | F-02 gives the *mechanism*; the *signal* is undecided | The whole fire-and-forget promise breaks if we inject before the TUI is ready (input lost/misrouted). | Mine `compact-assert.test.ts`; prototype `capture()` against a live `claude` boot; pick a robust marker (prompt glyph / echoed sentinel). |
| R-02 **Inject-while-busy** — `send-keys` types regardless of state; accept Claude's native queueing vs. gate on idle. | F-06 (pi has explicit idle/steer); F-02 (tmux has no such signal) | Determines whether mid-turn messages (and `/compact`) land correctly or get garbled. | Decide policy in plan; if gating, derive "busy" from `capture()` heuristics. |
| R-03 **Driver reuse boundary** — `harness/driver/` was built for smoke tests; depending on it from a shipped daemon couples two subsystems. | F-02 location is `harness/driver/`, not the pij extension | Architectural seam: reuse-in-place vs. extract a shared `tmux` lib vs. add to `TmuxPort`. | Plan decision; cheap to extract since it's argv-only and dependency-light. |
| R-04 **Daemon lifecycle + transport** — start (lazy vs recipe), rendezvous (unix socket vs files), crash recovery. | F-10 (no precedent) | Defines how creator↔daemon↔target communicate and how verification round-trips. | Plan decision; files-under-`~/.pij/` keeps it rebuildable (UI is a view). |
| R-05 **Phone-home verification semantics** — how long the creator waits, what "failed to boot" looks like. | F-04 (ready-ping exists for pi); claude path is new | The creator needs a definite "child is live" or timeout. | Plan decision; reuse ready-ping timeout patterns if any. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| pij extension (in-process) | Shrinks | Must retain only the local-inbox→`sendUserMessage` receiver; everything else moves out. | F-06, F-07 |
| pij daemon (new) | Owns | Watch + route + registry + TUI; rebuildable from `~/.pij/`. | F-07, F-10 |
| Harness-type seam (new) | Introduces | Transport selection: pi→file-inbox, claude/copilot→send-keys; pluggable per harness. | F-02, F-06 |
| `harness/driver/` | Reuse source | tmux primitives (send-keys/paste/capture) — boundary decision R-03. | F-02 |

## Planning Handoff

- **Preserve**: the in-process inject seam (`pi.sendUserMessage`, F-06); the `~/.pij/` file layout + atomic tmp-rename writes (F-05, F-07); `deriveSelfId` stability across `/reload` (F-08); the ready-ping codec as pi's phone-home (F-04).
- **Change carefully**: lifting `watch()` out of the per-session extension (`index.ts:266`) must leave a thin local receiver so pi↔pi messaging keeps working (F-06/F-07); don't regress the spawn/close paths (F-03/F-05) — extend, don't rewrite.
- **Likely files/symbols**: new `daemon` module + `pij daemon` bin (greenfield); new `phonehome` verb in `core/cli.ts` `dispatch()` + `core/commands.ts` allow-list; a harness-type/transport abstraction; tmux primitives from `harness/driver/tmux.ts` (or an extracted shared lib); registry fields `harness`/`harnessSessionId` in `core/types.ts`; `index.ts` watch re-wiring; a TUI dep added to `package.json`.
- **Decisions still required**: R-01 readiness signal · R-02 inject-while-busy policy · R-03 driver reuse boundary · R-04 daemon lifecycle/transport · R-05 phone-home verification · TUI lib choice (chalk vs ink).

## External Research

| Question | Why repo evidence is insufficient | Planning impact | Prompt |
|----------|-----------------------------------|-----------------|--------|
| How does Claude Code's TUI behave under `tmux send-keys` — does typed text while it's mid-turn get queued, steered, or dropped, and what on-screen marker reliably signals "ready for input"? | Depends on current Claude Code TUI behaviour, not anything in these repos. | Directly determines R-01 + R-02, the load-bearing risks of the whole fire-and-forget design. | "For the latest Claude Code CLI (TUI), what is the documented/observed behaviour when text is injected via `tmux send-keys` while the agent is mid-response — is it queued and submitted after the turn, does it interrupt/steer, or is it lost? What visual prompt state indicates it is idle and ready to accept a new message? Include slash commands like `/compact`." |
