# Plan 157 phase 2: cold-wake guard, live proof and RED → GREEN

## Live proof (worktree build, NOT the production daemon)
- **Setup:** an in-process pij daemon over a `sqlite3 .backup` copy of the production store (taken 2026-09-29, schema 23).
  - The session source is the real `pij_unisphere` adapter on Unisphere 029 at `0d48d80`, as local path deps.
  - tmux and transport are FAKE (asserted at start), so no send could reach a real seat.
- **Run:** for every non-tombstoned Claude seat with a session (48), it sent one real `POST /v1/send` from `pij-yelling-trout`. Built as debug and run under `nice -n 19`.
- **Results:**
  - **18 refused** (HTTP 400, `E-RS-COLD-WAKE`). Every one had more than 300k context, was idle for more than 60 min and was not working, and none was delivered. The refused wakes would have re-written a combined ≈ **$64.53** at list price.
  - **30 allowed** with `cold_check: "clear"` (small or recently called).
  - **Guard latency** per send, with the cursor warm: median 2.3 ms, max 9.4 ms.
- **`--force`:** proven in tests only, per the ruling: never wake a big cold seat to prove it.

| seat | idle | context | estimate |
|---|---|---|---|
| pij-anxious-toucan | 34h43m | 377k | ≈ $3.02 |
| pij-exceptional-bug | 34h45m | 520k | ≈ $4.16 |
| pij-fixed-roadrunner | 27h22m | 503k | ≈ $4.02 |
| pij-fun-shrimp | 3h04m | 561k | ≈ $4.49 |
| pij-lucky-horse | 2h01m | 420k | ≈ $3.36 |
| pij-minimum-mammal | 6h | 475k | ≈ $3.80 |
| pij-nice-heigan | 2h56m | 534k | ≈ $4.28 |
| pij-noisy-tsarina | 6h49m | 373k | ≈ $2.99 |
| pij-preliminary-junglefowl | 28h37m | 573k | ≈ $4.59 |
| pij-reduced-elwynn | 27h19m | 389k | ≈ $3.11 |
| pij-resonant-clam | 3h58m | 357k | ≈ $2.86 |
| pij-silly-inigo | 24h28m | 530k | ≈ $4.24 |
| pij-spatial-skink | 22h40m | 350k | ≈ $2.81 |
| pij-specific-kiwi | 3h11m | 349k | ≈ $2.79 |
| pij-splendid-justine | 3h11m | 424k | ≈ $3.39 |
| pij-statistical-whale | 2h15m | 370k | ≈ $2.96 |
| pij-unusual-cockroach | 24h32m | 439k | ≈ $3.51 |
| pij-zonal-geddon | 6h50m | 518k | ≈ $4.15 |

One refusal verbatim:
```
E-RS-COLD-WAKE: pij-exceptional-bug is cold (idle 34h45m, 520k context). Waking it rewrites ~520k tokens ≈ $4.16 at list price. Use --fyi to hold it, or --force --reason "<why>".
```

## RED → GREEN
- **Daemon HTTP tests** (`crates/daemon/src/http/tests.rs`, cold-wake section):
  - Missing behaviour, before the guard existed:
    - `a_send_to_a_cold_seat_is_refused_with_its_price`: FAILED (HTTP 200, queued).
    - `a_forced_cold_wake_needs_a_reason_and_is_audited`: FAILED (200 without a reason).
    - `busy_and_unknown_recipients_are_never_refused`: FAILED (no `cold_check`).
    - `the_shim_send_is_guarded_and_forceable`: FAILED (200).
    - All four are GREEN after.
  - `fyis_and_controls_are_never_refused`: RED under mutant M5 (the FYI takes the guarded send path), GREEN on the code.
- **Core** (`crates/core/src/cold_wake.rs` tests), mutants:
  - M1 (size boundary `<=` → `<`): FAILED.
  - M2 (idle boundary): FAILED.
  - M3 (busy not exempt): FAILED.
  - M4 (unknown refuses; also kills the daemon unknown test): FAILED.
  - All are GREEN on the code.

## Review fixes (uther, REQUEST_CHANGES on 553199ac)

