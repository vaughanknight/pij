# Impl guide — 140

Read plan.md first. RED tests before code for every AC; name each test after the claim.

## Where
- Sweep: new `crates/daemon/src/death_sweep.rs` driving `reaper::reap` (crates/daemon/src/reaper.rs:112) on a tokio interval; wire in `lib.rs` next to `follow_deliveries`. Do not duplicate the candidate rule — call the reaper's canonical candidate fn so `reaper_tests.rs` keep guarding it.
- Tombstone event + reason: extend the existing tombstone writer (pane_observer.rs:484 shows the trait shape; http/lifecycle.rs:209 `tombstone_receipt`) — one spine writer, atomic seat+event (139 invariant).
- Obituary send: `DeliveryService::send(from, to, body)` (delivery/mod.rs:239); sender constant in `crates/core` (grep how `pij-bg` names itself and reuse the mechanism, not the string). Honest receipt: record the send outcome on the tombstone's follow-up event; `queued`/`unverified`/`null` semantics exactly as the baton notice (`notify_baton_keeper`, http/governance.rs:1124).
- Revive: http/mod.rs:867 `revive_seat`. Branch on the observation (`pij_core::liveness::alive`, mod.rs:2045) instead of "tombstoned only". `--assume-dead` + `--evidence` on the CLI verb; authorization via the same ownership helper lifecycle.rs:171 uses, plus role prime lookup for parentless seats.
- Template pin: add `death_notice_body_template` beside `baton_notice_body_template` in the stable route corpus; parity golden regenerated deliberately, not by hand-edit.

## Gates
`~/.cargo/bin/cargo test --workspace`, `clippy --all-targets -- -D warnings`, `fmt --check`, `npm test` (extension unchanged but skill gate runs there), `just skill-check` if present. Report tails, not summaries.

## Live proof recipe
Isolated daemon: `pij-rs daemon --addr 127.0.0.1:174xx --state-dir <tmp>` from THIS worktree's `target/debug/pij-rs`; `PIJ_RS_ADDR` for clients. Spawn omp children with `--bin omp --model github-copilot/gemini-3.8-flash-1m` (footer may read `no-model`; the spawn verifier's mismatch report is a known separate defect — the seat is live, use it). Recycled-pid fixture: tombstone-free row whose pid you set to a live unrelated process (see reaper_tests.rs:196 for the fixture shape).

## Deliverable
One commit on branch `140-rs-death-notices-revive` with C11 trailers (`pij-rs commit-trailers`), report at `docs/plans/140-rs-death-notices-revive/report.md`: sha, RED test names + their red output, gate tails, proof seqs, anything not run. No push, PR, merge or bounce — prime does those.
