# Plan 156 — a resumed session gets its own seat back, by itself

Prime: pij-far-jackal. Branch `156-seat-resume-self-heal`, worktree `/Users/jordanknight/pi-hacking/fs3-seat-heal`. Evidence under `evidence/`.

Jordan's requirement (2026-09-27): after a Mac restart, resuming a session — by `pij revive` OR by hand (`claude --resume <id>`, Copilot `--resume`) — must come back as **the same seat**, and the status bar's first render must re-bind it with no human step. "The window is tied to a dead seat" is not good enough.

## What happened (2026-09-27 reboot)

- The daemon started at 00:20:27Z (by hand; `just rs-autostart` now makes it a login agent). Its death sweep tombstoned 77 seats whose pid and pane had gone.
- **Prime `pij-far-jackal` "survived" by accident.** Its row still records pre-reboot pid 60798 (dead). tmux restarted pane numbering, the new prime pane happened to be `%2` again, and both the sweep and `whoami --pane %2` accepted the recycled pane id. Its SessionStart hook actually logged `skip:no-daemon pane=%2`.
- **Same accident, wrong seat:** pane `%1` now runs a *different* Claude (`--resume prime`, pid 21245), but `whoami --pane %1` answers `pij-monthly-nenneke`, whose recorded pid 26005 is dead.
- **`pij-future-cicada` lost its seat.** It was resumed by hand at 00:21:47Z (`claude --resume 56206875-…`, pid 43821, pane `%3`) during a daemon bounce. The hook pinged once, logged `skip:no-daemon pane=%3` and gave up. Nothing retries: the status line only displays.
- **`pij revive pij-future-cicada` made it worse.** It launched a *blank* Claude (no `--resume`) in a new window, bound the seat to it, and overwrote the seat's `harness_session` with the blank's (`403664a7…`). Messages to cicada went to the blank. The prime has since closed the blank pane (%5).

## Defects (read these; verify, do not assume)

- **A — Claude adopt has no conversation continuity.** `crates/daemon/src/http/identity.rs` `adopt` (~:537-560): the id is the live incumbent *on the pane*, otherwise a freshly minted name. The Claude session id is recorded (`caller.claude_session`) but never used to find the seat. Copilot got session-keyed identity in plan 149; Claude never did. Plan 154's continuity ladder lives in `registration.rs` and is not what picks a Claude adopt's id.
- **B — A pane id is trusted without its process.** The adopt incumbent check (`is_live(seat) && seat.pane == pane`), `whoami --pane`, and the death sweep (`crates/daemon/src/death_sweep.rs`) accept a seat whose recorded `(pid, proc_start)` is dead as long as the pane *number* exists again. Pane ids and pids both reset at boot, so only process start time breaks the tie.
- **C — Revive starts a new conversation.** `crates/daemon/src/http/revive.rs` (~:300) builds a `SpawnRequest` without the prior `harness_session`, so the harness launches blank. The launch then overwrites `harness_session`, destroying the continuity evidence.
- **D — The SessionStart hook is one-shot.** `~/.pij-rs/claude-session-start-pij.sh` (installed from the repo by the daemon; find its source) pings once, then exits silently. `hook.log` has no timestamps.
- **E — Nothing heals.** `harness/scripts/claude-statusline-pij.sh` runs on every render but only displays; its payload's `session_id` is ignored. Copilot's status line (`~/.copilot/statusline-context.sh`, hand-written, not under pij management; copy in evidence/) likewise only displays. Copilot and OMP already re-register through their extensions; Claude has no extension.

## Rules

