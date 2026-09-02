# Plan 133 — Phase 1 execution log

## tk-1331 — Capture red controls and retry distinction

- Legacy-tap RED: `/Users/jordanknight/.cargo/bin/cargo test -p pij-tmux --test adapter unmarked_legacy_pipe_is_superseded_without_touching_a_foreign_pipe -- --exact --nocapture` failed at `crates/tmux/tests/adapter.rs:1407`: existing unmarked pipe refused as foreign. Full output: `artifact://64`.
- AC6 investigation: `DrainWorker::drain_once` derives claim kinds from live, pane-bound, non-tombstoned registry rows; queue eligibility additionally requires `state='pending'`, `not_before <= unixepoch()`, and no running row with the same `serial_key`. Gate vetoes call `release_body`, which sets zero delay; the outer loop bounds the next attempt by `delivery_interval_secs` (default 5s).
- Production read-only receipt: `~/.pij-rs/pij.sqlite:jobs:926` for message `55C220EB-E97C-4F6C-8232-6953F9489215` shows `enqueued_at=1788323412`, `claimed_at=acked_at=1788323581`, `attempt=34`, worker `pij-still-weasel`. The row spent 169s—not 12h—in the destination delivery queue; the earlier elapsed time was before local delivery admission. This distinguishes the 12h witness from the cadence-scale local retries without modifying production state.
- Existing pre-fix receipts name only `queued`; the plan witness and the new receipt expectation establish the reason/next-retry RED boundary.

## tk-1332 — Supersede legacy taps and deduplicate refusals

- Added an injected legacy tap root to `TmuxAdapter`; production composition resolves `~/.pij/pane-signals` while isolated tests use their own temporary root.
- Legacy takeover requires all three facts: `pane_pipe=1`, no `@pij-tap-sink`, and a regular legacy `_N.raw` sink. The file and marker checks are one-directional safety interlocks: removing either can only close more pipes.
- Added per-daemon `(pane, error)` refusal dedupe in `PaneObserver`; attach remains retried each tick, foreign pipes remain untouched, and only the first identical refusal is surfaced.
- GREEN: pij-tmux adapter 33/33 (`artifact://68`); focused legacy test (`artifact://73`); pij-daemon lib 153/153 (`artifact://79`).

## tk-1333 — Carry reasoned tap deferral through delivery

- Added `DeliveryDeferralReason` (`tap-unowned`, `composer-busy`, `human-typing`, `unrecognized`) to the pure core contract and propagated it through `InjectionVerdict` and `StagedSubmission`.
- `DeliveryOutcome::Queued` serializes additive optional `reason` and `next_retry_at`; after R1, `DeliveryService` copies persisted `DeliveryEnqueue::Queued.not_before_ms` rather than predicting cadence.
- GREEN: reasoned first-attempt receipt test (`artifact://75`); tap-unowned row delivers on the next tick after tap claim without a second send (`artifact://93`); workspace test run 586 passed (`artifact://88`).

## tk-1334 — Bound and expose vetoed socket retries

- R1 replaced the config echo: Queue implementations now return persisted `not_before_ms`, and the receipt copies it without pane/cadence inference.
- A fake human-typing veto releases the durable row at zero delay; clearing the veto makes the next drain tick deliver exactly once. The destination witness row confirms 34 local retries over 169 seconds; the separate pre-admission 12-hour gap is not chased in this plan by prime ruling.
- GREEN: queued wire fields and veto reasons plus veto→clear next-tick delivery (`artifact://96`); workspace run 586 passed (`artifact://88`).

## tk-1335 — Prove deterministic and live acceptance

- Focused Rust contracts: 7 core + 33 tmux adapter + 154 daemon passed (`artifact://100`).
- Final Cargo gate: 587 tests passed, 6 ignored; clippy with `-D warnings` and fmt check passed (`artifact://142`).
- Real hand-started Copilot on `%3169` received the full legacy-tap body and replied `LIVE133-SEEN`; a real `human-typing` receipt carried `next_retry_at` and delivered on the next drain tick without a second send. Full transcript: `assets/live-proof.md`.
- Final `harness checks` passed all eight sensors at `2026-09-02T05:41:22.062Z`. `.pi/extensions` diff is empty; production rs runtime remained pid 46147/start 20260902144720.

## R1 review fixes

- R1 verdict: REQUEST CHANGES (`assets/reviews/r1-cross-model.dd.json`).
- f1 CRITICAL: legacy sink existence was inventory, not ownership. Fixed by requiring a live process command containing `cat >>` and the exact sink before closing the unmarked pipe.
- f2 HIGH: production-injected refusal cases were absent. Added mirror tests for no legacy sink and stale legacy sink/no writer; renamed the success test to its actual claim. Adapter suite 35/35 (`artifact://185`).
- f3 MEDIUM: `next_retry_at` was a config echo. Prime ruled persisted readback; `DeliveryEnqueue::Queued` now carries `not_before_ms` from SQLite/FakeQueue. Fake 17-second backoff and SQLite query tests prevent cadence-echo regression (`artifact://189`).
- Final review-fix live run: legacy writer PID 73684 authorized `%3252` takeover; Copilot replied `LIVE133-R2-SEEN`; a real `human-typing` receipt carried persisted `next_retry_at=0` and delivered without a second send (`assets/live-proof.md`).


## R2 review fix

- R2 independently closed r1 f1-f3, then found f4: the plan's narrower clippy command omitted test targets while CI runs `--all-targets`.
- Applied clippy's one-line `std::slice::from_ref(&delivery.kind)` fix and aligned AC5 to `cargo clippy --workspace --all-targets -- -D warnings`.
- R2 record: `assets/reviews/r2-cross-model.dd.json`.
- Final tree: Cargo workspace 591 passed / 6 ignored (`artifact://225`); CI-scope clippy and fmt passed; `harness checks` passed all eight sensors at `2026-09-02T06:25:06.082Z`.

## Discoveries & Learnings

| Tag | Finding | Evidence |
|---|---|---|
| Noteworthy | The canonical `harness checks` inventory has no Rust sensor; prime ruled explicit Cargo test/clippy/fmt receipts for this plan and no harness widening. | `assets/backpressure-coverage.md`; ruling 2026-09-02 |
| Noteworthy | `flowspace3 ask` twice failed to synthesize the cross-file retry answer; direct element reads exposed the queue predicates. | `harness observe` DL-004 and follow-up timeout |
| Noteworthy | R1 measured that legacy sink files describe pane inventory, not pipe ownership; live writer association is the required discriminator. | `assets/reviews/r1-cross-model.dd.json#findings/f1` |
| Noteworthy | A timestamp field must read persisted schedule state, never echo configuration under a measurement-shaped name. | `assets/reviews/r1-cross-model.dd.json#findings/f3` |
