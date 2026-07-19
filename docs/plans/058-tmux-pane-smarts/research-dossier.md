# Research dossier — tmux pane smarts

**Flow**: 058-tmux-pane-smarts · **Started**: 2026-07-19 · running ledger, updated as we probe.
Seed brief: `government/briefs/tmux-smarts-poc-2026-07-19.md` (o-prime pij-reasonable-dove).

## Goal (three signals, per pane)
1. **Busy** — is the agent actually working?
2. **User-typed guard** — did the human type in the pane recently? If so, don't send and step on their input. Release on 1-min idle OR Enter (composer clears).
3. **Connect/disconnect** — panes created/removed during pij management.

## Architecture (settled)
No free lunch — pij must read the same emitted signal a terminal renders. All no-screen-scrape:
- **Busy tap**: `tmux pipe-pane -o -t <pane> '<sink>'` fans the pane's raw PTY byte-stream; parse control sequences (`ESC]…`) out of it. One emission serves both the human's terminal spinner AND pij's busy-bit.
- **CAVEAT (dove-verified)**: a *child* process's OSC never reaches the pane — the TUI agent owns the PTY. Emission must come from the agent itself.
- **Busy fallback (universal)**: foreground proc-group CPU% over a 1–2s window. Spiky — smooth over a window, never instantaneous.
- **User-typed** (⚠️ UPGRADED 2026-07-19 — see "User-typed guard" section below): initially scoped as `capture-pane` composer scrape. **Live probing found a better path**: keystrokes are recoverable from the *same pipe-pane stream* (the TUI echoes each key as a redraw burst; the caret-column report tracks composer length). HOLD if composer non-empty; release on Enter (caret col resets) or 60s keystroke-idle; `in_mode=1` (copy-mode) = HOLD.
- **Connect/disconnect**: `tmux list-panes -a -F '#{pane_id}'` id-set diff per daemon tick; `pane_dead=1` → retire.

## Harness busy-dialect matrix — the core empirical finding

| harness | busy signal | mechanism | status |
|---|---|---|---|
| **pi** | **stream-flow density** (NO OSC 9;4 under tmux — hypothesis CORRECTED) | busy = heavy stream churn; idle = 0 bytes. Emits OSC 133 (prompt marks) + OSC 8 (hyperlinks), neither a busy bit. Zero OSC 9;4. | ✅ **SOLVED — live-probed 2026-07-19** |
| **claude-code** | **animated OSC 0 title churn** | title reset ~10–50×/s with a rotating braille-spinner glyph prefix while working; churn → 0 when idle. **Zero OSC 9;4.** | ✅ **SOLVED — live-probed 2026-07-19** |
| **copilot** | **raw stream-flow density** (no OSC) | full-frame TUI repaint while busy → continuous pipe-pane bytes; **idle = 0 bytes**. Zero OSC 9;4, title set once (not animated). | ✅ **SOLVED — live-probed 2026-07-19** |
| **codex** | **animated OSC 0 title + stream-flow** (no OSC 9;4) | braille-spinner title churn (like claude) **and** full-TUI repaint (like copilot); idle = 0 bytes | ✅ **SOLVED — live-probed 2026-07-19** |

### claude-code — solved (evidence)
Probed live against peer `pij-rear-mosquito` (claude-code haiku, pane %1936) via `pane_tap.py`.
- **Emits zero OSC 9;4.** It renders its own frame spinner; busy is signalled by animated **OSC 0** (window-title) updates.
- While working: title is re-set at **9–50 events/sec** (measured: 368 title events over ~13s during a 1→50 counting task; peak 50/s). Each title = `ESC]0;<spinner-glyph> <activity text>`. Spinner glyphs cycle braille frames (`⠐ ⠂` = U+2810/U+2802) + accent `✳` (U+2733).
- **The busy bit is the churn RATE, not the content.** Activity *text* stayed pinned at a coarse context title ("Configure pij peer communication bindings") the whole task — not a live per-step label.
- **Idle transition is clean**: churn falls to 0 when work ends (last title event, then silence; `pij state` → idle). Confirmed.
- **Daemon recipe for a claude pane**: `pipe-pane -o` → count `ESC]0;` hits over a rolling 1s window → nonzero = busy, zero = idle. No CPU poll, no screen scrape, one cheap regex.

