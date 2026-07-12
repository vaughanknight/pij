# Phase 1 Cold Review — Portable Backpressure and Durable Inbox

**Plan**: `../pij-inbox-no-tmux-plan.md`
**Phase**: Phase 1: Portable Backpressure and Durable Inbox
**Delegation**: `dlg-0001`
**Captured diff**: `/Users/jordanknight/pi-hacking/pij/.flow-pair/runs/2026-07-12T03-50-01Z-github.com-AI-Substr/diffs/diff-0001.patch`
**Reviewer**: `pij-tender-leech` (cold Copilot GPT-5.6 Sol session)
**Date**: 2026-07-12
**Testing approach**: Hybrid

## A) Verdict

**APPROVE**

No Critical, High, or Medium findings. The implementation stays within the
Phase 1 fences, matches the durable inbox and portable harness contracts, keeps
the existing delivery/watch behavior intact, and passes the mandatory
Dimension-0 RED → byte-identical restore → GREEN proof.

Hosted `windows-latest` execution remains a post-publication evidence seam, as
recorded in the task dossier and execution log. The committed job definition,
local portable command, and workflow syntax are valid; absence of a hosted run
for uncommitted code is not a review defect.

## B) Files Reviewed

| File | Action | Review result |
|---|---|---|
| `.pi/extensions/pij/core/types.ts` | modified | Inbox envelope, marker, claim, and mark tagged unions are additive and pi-free. |
| `.pi/extensions/pij/core/ports.ts` | modified | `InboxPort` matches the planned list/claim/mark contract. |
| `.pi/extensions/pij/adapters/fakes.ts` | modified | `FakeInbox` mirrors lexical unread ordering and exclusive/idempotent marker semantics. |
| `.pi/extensions/pij/adapters/fakes.test.ts` | modified | Fake contract has state-bearing assertions for ordering, exclusivity, and idempotence. |
| `.pi/extensions/pij/adapters/channel.ts` | modified | Immutable envelopes, marker-authoritative reads, exclusive publication, and malformed-message failure are correctly sequenced. |
| `.pi/extensions/pij/adapters/channel.test.ts` | modified | Real-filesystem tests cover ordering, immutability, concurrency, legacy messages, malformed data, receipts, and regressions. |
| `.pi/extensions/pij/cli.inbox.integration.test.ts` | new | Portable real-subprocess baseline uses Node/tsx without tmux or shell fixtures; both tests declare explicit timeouts. |
| `harness/scripts/windows-compat.ts` | new | Uses `process.execPath` plus `npm_execpath`, `shell:false`, clear startup errors, and child exit-code propagation. |
| `.harness/extensions/checks/extension.ts` | modified | Adds one named non-heavy sensor wrapping `just windows-compat`; existing sensor order and behavior remain. |
| `.harness/extensions/checks/instructions.md` | modified | Sensor inventory and quick/full semantics match the implementation. |
| `package.json` | modified | Scripts-only change; dependency sections are unchanged. |
| `justfile` | modified | Adds a thin `windows-compat` recipe and composes the same command into `self-check`. |
| `.github/workflows/ci.yml` | modified | Adds an isolated Node 24 Windows job; the existing Ubuntu matrix is unchanged. |
| `tasks/phase-1-portable-backpressure-and-durable-inbox/tasks.md` | new | T001–T009 accurately describe delivered work and proof requirements. |
| `tasks/phase-1-portable-backpressure-and-durable-inbox/execution.log.md` | new | Records delivered behavior, decisions, gates, shared-surface audit, and the hosted-Windows evidence seam. |

The live implementation blob hashes match the target blob hashes recorded in
the captured diff for every reviewed source/config file.

## C) Findings

| ID | Severity | Evidence | Fix |
|---|---|---|---|
| — | — | No material findings. | None. |

## D) Contract, Domain, and Regression Review

| Check | Status | Evidence |
|---|---|---|
| File placement / domain mapping | PASS | Core/ports/types remain in `pij-messaging`; filesystem effects remain in the channel adapter; harness changes remain on harness surfaces. |
| Core remains pi-free | PASS | No runtime `@earendil-works/*` imports in changed core files. |
| Tagged-union errors | PASS | Inbox operations return `Result<T>` and surface malformed/missing envelopes as `E-NOREG`. |
| Immutable `msg-*.json` envelopes | PASS | Claim test compares message bytes before/after; implementation never rewrites or removes the message. |
| Marker existence authoritative | PASS | Listing and claiming short-circuit on `read-*.json` existence without parsing optional metadata. |
| Exclusive first-writer claim | PASS | `openSync(path, "wx")` provides no-replace publication; concurrent-process test and mutation proof establish non-vacuity. |
| Malformed messages not silently claimed | PASS | Message validation occurs before marker publication; test asserts failure and marker absence. |
| `deliver()` regression | PASS | Captured hunk leaves delivery logic unchanged; original delivery test and portable CLI delivery test pass. |
| `watch()` regression | PASS | Captured hunk leaves watch logic unchanged; drain, live-write, poll-fallback, and routing tests pass. |
| Anti-reinvention | PASS | Reuses the existing filesystem no-replace principle in the owning `FsChannel`; no duplicate inbox-read service or dependency added. |
| Domain documentation currency | DEFERRED BY PLAN | Phase 1 explicitly excludes domain/docs updates; Phase 3 owns the six-port/concepts refresh. |

## E) Task, Acceptance, and Fence Coverage

