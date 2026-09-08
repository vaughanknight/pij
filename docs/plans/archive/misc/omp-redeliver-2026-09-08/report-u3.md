# Busy-seat redelivery recovery — u3

**Branch:** `fix/redeliver-busy-seat`  
**Base:** `origin/main` at `896d951240ce193b54e5c7d879b19b742023aea7`  
**Result:** AC1–AC7 exercised. One local commit; no push, PR, merge, production daemon bounce, or installed harness modification. The commit SHA is returned in the peer delivery message; this report is included in that commit.

## Contract and acceptance

| AC | Delivered behavior | Evidence |
|---|---|---|
| AC1 | Lease reclaim refreshes claim tracking only. Existing and previously unseen reclaimed bodies wait for the idle-unconsumed detector. No resend or resend-budget spending while streaming. | Busy/idle reclaim regressions; real 150-second turn below. |
| AC2 | Dedicated authenticated `POST /v1/inbox/heartbeat`, body `{seat,job_id}`, success envelope `data:job_id`. The extension renews every 20 seconds while holding an unconsumed claim. SQL changes only `claimed_at`; no ACK, ReaderRead, attempt, or lease-expiration increment. | HTTP authority tests, fake/SQLite shared Queue contract, 200-second extension regression, real claim-age samples. |
| AC3 | Expiry renews a non-tombstoned persisted `working` OMP/Pi body claim before considering reclaim/parking. Registry state is re-read inside ordered publication admission; renewal is inside the existing queue write transaction. | `redelivery_working_seat_renews_expired_claim_without_spending_lease_budget`; fake parity and expired-control tests. |
| AC4 | Escape still triggers the 10-second idle-unconsumed recovery window; swallowed idle mail gets resends 1–3 and a final idle window, then parks. | Swallowing regression plus real Escape proof, ACK at 10.54 seconds. |
| AC5 | Required regressions ran RED before production edits. Silent extensions exhaust three unprotected leases and emit `delivery.parked`; tombstoning removes the working brake. Golden and manifest updated deliberately. | RED files and final gates below. |
| AC6 | Real OMP 18.1.14: send during `sleep 150`, exactly one body copy and ACK after sleep; second sleep interrupted with Escape, exactly one resend and ACK. | [live-proof-u3.json](live-proof-u3.json), native transcript, pane captures below. |
| AC7 | Peer route and stable API document heartbeat, idle-only recovery, and all three park reasons. | `docs/how/pij-rs-api.md`; `skills/pij/references/routes/peer.md`; skill gate green. |

The working-state protection is a **one-directional safety interlock (brake)**: removing it can only expire/park more mail. Parking itself remains a **policy**, changing a delivery outcome to failed. The three reasons remain `undelivered:lease-exhausted`, `undelivered:harness-swallowed`, and `undelivered:operator-released`. Controls retain non-replay semantics; Claude/Copilot delivery is unchanged.

Expiry remains **claim-driven**, not a new background timer. A silent extension parks after three expired claim-processing cycles. Persisted stale `working` remains conservative until a canonical state transition or tombstone removes protection; this change introduces no new OS-liveness timeout policy.

## RED evidence

[Extension RED](u3-red-extension.txt): **11 failed, 1 passed**. Required named witnesses include:

- `busy-seat heartbeats preserve a steered claim for 200 seconds and acknowledge consumption once`
- `busy-seat reclaim only refreshes tracking before the idle window with busy=false/true`
- `busy-seat previously unseen reclaimed mail waits for idle with busy=false/true`
- `busy-seat lease reclaims never spend the three idle resend attempts`
- `busy-seat heartbeat renews the claim through its authenticated dedicated endpoint`
- The idle-swallowing case remained passing, preserving resends 1–3 and `undelivered:harness-swallowed`.

[Daemon RED](u3-red-daemon.txt): **4 failed, 8 passed**, before production edits:

- `redelivery_heartbeat_renews_only_claim_age_until_consumption`
- `redelivery_heartbeat_rejects_wrong_recipient_control_terminal_and_native_claims`
- `redelivery_working_seat_renews_expired_claim_without_spending_lease_budget`
- `redelivery_silent_extension_after_heartbeat_parks_after_three_leases`

A discovered late-response race also ran RED: [consumed-claim reproduction](u3-red-consumed-race.txt). An ACK could overtake a reclaim response and the stale response could recreate pending mail. A lifecycle-scoped latest-ACK job id now rejects that serialized response race without an unbounded receipt cache.

Full gates exposed a real fake/SQLite mismatch: FakeQueue deduped pending rows but not running claims. [Parity RED](u3-cargo-fake-parity-red.txt) caught a second live job id during heartbeat holding. Both fake enqueue paths now consider pending and claimed rows, matching SQLite's live-row index. The shared Queue contract retains the failing assertion.

## Final gates

