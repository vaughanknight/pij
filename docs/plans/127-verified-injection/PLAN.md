# s127 — Verified injection (plan-lite, gap analysis vs upstream s064)

> **PARTIALLY SUPERSEDED by s179 (`docs/plans/179-upstream-merge/PLAN.md`).** Kept as
> the historical record — do not read section B2's vocabulary as current.
>
> The **behaviour** below is live and load-bearing: submission verification for every
> harness (the deleted `if (!wake) return "confirmed"`), the ghost-text tail break, the
> generalised warning, and the lock heartbeat all survived the 89-commit upstream merge.
>
> The **word** did not. `injected-unverified` was minted here because `unverified` then
> meant "the send threw before typing". Upstream plan 071 D7 split that throw path into
> `failed`/`gone`, leaving `unverified` to mean precisely what this plan called
> `injected-unverified` — typed, submission unconfirmed, consumed at-most-once. s179
> retired the extra word rather than carry two names for one state. The honesty
> invariant this plan exists to protect is unchanged: **never `delivered` for
> unsubmitted text.**

**Stream**: s127 · **Branch**: `fix/verified-injection` off `99d5f1e` (local main = s113 media stack + upstream **5abb38e / s064** merged).
**Process**: plan-lite → STOP for prime GO → exec. Surgical only. NEVER merge; gate-green + HEAD SHA to prime.
**Fences**: injection path + receipt states + heartbeat touch. Daemon is LIVE — no restart, no `~/.pij` writes during dev; prime owns deploy. No architecture rework, no watchdog rework, no registry/dissolution changes.

---

## A. Gap analysis — what 5abb38e (s064) closed vs what's still open

`5abb38e` touched `loop.ts`, `pane-signals.ts`, `router.ts`, `watchdog-manager.ts`, `daemon.ts` + fixtures/tests.
It **did NOT touch `adapters/daemon-tmux.ts` or `adapters/tmux-keys.ts`** (last change: `5c9cd40`). Re-verified on the rebased tree.

### #40 defects s064 CLOSES (goes in prime's upstream comment as "fixed upstream")
- **Defect 1 — over-hold / typing-guard blocks idle panes.** `SendBuffer.isPaneHeld(paneId, nowMs)` now expires holds at `USER_TYPING_IDLE_MS`; `refreshRenderedComposerHold` releases on authoritative-empty and never reasserts; 60s expiry wins unconditionally even with text visible. (router.ts, loop.ts, pane-signals.ts)
- **Defect (orchestrator stall).** `SendBuffer` releases stale/untimestamped holds so unattended push-driven orchestrators flush without a human composer clear.
- **Self-injection.** Every daemon text injection is now bracketed by a bounded self-injection window (`markSelfInjection`, `SELF_INJECTION_WINDOW_MS = 2_000`), wired through init / resend-phonehome / direct drain / buffered flush via `beforeSelfInjection`. The daemon's own caret mutation no longer acquires `userTyping`.
- **Watchdog flood.** `WatchdogManager` checks the durable unread inbox before firing; drain coalesces duplicate watchdogs; `SendBuffer.enqueue` enforces ≤1 buffered `pij-watchdog` per peer.

### #40 defects STILL OPEN (this stream's scope)
- **Defect 5 — swallowed-Enter delivery lie (claude/codex).** ⬅ **PRIMARY.** Submission verification is **still copilot-only.** In `daemon-tmux.ts:sendTextUnchecked`, line 372 `if (!wake) return "confirmed"` short-circuits claude/codex to a **single Enter with zero verification** — the exact defect that stranded 4 GO messages. The verify+retry machinery (`submissionConfirmed`, `SUBMIT_ATTEMPTS`, poll loop) already exists but only runs for `wake === true` (copilot).
- **Defect 2 — false "daemon stale" verdicts.** No global heartbeat: `daemon.lock` is written once at startup (`wx`) and its mtime is never refreshed. In-repo staleness uses per-session `lastTickAt` (registry), but there is no daemon-wide liveness signal for downstream readers that stat the lock.
- **Ghost/dim descriptors (partial).** Verification oracle for claude must not be fooled by claude's `[2m` dim ghost-suggestion text. (Mitigated below; the broader ghost-descriptor cleanup stays upstream's.)

