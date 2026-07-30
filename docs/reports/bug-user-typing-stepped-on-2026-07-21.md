# BUG — pij delivery stepped on the human while typing (userTyping hold failed)

**Filed**: 2026-07-21 by pij-reasonable-dove (o-prime), on Jordan's report.
**Severity**: High — the pane-signals / CaretTyping work was landed specifically to make this
"impossible", so this is a regression/gap in a shipped guard.

## What happened
Jordan was typing a message in the **o-prime pane** (`pij-reasonable-dove`, a Claude-Code harness
pane) and a pij delivery injected into the pane and **stepped on his input**. During this window the
seat was receiving a burst of pushed turns (omp seat responses `pij-extra-tiglon`, an araminta death
notice, copilot ready-pings, receipts) while Jordan composed.

## Why it should have been impossible
`core/daemon/pane-signals.ts` implements human-typing detection — `CaretTypingTracker`, `isTyping()`,
`USER_TYPING_IDLE_MS`, `parseCaretPositions` — and the daemon surfaces it as a delivery signal
(`daemon.ts:725 userTyping: signal.userTyping`; delivery port hold logic near `daemon.ts:497`).
Intent: while `isTyping()` is true, hold delivery so the human is never stepped on.

## LEADING hypothesis (Jordan, 2026-07-21) — omp-specific detection gap
The daemon can't detect typing/busy in an **omp** pane because omp's composer differs from
what the pi parser expects. Supporting evidence:
- `pane-signals.test.ts` iterates `HARNESSES = ["claude", "copilot", "codex", "pi"]` — **there is
  no `omp`**. omp self-registers as `harness:"pi"`, so the daemon runs the **pi** `parseCaretPositions`
  / busy fixture against it.
- omp's actual status-bar/composer is **visibly different** from npm-pi's (omp footer observed:
  `╭── <pij-id> > ⬢ <Model> · ◒ <effort> > ⑂ <branch> … ▶─╮`). If the pi caret/prompt parser doesn't
  match omp's rendering, `isTyping()`/busy **false-negatives on every omp pane** → the daemon
  believes the pane is idle and injects, stepping on the human (or agent).
- This makes it an **omp-first-class detection concern** — natural owner is the s062 stream / tiglon,
  who is already in the daemon + omp. Fix likely needs an `omp` harness case in pane-signals with its
  own caret/busy fixture, OR a shared parser that handles omp's composer.
- **To confirm:** reproduce a delivery into an omp pane while typing; check whether `CaretTypingTracker`
  sees keys from omp's composer bytes. Add an `omp` fixture + regression.

## Earlier hypotheses (still possible — for the Claude-Code pane case)
1. **Composer/caret parse gap for the Claude-Code harness pane.** `CaretTypingTracker` parses caret
   positions from pane content; if the Claude-Code composer's caret/prompt isn't parsed the way the
   fixtures assume, `isTyping()` false-negatives for exactly the o-prime pane the human uses most.
   (The pane-signals tests iterate `HARNESSES` — confirm Claude-Code composer coverage is real, not
   just pi/copilot/codex.)
2. **Delivery path bypasses the userTyping hold.** Some push paths (steer/inject, receipts, death
   notices, watchdog) may not consult `userTyping` before send-keys. Audit every send-keys/inject
   site for the `isTyping()` gate.
3. **Timing / idle-release race.** `USER_TYPING_IDLE_MS` (60s non-empty-composer release) or the
   inter-keystroke window let a delivery fire between keys, or the delivery decision was taken before
   Jordan began typing and injected after he started.
4. **Observability blind spot compounding it:** the o-prime descriptor reports `harness: null`
   (`pij whoami` → harness None) — if harness is unknown, the tracker may not select the right
   composer parser. Same null-provider/null-harness gap seen in the omp binding work.

## Repro context
- Pane: o-prime `pij-reasonable-dove` (Claude Code), heavy inbound pushed-turn traffic.
- Trigger: human typing in the composer while peer deliveries are queued.

## Next
Investigate hypotheses 1–2 first (parser coverage + gate audit). Owner: TBD (candidate for the
s061 / detection-adjacent coder). Add a regression test: an inbound delivery MUST hold while the
Claude-Code composer shows an in-progress human caret.
