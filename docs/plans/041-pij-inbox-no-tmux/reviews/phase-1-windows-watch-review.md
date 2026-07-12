# Phase 1 Windows fs.watch Reopen Review

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux`
**Branch**: `s041/inbox-no-tmux`
**Date**: 2026-07-12
**Reviewer**: `pij-tender-leech`

## Verdict

**APPROVE**

No material findings. The refined change uses Node's native realpath binding to
canonicalize only the existing inbox directory passed to `fs.watch`, the
symlink/junction regression test is load-bearing, prior CI fixes remain intact,
and delivery, polling, marker, and package behavior are unchanged.

## Files Reviewed

| File | Result |
|---|---|
| `.pi/extensions/pij/adapters/channel.ts` | Passes `realpathSync.native(dir)` only to the watcher factory. |
| `.pi/extensions/pij/adapters/channel.test.ts` | Uses the same native resolver in the junction-backed canonical-path assertion. |
| `.github/workflows/ci.yml` | Prior `core.autocrlf=false` pre-checkout fix remains intact. |
| `.pi/extensions/pij/adapters/fs-registry.test.ts` | Both `runAllocationRace()` callers retain explicit 30-second timeouts. |
| `docs/plans/041-pij-inbox-no-tmux/tasks/phase-1-portable-backpressure-and-durable-inbox/execution.log.md` | Accurately records both hosted watch failures, the native refinement, local proof, and remaining hosted condition. |

## Findings

| ID | Severity | Evidence | Fix |
|---|---|---|---|
| — | — | No findings. | None. |

## Contract Evidence

| Contract | Status | Evidence |
|---|---|---|
| Hosted failure diagnosis | PASS | Runs `29181415907` and `29181616636` show Linux Node 22/24 successful and `windows-compat` failing with `Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c, line 72`. The second failure proves compatibility `realpathSync` was insufficient on the runner. |
| Native long-path rationale | PASS | Node 24's `realpathSync` is a JavaScript compatibility walker over the supplied path components. `realpathSync.native` calls `binding.realpath`; libuv's Windows implementation opens the directory and calls `GetFinalPathNameByHandleW` with `VOLUME_NAME_DOS` and the default `FILE_NAME_NORMALIZED`, asking Windows for the normalized final path instead of retaining the supplied 8.3/alias spelling. |
| Canonical watcher path | PASS | `watch()` creates the inbox first, then passes `realpathSync.native(dir)` to `watchFactory`/`fs.watch`. |
| No delivery/poll/marker drift | PASS | The implementation diff changes one import and the watcher argument only. Delivery, scan, polling, marker, and claim code have no hunks. |
| Platform-independent regression | PASS | Test creates a `junction` alias, constructs `FsChannel` through the alias, and compares the captured watcher path with the real target inbox path. |
| Prior CRLF fix intact | PASS | Windows job still runs `git config --global core.autocrlf false` before `actions/checkout@v4`. |
| Prior registry timeout fix intact | PASS | The two helper callers remain at lines 349 and 382; their tests retain `timeout: 30_000` at lines 344 and 366. |
| Dependencies and lockfile unchanged | PASS | `package.json` and `package-lock.json` have no worktree changes and match `HEAD` hashes. |

## Local Proof

| Command | Result |
|---|---|
| Named canonical-path test | PASS — 1 passed, 12 skipped. |
| `just test .pi/extensions/pij/adapters/channel.test.ts` | PASS — 13/13. |
| Channel + registry + fake + portable CLI set | PASS — 56/56. |
| `just windows-compat` | PASS — typecheck, lint, focused portable tests 25/25. |
| Third-run refinement: named test + `just windows-compat` | PASS — native resolver test 1/1 and portable tests 25/25 after byte-identical restoration. |
| Scoped `git diff --check` | PASS. |

Biome emitted only the existing nine warnings and schema-version informational
message; none originate from this change.

## Mandatory Dimension-0 Proof

**Invariant removed**: `FsChannel.watch()` must canonicalize an alias inbox path
before passing it to the native watcher.

**Backup**:
`.harness/temp/s041/reviewer-native/channel.ts.before`

**Pre-mutation SHA-256**:
`ddf48bbea523aacb5721d13656aeceda50ea272e89a84e29ed363c91dcfa2c97`

**Temporary mutation**:

```diff
- const watcher = mkWatcher(realpathSync.native(dir), () => {
+ const watcher = mkWatcher(dir, () => {
```

**RED command**:

```bash
just test .pi/extensions/pij/adapters/channel.test.ts \
  -t "passes a canonical inbox path to fs.watch"
```

**RED result**: FAIL at `channel.test.ts:263`. The watcher received the alias
`.../linked-home/bob/inbox` instead of the canonical
`.../real-home/bob/inbox` path.

**Restore proof**:

```text
ddf48bbea523aacb5721d13656aeceda50ea272e89a84e29ed363c91dcfa2c97  channel.ts
ddf48bbea523aacb5721d13656aeceda50ea272e89a84e29ed363c91dcfa2c97  channel.ts.before
BYTE_IDENTICAL
```

**GREEN result**: PASS — the same named test passed after restoration.

## Scope

Only the five briefed paths and the two relevant hosted runs were reviewed. The sole
review-authored persistent write is:

`/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux/docs/plans/041-pij-inbox-no-tmux/reviews/phase-1-windows-watch-review.md`
