# Phase 1 Execution Log

**Phase**: Portable Backpressure and Durable Inbox
**Delegation**: `dlg-0001`
**Started**: 2026-07-12T13:51:43+10:00
**Completed**: 2026-07-12T14:04:03+10:00
**State**: Implementation complete and ready for review. Hosted Windows evidence awaits the first branch publication.

## Delivered

- Added pi-free delivered-message, read-marker, claim, mark, and `InboxPort` contracts.
- Added `FakeInbox` with lexical unread listing and exclusive first-writer claim semantics.
- Added marker-backed `FsChannel.listUnread`, `claimUnread`, and `markRead`.
- Preserved immutable `msg-*.json` envelopes plus existing delivery and watcher behavior.
- Added a portable no-tmux CLI subprocess fixture using `process.execPath` and the resolved `tsx` entrypoint.
- Added `npm run windows:check`, `just windows-compat`, the named harness sensor, self-check composition, and an isolated Node 24 `windows-latest` CI job.

## Proof

| Command / check | Result | Evidence |
|---|---|---|
| Inbox tests before implementation | RED as expected | 7 new tests failed because `FsChannel` had no read methods. |
| Focused channel/fake/portable CLI tests | PASS | 24/24 tests. |
| Concurrent claim proof | PASS | Two real Node processes collectively claimed IDs `001`, `002`, and `003` exactly once. |
| `just windows-compat` | PASS | Typecheck, lint, and the 24 focused portable tests passed. |
| `harness checks --quick --json` | PASS | `windows-compat: pass`; smoke skipped as designed. |
| `just typecheck` | PASS | `tsc --noEmit` exited 0. |
| `just lint` | PASS | Biome exited 0; nine pre-existing warnings and one schema-version info remain outside this phase. |
| `just flow-pair-test` | PASS | 148/148 tests. |
| `harness checks --json` | PASS | All seven sensors passed, including smoke and `windows-compat`. |
| CI YAML parse | PASS | `yaml.parse` accepted `.github/workflows/ci.yml`; diff adds only the isolated Windows job. |
| Dependency sections | UNCHANGED | `package.json` change is scripts-only. |
| `package-lock.json` | UNCHANGED | SHA-256 remained `5729c01e16838de5dc71a4006229e0eab2c72b45d662613adaeebf926b7261e9`. |

## Hosted Windows Evidence

The `windows-compat` job is committed in workflow source but cannot run against uncommitted local changes. Its first `windows-latest` result is therefore a post-review/post-publication evidence seam; the same command is green locally and is the only command the job runs after `npm ci`.

## Friction and Harness Feedback

- `DL-003`: no reusable portable npm-stage subprocess helper existed; the runner keeps the mechanics local until a second consumer justifies extraction.
- `INS-001`: `.harness/extensions/**` is outside Biome's include set; live harness loading and `harness checks` supplied the proof.
- `DL-004`: report-only `pkg audit` rewrites `.pi/packages.yaml` vet timestamps. The audit-authored drift was restored after gates; suggested encoding is a read-only audit or transient provenance output.

## Shared-Surface Audit

- Existing Ubuntu Node 22/24 CI job is unchanged.
- No dependency or lockfile changes.
- No writes to `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, government files, or flow-pair ledger files.
- Audit-authored `.pi/packages.yaml` timestamp drift was removed; no out-of-scope implementation drift remains.

## Hosted CI Reopen — PR #9

The first pull-request run correctly reopened Phase 1:

- Windows lint failed because the default checkout converted repository files to
  CRLF before Biome ran.
- Linux Node 24 timed out in the existing four-round multiprocess registry race
  at the 5-second Vitest default; the adjacent sibling race already declared
  30 seconds.
- Linux Node 22 was cancelled by the matrix fail-fast after Node 24 failed.

Approved fixes:

- Configure `core.autocrlf=false` before the Windows checkout.
- Add the options-second-argument `timeout: 30_000` declaration to every
  remaining `runAllocationRace()` test in `fs-registry.test.ts` missing one. The
  sweep found exactly one.

Local proof after the fixes:

- `just test .pi/extensions/pij/adapters/fs-registry.test.ts` — 31/31 passed;
  both four-round multiprocess races completed.
- `just windows-compat` — typecheck, lint, and focused 24/24 portable tests
  passed.

The hosted rerun remains the condition-precedent.

## Hosted CI Reopen — Windows fs.watch

The second run cleared both Linux jobs. Windows reached the focused test stage,
then the `channel.test.ts` Vitest worker aborted in libuv:

```text
Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c
```

GitHub's Windows temp directory can use a short/alias path whose resolved long
path differs. Passing that alias directly to `fs.watch` triggers libuv's
directory-prefix assertion.

Fix:

- Canonicalize the existing inbox directory with `realpathSync(dir)` before
  passing it to `fs.watch`.
- Add a symlink/junction-backed test proving the watcher receives the real path,
  so removing canonicalization goes RED on every platform rather than relying
  only on hosted Windows.

Local proof:

- Focused canonical-path test — PASS.
- Channel + registry + fake + portable CLI set — 56/56 PASS.
- `just windows-compat` — typecheck, lint, focused 25/25 PASS.

Hosted Windows remains the condition-precedent.

### Third-run refinement

The first canonicalization used `realpathSync`, whose compatibility resolver can
preserve an 8.3 alias on Windows. The third hosted run therefore hit the same
libuv assertion. The watcher boundary now uses `realpathSync.native`, which asks
the OS for the canonical long path. The junction regression compares against the
same native resolver.
