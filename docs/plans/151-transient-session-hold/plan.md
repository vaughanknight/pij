# Plan 151 — a transient Copilot session in an owned pane is held, not refused

Prime: pij-far-jackal. Branch `151-transient-session-hold`, worktree `/Users/jordanknight/pi-hacking/fs3-transient-hold`.

## Defect (measured 2026-09-16, production, post-149/150 daemon 87561)

Copilot `/restart` boots the NEW host process (pid 70552, child of the old host 46742, same pane `%26`) under a throwaway session `938b46ba…` (14 events: start, permission/model changes, info, shutdown — no user turn) BEFORE it resumes the real session `7a582862…`. The extension registers for the throwaway session, the daemon answers HTTP 400, the extension marks itself `extension-unavailable`, prints `[pij native] unavailable: … no retry is scheduled — restart the Copilot CLI …` and exits; Copilot's extension supervisor re-forks it every ~2.5 s, so the line repeats (four times at 02:26:44/47/49/53) until the resume lands at 02:26:59 and a fresh fork registers as the SAME seat (`pij-actual-koi`, 149 rule). Net: registration works, the user sees a wall of red telling them to restart the thing they just restarted.

Logs: `~/.copilot/logs/extensions/user-pij-1789525604291-78919.log` … `-85097.log` (400s), `-89746.log` … `-94349.log` (resume). The extension only records `safeDiagnostic: "Pij HTTP 400"`; the envelope reason is deliberately not logged, so the exact refusing branch is NOT yet pinned — AC0 pins it.

`.workspace-fork.lock` is NOT a discriminator (80 of 2038 session dirs carry it, including the real session). The daemon already holds the only reliable signal: a Copilot host claiming a session that has no seat, in a pane whose live seat belongs to a different native session (and, in the `/restart` case, whose recorded host pid is this claim's parent).

## Rule

**A native claim for a session with no seat, from a host in a pane owned by a live seat of a different native session, is a HOLD (HTTP 409, `retryable: true`), not a refusal.** The extension stays alive and quiet on a hold. Holds resolve one of two ways with no new code path: the throwaway fork is killed by Copilot when the real session resumes (149 then re-registers the same seat), or the pane's seat is swept dead and the retry registers a genuinely new session normally.

A hold is never an admission. Nothing about the throwaway session is written to the store. Every refusal that protects a live seat from a foreign session (149 AC5) stays a refusal — this plan narrows exactly one branch, and only when the pane's owner is live.

## Acceptance criteria — each RED on the pre-fix tree, outputs pasted in report.md

- **AC0 Pin the branch.** On an ISOLATED daemon, reproduce the production claim shape (host pid whose pane process is the recorded host of a live seat with a different `harness_session`; claimed session unknown) and paste the exact 400 envelope. Name the `registration.rs` line. If the branch is not the one the prime guessed, say so — the rule above still applies.
- **AC1 Daemon holds.** That claim answers 409 with the 149 `retryable: true` envelope and a reason naming the owning seat and "awaiting resumed session" (exact wording pinned by test). Unit test in `crates/daemon/src/registration.rs`/`native_tests.rs`: RED = 400 today.
- **AC2 Guards preserved.** Table in report.md: every existing foreign-session refusal test still passes unchanged. New test: same claim but pane owner is TOMBSTONED or dead → today's behaviour (a new seat for the new session), not a hold. New test: same claim but the claimed session DOES have a seat → 149 resume path, untouched.
- **AC3 Extension stays alive and quiet.** `store.mjs`: a 409-retryable on registration is `registration-wait` (already a quiet-after-first-line state), retried with backoff (cap 5 s), and the extension does NOT exit. No user-visible line at all for the first 10 s of a hold; after 10 s exactly one line that says "waiting for this pane's resumed Copilot session" (never "restart the Copilot CLI"). `memory.test.mjs`/a new `hold.test.mjs`: RED = today the 409 path on registration throws to `extension-unavailable`.
- **AC4 One fork, one line at most.** Live proof on an ISOLATED daemon + isolated Copilot (own HOME, state dir, `tmux -L`): spawn a Copilot seat, `/restart` it. Extension log count for the throwaway session ≤ 1 fork; user-visible `[pij native] unavailable` lines = 0; the seat id after resume equals the id before (149). Paste both extension logs.
- **AC5 Hold is not a leak.** After AC4, `seats` has no row for the throwaway session; `jobs` has no job keyed to it. Assert by query.
- **AC6 Contract.** `docs/how/pij-rs-api.md` registration section: one paragraph on the hold (when, envelope, how it resolves).

## Non-goals

Suppressing other `extension-unavailable` causes (daemon down, bad env); changing what 149 does after resume; any change to production 127.0.0.1:7461 (read-only for you); detecting fork sessions from the filesystem.

## Gates

`~/.cargo/bin/cargo test --workspace`, `cargo fmt --all --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `node --test .copilot/extensions/pij/`, `just self-check`. Every RED pasted before its GREEN. Isolated daemon only.