### copilot — solved (evidence)
Probed live against peer `pij-nuclear-earthworm` (copilot gpt-5.6-luna, pane %1937) via `pane_tap.py` + raw-stream census.
- **Emits zero OSC 9;4.** Sets OSC 0 title exactly **twice** (boot) — no animation. So neither of the two OSC dialects above apply.
- Copilot runs a **full-screen TUI**: the raw stream is dominated by cursor hide/show (`ESC[?25l`/`ESC[?25h`, 655 pairs) wrapping frame repaints.
- **The busy signal is stream-flow density itself.** Measured: **idle = 0 bytes / 3s** (TUI fully static when not working); busy = continuous repaint flow 500–6800 B/s. A rolling-window byte count on the pipe-pane stream gives busy/idle with **no OSC and no screen scrape**.
- Secondary confirm (screen scrape, if needed): copilot's footer shows an interrupt hint while busy (memory: `esc interrupt`, BUSY_RE). Idle footer: `<n>% pij ⎇ main ⛓ <id> • gpt-5.6-luna · high` / `1.1M context • high • 33k/1.1M • 6.95 AIU`.
- **Bonus**: footer renders live runtime model + context + effort + AIU spend — scrapeable.

### 💡 Unifying insight — stream-flow density is a near-universal busy bit
Both solved harnesses reduce to **one signal from the one tap**: bytes flowing on the `pipe-pane -o` stream over a rolling ~1s window.
- claude-code: churn is OSC 0 title resets (~10–50/s busy, 0 idle).
- copilot: churn is TUI frame repaints (hundreds of B/s busy, **0 B/s idle**).
Different *content*, same *shape*: **busy ⇔ stream active; idle ⇔ stream silent.** A byte-density watcher on the pipe-pane stream is harness-agnostic; the OSC-9;4 parse (pi) and title-parse (claude/codex) are refinements layered on top when a semantic bit is wanted.

**Confirmed on 4/4 harnesses (claude, copilot, codex, pi): idle = 0 bytes on the stream, busy = churn.** codex is the shape-clincher (both refinements at once); pi is the *dialect*-clincher.

