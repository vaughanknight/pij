# Memorable pij session ids
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-11
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

Incorporates `research-dossier.md` and the authoritative decisions in `rulings.md`.
Research established that the current id is a storage, environment, wire, telemetry,
and durable-ownership key. Jordan explicitly chose to replace that primary value for
new sessions rather than add a separate alias. Existing opaque ids remain unchanged.

### Summary

New pij sessions receive memorable primary ids such as `pij-arbitrary-locust` instead
of opaque hash-like ids. The id remains the single source of identity everywhere:
registry filenames, data directories, `PIJ_SESSION_ID`, message framing, telemetry,
spawn output, and CLI addressing. Allocation uses the exact-pinned
`unique-names-generator@4.7.1` adjective and animal dictionaries and atomically retries
another two-word pair when a candidate is already owned. Pre-bind control-plane paths
reserve before launch; a crash-orphan reservation is never reclaimed merely because the
short-lived spawner died.

### Goals

- Mint `pij-<adjective>-<animal>` as the actual primary id for every new Pi,
  control-plane, adopted, and agent-pack session.
- Preserve exact native-session reuse across reload, resume, daemon restart, and
  re-adoption.
- Keep existing opaque ids valid and unchanged; only genuinely new identities use the
  memorable format.
- Guarantee collision-safe allocation with deterministic, non-repeating candidates and
  no-replace ownership.
- Re-add the package exact-pinned after s039's landed lockfile rewrite and an explicit
  s040 package-manifest fence grant; retain a zero-new-advisory delta.
- Preserve s038's concurrent `SessionDescriptor.prime?: boolean` addition and sequence
  shared-file work through the o-prime.

### Non-Goals

- No separate alias, display name, or hidden opaque machine id.
- No in-place rename or filesystem migration for existing sessions.
- No numeric/hash suffixes and no three-word ids.
- No user-selected names, rename command, localization, or configurable dictionaries.
- No arbitrary identity minting through `pij adopt --id`; the option is
  reattachment-only and unknown ids return `E-NOID`.
