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

## u3 RED controls

- Production control `EEE16F98` (2026-09-02): Claude→Claude, target working with an empty `❯ ` composer, returned `human-typing` and delivered six seconds later (sent `1788339465`, delivered `1788339471`). Supplied by magpie and accepted as ground truth; production daemon was not restarted.
- Deterministic pre-fix control: `fresh_boundary_streamed_output_with_blank_composer_permits` failed because unread agent-output bytes set the human-typing latch (`artifact://127`).

## u3 deterministic proof — PASS

The corrected fresh boundary drains pane output without treating it as input. A recognized blank composer permits immediately; recognized non-blank content returns `human-typing` plus `draft_sha`, the first 12 hex characters of SHA-256 over the draft.

```text
~/.cargo/bin/cargo test -p pij-harnesses interaction::tests
cargo test: 24 passed

~/.cargo/bin/cargo test -p pij-daemon delivery::tests
cargo test: 20 passed
```

Captured outputs: interaction `artifact://156`; delivery/receipt `artifact://157`.

## u3 real accepting-socket proof — PASS

The first two attempts exposed stale process metadata rather than a delivery failure:
- `pij-binding-magpie` registry PID `86356` is its launching zsh, not Claude; lookup on that PID correctly returned queued (`artifact://199`). Magpie's real Claude PID is `13020`, with both `/tmp/cc-socks/13020.sock` and `~/.claude/sessions/13020.json` live.
- `pij-plan132-opus-review` registry PID `71185` likewise did not resolve to its accepting endpoint in this probe (`artifact://202`).
- Production daemon and pane tap remained untouched.

The existing worktree-built `UdsTransport` live test sent one 3,080-byte, 40-line user turn directly to PID `13020`:

```text
PIJ_LIVE_ACCEPTING_PID=13020 PIJ_LIVE_SENTINEL=PLAN134-U3-MAGPIE-EMPTY \
  ~/.cargo/bin/cargo test -p pij-transport --test live_held_observation \
  a_long_body_reaches_an_accepting_seat_without_a_dialog -- --ignored --nocapture

sentinel PLAN134-U3-MAGPIE-EMPTY: 3080 bytes,
outcome after 152.743625ms: Delivered { origin: InjectedToTransport }
test result: ok. 1 passed
```

Magpie confirmed at `2026-09-02 19:25:24` local that the sentinel arrived as a real user turn from `uds:/tmp/cc-socks/pij-uds-93789-0.sock`: 40/40 lines, ordered, no truncation or elision, first line `PLAN134-U3-MAGPIE-EMPTY line 01 of 40 — byte-exactness probe for plan 110.`, last line identical with `40 of 40`, and U+2014 survived on every line. Composer remained empty and no human typed during the window. The sender measured transport completion in `152.743625ms`; no absolute send timestamp was captured, so no wall-clock gap is inferred. The actual empty-vs-draft three-seat production veto run remains the post-merge closing receipt owned by the prime, per ruling.

## u3 PR #365 Rust-lane repair — PASS

The first CI run exposed three pointer-worker tests outside the initial focused suites. Two pinned an obsolete `user_typing` fake call; each now states why a recognized blank composer is authoritative. The behavioural retry test still proves a vetoed row is retried: its evidence now changes from a real recognized draft to a blank capture, and the original `[(JobId(1), 0ns)]` retry assertion remains.

The full architecture gate also required the deliberate `pij-harnesses -> sha2` allowlist edge and refreshed clean/drifted metadata fixtures.

```text
~/.cargo/bin/cargo test --workspace
cargo test: 602 passed (63 suites, 6 ignored)

~/.cargo/bin/cargo clippy --workspace --all-targets -- -D warnings
PASS

~/.cargo/bin/cargo fmt --all --check
PASS
```

Captured full-suite output: `artifact://229`; clippy: `artifact://233`.
