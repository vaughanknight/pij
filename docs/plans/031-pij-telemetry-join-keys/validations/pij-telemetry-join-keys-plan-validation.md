# Validation — pij-telemetry-join-keys-plan.md

**Validated**: 2026-07-04 · **By**: /validate-v2 · **Verdict**: ✅ VALIDATED WITH FIXES
_(initial pass: ❌ NEEDS ATTENTION — 1 HIGH; resolved by the plan v1.1.0 re-scope below)_

## Resolution (plan v1.1.0)
The HIGH was fixed **in** (user decision): copilot adopt-resolution is now scoped as **new code**,
not `transcriptLayout` reuse — a new `copilotSessionStateScan(home)` (findings 02/02b; T005/T006;
Domain Manifest `copilot.ts`), with a T005 case asserting an in-cwd claude transcript is **not**
picked for a copilot adopt (the mis-bind guard), and the global-not-cwd-scoped ambiguity captured
in § Risks. Re-check: the plan no longer claims false reuse; the approach is feasible against source
(`~/.copilot/session-state/<uuid>/events.jsonl` confirmed at `copilot.ts:27`). **Buildable.**

---
_Initial-pass record (retained for provenance):_

## Validation Contract
- **Purpose**: expose the already-persisted harness↔pij join keys + fix adopt self-identity so fleet
  cost attribution (consumer: **pij-4s10mb** telemetry) is a deterministic registry lookup.
- **Promise**: the plan's tasks, once built, produce a correct join tuple per peer AND a correct
  `harnessSessionId` for an adopting orchestrator of **any** harness (claude/copilot/codex).
- **Proof target**: Implementation (a build plan whose approach must be feasible against source).
- **Sources**: `core/harness/transcript.ts`, `core/harness/copilot.ts`, `core/binding.ts`,
  `core/cli.ts`, `core/types.ts`, `core/daemon/loop.ts`, `docs/notes/telemetry-join-keys-scoping.md`.

## Deterministic proof (read fresh)
- ✅ Join key already captured — `harnessSessionId` (`types.ts:81`), written on bind
  (`loop.ts:303/336`); `whoami`/`list` project descriptors (`core/cli.ts:403-440`). Feature #1
  (sessions verb) is a sound projection.
- ✅ codex adopt reuse is real — `transcriptLayout("codex")` = CODEX_LAYOUT (global root, deep
  listing, trailing-uuid id; `transcript.ts:51-55`). Finding 03 holds.
- ✅ claude adopt path unchanged — `resolveAdoptSessionId` (`binding.ts:47-53`).
- ❌ **copilot** adopt reuse is NOT real — see finding below.

## Findings

| Severity | Finding | Evidence | Impact | Smallest fix |
|---|---|---|---|---|
| HIGH | The plan's finding-02 / T006 "reuse `transcriptLayout(harness)` id-extractors" is **false for copilot**. `transcriptLayout("copilot")` returns the **inert CLAUDE_LAYOUT** (`transcript.ts:44,60`; comment: *"copilot/pi never actually discover…this is just the inert default"*), which looks in `~/.claude/projects/<cwd>`. The only copilot code is a path **builder** `copilotEventsPath(home, sid)` (`copilot.ts:27`) that needs the id already — there is **no** copilot session-state *discovery*. | `transcript.ts:44-60`, `copilot.ts:23-27` (path builder, not a lister) | T006's copilot branch is mis-scoped as "reuse" when it needs **new** `~/.copilot/session-state/*` discovery (list dirs, newest by mtime, dir-name = uuid). Worse, naive reuse would resolve a copilot orchestrator to the **newest claude stem** in that cwd → a wrong-harness join key (the precise defect this plan exists to fix, inverted) rather than the safe `pending` fallback. | Narrow finding-02 to claude+codex; make T006 add a **new copilot session-state scanner** (or explicitly scope copilot out of this plan with a noted follow-up). Planning decision — not auto-repaired. |

## Thesis
Advanced but **partial**: feature #1 and the claude/codex halves of feature #2 are feasible as
written; the copilot half of feature #2 rests on a reuse that source disproves. Since the consuming
fleet (pij-4s10mb) is **copilot-heavy**, the copilot case is load-bearing, not incidental.

## Consumers
1 named consumer (pij-4s10mb telemetry) — join-tuple contract (feature #1) satisfied; orchestrator
self-identity (feature #2) satisfied for claude/codex, **blocked for copilot** until T006 is re-scoped.

## Open decision (human-gated)
Re-scope T006's copilot branch to a new `~/.copilot/session-state/` scanner, **or** ship this plan
claude+codex-only and file copilot adopt-resolution as a fast follow. Either resolves the finding.
