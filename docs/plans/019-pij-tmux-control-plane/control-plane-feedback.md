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

## Third run — pij-94dd91 (full cross-model review cycle)

### ✅ Wins (the thesis earning its keep)

- **[BIG] End-to-end cross-model review paid off.** A GPT-5.5 colleague (invoked
  `/frugal` + `/the-flow 7` from the shared `~/.agents/skills`) reviewed a 57-file
  diff, returned a structured `REQUEST_CHANGES` via `pij send` that auto-injected
  into the orchestrator's pane, and **caught a real HIGH data-loss bug** (a
  watermark-skip on interleaved date buckets) that the *other* reviewer (minih)
  **missed** — the independent cross-model second opinion demonstrably working.
- Reply auto-injection (colleague → pane turn) is seamless — no polling for the verdict.
- `pij state` cwd+harness (shipped mid-session) used instead of footer-scraping.
- `pij send --command compact` compacted the reviewer cleanly post-verdict.

### 📋 Fix-asks (this round)

1. **[TOP — magic wand: trustworthy working|idle|done signal]** While the reviewer
   worked, `pij state` showed `idle · stale (last event never ago)` between every
   tool burst, while `pij tail` showed continuous tool calls. **Root cause:** a
   control-plane peer writes **no** pij `events.ndjson`, so the descriptor's `state`
   / `lastEventAt` never update — they reflect the in-process model, which these
   peers don't feed. `idle·stale·never` is *actively misleading*: it cost the
   reporter a **false "done"** in a watcher loop. **Fix (contained — the signal
   already exists):** the **daemon already classifies the footer** (busy
   `◎ Working` vs idle `? help`) for readiness; persist that to the descriptor each
   tick → real `working | idle` (+ a `done` = idle-after-working transition) and a
   true **last-activity-ts** in `pij state --json`. This is the crux of "don't idle
   while a colleague works." Touches: daemon loop (write footer state →
   descriptor), types (a real activity ts), core/cli (surface working|idle|done).
2. **[tail empties right after bind]** `pij tail` returns `(no events)` immediately
   post-bind though the peer is alive; needed `--lines N` + retry. Minor.
3. **[delivery-integrity receipt for big packets]** A long multi-line review brief
   over send-keys worked, but there's no confirmation the colleague received the
   **full, untruncated** text. **Ask:** a bytes-delivered / echo receipt to build
   trust for large packets.

## Overall

The peer's verdict: the control-plane path (daemon + adopt + spawn + send-keys relay)
held up across a full review cycle **and caught a real bug a same-harness reviewer
missed**. The friction was all at the **edges** — self-identification, model/trust
validation, model discovery, wording, and (the new crux) **liveness/working-state
visibility** — not the core relay. Two highest-priority themes across all three runs:
**(a) make the bound model fail-loud and first-class**, and **(b) give control-plane
peers a trustworthy `working | idle | done` + last-activity signal** (the daemon
already has both signals — footer model and footer busy/idle — it just doesn't
persist them).

## Fourth run — flow-pair coder (pij-1f3q58b) — RESOLVED: false "exited (quota)" on a live, working session

### Symptom

A spawned claude coder (Opus 4.8, control-plane) was actively building (footer
`✽ Schlepping… 16m · ↑76.5k tokens`, `pij state` = `working · active · last event
5s ago · pid alive`) when the daemon pushed **`💀 pij-1f3q58b has exited (reason:
quota). The session is dead and will not recover.`** to the creator and stamped a
**sticky `failure: quota`** on the descriptor. The session never died — it hit a
transient rate-limit, the harness retried through it, and it kept making forward
progress. The death notice was simply wrong (and the most dangerous wording —
"will not recover" — for a 429 that did recover).

### Root cause — the provider-failure peek classifies on scrollback text alone, with no liveness corroboration

`PijDaemon.pushProviderFailure` (`daemon.ts:175`, the FIX-A / DL-005 peek) runs
every tick for any spawned+paned session: it captures the pane and calls
`classifyDeathReason` (`state.ts:84`). `QUOTA_RE` (`state.ts:75`) matches the
**retryable** error class — `429`, `overloaded`, `529`, `rate_limit_exceeded` —
which is exactly what Claude Code prints *then auto-retries through*, leaving the
text in scrollback. The peek treats `quota` as `isFatal` (`daemon.ts:183`) and
immediately fires `buildDeadNotice` + persists `failureReason`. Two defects:

1. **Transient ≠ terminal (core bug).** The peek has **no liveness corroboration**.
   The *dead* branch is correctly gated on `!pidAlive` (authoritative, `daemon.ts:135`);
   the *provider-failure* branch fires on scrollback pattern alone even while the
   pid is alive AND `lastEventAt` is advancing AND `state === "working"`. A session
   that is *demonstrably still progressing* cannot be terminally dead — but the peek
   declares it so. (The "Retrying… → unknown never fires" guard at `daemon.ts:172`
   is defeated: the sibling `429/overloaded` line on the same screen still matches
   `QUOTA_RE`.)
2. **Sticky, never reconciled.** Once `failureReason` is written and the
   `provider-failure` latch is set, nothing clears them when the session keeps
   emitting events / flips back to `working`. `pij state` shows `failure: quota` on
   a healthy session indefinitely.

Why our just-shipped work didn't catch it: FIX-A/DL-005 was built for **Case-3** —
a worker that hits a *fatal* error then **sits idle forever** (pid alive, never
stalls, never dies), invisible to the dead/stalled branches. That case is real and
the fix is right *for it*. But it keys on **pattern alone**, so it can't tell
"hit fatal error and is now stuck idle" from "hit transient error, retried, still
working" — and over-fires on the latter.

### Fix direction (feeds plan 023 fail-loud-model)

- **Require non-recovery evidence before declaring terminal death.** Only fire the
  provider-failure death notice when the pattern persists AND the session is *not*
  progressing — e.g. `state !== "working"` AND `lastEventAt` stale past a threshold
  (mirror the stalled-branch corroboration). A session with events advancing is
  never "will not recover".
- **Split retryable vs terminal inside `QUOTA_RE`.** `429`/`overloaded`/`529`/
  `rate_limit_exceeded` are *transient* (harness retries); only the
  `insufficient credit|balance|billing|prepaid|payAsYouGo` subclass is truly
  unrecoverable. Classify the transient class as non-fatal (or fatal-only-when-stuck).
- **Reconcile the flag on recovery.** When a session with `failureReason` set
  resumes emitting events, clear `failureReason` and the `provider-failure` latch
  (liveness wins over a stale scrollback line).
- **Soften the wording** until non-recovery is proven: "appears stuck on a provider
  error (quota)" ≠ "has exited … will not recover".

### Resolution — 2026-06-28

Plan 024 fixed the false death path while preserving the real Case-3 terminal-error
push:

- `classifyDeathReason` now treats retryable provider overload/rate-limit text
  (`429`, `overloaded`, `529`, `rate_limit_exceeded`) as non-fatal `unknown`, while
  terminal credit/billing/balance text remains `quota`.
- `Daemon.pushProviderFailure` no longer notifies while the descriptor is
  **working**; terminal idle provider-error Case-3 remains eligible so a stuck worker
  still fails loud.
- Recovery now clears stale provider-failure state: `failureReason` is removed and
  the `provider-failure` latch is dropped when the session is working again.
- Provider-failure notices now say the peer **appears stuck on a provider error**;
  only authoritative pid death keeps the "has exited / will not recover" wording.
