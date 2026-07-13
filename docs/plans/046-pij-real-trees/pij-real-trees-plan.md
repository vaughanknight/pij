# Real pij session trees
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-13
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

📚 Incorporates findings from `research-dossier.md`. Automatic spawn already captures creator ownership, but adoption does not create a parent link; exact-folder discovery fragments linked worktrees; and current prime/lifecycle fields are insufficient to render takeover history without inference.

### Summary

Make pij relationships durable and queryable as a forest of session seats. A spawned child is linked automatically, a human-created/adopted pane can be linked during adoption or afterward, and `pij tree` renders global, repository, or arbitrary-node views. Tree queries preserve the distinctions among structural parentage, teardown ownership, activity, liveness, lifecycle, current-prime designation, and old-prime history.

### Goals

- Persist a structural parent independently from close/teardown ownership.
- Link automatically spawned sessions at descriptor creation.
- Link adopted sessions with `pij adopt ... --parent <id>` or afterward with `pij link`.
- Group repository trees across linked git worktrees.
- Add deterministic human and JSON tree output for a repository, the global registry, or any node subtree.
- Filter by activity, liveness, and lifecycle, including idle, dead, failed, and closed/dissolved nodes.
- Preserve multiple current primes and represent a retired seat as `old-prime`.
- Reject newly introduced cycles while rendering legacy/missing-parent data safely.

### Non-Goals

