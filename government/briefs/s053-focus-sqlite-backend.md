# s053 — focus support for Pi SQLite sessions

**Status**: superseded before work by Jordan's direct ruling to run this as a new fix phase under existing plan 050. No s053 research/product mutation occurred; clean worktree/branch are retained only pending safe cleanup.

**Owner**: `pij-bored-pelican`  
**Base**: `origin/main@591f188f394ab17d8c34a800fd55f87c752d4005`  
**Branch/worktree**: `s053/focus-sqlite-backend` / `/Users/jordanknight/pi-hacking/pij-worktrees/s053-focus-sqlite-backend`

## Mission

Repair the shipped `pij focus save` Pi adapter so it supports current SQLite-backed Pi sessions without regressing legacy JSONL sessions or Claude focus behavior.

## Verified incident

- Shipped Pi locator in `core/harness/transcript.ts` enumerates only legacy JSONL under `~/.pi/agent/sessions/**`.
- Current machine evidence: 696 JSONL transcripts versus 2,000 SQLite session databases under `~/.pi/db/session-sql/*.sqlite`.
- Live long-running Pi peer `pij-sexual-rook` is SQLite-backed and cannot be saved; the CLI returns `E-NOREG`.
- T10 passed only because its fresh Pi canary used JSONL, so the acceptance proof did not represent the dominant backend.
- Claude is unaffected.

## First release: evidence and validated plan only

1. Trace Pi SQLite schema, session identity, lifecycle, and any supported fork/export/import path from source and isolated read-only fixtures.
2. Decide whether focus should snapshot the SQLite file, export a stable JSONL form, or use another native Pi contract.
3. Preserve source immutability, secret/privacy boundaries, lineage, and exact cold-recall semantics.
4. Define tests for:
   - long-running SQLite-backed Pi session save;
   - legacy JSONL Pi compatibility;
   - backend selection by exact native session identity;
   - immutable snapshot and no real `~/.pij`/Pi database mutation;
   - live cold recall from a representative SQLite session.
5. Produce one integrated tests-first plan and cold cross-model validation; stop for implementation release.

## Fences

- **Writable**: `docs/plans/053-focus-sqlite-backend/**`, `.harness/temp/s053/**`.
- **Read-only**: `.pi/extensions/pij/**`, installed Pi source/runtime, pi-mono, real Pi session databases, s050 artifacts.
- Do not copy, edit, vacuum, migrate, lock, or open real SQLite session databases in write mode.
- Use temp copies/fixtures and read-only SQLite access only.
- No product code, daemon restart, staging, commit, push, PR, or package/global mutation.
- Orchestrator delegates research and cold validation; reusable peers compact fire-and-forget on completion.

## Done

An evidence-grounded plan identifies the native SQLite snapshot/fork contract, closes the false-green acceptance gap, preserves JSONL/Claude behavior, and returns an exact implementation touch set.
