# Prime ledger (pij-minor-unicorn), September 2026

Open items handed to Jordan; one line each, newest last.

- 2026-09-06 **Spine has three writers; descriptor/report kinds never broadcast.** `/v1/events` fans out only what goes through `EventBus::publish`. `ReportService` (crates/core/src/report.rs:116, :241) and `Registry::put`/`tombstone` (crates/store/src/registry.rs:231, :314) insert spine rows directly, so `seat.put`, `seat.tombstone`, `report.now`, `report.state` exist on replay but never on a live stream, and a live cursor burns past them. Measured with a positive control by chainglass o-prime (pij-lonely-antelope): `~/substrate/chainglass/docs/plans/093-pij-rs-reader/assets/findings/live-push-recheck-2026-09-06.md`. Fix: one spine writer (the bus).
- 2026-09-06 **No rs API doc for UI consumers.** `docs/how/pij-for-ui-consumers.md` is legacy-only; `/v1/seats` row and `/v1/events` frame shape (`StreamFrame::Event{machine,cursor,event}`, `payload` a JSON string) are undocumented outside goldens.
- 2026-09-06 **No reaper for dead seat rows.** ~716 idle corpses on `/v1/seats`; consumers compute liveness from `proc{pid,proc_start}`.
- 2026-09-06 **`pij-telegram` as a send target is dead on rs.** Supported: `pij-rs sidecar telegram --body`. Peer route docs still name the old target (egret hit it).
- 2026-09-06 **rs has no `close` verb.** Teardown = kill the tmux window; rows stay untombstoned (see reaper).
- 2026-09-06 **omp seat row should carry previous_harness_session + switch reason** so a rewrite on `/new`/`/fork`/`/resume` is attributable (magpie).
- 2026-09-05 **Plan 134 PR #367** (sender notices for delayed messages) green on 09-02, now 257 behind main with conflicts in `http/mod.rs`, `pointer/worker.rs`, live-proof doc; needs a coder to reconcile.
- 2026-09-05 **`.npmrc min-release-age=7`** breaks git-dependency prep in fresh worktrees; ruling pending (keep vs exempt git deps).
