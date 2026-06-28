# Codex spawn support (4th pij harness)

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-06-28
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from research-dossier.md

## Business Specification

### Research Context

Live probe of `codex-cli 0.142.3` + a read of the pij control-plane code established that **codex is a "claude-style" harness**: its interactive TUI auto-generates a session UUID (no launch flag to *set* it — F-01), so binding is **transcript discovery**, not the deterministic `--session-id` path copilot/branched-claude use. Its blanket-permission flag is `--dangerously-bypass-approvals-and-sandbox` (F-02), transport is `sendkeys`, and the one genuinely new surface is a **codex transcript module** — codex logs to `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl`, a date-nested + global tree with its own line schema (F-03/F-04/F-05). Every other branch site already carries a claude arm to mirror (F-06/F-07).

### Summary

Add `codex` as the fourth spawnable harness in the pij control plane, so `pij spawn --harness codex` launches Codex CLI in a tmux pane, the daemon binds it, and `pij send` / `pij tail` drive and observe it — exactly like claude/copilot. Codex reuses claude's transcript-discovery bind path; the only new code is a codex transcript module (layout + session-id extraction + tail summarizer) and a `"codex"` arm at each existing harness switch.

### Goals

- `pij spawn --harness codex [--model <m>]` pops Codex in a tmux pane and the daemon binds it (discovery-based).
- `pij send` controls the codex pane (sendkeys); `pij tail` streams a readable view of its transcript.
- A spawned codex carries the standard identity env (`PIJ_SESSION_ID`, `PIJ_PARENT_ID`, `PIJ_HARNESS=codex`).
- Zero regression to pi/claude/copilot spawn, bind, transport, or tail.

### Non-Goals

- **Branch-from-self for codex** (`--branch`) — codex has `fork`/`resume`, so it's a clean future flip, but `supportsBranching(codex)` stays `false` now.
- Codex `exec` (one-shot non-interactive) mode — pij panes run interactive harnesses only.
- Reworking the claude/copilot bind paths beyond the minimal harness-selection refactor.
- A `--cd` passthrough — cwd flows through the tmux split (F-08).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| pij-control-plane | existing | **modify** | Add codex to spawn/bind/transport vocab + a codex transcript module |
| pij-messaging | existing | **consume** | `selectTransport(codex)=sendkeys`; `HarnessKind` widened (no contract change) |

No NEW domains.

### Testing Strategy

- **Approach**: Full TDD on the **pure seams**, live smoke for the impure wiring (the established pij pattern).
- **Rationale**: the bind/transport/transcript logic is pure and unit-testable with fakes; the daemon+tmux wiring is impure (`runSpawn` news up adapters, the daemon polls real panes) so it's proven by a live tmux smoke — which doubles as the user-requested POC.
- **Focus areas**: codex transcript module (dir/list/session-id/summarizer), `buildControlSpawnCommand` codex arm, `selectTransport`/`supportsBranching` codex cases, the harness-selected transcript layout in discovery.
- **Excluded from unit tests**: the impure `runSpawn` codex branch + daemon poll loop (covered by the live smoke, per Plan 021 Discovery D-01).
- **Mock usage**: targeted fakes for ports (tmux/registry/fs) in unit tests; the real `codex` binary only in the smoke — never mock the binary.

### Documentation Strategy

- **Location**: `docs/how/pij.md` (add codex to the CLI reference + harness/transport table) and `docs/domains/pij-control-plane/domain.md` (History row). Matches Plans 019/021.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=1, D=1, N=1, F=0, T=1
- **Confidence**: 0.85
- **Assumptions**: codex TUI readiness/approval pane text is close enough to claude/copilot for the existing `classifyReadiness`/`classifyInterstitial` to bind it (R-1 — validated by the POC).
- **Dependencies**: `codex-cli` on PATH + logged in (confirmed present).
- **Risks**: see Risks table (R-1 readiness classification is the one to watch).
- **Phases**: 1 (Simple).

### Acceptance Criteria

