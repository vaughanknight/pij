# Validation — pij-orchestrator-routing-skill-plan

- **Validated**: 2026-07-12T11:52:44+10:00
- **Target**: `docs/plans/042-pij-orchestrator-routing-skill/pij-orchestrator-routing-skill-plan.md`
- **Frozen SHA-256**: `ff88b0f4ac1094dda8bee80523d167dc9fb8d9f3493b9ba6990cb5dd7690393f` (verified before read and again before verdict — unchanged)
- **Contract sources**: `original-ask.md`, `rulings.md`, `spine.md`, `research-dossier.md`, `workshops/001-orchestrator-landing-and-thesis-proof.md`, and current source (`skills/pij/references/routes/prime.md`, `skills/pij/references/prime/**`, `harness/scripts/pij-skill-check.sh`, `docs/domains/registry.md`, `~/.agents/skills/builder/SKILL.md`, `~/.agents/skills/thesis/`)
- **Checks**: file-existence of all 14 manifest paths · `/builder 8 ship` verb semantics · `/thesis` skill install · `pij-skill-check.sh` `PIJ_SKILL_ROOT` + `prime_required` payload list · registry single-`prime`-row parity · domain registry membership · gate N/A claims (constitution/architecture/adr absent) · current stream-row pointer + worktree-absence in kickoff/brief · `pij spawn --cwd`
- **Verdict**: VALIDATED_WITH_NOTES
- **Thesis / proof**: Purpose met — the plan faithfully encodes the original ask + all nine rulings (route-before-orient module → real `/thesis` → preamble → guided Builder → cold `/validate-v2` → `WAITING_FOR_BUILD_CONFIG` → `/pij pair` with separate reviewer → worktree isolation → `/builder 8 ship` PR landing). Claimed proof level (Contract/Implementation-ready, Hybrid structural + cold acceptance) matches fresh evidence; the L4-telemetry ceiling is handled honestly, not overclaimed.
- **Consumers**: STANDALONE downstream (this is the terminal plan doc; its consumer is the future implementer). All 14 manifest files it touches exist; every named external command (`/builder 8 ship`, `/thesis`, `/pij pair`, `/validate-v2`, `pij spawn --cwd`) resolves against current source.

## Findings

No CRITICAL or HIGH findings. No blocking findings. Notes below are non-blocking.

| Severity | Finding | Evidence | Impact | Status |
|---|---|---|---|---|
| LOW | The "orchestrators must not pop into the o-prime's window" prohibition (original-ask L16; spine R8.2/R8.4 "placement mechanically verified"; dossier F-08 "make topology mechanically checked, not advisory") is covered *behaviorally* — AC-05 ("splits inside the orchestrator window"), the existing isolated-window kickoff (`kickoff.md:19` `--layout window` + canary leg), and T007 "cold topology evidence" — but is **not** an explicit anti-pattern marker in `pij-skill-check`, and the structural ordered-marker list (workshop §"Structural check contract") contains no window/placement marker. So a future prose regression that re-pointed peers into the prime's window would not be caught by the static gate, only by cold acceptance. | `original-ask.md:16`; `spine.md` R8.2/R8.4; `research-dossier.md` F-08; plan AC-05 + coverage row "cold topology evidence"; `pij-skill-check.sh` §1–§8 (no placement assertion) | A stated core requirement leans on cold acceptance rather than deterministic backpressure. | Open (non-blocking) |
| LOW | AC-04 summarizes the peer-config step as "records the user's/default peer profile," but the load-bearing specifics live only upstream: the exact default `gpt-5.6-sol @ xhigh` (spine R3.6; original-ask default `gpt-5.6-sol`) and the **verbatim read-back confirmation** requirement (spine R3.7). T002/workshop build-gate do say "read back and record," so the requirement is not dropped — but the AC prose could let an implementer dilute the exact default/read-back into vague module text. | `spine.md` R3.6/R3.7; `original-ask.md:14-15`; plan AC-04, T002; workshop §"orchestrator.md contract" Build gate | Minor dilution risk; ensure T002 encodes the exact default + verbatim read-back. | Open (non-blocking) |
| LOW | CS assumption states "`pij spawn` inherits the caller's cwd when invoked from the stream worktree." `pij spawn` also exposes an explicit `--cwd <dir>` flag (`docs/how/pij-agents.md:91`) — the stronger, more portable mechanism for putting coder/reviewer in the worktree. The worktree-cwd contract (AC-05) is feasible either way; the ritual (T003) should prefer explicit `--cwd` over relying on implicit inheritance. | plan CS assumptions (line 78); `docs/how/pij-agents.md:91` | None to feasibility; strengthens portability. | Open (non-blocking) |

## Detailed evidence (load-bearing claims verified)

**Thesis fidelity — VALIDATED.** All nine rulings map to ACs/tasks: R1→AC-02, R2→AC-04, R5→AC-05/AC-08, R6→AC-06, R7→AC-10+Goal, R8→AC-07, R9→AC-08; R3/R4 were this-stream process rulings already satisfied (spine + vendored interview present). Original ask's peer-config-at-top and tmux isolation both land (AC-04, AC-05).

