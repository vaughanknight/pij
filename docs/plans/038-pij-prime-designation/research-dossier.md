# Research Dossier: First-class pij prime designation

**Generated**: 2026-07-11T11:15:13Z
**Query**: "First-class prime designation under `pij orchestration prime`, composed with `pij list --prime` and `--here`"
**Effort**: Standard
**Tools**: Mixed
**Evidence**: 14 current sources · 4 historical sources

## Answer

- The ruled product shape fits the existing architecture without a new store: add an optional boolean prime marker to `SessionDescriptor`, mutate it through `pij orchestration prime set|unset [<id>]`, and filter it through `pij list --prime [--here]`.
- `set`/`unset` should be idempotent. Omitting `<id>` targets the current session; an explicit id targets another session. The orchestration family's existing honor-system posture permits any peer/operator to designate another session.
- The marker is durable across reload, resume, descriptor removal, and re-adoption because live registry writes synchronize the full descriptor into native-identity snapshots and reattachment spreads durable metadata.
- The load-bearing implementation issue is concurrent daemon writes: `writeMerged()` currently preserves only an absent append-only field. Prime is mutable, so the latest on-disk value must be authoritative for externally owned fields, including `false`, or `unset` can be resurrected by a stale daemon snapshot.
- Prime discovery composes with existing list behavior: `pij list --prime` returns all designated sessions, while `pij list --prime --here` applies the existing exact-cwd filter first. No arbitrary `--folder` surface is needed.
- The `/pij prime` skill route can consume registry truth for its o-prime-seat probe while retaining roster/adoption-brief fallbacks. Its CLI-coverage table should also acknowledge the already-shipped `orchestration` family.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `SessionDescriptor` is the live registry vocabulary and its control-plane additions are optional for migration safety. | `.pi/extensions/pij/core/types.ts:47-139` | Add `prime?: boolean`; legacy descriptors read as not-prime. | High |
| F-02 | Registry writes atomically replace the live descriptor and synchronize the complete descriptor into durable native-identity snapshots. | `.pi/extensions/pij/adapters/fs-registry.ts:91-112`, `:159-171`, `:278-299` | A prime marker written through `FsRegistry` survives descriptor removal and exact-session re-adoption. | High |
| F-03 | Pi session boot and external-harness reattachment spread durable metadata before replacing runtime attachment fields. | `.pi/extensions/pij/core/session.ts:133-158`, `.pi/extensions/pij/core/binding.ts:178-195` | No prime-specific restart path is needed; add tests proving the generic spread contract. | High |
| F-04 | Daemon writes derive from a tick-start snapshot and use an explicit externally-owned-field merge to avoid clobbering out-of-band writes. | `.pi/extensions/pij/core/daemon/loop.ts:143-175` | Add prime to this ownership contract, but make latest disk truth authoritative because prime can be unset. | High |
| F-05 | The existing concurrent-writer tests prove only append-style `reportedAt` preservation and currently prefer the computed value when both sides carry one. | `.pi/extensions/pij/core/daemon/loop.test.ts:554-585` | Add RED tests for `prime: false` winning over stale `prime: true`, plus set preservation; update the merge rule deliberately. | High |
| F-06 | `pij list` already has strict boolean flag parsing, exact-cwd composition, JSON projection, and human rendering in the pure CLI core. | `.pi/extensions/pij/core/cli.ts:47-50`, `:210-267`, `:626-665`; `.pi/extensions/pij/core/discovery.ts:66-72` | Add only `--prime`; chain it with `--here`, include `prime` in JSON, and expose a compact human marker/column. | High |
| F-07 | The orchestration family is a bin intercept over a pure primitive grammar/dispatcher; baton is the first primitive, not a one-off top-level verb. | `.pi/extensions/pij/cli.ts:1434-1461`, `:1940-1942`; `.pi/extensions/pij/core/orchestration/cli.ts:5-18`, `:182-205`, `:367-455` | Extend the family with a `prime` primitive and keep parsing/dispatch pi-free. | High |
| F-08 | Current orchestration posture is explicitly honor-system: any peer may perform judgment-bearing actions; hard mechanics cover validity and state truth. | `.pi/extensions/pij/core/orchestration/cli.ts:16-18`; `docs/plans/036-pij-orchestration-baton/pij-orchestration-baton-plan.md:14-16` | Permit explicit other-session designation; do not add ACLs or ownership policy. | High |
| F-09 | Current self resolution distinguishes exact session identity from ambiguous multi-session cwd state. | `.pi/extensions/pij/core/discovery.ts:82-119`; `.pi/extensions/pij/cli.ts:1411-1419` | A targetless `prime set|unset` must return `E-AMBIG` when self cannot be resolved, not silently designate an `"operator"` pseudo-id. | High |
| F-10 | The prime route currently identifies the o-prime by reading the government roster, and the skill still states that prime is not a top-level CLI verb. | `skills/pij/references/routes/prime.md:9-21`; `skills/pij/SKILL.md:34-45` | Add registry-first seat detection without removing durable government fallbacks; `pij orchestration prime` does not collide with `/pij prime`. | High |
| F-11 | The skill gate mechanically checks route/CLI coverage, but the current "every pij verb" table omits the shipped `orchestration` family. | `skills/pij/SKILL.md:34-45`; `docs/domains/pij-skill/domain.md:18-21` | Update coverage and keep `just pij-skill-check` load-bearing for the live-deployed route edit. | High |
| F-12 | The operator guide opens with the obsolete statement that pij has "no server, no daemon", while the current product has a shared daemon control plane. | `docs/how/pij.md:1-7`; `.harness/engineering-harness.md:46-56` | Fold the one-line correction into the prime documentation task. | High |
| F-13 | Prime designation crosses established domains rather than creating a new one. | `docs/domains/registry.md:12-18`; `docs/domains/domain-map.md:50-65` | Update `pij-messaging`, `pij-orchestration`, `pij-skill`, and the map; do not mint a new domain. | High |
| F-14 | The two preamble decisions are settled: orchestration namespace, existing list/`--here` filtering. | `docs/plans/038-pij-prime-designation/rulings.md:3-8` | Do not re-open namespace or add `--folder`. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | A daemon stale-copy write clobbered `reportedAt`, breaking `--once` auto-close until every daemon descriptor write routed through `writeMerged`. | `docs/plans/029-pij-agents-minih/the-flow.md:101-105` | Direct | Prime mutation must extend and strengthen this exact seam, not add a second merge path. |
| H-02 | Jordan established `pij orchestration <primitive>` specifically so future orchestration primitives would share one family; the implementation retained an honor-system posture. | `docs/plans/036-pij-orchestration-baton/original-ask.md:4-10`; `pij-orchestration-baton-plan.md:14-16` | Direct | Prime is the second primitive; mirror the baton family shape without baton-specific storage machinery. |
| H-03 | The prime route deliberately has one `prime` skill row with role discovery inside the route, rather than role-specific route rows. | `docs/plans/035-o-prime-routing-skill/vendored/pij-prime-answers-r1.md:94-101`; `workshops/001-prime-route-architecture.md:84-90` | Partial | Registry designation should improve the route's first probe, not split or rename the skill route. |
| H-04 | The broadcast addition preserved existing single-target behavior and added CLI/list documentation additively while coordinating shared CLI files. | `docs/plans/037-pij-broadcast/execution.log.md:64-81` | Partial | Keep ordinary `pij list` behavior compatible; `--prime` is an additive filter/projection. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Mutable external-field merge | F-04, F-05, H-01 | Copying the `reportedAt` preserve-if-missing rule verbatim is insufficient for `unset`; stale `true` can overwrite current `false`. | Specify latest-disk-authoritative merge semantics and mutation-prove set plus unset races. |
| Targetless self designation | F-09 | The existing orchestration actor fallback returns `"operator"` on ambiguity, which is valid for baton logs but not a session designation target. | Prime dispatch uses exact `resolveSelf`; explicit target remains usable outside a bound peer. |
| Visibility contract | F-06 | A filter alone hides which rows are prime in ordinary list output. | Include an additive `prime` boolean in JSON and a compact human column/marker. |
| Live skill deployment | F-10, F-11 | Route text is live agent behavior and can drift from CLI behavior. | Make the route edit late, run `just pij-skill-check`, and verify registry-first detection against a scratch `PIJ_HOME`. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-messaging` | modify | Owns `SessionDescriptor`, self resolution, and list filtering/projection. | F-01, F-06, F-09 |
| `pij-orchestration` | modify | Owns `prime set|unset` grammar and designation mutation posture. | F-07, F-08 |
| `pij-control-plane` | modify | Hosts production adapters and the daemon merge seam. | F-02, F-04 |
| `pij-skill` | modify | Consumes the designation for route triage; remains markdown-only. | F-10, F-11 |
| `extension-authoring-harness` | consume | Targeted vitest, skill check, smoke, and full `harness checks` prove the feature. | `.harness/engineering-harness.md:27-38` |

## Planning Handoff

- **Preserve**: optional additive descriptor fields; exact-session durable snapshots; pure core/adapter split; strict `E-ARG` parsing; existing `--here` semantics; honor-system orchestration; roster/adoption-brief fallback in the skill route.
- **Change carefully**: `writeMerged()` externally-owned-field semantics; targetless self resolution; ordinary list human/JSON output compatibility; live-deployed skill text.
- **Likely files/symbols**: `core/types.ts`; new `core/orchestration/prime.ts` + test; `core/orchestration/cli.ts` + test; `core/cli.ts` + test; `core/daemon/loop.ts` + test; top-level `cli.ts`; `cli.integration.test.ts`; `docs/how/pij.md`; affected domain docs; `skills/pij/{SKILL.md,references/routes/prime.md}`.
- **Recommended command contract**: `pij orchestration prime set [<id>] [--json]`; `pij orchestration prime unset [<id>] [--json]`; `pij list --prime [--here] [--json]`.
- **Recommended data contract**: `SessionDescriptor.prime?: boolean`; set writes `true`, unset writes `false`, legacy absence is false.
- **Decisions still required**: exact human list marker/column wording only; no architectural or product-scope question remains.
