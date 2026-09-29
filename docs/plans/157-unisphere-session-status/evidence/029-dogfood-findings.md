# Plan 157 × Unisphere 029: dogfood findings and live proof

**Author:** pij-yelling-trout, 2026-09-29. For pij-specific-kiwi, in answer to `scratch/029-dogfood-brief-plan157.md`.
**Pin:** `git archive` of `builder/029-session-status` at `ca6aac8bece1ba0448e775f8c36e6677028c1a46`, path-depended from pij branch `plan-157-unisphere`. Crates: `unisphere-sdk`, `unisphere-loader-jsonl`, `unisphere-adapter-claude`.
**Machine:** macOS arm64, 16 cores, load average 70–230 during every run (the shared fleet). All numbers are wall-clock under that load. This file holds numbers and ids only: no transcript content.

## 1. Every live Claude seat, cold then warm cursor passes
Direct SDK, release build, one `StatusService` with roots `~/.claude/projects` and `~/.claude-alt/projects`, one cursor per seat.
There were 47 non-tombstoned Claude seats with a session; 46 were active and 1 dead. Transcripts totalled 1,692,330,985 bytes.

| pass | total ms (47 seats) | bytes read | resets |
|---|---|---|---|
| 0 (cold) | 7584.6 | 1,692,330,985 | none |
| 1 (warm) | **45.5** | 2,321 (1 seat appended) | none |
| 2 (warm) | **29.1** | 6,446 | none |
| 3 (warm) | **3.8** | 0 | none |

- **Warm target (< 100 ms) is met.**
- A warm read of an unchanged seat costs 0.01–0.3 ms.
- The whole warm cost is the seats that appended (see finding 4).

## 2. Largest transcript
- **Seat:** `pij-resonant-clam`, session `d32c91bc-1a9a-4904-a6f0-8f7bec4daf6b`, 207,226,546 bytes.
- **Cold:** 324–804 ms over 3 runs, depending on load. It never hit a limit error.
- **Warm, unchanged:** 0.07–0.28 ms.
- **Warm after an append** (on a private copy of the 207 MB file): 652 bytes appended, including half a record, took **51.8 ms**. `pending_tail_bytes` was 325 and the offset stayed at the last complete record. Re-appending a duplicate record did not change `calls` (3189 before and after).

## 3. Cursor behaviour (temp copies, then deleted)

| step | reset label | bytes read | ms |
|---|---|---|---|
| warm, unchanged | none | 0 | 0.07 |
| append + partial tail | none | 652 (325 pending) | 51.8 |
| truncate in place | `truncated` | 310 | 2.6 |
| replace (new inode, same path) | `rotated` | 207,226,546 | 356 |
| same seat, new session id (seat restart) | `target-changed` | 2,494,501 | 27 |
| transcript deleted | `UNI-STATUS-TRANSCRIPT-NOT-FOUND`, caller kept its cursor | — | — |

Every case behaves as the brief says: each reset is visible and labelled.

## 4. Findings for 029
1. **(perf, please look)** A warm read's cost scales with the session, not with the appended bytes.
   - 652 bytes on a 207 MB session took 51.8 ms.
   - 2,321 bytes on the live 10.9 MB `pij-splendid-justine` took 41.6 ms, and 6,446 bytes took 26 ms.
   - With 3 or more seats appending between polls, a pass goes over 100 ms, even though the bytes are tiny.
   - This looks like a whole-accumulator re-derive per call (turn/model history, last-hour windows) rather than an O(appended) update. An unchanged cursor is 0.07 ms, so the stat path is fine.
2. **(definition)** `context.used_tokens` is reported with `basis: native`. Its definition is a sum (input + cache read + cache write), so it should be `derived`. pij passes it through as given.
3. **(shape)** `Basis::Table` carries no version. The version sits in the separate `context.window_table` string (`model-windows@1`), and pij parses the `@N`. That works, but a version inside the basis would stop a second table-backed fact from having no version.
4. **(coverage)** No seat had any fact in `unknown`. All 47 windows came from `table` (`model-windows@1`), none native. `ttl_bucket` was `1h` for all 47. `stop_reason` was present (44 `end_turn`, 3 `tool_use`).
5. **(graph)** `cargo tree -e normal -i libsqlite3-sys` on the pij workspace shows exactly one `libsqlite3-sys v0.30.1`, from sqlx. The three 029 crates add no rusqlite, parquet or arrow. It builds on pij's pinned 1.98.0 toolchain.

## 5. pij end-to-end: `pij state` gains `sessionStatus`
This was an in-process pij daemon over a `sqlite3 .backup` copy of the production store, so the production daemon was not touched. `session_status: Real` gives the adapter, `pij_unisphere::UnisphereSessionStatus`, which holds one cursor per seat. Every Claude seat was queried over HTTP `POST /v1/state`. The build was debug.

| pass | seats | outcome | sum of `sessionStatus.elapsedMs` | max |
|---|---|---|---|---|
| 0 (cold) | 48 | 48 `known` | 49,130 ms | 3,804 ms |
| 1 (warm) | 48 | 48 `known` | **56 ms** | 23 ms |
| 2 (warm) | 48 | 48 `known` | **63 ms** | 33 ms |

The derived cache state across the 48 seats was 34 `cold` and 14 `warm`.
One card for reference, `pij-far-jackal`:
- model `claude-opus-5-5`, native
- `contextUsedTokens` 188,070
- `contextWindowTokens` 1,000,000, `table@v1`
- `cacheTtl` `one-hour`, `cacheState` `warm` with 2,934 s left
- `compactions` 7
- `state` `idle`: busy/idle is pij's own and is never taken from Unisphere.

The pass wall time, 4–6 s, is the rest of the card under load (liveness probes and the report-card read for 48 seats, run one after another). The session-status share is the sum shown above.
