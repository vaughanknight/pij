# Validation — Phase 5 (Media relay) tasks dossier

**Target**: `docs/plans/026-pij-telegram-bridge/tasks/phase-5-media/tasks.md`
**Date**: 2026-06-30 · **Scope**: narrow (lead + deterministic checks) · **Verdict**: ✅ **VALIDATED WITH FIXES**

## Validation Contract
- **Purpose**: a buildable, correctly-scoped dossier for media relay both ways (AC-11/12/13) that a flow-pair coder can execute within its allowed paths.
- **Promise**: every named symbol/path resolves to real code; the reference-passing design holds; scope constraints don't forbid a file the work needs.
- **Proof target**: Implementation-ready.
- **Upstream**: `pij-telegram-bridge-plan.md` Phase 5 + AC-11/12/13; operator clarifications (2026-06-30: both directions, session-dir storage, single phase).
- **Consumers**: the flow-pair coder (copilot claude-opus-4.8) + reviewer (copilot gpt-5.5).

## Deterministic proof (lead-run)
- `PijMessage` is a clean interface at `core/types.ts:146`; optional `attachments?` is additive. ✓
- `FsChannel.deliver` serializes the whole message (`{...message, messageId}` → `JSON.stringify`, `channel.ts:49–52`) and `watch` re-parses it (`:86`), so an added field round-trips with **no channel change**. ✓
- `SessionDescriptor.dataDir` exists (`core/types.ts:53`) → inbound media can be stored under `<dataDir>/attachments/`. ✓
- `routeMessage`/`resolveTarget`, allowlist-first middleware, `startForwarder` ordered queue, `createBot` sticky map all exist (Phases 1–3). ✓
- grammY `InputFile` + `sendPhoto`/`sendAnimation`/`sendDocument` (outbound) and `@grammyjs/files` `hydrateFiles`/`file.download` (inbound) confirmed via web research; caps 10/50 MB upload, 20 MB download. ✓

## Findings (folded in)
| Severity | Finding | Evidence | Fix (applied) |
|---|---|---|---|
| HIGH | Dossier targeted `cli.ts` for the `pij send --file/--caption` parse, but the send **parse + message build are in `core/cli.ts`** (flag set `:149`, parse `:198–230`, deliver build `:455`); `cli.ts` has **zero** `send` refs (delegates to the core runner). A scoped coder would be blocked by its own allowed-paths. | `grep` of both files + read of `core/cli.ts:429–459` | Re-pointed T003, Pre-Impl-Check, allowed-paths, and the plan Delivers line to `core/cli.ts` (+ `core/cli.test.ts`); noted `cli.ts` is NOT touched. |
| MEDIUM | Attachment-only message (empty `body` + `attachments`) would `chunk("")` → send a blank text message alongside the media. | `bridge.ts startForwarder` chunks `dm.body` unconditionally | T004 Done-When now requires: attachment-only → media sent, **no** empty text message. |

## Thesis
Advanced — the dossier's design (reference-passing; body stays text; media as path metadata; session-dir storage so a future boot tidy reclaims it) is consistent with the real transport, and the two fixes remove the only action-changing gap (wrong CLI file) plus one real edge. Implementation-ready.

## Consumers
2/2 (coder, reviewer) — allowed paths now match where the code actually lives.
