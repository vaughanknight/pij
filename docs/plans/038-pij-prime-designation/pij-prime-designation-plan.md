# First-class pij prime designation
**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-07-11
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

Incorporates `research-dossier.md`. The existing registry, durable identity snapshot, orchestration family, list filter, and prime skill route provide the required surfaces. The critical constraint is mutable out-of-band descriptor state: an unset must survive a concurrent daemon write.

### Summary

Give pij sessions a first-class, machine-readable prime designation. A session or operator can idempotently designate itself or another live session through `pij orchestration prime set|unset [<id>]`; `pij list --prime` lists all designated sessions and composes with the existing `--here` cwd filter. The designation becomes the registry-first o-prime-seat probe for `/pij prime`, while durable government files remain the fallback and evidence layer.

### Goals

- Designate the current session as prime without requiring its pij id.
- Designate or undesignate another live session by explicit pij id.
- List all prime sessions, or only prime sessions in the current folder.
- Preserve designation across reload, resume, descriptor removal, and exact-session re-adoption.
- Prevent stale daemon writes from resurrecting or clearing a newer designation.
- Make `/pij prime` seat detection mechanical without removing roster/adoption-brief fallbacks.
- Teach bootstrap and seat handover to write the designation so live governments consume the registry path by default.
- Repair the skill CLI-coverage sensor so the orchestration family cannot be omitted again.

### Non-Goals

- No arbitrary `--folder <path>` filter; compose `--prime` with existing `--here`.
- No automatic election, uniqueness enforcement, or "one prime per folder" policy.
- No ACLs: designation follows the orchestration family's honor-system posture.
- No prime kinds, hierarchy, role enum, or replacement of `parent|worker`.
- No audit fields such as `primeSetBy` or `primeSetAt`.
- No separate prime sidecar store.
- No replacement of government roster, briefs, or single-writer evidence files.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|---------------------|
| `pij-messaging` | existing | **modify** | Add the optional descriptor marker, list filter/projection, exact self-target resolution contract, and durability tests. |
| `pij-orchestration` | existing | **modify** | Add the `prime set|unset` primitive under the ruled orchestration family and retain honor-system semantics. |
| `pij-control-plane` | existing | **modify** | Wire production registry adapters and harden daemon concurrent-field merging. |
| `pij-skill` | existing | **modify** | Add orchestration CLI coverage and consume registry prime truth in route triage. |
| `extension-authoring-harness` | existing capability | **modify** | Strengthen `pij-skill-check` so CLI-family coverage is scoped and mechanically enforced. |

### Testing Strategy

- **Approach**: Full TDD.
- **Rationale**: the feature changes persisted state, CLI contracts, concurrent daemon writes, and a live-deployed skill route.
- **Focus Areas**:
  - parser/dispatch set, unset, optional target, `--json`, and strict invalid forms;
  - exact self resolution and `E-AMBIG`/`E-NOID` no-mutation paths;
  - latest-disk prime value winning over stale daemon snapshots in both directions;
  - list `--prime` and `--prime --here` composition, ordinary-list visibility, JSON boolean;
  - legacy descriptor compatibility and durable reattachment;
  - real CLI behavior over a scratch `PIJ_HOME`;
  - skill-gate RED-to-GREEN proof and route pointer integrity.
- **Excluded**: automatic prime election and authorization policy.
- **Mock Usage**: targeted fakes at existing ports (`FakeRegistry`, fake process); real filesystem registry and CLI subprocesses for persistence/integration; no mock of the daemon merge decision.

### Documentation Strategy

- Update `docs/how/pij.md` for CLI syntax/output and correct the obsolete "no daemon" statement.
- Update `docs/how/pij-prime.md` for registry-first seat discovery and designation workflow.
- Update affected domain docs and the domain map/registry.
- Update live skill text only after product behavior is proven; run `just pij-skill-check` and obtain the o-prime ship-time look.
- No README change.

### Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=1, T=2 (total 9)
- **Confidence**: 0.91
- **Assumptions**:
  - designation applies to live registry descriptors;
  - `false` and legacy absence both mean not prime;
  - any peer/operator may designate any live session.
- **Dependencies**:
  - existing `FsRegistry` durable snapshot contract;
  - existing `pij orchestration` family;
  - daemon-restart and git-index batons during implementation/commit;
  - live skill gate and o-prime look before ship.
- **Risks**:
  - mutable external-field merge regression;
  - self-target ambiguity hidden by the baton actor fallback;
  - skill/CLI drift on a live-deployed surface;
  - ordinary `pij list` output compatibility.
