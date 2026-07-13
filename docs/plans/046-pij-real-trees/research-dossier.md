# Research Dossier: Real pij session trees

**Generated**: 2026-07-13T07:01:05+10:00
**Query**: "ensure pij has real trees."
**Effort**: Standard
**Tools**: Standard
**Evidence**: 12 current sources · 3 historical sources

## Answer

1. Automatic control-plane spawn already persists `spawnedBy`, passes the same id as `PIJ_PARENT_ID`, and preserves it across reattachment; the missing auto-spawn tree is primarily a query/projection gap.
2. Human-pane adoption creates or reattaches a descriptor without any caller-supplied parent relationship. The live s046 adoptee and its o-prime are both bound, but neither row contains a link.
3. `spawnedBy` is also the close-authorization owner. Reusing it for non-owning adoption hierarchy would let a structural parent imply teardown authority, so tree parentage and lifecycle ownership need distinct contracts with a legacy fallback for spawned sessions.
4. Repository grouping cannot use `folder`: `--here` is exact-cwd equality, while linked worktrees have different top-level paths. The canonical git common directory is identical for the main checkout and s046 worktree and is the available repository identity seam.
5. Tree output must keep three existing axes separate: activity (`working|idle|done`), liveness (`active|stale|dead|dissolved`), and lifecycle (`pending|ready|bound|failed|dissolved`). Prime is currently an independent boolean designation; multiple current primes are already allowed, but former-prime state is absent.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `SessionDescriptor` has additive `prime`, exact `folder`, and `spawnedBy`, but no repository key, structural parent, or former-prime marker. | `.pi/extensions/pij/core/types.ts:47-78` | Additive descriptor fields are required; legacy descriptors must remain readable. | High |
| F-02 | Control-plane spawn resolves the caller once, sends it as `PIJ_PARENT_ID`, and persists it as `spawnedBy` before bind. | `.pi/extensions/pij/cli.ts:599-605`, `.pi/extensions/pij/cli.ts:663-670`, `.pi/extensions/pij/cli.ts:733-751`, `.pi/extensions/pij/core/spawn.ts:320-339` | Auto-spawn parentage can be materialized at descriptor creation without a second lookup. | High |
| F-03 | Reattachment preserves durable metadata, including the creator relationship, while replacing cwd/pid/pane/runtime lifecycle. | `.pi/extensions/pij/core/binding.ts:193-219` | New graph metadata should follow the same durable spread/reattach contract. | High |
| F-04 | Adopt resolves the pane cwd and native identity, then builds or reattaches descriptors without a parent argument or relationship write. | `.pi/extensions/pij/cli.ts:1011-1021`, `.pi/extensions/pij/cli.ts:1164-1235`, `.pi/extensions/pij/cli.ts:1289-1316` | Adoption needs an explicit link input and a post-adoption linking path for self-adopted human panes. | High |
| F-05 | Live dogfood shows `pij-condemned-cockroach` and `pij-primary-carp` as bound Copilot sessions with no `spawnedBy` relation. | `pij sessions --json` live probe, 2026-07-13T07:00+10:00 | The current human-created-pane workflow cannot reconstruct its real tree from persisted state. | High |
| F-06 | Close authorization is defined by `descriptor.spawnedBy === self`; non-owners require `--force`, and close writes a durable `dissolved` tombstone. | `.pi/extensions/pij/core/close.ts:47-86`, `.pi/extensions/pij/cli.ts:1340-1391`, `.pi/extensions/pij/adapters/fs-registry.ts:455-467` | Structural reparenting must not silently transfer close ownership; dissolved nodes can remain queryable in historical trees. | High |
| F-07 | `pij list --here` filters by exact descriptor-folder equality and `list --prime` is a separate boolean filter. | `.pi/extensions/pij/core/discovery.ts:68-79`, `.pi/extensions/pij/core/cli.ts:638-680` | Repository tree selection needs a git-derived identity, not reuse of `--here`. | High |
| F-08 | Main and s046 have different `--show-toplevel` values but the same absolute `--git-common-dir` (`/Users/jordanknight/pi-hacking/pij/.git`). | live git probe, 2026-07-13T07:00+10:00; `.pi/extensions/pij/core/daemon/watch.ts:204-216` | Canonicalized absolute git-common-dir is the minimum repository key that groups linked worktrees. | High |
| F-09 | Current state reporting distinguishes derived activity from liveness; quiet idle peers remain active, while only working-and-quiet peers become stale. | `.pi/extensions/pij/core/state.ts:20-55`, `.pi/extensions/pij/core/cli.ts:644-664` | Tree filters must expose named axes or a documented selector grammar rather than collapse them into one ambiguous status. | High |
| F-10 | Lifecycle already includes `pending|ready|bound|failed|dissolved`; liveness includes `active|stale|dead|dissolved`. | `.pi/extensions/pij/core/types.ts:22-27`, `.pi/extensions/pij/core/types.ts:39-45` | `closed` should be a presentation alias for durable `dissolved`, not a fourth competing state store. | High |
| F-11 | Prime designation is honor-system, idempotent `set|unset`, and current design explicitly permits multiple primes but has no kinds/hierarchy. | `.pi/extensions/pij/core/orchestration/prime.ts:12-29`, `docs/plans/038-pij-prime-designation/pij-prime-designation-plan.md:29-34` | Preserve multiple current primes; add former-prime representation without automatic election or uniqueness policy. | High |
| F-12 | `pij sessions` already projects `spawnedBy` and lifecycle as a stable read-only registry view. | `.pi/extensions/pij/core/session-join.ts:17-46`, `.pi/extensions/pij/core/cli.ts:688-706` | Tree construction belongs in a pure projection beside existing list/session views, with thin CLI/git adapters. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 031 established that join keys and `spawnedBy` were already captured and that adoption was the identity gap, favoring projection over duplicate capture. | `docs/plans/031-pij-telemetry-join-keys/pij-telemetry-join-keys-plan.md:15-32`, `:183-190` | Direct | Reuse descriptor persistence and projection patterns; do not create a separate tree database. |
| H-02 | Plan 038 made prime mutable, latest-disk-authoritative, migration-safe, non-unique, and registry-first; it explicitly deferred prime kinds/hierarchy. | `docs/plans/038-pij-prime-designation/pij-prime-designation-plan.md:16-34`, `:95-105`, `:198-207` | Direct | Former-prime semantics extend a deliberately narrow marker and must preserve daemon merge ownership and existing boolean consumers. |
| H-03 | The o-prime requirements define a pij id as a seat, require one-hop governance, and treat worktree topology as a governed coordination concern. | `docs/plans/035-o-prime-routing-skill/requirements-spine.md:50-64`, `:95-103` | Partial | Tree edges should model seat control, not personas, and repository grouping must remain compatible with governed worktree splits. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Structural parent vs teardown owner | F-02, F-06 | Overloading `spawnedBy` makes adoption hierarchy grant close authority. | Plan a separate additive `parentId` (or equivalent graph edge) while treating `spawnedBy` as a legacy parent fallback for spawned nodes. |
| Repository identity persistence | F-07, F-08 | Query-time git probes fail for deleted/moved worktrees, while a persisted key can become stale after repository relocation. | Define capture + read-time fallback semantics and tests for legacy, moved, missing, main, and linked-worktree folders. |
| Reparent/cycle/orphan behavior | F-04, F-05 | Post-hoc adoption needs relinking, but arbitrary links can create cycles or point to missing nodes. | Specify a pure link validator, explicit unlink/reparent behavior, cycle refusal, and orphan rendering. |
| Prime takeover representation | F-11, H-02 | A second boolean risks contradictory `prime && oldPrime`; replacing `prime` breaks consumers. | Workshop the additive compatibility shape and exact CLI transition semantics before implementation. |
| Default visibility | F-09, F-10 | The global registry contains many dead/dissolved sessions; showing all by default can make the command unusable, while hiding history can mislead. | Specify default inclusion plus explicit `--activity`, `--liveness`, and `--lifecycle` filters and JSON behavior. |
| Hot CLI/skill seams | `government/briefs/s046-brief.md#Fences` | s041 owns top-level CLI/help/skill surfaces during planning. | Name exact future edits in the plan; o-prime sequences grants/composition at validation. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-messaging` | modify | Add migration-safe graph/repository/prime-history vocabulary and pure tree/filter projections. | `docs/domains/pij-messaging/domain.md:35-75` |
| `pij-control-plane` | modify | Capture git identity at spawn/adopt/session registration, wire link/tree CLI, preserve latest-disk mutable fields. | `docs/domains/pij-control-plane/domain.md:35-74` |
| `pij-orchestration` | modify | Extend prime transition semantics while retaining honor-system, multiple-prime behavior. | `docs/domains/pij-orchestration/domain.md:23-61` |
| `pij-skill` | modify late | Teach adoption/link/tree and prime handover only after product proof; live-deployed text requires the existing gate. | `docs/domains/pij-skill/domain.md:9-38` |
| git repository boundary | new consumed seam | Absolute canonical git-common-dir identifies one repository across linked worktrees. | F-08 |

## Planning Handoff

- **Preserve**: stable native pij identity; additive descriptor compatibility; `spawnedBy` close ownership; durable dissolved tombstones; exact-self error behavior; multiple current primes; latest-disk-authoritative mutable orchestration state; pure core + injected impure adapters.
- **Change carefully**: descriptor merge ownership, adoption/reattachment, pi self-registration, CLI grammar/help, list/session JSON compatibility, live skill text, and daemon restart/live proof.
- **Likely files/symbols**: `.pi/extensions/pij/core/types.ts`; new pi-free graph/repository projection module + tests; `core/discovery.ts`; `core/cli.ts`; `core/orchestration/prime.ts`; `core/daemon/loop.ts`; `core/session.ts`; `core/spawn.ts`; `cli.ts`; `adapters/fs-registry.ts`; CLI integration tests; operator/domain docs; late `skills/pij/**`.
- **Decisions still required**: structural-link field and ownership separation; post-hoc link/reparent CLI; repository-key capture/fallback; tree selector/default/filter grammar; cycle/orphan rendering; old-prime compatibility shape and handover transition.