Out of scope (confirmed staying upstream): Defect 3 (registry/dissolution), Defect 4 (watchdog architecture).

---

## B. The fix (three surgical changes, all in the injection path + receipt seam)

### B1. Extend the EXISTING submission-verification to claude/codex — `adapters/daemon-tmux.ts`
The retry state machine is already harness-agnostic in its core (`submissionConfirmed = paneWentBusy || freshTranscriptEvent`, harness-agnostic Enter re-press). Only the **copilot focus-IN re-assertion** (`wakeCopilotInput` / `sendFocusIn`) is copilot-specific.

Change in `sendTextUnchecked`:
1. **Delete the `if (!wake) return "confirmed"` short-circuit** (line 372) so claude/codex fall through into the same verify+retry loop copilot uses.
2. **Guard the copilot-only wakes** inside the loop behind `if (wake)`: the `wakeCopilotInput(...)` at the top of the `attempt > 0` retry branch (line 367) and the `sendFocusIn(...)` before Enter (line 370). Keep the `WAKE_SETTLE_MS` backoff for ALL harnesses (that IS the brief's "small backoff, bounded retries").
3. The pre-Enter **retype** loop (line 340–357) stays gated behind `wake` — it is safe only for copilot (focus-wedge, pre-first-Enter). Claude/codex type once, then verify+retry Enter only. (Brief: never retype after the first Enter.)

Oracle for claude/codex: a submitted message drives the harness busy → `paneWentBusy` fires; a fast ready→busy→ready turn is caught by `freshTranscriptEvent` (composer emptied + transcript region changed). The loop re-presses Enter only while text is **visibly still pending** and **breaks** on `composerIsEmpty` (ambiguous success → at-most-once, no speculative replay).

**Ghost-text safety (brief's `[2m` caveat):** `capturePane` here runs WITHOUT `-e`, so tmux strips SGR — dim ghost text renders as plain text but the confirm oracle is `paneWentBusy`/transcript-change, which dim placeholder text never triggers. The pending-text check matches the **last-24 non-space chars of the actual payload**, which a generic autosuggest cannot contain. State this assumption in code comment + a test.

**"Enter on an empty Claude composer is harmless" — verified assumption:** Claude ignores Enter on an empty composer (no empty message submitted). The loop already breaks on `composerIsEmpty` before re-pressing, so a stray extra Enter only occurs against genuinely-pending text. Documented in the plan + asserted by the exhausted-path test.

**Self-injection window interaction (brief: "retries must ride inside them"):** The whole `sendText` call — including claude's new loop — is bracketed by the SINGLE `markSelfInjection` that `beforeSelfInjection` already fires before every injection. This is **identical to copilot today**, whose verify loop already runs multi-second inside one 2s window; claude introduces **no new** window violation. Safety net: a *submitted* message leaves an empty composer → `observeRenderedComposer("")` releases, never false-holds. The only residual is a genuinely-**exhausted** (still-wedged) pane whose text remains — and holding/flagging there is correct, not a lie. **No new window logic added** (keeps it surgical). → flagged as a decision for prime below.

### B2. Honest receipt word `injected-unverified` — receipt seam
Today `sendText` returns `"unverified"` for BOTH "tmux threw, nothing typed" AND "typed but submission unconfirmed" — the receipt can't tell a total-miss from an injected-but-unconfirmed. Add a third outcome so the sender gets the truth.

- `core/ports.ts`: `SendOutcome = "confirmed" | "unverified" | "injected-unverified"`.
- `daemon-tmux.ts`: the **retry-exhaustion** path (text was typed, never confirmed submitted) returns `"injected-unverified"` and logs loudly (`⚠️ … injected-unverified`). The outer `catch` (tmux threw before anything typed) keeps `"unverified"`.
- `core/types.ts`: `ReceiptState` gains `"injected-unverified"` (+ optional `injectedUnverifiedAt?`).
- `core/message.ts`: extend `receiptBody` doc + `RECEIPT_RE` to accept the new word; `parseReceiptBody` returns it.
- `daemon.ts:emitSendReceipt`: map `confirmed → delivered`, `injected-unverified → injected-unverified`, else `unverified`. **Never `delivered` for unsubmitted text.**
- Sweep `ReceiptState` consumers for exhaustiveness (render/tail/anomalies) so the new word displays honestly and nothing crashes on it. `DISPATCH_DELIVERY_STATES` (platform) is a separate path — leave untouched unless a switch goes non-exhaustive.

### B3. Heartbeat rider — global daemon-liveness touch
Add a best-effort mtime touch of `~/.pij/daemon.lock` on each **successful** `daemon.tick()`, in `runDaemon`'s interval wrapper (the same loop that drains routes). `utimesSync(lockPath, now, now)` wrapped in try/catch (best-effort; a failed touch never breaks delivery). Only refreshed on a tick that did NOT throw (a throwing tick shouldn't advertise liveness).

**Safe:** `evaluateLock` is purely pid-based (mtime is diagnostics-only, per `LockFile.startedAt` doc) — refreshing lock mtime cannot corrupt single-instance reclaim. Touching the lock (vs a new tick file) fixes existing downstream readers with **zero** coordination. → decision for prime below (lock-mtime vs dedicated `daemon.tick` file).

Additive + tiny per the brief. If it grows, I stop and flag for a split.

---

## C. Tests (pij house pattern — faked `TmuxRunner`, `scriptedTmux` fixtures)
Extend `adapters/daemon-tmux.test.ts` (`scriptedTmux` feeds `capture-pane` outputs; assert exact argv via `typeArgv`/`enterArgv`):
- **claude submitted-first-try:** ready→busy after 1 Enter → `confirmed`, exactly 1 Enter, 1 type.
- **claude submitted-after-retry:** pending-then-busy → `confirmed`, ≥2 Enters, 1 type, **0 clears** (no retype).
- **claude exhausted:** pending forever → `injected-unverified`, 3 Enters, 1 type.
- **claude ghost-text ignored:** dim placeholder in composer not matching payload tail → not treated as pending / not a false confirm.
- **claude empty-composer ambiguous:** empty after Enter, no busy → break, no extra Enter (at-most-once).
- Receipt-word: `emitSendReceipt` / `parseReceiptBody` round-trip `injected-unverified`; `daemon.ts` maps exhaustion outcome → `injected-unverified` receipt (not `delivered`).
- Heartbeat: unit-touch is best-effort (swallows a throwing `utimesSync`); a throwing tick does not refresh.

Run the repo's standard gates (typecheck + full vitest + conformance).

---

## D. Decisions for prime (STOP for GO)
1. **Self-injection window vs claude verify budget** — recommend **reuse copilot's existing budget** (one `markSelfInjection` per delivery; no new window logic). Precedent-matching + surgical. Alternative (tighter claude poll budget under 2s) = more per-harness surface; propose as optional follow-up, not this PR.
2. **Heartbeat target** — recommend **touch `daemon.lock` mtime** (fixes existing downstream stat-readers with no coordination; pid-based reclaim is unaffected). Alternative: dedicated `~/.pij/daemon.tick` file (zero lock coupling, but needs downstream to read it).
3. **`injected-unverified` blast radius** — adding the word to `ReceiptState` touches `message.ts` regex/parser + consumers. Confirm prime wants the full new word (brief says yes) vs. reusing `unverified` + loud-log only.

**Files touched (surgical):** `adapters/daemon-tmux.ts`, `core/ports.ts`, `core/types.ts`, `core/message.ts`, `daemon.ts`, + `adapters/daemon-tmux.test.ts` (and any receipt-render consumer needing exhaustiveness). No `loop.ts`/`router.ts`/`pane-signals.ts` changes (s064 owns those).