1. **A seat follows its conversation.** For Claude (as for Copilot), `harness_session` is the continuity key. Adopting a pane whose Claude process has session S re-binds to the seat whose `harness_session` is S (live or tombstoned, same harness), lifting the tombstone with one `seat.resumed` event. A session match beats pane incumbency. The daemon **derives** S from evidence (argv `--resume <uuid>` / `--session-id`, or the transcript the process holds open under `~/.claude*/projects/`). A named resume (`--resume prime`) must also resolve; find the evidence that does it. S is never taken on the caller's word.
2. **A pane id alone is neither identity nor liveness.** A seat whose recorded `(pid, proc_start)` no longer exists is dead, even if its pane id has been reused. The sweep tombstones it, and it is not an adopt incumbent or a `whoami --pane` answer.
3. **Revive resumes the conversation.** Relaunch with the harness's resume flag and the recorded session (Claude `--resume <id>`; Copilot `--resume=<id>`; OMP's equivalent, or refuse by name). If that conversation is already live in another process, refuse and name the pane: "adopt there instead". Never overwrite `harness_session` with a different conversation. A blank relaunch only happens with an explicit `--fresh`.
4. **The status line is the heal loop.** Claude status line, on each render: if `whoami --pane` misses, or names a seat whose session is not the payload's `session_id`, fire a detached adopt. Rate-limit it per pane (≥ 15 s, lock file) and render `⛓ registering…` meanwhile. Rendering never waits on it; state the measured added cost. The hook retries in the background for about 30 s. Both write RFC 3339-stamped lines.
5. **Copilot's status line comes under pij management**, like Claude's: its source lives in the repo and the daemon installs it. Start from the evidence copy verbatim, so Jordan's layout survives. It stays display-only, because the extension owns registration. It must be honest: a dead or missing seat shows as such, not as a stale id.
6. **Operator reclaim for already-broken continuity.** Some breaks can't be healed by rule 1; cicada's session was overwritten. Add `pij-rs adopt <pane> --reclaim <seat-id>` for that case. Only the prime or the recorded parent may use it. The harness must match, the target must be dead or tombstoned, and the target must not be live elsewhere. It emits an audited event carrying the evidence. The prime will use it on cicada (`%3` → `pij-future-cicada`).

## Acceptance criteria — each RED first; paste outputs in report.md

- **AC1 Session continuity.** Setup: a tombstoned Claude seat with session S; a new process in a *different* pane resumed with `--resume S`. Adopt returns the same id, the tombstone is lifted, and one `seat.resumed` event is emitted. Include a named-resume case. RED today: a new name is minted.
- **AC2 Recycled pane.** A seat on `%N` with a dead `(pid, proc_start)`, plus a live unrelated process on a new `%N`. The sweep tombstones the seat; `whoami --pane %N` misses; adopt `%N` does not inherit it. RED today.
- **AC3 Revive resumes.** Reviving a dead Claude seat with session S launches with `--resume S` and keeps `harness_session = S`. Reviving while S is live elsewhere refuses and names the pane. `--fresh` is the only blank path. Unit-test the argv. Canary it once live on an isolated daemon.
- **AC4 Heal loop.** Script-level test: the status line with no seat, given a payload `session_id`, triggers exactly one adopt per rate window and never blocks the render. The hook retries until the daemon appears (start the daemon late in the test). Log lines are timestamped.
- **AC5 Copilot status line.** Repo-owned, installed by the daemon, and it shows dead or missing honestly. The installed output matches the current layout on a sample payload.
- **AC6 Reclaim.** Guards (caller role, harness, target dead, not live elsewhere) and the audit event, each with a refusal test.
- **AC7 End-to-end.** On an isolated daemon, kill a Claude seat's process (simulating a reboot), resume it by hand in a fresh tmux pane, and show the status line render the same id within one rate window without any pij command typed.
- **AC8 Contract.** Update `docs/how/pij-rs-api.md`: adopt continuity order, `--reclaim`, revive resume/`--fresh`.

## Non-goals
Legacy TS daemon. Changing Copilot/OMP registration (they already heal through their extensions). Repairing cicada: the prime does that with AC6 after merge.

## Gates
`~/.cargo/bin/cargo test --workspace`, `fmt --check`, `clippy -D warnings`, `just self-check` (warm). RED before GREEN. Use an isolated daemon only; the production daemon 127.0.0.1:7461 is read-only.
