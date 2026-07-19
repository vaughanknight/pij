# tmux Pane Smarts — live per-pane busy / user-typed / connect signals

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-19
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from `research-dossier.md` (busy-dialect matrix 4/4, key-event mechanism, all live-probed 2026-07-19).

## Business Specification

### Research Context
Live probing of all four harnesses (claude, copilot, codex, pi) established, byte-for-byte:
- **Busy signal is universal** — one `tmux pipe-pane -o` tap + a rolling byte-density window gives busy/idle on every harness (idle = 0 bytes; busy = churn). No harness emits OSC 9;4 under tmux, so byte-density is the **primary** signal, not a fallback.
- **User-typed is detectable** — a TUI echoes each keystroke as a redraw burst on the same stream; the caret-column report (`ESC[row;colH`) tracks composer length. Column **increments** per key; **reset to base = Enter/submit**. Reconstructed a full typed string live.
- **Connect/disconnect** — `tmux list-panes` already exposes `pane_id` + `pane_dead` (`harness/driver/tmux.ts:171`).

### Summary
Give the pij daemon live, per-pane awareness of three things so it never steps on a human or a busy agent: **(1)** is the agent busy, **(2)** is the human mid-type, **(3)** which panes exist. All three read from **one `pipe-pane` tap per pane + one `list-panes` tick** — no screen scrape for busy, no keylogger, no CPU polling. A pij message targeting a pane that is busy-with-human-input is **queued** and flushed the instant the pane frees (Enter, or 60 s idle since last keystroke).

