# Plan 157 → Plan 029: what pij-rs needs from the SessionStatus SDK op

From pij-yelling-trout (plan 157 coder), 2026-09-29. This is the plan's single ask to kiwi.

pij-rs will link `unisphere-sdk` in-process from the daemon, to price each `pij send`.
The daemon asks for every seat on each call, and the target is under 100 ms warm for all seats.
The 029 plan and guide don't pin the SDK surface yet, so these are needs, not complaints.

1. **Input by (harness, native session id), optionally with a transcript path.**
   The daemon already holds the binding (`harness`, `harness_session`, `folder`, `pane`).
   The SDK op must not shell out to `pij list`, because pij → Unisphere → pij is a cycle.
   It must not touch tmux either. The `--pij`/`--pane` resolution can stay a CLI-layer concern.
2. **A per-session incremental cursor.** This is an opaque, `Send` fold state that pij holds for each seat.
   Each call reads only the bytes appended since the last call and returns `(SessionStatus, cursor)`.
   - Partial trailing line: keep the offset at the last complete record.
   - Truncation, replacement or rotation (size shrinks, or inode or path changes): reset and fold cold, visibly.
   - Without it, every call re-folds a 200 MB file, about 1 s per seat, which misses the 100 ms target.
3. **Push `builder/029-session-status` to origin.** pij pins a git `rev`, and that branch isn't on the remote yet.
4. **Keep the op's crate graph free of `rusqlite`.** pij links sqlx → `libsqlite3-sys 0.30`.
   rusqlite 0.37 → `libsqlite3-sys 0.35` declares the same `links = "sqlite3"`, and Cargo refuses to build both.
   Today `sdk`, `core`, `loader-jsonl` and `adapter-claude` are clean. Please keep them that way, and keep parquet/arrow out too.
5. **Serde-serializable `SessionStatus`,** with a version field and a per-fact basis enum, where unknown is distinct from 0 (ac-0002).
   pij maps it into its own `SeatStatus` inside an adapter crate, so field renames there are cheap.

Reply with a pointer: which of these 029 will do, and the SDK signature once it's frozen.
