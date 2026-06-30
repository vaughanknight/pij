# Cold-Start Documentation Pass — AGENTS_README + README Thesis

**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-07-01
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from `research-dossier.md` (F-01…F-13).

> **Scope guard for the implementing coder:** this is a **documentation-only** pass.
> No source code, no `justfile`, no extension, no `.harness/` change. Docs *narrate and
> signpost* existing behaviour — the `justfile` stays the single source of truth for
> commands; if a doc and the `justfile` disagree, the `justfile` wins and the doc is wrong.

---

## Business Specification

### Research Context

The build/bootstrap/pi-update behaviour is already fully encoded in the `justfile`
(`just install`, `just self-check`, `just update-pi`, `just pi-doctor`). `docs/how/`
already has 11 articles. The gap is a **cold-start front door**: there is no
`AGENTS_README.md`, and the current `README.md` *lists* the cross-agent features but
**frames** only the "harness for building pi extensions" thesis. The skills-location
fact (shared store `~/.agents/skills/` via `npx skills`, manifest
`~/.agents/.skill-lock.json`; Claude reads `~/.claude/skills/` which symlinks into it)
is verified on disk and must be reproduced exactly.

### Summary

Produce a cold-start documentation layer so a fresh agent, on a different machine, can
clone the repo, build it, update pi, and understand how we work — **without prior
context**. Deliver a new root `AGENTS_README.md` (an index/front-door that signposts
into `docs/how/`), 4 new `docs/how/` depth articles (`build.md`, `update-pi.md`,
`workflow.md`, `skills.md`), and a reframed `README.md` that elevates the dual thesis
(pi-extensions project **AND** cross-agent worker system).

### Goals

- A fresh agent on a new machine can go clone → working build → "I understand this repo"
  using only `AGENTS_README.md` and the articles it links.
- `AGENTS_README.md` is an **index, not a content dump**: each section is a 1–3 sentence
  blurb + a link to the relevant `docs/how/` depth article (or `AGENTS.md`/`RUNBOOK.md`).
- The skills-location fact is stated correctly and prominently (it is easy to get wrong).
- `README.md` reads as "this repo is BOTH a pi-extensions project AND a cross-agent
  worker system — and more", not just a harness README.
- Every new article narrates *existing* `justfile`/CLI behaviour; nothing invents new
  commands or contradicts the `justfile`.

### Non-Goals

- ❌ Writing the docs in this pass — **planning only**. A separate coder implements from
  the phase tasks; a separate reviewer reviews.
- ❌ Any code, `justfile`, extension, `.harness/`, or config change.
- ❌ Rewriting the 11 existing `docs/how/` articles — they are signposted, not edited
  (a one-line accuracy touch-up is allowed only if a link target moved).
- ❌ A separate `docs/how/cold-start.md` — the cold-start quickstart lives **inside**
  `AGENTS_README.md` (the front door); a standalone file would duplicate it.
- ❌ A new `skill-runner.md` or expanded `image-see` coverage — they get a one-line
  index mention only.
- ❌ npm publish, distribution model (deferred to workshop 005, per `README.md:194`).

### Target Domains

This is a **documentation-only** pass. It creates **no new domain**, modifies **no
domain's code**, and touches **no domain contract**. The docs *reference* (consume)
existing domains; the front-door files are cross-cutting repo documentation.

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `extension-authoring-harness` | existing | **consume** | `build.md` + `update-pi.md` narrate its recipes (`just install`/`self-check`/`update-pi`); no change |
| `pij-control-plane` | existing | **consume** | `workflow.md` + README cross-agent thesis describe the daemon/transport seam; no change |
| `flow-pair` | existing | **consume** | `workflow.md` describes the orchestrator/worker/reviewer loop; no change |
| `pij-messaging` | existing | **consume** | AGENTS_README + README link `docs/how/pij.md`; no change |
| _cross-cutting docs_ | n/a | **create (docs only)** | `AGENTS_README.md`, `README.md`, and the 4 new `docs/how/*.md` are repo documentation, not owned by a code domain |

No NEW code domain → no domain setup task is required (G7).

### Testing Strategy

- **Approach**: **Manual** (option C) — documentation verification, not automated tests.
- **Rationale**: the deliverables are Markdown; correctness = factual accuracy against
  the `justfile`/CLI + working links + a successful cold-start mental walkthrough.
