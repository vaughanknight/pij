# Phase 1 execution log

## Tasks

| Task | Result | Evidence |
|---|---|---|
| tk-1251 — RED tests | checked | `just test .pi/extensions/pij/core/session-name.test.ts` failed before implementation: missing `session-name.js` (`artifact://54`). |
| tk-1252 — publisher | checked | `session-name.test.ts`: 4/4 pass; bounded absolute schedule, readback stop, status fallback, one notice. |
| tk-1253 — wiring | checked | Both Rust and legacy OMP paths use `startOmpSessionNamePublication`; first turn schedules one extra attempt after startup failure; `index.test.ts`: 13/13 pass. |
| tk-1254 — acceptance | checked | `harness checks` passed all eight sensors at `2026-09-01T21:55:53.271Z`; `assets/live-footers.md` records forced miss and 10/10 real-client witnesses. |

## Phase result

- Added pi-free `publishSeatName` with default attempts at 0ms, 250ms, 1s, 3s, and 10s.
- OMP always receives the keyed `pij` status fallback while native publication retries.
- Both daemon generations share one publication seam; stale session generations cannot overwrite a replacement session.
- A failed startup publication gets one reassertion after the first turn.
- Permanent failure emits one visible warning per session.

## Discoveries & learnings

| Tag | Discovery | Consequence |
|---|---|---|
| Noteworthy | OMP in a linked worktree also sees the globally linked main-checkout extension; bare `omp` does not prove the worktree build. | Live proof used `omp --no-extensions -e <worktree>/.pi/extensions/pij/index.ts`, making the branch under test unambiguous. |
| Noteworthy | Project `.npmrc` `min-release-age=7` is translated to `--before`; npm's nested git dependency preparation then rejects the combination. | `npm ci` succeeded only after temporarily removing and byte-restoring that line; observation `DL-001` remains for o-prime drain. |
| Noteworthy | The first full gate exposed the expected stale OMP wiring assertions and also reported smoke red without details; standalone smoke passed. | Updated the contract assertions, captured `DL-002`, and reran `harness checks` to a fully green result. |

No tasks were skipped or blocked; no `TODO`, `FIXME`, or `HACK` was introduced.