- **Phases**: 2, because the ruled sensor repair must land before product code.

### Acceptance Criteria

1. **AC-01 Self set**: from an exactly resolved pij session, `pij orchestration prime set` exits 0, persists `prime:true`, and reports the target id in human and JSON output.
2. **AC-02 Other set**: `pij orchestration prime set <id>` idempotently designates that live descriptor without requiring the caller to be the target.
3. **AC-03 Unset**: `prime unset [<id>]` idempotently persists `prime:false`; a repeated unset remains successful and does not delete unrelated descriptor fields.
4. **AC-04 Honest target errors**: an unknown explicit id returns `E-NOID`; omitted id with ambiguous/unresolved self returns `E-AMBIG`; neither path writes a descriptor.
5. **AC-05 Prime list**: `pij list --prime` returns only `prime:true` descriptors across folders; `pij list --prime --here` additionally applies the existing exact-cwd filter.
6. **AC-06 Visibility contract**: normal human list output visibly marks prime rows; list JSON includes additive `prime:boolean` without reshaping existing fields.
7. **AC-07 Migration/durability**: descriptors with no prime field load as not-prime; prime true/false survives reload, resume, identity-snapshot hydration, and external-harness reattachment.
8. **AC-08 Concurrent writer safety**: a latest on-disk `prime:false` wins over stale daemon-computed `prime:true`, and latest `prime:true` wins over stale false/absence; mutation tests prove both directions.
9. **AC-09 Skill route consumption**: bootstrap designates the seated o-prime; handover designates the incoming seat and unsets the outgoing seat when it is still live; `/pij prime` recognizes the current session from `pij list --prime --here --json`, while roster naming and explicit human seating remain valid fallbacks.
10. **AC-10 Coverage sensor**: the skill check fails when the orchestration CLI family is absent from the CLI-coverage table and passes after the `orchestration (baton/prime)` row is present.
11. **AC-11 Documentation**: operator and domain docs describe the designation contract, list composition, durability, honor-system posture, and current daemon architecture.
12. **AC-12 Regression floor**: targeted prime/merge/list/CLI/skill tests, the complete pij suite, `just pij-skill-check`, live scratch-registry verification, and `harness checks` are green.

### Risks & Assumptions

| Risk / Assumption | Consequence | Mitigation |
|-------------------|-------------|------------|
| `writeMerged` copies the append-only `reportedAt` pattern | Unset can be resurrected by a stale daemon snapshot. | Separate mutable latest-authoritative fields from append-only preservation; RED tests first. |
| Targetless command reuses `"operator"` fallback | A pseudo-id is designated or error output is misleading. | Resolve exact self only for omitted target and surface `E-AMBIG`. |
| Prime designation implies authority | Users may assume product ACLs or automatic uniqueness. | Document honor-system semantics and non-goals explicitly. |
| Route text changes before CLI proof | Live agents receive instructions for unavailable behavior. | Make skill route changes after implementation tests; run skill gate and o-prime look. |
| Shared tree contains unrelated work | Accidental staging or cross-stream edits. | Path-scoped fences, pathspec commits, and no broad git staging. |

### Open Questions

- No blocking product questions remain. The implementor may choose the shortest clear human-list marker/column wording while preserving existing columns and self marker behavior.

### Workshop Opportunities

None. Research and the preamble rulings resolved the namespace, filter composition, data model, and concurrent merge approach sufficiently for planning.

### Clarifications

#### Session 2026-07-11

- **Workflow Mode**: Full, selected from CS-4 and the required sensor-before-product dependency.
- **Testing Strategy**: Full TDD, per repository doctrine and the concurrent-write risk.
- **Mock Usage**: targeted existing fakes plus real filesystem/CLI integration.
- **Documentation Strategy**: `docs/how`, domain docs, and live skill text; no README.
- **Jordan - namespace**: "pij orchestration prime set or something, keep it under there"
- **Jordan - folder filtering**: "try to ride what we have"
- **O-prime relay - sensor repair**: "SKILL.md's CLI-verb coverage table predates the orchestration family - add the row(s) and extend pij-skill-check's verb-coverage list to catch the class (the gate should have caught its own gap; fix the check first)."

