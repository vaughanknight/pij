# /pij Router Skill — flow-pair becomes one route
**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-07-03
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Summary

pij grew from "peer comms for flow-pair" into a platform: peers, agent packs, a daemon control plane, model discovery. The flow-pair skill is now just one job among several, yet it's the only skill front door. Build a new `/pij` skill composed like the-flow — a token-lean router (SKILL.md dispatch + `references/00-routing.md` detection + one module per route, progressive disclosure) — where flow-pair's orchestration protocol becomes the `pair` route. The engine (flow-pair `lib/`, schemas, tests, ledger) stays untouched in place; only the skill front door is replaced.

ℹ️ No research-dossier.md — grounding came from in-session inspection of `~/github/tools/skills/SDD/the-flow/` composition, the pij CLI usage surface, and two research subagents (findings below).

### Goals

- One `/pij` front door routing by **intent** (jobs-to-be-done), not CLI verbs: pair, delegate, agent, peer, ops.
- Progressive disclosure: load exactly one route module per step; shared conventions cited lazily.
- **Token-lean is a requirement, not a style**: hard line budgets per file (AC-03).
- flow-pair superseded cleanly: its deployed prose fully captured, its skill reduced to a pointer shim, its engine and history intact.
- Stateless detection: `/pij` no-arg re-derives position from deterministic signals (open run ledger, live roster, daemon, adoption) — survives `/compact`.

### Non-Goals

- **No rename/move of `skills/flow-pair/lib|test|schemas|prompt-lab`**, no `flow-pair` bin rename, no `LEDGER_ROOT` (`.flow-pair/`) change — the engine stays put (findings 02, 05).
- No implementation of the `accept` CLI verb; no real code-review logic in the CLI `review` verb (verdict law documented instead).
- No `watch` route module — awaits daemon fs.watch push delivery (plan 029 Phase 4 candidate, SUGG-004). Registry may name it as *future*, with no module.
- No changes to pij CLI (`.pi/extensions/pij/`) behavior.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-skill | **NEW** | **create** | The router skill: route registry, detection signals, shared conventions, route modules |
| flow-pair | existing | **modify** | Skill front door superseded (pointer shim); prose ported to `pair` route; engine/ledger/schemas/tests stay owned here; one help-text fix in `lib/cli.ts` |
| pij-control-plane | existing | **consume** | CLI verbs the peer/ops routes print (spawn/adopt/daemon/tail/close) |
| pij-messaging | existing | **consume** | send/state/list surface cited by routes |
| agent-runtime | existing | **consume** | `pij agent *` surface the agent route wraps |

#### New Domain Sketches

##### pij-skill [NEW]
- **Purpose**: The operator/agent-facing skill layer over the pij platform — routes intents to the right protocol module and owns the cross-route conventions (harness modes, canary-verify, compact-early, no-poll, placement caps, model discovery).
- **Boundary Owns**: `skills/pij/**` — dispatch, routing/detection, route modules, shared conventions, deprecation aliases.
- **Boundary Excludes**: the pij CLI itself (→ pij-control-plane/pij-messaging/agent-runtime); the delegation engine, ledger, schemas, prompt-lab (→ flow-pair); the SDD pipeline (→ the-flow, external).

### Testing Strategy

- **Approach**: Lightweight.
- **Rationale**: deliverable is mostly markdown; the one code touch (help text) is guarded by the existing suite.
- **Focus Areas**: structural parity + budgets via a `just pij-skill-check` recipe (registry↔module, sibling-blindness, line budgets); engine regression via `just flow-pair-test`; one live control-plane smoke for the peer route.
- **Excluded**: TDD for markdown; mutation gates (no new logic).
- **Mock Usage**: avoid mocks — live daemon/peer for the smoke (repo live-gate culture).

### Documentation Strategy

- **Location**: No new docs — the skill IS the documentation. Pointer updates only: `AGENTS_README.md` §Skills, `docs/how/skills.md`, a supersession banner on `docs/how/flow-pair.md`, domain registry/map rows.
- **Rationale**: token-lean mandate; avoid a second copy that drifts.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=1, F=0, T=1
- **Confidence**: 0.75
- **Assumptions**: deployed-store fork reconciles cleanly (5 files); flow-pair lib does not runtime-read `references/templates/` (verified in T2.2 before any content move).
- **Dependencies**: `npx skills` install tooling; a running daemon for the smoke.
- **Risks**: see § Risks & Assumptions.
- **Phases**: 2.

