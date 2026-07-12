# Phase 1 Windows fs.watch Reopen Review

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux`
**Branch**: `s041/inbox-no-tmux`
**Date**: 2026-07-12
**Reviewer**: `pij-tender-leech`

## Verdict

**APPROVE**

No material findings. The change canonicalizes only the existing inbox
directory passed to `fs.watch`, the symlink/junction regression test is
load-bearing, prior CI fixes remain intact, and delivery, polling, marker, and
package behavior are unchanged.

## Files Reviewed

| File | Result |
|---|---|
| `.pi/extensions/pij/adapters/channel.ts` | Adds `realpathSync` and passes `realpathSync(dir)` only to the watcher factory. |
| `.pi/extensions/pij/adapters/channel.test.ts` | Adds a junction-backed assertion that the watcher receives the canonical inbox path. |
| `.github/workflows/ci.yml` | Prior `core.autocrlf=false` pre-checkout fix remains intact. |
| `.pi/extensions/pij/adapters/fs-registry.test.ts` | Both `runAllocationRace()` callers retain explicit 30-second timeouts. |
| `docs/plans/041-pij-inbox-no-tmux/tasks/phase-1-portable-backpressure-and-durable-inbox/execution.log.md` | Accurately records the second hosted failure, fix, local proof, and remaining hosted condition. |

## Findings

| ID | Severity | Evidence | Fix |
|---|---|---|---|
| — | — | No findings. | None. |

## Contract Evidence

| Contract | Status | Evidence |
|---|---|---|
| Hosted failure diagnosis | PASS | Workflow run `29181415907` shows Linux Node 22/24 successful and `windows-compat` failing with `Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c, line 72`. |
| Canonical watcher path | PASS | `watch()` creates the inbox first, then passes `realpathSync(dir)` to `watchFactory`/`fs.watch`. |
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
| Scoped `git diff --check` | PASS. |

Biome emitted only the existing nine warnings and schema-version informational
message; none originate from this change.

## Mandatory Dimension-0 Proof

**Invariant removed**: `FsChannel.watch()` must canonicalize an alias inbox path
before passing it to the native watcher.

**Backup**:
`.harness/temp/s041/reviewer-watch/channel.ts.before`

**Pre-mutation SHA-256**:
`54e5d5d63fcb61054e750dc46cce18fc1d389fbc1d9a9cf7898d720f0373ab30`

**Temporary mutation**:

```diff
- const watcher = mkWatcher(realpathSync(dir), () => {
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
54e5d5d63fcb61054e750dc46cce18fc1d389fbc1d9a9cf7898d720f0373ab30  channel.ts
54e5d5d63fcb61054e750dc46cce18fc1d389fbc1d9a9cf7898d720f0373ab30  channel.ts.before
BYTE_IDENTICAL
```

**GREEN result**: PASS — the same named test passed after restoration.

## Scope

Only the five briefed paths and the named hosted run were reviewed. The sole
review-authored persistent write is:

`/Users/jordanknight/pi-hacking/pij-worktrees/s041-inbox-no-tmux/docs/plans/041-pij-inbox-no-tmux/reviews/phase-1-windows-watch-review.md`
