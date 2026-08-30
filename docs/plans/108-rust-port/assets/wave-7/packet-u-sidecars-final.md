# Coder packet — u-sidecars (final dispatch, Jordan ruled ALL SHIP 2026-08-31)

**Spawn form**: omp, github-copilot/gpt-5.6-sol-fast-1m, --effort high, own window.
**Worktree/branch**: /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port · s108/rust-port (SHARED — see write fence).
**Base packet**: ../wave-4/packet-u-sidecars.md (written wave 3, never dispatched) — execute it AMENDED by the rulings below. COMMON: ../wave-4/COMMON.md applies (incl. anchored edits, loop tests, fix-names-its-path, resolved-path errors).

## Ruling amendments (supersede the base packet where they conflict)
1. ALL THREE consumers ship: telegram bridge, bg runner, chore — job consumers over EXISTING ports; no new ports without stop-and-ask (10th amendment = escalate, never improvise).
2. bg runner: cancel MUST kill the FULL PROCESS GROUP and await OBSERVED exit before reporting cancelled (issue #322; command-success-is-not-effect). Witness test: spawn a child tree, cancel, assert every pid observed gone BEFORE the cancelled receipt exists. Converge on observed state, never return codes.
3. Every long-lived consumer loop ships with a transient-failure loop test (E-030 rule) — the LOOP survives, not just process_one.
4. Any reported count field: observed value, never the configured limit (config-echo rule); one test where they must differ.

## Write fence (shared tree, INC-004 discipline)
Yours: crates/sidecars/** (new), crates/daemon/src/ (consumer wiring only — additive), Cargo.toml workspace member line, your tests, docs/plans/108-rust-port/assets/wave-7/reports/done-u-sidecars.md.
NOT yours: crates/tmux/**, crates/transport/**, .pi/extensions/**, anything the F1 fix coder (yelping-moth) touches. Stage by PATHSPEC only, never git add -A.

## Done
Gate green (use shared CARGO_TARGET_DIR if set in COMMON), report with receipts as files, then: pij send pij-revolutionary-lungfish "u-sidecars done: <report path>" and pij send pij-dominant-vicuna the same.