| Command | Result | Receipt |
|---|---|---|
| `cargo test --workspace` with `RUST_TEST_THREADS=4` | **1,055 passed**, 85 suites, 8 ignored | [u3-cargo-gates.txt](u3-cargo-gates.txt) |
| `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0 | Same ordered Rust receipt |
| `cargo fmt --all -- --check` | Exit 0 | Same ordered Rust receipt; final command |
| `just test` (`npm test`) | **5,272 passed**, 22 skipped, 240 passing files | [u3-npm-skill-gates.txt](u3-npm-skill-gates.txt) |
| Focused runtime/client Vitest | **98 passed** | [u3-extension-gate.txt](u3-extension-gate.txt) |
| `just pij-skill-check` | All green | [u3-npm-skill-gates.txt](u3-npm-skill-gates.txt) |
| `harness checks` | **10/10 pass**, no skips, including typecheck, lint, full Vitest, native Copilot, Windows compatibility, smoke, package audit, snapshots | [u3-harness-gate.json](u3-harness-gate.json) |

Earlier gate results are not represented as success:

- Default-concurrency Rust run failed two unrelated native Copilot process-observation fixtures with `Ok(None)`; all four new daemon regressions passed. The unchanged full suite subsequently passed with four test threads. [Initial receipt](u3-cargo-contended.txt)
- The first canonical checks invocation reported its test sensor failed; its single-line tool display truncated the failure detail. A complete-output capture of the full gate, with four Vitest workers, passed all sensors. No TS source change was needed between those invocations.
- The corpus gate caught the changed heartbeat golden's old manifest digest. Its bytes, SHA-256, and semantic `answer` were deliberately reconciled, then the whole Rust gate passed. [Manifest RED](u3-cargo-manifest-red.txt)

## Real OMP proof

Runtime **OMP 18.1.14**, model **`github-copilot/gpt-5-mini`**, discovered from the installed catalog and canaried before use. [Canary pane](u3-canary-pane.txt)

- Isolated daemon: `127.0.0.1:53240`, real adapters (`offline:false`).
- Receiver: `pij-homeless-torrent`, private tmux pane `%1`.
- Binary SHA-256, native session, endpoint, owned socket, samples, and full event rows: [live-proof-u3.json](live-proof-u3.json).
- Senders `pij-u3-busy` and `pij-u3-escape` are explicitly synthetic, unregistered test addresses used through the real authenticated send API. They are not claimed to be real peer sessions.
- OMP's auto-backgrounding was disabled in a private config overlay so the actual `sleep 150` remained a running turn. No global settings changed.

### Busy turn

Message `71bac779-0215-472a-96c5-855a76065776`, job **1**. Samples at 20, 40, 65 and 125 seconds show a running unacknowledged claim, advancing `claimed_at`, **zero lease expirations**, and **attempt 0**. The last sample crosses two default 60-second leases.

After the sleep finishes, the pane contains exactly **one** `[pij-rs from pij-u3-busy]` envelope and **no resend marker**. Consumption has exactly one `delivery.inbox-ack`, spine **8**. The model returns the requested nonce.

[Before](u3-busy-before-pane.txt) · [65-second hold](u3-busy-held-pane.txt) · [125-second hold](u3-busy-125s-pane.txt) · [After](u3-busy-after-pane.txt)

### Escape

Message `571de44f-edcf-415c-96ac-185fda0f5edb`, job **2**, was steered during a second real `sleep 150`. Escape discarded that queued custom steer. Exactly one `[pij resend 1]` appeared, and the correlated message received exactly one ACK, spine **12**, **10.54 seconds after Escape**. No resend 2 appeared.

[Before Escape](u3-escape-before-pane.txt) · [After recovery](u3-escape-after-pane.txt) · [Native message evidence](u3-native-transcript.json)

The real-adapter proof binary preceded the testkit-only running-row dedupe correction; the exercised TS, daemon and SQLite production paths did not change afterward. The final full Rust gate includes the corrected fake contract.

## Deployment, cleanup, and harness handoff

Deploy daemon and refreshed extension code together: an old daemon does not expose the heartbeat route. Existing OMP `/reload` reopens the session rather than refreshing extension resources; use a real extension-code refresh/restart during deployment. No deployment was performed here.

The owned daemon and private tmux server were stopped through their supervised process owners; the proof seat terminated and the read-only SQLite probe closed. No throwaway executable was added to the repository. No changelog exists for this surface. Evidence assets are retained.

This session improves the engineering harness through duration-crossing lease tests, fake/SQLite heartbeat parity, running-row dedupe coverage, and a late-consumption response regression. Captured observations `DL-009` and `DL-010` remain in the worktree's ignored harness buffer for prime-owned governance/retro harvesting; pre-existing observations were not cleared or rewritten. PRD reconciliation remains with the prime.

**Highest-value encoding offered:** promote the isolated long-turn/Escape probe into a reusable harness command that scrubs tmux server identity variables, disables auto-backgrounding, and emits claim-age/ACK/pane evidence together. Preserve complete gate output rather than relying on single-line JSON tool previews.