- No automatic prime election, uniqueness enforcement, or takeover arbitration.
- No ACL or authorization system beyond existing honor-system orchestration and close ownership.
- No new tree database, government-file dependency, tmux topology inference, or transcript-derived relationship inference.
- No removal or semantic change of `spawnedBy`, `folder`, `prime`, `list --here`, or `list --prime`.
- No cross-machine repository identity or guaranteed repository matching after the repository is physically relocated.
- No automatic deletion of dead or dissolved descriptors.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-messaging` | existing | **modify** | Own additive descriptor vocabulary, pure tree/link projection, filters, and legacy compatibility. |
| `pij-control-plane` | existing | **modify** | Capture repository/parent metadata at spawn, adoption, reattachment, and Pi registration; wire CLI and git adapter. |
| `pij-orchestration` | existing | **modify** | Add mutually exclusive current-prime/old-prime transitions while preserving multiple-prime behavior. |
| `pij-skill` | existing | **modify** | Teach link/tree/adoption/takeover only after product proof and update CLI coverage checks. |
| `extension-authoring-harness` | existing capability | **modify** | Extend deterministic skill/CLI coverage and live tree smoke evidence. |

### Testing Strategy

- **Approach**: Hybrid.
- **Rationale**: graph construction, cycle refusal, filtering, migration, and prime transitions require test-first pure logic; thin CLI/help/docs wiring can use focused integration validation.
- **Focus Areas**:
  - structural parent versus `spawnedBy` ownership;
  - graph roots, deterministic order, arbitrary subtree, missing parent, and cycle-safe rendering;
  - repository grouping across main/worktree paths;
  - activity/liveness/lifecycle filter composition and dissolved presentation;
  - adopt/link/reparent/unlink strict grammar and no-write failures;
  - current-prime/old-prime mutual exclusion and concurrent daemon writes;
  - legacy descriptors with none of the new fields;
  - real filesystem CLI behavior under scratch `PIJ_HOME`.
- **Excluded**: automatic election, cross-machine repository identity, large-registry performance benchmarking beyond deterministic fixture coverage.
- **Mock Usage**: Targeted fakes only at external boundaries: registry, process/pid, tmux, clock, and git command execution. Core graph and transition logic use plain fixtures; filesystem integration uses temporary real directories.

### Documentation Strategy

- **Location**: `docs/how/` plus existing domain docs and live `/pij` skill references.
- **Rationale**: tree/link/adoption/takeover are operator workflows needing durable command examples; README expansion is unnecessary.

### Complexity

- **Score**: CS-5 (epic)
- **Breakdown**: S=2, I=2, D=2, N=2, F=1, T=2
- **Confidence**: 0.86
- **Assumptions**:
  - `git rev-parse --path-format=absolute --git-common-dir` is available in supported development environments.
  - A descriptor's persisted git common directory is sufficient for same-machine repository grouping across linked worktrees.
  - Existing durable identity snapshots preserve new optional fields through spread-based hydration once merge ownership is explicit.
- **Dependencies**:
  - Existing `SessionDescriptor`, `FsRegistry`, `resolveSelf`, `PrimeService`, and CLI integration patterns.
  - Existing `harness boot`, `harness checks`, `just pij-skill-check`, and tmux Driver smoke.
  - o-prime sequencing for hot top-level CLI/help/skill seams currently shared with s041 and model surfaces owned by s045.
  - daemon-restart and git-index batons for implementation/live proof.
- **Risks**:
  - confusing structural parentage with close ownership;
  - stale daemon snapshots overwriting mutable parent or old-prime state;
  - graph cycles or legacy orphans hanging/lying in output;
  - default global output becoming unusable due to retained dead/dissolved history;
  - repository-key drift after physical relocation;
  - live-deployed skill text advertising behavior before merged code and daemon restart.
- **Phases**: One user-selected Simple implementation phase with task groups ordered by proof dependency.

### Acceptance Criteria

1. **AC-01 Spawn linkage**: every spawned Pi, Claude, Copilot, Codex, and agent-pack descriptor records `parentId=<caller>` when the caller resolves; control-plane spawns also retain `spawnedBy=<caller>`.
2. **AC-02 Ownership separation**: changing `parentId` never changes `spawnedBy`; `pij close` continues to authorize only from `spawnedBy` unless forced.
3. **AC-03 Adopt linkage**: `pij adopt <pane> --harness <h> --parent <id>` validates the parent and persists the link while retaining all existing identity/reattachment behavior.
4. **AC-04 Post-hoc linkage**: `pij link <child> --parent <parent>` reparents an existing node; `pij link <child> --root` persists `parentId:null` as an explicit root without changing ownership; unknown ids, self-parenting, and effective-graph cycles fail without mutation.
5. **AC-05 Repository identity**: descriptors created in the main checkout and any linked worktree persist the same canonical `gitCommonDir`; legacy descriptors are classified with a live folder probe when possible.
6. **AC-06 Repository tree**: from any worktree, bare `pij tree` renders the forest for that git repository, including sessions from other linked worktrees, without treating unrelated repositories as local.
7. **AC-07 Global and subtree views**: `pij tree --global` renders the active global forest; `pij tree <id>` renders that node and descendants regardless of whether the node is prime.
8. **AC-08 Historical inclusion**: `--all` includes dead and dissolved descriptors; dissolved nodes display as `closed` in human output while JSON retains `lifecycle:"dissolved"`.
9. **AC-09 Filter axes**: repeatable `--activity`, `--liveness`, and `--lifecycle` filters compose as OR within an axis and AND across axes; invalid values fail before reading/mutating state.
10. **AC-10 Graph honesty**: missing-parent nodes render as roots with an orphan annotation; pre-existing cycles produce a finite explicit cycle marker/error field and never recurse indefinitely.
11. **AC-11 Prime states**: `prime set` marks a current prime and clears old-prime; `prime retire` clears current prime and marks old-prime; `prime unset` clears both; multiple current primes remain valid.
12. **AC-12 Prime visibility**: ordinary list/tree human output distinguishes current prime (`P`) and old-prime (`O`); JSON includes additive `prime:boolean` and `oldPrime:boolean`; `list --prime` remains current-prime-only.
13. **AC-13 Durability**: parent, repository, current-prime, and old-prime metadata survive reload/resume, durable snapshot hydration, exact-session reattachment, daemon ticks, failure, and dissolve.
14. **AC-14 Compatibility**: descriptors lacking all new fields load and render; `parentId:undefined` permits a read-only `spawnedBy` fallback for spawned legacy nodes, while `parentId:null` suppresses that fallback as an explicit root.
15. **AC-15 Regression proof**: targeted graph/link/repository/prime/merge/CLI tests, full pij tests, typecheck, lint, skill gate, scratch-registry CLI proof, tmux smoke, and `harness checks` pass.

### Risks & Assumptions

| Risk / Assumption | Consequence | Mitigation |
|-------------------|-------------|------------|
| `parentId` reuses ownership semantics accidentally | An adopted hierarchy grants unintended close authority. | Separate fields and services; regression-test close before and after reparenting. |
| Mutable graph/prime fields use fill-only daemon merging | A stale daemon tick resurrects an old parent or prime state. | Make latest on-disk `parentId` (`null` is explicit root), `prime`, and `oldPrime` authoritative; clears use durable sentinels, never key deletion. |
| Filtered parent is hidden while a child remains | Human indentation can imply a false root. | Project/filter the selected node set first, then mark a child whose parent was excluded as `filtered-parent`. |
| `gitCommonDir` cannot be resolved | Repository view silently drops a session. | Persist when available; query-time probe legacy folders; expose `repository:null`/unresolved nodes only in global views. |
| A repository is moved | Persisted absolute key no longer matches its new location. | Recompute on reattachment/registration; document same-machine/current-location scope. |
| Simple mode compresses CS-5 work | One oversized implementation checkpoint reduces review clarity. | Keep task groups independently testable and require a cold review over the full phase before ship. |

### Open Questions

- None blocking. The selected contracts below are authoritative for implementation.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Tree presentation ergonomics | CLI Flow | Large global forests may need later display refinements after real dogfood. | Compact labels, depth limits, and summary counts can be refined without changing the JSON contract. |
| Repository relocation identity | Storage Design | Absolute git-common-dir deliberately scopes v1 to current same-machine paths. | A future stable repository fingerprint may be warranted if relocation becomes common. |

### Clarifications

#### Session 2026-07-13

| Question | Answer |
|----------|--------|
| Workflow Mode | Simple (user-selected; accepted despite CS-5). |
| Testing Strategy | Hybrid. |
| Mock Usage | Targeted external-system mocks only. |
| Documentation Strategy | `docs/how/` only for operator docs; update existing domain/skill contracts. |

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: Tree presentation ergonomics; Repository relocation identity

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | Supplies current behavior, historical constraints, domains, risks, and likely seams. |
| workshops/*.md | n | No authoritative workshop decisions. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Required profile and product semantics resolved; no clarification markers remain. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; domain boundaries below follow existing contracts. |
| G4 | ADR Compliance | N/A | No accepted ADR files are present. |
| G5 | Structure | PASS | Unified document, required sections, task success criteria, references, and coverage map present. |
| G6 | Testing Alignment | PASS | Hybrid strategy uses test-first pure/state tasks and focused integration/live validation. |
| G7 | Domain Completeness | PASS | All target domains and every referenced file surface are represented in the manifest. |

### Summary

Extend the existing registry descriptor instead of adding a second store. A pure tree/link core computes one effective parent function (`parentId` id → explicit parent, `null` → explicit root, `undefined` → legacy `spawnedBy` fallback), uses that same graph for cycle refusal and rendering, projects repository/global/subtree forests, and composes lifecycle filters. Thin adapters capture and refresh git repository identity at registration and reattachment. Current prime remains the compatible `prime` boolean, while additive `oldPrime` records retired seats and transition methods enforce mutual exclusion.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/types.ts` | `pij-messaging` | contract | Add `parentId?: SessionId \| null`, optional `gitCommonDir`, and optional `oldPrime` descriptor fields plus tree/filter result vocabulary. |
| `.pi/extensions/pij/core/tree.ts` | `pij-messaging` | internal | One pure effective-parent function shared by cycle refusal and cycle-safe forest/subtree projection, filtering, and link/reparent validation. |
| `.pi/extensions/pij/core/tree.test.ts` | `pij-messaging` | internal | Test-first graph, filter, orphan, cycle, repository, and compatibility coverage. |
| `.pi/extensions/pij/core/discovery.ts` | `pij-messaging` | internal | Repository-aware descriptor selection while preserving exact-folder `--here`. |
| `.pi/extensions/pij/core/discovery.test.ts` | `pij-messaging` | internal | Repository filter and legacy fallback tests. |
| `.pi/extensions/pij/core/cli.ts` | `pij-messaging` | contract | Parse/render `tree`, `link`, filters, and additive list projections. |
| `.pi/extensions/pij/core/cli.test.ts` | `pij-messaging` | internal | Strict grammar, JSON/human rendering, and no-state filter errors. |
| `.pi/extensions/pij/core/session-join.ts` | `pij-messaging` | contract | Include structural/repository/old-prime fields in stable session projection where appropriate. |
| `.pi/extensions/pij/core/session-join.test.ts` | `pij-messaging` | internal | Projection compatibility tests. |
| `.pi/extensions/pij/core/ports.ts` | `pij-messaging` | contract | Add the minimal injected repository-identity port used by registration/CLI wiring. |
| `.pi/extensions/pij/adapters/git-repository.ts` | `pij-control-plane` | internal | Argv-only git-common-dir resolver with canonical absolute output and null outside git. |
| `.pi/extensions/pij/adapters/git-repository.test.ts` | `pij-control-plane` | internal | Real temporary main/worktree repository identity proof and failure cases. |
| `.pi/extensions/pij/core/spawn.ts` | `pij-control-plane` | cross-domain | Persist parent/repository metadata in pending control-plane descriptors. |
| `.pi/extensions/pij/core/spawn.test.ts` | `pij-control-plane` | internal | Spawn descriptor and environment regression coverage. |
| `.pi/extensions/pij/core/session.ts` | `pij-messaging` | contract | Pi self-registration persists structural parent/repository metadata and preserves it on reload. |
| `.pi/extensions/pij/core/session.test.ts` | `pij-messaging` | internal | Pi spawn/reload/new/dissolve durability tests. |
| `.pi/extensions/pij/core/binding.ts` | `pij-control-plane` | contract | Preserve graph/old-prime metadata and accept the freshly resolved `gitCommonDir` during exact-session reattachment. |
| `.pi/extensions/pij/core/binding.test.ts` | `pij-control-plane` | internal | Reattachment migration/durability tests, including repository-key refresh. |
| `.pi/extensions/pij/core/daemon/loop.ts` | `pij-control-plane` | internal | Latest-disk-authoritative merge for explicitly mutable parent/prime-history fields. |
| `.pi/extensions/pij/core/daemon/loop.test.ts` | `pij-control-plane` | internal | Both-direction stale snapshot mutation proofs. |
| `.pi/extensions/pij/core/orchestration/prime.ts` | `pij-orchestration` | internal | Add `retire` and mutually exclusive set/unset transitions. |
| `.pi/extensions/pij/core/orchestration/prime.test.ts` | `pij-orchestration` | internal | Prime/old-prime transition and preservation tests. |
| `.pi/extensions/pij/core/orchestration/cli.ts` | `pij-orchestration` | contract | Add `prime retire` grammar/output without changing baton semantics. |
| `.pi/extensions/pij/core/orchestration/cli.test.ts` | `pij-orchestration` | internal | Strict transition CLI coverage. |
| `.pi/extensions/pij/cli.ts` | `pij-control-plane` | cross-domain | Top-level help/intercepts, git adapter wiring, adopt `--parent`, link/tree execution, and scratch-safe errors. |
| `.pi/extensions/pij/cli.integration.test.ts` | `pij-control-plane` | internal | Real scratch registry + git worktree + adopt/link/tree/prime E2E. |
| `.pi/extensions/pij/index.ts` | `pij-messaging` | cross-domain | Supply repository identity and structural parent on Pi boot. |
| `.pi/extensions/pij/index.test.ts` | `pij-messaging` | internal | Extension wiring regression tests. |
| `harness/scripts/pij-skill-check.sh` | `extension-authoring-harness` | internal | Mechanically require tree/link/retire coverage in the skill CLI table and route text. |
| `harness/scripts/smoke.ts` | `extension-authoring-harness` | internal | Add a tmux scenario proving spawned and adopted tree visibility after daemon restart. |
| `docs/how/pij.md` | `pij-messaging` | cross-domain | Command grammar, JSON shape, repository/global/subtree views, filters, and ownership distinction. |
| `docs/how/pij-prime.md` | `pij-skill` | cross-domain | Multiple-prime and old-prime handover workflow. |
| `docs/domains/pij-messaging/domain.md` | `pij-messaging` | contract | Record graph/repository/filter concepts. |
| `docs/domains/pij-control-plane/domain.md` | `pij-control-plane` | contract | Record repository adapter, adopt/link wiring, and merge ownership. |
| `docs/domains/pij-orchestration/domain.md` | `pij-orchestration` | contract | Record current/old prime transitions. |
| `docs/domains/pij-skill/domain.md` | `pij-skill` | contract | Record tree/link/takeover teaching contract. |
| `docs/domains/registry.md` | `pij-messaging` | cross-domain | Update existing domain summaries; no new domain. |
| `docs/domains/domain-map.md` | `pij-messaging` | cross-domain | Update exposed contracts and existing edges; no new node. |
| `skills/pij/SKILL.md` | `pij-skill` | contract | Add tree/link CLI verb coverage homes without creating a duplicate route. |
| `skills/pij/references/routes/peer.md` | `pij-skill` | contract | Teach adopt/link/tree peer operations and ownership-safe semantics. |
| `skills/pij/references/routes/prime.md` | `pij-skill` | contract | Teach old-prime handover and tree-based role inspection. |
| `skills/pij/references/prime/rituals/kickoff.md` | `pij-skill` | contract | Link a canaried adopted stream before briefing. |
| `skills/pij/references/prime/templates/seat-handover.md` | `pij-skill` | contract | Retire outgoing prime after incoming prime designation and final relay. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `spawnedBy` is both captured parent-like metadata and close authorization. | Introduce tri-state structural `parentId`: id = explicit parent, `null` = explicit root, absent = legacy `spawnedBy` fallback; preserve `spawnedBy` solely for ownership. |
| 02 | Critical | Adopted human panes have no persisted relationship to the adopting prime. | Add adopt `--parent` plus an idempotent post-hoc `link` primitive with validation. |
| 03 | Critical | Exact `folder` equality cannot group linked git worktrees. | Persist canonical absolute `gitCommonDir` and resolve legacy/current folders through an injected git adapter. |
| 04 | High | Existing state has separate activity, liveness, and lifecycle axes. | Keep explicit filter axes and preserve raw fields in JSON; render `dissolved` as human `closed` only. |
| 05 | High | Prime is deliberately non-unique and boolean-compatible. | Add `oldPrime?: boolean`; enforce mutual exclusion through `set|retire|unset`, retain `list --prime` semantics. |
| 06 | High | Descriptor metadata is written concurrently by session, daemon, CLI, and registry identity paths. | Add parent/old-prime to explicit mutable merge ownership and regression-test clear/set races. |
| 07 | High | Global registry history is large and retained. | Bare repository tree and global tree exclude dead/dissolved by default; `--all` and explicit filters expose history. |
| 08 | High | CLI/help/skill surfaces overlap s041 and the skill is live-deployed. | Land pure/product contracts first; compose hot seams under o-prime sequencing and gate skill changes late. |