## Planning Seam
_Refinement opportunities still open - recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none - all resolved

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| `research-dossier.md` | yes | Defines descriptor durability, orchestration/list seams, lost-update hazard, domains, and touch-list. |
| `workshops/*.md` | no | No authoritative workshop decisions beyond the recorded preamble rulings. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Namespace, filtering, gate scope, testing, docs, and command semantics are resolved. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; AGENTS and domain contracts are applied directly. |
| G4 | ADR Compliance | N/A | No accepted ADRs under `docs/adr/`. |
| G5 | Structure | PASS | Unified document, two phases, task success criteria, findings, coverage, and risks are complete. |
| G6 | Testing Alignment | PASS | RED tests precede each implementation seam; real filesystem/CLI and live verification are included. |
| G7 | Domain Completeness | PASS | All five target domains exist and every task path appears in the Domain Manifest. |

### Summary

First repair the skill coverage sensor so it proves the already-shipped orchestration family is represented. Then add a migration-safe prime marker, a pure orchestration primitive, composable list filtering, latest-disk-authoritative daemon merging, production CLI wiring, registry-first skill triage, and documentation. The implementation remains one cohesive product phase after the sensor dependency and uses existing registry/fake/CLI patterns rather than a new store.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `harness/scripts/pij-skill-check.sh` | `extension-authoring-harness` | internal | Scope CLI coverage to table rows and include the orchestration family/subprimitives. |
| `skills/pij/SKILL.md` | `pij-skill` | contract | Public route/CLI coverage and `/pij prime` vs `pij orchestration prime` distinction. |
| `.pi/extensions/pij/core/types.ts` | `pij-messaging` | contract | Add optional migration-safe `SessionDescriptor.prime`. |
| `.pi/extensions/pij/core/orchestration/prime.ts` | `pij-orchestration` | internal | Prime set/unset service over `RegistryPort`. |
| `.pi/extensions/pij/core/orchestration/prime.test.ts` | `pij-orchestration` | internal | TDD for idempotence, errors, and unrelated-field preservation. |
| `.pi/extensions/pij/core/orchestration/cli.ts` | `pij-orchestration` | contract | Add primitive grammar, dispatch, output, and error mapping. |
| `.pi/extensions/pij/core/orchestration/cli.test.ts` | `pij-orchestration` | internal | Strict parser/dispatch coverage for prime verbs. |
| `.pi/extensions/pij/core/daemon/loop.ts` | `pij-control-plane` | internal | Preserve mutable externally-owned prime state from latest disk truth. |
| `.pi/extensions/pij/core/daemon/loop.test.ts` | `pij-control-plane` | internal | Mutation-proof both concurrent prime merge directions. |
| `.pi/extensions/pij/core/discovery.ts` | `pij-messaging` | internal | Reusable `prime:true` descriptor filter beside folder filtering. |
| `.pi/extensions/pij/core/discovery.test.ts` | `pij-messaging` | internal | Prime filter behavior including legacy undefined/false. |
| `.pi/extensions/pij/core/cli.ts` | `pij-messaging` | contract | Parse/render `pij list --prime`; compose with `--here`; JSON boolean. |
| `.pi/extensions/pij/core/cli.test.ts` | `pij-messaging` | internal | List parse, filter, human marker, JSON compatibility, and error cases. |
| `.pi/extensions/pij/cli.ts` | `pij-control-plane` | cross-domain | Wire `PrimeService`, exact self resolution, usage, and production exit/output. |
| `.pi/extensions/pij/cli.integration.test.ts` | `pij-control-plane` | internal | Real CLI scratch-registry set/unset/list composition and no-mutation errors. |
| `.pi/extensions/pij/core/session.test.ts` | `pij-messaging` | internal | Prove reload/resume/snapshot hydration preserves prime true/false. |
| `.pi/extensions/pij/core/binding.test.ts` | `pij-control-plane` | internal | Prove external-harness reattachment preserves prime state. |
| `skills/pij/references/routes/prime.md` | `pij-skill` | contract | Registry-first o-prime-seat detection with government fallbacks. |
| `skills/pij/references/prime/rituals/bootstrap.md` | `pij-skill` | contract | Designate a newly seated o-prime after identity proof. |
| `skills/pij/references/prime/templates/seat-handover.md` | `pij-skill` | contract | Transfer designation to the incoming seat and clear the live outgoing seat. |
| `docs/how/pij.md` | `pij-messaging` | cross-domain | CLI reference, output contract, and daemon wording correction. |
| `docs/how/pij-prime.md` | `pij-skill` | cross-domain | Designation workflow and mechanical seat discovery. |
| `docs/domains/pij-messaging/domain.md` | `pij-messaging` | contract | Record descriptor/list contracts. |
| `docs/domains/pij-orchestration/domain.md` | `pij-orchestration` | contract | Record prime as the second orchestration primitive. |
| `docs/domains/pij-control-plane/domain.md` | `pij-control-plane` | contract | Record mutable external-field merge and production wiring. |
| `docs/domains/pij-skill/domain.md` | `pij-skill` | contract | Record registry-first route consumption and coverage gate. |
| `docs/domains/registry.md` | `pij-skill` | cross-domain | Update existing domain purpose/history rows; no new domain. |
| `docs/domains/domain-map.md` | `pij-orchestration` | cross-domain | Update labels/contracts; dependency topology remains unchanged. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `writeMerged` only carries an externally owned field when the computed value is absent; stale prime true can overwrite latest false. | RED-test both directions; make latest disk prime authoritative without changing daemon-owned fields. |
| 02 | High | Existing concurrent-writer tests are append-style and prefer computed `reportedAt` when both sides contain a value. | Keep append-only and mutable merge semantics explicit and separately tested. |
| 03 | High | `orchestrationActor()` falls back to `"operator"` on ambiguity. | Use exact `resolveSelf` only for omitted prime targets; explicit ids remain operator-usable. |
| 04 | High | Skill CLI coverage scans the whole file against a static list that omits orchestration, so its own claim is unproved. | Fix the sensor first; scope checks to CLI coverage table rows and include `orchestration`, `baton`, and `prime`. |
| 05 | High | The orchestration grammar hard-rejects any primitive except baton. | Add a separate prime service/branch while retaining shared family usage and exit conventions. |
| 06 | High | Durable identity snapshots and reattachment already preserve arbitrary optional descriptor metadata. | Reuse the existing spread/snapshot contract; add focused regression tests, no new store. |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective | Depends On |
|-------|-------|----------------|-----------|------------|
| 1 | Repair orchestration CLI coverage sensor | `extension-authoring-harness` | Make the skill gate fail on missing orchestration coverage before product code changes. | None |
| 2 | Ship prime designation end-to-end | `pij-orchestration` | Add durable designation, list filtering, concurrent-write safety, CLI/skill integration, docs, and live proof. | Phase 1 |

