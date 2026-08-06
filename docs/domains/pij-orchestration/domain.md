# Domain: pij-orchestration

## Purpose

Own machine-wide orchestration primitives that serialize or coordinate multi-agent
work. Batons provide atomic single-holder leases and pushed lifecycle notices.
Prime designation provides mutually exclusive registry-backed, honor-system
markers for current and retired o-prime seats.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/pij/core/orchestration/baton.ts` | Pi-free baton vocabulary, lifecycle decisions, local store/notice ports, blocked-time and holder-transition rules. |
| `.pi/extensions/pij/core/orchestration/prime.ts` | Pure `PrimeService` over `RegistryPort`; idempotent set/retire/unset transitions preserve the full descriptor. |
| `.pi/extensions/pij/core/orchestration/role.ts` | Stored role vocabulary (`pm\|worker\|pa`), the total `projectOrchestrationRole` projection, the PA lineage guard, and the designation audit append. |
| `.pi/extensions/pij/core/orchestration/pa-capability.ts` | The PA capability boundary: the total `PA_VERB_CLASSIFICATION` table, the `allow\|conditional\|refuse` union, and the one refusal message both gate seams emit. |
| `.pi/extensions/pij/core/orchestration/pa-target.ts` | Pure target predicate for conditionally-permitted PA verbs — self or `effectiveParent` allow, everything else fails closed. |
| `.pi/extensions/pij/core/orchestration/cli.ts` | Pure baton/prime family grammar, dispatch, rendering, and exit-code mapping. |
| `.pi/extensions/pij/adapters/baton-store.ts` | Filesystem adapter for definitions, atomic no-replace lease files, and the append-only machine log under `PIJ_HOME/orchestration/`. |
| `.pi/extensions/pij/core/daemon/baton-sweep.ts` | Holder liveness classification and alert-once-per-transition sweep. |
| `.pi/extensions/pij/cli.ts` | Bin-level `orchestration` family intercept and production adapters. |
| `.pi/extensions/pij/daemon.ts` | Daemon tick wiring for holder-liveness alerts. |
| `docs/how/pij-orchestration-baton.md` | Operator guide and honor-system workflow. |

## Concepts

| Concept | Description | Contract |
|---------|-------------|----------|
| Baton definition | Names the exclusive resource, optional probe/repo, creator, queue, and advisory health metadata. | `BatonDefinition`; stored at `PIJ_HOME/orchestration/batons/<name>.json`. |
| Lease truth | The single current holder and grant facts. | `BatonLease`; atomic no-replace `<name>.lease` file is authoritative. |
| Discretionary queue | Requests carry requester, purpose, optional pin, and declared return evidence; they are selected by id, never FIFO promise. | `BatonRequest[]`; `grant --to <request-id>`. |
| Stale pin | A request pin that differs from the baton's current repo HEAD. | Grant returns `E-PIN` unless `--repin` explicitly accepts the new HEAD. |
| Blocked time | Time from request to grant. | `grantedAt - requestedAt`, exposed by `show --json` and machine log entries. |
| Holder alert | A dead/stalled transition is pushed once to the granter. | Alert records transition state; lease remains untouched until explicit reclaim. |
| Machine log | One structured line per command/action. | `PIJ_HOME/orchestration/log.ndjson`; human narrative remains outside this domain. |
| Prime marker/history | Durable current and retired session designations for registry-first o-prime detection and audit. | `set` → current only; `retire` → old only; `unset` → neither. Multiple current primes remain valid during bounded handover overlap. |
| PA capability class | Every verb a PA may be asked to run is classified `allow`, `conditional`, or `refuse`. The table is TOTAL: `pa-capability.test.ts` scrapes both `core/cli.ts` and `cli.ts` and fails the build on any unclassified verb. | `PaCapability`; consulted identically at both gate seams. |
| Conditional capability | A verb the table cannot decide because the answer depends on the TARGET, not the verb. Passed through both seams; the handler that can see the target decides. | `paRefusal` returns `null`; `paConditionalWhy` carries the rule, projected by `pij whoami`. |
| PA target scope | A PA may act only on ITSELF or its own parent, where parent means `effectiveParent` (`parentId`, falling back to `spawnedBy`) — never the raw `parentId`, or a spawned-but-never-linked PA is refused over its real prime. | `paTargetDecision`; unresolvable target, absent parent, and third-party targets all REFUSE. |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `BatonStorePort` | core service, filesystem adapter, fakes | Definitions + leases + log are accessed through tagged-union operations; lease claim is atomic no-replace. |
| `BatonNoticeSink` | CLI/daemon wiring, fakes | Pushes request/grant/return/reclaim/alert notices and reports `queued\|delivered\|unverified`; notice failure never lies about success. |
| Baton lifecycle results | CLI, tests | Tagged unions; single-holder conflicts and stale pins fail explicitly, while grant/reclaim authority remains an honor-system judgment. |
| Holder transition decision | daemon sweep | Pure previous/current liveness shaping; dead/stalled alerts once per transition, no lease mutation. |
| Prime mutation result | CLI, skill, tests | Set/unset retain `{id,prime,changed}` compatibility; retire returns additive `{id,prime:false,oldPrime:true,changed}`. `E-NOID`/`E-AMBIG` perform no write. |

## Boundary Owns

- Baton definitions, queue records, and lease lifecycle decisions.
- The `PIJ_HOME/orchestration/` store layout and append-only machine log.
- Atomic single-holder truth.
- Pin/re-pin semantics and blocked-time accounting.
- Holder-health transition metadata and alert-never-auto-reclaim behavior.
- Current/old-prime transition service and orchestration grammar.

## Boundary Excludes

- Message transport and delivery-receipt mechanics — consumed from `pij-messaging`.
- CLI process I/O, git invocation, registry lookup, and daemon lifecycle — owned by
  `pij-control-plane`.
- Human grant judgment, narrative annotations, and the hand-maintained baton book —
  government-layer concerns, never referenced by product code.

## Dependencies

### This Domain Depends On

| Domain / System | Type | Contract Used |
|-----------------|------|---------------|
| `pij-messaging` | consume | Session ids, delivery transport, registry descriptors, and `queued\|delivered\|unverified` receipt vocabulary. |
| `extension-authoring-harness` | consume | Vitest, typecheck/lint/smoke sensors, fakes discipline, and `harness checks`. |

### Domains That Depend On This

| Domain | Contract Used |
|--------|---------------|
| `pij-control-plane` | Hosts the `orchestration` CLI family and daemon baton sweep. |
| `pij-skill` | Teaches operators when to use the baton primitive while retaining the human evidence layer. |

## History

| Plan | Change | Date |
|------|--------|------|
| 036-pij-orchestration-baton | Created the domain and established batons as the first `pij orchestration` primitive. | 2026-07-11 |
| 038-pij-prime-designation | Added the registry-backed prime primitive with exact-self targeting and idempotent set/unset results. | 2026-07-11 |
| 046-pij-real-trees | Added `prime retire`, mutually exclusive current/old transitions, multiple-current compatibility, and historical old-prime audit without changing set/unset JSON receipts. | 2026-07-13 |