| Coverage | Status | Evidence |
|---|---|---|
| T001–T003 durable inbox substrate | PASS | Core/port/fake plus real-filesystem ordering, immutable-envelope, marker, concurrency, legacy, malformed, and receipt tests. |
| T004–T005 portable CLI baseline | PASS | Two sandboxed `PIJ_HOME` subprocess tests use `process.execPath` and resolved `tsx/cli`; each Vitest case has `timeout: 15_000`. |
| T006 portable runner | PASS | Typecheck, lint, and the exact three focused test files run through the resolved npm CLI; stage exit codes are preserved. |
| T007 shared harness surfaces | PASS | `just self-check` and `harness checks` both wrap `just windows-compat`; the sensor is non-heavy. |
| T008 Windows CI source | PASS | Isolated `windows-latest`, Node 24, `npm ci`, then `npm run windows:check`; YAML parses. Hosted result awaits publication. |
| T009 phase proof | PASS | Fresh focused tests: 24/24; fresh `just windows-compat`: all portable stages passed. |
| AC-02 Phase 1 allocation | PASS | Exclusive marker ownership, immutable envelope, and process-race behavior proved; user-facing pull reuse lands later. |
| AC-03 Phase 1 allocation | PASS | Legacy no-marker files remain readable; malformed marker metadata is ignored because existence is authoritative. |
| AC-12 Phase 1 allocation | PASS WITH PENDING HOSTED EVIDENCE | Portable lane is green locally and the isolated Windows job is valid; hosted execution requires branch publication. |
| AC-13 Phase 1 allocation | PASS | Named harness sensor and the same underlying self-check command are wired. |
| Granted file fence | PASS | All implementation files are inside the Phase 1 grant. |
| `package.json` scripts-only | PASS | `dependencies`, `devDependencies`, `peerDependencies`, and `peerDependenciesMeta` are byte-semantically unchanged. |
| `package-lock.json` unchanged | PASS | Working tree and `HEAD` SHA-256 are both `5729c01e16838de5dc71a4006229e0eab2c72b45d662613adaeebf926b7261e9`. |
| Existing Linux CI preserved | PASS | Diff adds only the new Windows job after the unchanged Ubuntu Node 22/24 job. |

## F) Commands and Results

| Command | Result |
|---|---|
| `harness boot` | PASS — typecheck and full test readiness stages green. |
| Scoped `git status`, diff manifest, and captured-diff review | PASS — reviewed source blobs match captured target hashes; unrelated shared-tree content was excluded. |
| `git diff --check -- <Phase 1 tracked paths>` | PASS. |
| Dependency-section comparison against `HEAD:package.json` | PASS — all dependency sections unchanged. |
| `shasum -a 256 package-lock.json` and `git show HEAD:package-lock.json \| shasum -a 256` | PASS — identical hashes. |
| `just test .pi/extensions/pij/adapters/channel.test.ts .pi/extensions/pij/adapters/fakes.test.ts .pi/extensions/pij/cli.inbox.integration.test.ts` | PASS — 3 files, 24 tests. |
| `just windows-compat` | PASS — typecheck, lint, and 24 focused tests; Biome reported only the nine pre-existing warnings and schema-version info recorded by the implementation log. |
| YAML parse of `.github/workflows/ci.yml` using the installed `yaml` package | PASS. |
| `rg` scans for forbidden `any`, dynamic/inline imports, and pi imports in changed core/runtime files | PASS — only explanatory comment matches for `@earendil-works`. |

## G) Mandatory Dimension-0 Mutation Proof

**Invariant removed**: `FsChannel.claimUnread()` must publish the exclusive read
marker before returning a claimed envelope.

**Source backup**:
`.harness/temp/s041/reviewer/channel.ts.before`

**Pre-mutation SHA-256**:
`19e7a4308bf15fd3a141df74ae7f353ff21d70b771724db0db474fb4d7d4ba15`

**Mutation**: temporarily replaced:

```ts
const published = this.publishMarker(id, messageId, marker);
```

with:

```ts
const published = ok<"marked" | "exists">("marked");
```

This bypassed marker publication while preserving the remaining claim flow.

**RED command**:

```bash
just test .pi/extensions/pij/adapters/channel.test.ts \
  -t "lets two concurrent processes collectively return each message exactly once"
```

**RED result**: FAIL as required. Both processes returned each message, producing
`["001","001","002","002","003","003"]` instead of
`["001","002","003"]`; the load-bearing assertion failed at
`channel.test.ts:151`.

An earlier exploratory change to the post-publication `"exists"` result branch
stayed green because the pre-publication existence guard still preserved the
invariant. That probe did not remove marker ownership and was not counted as the
Dimension-0 mutation.

**Restore proof**:

```text
19e7a4308bf15fd3a141df74ae7f353ff21d70b771724db0db474fb4d7d4ba15  channel.ts
19e7a4308bf15fd3a141df74ae7f353ff21d70b771724db0db474fb4d7d4ba15  channel.ts.before
BYTE_IDENTICAL
```

**GREEN result**: PASS — the same named test passed after restoration
(1 passed, 11 skipped).

## H) Exclusions and Handover

The captured shared-tree diff also contains unrelated Plan 040, Plan 042,
government, flight-plan, and coordination changes. They were treated as
baseline contamination and were not reviewed, edited, staged, or attributed to
`dlg-0001`. Existing changes under `government/**`, `.flow-pair/**`, and
`the-flow.{json,md}` remain outside this verdict.

**Review result**: APPROVE
**Required fixes**: None.
**Review artifact**:
`./phase-1-review.md`
