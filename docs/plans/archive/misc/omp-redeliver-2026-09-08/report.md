# OMP/Pi lost-delivery recovery — delivery report

**Commit:** `abff35aea52aec1b8a642b82c633e69733626c80`  
**Branch:** `fix/omp-redeliver`  
**Verdict:** AC1–AC7 satisfied. One commit; no push, PR, merge, production daemon restart, or installed harness modification.

The source and evidence assets are committed. This after-commit report is intentionally left as a local handoff file so it can name the exact commit SHA. The prime-authored `packet-redeliver.md` was preserved and not staged.

Derived C11 trailers:

```text
Pij-Seat: pij-melted-sobeck
Pij-Prime: pij-minor-unicorn
```

The helper reported `role=prime`; it emitted no `Pij-Plan` for this unnumbered fix, recorded in the commit body. The post-commit attribution sensor returned pass, but classified zero harness commits; that scan is not independent proof of the trailers.

## Acceptance

| AC | Delivered behavior | Proof |
|---|---|---|
| AC1 | Continuous idle loss detection, default 10,000 ms; prompt resend with `[pij resend n]` and encoded message-id correlation; at most three resends and a final consumption window, then explicit `undelivered:harness-swallowed`. Sender receives a visible failure warning. | Swallowing fake-OMP regression; final real OMP Escape proof below. |
| AC2 | Reclaimed unconsumed bodies resend through the prompt path, steering when busy. Consumption remains keyed by message id; successful consumption acknowledges once. | Idle/busy reclaim, shared resend budget, delayed-claim-after-park regressions. |
| AC3 | OMP/Pi body leases default to 60 s via `PIJ_RS_EXT_CLAIM_LEASE_SECS`. The third expiration parks the row and atomically commits the sender failure receipt and `delivery.parked`. Schema 18 counts expirations independently of ordinary retry attempts. | SQLite lease, retry-budget, rollback, and split-authority regressions. |
| AC4 | Native `inbox release --seat --job --evidence`; only current authoritative prime or recorded parent may park a running extension body head. Authority is re-read inside ordered admission; controls and non-extension recipients refuse. | Real native CLI refusal and success; parent/prime/revocation/race tests. |
| AC5 | Badge excludes consumed and recently resent mail. Parked ids clear and notify once; parked peek rows never become live claims. A delayed claim cannot resurrect terminal mail. | Focused TS tests; both real OMP panes visibly notified during release. |
| AC6 | RED-first reproductions, green regression suites, canonical outcome fixture and claim-wire update, peer route and stable API documentation. | Logs linked below; full gates green. |
| AC7 | Real OMP 18.1.14, isolated daemon and owned tmux socket: ordinary delivery, sleep/Escape loss recovery, operator release, parked peek and successor completion. | Final section of `live-proof.json` and pane captures below. |

Parking is a **policy**, not a one-directional safety interlock: expiration changes the outcome to failed. Ordinary OMP/Pi injection, control non-replay, Claude UDS, and Copilot delivery remain unchanged. The Rust changes to pointer/sidecar/native test files adapt existing test doubles and acknowledgement constructors; they do not add recovery to those production paths.

## RED evidence

Initial extension run: **6 failed**, before implementation — [red-extension.txt](red-extension.txt).

- `resends silently swallowed custom mail through the prompt after continuous idle and acknowledges its id once`
- `resets the resend idle window on every turn start without treating a turn as consumption`
- `parks swallowed mail only after three prompt resends each get an idle consumption window`
- `resends a reclaimed unconsumed claim through the prompt with busy=false`
- `resends a reclaimed unconsumed claim through the prompt with busy=true`
- `clears sender-addressed parked ids once and never claims parked peek rows ahead of live mail`

Initial Rust run: **3 failed**, before implementation — [red-daemon.txt](red-daemon.txt).

- `redelivery_extension_three_expired_leases_park_and_unblock_serial_head`
- `redelivery_swallowed_ack_is_failure_not_reader_read_and_rejects_wrong_recipient`
- `redelivery_operator_release_requires_parent_or_authoritative_prime_and_running_head`

Two integration findings also received failing reproductions before their fixes:

- `visibly reports a parked outbound message once without clearing unrelated inbound mail` — [red-sender-receipt.txt](red-sender-receipt.txt).
- `does not resurrect a parked message when an earlier claim response arrives late` — [red-park-race.txt](red-park-race.txt).

## Final gates

All commands ran from the assigned worktree.

