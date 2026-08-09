# Difficulties

Friction encountered in pij dev. Each entry has a workaround (immediate)
and an encoded fix (durable). Severity guides priority.

| ID | Date | Severity | Description | Workaround | Encoded fix | Status |
|----|------|----------|-------------|------------|-------------|--------|
| D-001 | 2026-05-09 | low | Subagent returned 18 findings inline instead of writing to disk | manual file write by parent | `/plan-1a-explore` agent prompts assert file-write before reporting count | open |
| D-002 | 2026-05-09 | medium | `await ctx.reload()` runs post-reload code from the *pre-reload* version | always end the handler with `return` after `await ctx.reload()` | template encodes the `return;` pattern; consider biome rule | mitigated |
| D-003 | 2026-05-09 | low | NodeNext requires `.js` on relative TS imports; editors don't auto-add | manual `.js` suffix | tsconfig + biome catch missing extension; templates use `.js` everywhere | encoded |
| D-004 | 2026-05-09 | medium | Pi-bundled deps must be `peerDependencies: "*"` not `dependencies` (else they shadow pi's copies) | manually move them | template `package.json` ships peerDeps already correct | encoded |
| D-005 | 2026-05-09 | high | Unverified: do `customType` entries survive `/compact`? | none yet | scratch previously carried a smoke scenario for this, but scratch was retired from the repo on 2026-05-14; re-add coverage in the next persistence-oriented extension before relying on `customType` across `/compact`. **2026-05-15 update**: Plan 008 T024 `ralph-loop:compact-survival` smoke now exists and passes. It proves AC-05's REPLAY path end-to-end (`/reload` after run rehydrates 3 iterations + correct `lastTaskTitle` via `ctx.sessionManager.getEntries()`), satisfying A3/A4 of workshop 004's assertion matrix. **Partial gap**: under `PIJ_RALPH_FAKE_RUNNER=1` the session has no LLM messages so `/compact` reports "Nothing to compact (no messages yet)" — a no-op, not real compaction pressure. Genuine A1/A2 verification needs a real-model smoke that drives enough conversation to trigger compaction; this is **deferred** as a follow-up smoke gated by API-key availability. No pi-mono escalation required at this time (no observed entry drop). | (a) ship the structural smoke now (T024 — done); (b) follow-up: add `npm run smoke:real -- ralph-loop` that requires `OPENAI_API_KEY` or equivalent and drives real `/compact`; (c) if A1/A2 fails under that smoke, escalate per workshop 004 § Upstream escalation. | mitigated (replay path verified; compact-pressure path deferred to gated smoke) |
| D-006 | 2026-05-09 | low | `ctx.ui.setStatus(key, "")` STORES an empty string (renders an empty pill); only `undefined` calls `delete` and clears. Scratch's `index.ts:98` called `setStatus("scratch", "")` when count=0 — a stale empty pill remained visible. | none needed | (a) Resolved during plan 004 research by reading pi-mono `footer-data-provider.ts:132-138` (PR-04 in research dossier); (b) one-line fix lands in `.pi/extensions/scratch/index.ts` plan 004 T009 — pass `undefined` not `""` when count=0; (c) machine-verifiable assertion in scratch's smoke.ts (T008) uses negative lookahead `/^(?![\s\S]*\bscratch:)/` to confirm no `scratch:` pill renders when count=0. | encoded |
| D-007 | 2026-05-09 | medium | Pi has no file watcher — manual `/reload` after every edit | type `/reload` | optional `npm run watch` (fswatch + tmux send-keys) — stretch | open |
| D-008 | 2026-05-09 | medium | Smoke runner requires tmux + pi binary, so CI can't run it | skip smoke in CI | SDK-driven smoke (no TUI, no tmux) — stretch | open |
| D-009 | 2026-05-09 | medium | Fabricated baselines in upstream design (workshop 004 "5-minute test", spec AC minute targets) flowed into ACs as if measured. Validators echoed them as VPO Outcome without sanity-checking evidence. | replace with measurement-anchored claims; remove fixed minute thresholds as gates | spec § Clarifications 2026-05-09b updates AC-01/AC-11/AC-15 + § Goals; plan + flight plan match; validate-v2 should specifically check OUTCOME for measurement evidence | encoded |
| D-010 | 2026-05-09 | low | biome 2.x renamed `files.ignore` → `files.includes` with negated patterns; workshop 004 used the old syntax. | update biome.json to new syntax | `biome.json` ships with biome 2.x `files.includes` syntax; workshop 004 still lags | mitigated (file fix landed; workshop pending) |
| D-011 | 2026-05-09 | low | Workshop 004 `index.ts.template` called `ctx.sessionManager.entries` (property), but real pi API exposes `getEntries()` (method) on `ReadonlySessionManager` (verified at pi-mono `packages/coding-agent/src/core/session-manager.ts:184`). | `.entries` → `.getEntries()` in template | template fixed; workshop 004 still lags | mitigated (file fix landed; workshop pending) |
| D-012 | 2026-05-09 | low | Post-demo-teardown (T035), vitest exits 1 with "No test files found" — breaks `npm run self-check` on a fresh-cloned/empty pij. Workshop 004 didn't anticipate this. | run a full self-check before teardown (works), or live with the failure on empty repos | `vitest.config.ts` adds `passWithNoTests: true` so the framework treats empty-tests as success | encoded |
| D-013 | 2026-05-09 | high | `npm run smoke` (and therefore `self-check`) exits 1 on a true fresh clone if `.pi/extensions/` directory does not exist (git does not preserve empty dirs). Companion finding F014/F007 caught this; my "post-teardown" local check ran with the empty dir still present, masking the failure. | none (would require running self-check from a fresh clone, which we hadn't) | (a) `.pi/extensions/.gitkeep` so the directory survives in fresh clones; (b) `harness/scripts/smoke.ts` `findScenarios()` wraps `readdirSync` in try/catch and returns empty on ENOENT — defense-in-depth | encoded |
| D-014 | 2026-05-09 | medium | Companion findings F008/F009/F016: smoke.ts uses fixed `sleep(delay)` then single capture-pane (workshop 004 promised "bounded retry"), and `tmux(...args).join(" ")` shell-joins arguments which breaks on quotes/spaces in PIJ_ROOT or step.send. Risk: extension #2 smoke flakes for harness reasons, polluting the velocity test. | run smoke from a known-clean PATH; avoid metacharacters in extension names (already enforced by name regex) | bounded retry loop + `execFileSync(\"tmux\", args)` with argument arrays — stretch (folds into D-008 SDK-driven smoke) | open (carry into extension #2 measurement context) |
| D-015 | 2026-05-09 | medium | Companion finding F011: `docs/project-rules/harness.md` originally listed P6 as `.js` extensions and P7 as structural types — inverted vs AGENTS.md / workshop 003 (which has P6 = structural, P7 = `.js`). | none (inverted vocabulary across docs) | harness.md updated to canonical P6/P7 numbering matching AGENTS.md / workshop 003 | encoded |
| D-016 | 2026-05-09 | medium | Companion findings F004/F005/F015: `store.ts.template` used `entry.data as Item` / `entry.data as { id: string }` casts (violating P6 — structural types at boundary), and `store.test.ts.template` re-implemented an inline recorder instead of using `harness/test-utils.ts makeRecorder()` (failing T012/T021's intent). | none — would have shipped with pattern drift across every future extension | (a) store template now uses `isItemData()` / `isDeleteData()` structural guards before mutating items; (b) test template imports + uses `makeRecorder` from harness/test-utils + adds a negative case for malformed replay data | encoded |
| D-017 | 2026-05-09 | low | minih (`0.1.5`) `inside-state.json` schema enum (`idle`/`in-progress`/`paused`/`reviewing`/`complete`/`error`) does not include the companion prompt's documented lifecycle states (`reading`/`reporting`/`stopping`/`blocked`). `state_set`/`state_transition` to those values rejected with "state does not match inside state schema" during the Power-On-Mode run. Companion self-reported severity: `degrading`. Inbox channel was unaffected. Tracks companion retro **MH-001**. | rely on inbox messages for durable progress/review evidence; retry state with values the schema accepts | upstream — filed at [AI-Substrate/minih#27](https://github.com/AI-Substrate/minih/issues/27). Suggested fix: per-agent `inside-state.schema.json` override or extend the global enum. | open (upstream) |
| D-018 | 2026-05-10 | low | Workshop 003 § File 2 (`index.ts`) calls `ctx.ui.notify(..., "success")`, but the real pi `ExtensionAPI` notify level enum is `"info" \| "warning" \| "error"` — `"success"` is rejected by `tsc`. Caught immediately by `npm run typecheck` during scratch's T004. | map `"success"` → `"info"` at the call site (positive feedback at info level) | scratch originally carried the local mitigation before being retired; workshop 004 backfill should also fix workshop 003 verbatim, OR the harness template can encode a thin notify wrapper if the pattern repeats | mitigated (scratch retired; workshop 003 still lags) |
| D-019 | 2026-05-10 | low | Workshop 003 § File 1 (`store.ts`) `list({ limit: 0 })` returns the **entire** array, not `[]`. Cause: `view.slice(-limit)` becomes `slice(-0)` and JS treats `-0 === 0` so `slice(0)` returns the whole array. Workshop 003 § Edge cases line 794 explicitly promises "limit < 1 → (no notes)" — the reference impl never delivered on that promise. Caught by scratch's negative test "treats negative limit as 0". | explicit `if (limit === 0) return [];` short-circuit inside `list()` | scratch originally carried the guard before being retired; workshop 003 + workshop 004 backfill should encode it in the template | mitigated (scratch retired; workshop 003 still lags) |
| D-020 | 2026-05-14 | low | Pi's interactive `/model` selector only accepts ids from its built-in generated registry (`packages/ai/src/models.generated.ts`) plus anything in `~/.pi/agent/models.json`. Typing an explicit `provider/model` that isn't in either list shows "No matching models" with no "use as custom id" affordance. The CLI `--model` flag *does* accept unknown ids via `buildFallbackModel` (clones the provider default), but that fallback may pick the wrong API family for Copilot (Claude vs GPT vs Gemini). | (a) one-shot: `pi --model github-copilot/<id>` works for the same session; (b) durable: add the model to `~/.pi/agent/models.json` with the correct `api` field for its family — pi reloads this file each time `/model` opens. | RUNBOOK § "Custom / unlisted pi models" carries the recipe + family→api table. Real fix lives in pi-mono (`model-selector.ts` + `handleModelCommand`); not yet patched per AGENTS.md rule "do not modify pi-mono without explicit approval". | mitigated (workaround documented) |
| D-021 | 2026-05-14 | medium | Perplexity MCP (`perplexity_perplexity_ask` and `perplexity_perplexity_research`) returned 401 `insufficient_quota` mid-`/plan-1a-explore` for the Ralph Loop dossier (008). The explore skill assumes external research is available; with Perplexity down the dossier had to fall back to training-knowledge content marked as needing verification (CD-01 in 008 dossier). pij has no documented Plan B for external research when the primary MCP is out. | (a) flag the gap explicitly in the dossier with a ready-to-paste `/deepresearch` prompt and `external-research/` filename; (b) user refills Perplexity quota OR runs the prompt through another tool (gh-search + WebFetch, browser deep research, ChatGPT). | RUNBOOK should list ordered fallbacks: Perplexity → `gh search` + WebFetch → manual. Longer-term, the explore skill could probe MCP availability and warn before the parallel-subagent stage. Track in 008 dossier's External Research Opportunities. | open |
| D-025 | 2026-05-15 | **high** — escalated from D-017 | D-017 reproduced on minih `0.1.6` during Plan 008 companion boot, and the symptom is **worse than originally documented**: the state-schema mismatch doesn't merely reject the call — it **wedges the entire run**. Two consecutive Plan 008 boots (`2026-05-15T15-17-19-408Z-557a` and `2026-05-15T15-34-21-470Z-9bfd`) stopped emitting events at ~3 tool calls / ~6 s each, with the last `tool_result` summary being `MCP server 'minih-coordination': state does not match inside state schema`. Inbox messages were durably written (briefing + review-request landed in both runs) but never processed because the agent never reached its `wait_for_any` long-poll loop. `run.json` remained `status: "active"` and `terminalReason: null` while `eventCount` froze; the runs effectively zombied until idle-budget reclamation. **2026-05-15 update: mitigated locally** via the per-agent `agents/code-review-companion/state/inside-state.schema.json` workaround from minih#30 (FX003b). Run `2026-05-15T16-05-38-307Z-3761` is alive, briefed, and actively producing review findings. AC-12 in Plan 008 spec is fully satisfied (minih adoption infrastructure documented + companion install verified + review loop live). | (a) keep the workaround schema file in place; (b) Phase 0 healthcheck (Plan 008 T004) verifies it on each work-session start; (c) await minih `0.2.0` upstream fix (FX003b manifest + watchdog). | upstream — filed at [AI-Substrate/minih#30](https://github.com/AI-Substrate/minih/issues/30) (escalation of [#27](https://github.com/AI-Substrate/minih/issues/27)) with both run IDs, the exact tool_call → tool_result sequence (`state_transition({ to: "reading" })` at +6s, `isError: true` 44ms later, then zombie), the wedge hypothesis, and two suggested incremental fixes (terminal-on-mcp-error timeout + prompt down-level as stop-gap). Local workaround landed in `94cbf24`. **(Originally filed as D-022; renumbered to D-025 on 2026-05-15 after the same number collided with a sibling-session row for Vitest/node:sqlite.)** | mitigated locally (workaround landed; upstream tracking [#30](https://github.com/AI-Substrate/minih/issues/30) for the durable manifest + watchdog fix) |
| D-022 | 2026-05-15 | medium | Vitest/Vite (`vitest` 2.1.9) did not recognize Node 24's `node:sqlite` builtin while collecting `session-sql` store tests; it attempted to load `sqlite`/`node:sqlite` as a URL and failed before running tests. | none after discovery; tests could not collect | Added a narrow `vitest.config.ts` plugin shim that resolves `node:sqlite`/`sqlite` to a virtual module backed by `createRequire('node:sqlite')`. `npm test -- .pi/extensions/session-sql/store.test.ts` then passed. | encoded |
| D-023 | 2026-05-15 | medium | Extension templates still encoded two retired patterns discovered while scaffolding `session-sql`: `index.ts.template` cleared status with `""`, and `smoke.ts.template` emitted legacy `{ send, expect, delay }` steps instead of current Driver SDK `Step` unions. | Replace generated extension files manually before using them. | `harness/templates/extension/index.ts.template` now clears status with `undefined`; `harness/templates/extension/smoke.ts.template` now imports `Scenario` and uses `kind: "type"` with `press`/`expect`. | encoded |
| D-024 | 2026-05-15 | medium | Driver SDK `waitIdle()` only checked the last non-empty line for pi's prompt/footer regex. When `session-sql` set a footer status, pi rendered `MCP: 0/1 servers session-sql: ready` after the model/footer line, so smoke boot timed out even though pi was idle and ready. | None durable; smoke could avoid setting status, but that weakens the extension UX. | `harness/driver/session.ts` now checks the last five non-empty lines for the prompt/footer signal instead of only the final line, preserving status-line compatibility. | encoded |
| D-026 | 2026-05-15 | low | Plan-3 architect emitted Create-tasks (`T001`: "Create `docs/domains/registry.md`"; `T002`: "Create `docs/domains/domain-map.md`") without pre-flight file-existence checks. Both files already existed from plans 006 + 009 work, so Phase 0 had to reframe these as MODIFY at execution time. Companion review F003 (Plan 008 Phase 0 close) flagged this as harness friction worth ledgering globally, not only in the phase log. Originally caught + logged in `tasks/phase-0-prerequisite/execution.log.md` as discovery D08-P0-01. | (a) one-shot: read existing tasks.md + reframe before editing (done in Phase 0); (b) durable: plan-3 (or plan-4 readiness gate) should run a file-existence check across all task `Path(s)` entries and rewrite "Create" → "Modify" where the path is already tracked. | Encoded fix is a planning-skill improvement, not a code change in pij. Track at the skill repo (`/Users/jordanknight/.pi/agent/skills/plan-3-v2-architect/` and/or `plan-4-readiness-gate-v2`). Until then, plan-6 should treat Create vs Modify as a soft hint and verify file existence at the top of any structural task. | open (skill-side encoding pending) |
| D-027 | 2026-05-15 | medium | During Plan 010 companion-mode implementation, an unrelated concurrent commit advanced `HEAD` between `git commit` and the companion ping. The scripted `git rev-parse --short HEAD` ping referenced the wrong SHA (`5a22e02`) before a corrected ping was sent for the intended T002 commit (`42d86fd`). | Use the SHA printed by `git commit`, or resolve the intended commit explicitly, before sending companion review requests in shared/concurrent worktrees. | Skill-side improvement: `plan-6-v2-implement-phase-companion` should capture the commit SHA immediately from the commit operation or verify `git show --name-only <sha>` matches the staged task paths before pinging. | open (skill-side encoding pending) |
| D-028 | 2026-05-15 | low | Todo smoke initially asserted post-`/reload` state immediately after matching the reload notification. Pi had rendered the reload result/status but was not yet ready for the next typed command, so the `/todo list` assertion raced and failed. | Add an explicit Driver SDK `wait` step after `/reload` before issuing the post-reload command. | `.pi/extensions/todo/smoke.ts` now waits after `/reload`; broader template/guidance could recommend a wait after reload even when the reload command has a positive expectation. | encoded locally (template/guidance pending) |
| D-029 | 2026-05-16 | low | A cross-extension event named `session-sql:changed` was initially emitted after every successful ad-hoc SQL command/tool call, including read-only `SELECT`, because `INSERT ... RETURNING` can look like a row result. Companion review caught the contract drift: read-only inspection should not reset todo widget pagination or imply mutation. | Gate the event on conservative mutating SQL syntax plus reset; accept that exotic SQL hidden in strings/comments may be out of scope for this trusted local tool. | `.pi/extensions/session-sql/index.ts` now uses `looksMutatingSql()` before emitting `session-sql:changed`; todo smoke covers the mutating `/sql UPDATE` refresh path. | encoded |
| D-030 | 2026-05-16 | low | Companion retro MH-001: final `output/report.json` had to manually mirror findings that already existed in inbox messages; there is no automatic export from companion inbox findings/summaries into the final report. | Manually tracked task ids, finding ids, and `ackOf` values during the run, then copied the final finding content into the JSON envelope/retro. | Follow-up harness improvement: add a first-class companion command/template that builds a cumulative finding report from inbox messages automatically. | open |
| D-031 | 2026-05-16 | low | `just new minih-workbench` produced a scaffold whose `store.ts` tripped Biome on an unused starter `DeleteResult` alias, so the first lint before commit failed until the generated file was edited. | Remove the unused alias in the generated extension before committing. | `harness/templates/extension/store.ts.template` now omits the unused `DeleteResult` alias, so future generated extensions stay lint-clean. | encoded |
| D-032 | 2026-05-16 | medium | Plan 007 Phase 1 companion run went stale after sending a final approving inbox summary but before writing `output/report.json`, so retro/magicWand were initially missing. Recovery run MH-001 requested a first-class stale-run report recovery flow. | Booted a fresh `code-review-companion`, briefed it with the stale run id and execution-log evidence, sent `control:stop`, and read the recovered farewell envelope. | Wishlist: add `minih recover-report <slug> <runId>` to draft a farewell envelope from a stale run's inbox messages, summaries, findings, and last control message, then mark fields needing confirmation. | open |
| D-033 | 2026-05-16 | medium | Phase 2 companion farewell MH-003: status-only/final-drain coordination messages had to be sent as `type=task`, making lifecycle notes indistinguishable from review requests and muddying task counts. | Used descriptive subjects (`still working`, `final-drain`) and the companion read subject/body to avoid treating them as review diffs. | Wishlist: add first-class review-drain/control vocabulary in the Minih coordination UI/protocol so status-only notes are not typed as review tasks. | open |
| D-034 | 2026-05-16 | low | Phase 2 companion farewell MH-001: the companion prompt expected `MINIH_PROJECT_ROOT`, but the shell did not expose it during orientation. | Companion used the explicit repo root from session context: `/Users/jordanknight/pi-hacking/pij`. | Consider exporting `MINIH_PROJECT_ROOT` from the companion boot recipe or updating companion prompt guidance to prefer explicit repo-root context when present. | open |
| D-035 | 2026-05-16 | low | Phase 2 companion farewell MH-002: focused Vitest validation attempted `--runInBand`, but Vitest 2.1.9 rejected that flag. | Companion reran the focused test command without `--runInBand`. | Add Vitest-version-safe focused-test guidance to companion/test prompts if this repeats. | open |
| D-036 | 2026-05-17 | medium | Phase 3 companion farewell MH-001: final report generation required manually reconstructing cumulative findings from inbox traffic and compaction summary rather than exporting them from coordination state. | Kept finding ids and ackOf references during review and manually populated `output/report.json`/ledger rows. | Wishlist: generate companion reports automatically from acked inbox findings/summaries/dispositions. | open |
| D-037 | 2026-05-17 | low | Phase 3 companion farewell MH-002: shell did not expose `MINIH_PROJECT_ROOT`, so orientation had to rely on explicit repo-root context. | Used `/Users/jordanknight/pi-hacking/pij` as the project root for file and git reads. | Consider exporting `MINIH_PROJECT_ROOT` from companion boot or updating companion prompts to prefer explicit repo-root context. | open |
| D-038 | 2026-06-17 | high | Live `file-watch-notify` runtime-watch test crashed pi after a peer/session died: an async `FolderWatcher` callback called `ctx.isIdle()` on an extension ctx that pi had marked stale after session replacement/reload (`ExtensionRunner.assertActive`). Any watcher wake after ctx invalidation could bring down the host process. | Restart pi; avoid relying on a runtime watch across reload/session replacement. | Encoded immediately in `makePiInjectPort`: stale/throwing `ctx.isIdle()` is treated as busy (steer), and stale/throwing `sendUserMessage()` is caught/dropped rather than escaping from the watcher callback. Regression tests cover stale `isIdle()` and stale send. | encoded |
| D-039 | 2026-06-17 | medium | The Plan 015 runtime-control amendment shipped `/file-watch-notify watch/list/stop` as slash commands only. That satisfied a human UI but failed the actual agent workflow: the LLM could not call the extension to arm watches itself, forcing the user to type slash commands and breaking peer-test automation. A second live test exposed that broad `scratch` watches also need `recursive:true` to catch files created in existing subdirectories. | User manually typed `/file-watch-notify watch ...`; assistant used existing already-armed paths; initial tool test missed nested `scratch/fwn-demo` creation. | Encoded immediately by adding the primary `file_watch_notify` `registerTool()` surface (`status`/`list`/`watch`/`stop`) sharing the same watcher registry as the command, plus `recursive?: boolean` pass-through for broad scratch watches. Docs now describe tool-first control and recursive scratch use. Follow-up candidate: the-flow review should explicitly ask “is this a human command, an LLM tool, or both?” and “does broad watch imply recursive?” for runtime-control features. | encoded |
| D-040 | 2026-06-17 | medium | A pij peer (`pij-61155`) “went crazy” on a later `/new`-style reboot: searching the repo, running every `pij` command, then reading its own `inbox/*.json` and **re-executing a stale task** from hours earlier (created a `scratch/` file + replied DONE). Two root causes: (a) the boot self-announce was imperative (listed `pij` commands like a to-do list), and (b) delivered messages persist as inbox files with nothing marking them consumed, so a model that snoops the inbox treats old instructions as live. | Identified via `~/.pij/pij-61155/events.ndjson` reconstruction of the reboot window. | Encoded in `announceText`: made the briefing non-imperative (“context only — no action required”) and added an explicit “do NOT read/list/act on inbox files; only `[pij from <id>]` injected messages are live” guard, with regression tests. Also added a `pij peer messaging — usage` section to `.pi/APPEND_SYSTEM.md`. Deferred (defense-in-depth): lifecycle consumed inbox messages into a `consumed/` subdir so a snoop can’t replay them even if the briefing is ignored. | encoded |
| D-041 | 2026-06-17 | low | `/new` did not mint a new `pij-` id: the id was `pij-${process.pid}`, and `/new` reuses the same OS process, so the pid (and id) never changed — a `/new` session kept impersonating the old peer (and reused its dataDir/inbox). | Use a fresh OS process (relaunch pi) to get a new peer id. | Encoded: derive the id from pi's own session id via `deriveSelfId(ctx.sessionManager.getSessionId(), pid)` (FNV-1a→base36 slug), which changes on `/new` and `/fork` but is stable across `/reload`/`/resume`; falls back to `pij-<pid>` when pi exposes no session id. `index.ts` also drops the prior descriptor when the id changes so `/new` doesn't leave a duplicate live peer. Pure helper + tests in `core/discovery.ts`. | encoded |
| D-042 | 2026-06-17 | medium | Sending a control command to a peer had two traps. (a) **Sender-side**: `compact`/`reload`/`new` only execute when sent via `--command <name>`; the natural `pij send peer "/compact"` delivered `/compact` as chat text into the peer's LLM (verified live on pij-d8vukk: it ran a shell tool reacting to the text). (b) **Receiver-side**: `reload`/`new` live only on pi's `ExtensionCommandContext` (“safe only in user-initiated commands”), not the long-lived ctx the receive loop holds, so they cannot run autonomously like `compact` (which is on the long-lived ctx). They defer+wake until the peer runs `/pij` once to arm a captured command context. The old wake said “run /pij in this session to apply” — but the wake lands in the peer's **LLM**, which cannot run slash commands, so the agent just spun on it. | `pij send peer --command compact` for commands; a human runs `/pij` in the peer to arm reload/new. | Encoded (B): (1) sender-side **auto-route** — a bare, trimmed `/compact`\|`/reload`\|`/new` text body is rerouted to the command path in `core/cli.ts` (exact match only; `/unknown` and `/compact please` stay text). (2) reworded the deferred-wake so the peer's LLM **relays to its human operator** (“you cannot run a slash command yourself — ask your human to run /pij once”). Confirmed via live `--command compact` (executed:true, no LLM text) and `--command reload` (deferred+wake) on pij-d8vukk. Accepted pi limitation (not pursued): `reload`/`new` can only run from a captured command context, and `reload` re-runs the extension so it disarms itself each time — documented in `docs/how/pij.md` (remote `reload` is best-effort; prefer the peer's human typing `/reload`). | encoded |
| D-043 | 2026-06-17 | medium | Couldn't get an agent to **see a pasted image** over a remote xterm.js→tmux terminal. Three layered causes: (1) pi's interactive TUI only attaches images via clipboard paste (`Ctrl+V` / `app.clipboard.pasteImage`) — unavailable with no local clipboard; typing/dropping `@/path.png` inserts only the *path text* (file-reference feature), never image bytes. (2) The stale APPEND_SYSTEM note claimed “interactive never attaches images (bug 0.75.5)” — but 0.79.6 added Ctrl+V paste; print-mode `pi -p @img` always attached (`cli/file-processor.ts`). (3) Even with `-p @img`, the image is dropped unless the **model advertises `input:["text","image"]`** — the default `mai-code-1-flash-internal` is text-only, so it reported “image omitted/not accessible”; `claude-opus-4.8` has vision. Plus an earlier trap: a plain `pi -p` child activated pij and collided (“Agent is already processing”). | Shell a one-shot vision child: `PI_SUBAGENT_CHILD=1 pi --no-tools --model github-copilot/claude-opus-4.8 -p @<abs> "describe…"`. | Encoded: new **`image-see`** extension registers an agent-callable `see_image` tool that does exactly this (pure argv/model/validation in `store.ts`, fs+spawn in `index.ts`), defaulting to a vision model and forcing `PI_SUBAGENT_CHILD=1`. Symlinked globally via `just link` so it loads in every pi session, any cwd. Verified live: the child described the actual git-push screenshot. Diagnosis: Perplexity + reading installed pi dist (`file-processor.ts`, `keybindings.js`) + `~/.pi/agent/models.json` `input` arrays. | encoded |
| D-044 | 2026-07-11 | high | A stale control-plane descriptor with queued mail pointed to a vanished tmux pane. `DaemonTmux.sendText` let `send-keys` throw; the interval-level catch aborted the entire tick, left the message queued, and retried it forever. Healthy peers stayed `active` but every send remained queued. A coincident tmux window rename was initially suspected, but pane IDs remained stable and correctly bound. | Force-close stale descriptors one at a time (`pij close <id> --force`) and restart the daemon. | FX002: `sendText` now maps pane errors to `unverified`; `Daemon.tick` isolates pending/bound work per descriptor so no peer can block unrelated sessions. Tests were RED before the fix; full pij suite and a live restart/canary passed. Residual automatic stale-descriptor cleanup is tracked separately. | encoded |
| D-045 | 2026-07-21 | medium | Real `FsChannel` pollers in Telegram bridge/index and channel cleanup tests exceed their 10–20s budgets under shared-workstation load. Repeated full gates failed on different subsets; focused assertions passed, and even one-worker runs observed 32–45s tails. | Raise only these pre-existing test budgets to 60s so the ship gate remains bounded and truthful under load. | Replace wall-clock polling with deterministic/fake-timer scheduling so the tests prove drain order and routing without filesystem or machine-load dependence. | mitigated (fake-timer fix open) |
| D-046 | 2026-07-29 | high | Plan 074 item #35: `pij adopt` used `RegistryPort.write()`, whose `void` signature made the dissolved-tombstone refusal at `adapters/fs-registry.ts:205-211` undetectable. `RegistryPort.revive()` already returned `Result<void>` for replacing that tombstone, but adopt never called it and printed the requested pane as `(bound)` despite persisting nothing. | Use `pij revive <id> --attach "$TMUX_PANE"` for a dissolved seat. | Resolved: adopt now routes the dissolved descriptor through `revive()`, fails on its tagged error, re-reads the persisted descriptor before rendering, and derives both pane and binding state from disk. Live and pending adopt paths remain regression-locked. | resolved |
| D-047 | 2026-07-29 | high | A permanent baseline red in `cli.integration.test.ts` — a file edited by phases 3, 4, and 6 — became attribution noise that could absorb a new failure invisibly; it was loosely misattributed to Phase 6 before its independent doc drift was traced. The same morning's pre-fix T002 exited 0 claiming the requested `%74` was bound while disk remained dissolved on `%73`, direct proof that adopt interpolated the pane from intent rather than persisted state. | Run focused tests for every changed guard, then require an exact zero-failure full-suite count instead of carrying a standing red. | Fixed the stale C1 prerequisite expectation, restored the full suite to zero failures, and mutation-locked each persisted-adopt rejection arm (`missing`, `dissolved`, `pane-mismatch`) so the success-line guard cannot silently disappear. | resolved |

## Severity

- **high**: blocks all extension authoring, or risks silent data loss.
- **medium**: slows authoring; common case.
- **low**: rare; one-off fix is fine.

## Status

- **open**: known, no mitigation yet.
- **mitigated**: workaround in place; durable fix pending.
- **encoded**: durable fix landed (template, lint, generator).
- **resolved**: fix verified by passing tests/smoke.

## 2026-06-16 — Plan 014 Phase 3 (pij extension) companion run

- **MH-001 [degrading, RECURRING ×3] config** — `MINIH_PROJECT_ROOT` resolves to the
  companion's *run folder*, not the repo root, so the companion's first `docs/plans`
  lookup finds nothing and it must recover via `git rev-parse --show-toplevel`. Seen in
  runs `308c`, the earlier pi-peacock run, and now `5219`. **Companion magicWand (target:
  minih runner):** validate + expose `MINIH_PROJECT_ROOT` as the repo root (or add an
  explicit `MINIH_REPO_ROOT`). **pij-side mitigation candidate:** our companion-boot path
  should `export MINIH_PROJECT_ROOT=$(git rev-parse --show-toplevel)` before `minih run`
  — encode this in the the-flow companion-boot wrapper rather than re-hitting it every run.
- **MH-002 [annoying] coordination** — the companion's own prompt mandates a per-task
  summary message, but our outside protocol asked for replies *only on issues*. The
  companion resolved it by withholding no-op summaries. Worth aligning the two protocols
  so "reply only on findings" is first-class (no per-task ack/summary obligation).
- **Stop/send adapter mismatch (recurring):** the Pi `minih_send_message` / `minih_stop_run`
  tools fail `MINIH_RUN_NOT_FOUND` (different adapter root); the `minih outside inbox`
  CLI works. Use the CLI for companion comms until the Pi adapter root is reconciled.

## 2026-06-16 — Plan 014 Phase 4 (pij CLI) companion run

- **MH-001 [degrading, RECURRING ×4] config** — `MINIH_PROJECT_ROOT` again unavailable / resolved
  to the companion's run folder, so the mandated initial `cd` didn't reach the repo root. Seen in
  runs `308c`, pi-peacock, `5219`, now `b4f0`. **Companion magicWand (target: minih runner):** export
  `MINIH_PROJECT_ROOT` reliably + add a companion-boot preflight that fails loudly if it points at the
  run dir. **pij-side mitigation (still open):** `export MINIH_PROJECT_ROOT=$(git rev-parse --show-toplevel)`
  before `minih run` in the companion-boot path.
- **NEW [annoying] test-ergonomics → FIXED** — the canonical `just test` recipe didn't accept a file
  argument (`just test path/x.test.ts` → "unknown recipe argument"), so the companion couldn't scope a
  single test file. **Encoded the fix immediately**: `test *ARGS: npm run test -- {{ARGS}}` — `just test`
  (no args) still runs the full suite (self-check unaffected); `just test <file>` now scopes to it. A real
  user (the companion) hitting our canonical interface → encode, don't document.

### Companion findings this run (both fixed inline)
- **F001 [HIGH]** `parseArgs` too lenient vs the E-ARG contract → strict per-verb flags/arity/numerics +
  text-xor-command + `--wait <ms>` (`a031b70`).
- **F002 [HIGH]** `tail --follow` never advanced (re-dispatched with `follow:false`) → `follow:true`,
  verified live (`53160a7`).

## 2026-06-16 — Plan 014 Phase 5 (smoke/CI/docs) companion run (e04a)

- **NEW [annoying] cross-extension smoke flake** — `just self-check` exits non-zero
  because the unrelated **pi-peacock** smoke fails: an Anthropic `400` extra-usage/
  billing error ("Third-party apps now draw from your extra usage") **plus** a model
  mismatch (the smoke asserts `gpt-5.5 • medium`, the env runs `claude-opus-4-7`).
  Not pij's concern, but it red-lines the shared `self-check` gate so a pij phase
  can't show a globally-green self-check. **Encode candidate**: make smoke assertions
  model-agnostic (don't hard-match the model name), and/or let `self-check` smoke be
  per-extension so one extension's environmental failure doesn't fail the whole gate.
- **Companion (e04a) findings**: 6 (5 MED, 1 LOW) — all addressed inline: F002 AC-6
  command happy-path test, F004/F005 doc accuracy, F001 T001 done-when, F006 T006
  done-when honesty (self-check caveat). F003 (report-only `npm audit` vs AC-12
  "green in CI") escalated to the user as a policy sign-off.

## 2026-06-16 — Live pij two-session test (pij-7794 ↔ pij-21756)

- **FIXED [annoying] `just pij send` broke on shell metachars** — the `pij *ARGS`
  (and `test`/`pkg`) recipes interpolated `{{ARGS}}`, which re-splits args and lets
  the shell interpret `()` etc., so `just pij send <id> "msg (with parens)"` failed
  with a bash syntax error. **Encoded the fix immediately**: added
  `set positional-arguments` to the justfile + switched the three variadic recipes
  to forward `"$@"` (preserves quoting/spaces/metachars). Verified live: the exact
  failing message now sends cleanly; `list`/`whoami`/`pkg`/`test <file>` unaffected.
  Surfaced by the first real cross-session messaging test — the system otherwise
  worked end-to-end (send → receive → reply → receipts → state/tail observation).

- **[P1 → FIXED] pij broke the `pi-subagents` tool globally** (2026-06-17).
  Every foreground `subagent(...)` launch failed instantly with `Agent is already
  processing. Specify streamingBehavior (...)`, for all agent types, persistently
  across pi restarts — blocking `validate-v2` fan-out and the harness pre/post
  seams all session. **Root cause (ours):** `pi-subagents` spawns each foreground
  child as `pi --mode json -p "<task>"`; the child loads our globally-symlinked
  `pij`, whose `session_start` announce is a `sendUserMessage` (turn-triggering
  prompt) that **races the child's `-p` task prompt** → the pi SDK throws
  `Agent is already processing` (`agent-session.ts:739`). Persistent because pij
  is always `just link`ed globally; global because every child loads it.
  **Encoded the fix:** `core/discovery.ts isSubagentChild(env)` (pure, tested) +
  early-return in `index.ts` — pij no longer activates when `PI_SUBAGENT_CHILD=1`
  / `PI_SUBAGENT_DEPTH>0` (a throwaway child is never a real peer). Proven live: a
  subagent canary returns OK with no restart (`bb3e40e`). **Lesson:** any globally
  linked extension that injects at `session_start` will break subagent children
  spawned via `-p`; guard `session_start` injectors on the subagent-child env.

- **D-032 [medium, open] Fresh-worktree smoke stalls at Pi trust** (2026-07-12).
  Pi stops at `Do not trust (this session only)` and the Driver SDK has no
  deterministic trust/approve option. A temporary tmux-global PATH wrapper works
  but mutates shared machine state. Encode a Driver `BootOpts` trust/argv seam.

- **D-033 [medium, open] Pi-peacock smoke pins the main checkout** (2026-07-12).
  Its cwd/branch assertion hardcodes `~/pi-hacking/pij`, so healthy worktrees fail
  the full gate. Derive expected cwd/branch from the scenario environment.

- **D-034 [high, encoded] Happy-path messaging gates missed destructive races**
  (2026-07-12). Green tests did not catch partial batch message loss,
  uncorrelated receipt loss, invalid ambient fallback, or duplicate receipt
  publication under stale consumers. Cold review found all four; permanent
  malformed-batch, invalid-identity, stale-consumer, and real two-process
  hard-link regressions now encode the missing back-pressure.

- **D-035 [medium, open] Test suite's 5s subprocess budgets assume an unloaded
  machine** (2026-07-26). Full `just test` runs failed intermittently on a
  16-CPU box under load average ~190 (three concurrent `copilot --yolo` peers at
  172%/80%/78% CPU). Every failure was `Test timed out in 5000ms` — **zero
  assertion failures** — and the failing SET changed every run (8, then 5, then
  11 tests), which is the signature of resource starvation, not a defect.
  **Controlled proof:** the failing files run in isolation give 317 passed / 0
  failed; the entire suite at `npx vitest run --maxWorkers=3` gives 198 files
  passed, exit 0, at *higher* load (171→198) than the run that failed. So the
  fragility is vitest's default worker count multiplying against tests that each
  shell out to a subprocess under a fixed 5s budget. **Not fixed, deliberately:**
  `--maxWorkers=3` was a diagnostic flag only — no repo config was changed, no
  timeout loosened, no assertion weakened. Encoding it as the default would hide
  the fragility rather than fix it, and would slow every clean run. **How to read
  a red gate here:** before blaming a diff, check `uptime` and whether the
  failures are timeouts with no assertion failures; if so, re-run the failing
  files in isolation and the suite at reduced parallelism before concluding
  anything. **Lesson:** a gate whose result depends on ambient machine load is
  not pinning behaviour ([`green-that-lies`](./how/green-that-lies.md) mechanism 5 — passes only because of ambient environment) — and on this box the
  ambient load is *our own fleet*, so the gate gets less trustworthy exactly when
  the most work is in flight. Surfaced by pij-able-damselfly during s072 fix
  round 01; routed here by pij-reasonable-dove because `docs/` was outside the
  worker's allowed paths.

- **D-036 [medium, encoded] An occurrence count over prose is a proxy, and the
  requirement it stands in for is almost always assertable directly**
  (2026-07-30). `acceptance-sweep.test.ts` asserted
  `route.match(/pij report now/g)` had length **2** — a proxy for "the route
  documents both edges of work". It broke the moment `orchestrator.md`
  legitimately mentioned `pij report now` a third time (relaying it while
  supervising the fleet's cards), turning **main red** on a docs-only commit.
  The tempting fix is bumping 2 → 3, which leaves the brittleness armed for the
  next legitimate edit. **Encoded instead as a proxy-to-direct upgrade:** assert
  the two required commands verbatim, per route. That is simultaneously
  **stricter** (a route could previously satisfy the count with two wrong
  commands) and **stable** (unrelated prose cannot trip it) — rare, since most
  stability fixes buy calm by weakening the assertion. **Lesson:** when a test
  counts occurrences in prose, ask what requirement the count is standing in
  for, then assert that instead.

- **D-037 [high, encoded] A comment that lied about its own code, found only by
  testing the predicate rather than reading it** (2026-07-30). The `status-stale`
  scope gate read `projectOrchestrationRole(descriptor) === null`, and the
  comment beside it said workers were excluded because their card renders
  nowhere. But a seat explicitly stamped `worker` projects to `"worker"`, not
  `null` — so it sailed through the gate, and holding a real `statusAt` it
  **fired**. The comment described the intent; the code implemented something
  narrower; the two had never been checked against each other. Existing coverage
  used an *unstamped* seat, so the gap was invisible from tests too. Found only
  by extracting the rule into `cardCanMislead()` and writing the truth table —
  the stamped-worker row was the one that disagreed. Encoded as a named
  predicate plus a test that kills exactly that mutation. **Lesson:** this is the
  [`green-that-lies`](./how/green-that-lies.md) family at the *comment* layer — a comment is an unexecuted
  assertion, so a rule worth commenting is a rule worth extracting and pinning.
  Reading the code beside it will not find the divergence; only executing the
  rule will.

- **D-038 [high, open] A remedy that has the shape of the bug it fixes**
  (2026-07-30). `c0c52b0` shipped the rule *"a scoped query must say what it did
  NOT look at"* — `pij anomalies --here/--project` now names its scope and the
  rows it hid. But the footer is guarded by `if (anomalies.length === 0)`, so it
  **only speaks when it found nothing at all**. A scope that returns 1 row while
  hiding 8 prints no footer whatsoever. The fix for silent-about-what-it-missed
  is itself silent about what it missed, one level inside its own remedy — and
  the partial case is the *more* dangerous one, because a non-empty result reads
  as a complete answer where an empty one at least prompts suspicion.
  **Why this class is the worst one:** a remedy is the last place anyone
  re-audits. It carries the credibility of having *been* the fix, so the next
  reader treats it as settled ground and reasons *from* it rather than *about*
  it. Three of this week's defects share the parent shape — *a tool that is
  correct and silent about what it did not look at* — and this is the first
  instance found **inside a fix for that same shape**. **Encoding when fixed:**
  the footer must fire on ANY filtering, not only total emptiness; more
  generally, when you ship a rule, immediately apply that rule to the code you
  just wrote. **Lesson:** ask of every fix "does my remedy exhibit the defect it
  remedies?" — it is a cheap question and this fleet keeps finding the answer is
  yes.

- **D-039 [high, open] Silence is not consent — it is absence of test**
  (2026-07-30, spine 25526). The o-prime ruled s074's merge human-gated, then
  accepted **seven** subsequent merges without once flagging that they bypassed
  that gate. On the eighth, the PM cited the pattern as standing precedent and
  merged unrelayed. Both readings of that were wrong in the same way: the prime
  called its silence a *rule it had stopped enforcing*; the PM had read it as
  *authority granted*. Neither was true — **seven unchallenged merges are not
  approval, they are seven occasions on which the rule was never tested.** The
  PM read *absence of contradiction* as *presence of evidence*.
  **This is the third altitude of one failure shape in a single day**, and
  seeing them together is what makes it nameable:
  | altitude | the unexamined signal | what it was treated as |
  |---|---|---|
  | code (D-037) | a comment nobody executed | a description of the code |
  | inference (INS-001) | a human's "should" nobody measured | a statement of current fact |
  | governance (this) | a precedent nobody had challenged | a granted authority |
  | proof (D-040) | a type invariant nobody ran a parser against | a working vocabulary |
  | measurement (D-041) | a key the projection never emitted | a value that is null |
  | policy (D-042) | a verb correctly refused in isolation | a role that can still do its job |
  **Why governance is the worst of the three:** a prime's silence is the
  cheapest thing in the system to mistake for a ruling — it costs nothing to
  emit, arrives continuously, and looks identical whether it means *approved*,
  *not looking*, or *asleep*. Code and comments at least sit still to be read.
  **Encoding, when ruled:** the standing merge rule must be written down rather
  than inferred from what has been tolerated — and any authority derived from
  *"this went unchallenged N times"* should be stated as an explicit question,
  not exercised. **Lesson:** before acting on a precedent, ask whether it was
  ever *decided* or merely *never contested*. Surfaced by pij-unwilling-butterfly
  against its own decision; recorded by pij-wee-albatross.

- **D-040 [high, encoded] A widened type is not a widened vocabulary**
  (2026-07-31, PR #68). s078 added `pa` to `StoredOrchestrationRole`. Two
  compiled exactness invariants (`Assert<Exact<…>>`) proved the union had
  widened, the suite was green, and the PR was approved for merge. **`pij link
  --role pa` had returned `E-ARG` the entire time.** Both producer parsers
  guard with `role !== "pm" && role !== "worker"` — a comparison against a
  `string`, which the compiler cannot relate to the union at all. So widening
  the type produced **zero** compile errors at the exact two places that decide
  whether the value may ever be typed. The type test passed on a vocabulary no
  parser would accept.
  **The near miss is the point:** the o-prime had already measured the failing
  command and diagnosed it as *"the producer has not merged yet"* — a causal
  story that was never tested. Had #68 merged on that reading, it would have
  gone green, the PA chip would have stayed dormant, and three seats would each
  have held a correct-looking half. It was caught only because someone went to
  look at *why the reported command failed* instead of trusting the diff.
  **Encoding:** the vocabulary is now DATA (`STORED_ORCHESTRATION_ROLES`) with
  the type *derived from it*, one `isStoredOrchestrationRole` guard consumed by
  both parsers, and `STORED_ROLE_CHOICES` in every usage and error string —
  a member cannot be added to the type without the guard and the help text
  widening with it. Tests **iterate the vocabulary** rather than naming members,
  so a future member a parser refuses fails *with the parser named*.
  **Lesson:** a compiled invariant proving a type is *exact* proves nothing
  about a parser that compares *literals* against it. The technique that would
  have caught this — an exhaustive table test — had been written by the same
  seat, the same day, one file over, for the capability gate. **The failure was
  not ignorance of the technique but not seeing that a second surface needed
  it.** Surfaced by pij-wee-albatross's measurement; fixed and recorded by
  pij-unwilling-butterfly.

- **D-041 [medium, open] The reader can manufacture the absence**
  (2026-07-31). Measuring how many seats lack a parent, the PM ran
  `pij list --json` and counted `d.parent == null`, getting **122 of 122
  parentless** — a number it did not believe and therefore checked.
  `list` does **not project `parent` at all**; the reader had turned a *missing
  key* into a *null value*, i.e. manufactured the very absence it was measuring.
  The real answer, from a projection that carries lineage, is that every roled
  seat has a parent except two workers.
  **Why it is worth a row despite being caught:** nothing in the output would
  have corrected it. A projection that omits a key and a projection that reports
  the key as null are **indistinguishable to a reader that uses `?? null` or
  `== null`**, and the fabricated answer is the *alarming* one — it reads as a
  fleet-wide defect and would have justified work that was not needed.
  **Lesson:** when a measurement returns a total or near-total result, suspect
  the reader before believing the finding — check that the field being counted
  is actually *present* in the projection being read. Same class as the doctrine
  filed the same morning against `jq` object construction; this instance is the
  agent-side twin. Recorded by pij-unwilling-butterfly against its own
  measurement.

- **D-042 [high, open] Exhaustive classification cannot see a composition gap**
  (2026-08-01, plan 078). The PA capability gate refuses the entire `watchdog`
  family to role `pa` (`pa-capability.ts`, `watchdog: refuse("it changes
  supervision policy for a seat")`), and `watchdog watch` only ever registers
  `watcherId: self.value` — the caller, never a third party. **So a PA cannot
  subscribe itself, and its prime cannot subscribe it on its behalf: the
  deterministic push hook the entire PA concept names as its trigger is
  unreachable from inside the role.** Found by a flash-tier PA within its first
  hour of existing; verified at source independently by the o-prime and by the
  seat that shipped it.
  **Why this is a NEW altitude and not another D-040:** the same day's fix for
  D-040 was an exhaustive table test asserting every verb is *explicitly*
  classified, and that test **passed here and was right to pass** — `watchdog`
  IS classified, correctly, as refused. **Neither half is wrong alone.**
  Refusing a PA the ability to change supervision policy is defensible;
  registering only the caller as watcher is defensible. The defect exists
  *solely in their conjunction*, and lives in **two files neither of which is
  incorrect**.
  | technique | proves | cannot see |
  |---|---|---|
  | compiled exactness (D-040) | the type is the set we meant | any parser comparing literals |
  | exhaustive classification | every verb has a verdict | whether the SET of verdicts leaves the role able to work |
  **Lesson:** completeness over *items* is blind to defects that live in the
  *relationships between* items. A table that is total is not a policy that is
  coherent — "every verb is classified" and "the role can still do the job it
  exists for" are different claims, and only the first is mechanically
  checkable by the technique we leaned on all day. **The honest limit: a
  capability boundary needs a test that the role's PURPOSE remains reachable,
  not only that every verb has an answer.**
  **Workaround in use:** order — `watchdog watch` BEFORE stamping the role; an
  existing subscription survives the role change. (The o-prime's own PA holds
  its subscription only by that accident of sequencing.)
  **Proposed fix (roadrunner, endorsed, next stream):** permit `watch|unwatch`
  for `pa` restricted to **first-person** registration — the same argument the
  gate already makes for `report now` and `state set` — while keeping
  `pause|resume|exempt|interval` refused, since subscribing to notices changes
  no seat's policy.

- **D-043 [high, encoded] A remediation that cannot resolve what it detects**
  (2026-08-04). Five PRs shipped this week; **three were one class**, found at
  three different emitters, none of them findable by reading the code.
  A detector fires correctly and hands the reader an action. The action is
  wrong — and *wrong in a specific way that is invisible from inside the file*,
  because the string is locally sensible and only fails against the **state of
  the seat receiving it**.
  | site | the remedy offered | why it could not work |
  |---|---|---|
  | `status-stale` (#70) | `report now`, listed first | it writes `statusAt` — **the detector's own input** — so it resets the clock on an unchanged wait and the row returns forever |
  | the watchdog nudge (#72) | "you do NOT owe a status card" | it transmitted a ruling **the human had overturned** three days earlier |
  | `axis-disagreement` (#80) | parked states only | the commonest cause is neither waiting nor a lost dispatch — **the work is finished and the record is stale**, and `task close` was never named |
  **The property that unifies them**, and the one worth testing for:
  > **A remediation that writes the detector's own INPUT is a snooze.
  > A remediation that changes the CONDITION it describes is a resolution.**
  **Why none was findable by review.** Each string is coherent read on its own.
  The defect only exists in the *relation* between the string and the
  population that receives it — so you cannot see it in the diff, and a test
  asserting the string's content passes happily. Every one was found by a seat
  **measuring**: cheetah proving `ready` quieted nothing; roadrunner's PA
  watching a correctly-parked seat snooze a row every 30 minutes; and #80 found
  because *our own* assignment sat open four hours after it merged, with every
  option the row offered false of it.
  **The worst variant is the one where compliance produces the harm.** #80's
  remediation would have led an obedient seat to declare a parked state and
  **permanently silence a row pointing at genuine undischarged work** — the
  snooze, arrived at by following instructions correctly. A remedy that is
  merely ineffective wastes a cycle; a remedy that is *plausible and wrong*
  recruits the reader into the failure and leaves them believing they complied.
  **Encoding.** Remediation text now leads with the **condition**, not the
  verb — *"if X is true, do A; otherwise do B"* — and names **every** cause
  including the one where the row is simply **right**. A remediation that never
  admits the alarm might be real teaches seats that every row has a way to make
  it go away, which is how a fleet learns to discount an instrument.
  **The generalisation past remediations:** the same shape governs any
  automated text that instructs. A **stale document is passive** — it fails to
  correct you. A **stale enforcer is active** — it propagates the wrong rule to
  every seat it touches, on schedule, and looks authoritative doing it. So
  *"encode it mechanically"* is **necessary and not sufficient**: the encoded
  thing needs its own freshness check against the ruling that authorises it, or
  staleness has only moved from a file nobody reads to a channel everybody
  obeys. Recorded by pij-unwilling-butterfly; sites found by pij-cheap-cheetah,
  pij-chief-roadrunner and this seat.
