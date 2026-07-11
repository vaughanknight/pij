# Domain: pij-orchestration

## Purpose

Own machine-wide orchestration primitives that serialize or coordinate multi-agent
work. Batons provide atomic single-holder leases and pushed lifecycle notices.
Prime designation provides a registry-backed, honor-system marker for the current
o-prime seat.

## Source Locations

| Path | Role |
|------|------|
| `.pi/extensions/pij/core/orchestration/baton.ts` | Pi-free baton vocabulary, lifecycle decisions, local store/notice ports, blocked-time and holder-transition rules. |
| `.pi/extensions/pij/core/orchestration/prime.ts` | Pure `PrimeService` over `RegistryPort`; idempotent set/unset preserving the full descriptor. |
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
| Prime marker | Durable session designation for registry-first o-prime detection. | `prime set\|unset [id]`; explicit target or exact self-resolution, idempotent `changed` result. |

## Contracts

| Contract | Consumer | Shape / Guarantee |
|----------|----------|-------------------|
| `BatonStorePort` | core service, filesystem adapter, fakes | Definitions + leases + log are accessed through tagged-union operations; lease claim is atomic no-replace. |
| `BatonNoticeSink` | CLI/daemon wiring, fakes | Pushes request/grant/return/reclaim/alert notices and reports `queued\|delivered\|unverified`; notice failure never lies about success. |
| Baton lifecycle results | CLI, tests | Tagged unions; single-holder conflicts and stale pins fail explicitly, while grant/reclaim authority remains an honor-system judgment. |
| Holder transition decision | daemon sweep | Pure previous/current liveness shaping; dead/stalled alerts once per transition, no lease mutation. |
| Prime mutation result | CLI, skill, tests | `{id, prime, changed}`; `E-NOID`/`E-AMBIG` are fail-loud and perform no write. |

## Boundary Owns

- Baton definitions, queue records, and lease lifecycle decisions.
- The `PIJ_HOME/orchestration/` store layout and append-only machine log.
- Atomic single-holder truth.
- Pin/re-pin semantics and blocked-time accounting.
- Holder-health transition metadata and alert-never-auto-reclaim behavior.
- Prime designation service and orchestration grammar.

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