### Acceptance Criteria

1. **AC-01 Registry↔module parity** — every `/pij` registry row resolves to an existing module file (rows explicitly marked *lands Phase 2* / *future* are exempt until their phase; a marked row whose module exists is flagged); no orphan modules. Verified by `just pij-skill-check` (exit 0).
2. **AC-02 Sibling-blind modules** — no route module names another route or the routing engine; only `§ Shared conventions` citations allowed. Grep check in `pij-skill-check`.
3. **AC-03 Token budgets** — SKILL.md ≤150 lines; 00-routing.md ≤250; pair.md ≤350; each other route ≤150. Enforced by `pij-skill-check`.
4. **AC-04 Pair parity** — every load-bearing rule of the **reconciled deployed** flow-pair SKILL.md (331-line fork) maps to `pair.md` or shared conventions; audit checklist attached to the phase-2 review; zero dropped invariants.
5. **AC-05 Deprecation shim** — `/flow-pair` (repo + deployed store) is a ≤20-line pointer to `/pij pair` whose **frontmatter description keeps flow-pair's trigger phrases** (NL invocation still routes); no duplicated protocol prose anywhere (spot-grepped by `pij-skill-check`).
6. **AC-06 Engine untouched** — `flow-pair` bin, `lib/` (except cli.ts help strings), `schemas/`, `test/`, `prompt-lab/` paths, `.flow-pair/` ledger root byte-identical in behavior; `just flow-pair-test` green.
7. **AC-07 Live smoke** — following the peer route's printed commands verbatim in control-plane mode spawns → canary-verifies → closes a real peer.
8. **AC-08 Disambiguation** — `/pij` SKILL.md's first screen states the skill ≠ the `pij` CLI bin and shows the `/pij <route>` grammar.
9. **AC-09 Store reconciled** — deployed-fork diff merged to repo **before** the port; store re-deployed from repo at ship; `diff -rq` clean.

### Risks & Assumptions

| Risk | Notes |
|---|---|
| Deployed-store drift recurs post-ship | Deploy from repo is a ship task; AC-09 diff-clean check; consider a future drift sensor (out of scope) |
| Pair port drops a subtle protocol rule | AC-04 checklist is review-mandatory; reviewer mutates the checklist (remove a rule → audit must catch) |
| `/pij` skill vs `pij` CLI confusion | AC-08; registry grammar always `/pij <route>`; routes print CLI commands in fenced blocks |
| Templates are runtime-read by `packet.ts` | T2.2 verifies before moving any reference content; if read, content stays in place and `pair.md` points at it |

### Open Questions

- Round-1 answers were agent-selected defaults (user AFK — see Clarifications). Override any and re-run this verb (idempotent).
- `watch` route lands when plan 029 Phase 4 ships fs.watch push delivery.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| — none required | | Route set + detection signals settled in-session; embedded in this plan | |

### Clarifications

#### Session 2026-07-03

| # | Q | A |
|---|---|---|
| 1 | Workflow mode | **Full, 2 phases** *(agent default — user AFK; pair port earns its own review gate)* |
| 2 | Testing | **Lightweight** *(agent default)* |
| 3 | Mocks | **Avoid — live smoke** *(agent default)* |
| 4 | Docs | **No new docs; pointer updates only** *(agent default)* |
| 5 | Skill location/deploy | New `skills/pij/` in this repo; deploy via existing `npx skills` store (`~/.agents/skills` + `~/.claude` symlink), new `just pij-skill-install` recipe *(agent decision, grounded in finding 05)* |
| 6 | Stub CLI verbs | Don't implement `accept`; document CLI `review` as an **artifact-contract gate only** (it emits APPROVE on artifact presence — never code correctness); hand-persisted reviewer verdicts remain the law, stated in `pair.md`; fix the stale help text *(agent decision, finding 03)* |
| 7 | flow-pair fate | Pointer shim, engine stays in place un-renamed *(agent decision, findings 01/02/05)* |
| 8 | Route set | pair · delegate · agent · peer · ops (+ watch deferred) *(agent decision, from in-session design)* |

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | two in-pass research subagents substituted (Key Findings) |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | no critical markers; Round-1 defaults recorded + flagged for override |
| G2 | Constitution | N/A | no docs/project-rules/constitution.md |
| G3 | Architecture | N/A | no docs/project-rules/architecture.md |
| G4 | ADR Compliance | N/A | no docs/adr/ |
| G5 | Structure | PASS | all contract sections present |
| G6 | Testing Alignment | PASS | validation task in each phase (T1.9, T2.6) |
| G7 | Domain Completeness | PASS | pij-skill NEW has sketch + setup task T1.7; manifest covers all task files |