### ⚠️ Architecture correction — OSC 9;4 is NOT emitted by ANY harness under tmux (0/4)
Dove's brief nominated OSC 9;4 as the "best" busy tap (agents emit it, pij parses `]9;4;`). **Live probing contradicts this for the tmux control-plane pij actually uses:**
- **claude, copilot, codex, pi ALL emit zero OSC 9;4** on the pipe-pane stream — verified byte-for-byte, including turn-opening bytes.
- Likely cause: agents gate terminal-specific progress sequences on `$TERM`; under tmux they see `screen`/`tmux-256color`, not Ghostty, and suppress OSC 9;4. (Ghostty's blue bar in dove's *direct* (non-tmux) screenshot is real — but that path isn't available to a tmux-mediated pij.)
- **Consequence: the OSC-9;4 tap is not the primary path for pij.** The **stream-flow byte-density watcher IS the primary, universal busy signal** — it needs no agent cooperation and works on all four harnesses today. The OSC/title parses (claude/codex animate OSC 0; pi emits OSC 133/8) are secondary *enrichments*, not the load-bearing signal.

Different *content*, same *shape*: **busy ⇔ stream active; idle ⇔ stream silent.** The one `pipe-pane -o` tap + a rolling ~1s byte-density window is harness-agnostic.

### pi — solved (evidence)
Probed live against peer `pij-corporate-swallow` (pi harness, model `github-copilot/gpt-5.6-luna`, pane %1944). Clean-from-byte-0 capture.
- **Zero OSC 9;4** (hypothesis corrected — see above).
- OSC traffic is **OSC 133** (shell-integration/semantic prompt marks, 188×) + **OSC 8** (hyperlinks, 666×) — neither indicates busy. No OSC 0 title animation.
- Busy = heavy stream churn (2–81 KB/s during the turn); **idle = 0 bytes / 3s.**
- **Model-id lesson**: pi is provider-qualified — its providers are `github-copilot / sakana / openrouter / local` (NO bare `copilot`). A copilot model MUST be spawned as `--model github-copilot/gpt-5.6-luna`; the bare `gpt-5.6-luna` fails to resolve → runtime "No API key found". Source of truth: `~/.pi/agent/models.json` (`providers.github-copilot.models[]`). Footer `$0.000 (sub)` confirms it ran on the Copilot subscription.

### codex — solved (evidence)
Probed live against peer `pij-medieval-kite` (codex gpt-5.6-luna, pane %1940). Clean-from-byte-0 capture of a fresh turn (per Jordan: let it idle, then start fresh — start-of-turn emission would be missed mid-turn).
- **Zero OSC 9;4** — including in the opening bytes of the turn (no start-of-turn busy escape).
- **Animates the OSC 0 title with a braille spinner** (like claude): 1199 title events, 11 distinct = spinner frames `⠧⠦⠇⠏⠋⠸⠙⠹⠹` + the cwd basename (`scratchpad`). Content = spinner + dir, not a live activity label.
- **Also repaints the full TUI** (like copilot): 6–9 KB/s of stream while working.
- **Idle = 0 bytes / 3s.** Clean.
- **Gotchas hit** (see Operational notes): codex self-update nag blocks bind; `latest` npm tag is a broken win32-only alpha; MCP startup delays first-turn readiness.

## Probe protocol note (context discipline — user feedback 2026-07-19)
When working a peer for a busy-signal probe, instruct it to **write its output in its own pane and reply only `done`** — never echo the full result back through `pij send` (that burns the orchestrator's context for no gain; we only need the busy *signal*, not the content).

## Useful tmux format vars (dove-verified live)
`pane_current_command` (Claude Code panes carry version string e.g. `2.1.211`; raw `node` = other agents), `cursor_x`/`cursor_y` (composer caret), `window_activity` (output-age epoch), `in_mode` (copy-mode), `pane_dead`, `pane_pid`, `pane_tty`. Bonus: claude's status line renders `… • Opus 4.8 • high • 70k/1.0M` — scrapeable runtime model.

## Artifacts
- Tap parser (handles OSC 9;4 + OSC 0 title + BEL in one pass): `scratchpad/pane_tap.py`
- Captured claude events: `scratchpad/tap_events.jsonl` · raw bytes: `/tmp/pane_tap_1936.bin`
- Ghostty source clone (busy-detection proof): see brief.

## Operational notes / gotchas (codex spawn, 2026-07-19)
1. **codex self-update nag blocks bind.** On spawn codex shows a menu (`1. Update now / 2. Skip / 3. Skip until next version`) with option 1 pre-selected; pij flags it `needs a human: update-prompt` and bind stalls. Dismiss with raw keystrokes (`tmux send-keys -t <pane> Down Down Enter` → option 3), NOT `pij send` (that's a message turn, not TUI navigation).
2. **`npm i -g @openai/codex` is a trap right now.** The `latest` dist-tag points at `0.145.0-alpha.4-win32-x64` (Windows-only) → `EBADPLATFORM` on darwin-arm64. Do NOT "Update now". Installed 0.144.1 works. (OpenAI publish bug, not local.)
3. **MCP startup delays first-turn readiness** — codex boots MCP servers ("Starting MCP servers 2/3… esc to interrupt") before the composer accepts input; keystrokes bounce until it clears. `flowspace` MCP fails to handshake (separate issue).
4. **Probe cleanly**: let the peer go idle, reset the tap (truncate), THEN fire a fresh turn — so byte 0 == turn start and any start-of-turn OSC is captured.

## Open next steps
Busy-dialect matrix is **COMPLETE (4/4)**. Remaining to design/build:
1. **Busy watcher** — implement the primary path: one `pipe-pane -o` per pane → rolling ~1s byte-density window → busy/idle. (Enrichment layer optional: OSC 0 title text for claude/codex.)
2. **User-typed guard** — PROVEN via stream key-events (below), not composer scrape.

## User-typed guard — mechanism proven (live, 2026-07-19)
The initial plan was a `capture-pane` composer scrape. Live probing found a cleaner, stream-native path that rides the **same `pipe-pane` tap** as the busy signal — no separate poll, no keylogger:
- A TUI **echoes every keystroke** as a redraw burst on its PTY output. Each burst carries the echoed char + a **final caret report `ESC[<row>;<col>H`**.
- **KEY** = a burst whose caret column **moved** on the composer row (col **increments** per key; backspace decrements).
- **ENTER/submit** = the caret column **resets to base** (composer clears) — corroborated by the agent flipping to busy (title spinner churn begins).
- **Verified live** against a claude peer: reconstructed the full typed string `kadsflsdfsdfkjdsfkjdjfljsdfjkwlrwer` key-by-key with per-key composer cursor column, and detected the Enter/submit boundary.
- Detector prototype: `scratchpad/key_events.py` — gate + queue (HOLD on first KEY, release on ENTER or 60s keystroke-idle, queued pij message flushes on release). ⚠️ **Not yet run end-to-end live** (user stepped away mid-test); the per-keystroke extraction IS proven from captured bytes.
- Harness-agnostic basis: keys on the *final caret report* every TUI emits; composer row/base-col are **learned** from the idle caret, not hardcoded.
3. **Connect/disconnect** — `tmux list-panes -a -F '#{pane_id}'` id-set diff per daemon tick; `pane_dead=1` → retire.
4. Move to **plan** — design the daemon integration against these three.
