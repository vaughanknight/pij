# Research Dossier: o-prime routing skill — current-state surface for plan 035

**Generated**: 2026-07-11T05:45:00Z
**Query**: "What does the pij repo already provide (skill mechanics, CLI/daemon state, tooling precedents, institutional memory) for implementing the o-prime concept per the converged requirements spine — and what must be vendored, workshopped, or sequenced before build?"
**Effort**: Standard
**Tools**: Standard
**Evidence**: 11 current sources · 5 historical sources

## Answer

- The skill substrate is ready-made: `skills/pij/` already implements exactly the progressive-disclosure contract R1 requires (dispatch registry + sibling-blind route modules + lazily-cited shared conventions), with a mechanical parity gate (`just pij-skill-check`) and live symlink deployment — adding the `prime` row + `references/prime/` payload extends a proven pattern rather than inventing one.
- The builder skill ships `flight-plan.schema.json` inside its own references and supplies it via `--schema` — the exact mechanism R8.3 needs for the prime-flow schema; no new distribution machinery required.
- Of the four SHIP-035 P-gaps: **P-04 is already fixed** (FX002, complete with regressions, sitting uncommitted); **P-03 is half-shipped** (plan 032's `queued|delivered|unverified` receipt vocabulary + FX002's honest unverified; missing: daemon-liveness signal in receipts to distinguish wedged daemon from busy peer); **P-02 is half-shipped** (spawn passes `--model` + env; `boundModel` is captured post-first-inference by the fail-loud layer, so canary leg (b) is already a registry read for model; missing: effort pinning/reporting — no effort field exists on the descriptor); **P-01 is entirely open** (no `dissolved` state anywhere; lifecycle has only the fail-loud `failureReason` vocabulary).
- The biggest sequencing hazard is local: plan 019 is mid-build (`build-f`) with ~1,850 uncommitted lines across `daemon.ts`, `cli.ts`, and core — the same files P-01/P-02/P-03 must touch. 035's implementation must sequence behind (or explicitly fence against) 019's landing — the exact collision class the o-prime concept exists to manage.
- Vendoring (R8.5) is ~1k lines of source material across 10 SecondCrack files; nothing in this repo currently mirrors any of it, and the convergence record (briefing/answers/validation) exists only in the doomed repo — vendor early, not at ship.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Skill dispatch contract already matches R1: registry table, "load exactly one route module per step", sibling-blind modules, § C-conventions cited not restated | `skills/pij/SKILL.md:17`, `references/routes/peer.md:3` | `prime` route is an additive registry row + module; no dispatch redesign | High |
| F-02 | Mechanical skill gate exists: registry↔module parity + shim spot-grep, wired as a just recipe | `justfile:163` → `harness/scripts/pij-skill-check.sh`; plan 030 AC-01 | Extend the same check to `references/prime/**` payload presence (AC-0 depends on files existing) | High |
| F-03 | Deployment is a live symlink chain (`~/.claude-alt/skills/pij → ~/.agents/skills/pij → repo skills/pij`); `just pij-skill-link/install` recipes exist | `justfile:168,178`; verified live this session | Skill edits are live instantly; AC-0's cold agent gets the payload with the skill — no install step to design | High |
| F-04 | Precedent for shipping a flow schema inside skill references and passing it via `--schema` | `~/.claude-alt/skills/builder/references/flight-plan.schema.json` (present); builder SKILL.md § Prerequisite ("schema ships with this skill… supplied via `--schema`") | R8.3 implementation = copy the pattern for `prime-flow.schema.json` | High |
| F-05 | P-01 open: zero `dissolved` occurrences in extension TS; descriptor lifecycle vocabulary is fail-loud only (`model-not-supported\|auth\|quota\|stalled\|dead\|unknown`) | grep over `.pi/extensions/pij/**/*.ts`; `core/types.ts:115` | P-01 is new state-model + close-path work, not a patch | High |
| F-06 | P-02 half-shipped: spawn emits `--model` + `PIJ_SPAWN_MODEL`; effort exists only as pi's `model:effort` suffix; `boundModel` captured from pane footer after first inference (fail-loud layer) | `core/spawn.ts:74-98`; `core/types.ts:109-113` | Model half of canary leg (b) is already a registry read; the 035 work is effort pinning + surfacing both in spawn output/`pij list` | High |
| F-07 | P-03 half-shipped: `ReceiptState = queued\|delivered\|unverified` + receipt event kind that can never re-inject | `core/types.ts:201-208,189-192` (plan 032 AC-13) | Remaining gap is daemon-liveness ("is the daemon ticking?") in send receipts — the INC-001 discriminator | High |
| F-08 | Only "heartbeat" today is the per-bound-session pane-content heartbeat (working/idle detection); no daemon-tick liveness signal surfaces to senders | `daemon.ts:62,166` | P-03's remaining half has a natural home: receipts/`pij state` reading a daemon tick timestamp | Medium |
| F-09 | P-04 fixed: FX002 non-throwing send boundary + per-session tick isolation, with adapter/daemon regression tests + full-suite pass — but uncommitted | `docs/fixes/FX002-stale-pane-daemon-head-of-line-blocking.md` (Status: Complete); `git status` untracked/modified set | 035's P-04 scope = commit/verify/close; regression names already exist | High |
| F-10 | Plan 019 mid-build at `build-f` with ~1,850 uncommitted lines across `daemon.ts`, `cli.ts`, adapters, core | `docs/plans/019-pij-tmux-control-plane/the-flow.json` nav; `git diff --stat` | P-01/02/03 touch the same files — sequence 035 implementation behind 019's landing or fence explicitly | High |
| F-11 | `pij-skill` domain owns `skills/pij/**` (plan 030 domain sketch); control-plane/messaging domains own the extension surfaces | `docs/plans/030-pij-router-skill/pij-router-skill-plan.md` § Target Domains; `docs/domains/` | 035 spans two domains: skill text (pij-skill) + CLI/daemon fixes (pij-control-plane/messaging) — plan phases should split along that seam | Medium |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 030 built this exact skill shape: registry/module parity AC, sibling-blind rule, store-reconcile-before-port, deprecation shims | `docs/plans/030-pij-router-skill/pij-router-skill-plan.md` | Direct | Reuse its ACs and phase split as the template for adding the `prime` route |
| H-02 | Plan 032 shipped honest send receipts (`queued/delivered/unverified`) — P-03's foundation | `docs/plans/032-pij-honest-send-receipts/` | Direct | P-03 work extends 032's contract; read its plan before designing the daemon-liveness addition |
| H-03 | FX001 (duplicate injection, settle-poll + clear-before-retype) and FX002 (head-of-line blocking) — the send path's two live-incident hardenings | `docs/fixes/FX001-*.md`, `docs/fixes/FX002-*.md` | Direct | Send-path changes for P-03 must preserve both fixes' invariants (FX002's regressions name them) |
| H-04 | Plan 025 dealt with effort discovery + quota — prior art for how effort levels flow per harness | `docs/plans/025-pij-effort-discovery-quota-fix/` | Partial | Read at plan time for P-02's effort-pinning design; harness effort semantics differ per harness |
| H-05 | Run-01 government (SecondCrack) is the entire domain source and convergence record — and Jordan ruled the repo unavailable post-035 | spine `requirements-spine.md` header ruling + R8.5 | Direct | Vendor the enumerated set (~1k lines: levers, schema, bootstrap, runbook, encode-candidates, briefing, answers r1+r2, validation record, worked-example excerpts) EARLY — it is the receipts substrate for all later phases |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| 019/035 file collision | F-10 | P-fixes edit files 019 is actively changing; merge pain or silent overwrite | Sequencing decision at plan time: land 019 first (it's at build-f of ~8 groups) or fence 035's phase order (skill text first, CLI fixes after 019 ships) |
| Effort semantics per harness unverified | F-06; H-04 | P-02 must pin effort on claude/copilot/codex, not just pi's suffix trick | Plan-time read of `core/harness/*.ts` + plan 025; may narrow P-02 scope to "report what was requested + what bound" |
| Daemon-liveness signal shape undecided | F-08 | P-03's remaining half could be a receipt field, a `pij state` row, or a staleness warning at send time | Small design decision — candidate workshop topic or a plan-stage decision with 032's plan as input |
| Vendored distillation fidelity | R8.5; H-05 | Bootstrap/runbook must be *distilled* into ritual rungs, not pasted — fidelity loss is the E-16-class risk for the route text | o-prime's standing route-text review (R1.2 fidelity) is the check; schedule it at draft |
| AC-0 validation logistics | AC-0.2 needs a neutral repo | Cold-agent run needs a scratch repo + a human to name work + freeze/hash guard (R5.4) | Design the validation run as its own plan phase with its own checklist |

## Planning Handoff

- **Preserve**: the dispatch contract (one module per step, sibling-blind, § C-citations); `pij-skill-check` parity gate green; FX001/FX002 send-path invariants and their regression tests; plan 032's receipt vocabulary as the P-03 base; the symlink deploy chain.
- **Change carefully**: `daemon.ts` / `cli.ts` / `core/types.ts` (019 mid-build overlap — sequence or fence); `SKILL.md` registry + CLI-verb coverage table (parity check must stay green); descriptor schema changes must stay additive/migration-safe (the codebase's existing convention, `core/types.ts:109` comment).
- **Likely files/symbols**: `skills/pij/SKILL.md` (registry row), `skills/pij/references/routes/prime.md` (new), `skills/pij/references/prime/**` (vendored payload: orient-oprime.md, orient-global.md, prime-flow.schema.json, ritual pages distilled from bootstrap/kickoff-runbook, provenance/encode-candidates + convergence records), `harness/scripts/pij-skill-check.sh` (extend), `.pi/extensions/pij/core/types.ts` (+`dissolved`, +effort field), `core/spawn.ts` + `cli.ts` (P-02 surfacing), `daemon.ts` + receipts path (P-03 liveness), `docs/how/` (rewritten protocol reference per R10).
- **Decisions still required**:
  1. **Workshops** — two candidates, both legitimate pre-flow per E-14/R8.6: ① *route-text architecture* (rung-file layout under `references/prime/`, what the one `prime` module says vs points at, how ritual pages split — directly feeds R1.2 fidelity and the o-prime's review); ② *P-03 liveness signal shape* (small; could instead be a plan-stage decision). No workshop needed for P-01/P-02 (mechanical) or vendoring (enumerated by R8.5).
  2. **Vendoring timing** — recommend vendoring the R8.5 set as the first act of implementation (phase 0 or pre-phase), since every later phase cites it and the source repo's availability is bounded.
  3. **019 sequencing** — land-first vs fence (above).
  4. **P-02 scope cut** — pin+report vs report-only, pending harness effort-semantics read.

## External Research

_None material — the domain source is a live peer with receipts, and the repo answers the rest._
