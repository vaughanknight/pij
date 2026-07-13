# S045 Phase 1 execution log

| Time (UTC) | Task | Evidence |
|------------|------|----------|
| 2026-07-12T21:28Z | Pre-flight | `harness boot --json` passed `just typecheck` and `just test`. |
| 2026-07-12T21:28Z | Build configuration | Spine Seq 102 confirmed separate Copilot `gpt-5.6-sol` xhigh coder and reviewer; reviewer is lazy until first review. |
| 2026-07-12T21:28Z | Fence | Six product/docs paths authorized; `docs/domains/pij-control-plane/domain.md` held until PR #9 merge + rebase. |
| 2026-07-12T21:39Z | Pi-client ruling | Scope includes Pi-filter advertisement, shared bare-id validation, and unchanged Pi effort suffix; provider-prefix normalization remains out of scope. |
| 2026-07-12T21:40Z | Delegation | Flow-pair `dlg-0002` dispatched to `pij-dizzy-yak` after model/effort/cwd/footer and two-turn input canary passed. |
| 2026-07-12T21:43Z | T001-T002 RED | Four targeted files produced 26 expected failures and 169 passes before implementation. |
| 2026-07-12T21:44Z | T003-T004 GREEN | Added the exact Copilot GPT-5.6 level correction and operator guidance; 195 targeted tests passed. |
| 2026-07-12T21:44Z | T005 mutation pincer | All three required mutations went RED and each restore returned `registry.ts` to SHA-256 `5e0fbe7cd5e3b56463c006b79d9920e49d348f41fc0234c8539c749c818935ed`. |
| 2026-07-12T21:45Z | Live views | In-repo Copilot and Pi JSON views showed all three raw `github-copilot` rows and all three Copilot clones with `none,low,medium,high,xhigh,max`. |
| 2026-07-12T21:59Z | Gate blocker | Every deterministic sensor except smoke passed. Smoke is blocked by the pre-existing `pi-peacock` worktree assumption at `.pi/extensions/pi-peacock/smoke.ts:15`, which requires `~/pi-hacking/pij (main)` while this authorized worktree correctly renders its own path and branch. |
| 2026-07-12T22:14Z | Cold review | `pij-literary-peafowl` returned `APPROVE_WITH_NOTES`; three independent mutations went RED, restored SHA-256 `949e28fedec88d79e0060b122965c4072019e36930597f18d23eee76ebbbe770`, then 195/195 GREEN. No S045 defect found. |
| 2026-07-12T22:14Z | Approval state | Product verdict recorded (`flow-pair` artifact gate `rev-0001` = APPROVE; real peer verdict = APPROVE_WITH_NOTES). Phase completion remains blocked only by shared smoke. |
| 2026-07-12T23:59Z | PR #9 integration | Rebased S045 cleanly onto `origin/main` `1336291a5a2285d37487cf83bda86b7438ba93c4`; reread the merged control-plane contract and reopened only additive domain task T004b. |
| 2026-07-13T00:01Z | T004b domain integration | Additively recorded model-registry sources, effort/verification concepts and contracts, control-plane ownership boundaries, configuration dependency, and S045 history while preserving merged PR #9 content. |
| 2026-07-13T00:03Z | T004b self-check | Domain/operator consistency search and scoped `git diff --check` passed; `just flow-pair-test` passed 148/148, `just typecheck` passed, and `just lint` passed with no errors. |
| 2026-07-13T00:05Z | Final full gate | `harness checks`: typecheck, lint, test, Windows compatibility, package audit, and snapshots passed; smoke alone failed on repeated tmux `can't find pane` errors across scenarios. Package audit timestamp churn was restored byte-identically. |
| 2026-07-13T00:06Z | T004b review | `pij-literary-peafowl` returned `APPROVE_WITH_NOTES`: additive `17/0` domain diff, PR #9 content preserved, source/boundary/dependency/history checks passed. One info wording precision was recorded; no fix required. |
| 2026-07-13T00:13Z | Higher-layer gate ruling | Spine Seq 144 marked S045-owned content and Phase 1 ready; shared tmux pane-lifetime smoke remains recorded non-blocking debt. PR #12 may be ready for review; merge remains Jordan-gated. |
| 2026-07-13T00:17Z | Phase retro | Drained four harness difficulties into `.harness/records/retro/2026-07-13/001-045-copilot-5-6-effort-levels.md` with `disposition: kept`; cleared the transient buffer and verified the record through `harness retro insights`. |

