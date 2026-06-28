# Research Dossier: add codex as a spawnable pij harness

**Generated**: 2026-06-28T05:20:00Z
**Query**: "Add codex as a spawnable harness in the pij control-plane spawner. Determine codex CLI bind semantics: deterministic session-id (copilot style) vs transcript discovery (claude style); non-interactive/blanket-permission flag; transcript location (bind + pij tail); whether a spawned codex can pij phonehome. Map onto the pi/claude/copilot precedent (Plans 019/021)."
**Effort**: Standard (lead only — live CLI probe + targeted code reads)
**Tools**: Standard
**Evidence**: 8 current sources (5 live codex-CLI probes · 3 pij code) · 1 historical

## Answer

1. **Codex is a "claude-style" harness, not a "copilot-style" one.** The interactive TUI auto-generates its session UUID — there is **no launch flag to *set* it** (only `resume <id>` / `fork <id>` consume an existing one). So binding must be **transcript discovery** (new-file-appearance), exactly like claude — **not** the deterministic `--session-id` path copilot/branched-claude use.
2. **Blanket-permission flag = `--dangerously-bypass-approvals-and-sandbox`** (codex's analogue of claude `--dangerously-skip-permissions` / copilot `--yolo`). Required for a daemon-driven pane (no human to approve tool calls). Model rides `-m, --model <m>` like the others.
3. **Transport = `sendkeys`** (daemon types into the pane), same as claude/copilot. Only `pi` uses `inbox`.
4. **The one genuinely new surface is a codex transcript module** — codex's session log lives at `~/.codex/sessions/YYYY/MM/DD/rollout-<ISO>-<uuid>.jsonl` (date-nested + **global**, *not* cwd-scoped like claude's `~/.claude/projects/<mangled-cwd>/`), with a different line schema. So `transcriptDir`, the session-id extraction, the cwd-scoping, and the `pij tail` summarizer all need a codex variant; the daemon's bind loop must select them by harness.
5. **`codex` slots into the existing control-plane sets + switches** — `HarnessKind`, `SPAWNABLE_HARNESSES`, `CONTROL_HARNESSES`, `selectTransport`, `buildControlSpawnCommand`, the `runSpawn` snapshot path, the daemon discovery path, and `tailTranscript` — all of which already have a claude arm to copy.
6. **`supportsBranching` stays `false` for codex** (KISS) — codex *does* have `fork`/`resume`, so branch-from-self is a clean future flip, but out of scope now.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Interactive codex has **no flag to set a new session's id**; `resume`/`fork` take an existing `SESSION_ID` (UUID). | `codex --help`, `codex resume --help` (live, v0.142.3) | Bind = **transcript discovery** (claude path), NOT `plannedHarnessSessionId`. Codex spawn takes the **snapshot** branch, never the deterministic branch. | High |
| F-02 | Blanket-permission flag = `--dangerously-bypass-approvals-and-sandbox` ("Skip all confirmation prompts and execute commands without sandboxing"). Model = `-m, --model`. | `codex --help` options (live) | `buildControlSpawnCommand` codex arm: `cmd:"codex"`, args `["--dangerously-bypass-approvals-and-sandbox", ...(-m model)]`. Same trust posture as the claude/copilot arms (controlled peer we spawned). | High |
| F-03 | Codex session transcript = `~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ISO>-<uuid>.jsonl`; first line `type:"session_meta"` with `payload.id` (UUID) + `payload.cwd`. The UUID is also the filename suffix. | `~/.codex/sessions/2026/04/30/rollout-2026-04-30T13-14-22-019ddc61-…jsonl`; `head` of file | New `core/harness/codex.ts`: `transcriptDir` (date-tree), `sessionId` = trailing UUID, cwd via `session_meta.cwd`. Discovery's new-path-appearance logic still applies. | High |
| F-04 | Codex transcript dir is **date-nested + global**, not cwd-scoped (cwd lives *inside* the file, not the path). | path layout above vs claude `transcriptDir` `harness/claude.ts:25` | Discovery must (a) walk the date tree (snapshot/list), and (b) **cwd-filter via `session_meta.cwd`** since the dir mixes all cwds — a difference from claude's already-cwd-scoped dir. | High |
| F-05 | Codex rollout line schema (`session_meta` / `event_msg` / `response_item`) differs from claude's (`{type:user/assistant, message.content}`). | `head -3` of a rollout vs `summarizeTranscriptLine` `harness/claude.ts:49` | `pij tail` needs a **codex summarizer**; reuse the `[role] text`, `⚙ tool` rendering shape. | High |
| F-06 | All harness branch sites are small + centralized, each already carrying a claude arm to mirror. | `HarnessKind` `core/types.ts:18`; `selectTransport` `harness/types.ts:20`; `buildControlSpawnCommand` `spawn.ts:215`; `CONTROL/SPAWNABLE_HARNESSES` `spawn.ts:399,405`; `runSpawn` snapshot `cli.ts:450-458`; bind loop `daemon/loop.ts:191-213`; `tailTranscript` `cli.ts:664-677` | Implementation = add a `"codex"` arm at each site + one new transcript module. No architectural change. | High |
| F-07 | Daemon binds deterministically **only** when `descriptor.plannedHarnessSessionId` is set; otherwise it runs `discoverNewTranscript(before, listTranscripts(dir))`. `transcriptDir`/`listTranscripts` are claude-hardcoded today (imported from `claude.js`). | `daemon/loop.ts:133, 191, 204` | Make the daemon's dir + listing + id-extraction **harness-selected** (claude vs codex); codex falls through the same `discover` branch with codex inputs. | High |
| F-08 | `-C/--cd <DIR>` sets codex's working root, but pij sets cwd via the tmux split, and codex records it in `session_meta.cwd`. | `codex --help`; `runSpawn` split `cli.ts:485-494` | No `--cd` needed — cwd flows through the pane; `session_meta.cwd` is the confirmation key for F-04. | Medium |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | Copilot was added as the *deterministic* control-plane harness (`--session-id` UUID, no discovery race); claude is the *discovery* harness (snapshot before/after, new-path-appearance, phonehome backstop). | `docs/plans/019-pij-tmux-control-plane/`, `core/harness/copilot.ts`, `core/harness/claude.ts` | Direct — codex = **second discovery harness**. Copy claude's bind path, not copilot's. The H1 "snapshot before the pane exists" fix (`cli.ts:449`) applies to codex too. | Mirror the claude arm everywhere; add codex-specific transcript layout. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| **R-1 · codex TUI readiness/interstitial classification** | `classifyReadiness`/`classifyInterstitial` were tuned to claude/copilot pane text (`daemon/loop.ts:139-164`) | If codex's boot/ready/approval pane text doesn't match, the daemon may never bind or never inject init | **POC (the user's ask): pop a real codex pane, watch boot→ready, drive it via send-keys, read its rollout.** Adjust classifier patterns only if the POC shows a mismatch. |
| **R-2 · discovery ambiguity (global dir)** | F-04: dir mixes all cwds; two concurrent codex spawns → 2 new files | `discoverNewTranscript` would return `ambiguous` | cwd-filter via `session_meta.cwd`; phonehome remains the backstop (already wired). Acceptable. |
| **R-3 · `pij phonehome` from inside codex** | bind is discovery-first; phonehome is only the confirmatory backstop | If codex won't run shell unattended, only the backstop is lost, not the bind | bypass-sandbox allows shell + env inherits from the pane; verify in POC but non-blocking. |
| **R-4 · midnight date-dir rollover** | F-03 date-nested path | a spawn near 00:00 could land in tomorrow's dir vs a snapshot of today's | snapshot/list should walk recent date dirs (today + yesterday), not a single day. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-control-plane` | extends | Adds a 4th harness to the spawn/bind/transport vocabulary; binding stays daemon-driven | `docs/domains/pij-control-plane/domain.md`; `daemon/loop.ts` |
| `pij-messaging` | extends | `selectTransport(codex) = sendkeys`; `HarnessKind` widened | `core/harness/types.ts`; `core/types.ts` |

## Planning Handoff

- **Preserve**: the `plannedHarnessSessionId`-vs-discovery bind split (`daemon/loop.ts:191`); new-path-appearance discovery (never mtime); the spawn-time `before` snapshot taken *before* the pane exists (review H1, `cli.ts:449`); the blanket-permission trust posture; pi's `inbox` transport untouched.
- **Change carefully**: the daemon's claude-hardcoded `transcriptDir`/`listTranscripts` import (`daemon/loop.ts:22,133`) — generalize to harness-selected without regressing claude/copilot; the `runSpawn` `isCopilot`/`skipSnapshot` logic (`cli.ts:450-458`) — codex must take the snapshot path with a codex dir.
- **Likely files/symbols**: `core/types.ts` (HarnessKind) · `core/harness/types.ts` (selectTransport) · **new** `core/harness/codex.ts` (transcriptDir/discovery-id/summarizer) · `core/spawn.ts` (buildControlSpawnCommand arm + both harness sets + arg parse) · `cli.ts` (runSpawn snapshot branch + tailTranscript arm) · `core/daemon/loop.ts` (harness-selected dir/listing in the discovery branch).
- **Decisions still required**:
  1. **Where the harness→transcript-layout selection lives** — a per-harness lookup (`transcriptDir`/`listTranscripts`/`extractSessionId`) the daemon + cli + tail all call, vs inline `if harness==="codex"`. (Recommend a tiny selector in `core/harness/` so the three call-sites stay DRY.)
  2. **Session-id source** — trailing-UUID from filename (cheap, no read) vs `session_meta.id` (a read, but authoritative). Recommend filename UUID + treat `session_meta.cwd` as the cwd filter.
  3. **POC-first**: validate codex TUI readiness/control/tail (R-1) *before* finalizing classifier changes — the user has asked for exactly this.

## External Research

_None material — the codex CLI was probed directly and the pij precedent is in-repo._
