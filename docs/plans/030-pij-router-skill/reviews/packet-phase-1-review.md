# Review Packet — Plan 030 Phase 1: /pij router skill (skeleton + light routes)

**Role**: cross-model REVIEWER. Review Phase 1 of plan 030 against its plan + dossier. The deliverable is a **markdown skill + a check script + recipes + domain docs** — review it like code: claims must be true against the repo, gates must actually guard.

## Ground truth (read in this order)

1. `docs/plans/030-pij-router-skill/pij-router-skill-plan.md` — §Acceptance Criteria (AC-01..09; AC-04/05/09 are Phase-2, skip), §Phase 1 table, §Key Findings.
2. `docs/plans/030-pij-router-skill/tasks/phase-1-router-skeleton-light-routes/tasks.md` + `execution.log.md` (what was built + claimed evidence, incl. the live dogfood record).
3. The deliverable: `skills/pij/SKILL.md`, `skills/pij/references/00-routing.md`, `skills/pij/references/routes/{peer,agent,ops}.md`, `harness/scripts/pij-skill-check.sh`, `justfile` (recipes `pij-skill-check|link|install`), `docs/domains/pij-skill/domain.md`, `docs/domains/registry.md` + `domain-map.md` (new rows/edges only).

## Mandatory checks

1. **Gate is real (Dim-0 for a check script) — TWO mutations, record then revert byte-identical (`git checkout -- <file>`):**
   a. Append the line `see routes/peer.md` to `skills/pij/references/routes/agent.md` → `just pij-skill-check` must go RED (sibling-blind). Revert → GREEN.
   b. Delete the `` `compact-self` `models` `` row from SKILL.md's CLI-verb coverage table → check must go RED (verb coverage). Revert → GREEN.
   If either mutation stays green, that is a HIGH finding (decorative gate).
2. **Engine untouched (AC-06)**: `just flow-pair-test` green AND `git diff --stat skills/flow-pair/` shows only prompt-lab candidate churn or nothing (pre-existing dirt listed below).
3. **Content accuracy (sample ≥4 claims against reality)**: e.g. `pij adopt "$TMUX_PANE" --harness claude` syntax vs `pij --help`; `pij agent spawn --once` + report round-trip claims vs `.pi/extensions/pij/cli.ts` AGENT_USAGE; detection probe A's `open|closed` enum vs `skills/flow-pair/schemas/run.schema.json`; § C5 split-cap main+2 vs `core/spawn.ts planControlSplit`. Wrong claims in a skill = agents mislead forever — treat as HIGH.
4. **AC-08**: skill≠CLI disambiguation is the FIRST thing after the title in SKILL.md.
5. **Deployment truth**: `~/.claude/skills/pij` resolves; `diff -rq skills/pij ~/.agents/skills/pij` clean (store copy in sync).
6. **Budgets/parity**: covered by the check run — confirm exit 0 yourself, don't trust the log.

## Diff hygiene — pre-existing dirt, NOT this phase's

`.fs2/config.yaml`, `.pi/packages.yaml`, plans 025/027/029 files, `docs/retros/package-vetter.md`, `skills/flow-pair/prompt-lab/**` candidate churn, `AGENTS.md` (untouched but has a known stale-skill reference). Phase-1 books (`tasks.md`, `execution.log.md`, plan edits, validations/) are orchestrator-written — verify consistency, don't count as scope creep.

## Verdict — reply format

Single JSON via literal command from your pane (do NOT write any file):

```
pij send pij-z4bt25 '{"reviewOf":"plan-030-phase-1","verdict":"APPROVE|APPROVE_WITH_NOTES|FIX_REQUIRED","findings":[{"severity":"HIGH|MEDIUM|LOW","file":"...","claim":"...","evidence":"...","fix":"..."}],"mutationEvidence":[{"mutation":"a|b","red":"what failed","greenAfterRevert":true}],"checks":{"pijSkillCheck":0,"flowPairTest":"148/148"}}'
```

**Forbidden paths**: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `.flow-pair/**`, `docs/plans/030-pij-router-skill/reviews/**` (orchestrator persists your verdict), `skills/pij/**` (report, don't fix). Do not restart the daemon. Do not spawn peers.