**Manifest completeness — VALIDATED.** All 14 Domain-Manifest files verified: 13 already exist on disk (`prime/{orient-oprime,protocol}.md`, `prime/rituals/{kickoff,bootstrap,batons,incidents}.md`, `prime/templates/{stream-brief,spine,orient-local}.md`, `routes/prime.md`, `harness/scripts/pij-skill-check.sh`, `docs/how/pij-prime.md`, `docs/domains/pij-skill/domain.md`); `prime/orchestrator.md` is the one NEW file. Every path named in any task table (T001–T008) appears in the manifest; classifications are consistent. All five Target Domains are registered existing capabilities (`docs/domains/registry.md`; `extension-authoring-harness` is registry.md:9 → `project-rules/harness.md`).

**Feasibility of external commands — VALIDATED.**
- `/builder 8 ship` is real with the exact claimed semantics: "pushed branch + PR + watched CI checks; push & PR-open each behind a confirm, merge optional" (`~/.agents/skills/builder/SKILL.md:45`). AC-08's "confirmed merge" is honest — it defers to the verb's existing confirmations (merge optional/behind PROCEED), matching ruling 9.
- `/thesis` skill is installed (`~/.agents/skills/thesis/SKILL.md`).
- `/pij pair` route exists (`routes/pair.md`) and exposes `--coder-model`/`--reviewer-model` overrides (pair.md:87), so same-model separate-session review (spine R3.8/dossier H-02) is achievable **without** modifying pair.md — the plan correctly keeps flow-pair as consume-only.
- Exactly one `prime` registry row exists (SKILL.md), matching the "no second top-level route" non-goal and the existing check's parity gate.

**TDD ordering & backpressure — VALIDATED.** T001 (extend check first → captured RED against current tree) precedes T002 (module → GREEN); T006 mutation-proves via `PIJ_SKILL_ROOT` (the script honors this env var, `pij-skill-check.sh:8`) with byte-identical originals; T007 cold dogfood; T008 full `harness checks`. The current check already carries the `prime_required` payload list (lines 99–121) and soft-budget pattern the plan extends. The stream row currently loads `orient-global.md` directly (prime.md:20) — the redirect target AC-01/T002 names is accurate. `kickoff.md`/`bootstrap.md`/`stream-brief.md` currently contain **no** worktree language, confirming T003/T004 is genuine, correctly-scoped work rather than a no-op.

**Honest runtime-telemetry handling — VALIDATED (strength).** The plan never claims structural proof establishes runtime `/thesis` invocation: Goal ("without falsely claiming"), Key Finding 04 (separate contract/outcome/runtime), Risk row ("exact result wording: contract/order proven; runtime best-available only"), CS assumption ("L1–L3 shippable even where L4 unavailable"), AC-02/AC-09 (contract/structural) vs AC-10 (cold outcome with "any L4 telemetry absence is stated honestly"). Backed by the workshop D5 POC showing a live control-plane peer has no `events.ndjson`. This is exemplary honest scoping of the proof ceiling.

**Reuse-vs-rebuild boundary — VALIDATED.** Non-Goals forbid new spawn/tmux/worktree/baton/pair/Builder/ship/merge engines; worktree creation uses standard git in-ritual (no new CLI); pij-control-plane / pij-orchestration / flow-pair are all consume-only. Gate N/A claims are accurate — `docs/project-rules/constitution.md`, `docs/project-rules/architecture.md`, and `docs/adr/` do not exist.

**Acceptance coverage — VALIDATED.** All 11 ACs map to tasks and all tasks T001–T008 are referenced; cross-refs resolve. ACs are structural + cold-acceptance shaped and satisfiable (AC-10's "thesis outcome" is satisfiable via the L3 durable preamble checkpoint even where L4 is unobservable).

## Required fixes

None. No blocking finding was identified; the plan may proceed.

## Non-blocking notes

The three LOW findings above are optional hardening, not gates:
1. Consider adding a placement/anti-"prime's window" marker to `pij-skill-check` so the tmux-isolation requirement (original ask + spine R8) has deterministic backpressure, not only cold-acceptance coverage.
2. Ensure T002 encodes the exact `gpt-5.6-sol @ xhigh` default and the verbatim read-back (spine R3.6/R3.7) so AC-04's summary prose isn't diluted.
3. Prefer explicit `pij spawn --cwd <worktree>` over implicit cwd inheritance in the T003 ritual.

## Retrospective

The plan is unusually well-grounded: every green is a claim I could pin to current source, and every one held. The strongest signal is the honest, POC-backed treatment of the L4 `/thesis`-telemetry ceiling — the plan refuses to let a structural gate masquerade as runtime proof, which is precisely the failure mode this feature exists to prevent. The only soft spot is that the emphatically-stated tmux-isolation requirement rests on cold acceptance + reused control-plane probes rather than a static marker; that is a defensible scoping choice given F-08's existing mechanical checks, but noting it lets the author decide deliberately. Verdict: VALIDATED_WITH_NOTES — 0 critical, 0 high, 0 medium, 3 low (all non-blocking).
