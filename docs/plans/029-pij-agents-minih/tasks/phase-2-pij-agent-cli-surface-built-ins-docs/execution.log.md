# Phase 2 — Execution Log

Chronological record of the Phase 2 implementation (`pij agent` CLI surface,
built-ins, docs). One row per task/step; TDD red→green and red-first alarm
proofs are recorded inline as required by the packet.

| # | Task | Step | Result | Evidence |
|---|------|------|--------|----------|
| 1 | B-gap | `runEphemeralPack(packDir,…)` added to `inline.ts` — `cpSync` pack → `tmpDir/agents/ephemeral-<ulid>/<slug>`, strip copied `runs/`, run via `runAgentPack` with `MINIH_NO_AUTO_HARVEST=1` set-and-restored, delete tree in `finally`. 2 tests (named pack leaves nothing + source untouched; cleanup on failure) | ✅ | inline.test.ts 8/8; source pack keeps only `prompt.md` after run (no `runs/` leak — KF-07) |
| 2 | T001 | `cli-args.ts` (TDD) — `parseAgentArgs` (subverbs, repeated `-p k=v`, `--prompt`/stdin `-`, `--ephemeral`, override flags, `--json`/`--quiet`), `coerceParams` (JSON auto-coerce), `AGENT_EXIT`/`exitCodeFor` (0/1/2, AC-09). 27 tests | ✅ red→green | red: module missing (`no tests`); green 27/27 |
| 3 | T002 | Refactor: `loadModels()` composition moved bin `cli.ts`→`core/models/registry.ts` (exported, byte-equivalent); `PROVIDER_HARNESS_MAP` exported in `core/cli.ts`; bin imports both; dropped now-unused registry imports from bin | ✅ | `tsc` clean; models+spawn suites 161/161 green (no behaviour change) |
| 4 | T004/T005/T006 | `cli-verbs.ts` — `list` (3-tier+shadow+`--json`), `run` (named record-by-default / `--ephemeral` / inline via runtime; overrides warn-don't-block; `sweepStaleTmp` at every run start), `show`/`new`/`check`/`eject`; `renderAgentError` (6 workshop-002 shapes) + pure `runOutcomeError` (E-PERMISSION wins, E-RUNFAILED); `--json` `{run,report}` stdout-only. All model facts INJECTED via `VerbDeps` (no core/cli or core/models import). 23 tests | ✅ | cli-verbs.test.ts 23/23; leak-free without env guard (`git status docs/retros` clean); boundary.test still green |
| 6 | T007 | `builtin-agents/flowspace-search/` — `prompt.md` (model `claude-sonnet-4-6` **pinned**, reasoning low, `permissions: read-only + shell:allow`, non-empty description) + `instructions.md` (fs2 usage, `cd $PIJ_AGENT_CWD`, **graph-missing precondition → `fs2 scan`**) + input/output schemas; `eject <slug>` copies to `./agents` then shadows; un-ejected built-ins forced through `runEphemeralPack`. Bin resolves builtin dir via `new URL("./builtin-agents", import.meta.url)`. Claude adapter enhanced: a pack's `permissionHandler` presence → scoped `--allowedTools Bash,Read,Grep,Glob,WebFetch,WebSearch` (read-only+shell; no Write/Edit). 3 built-in tests + claude arg test | ✅ | **AC-08 live GREEN** (real claude): ephemeral run answered `daemon stall watchdog` with real fs2 node ids (`core/state.ts:isStalled`, `core/binding.ts:evaluateWatchdog/buildStalledNotice`), status completed, runDir null; recorded (ejected) run also green. **Zero writes** under `builtin-agents/` + `docs/retros/` + no `~/.pij/tmp` leftover after live runs. `show`/`check` green against the real pack |
| 7 | T008 | Docs — `docs/how/pij-agents.md` (authoring, discovery/precedence, overrides warn-don't-block, **determinism gradient** recorded·ephemeral·inline, adapters + `PIJ_AGENT_FAKE` seam, built-ins + eject, errors/exit-codes/`--json`, **AC-11 companion walkthrough**: coordination-enabled pack via copilot adapter (`coordination: enabled` frontmatter → minih `SdkCopilotAdapter`) OR minih-binary path, explicitly **zero pij code changes**). Quick-starts added to `AGENTS_README.md` (extensions list) + `RUNBOOK.md` (new `Run agent packs` section before Companion mode) | ✅ | AC-11 walkthrough is configuration-only; AC-13 docs land in all three files |
| 8 | T009 | Validation sweep — `scratch/agent-json-consume.sh` (real bin + `PIJ_AGENT_FAKE=1`; 6 assertions: named `--json` envelope shape + pure-JSON stdout, inline `runDir:null`, list JSON rows, E-NOAGENT/E-BADINPUT/E-ARG exit codes) **exit 0**; `just self-check` **exit 0** | ✅ **GATE GREEN** | self-check full suite **1399 passed / 7 skipped (1406)** across 111 files; typecheck clean; biome clean (0 errors; 10 warnings all pre-existing, incl. `HarnessKind` unused in core/cli.ts — verified pre-existing via git stash); 9 smoke extensions green; snapshots match. Reverted the benign `.pi/packages.yaml` `vetted.date` refresh (audit side-effect). `ghoseb/pi-askuserquestion` audit `fail` is pre-existing + report-only (non-blocking). **Daemon NOT restarted** (orchestrator-owned, per packet). |
| 9 | rev-0002 finding 1 (fix-0001) | **HIGH fix — `--permissions`/`--cwd` were parsed but silently dropped** (never reached minih's `AgentRunConfig`). TDD red→green: 5 regression tests first (runner.test.ts `buildRunConfig` maps `permissions`→`permissionsOverride.preset`, `cwd`→`config.cwd`, omits when unset; cli-verbs.test.ts named-run reads `run.json` and asserts `permissions.preset==='yolo'` + `canonicalRoots` contains the `--cwd` root; ephemeral-run asserts the yolo preset reaches minih via the adapter's `permissionHandler` being absent for a pure-allow policy). Fix: `RunOverrides` gains `cwd?`/`permissions?` (types.ts); `buildRunConfig` maps them into the minih config — preset override + `config.cwd` (runner.ts); `buildOverrides` forwards `cmd.cwd`/`cmd.permissions` (cli-verbs.ts). Applies to named, ephemeral, built-in, AND inline (all funnel through `buildOverrides`→`buildRunConfig`). | ✅ red→green | red: 4/5 fail (preset/cwd `undefined`, run.json `restricted`, handler present); green: runner 13/13 + cli-verbs 25/25; `tsc` clean; gate re-run below |

## Harvested discoveries (feed the difficulty ledger / future runs)

- **minih passes a structural `permissionHandler` on the run options only when a pack declares `permissions` frontmatter.** The CLI (claude/codex) adapters can't consume that handler, so its *presence* is the signal a pack wants tools — the claude adapter maps it to `--allowedTools` (scoped, no Write/Edit). Absent handler ⇒ plain one-shot (backward compatible).
- **Headless `claude -p` denies all tools by default** — it must be given `--allowedTools "Bash,…"` (or `--dangerously-skip-permissions`) or it silently produces no tool output. Needed for any pack that shells out (e.g. fs2).
- **The adapter subprocess cwd is always minih's isolated run dir** (`runner.js:1161` `cwd: runDir`), *not* the project. A pack that must operate on the repo (like flowspace-search) can't reach it by cwd — pij exports `PIJ_AGENT_CWD=<repo root>` and the pack `cd`s there. `config.cwd` only affects the retros ledger/permission roots, never the adapter cwd.
- **A user `output-schema.json` must NOT set top-level `additionalProperties:false`** — the system envelope adds `retrospective` (and more) alongside the user fields, so a strict top-level schema rejects it and the run is marked **`degraded`** (→ E-RUNFAILED). Keep `additionalProperties:false` on nested item objects only.
- **`degraded`** is a distinct `metadata.result` (completed-but-didn't-validate); `runOutcomeError` treats any non-`completed` result as E-RUNFAILED (exit 1).
- **`scratch/` is gitignored** (repo convention) — the `agent-json-consume.sh` gate script lives + runs on disk but is not committed.

## Notes / decisions

- **Dependency direction held**: `core/agents/cli-args.ts` + `cli-verbs.ts` import NO `core/cli.ts` / `core/models/` — every model fact (`harnessForModel`, `modelWarning`, `effortWarning`, `makeAdapter`) is injected via `VerbDeps` from the bin (the `RunnerDeps` pattern). Boundary sensor stays green (24 per-file checks).
- **`PIJ_AGENT_FAKE=1` test seam**: a deterministic FakeAgentAdapter behind an env flag lets the scratch script + CI exercise the whole CLI→runtime→envelope path with no real CLI + zero tokens. Documented in `docs/how/pij-agents.md` + `RUNBOOK.md`.
- **Exit-code table** (fs2 convention): 0 ok · 1 user/agent (E-ARG/E-NOAGENT/E-BADINPUT/E-NOADAPTER/E-PERMISSION/E-RUNFAILED) · 2 system (E-HARNESSBIN — missing harness CLI/SDK).
- **T002 was a pure refactor**: `loadModels()` moved bin→`registry.ts` byte-for-byte; `PROVIDER_HARNESS_MAP` exported. Spawn behaviour unchanged (161 model/spawn tests green).
- **Daemon NOT restarted** (orchestrator-owned at fleet teardown, per packet) — the Phase-1 sweep hook stays inactive until then; inline/named runs each call `sweepStaleTmp` at start so crash leftovers are still swept without the daemon.

## AC checklist

| AC | Status | Evidence |
|----|--------|----------|
| AC-01 | ✅ | `list` 3-tier + `(shadowed)` + `--json` rows — cli-verbs.test.ts; live `agent list` |
| AC-02 | ✅ | named run through `runAgentPack` → `runs/<ts>/output/report.json` — cli-verbs.test.ts (runDir present); live recorded run |
| AC-03 | ✅ | E-BADINPUT before any session (AJV fail-fast) — cli-verbs.test.ts + scratch script |
| AC-04 | ✅ | `--model/--effort/--harness` override + warn-don't-block; E-NOADAPTER — cli-verbs.test.ts |
| AC-05 | ✅ | inline leaves nothing; `sweepStaleTmp` at every run start — cli-verbs.test.ts (tmp empty); inline.test.ts |
| AC-06 | ✅ | `--ephemeral` → runDir null, zero new `runs/` — cli-verbs.test.ts; builtin-flowspace.test.ts |
| AC-07 | ✅ | (Phase 1) claude/codex live adapters + copilot lazy — carried; claude adapter arg test added |
| AC-08 | ✅ | flowspace-search built-in: **live fs2 query answered** (real node ids), eject→shadow+record, un-ejected→ephemeral, zero writes under `builtin-agents/` — builtin-flowspace.test.ts + live runs |
| AC-09 | ✅ | 6 error shapes + exit 0/1/2 — cli-args.test.ts (exit map), cli-verbs.test.ts (renderAgentError + runOutcomeError), scratch script |
| AC-10 | ✅ | `--json` `{run,report}` stdout-only, progress stderr-only — cli-verbs.test.ts + scratch script (pure-JSON stdout asserted) |
| AC-11 | ✅ | companion walkthrough in `docs/how/pij-agents.md` — copilot-adapter (`coordination: enabled`) + minih-binary paths, **zero pij code changes** |
| AC-12 | ✅ | (Phase 1) minih contract test in self-check — carried, still green |
| AC-13 | ✅ | `docs/how/pij-agents.md` + `AGENTS_README.md` + `RUNBOOK.md` quick-starts landed |

**Carry-forward (orchestrator-owned):** the live daemon restart to activate Phase-1's `sweepStaleTmp` daemon-start hook — deferred per packet, at fleet teardown.

