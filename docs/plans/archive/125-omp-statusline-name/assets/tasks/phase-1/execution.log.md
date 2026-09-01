# Phase 1 execution log

## Tasks

| Task | Result | Evidence |
|---|---|---|
| tk-1251 — RED tests | checked | Import RED: missing `session-name.js` (`artifact://54`); behavioural RED: restoring the old one-shot call sites failed 3 current contract tests (`artifact://212`). |
| tk-1252 — publisher | checked | `session-name.test.ts`: 6/6 pass; bounded schedule, readback stop, honest blind success, contained dependency failures. |
| tk-1253 — wiring | checked | Both daemon generations share the publisher; settled-success skip, immediate reassert, late recovery notice, and shutdown cancellation are covered; `index.test.ts`: 17/17 pass. |
| tk-1254 — acceptance | checked | Final-tree `harness checks` passed all eight sensors at `2026-09-01T22:48:46.093Z`; `assets/live-footers.md` records forced miss, 10/10 branch witnesses, and the identical-shape pre-fix miss. |

## Phase result

- Added pi-free `publishSeatName` with default attempts at 0ms, 250ms, 1s, 3s, and 10s.
- OMP always receives the keyed `pij` status fallback while native publication retries.
- Both daemon generations share one publication seam; stale session generations cannot overwrite a replacement session.
- A failed startup publication gets one immediate first-turn reassertion; a healthy publication does not reassert.
- Permanent failure emits one warning; a later successful reassertion emits a visible recovery notice.

## Discoveries & learnings

| Tag | Discovery | Consequence |
|---|---|---|
| Noteworthy | OMP in a linked worktree also sees the globally linked main-checkout extension; bare `omp` does not prove the worktree build. | Live proof used `omp --no-extensions -e <worktree>/.pi/extensions/pij/index.ts`, making the branch under test unambiguous. |
| Noteworthy | Reviewer R-02 challenged the explicit-load live shape as potentially non-discriminating. | Ten identical-shape pre-fix controls missed 1/10 while this branch remained 10/10; `assets/live-footers.md` contains the miss transcript and arithmetic caveat. |
| Noteworthy | Project `.npmrc` `min-release-age=7` is translated to `--before`; npm's nested git dependency preparation then rejects the combination. | `npm ci` succeeded only after temporarily removing and byte-restoring that line; observation `DL-001` remains for o-prime drain. |
| Noteworthy | The first full gate exposed the expected stale OMP wiring assertions and also reported smoke red without details; standalone smoke passed. | Updated the contract assertions, captured `DL-002`, and reran `harness checks` to a fully green result. |

No tasks were skipped or blocked; no `TODO`, `FIXME`, or `HACK` was introduced.
