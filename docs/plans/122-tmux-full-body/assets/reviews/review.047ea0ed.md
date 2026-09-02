# s122 re-review — 047ea0ed

**Verdict: REQUEST_CHANGES**

F001 (terminal controls) and F002's nominal human-input exclusion are closed for the exercised single-adapter path. **Original F003 (invalid acceptance-ID format / E403) is also closed:** `ac-0a01` through `ac-0a07` produce zero validation errors. R007 is a separate, remaining zero-warning-gate failure. The new staged-ownership protocol still has three input-ownership/at-most-once failures, the parser repair converts a formerly conservative case into false idle recognition, and control-body error paths violate immediate inbox availability.

## Findings

| ID | Severity | Location | Failure scenario | Required remediation |
| --- | --- | --- | --- | --- |
| R001 | HIGH | `crates/tmux/src/lib.rs:598-604` | SIGSTOP, a debugger pause, or a scheduler stall after `set_submit_marker` but before `select-pane -d`: the two-second watchdog sees the marker, clears it while input is still enabled, then the daemon resumes and disables input with neither marker nor watchdog. The next `require_staged` fails without restoring input; the pane stays disabled. | Make watchdog arming, marker reservation, and input disable one tmux-server-serialized transition, or make recovery re-arm until it has observed disabled input. Every ownership-mismatch failure must leave the pane input-enabled. Add this exact pause-window regression. |
| R002 | HIGH | `crates/tmux/src/lib.rs:670-691`; `crates/daemon/src/delivery/mod.rs:315-317`; `crates/daemon/src/pointer/worker.rs:331-333` | `select-pane -e; send-keys Enter` can succeed, submitting the body, and the subsequent separate `clear_submit_marker` can fail. `commit_submit` reports an error after the irreversible effect; direct delivery forgets its dedupe record and a caller retry retypes the frame, while queued delivery retains/retries the claimed body. | Treat post-Enter marker cleanup as committed delivery with independently recoverable marker cleanup; never make the caller retry an already-submitted transaction. Cover an injected post-Enter cleanup failure. |
| R003a | HIGH | `crates/tmux/src/lib.rs:578-603` | Two adapter instances or daemon processes can both observe no marker before either writes one; the later write replaces the first. The first then fails its ownership check rather than owning the transaction it was told it acquired. | Reserve pane ownership with a tmux-server-serialized compare-and-set/lock before accepting a transaction. Add a concurrent independent-adapter regression that proves exactly one acquire succeeds. |
| R003b | HIGH | `crates/tmux/src/lib.rs:588-602` | Every newly constructed adapter in one process mints `pij-submit-<pid>-0`. After adapter A commits, its old two-second watchdog can match adapter B's same token, re-enable human input mid-stage, and clear B's marker. | Mint an unguessable transaction token unique across adapter instances and lifetimes; add a stale-watchdog regression using two adapters. |
| R004 | HIGH | `crates/harnesses/src/composer.rs:21-69`, specifically `:41-46` | A decorative rounded border above a non-composer blank region between ordinary horizontal rules falls through the new rounded-border scan and is accepted by the generic blank-rule fallback. A socketless sender then treats unrelated output as an idle composer and stages/submits into it. Before this patch the rounded border made the capture conservatively unrecognized. | Only return `Recognized` for a positively identified composer; do not admit generic blank-rule fallback after a failed rounded candidate. Add the adversarial capture as a negative parser test. |
| R005 | MEDIUM | `crates/daemon/src/pointer/worker.rs:345` | If `EventBus::latest_matching` fails while checking the durable control-pointer fact, `?` exits with the control-bearing job still claimed/running. It is not immediately available to `pij inbox`, violating the lossless pull exception until the lease expires. | Release the claimed job before returning a notice-lookup error, as the publication-error branch already does; add a failing-spine regression. |
| R006 | MEDIUM | `crates/daemon/src/pointer/worker.rs:361-374` | After the explanatory pointer has been submitted, `system_time_ms()?` can fail before event publication and before `release_body`. The original ESC-bearing body remains claimed and cannot immediately be pulled. | Construct the timestamp inside the same recoverable branch and release the job before propagating this error; add a clock-failure regression. |
| R007 | MEDIUM | `docs/plans/122-tmux-full-body/plan.dd.json` acceptance criteria | `harness plan validate docs/plans/122-tmux-full-body/plan.dd.json --complete` returns **degraded**: 0 errors but 7 `orphan-claim` warnings. The review gate requires zero warnings as well as zero errors. | Add the missing typed `proven_by` basis for every checked claim (or make the claim state accurate), regenerate the rendered plan, and record a zero-warning validation receipt. |

## Reviewed closures

- **F001 terminal controls — verified:** `body_requires_pull` rejects every Rust control character except LF. Socket routing occurs first; socketless control bodies take `ControlBodyPull`, the body is absent from the explanation, and remains queued for inbox claim. `cargo test -p pij-daemon terminal_control_body_is_announced_and_remains_readable_in_inbox` passed.
- **F002 ordinary single-adapter pane input — verified:** acquisition precedes capture; each staged chunk is emitted by one tmux command list that enables input, pastes, then disables it; commit is one enable-plus-Enter list. `cargo test -p pij-tmux` passed 22 tests, including real-tmux adversarial input during chunks and before commit, abort, deadline, and daemon-death recovery.
- **Original F003 identifier format — verified closed:** acceptance IDs are now registered `ac-<four lowercase hex>` values; `harness plan validate` reports zero errors. This is distinct from R007's seven orphan-claim warnings.
- **Retired-pointer disposition — verified:** all three RETARGETED tests exist at this pin. Normal pane bodies do not call the legacy `render_pointer`; only the explicit terminal-control pull exception types an explanation. The old pointer-policy/park scaffolding remains unselectable by a pane body.
- **Receipt/migration — verified in this branch:** TypedToPane remains the weakest `DeliveryOrigin`; codec and 0011 CHECK widening retain it. The s121 0010 source is not present here, so cross-stream merge compatibility remains document-evidenced only.

## Verification

- `~/.cargo/bin/cargo run --locked -p pij-testkit --bin pij-gate` — all six stages green on Rust 1.98.0 (toolchain, lock, fmt, clippy, test, architecture).
- `cargo test -p pij-tmux` — 22 passed.
- `cargo test -p pij-daemon terminal_control_body_is_announced_and_remains_readable_in_inbox` — 1 passed.
- `harness plan validate docs/plans/122-tmux-full-body/plan.dd.json --complete` — degraded: 0 errors, 7 warnings.
- `git diff --check c5c7fd2c 047ea0ed` — fails only for trailing whitespace in the new terminal-control measurement document.

## Evidence limits

The hand-run OMP/Copilot bodies, hashes, control-body inbox result, and draft-preservation transcripts are branch artifacts reviewed as coder evidence; I did not reproduce them against live clients. The nominal real-tmux tests above were executed independently. The daemon-death test permits restoration within four seconds, while implementation schedules the watchdog at two; it does not independently assert the full two-second upper bound.
