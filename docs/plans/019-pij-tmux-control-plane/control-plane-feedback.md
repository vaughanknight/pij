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

## Second run — pij-94dd91 (Claude orchestrator, substrate/harness-engineering)

A separate dogfood; its **magic wand independently matched run #1's #3** — silent
wrong-model is the single most dangerous thing (a correctness bug masquerading as a
healthy worker).

### ✅ Done (landed + live-verified)

- **#4 cwd not exposed** → `pij state` (and `--json`) now report **`cwd` + `harness`**
  as first-class fields (the data was already stored as `folder`; no footer scraping).
- **#6 discovery friction** → `pij spawn --help` now prints spawn usage (was
  `--help needs a value`); `pij --version` now prints the version (was unknown
  command). Bare `pij`/`--help` already print the full surface.

### 📋 Fix-asks (deferred — prioritised)

1. **[TOP — fail loud on bad `--model`]** `pij spawn --harness copilot --model glm-5.2`
   silently launched GPT-5.5; `state`/`list`/`tail` never surfaced the bound model, so
   you ship a reviewer running the wrong model and never know. **Ask:** reject an
   unknown `--model` at spawn (no silent harness-default substitution) **and** record
   the **bound** model on the descriptor so `state/list --json` report it. NB: expose
   the *bound* model (read from the footer / ready-ping), **not** merely the
   *requested* one — surfacing the requested model alone would show `glm-5.2` while the
   worker runs GPT-5.5, **amplifying** the bug. This is why the model field is bundled
   here, not shipped with #4. (Corroborates run #1's #3.) Touches: spawn (validate),
   daemon loop (footer→bound-model, promote mismatch to a warning/bind-failed), types
   (descriptor `model`), core/cli (surface).
2. **[BLOCKER — can't spawn a `pi` colleague]** `pij spawn --harness pi …` →
   `E-ARG: --harness must be claude|copilot`. A Claude/Copilot orchestrator has **no
   documented path** to spawn a pi colleague (e.g. pi on GLM-5.2), so "use a pi
   colleague on GLM" is unreachable from a non-pi orchestrator. **Ask:** add `pi` as a
   spawnable control-plane harness (launch the `pi` CLI in a pane, drive via send-keys
   like claude/copilot) + document it. Meatier — pi's readiness/transcript differ.
3. **[model discovery]** nothing lists a harness's accepted models; the skill only
   documents `github-copilot/*` strings (GLM/pi undocumented). **Ask:** a `pij models
   [--harness h]` verb (or skill pointer to `~/.pi/agent/models.json` + the copilot
   list). Pairs naturally with fix-ask #1's validation.
4. **[layout flag]** pi-mode `pij_spawn({layout:'split'})` has no CLI equivalent;
   `pij spawn` can't honour "spawn to the right". **Ask:** a `--layout split|stack`
   (or `--right`) flag mapping onto the existing `planControlSplit` geometry.

> **Retracted by the reporter:** an initial "cross-harness skill gap" note (a Copilot
> reviewer can't run `~/.claude` skills) was **wrong** — skills live in the shared
> `~/.agents/skills/`, which every harness loads. No gap; no doc change.

## Overall

The peer's verdict: the control-plane path (daemon + adopt + spawn + send-keys relay)
held up across a full review cycle. The friction was all at the **edges** —
self-identification, model/trust validation, model discovery, and wording — not the
core relay. The recurring, highest-priority theme across both runs: **make the bound
model fail-loud and first-class.**