- A per-pane **busy bit** derived from pipe-pane byte-density over a rolling ~1 s window — **exposed as a read-only signal for a future UI. It does NOT gate delivery** (pij may send to a busy agent; that's intended).
- A per-pane **user-typing hold**: detect keystrokes + Enter from the stream; HOLD sends **only** while a human's composer is non-empty; release on Enter or 60 s keystroke-idle. **This is the only thing that holds a send.**
- A **send-gate + queue**: `pij send` to a pane with a human mid-type queues; flush on release, in order. (Busy is never a hold condition.)
- **Connect/disconnect**: panes tracked via `list-panes` id-diff each tick; `pane_dead=1` retires a pane and drops its tap.

### Non-Goals
- Semantic activity labels (the OSC-0 title text is coarse/harness-specific — not consumed as a per-step label).
- Reviving the OSC 9;4 path (confirmed not emitted under tmux).
- Changing message *routing* or delivery semantics beyond the busy/typing hold (delivery ownership stays as-is).
- A TUI/visualisation of pane state (data only).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-control-plane` | existing | **modify** | Add per-pane signal watchers (busy + user-typed) and the send-gate/queue to the daemon; extend the tmux driver. |
| `file-watch-notify` | existing | **consume** | Reference for the "steer-if-busy / immediate-if-idle" inject seam — same posture, applied to the send-gate (no code coupling). |

### Testing Strategy
- **Approach**: Lightweight (default). Unit-test the pure parsers with **recorded real stream fixtures** (the `pane_tap.py` captures already prove the byte patterns); integration-smoke the gate with a spawned peer.
- **Rationale**: the risk is in stream parsing, which is deterministic given fixture bytes; the tmux plumbing already exists and is exercised.
- **Focus areas**: byte-density busy classification (busy vs idle vs human-typing bursts); caret-column key/Enter detection; queue flush ordering + release triggers.
- **Excluded**: exhaustive per-harness TUI rendering; real-LLM behaviour.
- **Mock usage**: targeted — tmux calls mocked/faked at the driver seam; parsers tested against real captured byte fixtures (no mock streams).

### Documentation Strategy
- **Location**: `docs/how/` — a short "pane signals" note (how the busy/typing/connect signals are derived + the send-gate contract). Update `pij-control-plane/domain.md`.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=1, N=1, F=1, T=1 (sum 7)
- **Confidence**: 0.80
- **Assumptions**: the daemon has (or can host) a per-tick loop and a chokepoint on the send path; the caret-column signature generalises across harnesses (proven on claude; copilot/codex/pi corroborate via the same final-caret report).
- **Dependencies**: the pij daemon `.pi/extensions/pij/daemon.ts` (tick loop + delivery), its `SendBuffer` (`core/daemon/router.ts`), and its tmux adapter `DaemonTmux` (`adapters/daemon-tmux.ts`).
- **Risks**: see Risks table.
- **Phases**: 1 (Simple).

### Acceptance Criteria
- **AC-01**: For each of the four harnesses, the busy bit reads `busy` within ~1 s of a turn starting and `idle` within ~2 s of it ending, from pipe-pane byte-density alone (fixture-backed unit test + one live smoke).
- **AC-02**: Typing into a pane's composer (no Enter) sets that pane's `user-typing` hold; a `pij send` to it during the hold is **queued**, not delivered.
- **AC-03**: Pressing Enter (composer clears) OR 60 s elapsing since the last keystroke **releases** the hold and flushes the queue in FIFO order.
- **AC-04**: Spawning a new pane adds it to the tracked set within one tick; killing a pane (`pane_dead=1`) retires it and stops its tap with no error.
- **AC-05**: No CPU-polling or `capture-pane` screen-scrape is used for the busy bit (byte-density only); the user-typed guard uses the stream, not a keylogger.
- **AC-06**: A **busy** pane with an **empty composer** receives a `pij send` **immediately** — busy is exposed as a signal but is NOT a hold condition (only a human mid-type holds).

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Caret-column signature differs on a harness | Low | Med | Key on the *final* `ESC[row;colH` in each burst (every TUI emits it); learn composer row/base-col from the idle caret, don't hardcode. Fixture-test per harness. |
| Busy-density threshold flaps at burst edges | Med | Low | Rolling ~1 s window + small hysteresis (idle only after N ms of silence); research shows idle is a clean 0 bytes, so the gap is wide. |
| Human-typing bursts misread as agent-busy | Low | Med | Human keystrokes are isolated low bursts while otherwise idle; agent-busy is sustained churn. Classify by rate + the caret-column signal (typing moves the composer caret). |
| Per-pane tap resource cost at scale | Low | Low | One `pipe-pane` + one small parser per pane; retire on `pane_dead`. Matches existing per-session tap cost. |

### Open Questions
- None blocking. (Where exactly the send-gate chokepoint sits in the daemon is an implementation-time locate, not a design unknown.)

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| _(none — mechanism fully proven by live probing; no unresolved design shape or feasibility question)_ | — | — | — |

### Clarifications
#### Session 2026-07-19
- **Mode**: Simple (user: "simple plan, default the rest").
- **Testing/Mock/Docs**: defaulted — Lightweight / targeted mocks (tmux seam only) / `docs/how/`.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved (mechanism live-proven).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | Source of the **busy-dialect matrix** + integration-point notes. NOTE: the **user-typed caret mechanism** (finding 02 / T003) was proven *after* the dossier's user-typed section and is recorded in the-flow log (`the-flow.json`); it is being folded back into the dossier (still flagged "not yet live-tested end-to-end"). |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No unresolved `[NEEDS CLARIFICATION]`; defaults accepted per user. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`. |
| G4 | ADR Compliance | N/A | No ADRs contradicted. |
| G5 | Structure | PASS | All required sections present + populated. |
| G6 | Testing Alignment | PASS | Lightweight: ≥1 validation task per unit; ACs measurable. |
| G7 | Domain Completeness | PASS | `pij-control-plane` (modify) + `file-watch-notify` (consume); manifest covers every file. |

### Summary
Add three per-pane signal watchers to the pij daemon, all reading from one `pipe-pane` tap + one `list-panes` tick: a byte-density busy bit, a stream-driven user-typing hold, and a pane-id/`pane_dead` connect tracker. Wire a send-gate that queues messages to a held pane and flushes on release (Enter or 60 s keystroke-idle). Pure parsers are fixture-tested against real captured bytes; the tmux plumbing reuses `harness/driver/tmux.ts`.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/adapters/daemon-tmux.ts` (`DaemonTmux`) | pij-control-plane | internal | The daemon's tmux surface — add a pipe-pane tap + an all-pane `list-panes -a` query (existing surface is single-target). |
| `.pi/extensions/pij/core/daemon/pane-signals.ts` *(new)* | pij-control-plane | internal | The three pure parsers: busy-density, key/Enter caret tracker, connect-diff. |
| `.pi/extensions/pij/core/daemon/pane-signals.test.ts` *(new)* | pij-control-plane | internal | Fixture-backed unit tests (real captured byte streams). |
| `.pi/extensions/pij/core/daemon/router.ts` (`SendBuffer`) | pij-control-plane | internal | **Extend the existing `SendBuffer`** (already buffers + flushes daemon-owned sends) with a per-pane hold + FIFO release — do NOT mint a new gate. |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | Send-gate chokepoint + tap lifecycle: consult pane signal in the tick "one pass" (:173) / `deliver` path → deliver or hold; attach/detach taps on connect/retire. |
| `docs/how/pij-pane-signals.md` *(new)* | pij-control-plane | contract | How the signals are derived + the send-gate contract. |
| `docs/domains/pij-control-plane/domain.md` | pij-control-plane | contract | Record the new signal + gate contracts. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Byte-density on the `pipe-pane` stream is a universal busy bit (idle=0 bytes on all 4 harnesses); OSC 9;4 is emitted by none under tmux. | Build busy on byte-density (primary); OSC-0-title parse is an optional enrichment only. |
| 02 | Critical | Keystrokes are recoverable from the stream via the caret-column report; col-increment = key, col-reset = Enter/submit. | User-typed guard reads the stream's final `ESC[row;colH` per burst — no keylogger, no polling. |
| 03 | Critical | The real send/queue chokepoint is the **pij daemon** (`.pi/extensions/pij/daemon.ts`), which already owns a **`SendBuffer`** (`core/daemon/router.ts`, used :90, flushed :329, gated by `daemonOwnsDelivery`) — NOT `harness/driver/session.ts` (a tmux automation wrapper with no peer delivery). | Retarget the gate to the daemon; **extend the existing `SendBuffer`** with the per-pane hold, don't build a parallel gate. |
| 04 | High | The daemon already runs a per-tick `capturePane` **heartbeat** (`daemon.ts:98/147/348`) and drives tmux via its own `DaemonTmux` adapter (`adapters/daemon-tmux.ts`, :20) — `harness/driver/tmux.ts` is a separate driver. `DaemonTmux`'s `list-panes` is single-target (`-t`), so connect-diff needs a **new all-pane `-a` query**, not just an id-diff. | Add the pipe-pane tap + `-a` query to `DaemonTmux`; reuse the tick loop; consider riding the existing heartbeat for busy where it already captures. |
| 05 | High | `file-watch-notify` already models "steer-if-busy / immediate-if-idle" injection. | Mirror that posture in the send-gate; keep it decoupled (reference, not dependency). |

### Implementation

**Objective**: Ship per-pane busy/user-typed/connect signals + a queue-on-hold send-gate in the pij daemon, reading from one pipe-pane tap + one list-panes tick.
**Testing Approach**: Lightweight — pure parsers unit-tested against **recorded real stream fixtures** (captured via `pane_tap.py`); one live integration smoke for the gate.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Capture & commit real stream fixtures (busy, idle, human-typing, Enter) per harness from the `pane_tap.py`/`key_events.py` runs | pij-control-plane | `.pi/extensions/pij/core/daemon/__fixtures__/pane-signals/` | ≥1 fixture each for busy/idle/typing/Enter exists and is loadable in a test | Reuse `/tmp/*.raw`, `/tmp/keys_1945.raw`; **re-capture if `/tmp` cleared** (scratchpad scripts must be re-created); per finding 01/02 |
| [x] | T002 | `pane-signals.ts`: **busy-density** classifier — rolling ~1 s byte window → `busy`/`idle` with hysteresis | pij-control-plane | `.pi/extensions/pij/core/daemon/pane-signals.ts` | Unit test: busy fixture → `busy`, idle fixture → `idle`; no flap at burst edges | AC-01; finding 01; consider riding the existing `capturePane` heartbeat (finding 04) |
| [x] | T003 | `pane-signals.ts`: **key/Enter** tracker — parse final `ESC[row;colH` per burst; learn base-col; emit KEY (col↑) / ENTER (col→base) | pij-control-plane | `.pi/extensions/pij/core/daemon/pane-signals.ts` | Unit test: typing fixture → ordered KEY events + composer-len>0; Enter fixture → ENTER | AC-02/03; finding 02 |
| [x] | T004 | Add all-pane `list-panes -a` query to `DaemonTmux`; **connect-diff** — id-set diff each tick; `pane_dead=1` → retire | pij-control-plane | `.pi/extensions/pij/core/daemon/pane-signals.ts`, `.pi/extensions/pij/adapters/daemon-tmux.ts` | Unit test: added id surfaces; dead id retires; `-a` query returns all server panes | AC-04; finding 04 (existing list-panes is single-target) |
| [x] | T005 | Extend `SendBuffer`: per-pane hold state; HOLD **only while composer non-empty (human typing)** — busy does NOT gate; release on ENTER or 60 s keystroke-idle → flush FIFO. Expose the busy bit as a read-only per-pane signal (no gate) | pij-control-plane | `.pi/extensions/pij/core/daemon/router.ts` | Unit test: queued only during human-typing hold, flushed in order on release; a *busy* pane with empty composer is NOT held | AC-02/03; finding 03/05; busy bit exposed for future UI |
| [x] | T006 | Wire the hold into the daemon `deliver`/tick path + per-pane tap lifecycle (attach on connect via `DaemonTmux`, drain parsers each "one pass", detach on retire) | pij-control-plane | `.pi/extensions/pij/daemon.ts`, `.pi/extensions/pij/adapters/daemon-tmux.ts` | Live smoke: spawn peer, type → `pij send` queues; Enter → flush; kill pane → tap gone, no error | AC-01..05; restart daemon (tsx off source, no hot-reload) |
| [x] | T007 | Docs: `docs/how/pij-pane-signals.md` + update `pij-control-plane/domain.md` with the signal + gate contract | pij-control-plane | `docs/how/pij-pane-signals.md`, `docs/domains/pij-control-plane/domain.md` | Both written; domain.md names the busy/typing/connect + gate contracts | Docs strategy |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T002, T006 | busy-density unit test + live smoke |
| AC-02 | T003, T005, T006 | key-tracker + gate unit tests + live smoke |
| AC-03 | T003, T005 | ENTER/idle release + FIFO flush unit tests |
| AC-04 | T004, T006 | connect-diff unit test + live kill smoke |
| AC-05 | T002, T003 | tests assert no capture-pane/CPU path; stream-only |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Caret signature differs per harness | Low | Med | Key on final-caret report; learn row/base-col; per-harness fixtures (T001/T003). |
| Busy threshold flaps | Med | Low | Rolling window + hysteresis; idle is a clean 0-byte gap (T002). |
| Daemon has no hot-reload | Certain | Low | Restart daemon after core edits (known); note in T006. |
