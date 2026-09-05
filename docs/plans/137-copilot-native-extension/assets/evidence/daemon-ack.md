# Daemon ACK — plan 137

Status: ACK submitted for PM approval; no source edits or tests performed. Awaiting explicit PM GO.

## Verified identity

- Seat: `pij-grotesque-armadillo`; PM: `pij-grim-gurgeh`.
- Worktree: `/Users/jordanknight/pi-hacking/fs3-copilot-native-daemon`.
- Branch: `137-copilot-native-daemon`.
- HEAD/base: `e3e9b6ac5a069a71922ea0ef80a3aa917ac9a32d` (`git rev-parse HEAD`). Root and branch verified with `git rev-parse --show-toplevel --abbrev-ref HEAD`.
- Runtime: OMP, `github-copilot/gpt-6-astra-1m`, configured effort `high`; observed launch arguments `omp --auto-approve --model github-copilot/gpt-6-astra-1m --thinking high`. Canary `CANARY-S137-DAEMON-61BE` sent through native `pij_send`; PM independently verified response/footer. OMP unchanged.
- Read in this worktree: `plan.dd.md`, complete daemon unit and architecture in `impl-guide.dd.md`, `assets/contracts/native-extension.json`, `assets/backpressure.dd.md`, `assets/inputs/prime-constraints-2026-09-05.md`, and `assets/packets/coder-daemon.dd.json`.

## Numbered execution steps after GO

1. Map existing Rust registration, registry persistence, inbox claim/ack, initial delivery, pointer/drain, spawn/revive, and Copilot control callers. Use actual `flowspace3` search/get for meaning-shaped questions and native LSP references where available; report tool gaps. Read relevant Plan109 findings and existing scoped tests before changes. Preserve the recorded baseline failures rather than rerunning merely to reconfirm them.
2. Add contract-first tests and real SQLite fixtures for additive registration, verified PID/proc_start/session/prebind correlation, default-false capability, reconnect/replacement behavior, and historical migration upgrade. Implement persistent native capability and forward-only storage changes; preserve plan135 response fields.
3. Make every Copilot first-send, retry, pointer and drain path native-only, including missing capability/consumer. Add fail-if-called tmux witnesses and unchanged Pi/OMP/Claude controls. Notify PM about the `delivery/mod.rs` shared match; composition baton remains PM/prime-owned.
4. Admit native claims only with verified current capability and existing fresh InteractionGate permission for panes. Keep held work durable, treat sensor failure conservatively, bound/wake retries using existing machinery, and test held/admitted positive pair, serialized claims, duplicate/ack behavior, and stale-incarnation cases. The human-input gate is a consent **brake**: removing it permits more delivery; this work changes no timing policy.
5. Remove live `rpc_port_intent`, Copilot UI-server launch flags/port allocation, and obsolete Copilot runtime paths; retain applied historical migrations and use forward migration where necessary. Refuse Copilot programmatic controls explicitly at the producer/caller boundary with no legacy/tmux fallback and no new remote-control protocol; preserve other harness controls.
6. Run only scoped Rust crate/tests and focused caller tests in this isolated tree, with `CARGO_TARGET_DIR=/Users/jordanknight/pi-hacking/fs3-copilot-native-daemon/target`. Demonstrate each negative witness catches a plausible defect. Record commands/toolchain/results and proof ceilings in daemon-only receipts. PM owns project-wide gates and composed real manual/spawned/typing/reconnect/model witnesses.
7. Commit explicit source/test/evidence paths with a conventional commit; do not bypass hooks, modify Cargo.lock, push or merge. Return SHA, receipt pointer, assumptions and remaining integration needs; leave PM acceptance states untouched. Capture harness friction and the concrete regression proof added within this unit's fence.

## Interface concerns and proof unknowns

1. **Contract-level stale-consumer gap:** frozen claim request identifies only `seat`; ack identifies only `seat` and `job_id`, with the common daemon bearer key. There is no per-request native session/incarnation field. [INFERENCE] After the same stable seat is re-attested to a replacement/session rollover, an old request cannot be distinguished from the new consumer solely from these request bytes. Client cancellation and clearing capability protect some windows, but do not by themselves prove all delayed old requests are rejected after re-attestation. PM decision requested: confirm the intended cooperative-cancellation proof ceiling, or authorize an additive incarnation discriminator through the shared contract before dependent implementation. I will not privately alter sibling interfaces.
2. **Rollover interpretation:** guide architecture item2 requires native-session mismatch refusal, while item5/AC7 require native-session rollover. I interpret unsolicited mismatch as refusal, with an explicit verified lifecycle transition needed for rollover; the precise transition/supersedes behavior remains to be checked against existing registration code. No silent seat takeover or guessed newest session.
3. **Fence text conflict:** packet and guide say `EXCLUDE ... all .pi files`, then explicitly allow `.pi/extensions/pij/cli.ts` and `core/generation-routing.ts` plus direct tests for Copilot-only unsupported-control guards. Proposed reading: those named guards/tests are narrow exceptions; every other .pi path, especially the plan136 hold queue, remains excluded. Please correct this with GO if not intended.
4. **Consent API availability is not yet source-proven:** existing InteractionGate must expose a fresh fail-closed verdict at claim handoff without editing plan136-owned files. If unavailable, I will provide exact code evidence and block only that dependency rather than inventing a second consent policy.
5. **Proof separation:** Rust/SQLite fixtures prove daemon behavior, not actual native SDK acceptance or real-model completion. Native acknowledgement remains ReaderRead/native acceptance only. Manual pane-backed and spawned-client witnesses, duplicate/reconnect/typing artifacts, real-model canary, installer recipes and final gates require PM composition. Known baseline file-watch-notify failure and npm installation conflict stay disclosed, not relabeled or suppressed.

## Boundaries

No source writes before GO. No plan/guide/backpressure/contracts/governance edits. No `.the-flow-state.json`, `the-flow.json`, or `the-flow.md` writes. No `crates/core/src/delivery.rs`, `crates/harnesses/src/interaction.rs`, extension hold queue, sibling source, installed upstream binary, real global settings or shared daemon changes. Never run legacy TS daemon or `flowspace3 daemon`. No automatic assistant-response forwarding. Absolute file paths stay under the verified worktree; only this unit's `assets/evidence/daemon-*` artifacts are authored.
