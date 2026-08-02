# Plan 076 execution log

## Phase 1

Implementation follows the inline task table in `pij-chore-primitive-plan.md`.

### T001 — reducer RED

Added the reducer contract tests for first observation, pending re-surfacing, moving pending values, ack-only baseline advance, and failed-probe preservation. Evidence: the targeted Vitest run failed only because `./reduce.js` was absent.

### T002 — resolver RED

Added the scope-union tests, including same-name retention across seat/repo/fleet, bare-name ambiguity, malformed-scope diagnostics, and worktree-qualified repo state keys. Evidence: the targeted Vitest run failed only because `./resolve.js` was absent.

### T003 — store RED

Added the filesystem-store contract tests for exact seat/repo/fleet paths, atomic roster publication, malformed-vs-missing detection, and per-seat state isolation. Evidence: the targeted Vitest run failed only because `./chore-store.js` was absent.

### T004 — contracts

Defined the chore definition, roster, removal, per-seat state, pending delta, report, probe, and adapter port contracts. `runsSinceFull` is stored on each keyed state entry; the isolated strict TypeScript check passed.

### T005 — reducer GREEN

Implemented trimmed SHA-256 fingerprints, run-only pending-delta updates, explicit ack baseline advancement, failure preservation, and durable full-probe counters. The reducer contract suite is green.

### T006 — resolver GREEN

Implemented deterministic seat/repo/fleet union discovery, scope-qualified definition keys, worktree-qualified repo state keys, malformed-scope diagnostics, and `E-AMBIG` bare-name resolution. The resolver suite is green.

### T007 — filesystem store

Implemented validated atomic scope rosters and per-seat state sidecars. Fleet definitions resolve to `~/.pij/pij-chores/chores.json`; malformed files degrade to `undefined` with an explicit status. The adapter suite is green.

### T008 — probe adapter

Implemented bounded `sh -c` execution in the caller's cwd with trimmed stdout and tagged non-zero/timeout/spawn failures. A direct adapter exercise returned success for `printf ok` and `{ ok:false, reason:"exit 7" }` without throwing.

### T009 — report rendering

Implemented exact human denominator/change/failure/unchanged/FULL lines and the stable documented JSON envelope. Snapshot-free exact-string assertions are green.

### T010 — pure verbs

Implemented `add`, `run`, `list`, `ack`, and `remove` as injected pure result objects. Unit coverage proves seat-default add, duplicate immutability, verbose field round-trip, union ambiguity, failure denominators, pending-until-ack, dry-run no-write, durable full counters, receipt-first removal records, and state purge.

### T011 — CLI wiring

Added the `chore` bin intercept before `E-NOREG`, the top-level index entries, and the dedicated help block. Bare/`--help`/`-h`/`help` all exited 0 and printed the family usage against a deliberately nonexistent `PIJ_HOME`.

### T012 — drive-it proof

Extended `drive.test.ts` through fresh CLI processes. It proves pending deltas re-surface until ack, repo definitions keep independent seat baselines, `FULL` fires on the third and sixth process invocations only, and remove/re-add cannot inherit a stale baseline.

### T013 — operator documentation

Added `docs/how/pij-chore.md` covering all five verbs, the union scope/storage table, ack-only state transitions, periodic full probes, removal semantics, shell trust, and the superset-signal authoring rule.

### T014 — domain records

Recorded the chore core, adapters, CLI contract, and operator guide in `pij-control-plane`, `agent-tooling-interface`, the registry, and the domain map. No new domain or dependency direction was introduced.

### T015 — import boundary

Added the computational dependency-direction guard over every `core/chores/**` TypeScript file. It rejects daemon, Telegram, tmux, and grammY import families; the sensor is green.

### T016 — test-home guard

Every chore test now installs and asserts a temp `PIJ_HOME`; the shared guard has a negative proof for unset and repository paths. The suite stays isolated from the live fleet.

### T017 — full gate

Initial `harness checks` passed every sensor except smoke; the tmux driver lost a pane during package bootstrap. The focused smoke retry passed.

### Discovery — PA capability seam (Noteworthy)

The newer Plan 078 PA classifier scrapes every pre-parser bin verb. `chore` therefore needed an explicit `ALLOW` classification: this family is the deterministic PA maintenance surface the feature exists to provide.

Review tightened that classification to the subverb boundary: PA `run`/`list`/`ack` stay allowed, while roster-authoring `add`/`remove` are refused.

### Discovery — retryable removal ordering

Receipt-first remains invariant, but state purge now precedes roster deletion. If purge fails, the definition remains present and removal can be retried instead of leaving unreachable stale state.

### Review closure

The read-only correctness review found the PA subverb boundary and removal failure ordering above. Both were fixed and pinned by new tests; the focused chore/PA suite now has 51 passing tests.

### Final gate

After the review fixes, the complete `harness checks` returned:

`{"command":"checks","status":"ok","data":{"ok":true,"ran":["local-paths","typecheck","lint","test","windows-compat","smoke","pkg-audit","snapshots"],"skipped":[]}}`

## Phase complete

All 17 tasks and all 20 acceptance criteria are implemented. The shipped surface includes union-merged scope rosters, per-seat pending fingerprints, ack-only baselines, visible probe failures, durable periodic full counters, recorded removals, CLI/docs/domain wiring, and subprocess drive-it proof.
