# flow-pair — Orchestrator/Worker Wrapper for the-flow
**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-06-17
**Status**: READY
**Spec source**: unified (this file)

ℹ️ Research seed: `scratch/paste/20260617T074841.md` ("Design Dossier: pij
Orchestrator/Worker Flow Wrapper"). Codebase recon (domains, skill/extension
layout, conventions) folded in directly — no separate explore pass.

---

## Business Specification

### Summary
`flow-pair` wraps the existing `the-flow` SDD pipeline into a **two-session
execution system**. An expensive **orchestrator** session owns requirement
clarification, flow routing, bounded delegation, context-pack compilation,
diff/artifact review, validation interpretation, and prompt-learning. A cheap
**worker** session executes one bounded packet at a time in a target repo and
returns a structured report. A central **`pij` ledger** records runs, prompts,
context packs, diffs, validations, reviews, and **cluster-isolated** prompt
learnings across repos. `the-flow` remains the inner route authority;
`flow-pair` is a wrapper-level **delegation seam**, never a replacement.

### Goals
- Let an expensive Pi session supervise while a cheap Pi session actuates,
  with disciplined scope control and review.
- Preserve every `the-flow` invariant (progressive disclosure, single
  flow-state writer, harness-blind stage skills).
- Produce a durable, inspectable cross-repo ledger of delegation experiments.
- Build a prompt laboratory whose learnings compound **without leaking**
  between unrelated work types.
- Prove one high-value loop end-to-end before automating anything:
  `READY plan → delegate one implement phase → observe diff → review → fix →
  accept → record learning`.

### Non-Goals
- Replacing or editing any `the-flow` stage skill.
- Delegating the **plan** stage (clarification/architecture stays expensive).
- A live file-watcher daemon (manual `observe` + worker report in v1).
- Automatic/silent prompt-template promotion (manual approval in v1).
- A/B prompt testing, per-model effectiveness tracking, decay (post-v1).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `flow-pair` | **NEW** | **create** | Owns the orchestrator/worker delegation seam, the central ledger contracts, prompt-cluster taxonomy, context-pack + review + learning protocols. |
| `pij-messaging` | existing | **consume** | Worker-packet delivery + worker-report return over the live peer channel (`pij send`/inbound). No changes to pij-messaging. |
| `agent-tooling-interface` | existing | **consume** | The `flow-pair` skill surface (and any `/flow-pair`-style intents) presents through Pi skill/tool UX. |
| `extension-authoring-harness` | existing | **consume** | `just`/vitest/self-check validate the helper lib; retros + difficulty ledger + velocity log feed the self-improvement loop. |

#### New Domain Sketches

##### flow-pair [NEW]
- **Purpose**: Wrap `the-flow` with a two-session orchestrator/worker
  delegation seam plus a central, cross-repo experiment + prompt-learning
  ledger. The expensive orchestrator delegates bounded packets; the cheap
  worker executes; the ledger remembers; prompt clusters improve over time.
- **Boundary Owns**: run/delegation/trial/review/learning record contracts;
  the event-log (`events.jsonl`) shape; the prompt-cluster taxonomy and
  template lifecycle (`active`/`candidates`/`changelog`); the context-pack
  manifest contract; the worker-packet + worker-report schemas; the review
  rubric + verdict model; the fix-dossier shape; repo-identity derivation;
  the orchestrator decision protocol (ASK_USER/RUN_LOCAL/DELEGATE/REVIEW/
  FIX/ACCEPT).
- **Boundary Excludes**: the SDD route graph (owned by `the-flow`, external);
  the live peer transport (owned by `pij-messaging` — flow-pair consumes it);
  minih run lifecycle (external, like Minih artifacts for `agent-workbench`);
  flow-state files `.the-flow-state.json` / `the-flow.json` / `the-flow.md`
  (owned by `the-flow` guided mode — flow-pair never writes them, and forbids
  the worker from doing so).

### Testing Strategy
- **Approach**: **Hybrid**. TDD-first for the deterministic pi-free helper lib
  (repo-identity derivation, id allocation, ledger record writers, event
  append, context-pack manifest assembly, diff-summary). Lightweight
  validation (structural/snapshot checks) for the markdown skill, references,
  templates, and prompt-cluster files.
