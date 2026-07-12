# Validation r2 — pij-orchestrator-routing-skill-plan

- **Validated**: 2026-07-12T12:20:00+10:00
- **Validator**: cold independent plan validator (round 2, new session — did not inherit the r1 verdict)
- **Target**: `docs/plans/042-pij-orchestrator-routing-skill/pij-orchestrator-routing-skill-plan.md`
- **Frozen SHA-256**: `9c67fc967788e2bbbe8b3f8e731d62e0623e57da07d866a5234786d8f177f86a` (verified before read **and** again before verdict — unchanged; no `TARGET_MUTATED`)
- **Plan version judged**: 1.0.1 (READY, Simple mode)
- **Prior artifacts consulted**: r1 validation (`…-plan-validation.md`, SHA `ff88b0f4…`), author adjudication (`author-verification-r1.md`)
- **Contract sources**: `original-ask.md`, `rulings.md`, `spine.md`, `research-dossier.md`, `workshops/001-orchestrator-landing-and-thesis-proof.md`, and current source (`skills/pij/references/routes/prime.md`, `skills/pij/references/prime/**`, `harness/scripts/pij-skill-check.sh`, `.pi/extensions/pij/core/spawn.ts`, `.pi/extensions/pij/cli.ts`, `docs/how/pij-agents.md`, `docs/domains/registry.md`, `~/.agents/skills/{builder,thesis}/SKILL.md`, `skills/pij/references/routes/pair.md`)

## Verdict

**VALIDATED_WITH_NOTES** — 0 critical, 0 high, 0 medium, 0 blocking. Notes below are optional hardening, not gates.

> Note on authority: this report reflects the cold validator only. It does **not** assert human or o-prime sign-off; ruling 7's live dogfood acceptance remains the human/o-prime's to grant.

## Thesis / proof

Purpose met. The plan faithfully encodes the original ask (wishlist §2) and all nine 2026‑07‑12 rulings into a single cohesive `pij-skill` change: a module-first stream-orchestrator landing that fires **before** orient, demands a real host `/thesis`, guides preamble → guided Builder → cold `/validate-v2`, stops at `WAITING_FOR_BUILD_CONFIG`, delegates via `/pij pair` (named coder + separate reviewer inside the orchestrator window and stream worktree), reports continuously to the o-prime, and lands through `/builder 8 ship` + PR. The claimed proof level (Contract/Implementation-ready; Hybrid structural + cold acceptance) matches fresh evidence, and the L4 runtime-telemetry ceiling is scoped honestly rather than overclaimed. Locally-correct AND purpose-advancing — the thesis holds.

## Consumers

STANDALONE downstream — this is the terminal plan doc; its consumer is the future implementer. All 14 manifest paths resolve (13 exist, `prime/orchestrator.md` is the one NEW file), and every named external command (`/builder 8 ship`, `/thesis`, `/pij pair`, `/validate-v2`) plus the `pij spawn` cwd contract resolves against current source.

## Independent verification of the author adjudication (`--cwd` rejection)

The contract required me to independently confirm the author's rejection of r1's LOW note #3 (which had recommended preferring an explicit `pij spawn --cwd`). **The author adjudication is correct — I verified it against source, not by inheriting it:**

- **`pij spawn` has no `--cwd` and rejects unknown flags.** `parseSpawnArgs()` (`.pi/extensions/pij/core/spawn.ts:524-572`) accepts only `--harness`, `--task`, `--model`, `--effort`, `--layout`, `--branch`, `--json`; any other `--<key>` returns `err("E-ARG", "unknown flag --${key} for spawn")` (spawn.ts:562-563). So `pij spawn --cwd …` would be **rejected**, not honoured.
- **`pij spawn` derives cwd from `process.cwd()`.** Both spawn paths set cwd from the caller's process: the pi path `const cwdPi = process.cwd()` → `tmux.newWindow/splitWindow({ cwd: cwdPi })` (cli.ts:510, 545, 553); the control-plane path (copilot/claude/codex — the default fleet harness) `const cwd = process.cwd()` → `tmux.newWindow/splitWindow({ cwd })` (cli.ts:590, 698, 706). Invoking peer spawn from the worktree therefore places panes in the worktree cwd.
- **`--cwd` is a *different* surface.** `--cwd <dir>` is documented only for `pij agent run/spawn` — the minih agent-pack runner (`AGENT_USAGE` in cli.ts:1479 "`--cwd <dir>  run cwd`"; `docs/how/pij-agents.md:91` under the `pij agent` overrides table). r1 conflated `pij agent --cwd` with peer `pij spawn`.

