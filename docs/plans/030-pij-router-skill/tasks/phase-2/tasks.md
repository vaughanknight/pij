# Phase 2: Pair port + delegate + deprecation — Tasks & Context Brief

**Plan**: `docs/plans/030-pij-router-skill/pij-router-skill-plan.md` (v1.0.0, READY)
**Phase**: 2 of 2 · **Domain**: pij-skill · **Created**: 2026-07-04

## Executive Briefing

- **Purpose**: Port flow-pair's delegation protocol into the `/pij` router (`routes/pair.md`),
  add a lean `routes/delegate.md`, shim `/flow-pair` down to a pointer, and update all pointers —
  so `/pij pair` becomes the front door and `/flow-pair` is a ≤20-line supersession stub, **with
  zero dropped invariants** (AC-04 is the gate).
- **What We're Building**: `skills/pij/references/routes/pair.md` (the ported FSM + fleet lifecycle),
  `skills/pij/references/routes/delegate.md` (single-task, no-review), a shimmed
  `skills/flow-pair/SKILL.md` (repo + deployed store), doc-pointer updates, and a `cli.ts` help-text fix.
- **The engine does NOT move.** flow-pair's `lib/` (except `cli.ts` help strings), `bin`, `schemas/`,
  `test/`, `prompt-lab/`, and the `.flow-pair/` ledger stay byte-identical in behavior (AC-06). This
  is a **documentation/routing** port, not an engine rewrite.

## Prior Phase Context

Phase 1 shipped the `/pij` skeleton on disk: `skills/pij/SKILL.md` (dispatch + registry),
`references/00-routing.md` (detection engine + `§ Shared conventions`), and the sibling-blind
`references/routes/{peer,agent,ops,skill}.md`. The registry already lists `pair` and `delegate` rows
marked *(lands Phase 2)* — this phase fills them. **Read those existing files first** to match voice,
token discipline, and the sibling-blind rule.

## Critical Finding (read before touching anything)

**Finding 01 (Critical) — the deployed store is a fork AHEAD of the repo.** `~/.agents/skills/flow-pair`
(the `npx skills` deployed copy) is **331 lines** vs the repo's 299-line `SKILL.md`; 5 files diverge, and
the newer prose (the **orchestrator sanity pass** + **"own the deliverable"** + trust-but-verify) exists
**only in the deployed copy**. **You must reconcile store→repo FIRST (T2.1a) and port from the
reconciled text** — porting from the stale repo copy would silently drop those invariants. AC-09.

## Pre-Implementation Check

| File | Exists? | Action | Notes |
|------|---------|--------|-------|
| `skills/pij/references/routes/pair.md` | No | **create** (≤350 lines) | the port target |
| `skills/pij/references/routes/delegate.md` | No | **create** (≤150 lines) | single-task route |
| `skills/pij/references/routes/{peer,agent,ops,skill}.md` | Yes | **read only** (voice/format reference) | do NOT modify |
| `skills/pij/references/00-routing.md` | Yes | **read** (§ Shared conventions = the single owner of shared prose) | pair.md **cites**, never copies |
| `skills/flow-pair/SKILL.md` (repo) | Yes (299 ln) | **shim** to ≤20-line pointer (T2.4) | after the port captures its content |
| `~/.agents/skills/flow-pair/SKILL.md` (store, 331 ln) | Yes | **reconcile → repo first** (T2.1a), then redeploy shim | AC-09 |
| `skills/flow-pair/lib/cli.ts` | Yes | **modify help text ONLY** (`~L47-50`, T2.7) | the ONE lib file you may touch |
| `skills/flow-pair/references/*` | Yes | **disposition** each (T2.2): absorbed / cited / retire | zero content moved if runtime-read |
| AGENTS_README, `docs/how/skills.md`, `docs/how/flow-pair.md`, `docs/domains/flow-pair/domain.md` | Yes | **pointer updates** (T2.5) | no dangling `/flow-pair` instruction |

## Tasks

