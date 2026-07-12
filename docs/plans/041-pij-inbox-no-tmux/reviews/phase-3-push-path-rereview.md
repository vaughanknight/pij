# Phase 3 Push-Path Targeted Re-Review

**Scope**: F-001 through F-003 only, against fixed capture `diff-0002.patch`  
**Reviewer**: `pij-vicious-swift` (Copilot GPT-5.6 Sol xhigh)  
**Date**: 2026-07-12

## Verdict

**APPROVE**

All three cold-review findings are resolved. The same-target partial-failure
path now commits each successful message before attempting the next, the Seq 81
watch regression matches immutable inbox history, and the guidance regression
goes RED when the exact receive-mode association is inverted.

## Finding Dispositions

### F-001 — RESOLVED

- `.pi/extensions/pij/daemon.ts:393-410` invokes the core drainer with one
  durable message, then publishes that message's read marker and terminal
  receipt before advancing.
- `.pi/extensions/pij/daemon.test.ts:175-224` proves the first marker and
  delivered receipt are visible when the second `sendText` throws, the second
  message remains unread, and the next tick retries only the second message.
- `.pi/extensions/pij/daemon.test.ts:253-288` continues to prove an unrelated
  live target drains after another target's send failure.

### F-002 — RESOLVED

- The phantom `pij-watch` inbox assertion remains at
  `.pi/extensions/pij/core/daemon/watch.test.ts:445-451`.
- The Seq 81 test-only addendum now proves one retained target `msg-*`, its
  matching `read-*`, and `FsChannel.listUnread("pij-c") === []` at lines
  452-462.
- No production watcher, smoke harness, package/lock, registry, discovery,
  spawn, Copilot harness, CI, or engineering-harness path has a final diff.

### F-003 — RESOLVED

- `.pi/extensions/pij/cli.integration.test.ts:165-190` parses the C1 table and
  asserts the exact header and receive association:
  pi = automatic injected turn, tmux = automatic daemon-injected turn, and
  external = `pij inbox --wait [ms]`.
- The test also asserts the in-process pi clause and the peer route's non-tmux
  registration, injected-reply, and pull-not-state-polling clauses.
- Independent mutation: pi/tmux were changed to `pij inbox --wait [ms]` and
  external pull to daemon injection. The named test went RED with 1 failed and
  34 skipped at the receive-row equality assertion.
- Byte-identical restoration went GREEN with 1 passed and 34 skipped.
  Pre/post SHA-256:
  `bcf1f7dbbcc65d33a02e10618adafd2d3f5ebb16344389dbe70af3e440a44adf`.
  Strengthened test SHA-256:
  `ce41c985dcd00d08fc1c3e607b588dcfdb627331bb9b079a5714b19f35f21e76`.

## Fresh Proof

| Command / proof | Result |
|---|---|
| Focused F-001/F-002/F-003 regressions | PASS - 3 files, 70 tests |
| F-003 inversion mutation | RED - 1 failed, 34 skipped |
| F-003 restored named test | PASS - 1 passed, 34 skipped |
| `just test` | PASS - 127 files passed, 4 skipped; 1,850 tests passed, 10 skipped |
| `just typecheck` | PASS |
| `just lint` | PASS exit 0; 9 pre-existing warnings and one schema-version info notice |
| `just pij-skill-check` | PASS |
| `harness checks --quick` | PASS - typecheck, lint, test, Windows compatibility, package audit, snapshots; smoke skipped |
| `git diff --check` | PASS |

The package-audit timestamp-only drift in `.pi/packages.yaml` was restored and
the manifest has no final diff. Scope remains within the original Phase 3 fence
plus the government Spine Seq 81 `watch.test.ts` test-only addendum.

