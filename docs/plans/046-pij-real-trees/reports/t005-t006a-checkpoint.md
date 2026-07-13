# T005-T006A checkpoint — s046 pij real trees

**Lifecycle**: `TRANCHE_COMPLETE`
**Grant**: Spine Seq 152
**Seat**: `pij-condemned-cockroach`
**Recorded**: 2026-07-13T12:57:49+10:00

## claim

T005-T006A core parent/repository persistence is implemented and accepted after one test-only cold-review fix loop. The tranche preserves merged delivery/inbox/Codex/effort behavior and `spawnedBy` close ownership. Old-prime, top-level CLI/wiring, T011, smoke/live, restart, git ceremony, and merge remain unstarted.

## artifacts[]

- `docs/plans/046-pij-real-trees/reports/t005-t006a-grant-request.md`
- `docs/plans/046-pij-real-trees/tasks/tranche-t005-t006a/tasks.md`
- `docs/plans/046-pij-real-trees/tasks/tranche-t005-t006a/execution.log.md`
- `docs/plans/046-pij-real-trees/reviews/reviewer-brief-t005-t006a.md`
- `docs/plans/046-pij-real-trees/reviews/review-t005-t006a.md`
- `docs/plans/046-pij-real-trees/reviews/fix-t005-t006a-r1.md`
- `docs/plans/046-pij-real-trees/reviews/reviewer-brief-t005-t006a-r2.md`
- `docs/plans/046-pij-real-trees/reviews/review-t005-t006a-r2.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0002.md`
- `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0005.patch`

## shas[]

- branch HEAD before tranche commit authorization: `7c339229d5f4d1a56f886b54d227113b97ce2504`
- immutable reviewed patch: `4eb199f949a1353603b44b7218d014ec806fe83a934f4b4b820d9c549c2bd203`
- `core/daemon/loop.ts`: `9d2da964401076c627c0a8632e6a31061bb839de8b537fdb2ff6b91c808c36cf`
- `core/daemon/loop.test.ts`: `23c3950e436e872a03214140bf1b046e3fb2e4357d08f71a33b81f35d054d52e`
- R2 review: `eebf225d6828fcd33d69f20558fa70eb7d5424097bf286cf3fa16f6e701db249`

## gates[]

- Initial coder RED→GREEN: 9 failed / 262 passed → 271/271 focused tests.
- Cold review R1: `FIX_REQUIRED`; implementation correct but failure-path metadata-strip mutation survived 42/42.
- Test-only R1: table cases for explicit parent id and explicit-root null made the mutation RED (2 failed / 42 passed); implementation restored byte-identical; daemon 44/44.
- Cold review R2: `APPROVE`.
- Dimension 0:
  - latest-disk parent-null merge mutation RED→restore→GREEN;
  - repository refresh mutation RED→restore→GREEN;
  - repository preservation mutation RED→restore→GREEN;
  - daemon failure metadata-strip mutation RED→restore→GREEN.
- Orchestrator targeted checkpoint: seven suites 288/288.
- `harness checks --quick`: typecheck, lint, full tests, Windows compatibility, package audit, snapshots passed; smoke skipped/T012-owned.
- Scope: 11 granted product/test paths changed; allowed `fs-registry.ts` stayed unchanged because its real snapshot characterization was already green.
- `.pi/packages.yaml` audit date churn was repeatedly proven date-only and restored owner-side byte-identical to HEAD.

## delivered[]

- Pending descriptors accept/persist structural parent id/null and repository identity independently from close ownership.
- Pi registration/reload/hydration/dissolve refresh supplied metadata and preserve absent durable metadata.
- Reattachment refreshes supplied repository identity while preserving merged `deliveryMode`, transcript, parent, and owner contracts.
- Daemon merge makes latest persisted `parentId` and `gitCommonDir` authoritative beside existing prime semantics.
- Failure persistence is mutation-guarded for parent id/null, repository identity, close owner, failure reason, and notification.
- Real FsRegistry snapshot removal/hydration/dissolve behavior is characterized without unnecessary source change.

## observations[]

- Reviewer correctly rejected a behaviorally correct implementation because its failure-path durability claim lacked a load-bearing test.
- Merged-main inbox and delivery changes remained green; no post-outcome or mark-read behavior was modified.
- Flow-pair prompt-learning candidate remains deferred because skill/prompt-lab paths are outside Seq152.
- Peer compacts were immediate fire-and-forget.

## open[]

- Await prime verification and explicit next-tranche grant.
- T007-T008 old-prime transitions remain next in dependency order but unstarted.
- T009-T010 production control-plane/CLI wiring remains deferred.
- No commit/push/PR update was authorized for Seq152.
