# Research Dossier: portable Pi models catalog

**Generated**: 2026-07-12
**Query**: "Make the portable parts of `~/.pi/agent/models.json` repo-managed and installed by pij; keep auth and skills out; exclude the machine-specific local provider."
**Effort**: Standard (lead trace of bootstrap, model consumers, tests, docs, and prior plans)
**Tools**: Standard
**Evidence**: 9 current sources · 2 historical sources

## Answer

1. The repository already owns a global-config synchronization pattern, but `just install` and `just update-pi` copy only `.pi/APPEND_SYSTEM.md` and `.pi/mcp.json`; no repo `models.json` exists, despite both commands claiming to restore pij’s global Pi state.
2. The portable catalog is an exact three-provider manifest: `github-copilot` (2 overrides + 5 custom models), `sakana` (2 models), and `openrouter` (4 models). The fourth `local` provider is host-specific (`192.168.1.134`) and is excluded by human ruling.
3. A plain file copy would satisfy fresh install but would erase any machine-local provider on every refresh. The safe contract is a managed-provider merge: replace the three repo-owned provider keys atomically while preserving all other global provider keys, including `local`; never read, copy, or mutate `auth.json`.
4. Model portability affects pij as well as Pi: `loadModels()` reads only `~/.pi/agent/models.json`, and its verified Pi/Copilot entries override unverified snapshots used by `pij models`, spawn validation, and effort discovery.
5. The smallest deterministic surface is a versioned `.pi/models.json`, one tested synchronization script with pure merge logic plus atomic persistence, a `just sync-models` recipe called by both bootstrap paths, and documentation updates. Broad `pi-doctor`, settings, auth, skills, and runtime-state work remains outside this item.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Fresh install syncs only APPEND_SYSTEM + MCP before linking/extensions/packages | `justfile:20-66` | Add models at the existing global-config seam, not a new bootstrap phase | High |
| F-02 | Refresh repeats the same two-file sync and then updates packages | `justfile:306-344` | `update-pi` must invoke the same models sync helper as `install` | High |
| F-03 | Current portable source has 3 managed providers / 13 model-or-override entries; `local` alone contains the LAN endpoint | `~/.pi/agent/models.json#providers` | Version only `github-copilot`, `sakana`, `openrouter`; test that `local` is absent from source | High |
| F-04 | Sakana’s credential is a command reference into `auth.json`, not a secret literal | `~/.pi/agent/models.json#providers.sakana.apiKey` | Preserve the reference string; never version `auth.json` or resolved key material | High |
| F-05 | Pij’s sole impure model composition root reads global `models.json`; Pi entries and Copilot seed become verified data | `.pi/extensions/pij/core/models/registry.ts:1-10,67-128,238-286` | Syncing the catalog restores model discovery/effort behavior without changing registry code | High |
| F-06 | Registry tests already encode the expected provider families, overrides, names, and thinking maps | `.pi/extensions/pij/core/models/registry.test.ts:12-83,184-241` | Add sync-specific tests; do not duplicate parser behavior | High |
| F-07 | Current docs tell users to edit global `models.json` directly | `RUNBOOK.md:205-283`; `docs/how/pij-models-discovery.md:44-52` | Redirect authoring to `.pi/models.json` + `just sync-models`; explain unmanaged-provider preservation | High |
| F-08 | Repository policy names only APPEND_SYSTEM/MCP as checked-in global sources and says not to hand-edit global state | `AGENTS.md:52-59,90-115`; `docs/how/update-pi.md:19-54` | Extend the declared source-of-truth list and bootstrap narrative to models | High |
| F-09 | Pij already uses small Node scripts with pure seams and filesystem wiring for global synchronization | `harness/scripts/link-global.ts:1-130`; `harness/scripts/packages.ts:1-120` | Place a focused `harness/scripts/sync-models.ts` beside these scripts; unit-test merge and file behavior | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | The cold-start plan established `justfile` as the bootstrap source of truth but documented only four global layers, omitting models | `docs/plans/028-docs-cold-start/research-dossier.md#Answer` | Direct | Amend the same docs rather than create a competing portability guide |
| H-02 | Model discovery deliberately treats global Pi entries as the clean registry and Copilot seed | `docs/plans/023-fail-loud-model/research-dossier.md` F-02/F-03; `docs/how/pij-models-discovery.md` | Direct | Missing models are a functional regression, not merely user preference drift |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Overwrite would delete local providers | F-03 plus current `local` provider | `just update-pi` is routinely re-run; destructive refresh would violate the exclusion boundary | Merge only the three managed provider keys; fixture-test preservation of `local` and another unknown provider |
| Stale managed entries after source removal | Managed merge semantics | A shallow object merge would leave removed models inside a managed provider | Replace each managed provider object wholesale, while preserving provider keys outside the managed set |
| Partial/corrupt writes | Global config is runtime-consumed | Interrupted refresh could break Pi startup/model selection | Validate both JSON objects, write temp beside target, rename atomically; tagged result instead of uncaught operational errors |
| Secret regression | F-04 | A copied resolved key would violate the explicit boundary | Test/source review for reference-only auth; no auth-file access in sync script |
| Docs drift across four surfaces | F-07/F-08 | Users may continue editing the generated global file | Update AGENTS, build/update guide, RUNBOOK, and model-discovery guide in the same phase |

## Planning Handoff

- **Preserve**: existing Pi `models.json` schema; the exact portable provider payload; verified-entry precedence in `loadModels()`; arbitrary machine-local provider keys; canonical `just` interface; atomic global writes.
- **Change carefully**: global sync must replace managed provider objects wholesale but preserve unmanaged providers; a missing target starts from `{ "providers": {} }`; malformed source/target fails without mutation.
- **Likely files/symbols**: `.pi/models.json` (new); `harness/scripts/sync-models.ts` + `.test.ts` (new); `justfile` (`sync-models`, `install`, `update-pi`); `AGENTS.md`; `docs/how/build.md`; `docs/how/update-pi.md`; `docs/how/pij-models-discovery.md`; `RUNBOOK.md`.
- **Decisions resolved**: source owns exactly `github-copilot`, `sakana`, and `openrouter`; `local` and any future unknown provider remain target-local; auth is referenced but never managed; no `pi-doctor` expansion in this item.
- **Proof target**: unit fixtures prove add/replace/remove within managed providers, preservation of unmanaged providers, no `local` in source, malformed-input no-write, and byte-stable rerun; existing `harness boot` and full checks remain green.