### Finding 1: a cancellation-proof cursor read and warm-up at start
- **Cancellation:** `pij_unisphere` now runs take → fold → store in a detached task that owns the seat's slot. A caller that stops waiting (the guard's 3 s bound) drops only the handle, and the cursor is kept.
  - Test: `a_cancelled_read_still_keeps_its_cursor`. It was RED before the change ("the abandoned read's cursor was lost, so the next read refolds cold") and is GREEN after.
- **Warm-up:** `session_warmup` reads every live, bound seat once at daemon start, off the request path. It goes one seat at a time with a 250 ms pause between seats, and the task is aborted at shutdown.
  - Test: `only_live_bound_seats_are_read_once_each`. It was RED under mutant W1 (unbound seats warmed).

### Finding 2: the fail-open paths and pinned thresholds

| survivor | new test | RED (mutant) |
|---|---|---|
| G6 future last-call | `a_future_last_call_is_not_cold` | `wrapping_sub` → FAILED |
| G7 300k | `the_thresholds_are_the_rulings_300k_and_one_hour` (literal) | 30_000 → FAILED |
| G8 60 min | same | 60 s → FAILED |
| D1 shim `--fyi` | `a_shim_fyi_to_a_cold_seat_is_held_not_refused` | the shim FYI takes the guard → FAILED |
| D8 source error / 3 s timeout | `a_failing_or_silent_session_source_allows_the_send` (Err and a hang: 200, `unknown: source failed: …`, queued, under 6 s) | timeout reads as cold → FAILED |
| D2 forwarded | `a_forwarded_send_is_not_guarded` (documents the bypass) | forwards guarded → FAILED |

### Finding 3 (prime's ruling): Claude publishes busy/idle
- **Hooks:** Claude's `UserPromptSubmit` hook publishes `working`, and a new managed `Stop` hook publishes `idle`. Both are installed into every Claude home at daemon boot. They go through a new `pij-rs activity --pane … [--native-session …] --state working|idle`, where `/v1/activity` resolves the seat from the pane.
  - The calls use the same 3 s watchdog and the same one-line hook.log on failure. They never block a prompt or a stop, and the Stop hook prints nothing.
- **Tests (ClaudeBusyHooks):** each was RED against the missing behaviour or a mutant, then GREEN. They cover: the prompt hook publishes working and still claims FYIs; the Stop hook publishes idle and prints nothing; both are silent and bounded when the daemon fails or hangs; and the planner covers every home. `a_hook_publishes_activity_by_pane_alone` was RED with the seat required, and is GREEN now.
- **Live proof (isolated: worktree build, not the production daemon):**
  - Setup: a private in-process daemon on 127.0.0.1:7499 with a fresh store, and one registered Claude seat. A real Claude Code v2.1.284 (Sonnet 5.5) ran in a new tmux pane with `--setting-sources project --settings <proof hooks>`, so only the worktree's hook scripts ran, pointed at the private daemon.
  - The prompt was one that runs `sleep 20`. `pij-rs state` was polled every 2 s:

```
22:35:31 before: idle
     12 22:35:34 working
     13 22:35:59 idle
```
  - The seat was `working` from 22:35:34 to 22:35:57 while the turn ran (Claude reported "Cooked for 26s"), and `idle` from 22:35:59.
  - The spine recorded `seat.activity {"state":"working"}` at 22:35:32 and `{"state":"idle"}` at 22:35:58.

### Docs (6.2, 6.3)
`docs/how/pij-rs-api.md` now notes three things:
- A remote peer's forwarded send is unguarded, and can still cold-wake a local seat.
- A cold seat refuses the `pij bounce` announcement, so the bounce output lists `E-RS-COLD-WAKE` failures and those seats are not woken.
- The cursor warm-up.

It also documents the Claude busy signal and its limit: only a submitted prompt fires `UserPromptSubmit`.

## Review N1 (uther re-review): StopFailure, and the Esc interrupt
- **Change:** the idle script is also registered under Claude's `StopFailure` event, in every home, beside `Stop`.
  - Test: `stop_failure_runs_the_idle_script_in_every_home_beside_stop`, which was compile-RED before the installer existed and GREEN after.
