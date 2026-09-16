# Plan 152 — a native receiver that stops observing is stale, and the daemon must know

Prime: pij-far-jackal. Branch `152-receiver-progress`, worktree `/Users/jordanknight/pi-hacking/fs3-receiver-progress`. Follows plan 150 (merged cf08eacd).

## Defect (measured 2026-09-16, production, daemon 87561, seat pij-actual-koi, session 7a582862…)

Extension fork 81615 (`~/.copilot/logs/extensions/user-pij-1789529218783-81615.log`) registered 03:27:01Z, injected job 9573 at 03:35:36Z, entered `completion-wait` at 03:35:40Z — and never logged another `native-event`. The session's own `events.jsonl` recorded 172 events after that (turns, tool calls, `session.idle`, up to 03:41:50Z and beyond); the pane showed the seat answering and idle. Ten deliveries (jobs 9581–9603) sat `pending` behind the wait for over an hour. `pij state` said `idle · active`; the receiver lease kept renewing (heartbeat is a timer, `store.mjs:703`, independent of observation), so the daemon never parked the queue and 150's manual pull would have been refused with `expires_in_ms`.

What happened in the session at the stall: `03:35:48.342 abort`, `03:35:49.120 session.model_change (model_picker → gpt-5.6-sol-fast)`, then normal turns. The previous fork (94349) also died silently — `exit code=0 disposition=stopped-normally` at 03:25:45Z mid-`completion-wait` for job 9562, no error line — after a turn boundary; whether an operator action preceded it is unknown.

Reader mechanism today (`store.mjs` `waitForObservation` ~906): a poll loop — `eventLog.read({cursor,max:128,includeEphemeral:false})`, then backoff delay, repeat — with `abortable(promise, controller.signal)` as the only cancellation: **no per-call deadline**. Two candidate mechanisms, AC0 pins which:
- (H1) the SDK RPC `read` hung after abort/model_change; `completion.reading` never settled, so no further reads, no error, nothing logged.
- (H2) `read` kept answering empty `ok` pages for the old cursor (log re-based after model_change), so the loop spun quietly while the session moved on.

## Rule

**Observation progress is the receiver's liveness, not the heartbeat timer.** A native receiver whose last observed event is older than the session's own latest event by more than a bound is STALE: the extension must detect it and re-baseline (re-`tail`, re-read, and if the SDK is unresponsive, surface `receive-held` with a safe diagnostic), and the heartbeat must carry `last_observed_at`/`observed_seq` so the daemon can refuse to renew a lease that shows no progress while deliveries are outstanding — which parks the queue (150) and unlocks manual pull (150 AC7). Every SDK RPC the receiver awaits has a deadline; a deadline miss is a `receive-held`, never silence.

## Acceptance criteria — each RED on the pre-fix tree, outputs in report.md

- **AC0 Pin the mechanism.** Reproduce on an ISOLATED Copilot + isolated daemon: deliver a message, then in the Copilot session trigger abort (Esc) and a model change from the picker while the extension is in `completion-wait`. Paste the extension log and the SDK's `read` behaviour (hang vs empty pages). If neither reproduces, instrument `readEvents` (call start/settle/page size to the stderr log) and run the sequence again; state honestly what was and was not reproduced. The rule below applies regardless.
- **AC1 Deadline on every receiver RPC.** `eventLog.tail`, `eventLog.read`, `queue.pendingItems`, `metadata.isProcessing`, `native.send` — each bounded (default 15 s, constant named); a miss throws a `NativeError` that reaches the log as `receive-held` with `safeDiagnostic` naming the call. Test: fake SDK whose `read` never settles → held within the bound, RED = waits forever.
- **AC2 Staleness detection in the extension.** While waiting (`completion-wait` or idle receiver), compare the latest observed event to an authority the SDK exposes for "session moved" (candidates: `eventLog.tail()` cursor advancing, `metadata.isProcessing`, `session.usage_checkpoint`); if the session moved and N consecutive reads observed nothing (N and interval constants named), re-baseline via `tail` and continue from there, logging `receiver-rebaselined` with the gap. If re-baselining cannot see the events either → `receive-held`. Test with a fake SDK that re-bases its log on a `model_change` (both H1 and H2 shapes).
- **AC3 Heartbeat carries progress; daemon consults it.** `/v1/inbox/heartbeat` request gains `observed_at` (ms) and `observed_seq`; the daemon refuses renewal (lease expires → deliveries park, manual pull allowed) when the seat has outstanding deliveries AND `observed_at` has not advanced across ≥ K renewals (K named, default 3) — and answers a decodable reason. Rust test RED: today a heartbeat with frozen progress renews forever. The reason string appears in `pij state`/`pij inbox` output for the seat.
- **AC4 Silent normal exit is not silent.** On `session.shutdown`/process exit while a completion is outstanding, the extension logs one line naming the outstanding msgId/jobId and the reason it is exiting (`stop` cause). RED = today's `=== exit code=0 ===` with no context (fork 94349).
- **AC5 Live proof (isolated).** Deliver → abort+model change → the receiver re-baselines within the bound and the NEXT queued delivery lands (extension log shows `native-accepted` for it); then kill the extension's SDK connection → lease expires within K renewals, `pij state` shows the reason, `pij inbox` manual pull succeeds. Paste logs and store queries.
- **AC6 Contract.** `docs/how/pij-rs-api.md`: heartbeat fields, the staleness rule, and what an operator sees. Pin the parked-outcome vocabulary again (150 H2) if a new word is added.

## Non-goals

Retrying the stuck delivery itself (9573 was acknowledged; nothing lost); changing 149/151 registration; production daemon or production Copilot seats (read-only); Copilot's own extension supervisor.

## Gates

`~/.cargo/bin/cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `node --test` over `.copilot/extensions/pij/*.test.mjs` (Node 24.7: file glob, not directory), `just self-check`. RED pasted before GREEN. Isolated daemon only.