| # | Task | Success Criteria |
|---|------|-----------------|
| 2.1a | **Reconcile deployed fork → repo.** `diff -rq ~/.agents/skills/flow-pair skills/flow-pair`; merge the 5 diverged files INTO the repo (the deployed 331-line prose — sanity pass, own-the-deliverable, trust-but-verify — is the source of truth). Commit the reconciliation before porting. | `diff -rq` shows no content divergence; the 331-line prose is captured in repo git; **port source = reconciled repo text** |
| 2.1b | **Port → `routes/pair.md`** (≤350 lines): the decision-protocol FSM (ASK_USER/RUN_LOCAL/DELEGATE/REVIEW/FIX/APPROVE), the orchestrator sanity pass + Dim-0 mutation gate, fleet lifecycle (lazy acquire, canary-verify, compact-early, reuse-never-close, heal, teardown), pipeline/no-poll, verdict law (CLI `review`/`fix`/`accept` are stubs — hand-persisted reviewer verdicts are the law; finding 03), and the ledger + prompt-lab invocation surface (shells to the existing `flow-pair` CLI — engine unchanged). Items **also** named in `00-routing.md § Shared conventions` are **citations only** (single owner). **Draft the AC-04 source→target checklist alongside** (a table mapping each load-bearing rule of the reconciled 331-line SKILL.md → its pair.md/shared-conventions target, incl. the deployed `## References` index). | pair.md ≤350 lines; sibling-blind (names no other route); AC-04 checklist drafted (source-section → target-section, zero rows unmapped) |
| 2.2 | **Disposition every `references/*` file.** First grep-prove the lib does NOT runtime-read `references/` (check `packet.ts`, `context-pack.ts`). Then per file: `harness-modes.md` → **absorbed** by `00-routing § Shared conventions`; `review-rubrics.md`, `templates/*`, `ledger-schema.md`, `context-packs.md`, `architecture.md`, `prompt-taxonomy.md` → **cited in place** from pair.md; `orchestrator-worker-protocol.md` (5-line stub) → **retire**. Record the disposition table in the execution log. | grep evidence recorded; **zero content moved if runtime-read**; no `references/*` file left without a live inbound pointer or a recorded retire decision |
| 2.3 | **Create `routes/delegate.md`** (≤150 lines): one bounded task → one peer — packet (pointer-only delivery, forbidden paths enumerated), done-report, **no reviewer/verdict cycle**, teardown. Sibling-blind. | delegate.md ≤150 lines; names no sibling route; describes the single-peer no-review path |
| 2.4 | **Shim `/flow-pair`.** Rewrite repo `skills/flow-pair/SKILL.md` → ≤20-line supersession pointer to `/pij pair`, **keeping flow-pair's trigger phrases in the frontmatter `description`** (NL invocation still routes). Then redeploy the store from repo (`just flow-pair-install`). | AC-05: ≤20 lines, frontmatter triggers preserved, no duplicated protocol prose anywhere; AC-09: `diff -rq` clean post-deploy |
| 2.5 | **Pointer updates.** AGENTS_README §Skills, `docs/how/skills.md` row, `docs/how/flow-pair.md` banner, `docs/domains/flow-pair/domain.md` note (front door → pij-skill). | `grep -rn '/flow-pair'` leaves no dangling *instruction* to run flow-pair directly (pointers/aliases OK) |
| 2.6 | **Validation.** `just pij-skill-check` green (registry↔module parity, sibling-blind, token budgets) + `just flow-pair-test` green. **Live smoke** — follow the peer route's printed commands verbatim in control-plane mode: spawn → canary → close a real peer. | AC-06 (`flow-pair-test` green), AC-07 (live smoke spawns+canaries+closes) |
| 2.7 | **Help-text fix** `cli.ts:~47-50`: label `review`/`fix` correctly (real; `review` = artifact-presence gate only, NOT code correctness), label `accept` unimplemented. | `just flow-pair-test` green; `flow-pair --help` output truthful (finding 03) |

## Acceptance Criteria (this phase)

- **AC-04 Pair parity** — every load-bearing rule of the reconciled deployed SKILL.md (331 ln) maps
  to pair.md or shared conventions; the checklist is attached for the review; **zero dropped invariants**.
- **AC-05 Deprecation shim** — `/flow-pair` (repo + store) ≤20-line pointer to `/pij pair`; frontmatter
  triggers preserved; no duplicated protocol prose anywhere.
- **AC-06 Engine untouched** — flow-pair bin/lib(except cli.ts help)/schemas/test/prompt-lab/ledger
  byte-identical in behavior; `just flow-pair-test` green.
- **AC-07 Live smoke** — peer route commands spawn → canary → close a real peer.
- **AC-09 Store reconciled** — deployed-fork diff merged to repo BEFORE the port; store redeployed from
  repo; `diff -rq` clean.

## Allowed paths (bounded scope — execute ONLY within these)

- `skills/pij/references/routes/pair.md` (create), `skills/pij/references/routes/delegate.md` (create)
- `skills/flow-pair/SKILL.md` (shim), `skills/flow-pair/references/**` (disposition: retire/cite only)
- `skills/flow-pair/lib/cli.ts` (**help strings ~L47-50 ONLY**)
- `AGENTS_README*`, `docs/how/skills.md`, `docs/how/flow-pair.md`, `docs/domains/flow-pair/domain.md`
- `docs/plans/030-pij-router-skill/tasks/phase-2/execution.log.md` (your execution log + disposition table)
- `~/.agents/skills/flow-pair/**` (T2.1a reconcile + T2.4 redeploy — via `just flow-pair-install`)

## FORBIDDEN paths (never write)

- `.the-flow-state.json`, `the-flow.json`, `the-flow.md` (the-flow guided mode is their sole writer)
- flow-pair **engine**: `skills/flow-pair/lib/**` (except `cli.ts` help strings), `bin`, `schemas/`,
  `test/`, `prompt-lab/**`, `.flow-pair/**` ledger (AC-06 — engine untouched)
- Any `skills/pij/references/routes/{peer,agent,ops,skill}.md` or `00-routing.md` (Phase 1 — read only)

## Completion Discipline

Implement **every** task 2.1a→2.7 in one run (whole phase per packet — do not hand back after a
couple). Record decisions + the T2.2 disposition table + the AC-04 checklist in
`tasks/phase-2/execution.log.md`. Report back with: what landed per task, the AC-04 checklist location,
`pij-skill-check`/`flow-pair-test`/live-smoke results, and any deferred/uncertain items.