- **Live, on the isolated worktree daemon, with real Claude Code v2.1.284 and hooks logging which event fired:**
  - **API error:** Claude was run with `ANTHROPIC_BASE_URL=http://127.0.0.1:9` (connection refused), then sent a prompt. The turn ended with `API Error: Connection refused`, and **`StopFailure` fired**. The seat went `working` → `idle` within 5 s (it was `idle` from 22:58:56).
  - **Real Esc interrupt:** a 3000-word essay was interrupted 7 s in. Claude showed `Interrupted · What should Claude do instead?`. **No hook fired**: not `Stop`, not `StopFailure`, and not a `Notification`/`idle_prompt` hook registered for the test. The seat stayed `working` for the whole 110 s poll:
```
22:55:08 mid: working
22:55:08 ESC
     22 22:55:13 working
```
    (In a separate idle session, the `idle_prompt` notification did fire about 60 s after a completed turn, but never after an interrupt, so it does not cover this case.)
  - **Consequence:** after an Esc, a Claude seat reads `working` until its next prompt or completed turn. An exit or kill leaves it `working` until the tombstone or a new incarnation. While it reads `working`, the cold-wake guard allows sends to it. That is a false allow, in the brake's safe direction. Both cases are documented in `docs/how/pij-rs-api.md`.

## Stale `working` (Esc) confirmed by the live pane (prime's ruling, uther delta)
- **Rule, narrow:** the pane is checked only when the recipient says `working` AND its facts alone say cold (over 300k context, last call more than 60 min ago). The guard then probes that one pane once with `HarnessPort::busy`, bounded at 1 s:
  - Pane shows a turn in progress: busy, allowed as before.
  - Pane shows no turn in progress: the `working` is stale. The send is refused as cold, and the seat is corrected to `idle` through `Registry::set_activity`. The `seat.activity` fact carries `{"reason":"stale working (esc)"}`.
  - No pane, a failed probe or a slow probe: trust `working` and allow. Unknown never refuses.
- **Tests:**
  - RED first: `a_stale_working_seat_with_an_idle_pane_is_refused_and_corrected` failed before the change (HTTP 200 `busy`) and is GREEN after.
  - `a_stale_working_seat_with_a_busy_pane_is_allowed`, `a_failed_pane_capture_trusts_working` and `a_working_seat_that_is_not_cold_by_its_facts_is_not_probed` guard behaviour that existed before. Each is RED under a mutant:

| mutant | result |
|---|---|
| S1-busy-or-failed-pane-reads-idle | test result: FAILED. 2 passed; 2 failed; 0 ignored; 0 measur |
| S2-no-correction | test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measur |
| S3-probes-outside-rare-case | test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measur |
| S4-no-reason | test result: FAILED. 3 passed; 1 failed; 0 ignored; 0 measur |

- **Live proof (isolated worktree daemon on 127.0.0.1:7499, fresh store, real session source and real tmux/harness):**
  - Thresholds were shortened in the proof build only, to context > 1,000 and idle > 30 s. The constants were reverted before commit, and the diff is clean.
  - Real Claude Code v2.1.284 ran with the worktree's hooks.
  - Steps and results:
    - One completed turn: `Stop` fired, the seat was `idle`, context 33,264.
    - A 3000-word essay prompt: `working`.
    - **Esc** 7 s in: Claude showed `Interrupted`, no hook fired, and the seat stayed `working`.
    - 50 s after the last call, one `POST /v1/send`:

```
23:08:02 before send: working (last call 50s ago)
{"ok": false, "error": "refused",
 "meta": "E-RS-COLD-WAKE: pij-stale-proof is cold (idle 0m, 33k context). Waking it rewrites ~33k tokens (price unknown for this model). Use --fyi to hold it, or --force --reason \"<why>\"."}
23:08:02 after send: idle
spine seat.activity: working 23:06:54 → idle 23:06:56 (Stop) → working 23:07:08 → {"reason":"stale working (esc)","state":"idle"} 23:08:02
```
  - Nothing was delivered to the pane.
  - The message reads `idle 0m` only because of the shortened proof threshold. The model (Sonnet 5.5) is unpriced.
