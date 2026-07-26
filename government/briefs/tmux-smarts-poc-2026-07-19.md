# tmux "pane smarts" — POC + signal research (2026-07-19)

**By**: pij-reasonable-dove (o-prime) · **Prompt**: Jordan — get events from all
active tmux panes: (a) is the agent actually busy, (b) has the user typed so we
don't step on them, (c) connect/disconnect as panes come and go. "Some API they
emit… Ghostty does it somehow — don't read contents."

**Verdict: yes to all three, but they split into two very different classes.**
Busy-state has a clean *emitted* API (escape sequences); user-typed does **not**
(input is terminal→app, nothing is emitted) so that half is irreducibly
inspection-based. Connect/disconnect is trivial and clean.

---

## What Ghostty actually does (CONFIRMED FROM SOURCE — ghostty-org/ghostty)

**Ghostty has ZERO autonomous busy detection.** It does not poll CPU, does not
inspect child-process state, and does not infer "busy" from the tty. The spinner
Jordan saw is **entirely app-emitted** — the agent tells Ghostty it's working via
an escape sequence, and Ghostty just renders it. (Initial secondhand framing that
Ghostty "detects" busy via a termios heuristic was **wrong** — corrected here
against the code.)

The "API they emit" is **escape sequences the application writes to its PTY**:

1. **OSC 9;4** — ConEmu progress protocol. App emits `9;4;3` = indeterminate
   spinner (busy), `9;4;0` = clear. Source: `terminal/osc.zig` parses it to
   `Command.ProgressReport`; `Surface.zig:1113` `.progress_report => |v|` forwards
   that *parsed* report to be rendered. **Nothing but the OSC parser ever sets
   it** — 100% app→terminal. Ghostty even hardcodes a ~15s stale-timeout because
   it *cannot* know when the emitting program died. AI-agent packages already do
   exactly this (`pi-terminal-signals`, `pi-ghostty`: `9;4;3` while thinking,
   `9;4;0` when done).
2. **OSC 133** — semantic prompt marks. `133;A`=prompt ready, `133;B`/`C`=command
   running, `133;D`=done. Shell/app-emitted turn boundaries. Also purely
   protocol-driven.
3. **termios `tcgetattr`** — the *only* OS-level tty read in the tree
   (`pty.zig:201`, ICANON). It does **not** drive busy state: its sole consumer is
   `termio/Exec.zig:370` `password_input = canonical and !echo` — i.e.
   **password-prompt detection**, nothing to do with a spinner.

**The takeaway: there is no free lunch.** Ghostty knows an agent is busy *only*
because the agent emits OSC 9;4. Anything pij wants at the terminal layer, our
agents must emit too — or pij infers it itself (CPU/scrape). Nothing is inferred
for free.

## The catch for pij: tmux passes OSC through, doesn't store it

tmux does **not** interpret OSC 133 or OSC 9;4 — no format var exposes them. It
forwards the bytes to the outer terminal. Two consequences, both proven in the POC:

- To read an emitted signal, pij must **tap the pane's raw byte-stream via
  `tmux pipe-pane -o`** (streams output bytes, incl. escape sequences, to a
  process — that's control-stream parsing, *not* rendered-screen scraping).
- **But a TUI agent owns the PTY.** POC finding: a *child* process's OSC bytes
  never reached the pane (claude-code renders frames and owns the tty). So an
  OSC busy-bit only exists **if the agent itself emits it**. claude-code shows a
  spinner as rendered frames; whether it emits OSC 9;4 is unconfirmed (likely
  not by default).

## POC results (this tmux server, 109 panes, live)

| Capability | Method | No-scrape? | Result |
|---|---|---|---|
| **Connect / disconnect** | `list-panes -a` id-set diff on tick | ✅ | **works** — spawned+killed a window, caught on both edges (`%1934`) |
| **Agent busy — best** | OSC 9;4/133 emitted by agent, tapped via `pipe-pane` | ✅ | works **iff agent emits**; needs an emission convention we don't yet have |
| **Agent busy — universal fallback** | foreground proc-group CPU% over a 1–2s window | ✅ | **works**: me 10.5% (busy) vs idle panes 0%. **Spiky** — codex read 0% mid-burst; MUST smooth over a window, not instantaneous |
| **Shell vs TUI** | `tcgetattr` canonical-mode check | ✅ | clean but coarse (doesn't split busy-vs-idle *within* a TUI) |
| **Output activity age** | `#{window_activity}` delta | ✅ | coarse; counts agent output as "activity" |
| **User typed pending input** | `capture-pane` composer region + `cursor_x` | ❌ scrape | **works per-harness**; claude's `❯ ` box is reliable. **No emitted API exists** — input is terminal→app |

Bonus: claude's status line renders `… • Opus 4.8 • high • 70k/1.0M` — a
**scrapeable runtime-model** signal (feeds the model-provenance keystone; same
per-harness-capability shape mastodon is mapping).

## The honest split (the design point)

- **"Is the agent busy?"** → *emitted* signal exists. Right move: get agents to
  emit **OSC 9;4** (some ecosystems already do), tap via `pipe-pane`; fall back
  to **CPU-over-window** for agents that don't. Retire the fragile per-harness
  spinner-regex scrape.
- **"Did the user type?"** → *no* emitted signal (nothing is written on
  keystroke except the echo). This half **irreducibly** needs composer
  inspection or a coarse input-echo-activity heuristic. Be honest that it can't
  be made a clean bit.
- **Connect/disconnect** → `list-panes` diff on the daemon tick. Ship as-is.

## Recommended pij "pane smarts" architecture

1. **Busy bit** — define an OSC 9;4 emission convention for pij-spawned agents
   (confirm per-harness who already emits; add a wrapper for those who don't);
   daemon taps live panes via `pipe-pane` and parses the control stream.
   **Fallback**: CPU-over-1.5s-window when no OSC. Both no-scrape.
2. **Send-safety gate ("don't step on the user")** — composer inspection is
   unavoidable for the input half, but *gate* it per Jordan's rule: HOLD only if
   composer non-empty **and** (input-echo activity <60s **or** composer changed
   <60s ago); else the **timeout releases**; composer clearing (**Enter**) =
   **immediate release**. Corroborate with `cursor_x` and `in_mode` (copy-mode =
   user scrolling = HOLD).
3. **Connect/disconnect** — id-set diff on tick; `pane_dead=1` → retire.

Applies mastodon's standing rule directly: every signal needs a defined
**"cannot determine"** behaviour = *degrade-and-declare*. Here: composer
unparseable → declare UNKNOWN, fall back to the activity-age timeout (never
block forever, never silently send).

## POC artifact

`scratchpad/tmux-smarts.sh` (probe|all|diff) — harness fingerprint, busy state,
composer pending-input, send-safety verdict, connect/disconnect diff. Ran live
across all 109 panes. Not production; the busy-detector there is the fragile
scrape path this brief recommends replacing with OSC + CPU.