#### Phase 1: Repair orchestration CLI coverage sensor

**Objective**: Encode the missed `orchestration` family as a permanent deterministic skill-gate check.
**Domain**: `extension-authoring-harness`
**Delivers**:
- CLI coverage extraction scoped to the `## CLI-verb coverage` table.
- Required coverage for `orchestration`, `baton`, and `prime`.
- Public SKILL row distinguishing the skill route from the CLI primitive.
- RED-to-GREEN mutation evidence before product code.
**Depends on**: None
**Key risks**: A whole-file grep would let the route registry's `prime` text falsely satisfy CLI coverage.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Strengthen the gate first: scope coverage input to CLI table rows, add `orchestration`/`baton`/`prime`, and run it before editing SKILL.md. | `extension-authoring-harness` | Current SKILL.md produces a deterministic non-zero failure naming missing orchestration coverage; unrelated gate sections still run. | Ruling; Finding 04 |
| 1.2 | Add `orchestration (baton/prime)` to SKILL.md CLI coverage and clarify `/pij prime` vs `pij orchestration prime`. | `pij-skill` | The same gate turns green; route registry remains exactly one active `prime` row; line budgets and sibling-blindness remain green. | Live surface |
| 1.3 | Record the negative/positive command evidence and run focused formatting/diff checks. | `extension-authoring-harness` | Execution log contains RED command/output and restored GREEN output; only the two ruled files changed in Phase 1. | Path-scoped |

#### Phase 2: Ship prime designation end-to-end

