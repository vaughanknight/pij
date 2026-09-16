# Plan 150 — the native Copilot extension must not hold the session history in memory

Prime: pij-far-jackal. Branch `150-native-extension-memory`, worktree `/Users/jordanknight/pi-hacking/fs3-native-memory`.

## Defect (measured 2026-09-15, production)

Six `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` crashes of `.copilot/extensions/pij/extension.mjs` in two days, all on long-lived Copilot sessions; the wayfinder PM's session (`7a582862…`, 22 h old, 232k/1M context) killed its extension four times today — once after ONE message (15:11), once after 14 (16:24). Node report: heap 4.29 GB, RSS 5.4 GB. Each death leaves the CLI alive at an idle prompt with NO receiver: mail queues as `queued/extension-stream` forever and the human sees "it didn't get my message".

Cause: `store.mjs` calls `this.native.getEvents()` — SDK `session.getMessages`, which returns the ENTIRE session history with bodies — at three sites: a baseline per accepted message (~line 891), inside completion handling (~809), and in discard recovery (~874) which runs on a repeating check. That session's history is 68.6 MB / 15,771 events on disk; each call deserialises all of it into a fresh array that `completion.observe` then walks and partly retains. Memory is O(history × calls), and V8 cannot collect fast enough.

## Rule

The extension's memory must be bounded by the work in flight, never by the age of the session. History is read incrementally past a cursor, or not at all where a live event stream already carries what the barrier needs.

## Acceptance criteria — each RED on the pre-fix tree, output pasted in report.md

- **AC1 No full-history reads on the message path.** Replace the per-message baseline and the completion-time read with either (a) the live `native.on` event stream plus a bounded boundary set, or (b) a tail read past the last-seen event id/sequence. If the SDK offers no cursor, read once at startup and never again on the hot path — and say so. `getEvents()` may remain only where a full read is genuinely needed and is proven to run O(1) times per extension lifetime.
- **AC2 Discard recovery is bounded.** The recovery check must not deserialise the whole history per poll. Same options as AC1.
- **AC3 Memory proof.** A node:test that drives a fake native session with a large history (≥ 20,000 events with realistic bodies, ≥ 60 MB serialised) through ≥ 50 message deliveries and asserts heap growth stays under a stated bound (measure `process.memoryUsage().heapUsed` after `global.gc()` with `--expose-gc`). RED on the pre-fix tree: the same test must show unbounded growth or OOM there.
- **AC4 Correctness preserved.** Every existing contract test in `.copilot/extensions/pij/*.test.mjs` still passes: completion barrier, boundaries, discard recovery, receive-held, immediate steer (plan 142), redelivery.
- **AC5 Dead receiver is visible.** When the extension process exits (any reason), the daemon must learn it within one lease period: pending jobs for that seat park with a decodable `delivery.parked` / equivalent reason, and `pij send` to that seat returns a refusal or a warning naming it, instead of `queued/extension-stream` forever. Minimal shape acceptable (lease expiry already exists — use it); a full redesign is not asked.
- **AC6 Live proof on an ISOLATED daemon** (own port/state-dir/HOME/Claude homes/`tmux -L`; never 127.0.0.1:7461): a Copilot seat with a synthetically large session history (or a copy of a real one under the isolated HOME) receives ≥ 30 messages with the extension RSS sampled every 10 s; paste the series. Then kill the extension process by hand and show the AC5 outcome on the next send.

## Non-goals

Native session identity (plan 149, in flight — it edits `store.mjs` lines ~12–170, identity selection; keep your edits to the completion/history/recovery code so the merge is clean); rewriting the daemon's delivery model; upstream SDK changes.

## Gates

`node --test .copilot/extensions/pij/*.test.mjs`, `~/.cargo/bin/cargo test --workspace` (if any Rust touched for AC5), fmt, clippy `-D warnings`, full `just self-check`, bare `biome check` with `$?` read directly.

## Addendum 2026-09-15 16:5x — AC7 (prime ruling, same delivery module)

**AC7 A Copilot seat whose extension is dead can pull its own mail with the CLI.** Measured today: `pij inbox --json` and `pij-rs inbox --json` run from inside a live Copilot seat (pane `%26`, host pid 75739, `COPILOT_AGENT_SESSION_ID` set) are refused `native incarnation mismatch: native_session, pid and proc_start must match the current Copilot seat` (`crates/daemon/src/delivery/mod.rs`, `inbox_recipient`). Cause: `NativeInboxIdentity::matches` demands a caller-supplied `pid`+`proc_start` equal to the seat's host tuple, but the native CLI's `caller_context()` (`crates/cli/src/main.rs:1360`) deliberately sends `pid: None, proc_start: None` — the daemon's own `CallerContext` doc says a caller pid is "DIAGNOSTIC ONLY, never admissible as bind evidence". The check was written for paneless external-pull seats, whose host tuple the daemon OBSERVED at `pij inbox register`, and is applied to every Copilot seat. Result: no Copilot seat with a pane can ever pull manually, so a dead extension leaves the seat with NO path to its mail.

Required: for a recipient that has a pane and `native_extension_delivery`, admit a CLI claim whose caller resolves to that seat through the standard identity ladder (pane + `copilot_session` equal to `harness_session`), without a self-supplied pid tuple; keep the tuple check for paneless pull seats exactly as is. Never trust a caller-supplied pid as bind evidence (that rule stands). Tests: RED on the pre-fix tree — a pane-bearing Copilot seat's CLI claim is refused; GREEN after — it claims and acks; the paneless-pull refusal for a wrong tuple stays RED-pinned; a claim carrying a DIFFERENT `copilot_session` for the same pane refuses. Live leg for AC6: after killing the extension, run `pij inbox --json` from the seat's shell tool and paste the claimed job ids.