- No change to harness-native session discovery or `(harness, harnessSessionId)` meaning.
- No README changes; user documentation stays in `docs/how/pij.md`.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-messaging` | existing | **modify** | Own the primary id candidate sequence, Pi-session allocation, descriptor/file-path identity, message framing compatibility, and legacy-id behavior. |
| `pij-control-plane` | existing | **modify** | Reserve ids before control-plane launch, allocate exact-native identities on adopt, and preserve restart binding. |
| `extension-authoring-harness` | existing | **modify** | Re-add the exact dependency pin under the post-s039 fence, keep PoC-only surfaces absent, and prove corpus/audit/full-gate behavior. |

### Testing Strategy

- **Approach**: Full TDD.
- **Rationale**: Identity allocation crosses concurrency, persistence, process launch,
  migration, and every harness; failures can misaddress or block sessions.
- **Focus Areas**:
  - deterministic candidate order and full-space uniqueness;
  - atomic native-identity claims and pre-bind reservations;
  - forced collisions and concurrent allocation;
  - Pi reload/resume/new/fork semantics;
  - spawn/adopt/agent-spawn preallocation;
  - existing opaque-id reuse;
  - `prime?: boolean` preservation after s038;
  - multi-hyphen CLI/Telegram compatibility;
  - reservation release on known launch failure and crash-orphan non-reclamation;
  - `adopt --id` existing-id reattachment and unknown-id rejection.
- **Excluded**: statistical randomness quality beyond deterministic distribution over the
  fixed corpus; localization and corpus customization.
- **Mock Usage**: Targeted mocks/fakes only at process, tmux, clock, and liveness
  boundaries. Use real temporary filesystem registries for ownership behavior.

### Documentation Strategy

- **User-facing location**: `docs/how/pij.md` only.
- **Internal contract records**: update the existing `pij-messaging` and
  `pij-control-plane` domain histories/contracts; these are not additional user guides.

### Complexity

- **Score**: CS-5 (epic)
- **Breakdown**: S=2, I=2, D=2, N=1, F=2, T=2
- **Confidence**: 0.90
- **Mode decision**: Jordan selected Simple. The work remains one cohesive identity
  change with one review boundary, so the plan uses one implementation phase despite
  the high risk score.
- **Assumptions**:
  - the exact-pinned dictionary order is a compatibility contract;
  - all words remain lowercase ASCII letters;
  - s038 lands or releases its shared descriptor/discovery window before s040 edits;
  - a reservation sidecar can be private to `FsRegistry` without extending
    `SessionDescriptor`;
  - safety outranks automatic cleanup: a crash-orphaned reservation is retained until
    explicit recovery because a launched child may already hold the id.
- **Dependencies**: `unique-names-generator@4.7.1`; s038 shared-seam release;
  s039's landed package rewrite plus an explicit s040 package-manifest fence grant;
  daemon-restart and git-index batons during implementation.
- **Risks**: collision races, stale reservations, mixed old/new ids, pre-bind launch
  failure, stale concurrent descriptor writes, and an ungoverned package re-add.
- **Phases**: one implementation phase.

### Acceptance Criteria

1. **AC-01 New id shape**: every newly minted identity is exactly
   `pij-<lowercase-word>-<lowercase-word>`.
2. **AC-02 Candidate determinism**: the same seed and attempt produce the same id;
   attempts for one seed do not repeat before the 426,710-name space is exhausted.
3. **AC-03 Corpus contract**: the pinned corpus contains 1,202 unique lowercase
   adjectives and 355 unique lowercase animals, yielding 426,710 pairs.
4. **AC-04 Atomic retry**: when attempt 0 is owned by another identity, allocation
   atomically claims attempt 1 without overwriting the owner or adding a suffix.
5. **AC-05 Concurrent claims**: two allocators racing for the same candidate produce
   two distinct valid ids or converge on the same exact native identity; no partial
   ownership files remain.
6. **AC-06 Pi lifecycle**: reload/resume retain the stored id; new/fork mint a fresh
   memorable id; SDK/test fallback also uses a memorable id.
7. **AC-07 Control-plane preallocation**: normal spawn and agent spawn reserve the id
   before launching the pane, then use the same value in pane/window name,
   `PIJ_SESSION_ID`, descriptor path, data directory, output, and parent relation.
8. **AC-08 Adopt behavior**: an exact native identity reuses its durable id; a first
   adopt allocates a memorable id; no-native adoption reserves before descriptor
   publication.
9. **AC-09 Existing-id migration**: existing `pij-<opaque>` descriptors and durable
   tuple records remain unchanged and fully addressable after upgrade.
10. **AC-10 Reservation safety**: a known pre-launch/launch failure releases only its
    owned reservation; successful descriptor publication consumes it; a spawner crash
    never triggers automatic dead-owner reclamation because a launched child may already
    hold the id. Crash-orphaned reservations remain unavailable until explicit recovery.
11. **AC-11 Contract continuity**: message frames, `pij list`, `pij sessions`,
    `send`, `tail`, `state`, `path`, Telegram prefixes, and orchestration fields use
    the memorable primary id without a second name field.
12. **AC-12 s038 compatibility**: `SessionDescriptor.prime?: boolean` survives registry
    writes, restart snapshots, and reattachment; s040 does not remove or overwrite it.
13. **AC-13 PoC graduation**: the production module is created from the proved
    single-candidate design; the already-removed `pij-name-poc` recipe/script remain absent.
14. **AC-14 Dependency safety**: the package is re-added exact-pinned at 4.7.1, has no
    transitive runtime dependencies or install hook, and introduces no new npm audit
    finding relative to the post-s039 baseline of 26 findings and zero critical.
15. **AC-15 Proof**: mutation checks for collision/retry and legacy reuse go
    RED-restore-GREEN; targeted suites, the complete pij suite, live multi-session
    verification, and `harness checks` pass.
16. **AC-16 Adopt override**: `pij adopt --id <existing>` reattaches only that existing
    descriptor/reservation; unknown ids return `E-NOID`; exact native tuple conflicts
    return `E-AMBIG`; omitting `--id` allocates a memorable id for first adoption.

### Risks & Assumptions

| Risk / assumption | Impact | Response |
|-------------------|--------|----------|
| A two-word candidate collides | Session creation could fail or misaddress | Deterministic alternate sequence plus atomic no-replace claim |
| Crash leaves a pre-bind reservation | Candidate remains unavailable, but a launched child may own it | Never auto-reclaim from spawner death; explicit recovery/cleanup only |
| Existing opaque id is recomputed | Restart could rename paths and joins | Durable/live exact identity wins; memorable allocation runs only on zero-match creation |
| s038 edits shared descriptor/discovery files | Merge collision or loss of `prime` | Wait for o-prime sequencing, re-read landed files, preserve `prime` in regressions |
| Dictionary order changes | Seeded names silently change | Exact dependency pin plus corpus/count and known-vector tests |
| New id contains unsafe characters | Filesystem/shell/wire breakage | Corpus-wide lowercase-ASCII validation test |
| Pre-bind collision happens after pane launch | Wrong id may escape into a child | Reserve before pane creation; release on launch failure |

### Open Questions

None. The clarification round resolved primary-id semantics, two-word collision policy,
package choice, workflow/testing/docs policy, existing-id migration, and
`adopt --id` behavior.

### Workshop Opportunities

None required before implementation. The PoC proved package/seed viability; the plan
turns the remaining concurrency and migration questions into TDD acceptance cases.

### Clarifications

#### Session 2026-07-11

| Question | Decision |
|----------|----------|
| Workflow mode | Simple |
| Testing strategy | Full TDD |
| Mock usage | Targeted mocks/fakes at external boundaries |
| Documentation | `docs/how/pij.md` only for user-facing behavior |
| Alias/display name vs primary id | Replace the actual primary pij session id |
| Word space | Always two words; atomically retry another pair on collision |
| Corpus | Exact-pin `unique-names-generator@4.7.1` |
| Existing opaque ids | Keep unchanged; only new sessions use memorable ids |
| Validation and implementation fleet | Fresh `/validate-v2` peer; Copilot GPT-5.6 Sol coder plus a separate Copilot GPT-5.6 Sol reviewer |

#### Session 2026-07-11 - validation repair

| Question | Decision |
|----------|----------|
| `pij adopt --id` behavior | Reattach an existing descriptor/reservation only; unknown ids fail `E-NOID`; omitted id allocates |
| Package/PoC posture | s039 landed its lockfile rewrite; re-add the exact dependency only after an explicit s040 package-manifest fence grant, and keep the already-removed PoC script/recipe absent |

## Planning Seam
_Refinement opportunities still open - recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none - all resolved

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| `research-dossier.md` | yes | Established structural identity and collision constraints; its alias recommendation was superseded by Jordan's primary-id ruling. |
| `rulings.md` | yes | Authoritative primary-id, word-space, package, and migration decisions. |
| `../039-dependency-chores-audit/reports/phase-1-checkpoint.md` | yes | Confirms s039's package rewrite landed, the s040 PoC artifact stayed absent, and the git-index lease was released. |
| `workshops/*.md` | no | No authoritative workshop decisions. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Nine front-loaded decisions plus two validation-repair decisions recorded; no clarification markers remain. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; domain and AGENTS rules are incorporated. |
| G4 | ADR Compliance | N/A | No accepted ADRs under `docs/adr/`. |
| G5 | Structure | PASS | Both halves, inline task table, measurable ACs, risks, domains, and coverage map are present. |
| G6 | Testing Alignment | PASS | RED tests precede implementation tasks; targeted, mutation, live, and full-gate proof are explicit. |
| G7 | Domain Completeness | PASS | All three target domains exist; every edited task path appears in the manifest, including the s038 descriptor and post-s039 package seams. |

### Summary

Replace new-session FNV-style ids with deterministic two-word primary ids while
preserving every existing opaque identity. A pure candidate sequence consumes the
exact-pinned adjective/animal dictionaries; `FsRegistry` adds native-identity allocation
and pre-bind reservation ownership so collisions retry without overwriting. Pi boot,
spawn, agent spawn, and adopt use the same allocation contract, with s038's descriptor
field preserved and PoC-only harness surfaces kept absent.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `package.json` | `extension-authoring-harness` | contract | Re-add the exact dependency pin only inside the granted s040 package window. |
| `package-lock.json` | `extension-authoring-harness` | contract | Re-lock the package tarball/integrity after s039 with no transitive runtime dependencies. |
| `.pi/extensions/pij/core/memorable-id.ts` | `pij-messaging` | internal | Create the production deterministic candidate sequence from the removed PoC design. |
| `.pi/extensions/pij/core/memorable-id.test.ts` | `pij-messaging` | internal | Create corpus, known-vector, uniqueness, exhaustion, and shape TDD. |
| `.pi/extensions/pij/core/types.ts` | `pij-messaging` | contract | **Shared s038 descriptor seam; read/verify only, no planned s040 schema edit.** |
| `.pi/extensions/pij/core/discovery.ts` | `pij-messaging` | internal | Preserve legacy derivation lookup and route new identity seeds. |
| `.pi/extensions/pij/core/discovery.test.ts` | `pij-messaging` | internal | Legacy opaque reuse and new memorable lifecycle tests. |
| `.pi/extensions/pij/core/binding.ts` | `pij-control-plane` | internal | Keep exact tuple reuse/corruption errors while new zero-match allocation retries. |
| `.pi/extensions/pij/core/binding.test.ts` | `pij-control-plane` | internal | Existing-id, exact tuple, and collision-state regressions. |
| `.pi/extensions/pij/adapters/fs-registry.ts` | `pij-messaging` | internal | Atomic generated-id claims and private pre-bind reservation sidecars. |
| `.pi/extensions/pij/adapters/fs-registry.test.ts` | `pij-messaging` | internal | Real-filesystem race, retry, stale reservation, rollback, and snapshot tests. |
| `.pi/extensions/pij/core/spawn.ts` | `pij-control-plane` | contract | Replace pure single-id allocation contract with externally claimed id input and make `adopt --id` reattachment-only. |
| `.pi/extensions/pij/core/spawn.test.ts` | `pij-control-plane` | internal | Spawn command/env and pending descriptor memorable-id tests. |
| `.pi/extensions/pij/index.ts` | `pij-messaging` | internal | Pi exact-native reuse, zero-match allocation, and legacy opaque migration wiring. |
| `.pi/extensions/pij/index.test.ts` | `pij-messaging` | internal | Pi reload/resume/new/fork and existing-id integration regressions. |
| `.pi/extensions/pij/cli.ts` | `pij-control-plane` | internal | Reserve/claim for spawn, agent spawn, and adopt before publication/launch. |
| `.pi/extensions/pij/cli.integration.test.ts` | `pij-control-plane` | internal | Temp-registry and fake-tmux allocation/failure cleanup coverage. |
| `.pi/extensions/pij/telegram/match.test.ts` | `pij-control-plane` | internal | Multi-hyphen memorable-id addressing regressions. |
| `docs/how/pij.md` | `pij-messaging` | cross-domain | Document new-id shape, old-id compatibility, and collision behavior. |
| `docs/domains/pij-messaging/domain.md` | `pij-messaging` | contract | Record memorable primary-id and reservation-independent messaging contracts. |
| `docs/domains/pij-control-plane/domain.md` | `pij-control-plane` | contract | Record pre-bind reservation and exact-native reuse behavior. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Jordan chose the memorable value as the actual primary id, overriding the dossier's additive-alias recommendation. | Change only new identity minting; preserve all single-id storage/wire/telemetry contracts. |
| 02 | Critical | A single seeded result cannot satisfy two-word retry without repeats. | Generate a deterministic full-space sequence: stable seed start plus attempt-based linear probe over the adjective-animal Cartesian product. |
| 03 | Critical | Availability and claim must be one operation; check-then-write can race. | Reuse `FsRegistry` no-replace publication for native claims and private reservation sidecars. |
| 04 | Critical | Claude/Codex pre-bind spawn needs an id before native identity and before pane launch. | Reserve a generated id by owner token/PID, launch with it, publish the descriptor, then release; failure releases only the owned reservation. |
| 05 | High | Collision-retried names cannot be reconstructed from native identity alone. | Durable/live exact identity always wins; allocate only on zero-match creation; old opaque ids never migrate. |
| 06 | High | s038 concurrently adds `SessionDescriptor.prime?: boolean` and touches discovery/binding/CLI tests. | Sequence after its release, avoid a `types.ts` edit, and prove prime preservation in registry/reattach regressions. |
| 07 | High | The selected package corpus is 1,202 x 355, lowercase-only, duplicate-free, and dependency-free at runtime, but last published in 2022 and was removed during the s039 handoff. | Re-add the exact version only under the s040 package fence; treat dictionary order as a compatibility contract and test corpus shape and known vectors. |
| 08 | High | The PoC source, tests, script, and recipe were removed during the s039 handoff and must not be assumed present during implementation. | Create the production module/tests from the proved design, keep preview-only surfaces absent, and verify no `pij-name-poc` surface returns. |
| 09 | High | Jordan assigned implementation to a Copilot GPT-5.6 Sol coder and a separate same-model reviewer. | Keep the stream seat orchestration-only; delegate code and cold review through pij with independent artifacts and verified gates. |
| 10 | High | Spawner PID death is not proof an id is unused: the launched child can outlive the CLI before descriptor publication. | Reservation death alone never permits reclaim; only known launch failure, successful promotion, or explicit operator recovery changes ownership. |
| 11 | High | Existing `pij adopt --id` can mint arbitrary primary ids, contradicting the memorable-id contract. | Restrict `--id` to existing descriptor/reservation reattachment; unknown ids fail `E-NOID`. |

### Implementation

**Objective**: Mint collision-safe two-word primary ids for all new pij sessions while
preserving every existing identity and contract.
**Testing Approach**: Full TDD with real temporary filesystem claims and targeted
process/tmux fakes.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Coordinate both shared seams with the o-prime: wait for s038's descriptor/discovery write window to close, confirm s039's package rewrite is landed and clean, request the explicit s040 package-manifest/git-index fence, re-read landed files, and record the exact s040 code fence. | `pij-messaging` / `pij-control-plane` / `extension-authoring-harness` | `.pi/extensions/pij/core/types.ts`, `.pi/extensions/pij/core/discovery.ts`, `.pi/extensions/pij/core/binding.ts`, `package.json`, `package-lock.json`, plan report | The granted fence names every edited path, excludes `types.ts` unless a compile bridge is unavoidable, confirms `prime?: boolean` is present, and grants the post-s039 package window before T005. | Cross-portfolio sequencing; no product edit |
| [ ] | T002 | Write RED pure candidate-sequence tests for corpus shape, deterministic known vectors, safe characters, no duplicate attempts, final-attempt behavior, and exhaustion. | `pij-messaging` | `.pi/extensions/pij/core/memorable-id.test.ts` | Tests fail because the removed PoC has not yet been recreated as a production candidate-sequence module. | Full TDD; Findings 02, 07 |
| [ ] | T003 | Write RED real-filesystem allocation tests for native identity retry, concurrent same/different tuple claims, pre-bind reservation, known-failure release, crash-orphan non-reclamation, rollback, and existing opaque-id reuse. | `pij-messaging` / `pij-control-plane` | `.pi/extensions/pij/adapters/fs-registry.test.ts`, `.pi/extensions/pij/core/binding.test.ts` | Tests fail on first-candidate collision/reservation behavior for the intended assertions; spawner death alone cannot reclaim; current corruption E-AMBIG cases remain diagnostic. | Full TDD; Findings 03-05, 10 |
| [ ] | T004 | Write RED wiring regressions for Pi boot, normal spawn, agent spawn, adopt, launch-failure cleanup, crash after pane launch/before descriptor publication, `adopt --id` reattachment/unknown/conflict behavior, old-id migration, `prime` preservation, and multi-hyphen Telegram/CLI surfaces. | `pij-messaging` / `pij-control-plane` | `.pi/extensions/pij/core/discovery.test.ts`, `.pi/extensions/pij/core/spawn.test.ts`, `.pi/extensions/pij/index.test.ts`, `.pi/extensions/pij/cli.integration.test.ts`, `.pi/extensions/pij/telegram/match.test.ts` | Tests prove all four identity entry paths and fail before production wiring; a live child never loses its reservation; unknown `--id` is E-NOID; existing opaque and prime-bearing descriptors are explicit fixtures. | Full TDD; AC-06-12, AC-16 |
| [ ] | T005 | Under the granted package window, re-add `unique-names-generator@4.7.1` and create the production deterministic full-space two-word candidate sequence over its pinned dictionaries. | `pij-messaging` / `extension-authoring-harness` | `package.json`, `package-lock.json`, `.pi/extensions/pij/core/memorable-id.ts`, `.pi/extensions/pij/core/discovery.ts` | T002 is green; the manifest and lock exact-pin 4.7.1; candidate attempt N never repeats before exhaustion; legacy FNV derivation remains available only for old-descriptor lookup. | Findings 02, 05, 07; post-s039 package fence |
| [ ] | T006 | Add atomic memorable-id allocation to `FsRegistry`: native tuple claim/retry plus private pre-bind reservation ownership, known-failure release, successful promotion, and explicit crash-orphan retention. | `pij-messaging` / `pij-control-plane` | `.pi/extensions/pij/adapters/fs-registry.ts`, `.pi/extensions/pij/core/binding.ts` | T003 is green; no check-then-write; exact tuple reuse and corruption errors remain fail-loud; spawner death alone never reclaims; no partial files after known failure. | Findings 03-05, 10 |
| [ ] | T007 | Wire the allocator into Pi session start, normal spawn, agent spawn, and adopt; reserve before pane launch, make `--id` reattachment-only, and preserve existing opaque ids and s038 prime metadata. | `pij-messaging` / `pij-control-plane` | `.pi/extensions/pij/index.ts`, `.pi/extensions/pij/core/spawn.ts`, `.pi/extensions/pij/cli.ts` | T004 is green; returned/env/path/frame/telemetry ids agree; known failed launch releases its reservation; crash-orphan remains owned; unknown `--id` is E-NOID; no second identity field exists. | Findings 01, 04-06, 10-11 |
| [ ] | T008 | Graduate the proved design and update contracts: verify preview-only surfaces remain absent, capture exact package/audit evidence, and update user/domain docs. | `extension-authoring-harness` / `pij-messaging` / `pij-control-plane` | `package.json`, `package-lock.json`, `docs/how/pij.md`, `docs/domains/pij-messaging/domain.md`, `docs/domains/pij-control-plane/domain.md` | No `pij-name-poc` script/recipe or other preview-only surface exists; docs state new-vs-existing behavior; package remains exact; npm audit adds zero findings to the post-s039 26/0-critical baseline. | AC-13-14 |
| [ ] | T009 | Prove the feature: mutation-check collision retry and legacy reuse, run focused/full gates, restart the daemon under baton, and live-create multiple peers including a forced collision fixture. | all | tests, live `~/.pij` scratch registry, harness outputs, phase execution log | Mutations go RED/restore/GREEN; focused suites, full pij suite, `harness checks`, and live id/path/send/state verification pass; scratch peers/reservations are cleaned. | AC-15; orchestrator-owned verification |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|------------|-------------|
| AC-01 | T002, T005, T007 | Candidate shape and live spawn fixtures |
| AC-02 | T002, T005 | Pure sequence tests |
| AC-03 | T002, T005, T008 | Corpus contract and exact dependency lock |
| AC-04 | T003, T006 | Forced first-candidate collision |
| AC-05 | T003, T006, T009 | Concurrent real-filesystem claim and mutation proof |
| AC-06 | T004, T007 | Pi lifecycle integration |
| AC-07 | T004, T007, T009 | Spawn/agent-spawn env, descriptor, and live pane proof |
| AC-08 | T003, T004, T006, T007 | Adopt/native tuple fixtures |
| AC-09 | T003-T007 | Legacy opaque descriptor/durable-record fixtures |
| AC-10 | T003, T004, T006, T007 | Failure and stale-owner reservation tests |
| AC-11 | T004, T007 | CLI, telemetry, message, Telegram regressions |
| AC-12 | T001, T003, T004, T007 | Prime-bearing descriptor preservation |
| AC-13 | T008 | PoC surface absence |
| AC-14 | T002, T005, T008 | Lock/corpus/audit checks |
| AC-15 | T009 | Mutation, targeted, full, live, and harness evidence |
| AC-16 | T004, T007, T008 | Adopt parser/integration tests and operator documentation |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Reservation state remains after crash | Medium | Medium | Deliberate safety tombstone; no automatic reclaim from spawner death; explicit recovery only |
| Mixed-version processes allocate with old rules | Low | High | Sequence implementation after s038, restart daemon under baton, live proof before commit |
| Full-space candidate math drifts with package update | Low | High | Exact pin, known vectors, corpus count/uniqueness tests |
| Existing identity is accidentally renamed | Low | Critical | Durable/live lookup precedes allocation; explicit opaque-id fixtures and mutation proof |
| `adopt --id` bypasses generated names | Medium | High | Reattachment-only semantics; unknown id E-NOID; parser/integration/doc coverage |
| s038 `prime` field is lost by stale spread/write | Medium | High | Rebase after s038 and carry prime-bearing fixtures through boot/binding/registry tests |
| Package re-add races another package owner | Low | High | Require the explicit post-s039 s040 package-manifest fence and git-index baton before T005 |
| Simple mode hides implementation breadth | Medium | Medium | Nine explicit TDD tasks, complete manifest, one review boundary, CS-5 called out honestly |
| Broad staging captures sibling work | Medium | High | O-prime fence, pathspec-only staging, git-index baton |