### Summary

Replace the flow-pair skill front door with a `/pij` router mirroring the-flow's composition: a dispatch SKILL.md (registry, grammar, invariants, alias table), a detection engine (`00-routing.md` — deterministic signals + shared conventions), and five sibling-blind route modules. Phase 1 builds the skeleton and the three light routes (peer, agent, ops) plus install/check tooling. Phase 2 reconciles the deployed fork, ports the delegation protocol into `pair.md`, adds `delegate.md`, and lands the deprecation shims and doc pointers. The flow-pair engine is deliberately untouched.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| skills/pij/SKILL.md | pij-skill | contract | dispatch: registry, grammar, invariants, aliases |
| skills/pij/references/00-routing.md | pij-skill | internal | detection signals + shared conventions |
| skills/pij/references/routes/peer.md | pij-skill | internal | route module |
| skills/pij/references/routes/agent.md | pij-skill | internal | route module |
| skills/pij/references/routes/ops.md | pij-skill | internal | route module |
| skills/pij/references/routes/pair.md | pij-skill | internal | route module (port target) |
| skills/pij/references/routes/delegate.md | pij-skill | internal | route module |
| docs/domains/pij-skill/domain.md | pij-skill | contract | new domain doc |
| docs/domains/registry.md | pij-skill | cross-domain | add row |
| docs/domains/domain-map.md | pij-skill | cross-domain | add node + edges |
| skills/flow-pair/SKILL.md | flow-pair | cross-domain | reduce to pointer shim |
| skills/flow-pair/lib/cli.ts | flow-pair | cross-domain | help-text fix only (stale stub labels) |
| justfile | extension-authoring-harness | cross-domain | `pij-skill-install`, `pij-skill-check` recipes |
| AGENTS_README.md | pij-skill | cross-domain | §Skills pointer update |
| docs/how/skills.md | pij-skill | cross-domain | install-table row |
| docs/how/flow-pair.md | flow-pair | cross-domain | supersession banner |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Deployed store (`~/.agents/skills/flow-pair`) is a real fork **ahead of the repo** — 331 vs 299-line SKILL.md (sanity-pass + "own the deliverable" prose exist only there); 5 files differ | Reconcile store→repo FIRST (T2.1a); port from the reconciled text; AC-09 |
| 02 | Critical | `context-pack.ts:213` hardcodes `skills/flow-pair/prompt-lab/...` from repo root and **silently returns empty learnings** if the dir moves | Engine stays put — no rename (Non-Goal); AC-06 |
| 03 | High | CLI `review` is an artifact-existence gate that emits `APPROVE` without reading code (`review.ts:134-141`); `accept` is the only true stub (`cli.ts:272-274`); help text (`cli.ts:47-50`) stale — labels real verbs as stubs | `pair.md` states the verdict law (hand-persist reviewer verdicts; CLI review = contract gate only); fix help text (T2.7); don't route `accept` |
| 04 | High | `pij` name heavily overloaded: bin (`package.json:7`), two domains, `docs/how/pij.md` | AC-08 disambiguation on the first screen; grammar always `/pij <route>` |
| 05 | High | Install machinery keys on the name: justfile `flow-pair-link/-install` (L163-176), `npx skills … -s flow-pair`, store + `.skill-lock.json` | New `pij-skill-install` recipe (T1.8); old recipes stay (engine tests still use them) |
| 06 | High | the-flow pattern confirmed: Registry table + 00-routing engine + one-module-per-step + lazy shared conventions; flow-pair today is a flat 299-line monolith | Mirror the pattern exactly; progressive disclosure is the contract (AC-01/02/03) |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Router skeleton + light routes | pij-skill | `/pij` dispatch, detection engine, peer/agent/ops routes, install + check tooling | — |
| 2 | Pair port + delegate + deprecation | pij-skill | Reconcile fork, port pair, add delegate, shim flow-pair, update pointers | Phase 1 |