| Command | Observed result | Receipt |
|---|---|---|
| `cargo test --workspace` | **1,046 passed**, 8 ignored; all 85 reported suites successful | [cargo-gates.txt](cargo-gates.txt) |
| `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0 | Same Rust log; final check completed in 21.44 s |
| `cargo fmt --all -- --check` | Exit 0 | Same ordered command chain; subsequent build completed |
| `cargo build -p pij-cli --bin pij-rs` | Exit 0 | Same Rust log |
| `harness checks` (output expanded with `jq .`) | **10/10 sensors pass**, no skips; includes full Vitest, typecheck, lint, native Copilot, Windows compatibility, smoke, package audit and snapshots | [harness-gate.json](harness-gate.json) |
| Focused runtime/adapter/client Vitest | **107 passed** | [extension-gate.txt](extension-gate.txt) |
| `just smoke` standalone | **11/11 scenarios pass** | [smoke-gate.txt](smoke-gate.txt) |
| `just pij-skill-check` | Exit 0 | [skill-gate.txt](skill-gate.txt) |

The initial boot smoke timed out, matching the prime's recorded pre-existing race. Its requested standalone rerun passed, and the later full harness gate's smoke also passed. No unrelated smoke fix was made.

Gate integration exposed and fixed old consumer assumptions: native peek now decodes full claims rather than bare messages; the shared claim golden includes `attempt`; the TS integration assertion accepts additive claim fields while retaining message and native-identity checks. The existing misdirected-payload diagnostic retains the destination identities.

## Final live proof

Authoritative evidence is **`final` in [live-proof.json](live-proof.json)**. Earlier extension-only captures are retained as provenance, not substituted for final composed proof.

- Runtime: **OMP 18.1.14**, model **`github-copilot/gpt-5-mini`**, discovered and canaried with `CANARY_OK` before use.
- Final daemon binary SHA-256: `1e18f4bc74b5dff630da99058ad7f7d8a91988d973c5b082e857468f3b271953`.
- Isolated address: **`127.0.0.1:54356`**, SQLite schema **18**.
- Private root: `/var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-redeliver-nUzgpm`.
- Receiver: **`pij-actual-vosill`**, owned pane **`%4`**, native session `01a07f17-3f0a-7115-be7e-07655ce69d34`.
- Sender/operator: **`pij-overall-wasp`**, owned pane **`%5`**, native session `01a07f17-40a6-70f0-874f-a30d913255e8`; authoritative prime assertion at spine **21**.
- No tmux delivery fallback was used. Tmux input only started the fixture sleep calls and sent the requested Escape interrupt.

### Ordinary idle delivery

Message `cdb75428-3f76-4ec1-885d-89a58066a5a3`, job **3**: consumption acknowledged in **103 ms** as observed by the probe. Push **22**, delivered receipt **24**, exactly one consumption ACK **25**. The model returned the requested nonce. [final-normal-pane.txt](final-normal-pane.txt)

### Lost steer → prompt recovery

While real `sleep 60` was running, message `35041e3c-9cb8-4033-9b6a-3bdf8e81d48f`, job **4**, was claimed but unconsumed. Escape aborted the tool and discarded the custom steer.

At **10.95 s after Escape**, the prompt resend was consumed: the default 10 s idle threshold plus the 1 s detector tick. The transcript has a user-role `[pij resend 1]` envelope with the exact id, no corresponding consumed custom envelope, then the requested assistant nonce. Exactly one ACK: spine **29**.

[Before Escape](final-loss-before-pane.txt) · [After prompt resend](final-loss-after-pane.txt)

### Native release, refusal, sender notice, and successor

During real `sleep 90`, job **5** / message `d7ddf5e3-d627-46f1-9137-f15e8bc3f841` was running; job **6** / message `82620d7c-e0a2-46c1-94b1-aab4b1fb1bb4` was pending behind it.

The actual native CLI release:

1. Refused the unprivileged caller with exit **2**, `error:"refused"`, `details.code:"E-RS-OWNERSHIP"`.
2. Accepted the authoritative prime with exit **0**; job 5 became `failed`, outcome `undelivered:operator-released`.
3. Persisted sender refusal receipt **34** and sender-addressed `delivery.parked` **35**.
4. Displayed warnings in both sender and recipient panes. Job 6 advanced from pending to running, then was consumed after Escape through the prompt recovery path.
5. Native `inbox --seat … --peek --json` displayed job 5 distinctly as failed with its outcome, without acknowledging it. The parked message's forbidden response marker never appeared in an assistant response.

[Sender warning](release-sender-pane.txt) · [Recipient warning](release-recipient-pane.txt) · [Successor completion](release-successor-pane.txt)

## Review and operating notes

Independent TS and Rust reviews found three material issues, all fixed and covered by final green proofs:

- Late claim response could resurrect parked mail → lifecycle terminal-id guard, RED/green regression.
- Real queue/fake spine could publish foreign cursors → named `E-RS-INBOX-AUTHORITY-SPLIT` refusal for terminal recovery, without altering ordinary reads; rollback regression.
- Operator authority could change while waiting for ordered publication → current caller, target parent/harness and prime role revalidated inside the ordered operation; revoke-parent and unset-prime regressions.

A separate integration review closed the queue-state/event crash gap: real SQLite parking now commits state, refusal receipt and parked event in one transaction. A trigger-induced failure on the parked event proves all three roll back together.

**Deployment:** deploy the new daemon and refreshed extension code together. Old daemons do not understand failure ACKs. Existing OMP `/reload` reopens a native session rather than refreshing extension resources; use an actual extension-code refresh/restart during deployment. Production was not changed here.

Prompt recovery is intentionally the user-message path required by the packet; unlike ordinary custom injection it may affect a human draft. Marked recovery is at-least-once delivery, not a promise of exactly-once model side effects. Consumption acknowledgements are deduplicated.

## Cleanup and harness handoff

The owned isolated daemon was stopped, the private tmux server and its proof seats were terminated, and the read-only SQLite probe was closed. Evidence remains at the committed paths. No throwaway executable was added to the repository, and no changelog exists to update.

Captured harness observations:

- Worktree dependencies were absent; `just worktree-deps` safely created 358 links without changing main's packages.
- Boot smoke had the known race; both standalone and full-gate final smoke passed.
- A fresh isolated tmux server inherited stale `PIJ_SPAWN_TASK`, `PIJ_ANNOUNCE_TO`, and model variables. All actual server-side `PIJ_*` keys were cleared before applying only the isolated endpoint/state, and the contaminated preliminary seat was replaced before acceptance measurements.

The change itself improves backpressure through swallowing-OMP, atomic rollback, authority-race, and late-claim regression cases. **Highest-value further encoding offered to the prime:** a reusable isolated OMP delivery probe that scrubs the actual tmux server environment and emits message/ACK/spine/pane evidence together. The three captured observations remain available for the prime-owned governance/retro harvest; this peer did not mutate those ledgers or the PRD.
