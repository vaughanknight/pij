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

## Post-merge production veto run (main 46c9314c, daemon 53550) — BOTH ARMS

Reported by `pij-binding-magpie` (fs3 o-prime) 2026-09-02, relayed by
`pij-minor-unicorn` because the plan's prime seat `pij-still-weasel` was
unreachable at the time (registry row pointed at pane `%2081`; `pij state`
reported `idle · dead` and `tmux list-panes -a` showed no such pane —
independently corroborated by the relaying seat, not taken on report).

Composer empty throughout; no human typed into any seat.

| # | pair | sent_at | outcome / reason | delivered_at | latency |
|---|---|---|---|---|---|
| 1 | claude → claude | 1788343433 | DELIVERED, origin=injected-to-transport | 1788343433 | 0 s |
| 2 | → omp, seat IDLE | 1788343454 | reason=extension-stream | 1788343454 | 0 s |
| 3 | → omp, seat BUSY (15 s into a real writing task) | 1788343477 | reason=extension-stream | 1788343477 | 0 s |

`reason=human-typing` appeared on NO row. Row 3 is the state that previously
tripped the veto.

**Empty arm alone does NOT close AC6** — recorded here as it stood before the
draft arm was run, because the reasoning is the load-bearing part. Every row
above is the world in which the veto *should not* fire. A veto that is
*correctly quiescent* and a veto that has been *removed* produce identical rows
here, so these three rows were consistent with both. The draft arm below is what
separates them.

Magpie's stated caveats, preserved: the reverse direction was untested from its
side, and all three rows read 0 s, which is a floor rather than a distribution —
no evidence about behaviour under load or after a daemon restart, only that the
veto did not fire.

Also for the reaper: weasel's stale registry row survived the u3/132 deploy
still pointing at a dead pane.

### Plan 132 confirmation (same report)

`pij-rs spawn --harness omp --bin omp` returned `bound=true dispatched=true`
(seat `pij-unaware-unicorn`, pane `%3394`) and received on the first send — zero
never-delivered rows, which is the exact failure mode of req-0046.

### Draft arm — the separating witness (magpie, 2026-09-02)

Run after the empty-arm rows above were challenged for testing only the world in
which the veto should not fire.

**Method.** Magpie spawned its own Claude seat (`pij-poor-mellanie`, pane
`%3395`, scratch cwd) so no other seat's composer was disturbed, typed a real
draft with `tmux send-keys` and **no Enter**, and computed the draft's sha256
itself *before* sending.

Draft text: `this is a REAL unsubmitted draft for plan-134 AC6 draft-arm, magpie 2026-09-02`
Independently computed sha256 prefix: `c6d9d9af0b6ae506`

Verbatim receipt:

```json
{"outcome":"queued","reason":"human-typing","next_retry_at":0,"draft_sha":"c6d9d9af0b6a"}
```

1. `reason` **is** `human-typing` in the draft world — the veto is alive, not
   removed. This is the fact the empty arm could not establish.
2. The receipt carries a draft sha, and `c6d9d9af0b6a` matches the sha magpie
   computed over the exact bytes it passed to `tmux send-keys`, before sending.
   The two values were produced by different paths — magpie's is
   text-it-intended → sha, the daemon's is capture-of-the-pane → sha — so the
   match carries **two** distinct claims, which are worth keeping apart because
   someone will eventually ask which one the sha proves:
   - the sha is of the *actual* draft, not a placeholder or an echo of a
     configured value; **and**
   - the pane was captured faithfully (a second fact riding along).

   The match does **not** prove the draft was still unsubmitted at capture time.
   That comes from a separate observation: delivery was withheld for 60 s and
   then landed 1 s after `C-u`.
3. The message stayed undelivered for as long as the draft sat there:
   `sent_at 1788343742`, still nothing at +50 s.

**The clear.** Magpie pressed `C-u` at `1788343802`; the message delivered at
`1788343803` — 1 s after the composer emptied, 61 s after send.

Both arms now exist: empty composer → `extension-stream` / delivered / 0 s; real
draft → `human-typing` + true `draft_sha` + held until cleared. **AC6 has its
separating witness.**

**This does not close AC7.** AC7 asks for a *documented, capped* backoff curve,
and the clear above is one sample of the benign case. The pathological instance
on record is 8 min at **attempt 101** (`888D45C1`) — backoff that had grown over
many attempts. A row that cleared while its attempt count was still small is
silent about attempt 101, and one sample establishes neither the curve nor a
cap. AC7 still needs the curve documented, the interval capped in config, and
the N-veto-then-clear test asserting delivery within one cap.

### Adjacent finding — spawn into an untrusted cwd (encode candidate)

`pij-rs spawn --harness claude` into a cwd Claude does not yet trust hangs at the
"Do you trust this folder" dialog and fails with `timed out after 60s waiting for
registration ... no child output was captured`. The seat is alive and sitting on
the dialog; the error names none of that. Magpie answered the dialog by hand to
continue. Worth encoding: detect the trust prompt and say so, or pre-trust the
cwd on spawn.
