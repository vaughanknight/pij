# Research Dossier: Copilot GPT-5.6 effort levels

**Generated**: 2026-07-12T20:54:47Z
**Query**: "Correct `pij models` and effort validation for Copilot `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`: exactly `none, low, medium, high, xhigh, max`; exclude `minimal`; preserve every other model."
**Effort**: Quick
**Tools**: Standard
**Evidence**: 9 current sources · 3 historical sources

## Answer

1. Pi's live `github-copilot` source map is incomplete for all three ids: it maps only `minimal→low`, `xhigh→xhigh`, and `max→max`. Pij faithfully converts non-null map keys to levels, so the current wrong advertisement is expected rather than a display bug.
2. A model-specific correction belongs in `registry.ts`, constrained by provider=`github-copilot` plus the exact three ids. That single source boundary corrects both raw Pi rows and their `copilotSeedFromPi()` clones while leaving all other providers/models source-derived.
3. `copilotSnapshot()` must carry the same curated trio levels so behavior remains correct when Pi's registry is missing or has not learned the ids yet; the aliases remain honestly `verified:false`.
4. No validator algorithm or harness effort translation needs to change. `validateEffort()` and every spawn/agent surface already consume `ModelEntry.levels`; changing the entries makes `minimal` unsupported and the six ruled levels supported everywhere.
5. "Unsupported" must retain the shipped warn-don't-block contract: pij's validator rejects `minimal` as a supported model capability and emits a warning, but spawn still proceeds and passes the user value to Copilot.
6. The duplicate `github-copilot` + `copilot` rows are existing composition/filter behavior and explicitly out of scope. Tests should prove both rows expose the corrected levels, not alter row cardinality.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Pi currently supplies the same incomplete map for Sol/Terra/Luna: `{minimal:"low",xhigh:"xhigh",max:"max"}` | `~/.pi/agent/models.json#providers.github-copilot.models[gpt-5.6-*].thinkingLevelMap`; live `jq` probe 2026-07-12 | A generic "trust Pi" read cannot satisfy the human ruling; a narrow curated override is required | High |
| F-02 | Pij defines levels as every non-null `thinkingLevelMap` key and applies that rule to both `models[]` and `modelOverrides` | `.pi/extensions/pij/core/models/registry.ts:54-62,72-108` | Add a provider/id-aware level resolver at this boundary; keep `levelsFromThinkingMap()` as the default | High |
| F-03 | `loadModels()` returns raw Pi rows before Copilot seed clones, and `validateEffort()` uses the first exact id match | `.pi/extensions/pij/core/models/registry.ts:250-267`; `.pi/extensions/pij/core/models/validate.ts:45-57` | Correcting only `copilotSeedFromPi()` would leave spawn validation reading the wrong raw `github-copilot` row | High |
| F-04 | The Copilot filter deliberately includes both provider labels, and table/JSON output renders each entry's levels unchanged | `.pi/extensions/pij/core/cli.ts:460-475,572-610`; live `just pij models --harness copilot --json` probe | Preserve duplicate-row behavior; prove both existing projections carry identical corrected levels | High |
| F-05 | The Copilot fallback snapshot contains the trio but marks them non-reasoning with empty levels | `.pi/extensions/pij/core/models/registry.ts:197-215` | Give only these aliases the ruled levels so offline/missing-Pi behavior remains accurate without claiming verification | High |
| F-06 | Copilot's CLI accepts the generic superset `none,minimal,low,medium,high,xhigh,max` | `copilot --help`, `--effort/--reasoning-effort` output, 2026-07-12 | Pij must enforce the narrower model-specific subset from Jordan's ruling; generic CLI help is not model capability truth | High |
| F-07 | Effort validation and warning composition are already centralized and warn-don't-block | `.pi/extensions/pij/core/models/validate.ts:30-57`; `.pi/extensions/pij/core/spawn.ts:773-790`; `.pi/extensions/pij/cli.ts:483-489,1659-1672,1878-1883` | Registry correction reaches peer spawn, agent run, and agent spawn with no duplicated validator branches | High |
| F-08 | Existing tests prove only generic map extraction, generic supported/unsupported validation, and generic warning text | `.pi/extensions/pij/core/models/registry.test.ts:186-241`; `.pi/extensions/pij/core/models/validate.test.ts:58-97`; `.pi/extensions/pij/core/spawn.test.ts:711-734`; `.pi/extensions/pij/core/models/cli-models.test.ts:133-167` | Add model-specific pincer tests for all three ids, `minimal`, all six allowed levels, non-Copilot preservation, and both advertised row labels | High |
| F-09 | The touched capability belongs to the existing `pij-control-plane` domain and its pure-core/testing contract | `docs/domains/registry.md:15`; `docs/domains/pij-control-plane/domain.md#Purpose`; `docs/domains/domain-map.md:98-100` | Modify the existing domain only; no ADR or new domain is warranted | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Plan 025 established that model levels are first-class, source-backed, surfaced in `pij models`, and consumed by warn-don't-block effort validation | `docs/plans/025-pij-effort-discovery-quota-fix/pij-effort-discovery-quota-fix-plan.md:11-18,50-55,159-177` | Direct | Extend the existing level pipeline; do not add a second validation system |
| H-02 | Plan 025 validation confirmed the registry/validator/spawn/CLI surfaces and preserved harness-specific translation | `docs/plans/025-pij-effort-discovery-quota-fix/validations/pij-effort-discovery-quota-fix-plan-validation.md:15-19` | Direct | The correction can remain registry-centered with mutation-proof consumer tests |
| H-03 | The later model-discovery fix added the trio as Copilot aliases and documented verified seed precedence | `git d03bac3`; `docs/how/pij-models-discovery.md:10-21,53-56` | Direct | Preserve seed-over-snapshot precedence while making both paths agree on curated model-specific levels |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| A global id-only override would also change a same-named model under another provider | F-02 | Violates the explicit "preserve every other provider/model" constraint | Key the override on `provider === "github-copilot"` and exact id membership; add a non-Copilot same-id preservation test |
| Correcting only the Copilot clone or snapshot leaves the first raw row wrong | F-03, F-04 | Validation and one advertised row would still contradict the ruling | Test raw parse, seed clone, snapshot, and injected duplicate CLI rows |
| "Not accepted" could be misread as hard-rejecting spawn | F-07, H-01 | Hard rejection would break a shipped control-plane invariant | Specify unsupported-at-validation + warning while spawn continues |
| The upstream Pi map may later become accurate | F-01 | The curated override could become redundant but remains behaviorally correct | Keep the override isolated, named, and exact-id scoped so later removal is obvious |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-control-plane` | modify existing | Pure model registry supplies the level contract consumed by CLI discovery and warn-don't-block validation | F-02, F-07, F-09 |
| Pi model registry | external source with curated correction | Source-derived by default; exact Copilot trio is overridden by explicit human model-capability knowledge | F-01, F-06 |

## Planning Handoff

- **Preserve**: source-derived non-null map keys for every model outside the exact Copilot trio; Codex's separate curated table; verified seed precedence; duplicate provider-row cardinality; warn-don't-block spawn/agent behavior; pi-free core.
- **Change carefully**: one provider/id-aware resolver in `registry.ts` must feed raw Pi rows, Copilot seed clones, and snapshot aliases consistently without making `minimal` a global policy.
- **Likely files/symbols**: `.pi/extensions/pij/core/models/registry.ts` (`levelsFromThinkingMap`, `parseModelsJson`, `copilotEntry`); `registry.test.ts`; `validate.test.ts`; `spawn.test.ts`; `cli-models.test.ts`; `docs/how/pij-models-discovery.md`; `docs/domains/pij-control-plane/domain.md`.
- **Decisions still required**: none for behavior; plan the smallest mutation-resistant test matrix and exact documentation/domain updates.
