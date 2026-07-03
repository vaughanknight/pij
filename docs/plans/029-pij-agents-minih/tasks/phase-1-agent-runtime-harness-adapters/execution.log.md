# Phase 1 — Execution Log

Chronological record of the Phase 1 implementation (agent-runtime + harness
adapters). One row per task/step; TDD red→green and red-first alarm proofs are
recorded inline as required by the packet.

| # | Task | Step | Result | Evidence |
|---|------|------|--------|----------|
| 1 | T002 | Add `minih` git dep (`github:AI-Substrate/minih#minih-v0.2.4`) + `@github/copilot-sdk` optional peer + `peerDependenciesMeta` to `package.json`; `npm i` | ✅ | tag verified via `git ls-remote` (`minih-v0.2.4` = `a9bc26e`); `npm i` added 175 pkgs clean; `minih/runner` + `minih` type-resolve confirmed against `node_modules/minih/dist/*.d.ts` |
| 2 | T004 | Adapter headless spike — real `claude -p --output-format json` and `codex exec --json` one-shots; recorded result/session-id/usage shapes + effort clamp; go/no-go | ✅ GO | `spikes/adapter-headless-spike.md`; claude `{result,session_id,is_error,usage}`; codex JSONL `{thread.started,item.completed(agent_message),turn.completed.usage}` |
| — | (spike) | Validated `runAgent(FakeAgentAdapter{output:envelope}, resolveAgent(pack), config)` end-to-end in a throwaway script: writes `<packDir>/runs/<ts>/output/report.json`, surfaces `parsedReport`, report only written when adapter `output` truthy (`runner.js:1336`) | ✅ | throwaway `_spike.mts` (deleted); confirms T003 temp-dir-copy requirement (runs root at `agentDef.dir`, `folder.js:641`) |
| 3 | T001 | Domain setup: `docs/domains/agent-runtime/domain.md` (boundaries match plan sketch), registry row, domain-map node (`AR`) + external `minih` (`MINIH`) node + edges + Health Summary rows + History | ✅ | 3 docs updated; boundary Owns/Excludes byte-match plan § New Domain Sketches |
| 4 | T003 | Contract test (AC-12) — `contract.test.ts` + `__fixtures__/hello-world/prompt.md`; copies fixture to `mkdtemp`, drives real `runAgent` + `FakeAgentAdapter{output:envelope}`, asserts `validateSystemOutput` valid + `parsedReport` surfaced + fixture stays `runs/`-free across 2 runs | ✅ | 2 tests green; **discovery**: system envelope enforces ≥10-char retrospective fields (fixed `confusing` string) |
| 4a | T003 | Red-first alarm proof: renamed the import to `runAgent_DRIFTED` → both tests RED (`runAgent_DRIFTED is not a function`); reverted → GREEN | ✅ | proves AC-12 tag-drift alarm rings; sabotage reverted (no repo change) |
| 5 | T005 | `paths.ts` (TDD) — `resolvePijHome(env?)` (`PIJ_HOME??~/.pij`, empty=unset), `agentsDir`/`tmpDir`; 7 tests incl. env isolation | ✅ | red (no module) → green 7/7 |
| 6 | T006 | `pack.ts` (TDD) — `isPack`, `parsePackMeta` (minih `parseFrontmatter` + pij-only `harness` regex), `discoverInDir`, `discoverAgents` (precedence + shadow-marking); 8 tests | ✅ | red → green 8/8; **discovery**: minih `parseFrontmatter` ignores `harness`, so pij extracts it separately (no pack-format fork) |
| 7 | T007 | `runner.ts` (TDD) — `buildRunConfig` (flag>frontmatter>unset; effort warn-don't-block) + `runAgentPack` (resolve→AJV `validateInput` **before** adapter→`runAgent`); tagged-union `RunPackResult` (`E-NOAGENT`/`E-BADINPUT`); 10 tests incl. fail-fast (adapter.run never called on invalid input) | ✅ | red → green 10/10 |
| 8 | T008 | `adapters/{subprocess,claude,codex}.ts` per T004 spike — injectable `ExecCommand`; pure `parseClaudeResult`/`parseCodexResult`/argv builders + `codexEffort` clamp (`minimal`→`low` warn, `xhigh`→`high` warn); 18 tests with faked subprocess | ✅ | green 18/18 (7 claude + 11 codex) |
| 9 | T009 | `adapters/copilot.ts` — `createCopilotAdapter` lazy `import(@github/copilot-sdk)` wrapping `SdkCopilotAdapter`; `CopilotSdkMissingError` names package+install cmd when absent; 3 tests (present via fake, absent→named error, other error propagates) | ✅ | green 3/3; lazy `import()` is the plan-mandated optional-peer exception (KF-01; mirrors minih `sdk-runtime.js:34`) |
| 10 | T010 | `inline.ts` (TDD) — `runInlineAgent` (temp-pack synth under `tmpDir()/agents/<ulid>`, `MINIH_NO_AUTO_HARVEST=1`, delete tree in `finally`) + `sweepStaleTmp` (age-thresholded, idempotent); daemon-start hook in `daemon.ts::runDaemon`; 6 tests | ✅ | red → green 6/6; **discovery**: minih `listAgents` **requires non-empty frontmatter `description`** — inline packs must synthesize frontmatter or they resolve to null (E-NOAGENT) |
| 10a | T010 | Daemon hook: `runDaemon()` calls `sweepStaleTmp(pijHome)` on start (logs swept count). **Live daemon NOT restarted** (packet: daemon runs tsx off source, no hot-reload — restart deferred). daemon.test + daemon-push.test still green (28) | ✅ | boundary-safe direction: daemon (pij-control-plane) → core/agents |
| 11 | T012 | `boundary.test.ts` — static import-specifier scan of every `core/agents/**/*.ts`; fails on any `daemon`/`telegram`/`tmux`/`grammy` import. Red-first proof: added `import type { Daemon } from "../../daemon.js"` to paths.ts → RED for paths.ts; reverted → GREEN | ✅ | 20 tests (per-file + sanity); arch-drift row flips review→computational |
| 12 | T011 | `adapters/adapters.live.test.ts` (`PIJ_AGENT_LIVE=1` + `describe.skipIf` + self-doc `it.skip`) — real claude + codex one-shot each asserting `validateSystemOutput` on report.json; `just agent-live` recipe added. Skip path verified (3 skipped under `just test`) | ✅ | **`just agent-live` GREEN**: claude 131.6s + codex 117.1s, both valid envelopes end-to-end (AC-07). No retro leak (MINIH_NO_AUTO_HARVEST=1); temp packs in mkdtemp, cleaned |
| 13 | T013 | Phase gate — `just self-check` (typecheck → lint → test → smoke → `pkg audit` PIJ_VET_SKIP_AGENT=1 → snapshots-check) | ✅ **exit 0** | full suite **1337 passed / 7 skipped (1344)**; `tsc --noEmit` clean; biome clean (0 errors; 9 warnings all pre-existing, none in `core/agents`); smoke green; snapshots match. Zero untracked run artifacts (no `runs/`, `report.json`, `.pij/tmp`, or `docs/retros/{hello,inline,alpha,live}` leaks). Reverted a `.pi/packages.yaml` `vetted.date` refresh (benign audit side-effect, out of scope). `ghoseb/pi-askuserquestion` audit `fail` is pre-existing + report-only (non-blocking). |

## Harvested discoveries (feed the difficulty ledger / future runs)

- **minih `listAgents`/`resolveAgent` silently require a non-empty frontmatter `description`** — a bare `prompt.md` (or one with frontmatter but blank description) resolves to `null` (looks like E-NOAGENT). Inline packs must synthesize a `description`. (`folder.js` listAgents: `if (!description.trim()) continue`).
- **System-output envelope enforces ≥10-char retrospective fields** (`workedWell`/`confusing`/`magicWand`) — short test strings fail `validateSystemOutput`.
- **`runner.js:1336`**: `output/report.json` is only written when the adapter's `output` is truthy AND `status==='completed'` — a stock `FakeAgentAdapter` (`output:''`) writes no report; seed it with the envelope.
- **minih roots runs at `agentDef.dir`** (`folder.js:641`) — any test driving real `runAgent` must copy the fixture to a temp dir or it dirties the repo.
- **Headless one-shot adapters have no live session** → `compact`/`terminate` are best-effort no-ops (documented degradation, T004 spike).

## Notes / decisions

- **T003 temp-dir copy is mandatory** (validation MEDIUM-1, confirmed by spike):
  `createRunFolder` roots runs at `<agentDef.dir>/runs/` (`folder.js:641`), so the
  contract test copies the fixture pack into a `mkdtemp` dir before running, keeping
  the repo tree clean.
- **FakeAgentAdapter must be seeded with an envelope** (`output: JSON.stringify({
  summary, retrospective:{workedWell,confusing,magicWand} })`) — a stock fake returns
  `output: ''` and `runner.js:1336` only writes `output/report.json` when the adapter
  output is truthy.
- **Codex effort**: minih enum `low|medium|high|xhigh` lacks codex `minimal`; codex
  lacks `xhigh`. Adapter clamps `minimal`→`low` (warn) and maps `xhigh`→`high`.