- **Per-phase verification** (every phase carries an explicit verification task):
  1. **Link check** — every relative link resolves to a real file (`AGENTS_README.md`
     and `README.md` links land on existing `docs/how/*.md`, `AGENTS.md`, `RUNBOOK.md`).
  2. **Fact check** — every command/path in a doc matches the `justfile`/CLI source
     (cite the `justfile` line); the skills fact matches disk evidence (F-07).
  3. **Cold-start walkthrough** — read AGENTS_README top-to-bottom as a fresh agent;
     confirm clone → `just install` → verify is followable with no missing step.
- **Excluded**: unit/integration/smoke tests (no code changes); `markdownlint` is not in
  the toolchain — do not add it.
- **Mock usage**: none (N/A for docs).

### Documentation Strategy

- **Location**: **Hybrid** (option C) — `README.md` (thesis/quick-start) + `docs/how/`
  (depth) + the new root `AGENTS_README.md` (agent cold-start index).
- **Rationale**: the brief mandates a root index that signposts into `docs/how/` depth
  articles, plus a README reframe.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2 (6 files across root + docs/how), I=1 (must stay consistent with the
  justfile + 11 existing articles), D=0 (no data/state), N=1 (new front-door doc shape),
  F=1 (cold-start usability is the non-functional bar), T=1 (manual verification only)
- **Confidence**: 0.85
- **Assumptions**: the `justfile`/CLI behaviour documented here is current (verified
  2026-07-01); the 11 existing `docs/how/` articles stay where they are.
- **Dependencies**: P2 (README) depends on P1 (so README can link the new articles +
  AGENTS_README).
- **Risks**: see Risks table.
- **Phases**: 2.

### Acceptance Criteria

- **AC-01** — `AGENTS_README.md` exists at repo root, opens with a cold-start quickstart
  (clone → `just install` → verify), and is structured as an index (blurb + link per
  section), not a content dump.
- **AC-02** — `AGENTS_README.md` covers all four brief-mandated topics: **build**,
  **update pi (and what pi is)**, **how to work on pij + our workflow** (the-flow +
  flow-pair + control-plane peers), and **other cold-start essentials**.
- **AC-03** — `AGENTS_README.md` contains the skills-location fact, correct and verbatim
  to disk reality: non-Claude agents (copilot, codex, pi) read skills from
  `~/.agents/skills/` (installed via `npx skills`; manifest `~/.agents/.skill-lock.json`);
  Claude's skills live at `~/.claude/skills/` (symlinks into the shared store).