## Changed files

- `.pi/extensions/pij/core/models/registry.ts`
- `.pi/extensions/pij/core/models/registry.test.ts`
- `.pi/extensions/pij/core/models/validate.test.ts`
- `.pi/extensions/pij/core/spawn.test.ts`
- `.pi/extensions/pij/core/models/cli-models.test.ts`
- `docs/how/pij-models-discovery.md`
- `docs/domains/pij-control-plane/domain.md`
- `docs/plans/045-copilot-5-6-effort-levels/tasks/phase-1/execution.log.md`

## Decisions and trade-offs

- Kept one private ordered constant for `none, low, medium, high, xhigh, max` and one exact three-id set.
- Guarded Pi `models[]` and `modelOverrides` corrections by both provider `github-copilot` and exact id; same-id rows under other providers retain source-derived levels.
- Reused only the exact-id guard in Copilot fallback construction because `copilotEntry()` is already provider-scoped.
- Preserved fallback `verified: false` independently from curated `reasoning` and `levels`.
- Preserved raw plus cloned Copilot rows, Pi's all-provider filter, bare-id validation, and Pi's provider-prefixed effort suffix.
- Left provider-prefix normalization and the held domain-contract update out of scope.
- Integrated the released domain update additively after PR #9, assigning shared model discovery,
  verification metadata, effort capabilities, and warn-don't-block validation to
  `pij-control-plane` without changing product behavior.

## Mutation evidence

- Removed the provider-guarded curated parse branch: 25 failures / 170 passes across the 195-test target; byte-identical restore; 195/195 GREEN.
- Removed only the `github-copilot` provider guard: the same-id Sakana preservation assertion failed; byte-identical restore; 30/30 registry tests GREEN.
- Added unsupported `minimal` to the curated constant: 7 failures / 170 passes, including validation and warning regressions; byte-identical restore; 195/195 GREEN.

## Gates

- Targeted registry/validation/spawn/CLI tests: 195 passed.
- Pi-free source assertion for `registry.ts`: passed.
- `just flow-pair-test`: 148 passed.
- `just typecheck`: passed.
- `just lint`: passed after formatting the four touched TypeScript files.
- `just test`: 1,809 passed, 10 skipped.
- Live Copilot and Pi JSON inspection: exact six levels present for all three ids.
- `harness checks`: typecheck, lint, test, package audit, and snapshots passed; smoke failed only on the unrelated `pi-peacock` hardcoded main-checkout regex. The targeted `pij` smoke passed after isolating Pi's global extension directory. Full gate remains red pending an orchestrator-owned scope decision or upstream smoke fix.
- T004b documentation consistency: domain contract matches the operator guide's exact trio,
  ordered levels, fallback verification semantics, duplicate projections, warn-don't-block
  behavior, and provider-prefix exclusion.
- T004b scoped diff check: passed with only additive domain-contract and execution-log changes.
- T004b required gates: `just flow-pair-test` 148/148, `just typecheck` passed, `just lint`
  passed with no errors (10 existing warnings and one schema-version info remained advisory).
- Post-PR9 full `harness checks`: every sensor including `windows-compat` passed except shared
  tmux smoke, which failed on disappearing pane ids across scenarios.
- T004b domain review: `APPROVE_WITH_NOTES`; scoped diff/source/chronology checks passed.
- Shared smoke disposition: non-blocking debt for S045 under Spine Seq 144; Phase 1 ready.
