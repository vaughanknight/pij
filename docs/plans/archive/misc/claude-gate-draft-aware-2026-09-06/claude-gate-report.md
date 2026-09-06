# Claude draft-aware socket delivery — completion report

Commit: `498113bc3a9e99927effa0e40b16620b982ded0b`  
Branch/worktree: `claude-gate-draft-aware` / `/Users/jordanknight/pi-hacking/pij-claude-gate-draft-aware`  
Trailer: `Co-Authored-By: OMP <noreply@openai.com>`  
No push, PR, merge, production bounce, main-checkout edits, or global-link changes.

## Root cause and live reproduction

Original `crates/harnesses/src/interaction.rs:357` erased `state.content` in `record_unknown`. The next identical recognized draft entered the changed-content branch and stamped `last_edit_at` again (original line 319). The periodic caller is `crates/daemon/src/pane_observer.rs:265-269`, which calls `set_unknown` when capture/cursor geometry is temporarily unrecognized. Explicit and observed composer clearing also used to stamp edit time; the fresh gate ignored `composer_idle` when applying recency.

Instrumented the original behavior first with opt-in, hash-only `PIJ_INTERACTION_TRACE=<pane>|1` diagnostics. Own hand-started Claude: `pij-prickly-emhyr`, pane `%3838`, scratch `/private/tmp/pij-claude-gate.IF1p3h`; trust dialog accepted interactively, global hooks excluded. Isolated daemon: `127.0.0.1:17461`, state under this worktree's `.harness/temp/claude-gate-state`.

- 146 real tmux captures over **90.344 seconds**: one full-capture SHA-256, cursor unchanged at `43,36`; no edit-time rearm during the stable interval.
- A non-edit height redraw temporarily hid the composer. Trace: draft hash `ac2ab069f9b5` → unknown/null → the **same** draft hash.
- Original edit time `1788688424215` was incorrectly replaced by `1788688550823` on recognition recovery, without typing.
- Fixed run repeated the redraw with byte-identical before/after captures: draft hash `45de5cde2c13` and last edit `1788688707323` survived all unknown observations.

This proves the uncertainty/recovery mechanism. It does not retrospectively identify which particular redraw produced the production incident. Both capture callers use `composer_region`; the stable run did not show normalization flip-flops, and the baseline reproduction had no self-injection.

## Changes

- `interaction.rs`: retain recognized content through uncertainty; uncertainty remains a separate bounded veto. Blank/submit clears do not refresh edit time. Recognized blank permits immediately; nonblank recency uses the existing grace. Expose monotonic `last_edit_age` for caller-clock event receipts. Remove obsolete clear/self-echo provenance state.
- `delivery/mod.rs`, `pointer/worker.rs`: emit existing `delivery.held` fields plus `last_edit_at`, `remaining_ms`, and `draft_sha`; successful socket, typed fallback, and authority-owned ReaderRead completion emit release and final outcome. Refusal emits terminal refused outcome, never a false delivered/released receipt.
- `events/mod.rs`: serialize held admission audit against worker/reader completion, without holding the ordering mutex across transport or pane typing.
- `http/mod.rs`: held projections recognize terminal delivered/refused outcomes. Queued/Held outcomes neither close nor resurrect a hold.
- Preserve semantic Hold, draft fingerprints, self-injection matching, and the typed-composer no-splicing brake.

## RED → GREEN proof

RED observations before implementation: blank/submit and recognition-gap tests failed; socket event tests lacked held/released rows; typed fallback lacked completion; terminal refusal left active holds; manual ReaderRead lacked release/outcome. The forced admission race regression also failed when its new ordering guard was deliberately disabled; the guard was restored before final validation.

Final commands, all exit 0:

```text
cargo test --workspace                         752 passed; 64 suites; 8 ignored
cargo clippy --workspace --all-targets -- -D warnings
cargo fmt --all --check
cargo build -p pij-cli
```

Final captured gate: `.harness/temp/cargo-gates.log` (session artifact `artifact://78`). Independent reviewer: correct, no remaining findings; review did not execute tests.

`harness boot` and `harness checks` were attempted; legacy TypeScript tools/node definitions are absent in this worktree by design. Owner ruling from `pij-minor-unicorn`: Cargo gates are this Rust-only change's gate; full harness checks run on main after merge.

## Live socket receipts

| Case | Message | Spine sequences | Result |
|---|---|---|---|
| Blank composer | `b409968d-ea62-4fb0-bd17-cc1d939285c6` | pushed **2**, delivered **3** | First attempt; `1788688673458`; Claude displayed ACK |
| Static draft, including non-edit redraw | `53adbf6a-fd7f-43ef-8267-cc6f37aece0b` | held **4,7,8,9**; released **10**; delivered **11** | Last edit `1788688707323`, delivered `1788688772297`; **64.974s** |
| Submit then idle | `a9854ffc-dfd4-465d-bd87-f73a23cc090c` | pushed **12**, delivered **13** | First attempt; `1788688996534`; Claude displayed ACK |
| Final rebuilt-binary blank smoke | `d583b5e0-cb62-48e7-82da-33171c864b7f` | pushed **14**, delivered **15** | HTTP round-trip **200ms**, delivered `1788689451773`; Claude displayed ACK |

All delivered origins were `injected-to-transport` on `claude-uds`. Static release is within the existing five-second drain sweep, not the packet's original ±3s bound. **Owner explicitly accepted the five-second tolerance and ruled cadence changes out of scope.** No cadence change was made.

## Evidence and closeout

Under `.harness/temp/`:
- `live-proof.json`: machine-readable IDs, sequences, timestamps, and accepted tolerance.
- `static-capture.jsonl`: all 146 baseline samples.
- `baseline-trace.json` / `fixed-trace.json`: old rearm and fixed retained-baseline traces.
- `cargo-gates.log`: complete final gate output.

Owned proof daemon stopped and owned tmux Claude session closed. Production daemon and other peers were not restarted or modified.

Harness improvement encoded: hash-only mutation diagnostics plus deterministic recognition-gap, lifecycle, and concurrency regressions. Observations DL-001–DL-003 also record missing worktree TS dependencies, sweep tolerance, and live parent messages reaching subagent contexts. Retained pre-existing limitation: composer extraction is caret-clipped; this task did not rewrite that parser.