- **Rationale**: v1 is mostly markdown (skill + templates) plus a thin,
  file-based, pure helper library. The pure logic earns real unit tests; the
  prose earns structural lint + one dogfood run.
- **Focus Areas**: ledger writers (append-only integrity), repo-identity
  stability, context-pack inclusion/exclusion correctness, worker-packet
  rendering (forbidden-paths present), review-verdict logic, learning-cluster
  isolation.
- **Excluded**: file-watcher automation (deferred), LLM output quality
  (judged in the dogfood run, not unit-tested).
- **Mock Usage**: **Avoid mocks** — constructor-injected fakes (P3) + real
  tmp dirs/files/git fixtures. No mock frameworks.

### Documentation Strategy
- **Location**: **Hybrid** — a README pointer + `docs/how/flow-pair.md`
  operator guide (start/dispatch/observe/review/fix/accept, the ledger layout,
  the prompt-lab workflow).
- **Rationale**: matches pij's house pattern (e.g. `docs/how/pij.md`).

### Complexity
- **Score**: CS-4 (large) — the full vision is epic; the planned v1 is a
  deliberately scoped slice (defer watcher/A-B/auto-promotion).
- **Breakdown**: S=2, I=2, D=2, N=2, F=1, T=0 → 9 (CS-4 band 8–9).
- **Confidence**: 0.70
- **Assumptions**: a READY `the-flow` plan exists in the target repo before
  delegation; the worker session is a live pij peer; runtime ledger is
  gitignored (curated learnings committed).
- **Dependencies**: `the-flow` (external skill), `pij-messaging` (live
  channel), git, vitest/just harness.
- **Risks**: dual flow-state writers; prompt-cluster leakage; worker
  overreach; context bloat; under-logging; validation theatre; ledger secret
  leak (see § Risks).
- **Phases**: 8.

### Acceptance Criteria
- **AC-01**: `flow-pair start "<requirement>" --repo <path>` creates a run
  record under the gitignored runtime root: `runs/<run-id>/run.json` +
  `events.jsonl` with a `run.started` event appended.
- **AC-02**: `flow-pair dispatch --stage implement --phase "<phase>"` for a
  READY plan writes a context pack + manifest, a delegation record, and a
  rendered worker packet; the packet **includes the forbidden flow-state
  paths** verbatim.
- **AC-03**: The worker packet is **delivered to the live partner** via
  `pij send` (and saved to the ledger); a worker report is received/recorded.
- **AC-04**: After worker file changes, `flow-pair observe` writes
  `diffs/diff-NNNN.{patch,stat.txt,changed-files.json}` and appends a
  `files.changed` event associated with the active delegation.
- **AC-05**: Given code changed but `execution.log.md` unchanged, `review`
  returns `FIX_REQUIRED` with an `artifact_contract` finding.
- **AC-06**: `flow-pair fix` emits a fix packet whose allowed scope is
  restricted to the files named in the review findings.
- **AC-07**: A learning recorded from an `implement-code` miss lands **only**
  under the `implement-code` cluster's `candidates/`; no other cluster file
  changes (cluster isolation).
- **AC-08**: The worker (per packet contract) never edits
  `.the-flow-state.json` / `the-flow.json` / `the-flow.md`; the orchestrator
  remains the sole flow-state writer.
- **AC-09**: Repo identity is stable across sessions/paths (git remote →
  `host-owner-repo`; else basename+path-hash), enabling multi-repo from day
  one.
- **AC-10**: The helper lib is pi-free (imports nothing from
  `@earendil-works/*`) and passes `just self-check`.
- **AC-11**: An end-to-end dogfood run inside pij completes the loop and the
  ledger contains prompt, context, diff, review, result, and a cluster-scoped
  learning note.
- **AC-12**: Delegation delivery is **pointer-based**: the packet is saved to
  the ledger and a short pointer is sent over `pij send`; the worker report is
  received inline and recorded. The skill's only call into logic is via the
  `flow-pair` CLI (no pi import in the lib).