- **AC-04** — `AGENTS_README.md` signposts to the documented `docs/how/` link set (see
  the Implementation Plan's AGENTS_README Link Map) and to `AGENTS.md`/`RUNBOOK.md`.
- **AC-05** — The 4 new `docs/how/` articles exist (`build.md`, `update-pi.md`,
  `workflow.md`, `skills.md`), each ≥ a quick-reference depth and consistent with the
  `justfile`/CLI (no invented commands).
- **AC-06** — `README.md` opens by framing the dual thesis ("pi-extensions project AND
  cross-agent worker system — and more") and links `AGENTS_README.md` as the agent
  front door; existing feature blurbs/links remain accurate.
- **AC-07** — Every relative link in the new/updated docs resolves (link-check task).
- **AC-08** — No non-doc file changed (no code/justfile/.harness diff).

### Risks & Assumptions

- A coder could edit the existing `AGENTS.md` instead of creating the new
  `AGENTS_README.md` → tasks name the exact new path and the distinction.
- A coder could turn `AGENTS_README.md` into a procedure dump (defeating "index") →
  tasks cap each section at a blurb + link.
- The skills fact could be paraphrased wrong → AC-03 pins the exact wording + disk
  evidence (F-07).

### Open Questions

None blocking — the dossier resolved the structural decisions (single front door,
4 new articles, 2 phases). Naming (`update-pi.md` vs `pi-lifecycle.md`) is fixed below
to remove coder ambiguity.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| _none_ | — | The shape is fully determined by the brief + dossier; no design exploration needed before locking phases. | — |

### Clarifications

#### Session 2026-07-01
- **Workflow Mode** → **Full** (brief requires per-phase `tasks/` dirs + a phase count).
- **Testing Strategy** → **Manual** (docs pass; verification = links + facts + walkthrough).
- **Mock Usage** → none (N/A).
- **Documentation Strategy** → **Hybrid** (README + docs/how/ + new root index).
- **New article set** → exactly 4 (`build.md`, `update-pi.md`, `workflow.md`,
  `skills.md`); cold-start quickstart lives in `AGENTS_README.md`, no `cold-start.md`.
- **Driver note**: questions answered by the planning driver (pij-1bdkqiq) from the
  brief, not via interactive prompts (fleet run, orchestrator pij-5lztp8).

---

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved in the dossier.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings + the file/contents decisions |
| workshops/*.md | n | — |

---

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No unresolved critical `[NEEDS CLARIFICATION]` markers. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` layer rules; docs-only. |
| G4 | ADR Compliance | N/A | No `docs/adr/` accepted ADRs constrain a docs pass. |
| G5 | Structure | PASS | All required sections present + populated. |
| G6 | Testing Alignment | PASS | Manual strategy → each phase has explicit verification tasks; ACs are observable. |
| G7 | Domain Completeness | PASS | Documentation-only: no NEW code domain (no setup task needed); referenced domains exist in the registry; consume-only. |

### Summary

Create the cold-start documentation layer in two phases. **Phase 1** writes the 4 new
`docs/how/` depth articles and the new root `AGENTS_README.md` index (articles first so
the index links real targets). **Phase 2** reframes `README.md` to the dual thesis and
links the new front door. Verification per phase is manual: links resolve, facts match
the `justfile`/CLI, and the cold-start path is followable end-to-end.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `AGENTS_README.md` (NEW, root) | _cross-cutting docs_ | doc (front-door index) | Cold-start front door; not owned by a code domain. |
| `docs/how/build.md` (NEW) | extension-authoring-harness (consume) | doc | Narrates `just install`/recipes/`self-check`/harness boot. |
| `docs/how/update-pi.md` (NEW) | extension-authoring-harness (consume) | doc | Narrates what pi is + `just update-pi`/`pi-doctor`. |
| `docs/how/workflow.md` (NEW) | flow-pair, pij-control-plane (consume) | doc | the-flow + flow-pair + control-plane peers. |
| `docs/how/skills.md` (NEW) | _cross-cutting docs_ | doc | Skills model + the shared-store fact. |
| `README.md` (EDIT) | _cross-cutting docs_ | doc (thesis) | Reframe to the dual thesis + link AGENTS_README. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Skills fact verified on disk: `~/.agents/skills/` shared store + `~/.agents/.skill-lock.json` (v3); `~/.claude/skills/` symlinks into it; installed via `npx skills` (F-07). | Pin exact wording in AGENTS_README (AC-03) + `skills.md`; do not paraphrase. |
| 02 | High | `just install` = the 6-step fresh-machine bootstrap; `justfile` is the single source of truth (F-01,F-02). | `build.md` + AGENTS_README quickstart narrate it; never restate divergent steps. |
| 03 | High | `pi` = `@earendil-works/pi-coding-agent@latest`; `just update-pi`/`pi-doctor` manage it + `~/.pi/agent/` state (F-03,F-04,F-05). | `update-pi.md` is the depth article. |
| 04 | High | README under-frames the thesis (lists features, leads harness-only) (F-05/risk). | P2 is a REFRAME (elevate dual thesis), not an append. |
| 05 | Medium | 9 extensions incl. `image-see` + `skill-runner` (no README section today); 11 `docs/how/` articles (F-09,F-10). | AGENTS_README extensions index lists all; `skill-runner` gets a one-liner (no new article). |
| 06 | Medium | AGENTS.md (rules) + RUNBOOK.md (ops) already exist and are distinct from the new AGENTS_README (index). | AGENTS_README links to them; does not absorb or duplicate. |
| 07 | Medium | Node engine `>=24`, npm + committed `package-lock.json` (F-06). | Prerequisites block in `build.md` + AGENTS_README quickstart. |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | docs/how depth articles + AGENTS_README index | _cross-cutting docs_ | Write the 4 new depth articles, then the root cold-start front-door index that signposts them. | None |
| 2 | README dual-thesis reframe | _cross-cutting docs_ | Reframe README to "pi-extensions AND cross-agent worker system — and more" and link the new front door. | Phase 1 |

#### Phase 1: docs/how depth articles + AGENTS_README index

**Objective**: Write the 4 new `docs/how/` depth articles, then the new root
`AGENTS_README.md` cold-start index that signposts to them and the existing 11 articles.
**Domain**: _cross-cutting docs_ (consume: extension-authoring-harness, pij-control-plane, flow-pair).
**Delivers**:
- `docs/how/build.md`, `docs/how/update-pi.md`, `docs/how/workflow.md`, `docs/how/skills.md`
- `AGENTS_README.md` (root) — cold-start quickstart + index per the **AGENTS_README Link Map** below
**Depends on**: None
**Key risks**: writing procedures into the index instead of blurbs+links; paraphrasing the skills fact.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Write `docs/how/build.md` | docs (consume extension-authoring-harness) | Covers: prerequisites (node>=24, npm, tmux, the global `harness` CLI); `just install` 6-step bootstrap; the recipe surface (`just` no-arg, `new`/`typecheck`/`lint`/`format`/`test`/`smoke`); the `self-check` gate (typecheck→lint→test→smoke→`pkg audit`→snapshots-check); `harness boot`/`harness checks`/`harness doctor`; smoke = tmux Driver SDK. Every command cites the `justfile` line; nothing invented. | Findings 02,07; `justfile:16-123,210-357` |
| 1.2 | Write `docs/how/update-pi.md` | docs (consume extension-authoring-harness) | Covers: what pi is (`@earendil-works/pi-coding-agent@latest`); `just update-pi` flow; the `~/.pi/agent/` global state pij syncs (`APPEND_SYSTEM.md`, `mcp.json`, extension symlinks, vetted packages); `just pi-doctor` audit; the optional pi-fork path (`pi-fork-*`) as advanced/optional. | Finding 03; `justfile:210-227,303-357` |
| 1.3 | Write `docs/how/workflow.md` | docs (consume flow-pair, pij-control-plane) | Covers: the-flow SDD pipeline (explore→plan→tasks→implement→review→ship); flow-pair 3-session orchestrator/worker/reviewer over the-flow + the prompt-learning ledger; control-plane peers (`pij` daemon, `spawn`/`send`/`list`/`tail`, transport seam pi=inbox vs claude/codex/copilot=tmux). Links to `docs/how/flow-pair.md` + `docs/how/pij.md` for depth; does not duplicate them. | Findings F-11,F-12,F-13 |
| 1.4 | Write `docs/how/skills.md` | docs (cross-cutting) | Covers the skills model: shared store `~/.agents/skills/` (installed via `npx skills`, manifest `~/.agents/.skill-lock.json`); `~/.claude/skills/` symlinks into it; the install recipes (`just flow-pair-install`, `just install-flow-skills`); which skills matter for cold-start (the-flow, flow-pair, eng-harness-flow). Fact must match disk evidence (F-07) exactly. | Finding 01 (Critical); `justfile:160-191` |
| 1.5 | Write `AGENTS_README.md` (root) | docs (front-door index) | NEW file (distinct from `AGENTS.md`). Opens with **Cold start** quickstart (clone → `just install` → verify with `just pi-doctor` + `just self-check`/`harness boot`). Then index sections — each a 1–3 sentence blurb + link — per the **AGENTS_README Link Map** below. Includes the skills fact inline (AC-03). Index, NOT a dump. | ACs 01–04; depends on 1.1–1.4 existing |
| 1.6 | Verify Phase 1 (links + facts + walkthrough) | docs | Link-check: every relative link in 1.1–1.5 resolves. Fact-check: each command/path matches the `justfile`/CLI (spot-cite); skills fact matches F-07. Walkthrough: read AGENTS_README as a fresh agent — clone→build→verify followable. | Testing Strategy; ACs 05,07 |

#### Phase 2: README dual-thesis reframe

**Objective**: Reframe `README.md` to lead with the dual thesis and link the new
`AGENTS_README.md` front door, keeping existing feature blurbs accurate.
**Domain**: _cross-cutting docs_.
**Delivers**: updated `README.md`.
**Depends on**: Phase 1 (so README can link the new articles + AGENTS_README).
**Key risks**: appending a section instead of reframing the top; breaking existing relative links.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Reframe `README.md` opening to the dual thesis | docs | New top framing: pij is BOTH a **pi-extensions project** (`.pi/extensions/*`, e.g. pij) AND a **cross-agent worker system** (control-plane daemon + flow-pair + telegram — agents driving agents across claude/copilot/codex/pi) — **and more**. Keep "the harness is the product" but subordinate it under the dual thesis. | Finding 04; `README.md:1-20` |
| 2.2 | Add an agent front-door pointer + curate feature signposts | docs | README links `AGENTS_README.md` near the top as the agent cold-start front door; the existing feature sections (pij, session-sql, todo, minih-workbench, pi-peacock, flow-pair, telegram) stay as accurate blurbs+links; add a one-line cross-link to `docs/how/workflow.md`. Do not remove accurate content. | F-09,F-10 |
| 2.3 | Verify Phase 2 (links + thesis read) | docs | Link-check all README relative links resolve (incl. new AGENTS_README + workflow.md). Thesis read: opening clearly frames "both + more"; no broken pre-existing links. Confirm no non-doc file changed (AC-08). | ACs 06,07,08 |

#### AGENTS_README Link Map (the signposts task 1.5 must carry)

The coder builds `AGENTS_README.md` from these sections; each row = one index section
(blurb + the exact links it carries). This is the concrete "which docs/how links
AGENTS_README carries" answer the brief requires.

| Section | Blurb (1–3 sentences) | Links it carries |
|---------|------------------------|------------------|
| Cold start | Clone, `just install`, verify. The single fresh-machine path. | `docs/how/build.md` |
| Build & test | Recipes, the `self-check` gate, the engineering harness. | `docs/how/build.md`; `.harness/engineering-harness.md` |
| What is pi / updating pi | pi is the official `@earendil-works/pi-coding-agent`; pij syncs global state onto it. | `docs/how/update-pi.md` |
| How we work (workflow) | the-flow SDD pipeline + flow-pair delegation + control-plane peers. | `docs/how/workflow.md`; `docs/how/flow-pair.md`; `docs/how/pij.md` |
| Skills (MUST-INCLUDE fact) | Shared store `~/.agents/skills/` via `npx skills` (manifest `~/.agents/.skill-lock.json`); Claude reads `~/.claude/skills/` (symlinks into it). | `docs/how/skills.md` |
| The extensions (pi-extensions half) | The `.pi/extensions/*` product surfaces. | `docs/how/pij.md`, `session-sql.md`, `todo.md`, `agent-workbench.md`, `pi-peacock.md`, `file-watch-notify.md`, `image-see.md`, `ralph-loop.md` (+ one-line `skill-runner`, no article) |
| Cross-agent worker system (the other half) | The control plane, delegation, and remote driving. | `docs/how/pij.md`, `flow-pair.md`, `pij-telegram.md` |
| Feedback / self-improvement | Retros + magic-wand loop back into the harness. | `docs/how/agent-feedback.md` |
| Rules & runbook | Where the agent rules and ops runbook live. | `AGENTS.md` (rules), `RUNBOOK.md` (ops), `README.md` (thesis) |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T1.5 | T1.6 walkthrough |
| AC-02 | T1.5 (+1.1–1.4 depth) | T1.6 |
| AC-03 | T1.4, T1.5 | T1.6 fact-check |
| AC-04 | T1.5 (Link Map) | T1.6 link-check |
| AC-05 | T1.1–T1.4 | T1.6 |
| AC-06 | T2.1, T2.2 | T2.3 |
| AC-07 | T1.5, T2.2 | T1.6, T2.3 link-check |
| AC-08 | (whole pass) | T2.3 (no non-doc diff) |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Coder edits existing `AGENTS.md` instead of new `AGENTS_README.md` | Medium | High | T1.5 names the exact new path + the rules-vs-index distinction (Finding 06). |
| AGENTS_README becomes a procedure dump (not an index) | Medium | Medium | Link Map caps each section at blurb+link; depth lives in the articles. |
| Skills fact paraphrased incorrectly | Low | High | AC-03 pins exact wording; T1.4/T1.6 fact-check against F-07. |
| README reframed by appending, not elevating | Medium | Medium | T2.1 success criteria require top-of-file reframing; reviewer checks the opening. |
| A doc command drifts from the `justfile` | Low | Medium | Every command task cites the `justfile` line; T1.6/T2.3 fact-check. |