- **AC-01**: `pij spawn --harness codex [--model <m>]` launches `codex --dangerously-bypass-approvals-and-sandbox [--model <m>]` in a new tmux pane (registry-tracked split, same layout as claude/copilot).
- **AC-02**: the daemon binds the codex pane to its harness session id via **transcript discovery** (no `plannedHarnessSessionId`), recording `harnessSessionId` = the rollout **trailing UUID** — extracted via the layout's `sessionIdOf(path)`, **overriding** `discoverNewTranscript`'s claude-stem default (`transcriptSessionId`) — **and** persisting the discovered absolute rollout path on the descriptor (a new optional `transcriptPath` field) so tail can locate the date-nested file.
- **AC-03**: codex uses `sendkeys` transport — `pij send <codex-id> "<text>"` types into the pane and codex receives it.
- **AC-04**: `pij tail <codex-id>` streams a summarized `[role] text` / `⚙ tool` view of the codex rollout transcript, locating the file via the **persisted `transcriptPath`** (a bare UUID cannot reconstruct codex's date-nested path the way claude's stem→path join does).
- **AC-05**: a spawned codex carries `PIJ_SESSION_ID`, `PIJ_PARENT_ID` (when caller resolves), and `PIJ_HARNESS=codex` in its env.
- **AC-06**: pi/claude/copilot spawn + bind + transport + tail are unchanged (full suite green — regression).
- **AC-07**: `pij spawn --harness codex --branch` is rejected (E-BRANCH) — codex does not support branch-from-self.
- **AC-08**: docs updated — codex appears in `docs/how/pij.md` and a History row in the pij-control-plane domain.

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R-1 codex TUI readiness/interstitial text differs from claude/copilot → daemon never binds/injects | Medium | High | **POC first** (live pane) reveals the real pane text; extend `classifyReadiness`/`classifyInterstitial` patterns only if needed. |
| R-2 codex transcript dir is global → concurrent spawns ambiguous | Low | Medium | new-path-appearance narrows to files created since the spawn snapshot; cwd-filter via `session_meta.cwd` resolves ties; phonehome is the backstop. |
| R-3 spawned codex can't run `pij phonehome` unattended | Low | Low | bind is discovery-first; phonehome is only the confirmatory backstop. |
| R-4 midnight date-dir rollover misses the new rollout | Low | Medium | snapshot/list walks recent date dirs (today + yesterday), not a single day. |

### Open Questions

None blocking — R-1 is resolved empirically by the POC (a plan task), not by a clarification.

### Workshop Opportunities

None — the design is a direct mirror of the claude precedent; no contested design surface.

### Clarifications

#### Session 2026-06-28
- **Workflow Mode** → Simple (single phase; mirrors claude arm + one new module).
- **Testing Strategy** → Full TDD on pure seams + live smoke (the POC).
- **Mock Usage** → Targeted fakes for ports; real codex only in the smoke.
- **Documentation Strategy** → `docs/how/pij.md` + pij-control-plane domain History.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings + the claude-style decision |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round 1 answered; no critical NEEDS CLARIFICATION |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present |
| G6 | Testing Alignment | PASS | TDD — test tasks precede impl tasks; ACs measurable |
| G7 | Domain Completeness | PASS | both domains existing; Manifest covers every file |

### Summary