- **AC-13**: `observe` asserts the worker's `changed-files` never include
  `.the-flow-state.json` / `the-flow.json` / `the-flow.md` (defense-in-depth
  for AC-08 beyond the packet's forbidden-paths).

### Risks & Assumptions
- Assumes the partner worker session honors packet scope; mitigated by
  forbidden-paths + diff review + stop conditions.
- Assumes runtime ledger may contain repo contents → gitignored by default;
  summary/hash-only mode is a post-v1 option.

### Open Questions
- Exact `/flow-pair` command surface (real Pi command vs conversational
  skill intents) — v1 behaves as if the commands exist; surfacing is a thin
  wrapper decided in Phase 1.
- Whether the helper lib should later graduate into a T2 extension; v1 keeps
  it a skill-local pi-free module.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Ledger schema + event taxonomy | Data Model | The record shapes are load-bearing across every phase | Field set per record; event types; id scheme; append-only guarantees |
| Worker delivery over pij-messaging | Integration Pattern | First real cross-session handoff; report round-trip | Packet framing; report parsing; ack/receipt; timeout/blocked handling |
| Prompt-cluster taxonomy + promotion | State Machine | Isolation + lifecycle correctness drives learning quality | Cluster set; candidate→active flow; isolation rule enforcement |

### Clarifications

#### Session 2026-06-17
- **Workflow Mode**: Full — new domain, multi-phase, multi-subsystem.
- **Testing Strategy**: Hybrid — TDD for the pi-free helper lib; lightweight
  for markdown skill/templates. Focus: ledger integrity, context-pack
  correctness, packet rendering, review logic, cluster isolation.
- **Mock Usage**: Avoid mocks — constructor-injected fakes + real fixtures.
- **Documentation Strategy**: Hybrid (README pointer + `docs/how/flow-pair.md`).
- **Layout** (Q-Round2): skill + versioned prompt-lab + helper lib live at
  **`skills/flow-pair/`** in the pij repo (user's explicit choice — not
  `.pi/skills/`, not the dossier's `tools/skills/SDD/`). Mutable runtime
  ledger lives under a **gitignored** root (`.flow-pair/runs/…`); curated
  prompt learnings + templates are committed. pi-discovery for the skill is
  wired via a `just` link step (symlink into a pi-loaded skills dir), since
  a bare top-level `skills/` dir is not auto-discovered.
- **Worker delivery**: dogfood via **pij-messaging** to the live partner
  (`pij-1eg9m5j`); print/copy is the fallback.
- **Domain**: NEW domain `flow-pair`, registered in registry + domain-map.
- **MVP target**: dogfood **inside pij** on a real plan; multi-repo-ready via
  `repo_id`/`repo_root` from day one.

---

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: Ledger schema + event taxonomy · Worker delivery over pij-messaging · Prompt-cluster taxonomy + promotion (all optional; the phases below are designed without them, but Phase 2/4/7 are the spots a workshop would sharpen).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n (scratch dossier used instead) | informs Goals, data model, phase shape, risks |
| workshops/*.md | n | none yet — three opportunities recorded above |

---

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round 1 + Round 2 complete; no critical [NEEDS CLARIFICATION] remain |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`; P1–P10 honored as house doctrine |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`; pi-free-core (P2) + DI (P3) applied to the helper lib |
| G4 | ADR Compliance | N/A | No `docs/adr/` |
| G5 | Structure | PASS | All required sections present + populated |
| G6 | Testing Alignment | PASS | Hybrid: lib phases place test tasks before impl; markdown phases carry a validation task |
| G7 | Domain Completeness | PASS | `flow-pair` NEW with a Phase-1 setup task; manifest covers referenced files |

### Summary
Build `flow-pair` as a wrapper-level delegation seam around `the-flow`. A
markdown **skill** (orchestrator-facing) drives the
ASK_USER/RUN_LOCAL/DELEGATE/REVIEW/FIX/ACCEPT loop and references stage-bound
templates; a thin **pi-free helper lib** owns the deterministic, testable bits
(repo identity, id allocation, ledger writers, context-pack manifest,
diff-summary), exposed to the skill/agent through a thin **`flow-pair` CLI**
entrypoint (mirroring pij's `pij` CLI — the skill shells out to it, it is not
imported into pi). Worker packets are delivered to a live pij peer; results are
reviewed against the plan/task/log contract; learnings are recorded into
cluster-isolated prompt-lab folders. The first shippable loop is proved by an
end-to-end dogfood run inside pij.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `docs/domains/flow-pair/domain.md` | flow-pair | contract | New domain definition (concepts, contracts, boundaries) |
| `docs/domains/registry.md` | flow-pair | cross-domain | Register the new domain |
| `docs/domains/domain-map.md` | flow-pair | cross-domain | Add node + consume edges (pij-messaging, ATI, harness) |
| `skills/flow-pair/SKILL.md` | flow-pair | contract | Router skill (intents, invariants, procedure) |
| `skills/flow-pair/references/*.md` | flow-pair | internal | architecture, orchestrator/worker protocol, ledger schema, prompt taxonomy, context-packs, review rubrics |
| `skills/flow-pair/references/templates/*.md` | flow-pair | internal | orchestrator-stage, worker-implement, worker-fix, review-synthesis, learning-synthesis |
| `skills/flow-pair/prompt-lab/clusters/*/active.md` | flow-pair | internal | Versioned active prompt templates per cluster |
| `skills/flow-pair/schemas/*.json` | flow-pair | contract | run / delegation / prompt-trial / review / learning JSON shapes |
| `skills/flow-pair/lib/*.ts` | flow-pair | internal | pi-free helpers (identity, ids, ledger writers, manifest, diff-summary) |
| `skills/flow-pair/lib/cli.ts` | flow-pair | contract | Thin `flow-pair` CLI entrypoint (start/dispatch/observe/review/fix/accept/ledger) — the skill's invocation surface, mirrors `pij` CLI |
| `skills/flow-pair/test/*.ts` | flow-pair | internal | vitest specs targeting the lib |
| `justfile` | extension-authoring-harness | cross-domain | `flow-pair` link/test recipes + skill discovery wiring |
| `.gitignore` | flow-pair | cross-domain | Ignore the mutable runtime ledger root |
| `docs/how/flow-pair.md` | flow-pair | internal | Operator guide |

> Runtime ledger files (`.flow-pair/runs/<run-id>/…`) are generated, gitignored
> data — not source — so they are not enumerated here.

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `the-flow` guided mode is the **sole** writer of `.the-flow-state.json`/`the-flow.json`/`the-flow.md`; dual writers corrupt resume/adopt | Worker packets hard-forbid those paths; orchestrator runs guided flow; worker uses direct-jump/file edits only (AC-08) |
| 02 | Critical | Skills in pij are discovered from `.pi/skills/` (e.g. `pre-commit`); a bare top-level `skills/` dir is **not** auto-loaded | Phase 1 wires discovery: a `just flow-pair-link` symlink into a pi-loaded skills dir; source-of-truth stays `skills/flow-pair/` per user choice |
| 03 | High | Progressive disclosure must survive delegation — never dump the whole flow into a packet | Context-pack compiler includes only stage contract + template + relevant excerpts + same-cluster learnings (§ context-packs) |
| 04 | High | pij has a live peer channel (`pij-messaging`) + an active partner — the dossier's "print+copy" default is obsolete here | Phase 4 delivers packets via `pij send`; report returns inline; print/save is fallback |
| 05 | High | pij house rules P1–P10: pi-free store, DI, tagged-union returns, `.js` ESM imports, tests target the store, persist-before-mutate | Helper lib follows P2/P3/P4/P7/P8/P9; tests target lib not wiring |
| 06 | Medium | Cheap-worker failure mode: "code changed, logs/tasks/domain docs not updated" | Worker-implement template makes artifact updates a hard pre-exit checklist; review G-dim 7 catches misses (AC-05) |
| 07 | Medium | Ledger diffs may contain private repo contents | Gitignore runtime root by default; summary/hash-only mode deferred but designed-for |
| 08 | High | A markdown skill cannot call a TS lib directly; invocation surface was unspecified | Expose the lib via a thin `flow-pair` CLI (like `pij`); the skill/agent shells out, the CLI is never imported into pi (preserves P2 boundary) |
| 09 | High | pij messages are short fire-and-forget text — sending a full packet body is unwieldy + lossy | Save the packet to the ledger; `pij send` a short **pointer** (`packet at <path>, go`); the partner reads the file. Worker report returns inline (`[pij from …]`); the orchestrator parses + records it (agent-mediated round-trip in v1) |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Domain + skill skeleton + path/identity resolver | flow-pair | Stand up the domain, the skill shell, discovery wiring, and a tested repo-identity/path resolver | None |
| 2 | Central ledger writer | flow-pair | Run registry, append-only events, record writers + JSON schemas | Phase 1 |
| 3 | Context-pack compiler | flow-pair | Extract only relevant plan/task/log excerpts + manifest + cluster learnings | Phase 2 |
| 4 | Worker-packet generation + pij-messaging delivery | flow-pair | Render packet from active template; deliver to live partner; record trial | Phase 2, 3 |
| 5 | Observe + diff capture | flow-pair | Capture git status/diff/patch; associate with delegation; append event | Phase 2 |
| 6 | Review + fix loop | flow-pair | Apply review rubric → verdict; emit fix dossier + narrow fix packet | Phase 3, 4, 5 |
| 7 | Prompt-learning notes + cluster lifecycle | flow-pair | Cluster-isolated learning notes + candidate edits + manual promotion | Phase 6 |
| 8 | End-to-end MVP wiring + dogfood run | flow-pair | Wire the full loop; run it inside pij; satisfy the acceptance tests | Phase 1–7 |

#### Phase 1: Domain + skill skeleton + path/identity resolver
**Objective**: Establish the `flow-pair` domain and a runnable skill shell with a tested foundation.
**Domain**: flow-pair
**Delivers**:
- `docs/domains/flow-pair/domain.md` (concepts, contracts, boundaries); registry + domain-map updates.
- `skills/flow-pair/SKILL.md` + `references/` stubs (architecture, orchestrator/worker protocol, ledger-schema, prompt-taxonomy, context-packs, review-rubrics) + `templates/` stubs.
- `justfile` recipe `flow-pair-link` (+ `flow-pair-test`) wiring pi-discovery; `.gitignore` entry for the runtime root.
- `skills/flow-pair/lib/identity.ts` + `paths.ts` (pi-free): repo-identity derivation + run-dir/path layout resolver.
**Depends on**: None
**Key risks**: Discovery wiring (Finding 02) — verify the skill actually loads after `flow-pair-link`.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Write failing tests for repo-identity + path resolver | flow-pair | vitest specs cover git-remote→`host-owner-repo`, basename+hash fallback, run-dir layout; fail first | TDD (Finding 05); real tmp git fixtures (AC-09) |
| 1.2 | Implement `lib/identity.ts` + `lib/paths.ts` (pi-free) | flow-pair | Tests pass; no `@earendil-works/*` import | P2/P7; `.js` ESM imports |
| 1.3 | Create `docs/domains/flow-pair/domain.md` + registry + domain-map edits | flow-pair | Domain present in registry; map node + 3 consume edges render | G7 setup task |
| 1.4 | `skills/flow-pair/SKILL.md` router + `references/` + `templates/` stubs | flow-pair | Skill states invariants + invocation modes + procedure; stubs linked | Skill is a router, not a mega-prompt |
| 1.4b | `lib/cli.ts` thin `flow-pair` CLI entrypoint (arg parse → lib calls, `--json`) | flow-pair | `flow-pair --help` lists intents; subcommands dispatch to lib; exit codes | Finding 08; mirrors `pij` CLI shape |
| 1.5 | `justfile` `flow-pair-link`/`flow-pair-test` + `.gitignore` runtime root | extension-authoring-harness | After `just flow-pair-link`, pi loads the skill; runtime root ignored | Finding 02 |
| 1.6 | Validation: `just flow-pair-test` green + manual skill-load check | flow-pair | Lib tests pass; skill discoverable | Lightweight for markdown |

#### Phase 2: Central ledger writer
**Objective**: Durable, append-only, inspectable cross-repo ledger.
**Domain**: flow-pair
**Delivers**: `lib/ledger.ts` (run registry, `events.jsonl` append, record writers for run/delegation/prompt-trial/review/learning) + `schemas/*.json`.
**Depends on**: Phase 1
**Key risks**: append-only integrity under repeated writes.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Failing tests: run create, event append, record writers, id allocation | flow-pair | Specs assert append-only + monotonic ids + atomic writes; fail first | TDD; persist-before-mutate (P9) |
| 2.2 | Implement `lib/ledger.ts` + JSON schemas | flow-pair | `start` creates `runs/<id>/run.json` + `events.jsonl`; `run.started` appended (AC-01) | Tagged-union returns (P4) |
| 2.3 | Record writers: delegation, prompt-trial, review, learning | flow-pair | Each writes a discrete inspectable JSON; ids stable | Constants in store (P5) |
| 2.4 | Validation: ledger spec suite green | flow-pair | All Phase-2 specs pass | — |

#### Phase 3: Context-pack compiler
**Objective**: Include just enough for the worker to succeed; nothing more.
**Domain**: flow-pair
**Delivers**: `lib/context-pack.ts` — reads plan/tasks/logs, extracts named sections, assembles manifest, attaches allowed/forbidden paths + same-cluster learnings.
**Depends on**: Phase 2

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Failing tests: section extraction + manifest + exclusion rule | flow-pair | For an implement phase: pack has plan phase, testing strategy, ACs, tasks, logs; excludes unrelated clusters/phases (AC-02 partial) | Finding 03 |
| 3.2 | Implement `lib/context-pack.ts` + manifest writer | flow-pair | Manifest lists included sources + hashes + excluded reasons | — |
| 3.3 | Validation: context-pack spec suite green | flow-pair | Inclusion/exclusion correctness proven | — |

#### Phase 4: Worker-packet generation + pij-messaging delivery
**Objective**: Render a bounded packet and hand it to the live worker.
**Domain**: flow-pair
**Delivers**: `templates/worker-implement.md` (active), `lib/packet.ts` (render + write), delivery via `pij send` + report capture, prompt-trial record.
**Depends on**: Phase 2, 3

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Failing tests: packet render includes forbidden flow-state paths + final-report schema | flow-pair | Rendered packet contains forbidden paths verbatim + report shape (AC-02) | Finding 01 |
| 4.2 | Implement `lib/packet.ts` + `worker-implement` active template | flow-pair | Packet saved to ledger; prompt-trial recorded | — |
| 4.3 | Delivery: save packet to ledger, `pij send` a **pointer** to partner; record receipt; capture inline report | flow-pair | Pointer delivered; partner reads file; report recorded (AC-03, AC-12) | Findings 04, 09; pointer not full body |
| 4.4 | Validation: packet specs green + one live delivery to partner | flow-pair | Specs pass; partner ack observed | Dogfood seam |

#### Phase 5: Observe + diff capture
**Objective**: Capture what the worker changed, recoverably.
**Domain**: flow-pair
**Delivers**: `lib/observe.ts` — `git status`/`diff --stat`/patch snapshot + `changed-files.json`, associated with the active delegation; `files.changed` event.
**Depends on**: Phase 2

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Failing tests: diff capture writes patch/stat/changed-files + event | flow-pair | After fixture changes, three diff artifacts + `files.changed` appended (AC-04) | Real git fixture |
| 5.2 | Implement `lib/observe.ts` + flow-state guard | flow-pair | Manual `observe` produces artifacts under `runs/<id>/diffs/`; asserts no flow-state files in changed-files (AC-13) | Manual-observe v1 (no daemon); defense-in-depth for AC-08 |
| 5.3 | Validation: observe specs green | flow-pair | All pass | — |

#### Phase 6: Review + fix loop
**Objective**: Where expensive reasoning earns its keep.
**Domain**: flow-pair
**Delivers**: `references/review-rubrics.md` + `templates/review-synthesis.md`; `lib/review.ts` (verdict helper over the artifact-contract checks); fix-dossier + narrow fix-packet generation.
**Depends on**: Phase 3, 4, 5

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | Failing tests: missing `execution.log.md` ⇒ FIX_REQUIRED + artifact_contract finding | flow-pair | Verdict logic returns FIX_REQUIRED with the finding (AC-05) | Finding 06 |
| 6.2 | Implement `lib/review.ts` + rubric + review-synthesis template | flow-pair | Review record (verdict + findings) written to ledger | 10-dim rubric (scope/contract/plan/AC/tests/domain/progress/regression/prompt-follow/learning) |
| 6.3 | Fix dossier + fix packet generation | flow-pair | Fix packet's allowed scope = files in findings only (AC-06) | References original delegation + review ids |
| 6.4 | Validation: review/fix specs green | flow-pair | All pass | — |

#### Phase 7: Prompt-learning notes + cluster lifecycle
**Objective**: Compounding learning without cross-cluster leakage.
**Domain**: flow-pair
**Delivers**: `prompt-lab/clusters/{implement-code,fix-code,review-code,docs-writing,codebase-research,validation-runner,...}/{active.md,candidates/,changelog.md}`; `templates/learning-synthesis.md`; `lib/learning.ts` (write candidate into the correct cluster only).
**Depends on**: Phase 6

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 7.1 | Failing tests: learning isolation | flow-pair | An `implement-code` miss writes only to that cluster's `candidates/`; no other cluster file changes (AC-07) | Isolation rule |
| 7.2 | Implement `lib/learning.ts` + cluster scaffolding + learning-synthesis template | flow-pair | Candidate note created; manual promotion path documented (no silent auto-promote) | Manual promotion v1 |
| 7.3 | Validation: learning specs green | flow-pair | All pass | — |

#### Phase 8: End-to-end MVP wiring + dogfood run
**Objective**: Prove the loop on real work inside pij.
**Domain**: flow-pair
**Delivers**: SKILL.md procedure wired across all libs; `docs/how/flow-pair.md`; one real dogfood run (orchestrator=this session, worker=partner) on an existing pij plan; acceptance-test pass.
**Depends on**: Phase 1–7

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 8.1 | Wire SKILL.md: start→dispatch→observe→review→fix→accept across libs | flow-pair | Each intent invokes the right lib + template | Router only |
| 8.2 | `docs/how/flow-pair.md` + README pointer | flow-pair | Operator guide covers all intents + ledger layout + prompt-lab workflow | Hybrid docs |
| 8.3 | Dogfood run inside pij with live partner worker | flow-pair | Loop completes; ledger holds prompt+context+diff+review+result+learning (AC-11) | AC-03/04/05/07 exercised live |
| 8.4 | `just self-check` green | flow-pair | typecheck→lint→test→smoke→pkg audit→snapshots pass; lib pi-free (AC-10) | Gate before "done" |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 2.2 | Phase 2 specs (run create + run.started) |
| AC-02 | 3.1, 4.1, 4.2 | Phase 3/4 specs (pack + packet incl. forbidden paths) |
| AC-03 | 4.3, 8.3 | Phase 4 live delivery + Phase 8 dogfood |
| AC-04 | 5.1, 5.2 | Phase 5 specs |
| AC-05 | 6.1, 6.2 | Phase 6 specs |
| AC-06 | 6.3 | Phase 6 specs (fix packet scope) |
| AC-07 | 7.1, 7.2 | Phase 7 specs (cluster isolation) |
| AC-08 | 1.4, 4.1, 4.2 | Packet template + render tests (forbidden paths) |
| AC-09 | 1.1, 1.2 | Phase 1 identity specs |
| AC-10 | 1.2, 8.4 | pi-free assertion + self-check |
| AC-11 | 8.3 | Dogfood run ledger inspection |
| AC-12 | 1.4b, 4.3 | CLI surface + pointer delivery |
| AC-13 | 5.2 | observe flow-state guard |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dual flow-state writers | Low | High | Worker forbidden from flow-state files; orchestrator sole writer (AC-08) |
| Prompt-cluster leakage | Medium | High | Mandatory cluster tag; learning writer scoped to one cluster (AC-07) |
| Worker overreach | Medium | Medium | Allowed/forbidden paths; diff review; stop conditions |
| Lost human clarification | Low | High | Orchestrator asks flow questions; worker stops on ambiguity |
| Context bloat | Medium | Medium | Context-pack compiler + manifest; exclusion rules |
| Under-logging | Medium | Medium | Hard pre-exit checklist in worker template; review dim 7 |
| Validation theatre | Medium | Medium | Require command/evidence table; orchestrator reruns when important |
| Ledger secret leak | Medium | High | Gitignore runtime root; summary/hash-only mode designed-for (post-v1) |
| Skill not auto-loaded | Medium | Medium | `flow-pair-link` discovery recipe + manual load check (Finding 02) |

---

## Validation Record (2026-06-17)

### Validation Thesis

**Raison d'être**: Turn `the-flow` into a two-session execution system — an
expensive orchestrator supervises while a cheap worker actuates — with a
central, inspectable, cross-repo ledger and a cluster-isolated prompt lab,
without violating any `the-flow` invariant.

**Value claim**: Expensive supervision + cheap actuation becomes repeatable,
reviewable, and self-improving; delegation evidence and prompt learnings
compound across repos.

**Artifact promise**: The `5 tasks` stage can expand each phase from task
tables with concrete done-when criteria; the build preserves the single
flow-state-writer invariant and progressive disclosure.

**Intended beneficiaries**: the orchestrator session (this), the worker
session (partner), future flow-pair runs across repos, and pij's
self-improvement loop.

**Proof target**: Implementation (a plan that downstream task-expansion and
implementation can build from with minimal clarification).

**Evidence standard**: phase task tables with measurable success criteria; an
Acceptance Coverage Map binding every AC to a task; explicit domain mapping.

**Thesis source**: `scratch/paste/20260617T074841.md` + Round 1/2 clarifications.

**Thesis verdict**: Advanced.

**Main thesis risk**: Cross-session report round-trip is agent-mediated in v1
(no automated parse), so report fidelity depends on the worker honoring the
final-report schema.

### Method

Inline thesis-aware validation by the session model (the same model
`validate-v2` would launch), chosen over parallel explore subagents because
(1) context was at 100% and (2) this environment's explore agents allowlist
raw tool names (`read`/`grep`) that don't match the session's lean-ctx tools
— fanning out risked tool-blind validators. Lenses applied: Thesis Alignment,
Forward-Compatibility, Evidence Sufficiency, Proof-Level Fit, Hidden
Assumptions, Domain Boundaries, Integration & Ripple.

| Lens | Issues | Verdict |
|------|--------|---------|
| Thesis Alignment | 0 | ✅ advanced at Implementation proof level |
| Forward-Compatibility | 2 HIGH fixed (invocation surface, pointer delivery) | ✅ after fixes |
| Evidence Sufficiency | 1 MEDIUM fixed (AC-08 observe guard → AC-13) | ✅ |
| Proof-Level Fit | 0 | ✅ |
| Domain Boundaries | 0 | ✅ flow-pair NEW, edges consume-only |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| `5 tasks` (Phase 1 expansion) | phase task tables w/ done-when | shape mismatch | ✅ | each phase block has a 5-col task table + success criteria |
| `pij-messaging` consumer | deliverable payload fits the channel | contract drift | ✅ (after fix) | Finding 09 + AC-12 — pointer delivery, not full body |
| markdown skill → logic | callable surface | encapsulation lockout | ✅ (after fix) | Finding 08 + 1.4b — `flow-pair` CLI entrypoint |

**Thesis alignment**: Value claim advanced at Implementation proof level; main
risk is agent-mediated report fidelity (mitigated by the hard report schema).

**Outcome alignment**: The plan, as scoped, advances "expensive supervises,
cheap actuates, ledger remembers, prompts compound" — the MVP loop is
buildable from these phases without an API change.

**Standalone?**: No — downstream `5 tasks`/`6 implement` consume this plan.

Overall: ⚠️ VALIDATED WITH FIXES (2 HIGH + 1 MEDIUM found and fixed inline).
