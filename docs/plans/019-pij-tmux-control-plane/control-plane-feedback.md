# Control-plane feedback — live dogfood (flow-pair review run)

Source: a heavy control-plane run by a peer Claude Code orchestrator (`pij-ch0169`)
driving a flow-pair review — Claude orchestrator + a spawned Copilot/GPT-5.5
reviewer in a tmux split. Collected 2026-06-27 over the pij control plane itself
(`pij send` round-trips). Ranked by the peer.

## ✅ Done (landed + live-verified this session)

### 1. `E-AMBIG cannot resolve self` on every `pij send` — FIXED
The error was correct but not actionable; the fix (`export PIJ_SESSION_ID=<me>`)
wasn't in the message, so every send needed ceremony when several local sessions
shared a cwd.
- **Fix:** `resolveSelf` now disambiguates by **`$TMUX_PANE`** — an adopted/spawned
  control-plane session records its `paneId`, so `pij` invoked from that pane
  resolves to itself with **no export** (`core/discovery.ts`). When still
  ambiguous, the error lists the **candidate ids + the exact `export` line +
  the `pij adopt` hint**.
- **Verified:** live, bidirectionally — sends from two independently-adopted
  Claude panes with no `PIJ_SESSION_ID` on either side. Unit tests added.

### 4. "peer is stale but alive — will see it on next read" reads alarming — FIXED
"stale" is *normal* for a control-plane peer (claude/copilot don't write pij
`events.ndjson`, so `lastEventAt` is always null).
- **Fix:** reworded to *"note: no recent pij events from peer — normal for a
  control-plane peer; the send still lands"* (`core/cli.ts`).

## 📋 Fix-asks (deferred — plan, don't patch blind)

### 2. Copilot first-run "Confirm folder trust" gate is NOT covered by `--yolo`
The daemon correctly flagged `needs-human(folder-trust)` but couldn't advance; the
human had to `tmux send-keys` Down/Enter to pick "Yes, and remember". `--yolo`
(= --allow-all-tools/paths/urls) does **not** dismiss this pre-session trust menu.
- **Ask:** either (a) pre-seed Copilot's trust store for the cwd before spawn so the
  menu never appears, or (b) have the daemon **drive that specific menu** (it
  already *detects* the state) — send Down+Enter to select "Yes, and remember"
  when readiness classification sees the folder-trust footer. Prefer (a) if Copilot
  exposes a config/flag; (b) is the deterministic fallback.
- **Risk:** menu layout/wording drift across Copilot versions; driving keystrokes is
  brittle. Pre-seeding config is more robust if it exists. Touches: readiness
  classifier (detect), daemon loop (drive), spawn (pre-seed).

### 3. Silent bad `--model` → healthy-looking useless worker
A wrong model name is accepted at spawn, the bogus name even shows in the footer,
the ready-ping passes, then it **400s only on the first real inference**. Cost stays
`0.00` (so no fallback engaged) — you get a canary that *looks* healthy but can't
work.
- **Ask:** **spawn-time model validation** — reject/flag an unknown `--model` before
  binding (validate against `pi list-models` / the copilot/claude model registry),
  **or** surface the first-inference 400 as a **bind failure** (not a healthy bind).
  This kills the "canary dance" of manually probing a new worker.
- **Risk:** model lists drift / are harness-specific; validation must be a warning
  path that still allows a deliberately-novel name. Touches: spawn (validate),
  daemon loop (promote first-inference 400 → bind-failed state).

### 5. `compact-self` no-arg probe fired `/compact` unexpectedly
Exploring the verb (a no-arg invocation) fired `/compact` into the peer's own pane —
accidental self-compaction during exploration. (The intended path worked well:
fired `/compact` + queued the follow-up reliably.)
- **Ask:** a `--dry-run` (print what it *would* type, send nothing) and/or a confirm
  when invoked with no instruction, so probing the verb can't nuke your context.
- **Risk:** must not break the working queued-follow-up path; `--dry-run` is additive.

### (bonus) Registry auto-prune — self-cleaning registry
80 sessions accumulated from dogfooding; `pij list` became unreadable. Manually
pruned 70 dead-pid entries this session.
- **Ask:** the **daemon** GCs the registry on its existing tick — drop any descriptor
  whose pid is dead **and** (control-plane) whose tmux pane no longer exists, after a
  short TTL (~5 min so a blip doesn't evict a live one). **Never** evict on `stale`
  liveness alone (normal for claude/copilot peers). Same "transient state cleans
  itself" theme as the Cut #1 inbox fix. Touches: daemon loop (GC pass), lifecycle.

## Overall

The peer's verdict: the control-plane path (daemon + adopt + spawn + send-keys relay)
held up across a full review cycle. The friction was all at the **edges** —
self-identification, model/trust validation, and wording — not the core relay.
