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