#### Phase 1: Router skeleton + light routes

**Objective**: A loadable, deployable `/pij` skill with dispatch, detection, and the three routes that need no porting.
**Domain**: pij-skill
**Delivers**: `skills/pij/` (SKILL.md, 00-routing.md, routes/{peer,agent,ops}.md), pij-skill domain docs, `just pij-skill-install` + `just pij-skill-check`.
**Depends on**: None.
**Key risks**: over-writing — budgets (AC-03) are the guard.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | `skills/pij/SKILL.md` — registry table (pair/delegate/agent/peer/ops + watch marked *future, no module*), `/pij <route>` grammar, two load paths (guided no-arg / direct route), global invariants (never write the-flow files; pointer-only delivery; forbidden paths; persist-before-mutate; no-poll; ownership-aware teardown), alias table (`/flow-pair …` → `/pij pair …`), skill≠CLI disambiguation, **CLI-verb coverage**: whoami/list/state → peer · compact-self/models → § conventions · daemon/phonehome/path/telegram → ops · `agent *` → agent · spawn/send/tail/close/adopt → peer · watch → future | pij-skill | ≤150 lines; AC-08 on first screen; every bin-USAGE verb (+ `models`) maps to a route/convention/non-goal | Per finding 06 |
| 1.2 | `references/00-routing.md` — deterministic signals (newest `.flow-pair/runs/*/run.json` with `status=="open"` → **offer** resume pair — schema enum is `open\|closed` (`run.schema.json:18`), missing file/status = no signal, and stale-open runs are common so offer, never auto-resume; live `spawnedByUs` roster; active the-flow at implement/review → offer pair; daemon alive; self adopted) + precedence + hint-validation ("a hint is never a command") + § Shared conventions (harness modes pi-vs-control-plane — **absorbs `harness-modes.md` as sole owner**, canary-verify, compact-early + `pij compact-self`, models discovery via `pij models`, placement/split-cap, daemon-restart-after-core-change) | pij-skill | ≤250 lines; every signal names its exact probe (file/command) | |
| 1.3 | `routes/peer.md` — spawn/adopt/send/tail/close an ad-hoc colleague; model+harness selection; canary discipline cited from § Shared conventions | pij-skill | ≤150 lines; sibling-blind | |
| 1.4 | `routes/agent.md` — pack discovery/run/spawn (`--once` vs resident), report round-trip, authoring (new/check/eject) | pij-skill | ≤150 lines; sibling-blind | |
| 1.5 | `routes/ops.md` — daemon lifecycle, restart-after-core-change, registry/tmux tidy, telegram bridge pointer | pij-skill | ≤150 lines; sibling-blind | |
| 1.6 | `just pij-skill-check` — registry↔module parity, sibling-blindness grep, line budgets, CLI-verb coverage (every `pij --help` verb + `models` maps somewhere), duplicated-prose spot-grep (each convention heading appears in exactly one file) | extension-authoring-harness | exit 0 on green tree; each violation named | Guards AC-01/02/03/05 |
| 1.7 | pij-skill domain: `docs/domains/pij-skill/domain.md` + registry row + domain-map node/edges | pij-skill | registry + map render; edges: consumes flow-pair, pij-control-plane, pij-messaging, agent-runtime | G7 |
| 1.8 | `just pij-skill-install` (npx skills, `-s pij`, `-a '*'` machine-wide) + `just pij-skill-link` (symlink into `.pi/skills/` for in-repo pi dogfooding) + deploy + verify `/pij` loads in a claude session AND is visible to a pi session via the link | pij-skill | skill listed + loadable in claude; pi discovery confirmed | Per finding 05 |
| 1.9 | Validation: run `pij-skill-check` + `flow-pair-test` | — | both exit 0 | G6 |

#### Phase 2: Pair port + delegate + deprecation