Widen `HarnessKind` to include `codex`, give it a `sendkeys` transport and a `buildControlSpawnCommand` arm (`--dangerously-bypass-approvals-and-sandbox`), and add a `core/harness/codex.ts` transcript module for its date-nested rollout layout. A small harness-selected transcript layout lets the daemon's existing discovery branch bind codex the same way it binds claude. `pij tail` gets a codex summarizer. A live POC proves the pane pops, binds, controls, and tails before declaring done.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/types.ts` | pij-control-plane | contract | `HarnessKind` union += `codex`; `SessionDescriptor` += optional `transcriptPath` (codex tail locator — Finding 06) |
| `.pi/extensions/pij/core/harness/types.ts` | pij-messaging | contract | `selectTransport` codex case; `supportsBranching` unchanged |
| `.pi/extensions/pij/core/harness/codex.ts` | pij-control-plane | internal | **NEW** transcript module (dir/list/session-id/summarizer/layout) |
| `.pi/extensions/pij/core/harness/transcript.ts` | pij-control-plane | internal | **NEW (or fold into codex.ts)** `transcriptLayout(harness)` selector |
| `.pi/extensions/pij/core/spawn.ts` | pij-control-plane | contract | `buildControlSpawnCommand` codex arm; `CONTROL`/`SPAWNABLE_HARNESSES` += codex; parse text |
| `.pi/extensions/pij/core/daemon/loop.ts` | pij-control-plane | internal | discovery branch uses harness-selected layout (claude behaviour preserved) |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | `runSpawn` codex snapshot branch; `tailTranscript` codex arm |
| `.pi/extensions/pij/core/harness/codex.test.ts` | pij-control-plane | internal | **NEW** unit tests |
| `docs/how/pij.md` | pij-control-plane | contract | codex in CLI reference + harness table |
| `docs/domains/pij-control-plane/domain.md` | pij-control-plane | contract | History row |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Codex auto-generates its session UUID; no launch flag sets it (F-01). | Bind via transcript discovery (claude path) — **no** `plannedHarnessSessionId` for codex. |
| 02 | High | Codex transcript layout differs: `~/.codex/sessions/<date>/rollout-<ISO>-<uuid>.jsonl`, global (not cwd-scoped), distinct line schema (F-03/04/05). | New `codex.ts`: date-tree dir/list, session-id = trailing UUID, cwd-confirm via `session_meta.cwd`, codex tail summarizer. |
| 03 | High | Daemon's `transcriptDir`/`listTranscripts`/session-id are claude-hardcoded (F-07). | Introduce `transcriptLayout(harness)`; discovery uses it; claude behaviour byte-unchanged. |
| 04 | Medium | Readiness/interstitial classifiers tuned to claude/copilot panes (R-1). | POC the live codex pane; extend patterns only if it fails to bind. |
| 05 | High | Blanket-permission flag = `--dangerously-bypass-approvals-and-sandbox`; model = `-m` (F-02). | `buildControlSpawnCommand` codex arm; same trust posture as claude/copilot arms. |
| 06 | Critical | `discoverNewTranscript` returns `sessionId = transcriptSessionId(path)` (the claude **stem**, `claude.ts:109`) and the daemon uses `discovery.sessionId` directly (`loop.ts:206`). For codex the stem is `rollout-<ISO>-<uuid>`, not the UUID — and a bare UUID cannot locate codex's date-nested file (no cwd-scoped `transcriptPathFor` join exists). | In the codex bind branch, derive the id via `transcriptLayout(harness).sessionIdOf(discovery.path)` (the UUID), **not** `discovery.sessionId`; and persist `discovery.path` as `transcriptPath` on the descriptor for tail. |
| 07 | High | **POC-confirmed**: codex writes its rollout **lazily — on the first turn, not at boot** (claude writes at session start). So discovery returns `pending` until the daemon's init-inject triggers codex's first turn; only then does the file appear. The bind therefore completes **after** init-inject (slightly later than claude). | Keep the daemon's poll-until-`found` loop (already handles `pending`); ensure the watchdog clock starts at init-inject (it already does, `loop.ts:180`) so the wait isn't mistaken for a stall. No code change beyond using the existing loop — just don't expect a pre-inject bind for codex. |

### Implementation

