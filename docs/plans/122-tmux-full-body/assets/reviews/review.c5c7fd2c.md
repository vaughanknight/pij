# s122 cross-model review — c5c7fd2c

**Verdict: REQUEST_CHANGES**

The nominal delivery, fresh-verdict, receipt, migration, and retired-pointer paths are coherent. Two unhandled tmux boundary cases violate the unit's intact-one-submission and draft-safety contracts.

## Findings

| ID | Severity | Location | Failure scenario | Required remediation |
| --- | --- | --- | --- | --- |
| F001 | HIGH | `crates/tmux/src/lib.rs:402-418` | A body containing literal `ESC[201~` is written unchanged between the adapter's `ESC[200~` and final `ESC[201~`. A bracketed-paste-aware recipient treats the embedded sequence as the paste terminator; its suffix is normal keyboard input. The body is no longer byte-identical, and a suffix containing CR can submit early. | Make this transport lossless for bracketed-paste delimiter bytes before enabling it for arbitrary bodies; do not rely on raw delimiter framing. Add a real-PTY regression containing an embedded close delimiter and assert one intact submission. A local textual escape is insufficient unless the recipient protocol decodes it back to the original bytes. |
| F002 | HIGH | `crates/tmux/src/lib.rs:395,402-425`; guarded only before submit at `crates/daemon/src/delivery/mod.rs:232-260` and `crates/daemon/src/pointer/worker.rs:205-245` | `submit_lock` serializes only pij callers. It does not exclude a human using the target pane. During the 10 ms inter-chunk gaps, human bytes join the open bracketed paste; after line 418 closes it but before the separate Enter at line 423, human text is appended then submitted as part of the automated turn. The one pre-submit capture is a TOCTOU check, not a pane-input transaction. | Establish target-pane input ownership or a cancellation barrier for the entire chunk/open/close/Enter transaction. If fresh external input is detected, never send the final Enter and leave a safe, explicit recovery path. Add an adversarial real-tmux test injecting user input mid-body and between close/Enter. |
| F003 | MEDIUM | `docs/plans/122-tmux-full-body/plan.dd.json` acceptance-criteria IDs | `harness plan validate docs/plans/122-tmux-full-body/plan.dd.json --complete` fails `E403`: each minted `ac-1`… identifier lacks the registered four-lowercase-hex form (12 errors). The plan-validate closing gate therefore cannot be cleared. | Correct the deterministic-document identifiers through `ddocs`, regenerate `plan.dd.md`, then record the gate receipt. This is a release-process blocker, not a Rust delivery defect. |

## Verified

- **Fresh gate semantics:** rust-analyzer references show only two production `fresh_injection_verdict` consumers: direct delivery and `DrainWorker`. Both consume the single capture's `permitted` and `composer_idle` values; an expired non-empty composer can use a socket but cannot select `TypedBody`.
- **Routing and retired pointer witnesses:** all three `RETARGETED` names resolve to pinned worker tests. Pane-bound socketless bodies select `TypedBody`; paneless consumers retain queued pull ownership. No pane-bound production path selects a pointer announcement.
- **Receipt and migration:** `TypedToPane` has the lowest evidence strength; all patched outcome renderers and the SQLite codec retain that spelling. Migration 0011 preserves `seq`, rows, uniqueness, and the recipient-order index while widening the closed origin CHECK. s121's 0010 source is absent from this snapshot, so cross-stream convergence is document-evidenced only.
- **Committed tests run:** `cargo test -p pij-daemon` (210 passed, 12 suites); `cargo test -p pij-harnesses` (63 passed, 4 suites, 2 ignored); `cargo test -p pij-tmux` (16 passed, 3 suites); `cargo test -p pij-store` (49 passed, 7 suites). `git diff --check c5c7fd2c^ c5c7fd2c` was clean.

## Evidence limits

- The OMP/Copilot live witnesses, SHA-256 comparison, and no-clobber run are self-recorded branch artifacts. I did not reproduce them against the live clients.
- The existing real-tmux test covers ordinary multiline 3000-byte data, not an embedded bracketed-paste delimiter or concurrent target-pane input.
- `harness boot` failed its TypeScript typecheck in this worktree; the recorded npm-resolution exception remains non-green. It does not invalidate the Rust test results above.

## Handover

Fix F001 and F002 in the tmux transaction contract and add adversarial real-tmux regressions. Repair F003 through the plan document tooling. Re-run this review against the resulting pinned commit.