**Objective**: flow-pair's protocol lives in `pair.md` with nothing dropped; flow-pair is a shim; pointers updated.
**Domain**: pij-skill
**Delivers**: `routes/pair.md`, `routes/delegate.md`, shimmed flow-pair SKILL.md (repo + store), doc pointer updates, help-text fix.
**Depends on**: Phase 1.
**Key risks**: dropped invariant in the port (AC-04 checklist is the gate).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1a | Reconcile deployed fork → repo (`diff -rq ~/.agents/skills/flow-pair skills/flow-pair`; merge the 5 diverged files) | flow-pair | diff clean; 331-line prose captured in repo git | Per finding 01; AC-09 |
| 2.1b | Port → `routes/pair.md`: decision-protocol FSM, fleet lifecycle (lazy acquire, canary, compact-early, reuse-never-close, heal, teardown), sanity pass, Dim-0 mandate, pipeline/no-poll, verdict law (finding 03), ledger + prompt-lab invocation surface (shells to existing `flow-pair` CLI). Items also named in § Shared conventions are **citations only** — the prose lives solely in 00-routing.md (single owner) | pij-skill | ≤350 lines; AC-04 checklist drafted alongside (source-section → target-section map, incl. the deployed `## References` index) | |
| 2.2 | Verify lib does NOT runtime-read `references/` (grep packet.ts/context-pack.ts); then disposition **every** `references/*` file: `harness-modes.md` → **absorbed** by 00-routing § Shared conventions (sole owner); `review-rubrics.md`, `templates/*`, `ledger-schema.md`, `context-packs.md`, `architecture.md`, `prompt-taxonomy.md` → **cited in place** from pair.md; `orchestrator-worker-protocol.md` (5-line stub) → **retire**; record the disposition table in the execution log | flow-pair | grep evidence recorded; zero content moved if runtime-read; no references/ file left without a live inbound pointer or a recorded retire decision | Risk table row 4 |
| 2.3 | `routes/delegate.md` — one bounded task → one peer: packet (pointer-only, forbidden paths), done-report, no reviewer/verdict cycle; teardown | pij-skill | ≤150 lines; sibling-blind | |
| 2.4 | Shim: repo `skills/flow-pair/SKILL.md` → ≤20-line supersession pointer to `/pij pair`; redeploy store from repo | flow-pair | AC-05; AC-09 diff clean post-deploy | |
| 2.5 | Pointer updates: AGENTS_README §Skills, docs/how/skills.md row, docs/how/flow-pair.md banner, flow-pair domain.md note (front door → pij-skill) | pij-skill | no dangling `/flow-pair` instruction remains (grep) | |
| 2.6 | Validation: `pij-skill-check` + `flow-pair-test` green; **live smoke** — follow peer route verbatim: spawn → canary → close (control-plane mode) | — | AC-06, AC-07 | |
| 2.7 | `cli.ts:47-50` help-text fix: review/fix labeled correctly (real; review = artifact gate), accept labeled unimplemented | flow-pair | `flow-pair-test` green; help output truthful | Per finding 03 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.1, 1.6 | 1.9, 2.6 (`pij-skill-check`) |
| AC-02 | 1.3–1.5, 2.1b, 2.3 | 1.9, 2.6 |
| AC-03 | 1.1–1.5, 2.1b, 2.3 | 1.9, 2.6 |
| AC-04 | 2.1a, 2.1b | Phase-2 review (checklist audit) |
| AC-05 | 2.4 | 2.6 grep + review |
| AC-06 | Non-Goals, 2.7 | 1.9, 2.6 (`flow-pair-test`) |
| AC-07 | 1.3 | 2.6 live smoke |
| AC-08 | 1.1 | Phase-1 review |
| AC-09 | 2.1a, 2.4 | 2.6 (`diff -rq` clean) |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Pair port drops an invariant | Medium | High | AC-04 source→target checklist; reviewer mutation on the checklist |
| Store drift recurs post-ship | Medium | Medium | Deploy-from-repo ship task; AC-09; future drift sensor noted |
| Skill/CLI name confusion | Medium | Medium | AC-08; `/pij <route>` grammar everywhere |
| Templates runtime-read | Low | Medium | T2.2 verifies before citing/moving |
