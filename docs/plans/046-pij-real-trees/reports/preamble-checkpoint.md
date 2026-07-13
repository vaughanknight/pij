# Preamble checkpoint — s046 pij real trees

**Lifecycle**: `PREAMBLE_COMPLETE`
**Seat**: `pij-condemned-cockroach`
**Recorded**: 2026-07-13T06:57:02+10:00

## Thesis

**Thesis** — pij needs a durable session graph so orchestration relationships remain queryable across spawn, adoption, worktrees, lifecycle changes, and prime-seat takeover rather than being inferred from panes or folder equality.

**Now** — pij exposes stable session identity, a spawned-session `PIJ_PARENT_ID`, flat list/state views, and a durable prime marker, while this adopted stream demonstrates that descriptor cwd and governed repository identity can legitimately diverge.

**Toward** — operators should be able to query global, repository, prime, or arbitrary-node trees with honest lifecycle filtering and explicit current-prime/old-prime representation.

**Keep** — preserve migration-safe descriptors, ownership-aware teardown, stable native-session identity, government fences, and repository identity across git worktrees.

> **My read:** The tree must become durable control-plane truth, not a display assembled from incidental runtime coordinates. Correctness means spawned and adopted relationships survive lifecycle transitions while legacy sessions and governed ownership remain safe.

## claim

Preamble orientation is complete and no planning or product mutation has begun. The adopted descriptor cwd mismatch is acknowledged; all repository commands began from `/Users/jordanknight/pi-hacking/pij-worktrees/s046-pij-real-trees`, and all owned mutable paths target that worktree. The only reads outside the worktree were the portable `/pij` skill and the live government sources explicitly designated authoritative by `government/orient-local.md`.

## artifacts[]

- `docs/plans/046-pij-real-trees/original-ask.md`
- `docs/plans/046-pij-real-trees/reports/preamble-checkpoint.md`
- `/Users/jordanknight/pi-hacking/pij/government/orient-local.md` (authoritative read-only government source)
- `/Users/jordanknight/pi-hacking/pij/government/briefs/s046-brief.md` (authoritative read-only government source)
- `/Users/jordanknight/.agents/skills/pij/references/prime/orient-global.md` (portable read-only orient)
- `AGENTS.md`
- `docs/how/pij.md`

## shas[]

- branch: `s046/pij-real-trees`
- worktree HEAD: `347b6dd732110bc76b3d421e61a401cc228149d6`
- approved base: `origin/main@347b6dd732110bc76b3d421e61a401cc228149d6`

## gates[]

- Canary 3/3 closed by o-prime at Spine Seq 94.
- `pij whoami --json` resolved `pij-condemned-cockroach` with descriptor folder `/Users/jordanknight/pi-hacking/pij`.
- Worktree root resolved `/Users/jordanknight/pi-hacking/pij-worktrees/s046-pij-real-trees`.
- Worktree branch and HEAD exactly matched the brief.
- Worktree common git directory resolved `/Users/jordanknight/pi-hacking/pij/.git`, proving the allocated tree belongs to the same repository.
- Mandatory orient reads completed: portable global orient, live local orient, stream brief, `AGENTS.md`, `docs/how/pij.md`, and original ask.
- `/thesis` invoked in read-only `fit` mode semantics; axes are persisted above.
- Main checkout received no write, stage, link, or edit from this seat. Its observed dirty paths belong to the pre-existing/shared government state; none were touched by this seat.

## observations[]

- The descriptor reports the main checkout while governed work occurs in the allocated worktree. This is expected dogfood evidence for adoption and repository-scoped tree identity.
- The worktree began with one untracked authoritative input, `docs/plans/046-pij-real-trees/original-ask.md`; this checkpoint is the first seat-authored repository artifact.
- The main checkout is independently dirty with government and other stream artifacts. Repository-wide proof must distinguish seat-authored changes from shared-main activity rather than equating a dirty common repository with a stream breach.

## open[]

- None block Builder explore/plan.
- Product, skill, CLI-help, and government paths remain read-only during planning.
- Hot-seam composition with s041 and s045 must be sequenced by o-prime at validation.
- Implementation remains forbidden until a cold-validated plan reaches `WAITING_FOR_BUILD_CONFIG` and the human confirms the fleet profile.