Plan v1.0.1 encodes this current contract correctly and defensively in **T003**: "Peer `pij spawn` must be invoked from the worktree because its current contract derives pane cwd from `process.cwd()`; do not document the unrelated `pij agent --cwd` flag as a peer-spawn option." This is accurate and is the right instruction. The r1 rejection stands.

## The two accepted r1 notes both landed

- **Static anti-"prime's window" backpressure (r1 note #1, accepted).** Now an explicit assertion in **T001** ("an explicit anti-'prime's window' marker"). This is not merely defensible — it directly satisfies dossier **F-08** ("all four fleets used an orchestrator-owned window with worker/reviewer splits; the o-prime window remained isolated → **make topology mechanically checked, not advisory**", `research-dossier.md:28`) and spine **R8.2/R8.4** (`spine.md:116,118`). The requirement previously leaned on cold acceptance alone; it now has deterministic backpressure.
- **Exact default profile + verbatim read-back (r1 note #2, accepted).** Now pinned in **AC-04** ("reads back the exact default—separate Copilot `gpt-5.6-sol` coder and reviewer peers at `xhigh`—verbatim"), **T001** ("exact default-profile markers"), and **T002** ("exact default `gpt-5.6-sol @ xhigh` separate peers with verbatim read-back"). Matches spine **R3.6/R3.7** (`spine.md:64-65`) and the original ask's `gpt-5.6-sol` default. The prior dilution risk is closed.

## Detailed evidence (load-bearing claims re-proved this round)

- **Nine rulings → ACs/tasks, all mapped.** R1→AC-02 (real `/thesis` after orient, before preamble/Builder; rejects a memory answer); R2→AC-04/Goals (guided Builder); R3→spine + Mermaid journey/anti-journey present (`spine.md:173-238`); R4→interview vendored (`research/vendored/s042-interview-uec99o-response.md`, cited in spine:14); R5→AC-04 (`WAITING_FOR_BUILD_CONFIG`) + AC-05 (named coder + separate reviewer); R6→AC-06 (event-driven o-prime reports); R7→AC-10 + Goal + Clarifications "Dogfood" row (s042 self-dogfood); R8→AC-07 (worktree/branch primary; staging/apply-windows/commit-slots fallback-only); R9→AC-08 (`/builder 8 ship` push→PR→watched CI→confirmed merge). R3/R4 are this-stream process rulings, satisfied in-stream.
- **Manifest completeness.** 14/14 paths present in the Domain Manifest; 13 exist on disk, `skills/pij/references/prime/orchestrator.md` is the single NEW file. Every task path (T001–T008) appears in the manifest; classifications consistent. All 5 Target Domains are registered (`docs/domains/registry.md`; `extension-authoring-harness` = existing capability → `project-rules/harness.md`).
- **Module-first routing is genuine work.** The current stream row points directly at `orient-global.md` (`routes/prime.md:20`), so AC‑01/T002's redirect to a `prime/orchestrator.md` module that loads *before* orient is real, not a no-op. `pij-skill-check.sh` enforces exactly one active `prime` row → `references/routes/prime.md` (lines 16-27), matching the "no second registry row" non-goal.
- **Structural gate is extendable as claimed.** `pij-skill-check.sh` honours `PIJ_SKILL_ROOT` (line 8) and owns the `prime_required` payload list (lines 99-114) + `soft_budget` pattern (lines 80-84) the plan extends. T001 (extend check → captured RED) precedes T002 (module → GREEN); T006 mutation-proves via `PIJ_SKILL_ROOT` with byte-identical originals; T007 cold dogfood; T008 full `harness checks`. TDD ordering correct.
- **External commands feasible.** `/builder 8 ship` = "pushed branch + PR + watched CI checks; push & PR-open each behind a confirm, merge optional" (`builder/SKILL.md:45`, confirmations at :90) — AC-08's "confirmed merge" honestly defers to the verb's own confirmations, matching ruling 9. `/thesis` installed (`~/.agents/skills/thesis/SKILL.md`). `/pij pair` exists with `--coder-model`/`--reviewer-model` overrides (`pair.md:87,145`) and a separate cross-model reviewer, so the same-model `gpt-5.6-sol` coder+reviewer profile is realizable via overrides with **no** engine change — flow-pair stays consume-only.
- **Honest thesis-telemetry ceiling.** Workshop defines L1 module contract (real `/thesis` + "never synthesize a thesis-shaped answer from memory"), L2 structural, L3 durable preamble checkpoint, L4 "best available; never fabricated" (workshop:122-125,129), backed by the D5 POC showing a live copilot control-plane peer has **no** `events.ndjson` (workshop:139-142). The plan mirrors this across Goal, Key Finding 04, the Risk row, the CS assumption, and AC-02/AC-09 (contract/structural) vs AC-10 (cold outcome, "any L4 telemetry absence is stated honestly"). Exemplary scoping of the exact failure mode this feature exists to prevent.
- **Worktree construction + reuse boundary.** Non-Goals forbid new spawn/tmux/worktree/baton/pair/Builder/ship/merge engines; worktree creation uses standard git in-ritual (Risk row acknowledges the missing CLI verb); pij-control-plane / pij-orchestration / flow-pair are consume-only. Grounded by dossier F-03/F-09 (shared-tree defects concentrated in orchestrator-authored packaging; a bare shared-index commit swept 24 sibling-staged files). Gate N/A claims accurate — `docs/project-rules/constitution.md`, `docs/project-rules/architecture.md`, `docs/adr/` do not exist.
- **AC satisfiability.** All 11 ACs map to tasks and all T001–T008 are referenced; cross-refs resolve. AC-10's "thesis outcome" is satisfiable via the L3 durable preamble checkpoint even where L4 telemetry is unobservable.

## Required fixes

None. No blocking finding. The plan may proceed to the wait-for-build-config gate.

## Non-blocking notes

1. **Mutation-proof coverage lags the two new markers (LOW, coherence).** The author added the anti-"prime's window" and exact-default-profile assertions to the structural gate (T001), but the enumerated mutation matrix in **AC-09** and **T006** still lists only four mutations (remove module pointer · reorder `/thesis` · add a second route row · remove worktree/ship markers). The two newly-added markers are therefore *asserted* in the baseline gate (proven GREEN via T002/T008) but not *mutation-proven* to actually fail on regression. Optional hardening: extend the T006/AC-09 mutation set to include a "peers → prime's window" and a "wrong default profile" mutation so the new backpressure is falsification-tested, matching F-08's "mechanically checked" intent. Non-blocking — the markers still run in every gate pass.
2. **Same-model override is implicit (informational).** `/pij pair`'s built-in defaults are cross-model (`claude-sonnet-4.6` coder / `gpt-5.5` reviewer, `pair.md:92-93`); the plan's default profile is same-model `gpt-5.6-sol` for both. T002/T003 must pass `--coder-model`/`--reviewer-model` overrides to realize it. This is within task scope and needs no plan change — noted only so the implementer doesn't assume pair's defaults already match.

## Retrospective

Round 2 re-derived every green from current source rather than trusting r1, and the plan held on every load-bearing claim. The single item the contract flagged for independent scrutiny — the author's `--cwd` rejection — is correct: `parseSpawnArgs` demonstrably rejects unknown flags and `runSpawn` derives cwd from `process.cwd()` on both spawn paths, while `--cwd` lives only on the distinct `pij agent` runner. The author's r1 handling was disciplined: two valid notes folded in with citations, one invalid note corrected with source evidence and then *converted into a defensive instruction* (T003's explicit "do not document `pij agent --cwd` as a peer-spawn option"), which pre-empts the exact confusion that produced it. The strongest signal remains the honest, POC-backed L4 ceiling. The only residual soft spot is that the two freshly-added structural markers aren't yet in the enumerated mutation matrix — deterministic backpressure now exists, but its falsification test is optional and unwritten. Verdict: **VALIDATED_WITH_NOTES** — 0 critical, 0 high, 0 medium, 2 non-blocking notes.
