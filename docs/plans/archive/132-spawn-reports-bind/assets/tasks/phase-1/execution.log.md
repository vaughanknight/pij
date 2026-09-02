# Phase 1 execution log

## tk-a132 — RED-first witnesses

- Inherited witnesses: early child exit returned HTTP 200; first bind erased the spawn parent.
- Added bounded dead-pane witness after rebasing onto `main@4418e3f3`.
- RED: `cargo test -p pij-daemon a_missing_pane_terminalizes_its_queued_delivery_with_named_reason -- --nocapture` failed because the missing-pane row was retried.
- Evidence: `assets/red-witness.md`.

## tk-b132 — bind and dead-recipient reporting

- Preserved the compiling inherited spawn implementation after focused Rust/TypeScript tests and workspace checks.
- Jordan expanded the retry policy after production measured 72 dead-recipient pending rows, worst attempt 15,933.
- `DrainWorker` uses one successful all-server pane snapshot per non-empty pass and drains tombstones immediately. Pane absence terminalizes only after an explicit socket-unreachable result; reachable sockets deliver, while inventory/reachability errors retry and remain visible.
- Production-copy proof: 72 dead pending before, 0 after the first cadence; evidence in `assets/prod-copy-proof.md`.
- Opus R001 fixed with additive `actual_model_observed`: unavailable model evidence preserves the requested model, while an observed absence remains a mismatch.
- Opus R002 fixed by grouping `spawn_failure` evidence; CI-equivalent clippy is green.
- GREEN: 30 pointer-worker tests, 9 spawn tests, structured refusal-shape test, Claude/model truth tests, TS runtime test 8/8, and `cargo clippy --workspace --all-targets -- -D warnings`.

## tk-c132 — composed proof and review

- Final reviewer `cargo test --workspace`: 613 passed, 0 failed.
- `cargo clippy --workspace --all-targets -- -D warnings`: pass.
- Terminal `harness checks --json`: all eight sensors passed (`local-paths`, `typecheck`, `lint`, `test`, `windows-compat`, `smoke`, `pkg-audit`, `snapshots`).
- Final real-client tmux proof: `assets/live-proof.md`; final socket-aware production-copy rerun: `assets/prod-copy-proof.md#final-socket-aware-binary-rerun`.
- Claude Opus R1–R5 found three blocking defects, all fixed in subsequent rounds. R5 final verdict: **APPROVE — ship it**; AC1a/AC1b/AC2/AC3/AC4/AC5/AC6 all TRUE.

## Discoveries & learnings

| Tag | Finding | Action |
| --- | --- | --- |
| Noteworthy | The PM packet's TENETS path `.agents/skills/pij-team/TENETS.md` does not exist in this checkout; the live copy is `.agents-skills-port/pij-team/TENETS.md`. | Captured as harness observation `CONF-001`; fix the packet template at closeout. |
| Noteworthy | A worktree-started flowspace3 daemon shares and rewrites the production daemon key even when pointed at the dev database. | Standing rule updated during the run: never start flowspace3 daemon from worker seats. |
| Noteworthy | Tmux-driving `cargo test --workspace` and `harness checks` smoke cannot run concurrently: the parallel run failed one tmux convergence test; serial specific + 612-test workspace rerun passed. | Captured as harness observation `DL-006`; keep tmux gates serialized. |