**Objective**: Add codex as the 4th spawnable harness — discovery-bound, sendkeys-driven, tail-readable — mirroring claude with a codex-specific transcript module.
**Testing Approach**: Full TDD on pure seams (tests precede impl); live tmux smoke (the POC) for the impure daemon/cli wiring.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Test: `selectTransport(codex)=sendkeys`, `supportsBranching(codex)=false`, `HarnessKind` accepts codex | pij-messaging | `core/harness/types.test.ts` | RED against current code | |
| [ ] | T002 | Impl: `HarnessKind` += `"codex"`; `selectTransport` codex→sendkeys | pij-control-plane | `core/types.ts`, `core/harness/types.ts` | T001 green; suite green | supportsBranching unchanged (false) |
| [ ] | T003 | Test: codex transcript module — `codexTranscriptRoot`, `listCodexRollouts` (recursive date-tree), `codexSessionIdFromPath` (trailing UUID), `summarizeCodexEvent` (session_meta/event_msg/response_item → `[role] text`/`⚙`) | pij-control-plane | `core/harness/codex.test.ts` | RED; fixtures from a real rollout head | Finding 02 |
| [ ] | T004 | Impl: `core/harness/codex.ts` | pij-control-plane | `core/harness/codex.ts` | T003 green | reuse `discoverNewTranscript` shape |
| [ ] | T005 | Test: `transcriptLayout(harness)` selector — claude vs codex `dir`/`list`/`sessionIdOf` | pij-control-plane | `core/harness/*.test.ts` | RED | Finding 03 |
| [ ] | T006 | Impl: `transcriptLayout(harness)` (fold into codex.ts or new `transcript.ts`); claude layout = today's behaviour | pij-control-plane | `core/harness/*.ts` | T005 green; claude path unchanged | |
| [ ] | T007 | Test: `buildControlSpawnCommand` codex arm (cmd `codex`, `--dangerously-bypass-approvals-and-sandbox`, `-m model`, env `PIJ_SESSION_ID`/`PIJ_HARNESS=codex`/`PIJ_PARENT_ID`, **no** plannedHarnessSessionId); `CONTROL`/`SPAWNABLE_HARNESSES` include codex; `parseSpawnArgs` accepts codex; codex+`--branch`→E-BRANCH | pij-control-plane | `core/spawn.test.ts` | RED | Finding 05; AC-01/05/07 |
| [ ] | T008 | Impl: `core/spawn.ts` codex arm + both harness sets + parse error text | pij-control-plane | `core/spawn.ts` | T007 green | |
| [ ] | T009 | Impl: daemon codex bind — discovery branch uses `transcriptLayout`; derive id via `layout.sessionIdOf(discovery.path)` (the **UUID**, overriding `discovery.sessionId` stem default — Finding 06); persist `discovery.path` on the descriptor as `transcriptPath`; cwd-confirm via `session_meta.cwd` on ambiguity | pij-control-plane | `core/daemon/loop.ts`, `core/types.ts` (add optional `transcriptPath`) | fake-port test asserts the bound `harnessSessionId` **equals the file's trailing UUID** (not the stem) and `transcriptPath` is set; claude/copilot bind byte-unchanged | AC-02; R-2; Finding 06 |
| [ ] | T010 | Impl: `runSpawn` codex branch — snapshot the codex layout dir at spawn (not `transcriptDir(home,cwd)`); `tailTranscript` codex arm reads the persisted `transcriptPath` + `summarizeCodexEvent` | pij-control-plane | `cli.ts` | codex spawn writes pending descriptor w/ codex `transcriptsAtSpawn`; `pij tail` opens the descriptor's `transcriptPath` and renders codex lines | AC-04; Finding 06 |
| [ ] | T011 | Docs: codex row in `docs/how/pij.md` CLI ref + harness/transport table; History row in pij-control-plane domain | pij-control-plane | `docs/how/pij.md`, `docs/domains/pij-control-plane/domain.md` | both updated | AC-08 |
| [ ] | T012 | Gate: `npm run typecheck` + `npx biome check` + `npm run test` all green | pij-control-plane | — | clean | AC-06 |
| [ ] | T013 | **POC / live smoke** (user ask): `pij spawn --harness codex` pops a tmux pane → daemon binds via discovery (registry shows bound + harnessSessionId) → `pij send` controls it → `pij tail` shows codex output. Record evidence in execution log. | pij-control-plane | live | pane pops, binds, controllable, tail readable | AC-01/02/03/04; resolves R-1 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T007, T008, T013 | spawn unit + live pane |
| AC-02 | T009, T013 | discovery unit/fake + live bind (registry) |
| AC-03 | T013 | live sendkeys control |
| AC-04 | T010, T013 | tail unit + live tail |
| AC-05 | T007, T008 | spawn env unit test |
| AC-06 | T012 | full suite green |
| AC-07 | T007, T008 | E-BRANCH unit test |
| AC-08 | T011 | docs diff |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| R-1 readiness classification mismatch | Medium | High | POC (T013) before declaring done; extend classifier patterns if needed |
| R-2 global-dir discovery ambiguity | Low | Medium | snapshot-diff + cwd-confirm + phonehome backstop (T009) |
| R-4 midnight rollover | Low | Medium | list walks today + yesterday date dirs (T004) |
