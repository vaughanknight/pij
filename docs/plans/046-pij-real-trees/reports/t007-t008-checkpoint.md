# T007-T008 checkpoint — s046 pij real trees

**Lifecycle**: `TRANCHE_COMPLETE`
**Grant**: Spine Seq 160
**Seat**: `pij-condemned-cockroach`
**Recorded**: 2026-07-13T13:32:32+10:00

## claim

T007-T008 old-prime core transitions are implemented and cold-review approved. The tranche adds migration-safe old-prime state, mutually exclusive set/retire/unset, pure retire orchestration, ordinary P/O list projection, and daemon merge ownership. Top-level CLI/wiring, T011/docs/skills, smoke/live, restart, git ceremony, and merge remain unstarted.

## artifacts[]

- `docs/plans/046-pij-real-trees/reports/t007-t008-grant-request.md`
- `docs/plans/046-pij-real-trees/tasks/tranche-t007-t008/tasks.md`
- `docs/plans/046-pij-real-trees/tasks/tranche-t007-t008/execution.log.md`
- `docs/plans/046-pij-real-trees/reviews/reviewer-brief-t007-t008.md`
- `docs/plans/046-pij-real-trees/reviews/review-t007-t008.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0003.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0006.patch`

## shas[]

- branch HEAD before tranche commit authorization: `b49048525451ab2493b546e529d2696ec2ab557a`
- immutable reviewed patch: `a7161883ae39b4fca71410b93c563df88737036778c25503503253ffe4949ca2`
- `core/orchestration/prime.ts`: `e460394329aea10218956a0ea8f6d41db8dcebba47d52ac5941bcf9b488c6f28`
- `core/cli.ts`: `c2033d8df75a7b93bcfc03dc7ddd8658a5fcbbdd8a7dc18e00fd6a2ed63484e9`
- `core/daemon/loop.ts`: `f732a5c8d0e3b77e6d7239be0e659eaeacb2d3466dcf28529f087845a18a5733`
- review: `c0287733adfd0e06dbbe28b7bb6aedbc9ddc785f6c5bf04af15b25c51837a927`

## gates[]

- Coder RED→GREEN: 18 failed / 126 passed → 145/145 focused tests.
- Four mandatory mutations all RED→restore→GREEN:
  - set clearing old-prime;
  - retire clearing current prime;
  - daemon latest `oldPrime:false`;
  - current-only `list --prime`.
- Cold review: `APPROVE`, no findings.
- Reviewer regression matrix: focused 145/145; T005-T006A 276/276; close 15/15; quick harness green.
- Orchestrator targeted checkpoint: ten suites 389/389.
- `harness checks --quick`: typecheck, lint, full tests, Windows compatibility, package audit, snapshots passed; smoke skipped/T012.
- Scope: exactly nine granted product/test paths changed; no top-level CLI/integration or s044 file.
- `.pi/packages.yaml` date-only audit churn restored owner-side byte-identical to HEAD.

## delivered[]

- `SessionDescriptor.oldPrime?: boolean`, legacy absence projecting false.
- `set` -> `(prime,oldPrime)=(true,false)`.
- `retire` -> `(false,true)`.
- `unset` -> `(false,false)`.
- Pair-aware idempotence, unrelated metadata preservation, and multiple current-prime support.
- Pure `pij orchestration prime retire` grammar/dispatch with existing exact-self and explicit-target semantics.
- Ordinary list `P`/`O` markers, corrupt both-true precedence to `P`, additive JSON old-prime field, and current-only `list --prime`.
- Latest-disk old-prime true/false daemon merge ownership.

## observations[]

- Top-level integration exposed a compatibility requirement: legacy set/unset JSON receipts remain byte-compatible; service results and retire/list JSON expose old-prime additively.
- Flow-pair prompt-learning emission remains deferred because skill/prompt-lab paths are outside Seq160.
- Peer compacts remained immediate fire-and-forget.

## open[]

- Await prime verification and explicit next-tranche grant.
- T009-T010 production tree/link/adopt/CLI wiring remains next in dependency order but unstarted.
- T011 overlaps active s044 and remains held.
- No commit/push/PR update was authorized for Seq160.