### Implementation

**Objective**: Deliver migration-safe session forests, repository-aware queries, adoption/reparenting, lifecycle filters, and old-prime takeover without changing close ownership.
**Testing Approach**: Hybrid — TDD for pure graph/state and mutable merge logic; focused real-fs/CLI/tmux validation for wiring.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Write RED descriptor/tree fixtures for explicit parent, explicit-root `null`, absent-field legacy fallback, deterministic children, arbitrary subtree, orphan, filtered parent, mixed-edge cycles, and cycle-safe output. | `pij-messaging` | `core/types.ts`, `core/tree.test.ts` | Tests compile and fail only because tri-state tree vocabulary/projection is absent. | Findings 01, 04, 07 |
| [ ] | T002 | Implement additive descriptor fields and one pure `effectiveParent` used by both link-cycle validation and forest rendering; add tri-state `--root`, selector/filter composition, and stable JSON nodes. | `pij-messaging` | `core/types.ts`, `core/tree.ts` | T001 green; self/unknown/effective-cycle mutations return tagged errors without writes; `null` roots suppress fallback; projection is finite for corrupt legacy cycles. | AC-02, AC-04, AC-07-10, AC-14 |
| [ ] | T003 | Write RED repository identity/filter tests using a temporary git repository with a linked worktree and legacy descriptors. | `pij-messaging` / `pij-control-plane` | `adapters/git-repository.test.ts`, `core/discovery.test.ts` | Main and worktree resolve one key; unrelated/non-git paths and missing legacy folders are explicit. | Finding 03 |
| [ ] | T004 | Implement the injected argv-only git repository adapter and repository-aware descriptor selection while leaving exact `filterByFolder` behavior unchanged. | `pij-control-plane` / `pij-messaging` | `core/ports.ts`, `adapters/git-repository.ts`, `core/discovery.ts` | T003 green; adapter has no shell use; bare `--here` tests remain byte-compatible. | AC-05-06 |
| [ ] | T005 | Write RED spawn, Pi registration, adoption, reattachment, dissolve, and daemon-merge tests for tri-state `parentId`, refreshed `gitCommonDir`, and boolean old-prime clears. | `pij-control-plane` / `pij-messaging` | `core/spawn.test.ts`, `core/session.test.ts`, `core/binding.test.ts`, `core/daemon/loop.test.ts` | Tests prove every writer/path, `null` surviving stale daemon snapshots, repository refresh on reattach, and both set/clear directions before implementation. | Findings 02, 06 |
| [ ] | T006 | Persist structural/repository metadata through control-plane spawn, Pi self-registration, adoption, binding, durable snapshots, daemon writes, failure, and dissolve; recompute `gitCommonDir` at registration/reattachment and keep `spawnedBy` untouched by reparenting. | `pij-control-plane` / `pij-messaging` | `core/spawn.ts`, `core/session.ts`, `core/binding.ts`, `core/daemon/loop.ts`, `adapters/fs-registry.ts`, `index.ts` | T005 green; `parentId:null` and `oldPrime:false` remain latest-disk-authoritative; close ownership regression stays green; legacy descriptors load without migration writes. | AC-01-03, AC-13-14 |
| [ ] | T007 | Write RED prime service/parser/projection tests for `set`, `retire`, `unset`, mutual exclusion, multiple current primes, stale writes, and human/JSON markers. | `pij-orchestration` / `pij-messaging` | `core/orchestration/prime.test.ts`, `core/orchestration/cli.test.ts`, `core/cli.test.ts`, `core/daemon/loop.test.ts` | Tests fail on absent old-prime transition/projection only. | Finding 05 |
| [ ] | T008 | Implement `oldPrime?: boolean`, `prime retire`, mutually exclusive transitions, latest-disk merge, `P`/`O` human markers, and additive JSON while retaining current `list --prime`. | `pij-orchestration` / `pij-messaging` / `pij-control-plane` | `core/types.ts`, `core/orchestration/prime.ts`, `core/orchestration/cli.ts`, `core/daemon/loop.ts`, `core/cli.ts` | T007 green; `set` clears old, `retire` clears current, `unset` clears both, and unrelated descriptor fields survive. | AC-11-13 |
| [ ] | T009 | Write RED strict CLI tests for `tree`, filters, `--all`, positional subtree, `link`, adopt `--parent`, invalid combinations, stable human/JSON output, and bounded serialization of pathological deep/cyclic forests. | `pij-messaging` / `pij-control-plane` | `core/cli.test.ts`, `cli.integration.test.ts` | Grammar and integration fixtures enumerate all accepted/refused forms, prove no-write failures, and show an 8,000-level corrupt graph cannot stack-overflow JSON/human rendering. | AC-03-10 |
| [ ] | T010 | Wire production `pij tree`, `pij link`, adopt `--parent`, repository resolution, projections, help, exit codes, bounded/truncated cycle-safe serialization, and session join additions. | `pij-control-plane` / `pij-messaging` | `core/cli.ts`, `session-join.ts`, `session-join.test.ts`, `cli.ts`, `cli.integration.test.ts` | T009 green; scratch `PIJ_HOME` demonstrates repo/global/subtree, link/root/reparent, filters, current/old prime, orphan/dissolved output, and finite serialization for pathological corrupt depth. | Findings 02-04, 07 |
| [ ] | T011 | Add deterministic skill coverage before updating live skill/docs/domain contracts under o-prime-granted hot-seam sequencing. | `extension-authoring-harness` / `pij-skill` / docs | `harness/scripts/pij-skill-check.sh`, `skills/pij/**`, `docs/how/pij.md`, `docs/how/pij-prime.md`, `docs/domains/**` | Mutation proves the gate fails when tree/link/retire coverage is removed; docs distinguish parent/owner/repository/state axes; `just pij-skill-check` green. | Finding 08; s041/s045 fences |
| [ ] | T012 | Add and run real smoke plus full gates under the daemon-restart baton, binding live proof to reviewed worktree code rather than bare global `pij`. | `extension-authoring-harness` / all | `harness/scripts/smoke.ts`, test evidence/report artifacts | Spawned child appears under caller; separately adopted pane links under a prime; repo tree crosses worktrees; retire/takeover displays correctly; targeted/full gates and `harness checks` green. | AC-15; no `npm link` from worktree |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T005-T006, T012 | spawn/session tests + live child tree |
| AC-02 | T001-T002, T005-T006 | graph/close ownership regression |
| AC-03 | T005-T006, T009-T010, T012 | adopt parser/integration + live adopted pane |
| AC-04 | T001-T002, T009-T010 | pure mutation + real CLI no-write cases |
| AC-05 | T003-T006 | real git worktree adapter + descriptor persistence |
| AC-06 | T003-T004, T009-T010, T012 | repository selector tests + live cross-worktree tree |
| AC-07 | T001-T002, T009-T010 | forest/subtree projections + CLI |
| AC-08 | T001-T002, T009-T010 | default versus all/history fixtures |
| AC-09 | T001-T002, T009-T010 | filter algebra/parser/output tests |
| AC-10 | T001-T002, T009-T010 | orphan/cycle fixtures and bounded output |
| AC-11 | T007-T008 | prime transition service/CLI tests |
| AC-12 | T007-T010 | list/tree human+JSON projections |
| AC-13 | T005-T008 | binding/session/daemon/registry durability |
| AC-14 | T001-T006, T010 | legacy fixtures and no-migration projections |
| AC-15 | T011-T012 | mutation sensor, full suite, smoke, and harness checks |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Parent/owner conflation | Medium | Critical | Separate fields/services and mutation-test close authorization after reparenting. |
| Concurrent descriptor state loss | Medium | Critical | Latest-disk mutable merge tests for set and clear directions before wiring. |
| Cycle or orphan hangs/misrepresentation | Medium | High | Pure bounded traversal, visited sets, explicit annotations, and cycle-refusing writes. |
| Global tree noise | High | High | Exclude dead/dissolved by default; explicit `--all` and filter axes; deterministic summaries. |
| Repository path drift | Low | Medium | Refresh key on registration/reattachment; document scope; retain global visibility. |
| CLI/skill contract drift | Medium | High | Sensor-first mutation proof; update live skill last after product behavior is proven. |
| Hot-seam collision with s041/s045 | Medium | High | Exact manifest and o-prime sequencing before implementation grants. |
| One-phase CS-5 review load | Medium | Medium | Task groups remain independently gated; cold whole-phase review and full harness gate required. |