**Objective**: Deliver the ruled CLI and list behavior with durable, race-safe registry state and mechanical skill consumption.
**Domain**: `pij-orchestration`
**Delivers**:
- `SessionDescriptor.prime?: boolean`.
- `pij orchestration prime set|unset [<id>] [--json]`.
- `pij list --prime [--here] [--json]` plus ordinary-list visibility.
- Latest-disk-authoritative mutable prime merge.
- Registry-first `/pij prime` o-prime probe.
- Bootstrap and handover write-side instructions for real governments.
- Operator/domain documentation and live E2E evidence.
**Depends on**: Phase 1
**Key risks**: daemon restart is machine-wide; skill edits are immediately live; both require batons/ship-time look.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Add the additive `prime?: boolean` descriptor contract, then write RED daemon merge tests for latest `prime:false` over stale true and latest true over stale false/absence. | `pij-messaging` / `pij-control-plane` | Tests compile, then fail on the merge assertions for the intended reason; existing dissolved/reportedAt tests remain diagnostic. | Type scaffold before behavioral RED; Findings 01-02 |
| 2.2 | Implement explicit mutable external-field merge semantics. | `pij-control-plane` | New tests green; daemon-owned field clears still work; dissolved persisted truth is still returned. | No broad catch |
| 2.3 | Write RED prime service, orchestration grammar/dispatch, list/filter/render, self-resolution, durability, and real-CLI integration tests. | `pij-orchestration` / `pij-messaging` | Tests enumerate set/unset optional id, idempotence, E-NOID, E-AMBIG/no-write, JSON/human output, `--prime --here`, legacy fields, reload/reattach. | Full TDD |
| 2.4 | Add the pure `PrimeService`, orchestration parser/dispatch/error mapping, and production wiring with exact self resolution. | `pij-orchestration` / `pij-control-plane` | Service and grammar tests green; no-id uses exact self; explicit id works from operator context; unrelated descriptor fields survive. | Findings 03, 05-06 |
| 2.5 | Add prime filtering and visibility to list surfaces. | `pij-messaging` | `--prime` composes with `--here`; normal list marks prime rows; JSON adds `prime:boolean`; existing fields/order semantics remain compatible. | Ruling 2 |
| 2.6 | Complete real filesystem/CLI and durable identity coverage. | `pij-control-plane` / `pij-messaging` | Scratch `PIJ_HOME` integration proves set, list all, list here, unset, errors, and exact reattachment; no global registry mutation. | Real adapters |
| 2.7 | Update `/pij prime` to use registry-first seat detection; teach bootstrap and seat handover to write/transfer the marker; then update operator/domain docs. | `pij-skill` / docs domains | Bootstrap sets the proved seat, handover sets incoming and unsets live outgoing, route checks self against `pij list --prime --here --json`, roster/human fallbacks remain, `just pij-skill-check` green, and stale no-daemon wording is removed. | Live edit late |
| 2.8 | Run mutation proofs, targeted/full gates, and live verification under the daemon-restart baton. | all | Prime merge mutations RED/restore/GREEN; focused suite, full pij suite, skill gate, `harness checks`, and production scratch-registry E2E green; descriptor restored/cleaned. | Orchestrator-owned |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 2.3, 2.4, 2.6 | service + real CLI self-set |
| AC-02 | 2.3, 2.4, 2.6 | explicit-target service/integration |
| AC-03 | 2.1-2.4, 2.6 | unset idempotence + stale-write race |
| AC-04 | 2.3, 2.4, 2.6 | E-NOID/E-AMBIG no-write assertions |
| AC-05 | 2.3, 2.5, 2.6 | list filter composition tests |
| AC-06 | 2.3, 2.5 | human and JSON projection tests |
| AC-07 | 2.3, 2.4, 2.6 | legacy/reload/snapshot/reattach tests |
| AC-08 | 2.1, 2.2, 2.8 | merge tests + mutation proof |
| AC-09 | 2.7, 2.8 | bootstrap/handover text checks + live seat-detection smoke |
| AC-10 | 1.1-1.3 | skill gate RED-to-GREEN evidence |
| AC-11 | 2.7 | docs/domain review |
| AC-12 | 1.3, 2.8 | complete gate inventory |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Stale daemon snapshot overwrites mutable prime state | Medium | High | Latest-disk-authoritative merge tests and mutations before service wiring. |
| Merge hardening changes `reportedAt` behavior unintentionally | Medium | High | Keep append-only and mutable field handling separate; retain existing tests. |
| Ambiguous self resolution targets `"operator"` | Medium | High | Prime-specific exact self result; E-AMBIG test and no-write proof. |
| Skill check passes on unrelated `prime` prose | High | High | Scope input to CLI table rows and mutation-prove the missing-row failure. |
| Live route advertises behavior before daemon/CLI reload | Medium | Medium | Apply skill text after implementation proof; daemon restart under baton; ship-time o-prime look. |
| Outgoing handover seat is already dead/dissolved | Medium | Low | Designate incoming first; unset outgoing only while its descriptor is live, with the durable roster remaining authoritative evidence. |
| Broad staging captures sibling work | Medium | High | Explicit file pathspecs only; fence-vs-manifest diff before implementation and commit. |
