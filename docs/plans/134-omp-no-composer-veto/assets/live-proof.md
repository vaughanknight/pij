# Plan 134 live proof

## u1 RED — composer veto reached for Omp/Pi

Command:

```text
~/.cargo/bin/cargo test -p pij-daemon omp_and_pi_use_the_extension_stream_without_composer_gates -- --nocapture
```

Observed pre-fix failure:

```text
left:  Queued { reason: Some("human-typing"), next_retry_at: Some(0) }
right: Queued { reason: Some("extension-stream"), next_retry_at: Some(0) }
test result: FAILED. 0 passed; 1 failed
```

Full captured output: `artifact://46`.

## u1 live control

Production witness supplied by the plan owner: message `888D45C1` to a working OMP returned `queued, reason:human-typing` and delivered on attempt 101, eight minutes late. This is accepted as ground truth; the production daemon was not restarted or modified.

## u1 live dev-daemon proof — PASS

- Worktree binary: `target/debug/pij-rs`.
- Isolated daemon: `127.0.0.1:17462`, state `/tmp/pij-plan134-dragonfly-20260902`.
- Hand-started target OMP: `pij-current-nigel`, pane `%3366`.
- Hand-started sender OMP: `pij-tame-anteater`, pane `%3367`.
- Both clients used only this worktree's `.pi/extensions/pij/index.ts` and the isolated daemon controls; production port/state were untouched.

The target began a 60-second tool call at `18:39:14`. The sender's real `pij_send` tool returned at `18:39:23`:

```text
queued 97752745-7aef-40ad-860a-e1e68b99f6d3 -> pij-current-nigel
```

The isolated authority recorded the extension-stream decision and reader acknowledgement six milliseconds apart:

```json
{"seq":6,"at":1788338365982,"kind":"message.pushed","seat":"pij-current-nigel","payload":{"msg_id":"97752745-7aef-40ad-860a-e1e68b99f6d3","from":"pij-tame-anteater","body":"PLAN134 MID-TURN EXTENSION STREAM"}}
{"seq":7,"at":1788338365982,"kind":"delivery.outcome","seat":"pij-current-nigel","payload":{"msg_id":"97752745-7aef-40ad-860a-e1e68b99f6d3","outcome":{"outcome":"queued","reason":"extension-stream","next_retry_at":0},"transport":"claude-uds"}}
{"seq":8,"at":1788338365988,"kind":"delivery.inbox-ack","seat":"pij-current-nigel","payload":{"job_id":1,"authenticated_machine":"local","evidence_grade":"machine","outcome":"reader-read"}}
```

At the end of the active turn, target pane `%3366` showed:

```text
[pij from pij-tame-anteater] PLAN134 MID-TURN EXTENSION STREAM
• Background job completed [bash] bg_2 (1m)
TARGET-TURN-END
PLAN134 MID-TURN EXTENSION STREAM
LIVE134-SEEN
2026-09-02 18:40:17
```

Focused proofs:

```text
~/.cargo/bin/cargo test -p pij-daemon omp_and_pi_use_the_extension_stream_without_composer_gates
cargo test: 1 passed

~/.cargo/bin/cargo test -p pij-daemon delivery::tests
cargo test: 20 passed
```

Captured outputs: focused GREEN `artifact://51`; delivery suite `artifact://58`.
