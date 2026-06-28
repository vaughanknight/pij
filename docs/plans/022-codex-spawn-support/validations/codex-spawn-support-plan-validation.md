# Validation — codex-spawn-support-plan

**Validated**: 2026-06-28 · **Verdict**: ✅ VALIDATED WITH FIXES

- **Target**: `docs/plans/022-codex-spawn-support/codex-spawn-support-plan.md`
- **Proof**: code anchors verified live (`HarnessKind` types.ts:18, `selectTransport` harness/types.ts:20, `buildControlSpawnCommand` spawn.ts:215, `CONTROL/SPAWNABLE_HARNESSES` spawn.ts:399/405, bind split `loop.ts:191`, `discoverNewTranscript` claude.ts:101-113, `tailTranscript` cli.ts:664); codex CLI facts re-probed (`codex --help`/`resume --help`/`exec --help`, v0.142.3 — no set-session-id flag).
- **Thesis**: advanced — the plan faithfully mirrors the claude precedent (discovery bind, sendkeys, blanket-permission flag) with a codex transcript module; KISS, single domain, Simple/CS-3.
- **Consumers**: 1/1 — the `implement` verb; tasks are actionable with measurable Done-When.

## Findings (both fixed in-target)

| Severity | Finding | Evidence | Fix applied |
|---|---|---|---|
| HIGH→fixed | codex bind would record the **stem** not the UUID | `discoverNewTranscript` returns `sessionId=transcriptSessionId(path)` (claude.ts:109); daemon uses `discovery.sessionId` (loop.ts:206) | Key Finding 06 + T009 Done-When: derive id via `layout.sessionIdOf(discovery.path)`, fake-port test asserts bound id == file's trailing UUID |
| HIGH→fixed | `pij tail` cannot locate codex's date-nested file from a bare UUID | claude's `transcriptPathFor` join works only because its dir is cwd-scoped + filename=stem (claude.ts:37); codex path needs date+ISO | AC-02/04 + T010 + Manifest: persist discovered absolute rollout path as descriptor `transcriptPath`; codex tail reads it |

## Confirmed sound (no finding)

- Bind decision: interactive codex has **no** launch flag to set a session id (only `resume`/`fork <UUID>`) → discovery is correct.
- No claude/copilot regression: the deterministic-vs-discovery split keys on `descriptor.plannedHarnessSessionId` (loop.ts:191), which codex never sets.
- Snapshot path (T010) correctly snapshots the codex dir, not `transcriptDir(home,cwd)`.

Re-verification: the repairs are internally consistent (AC-02/AC-04 ↔ Finding 06 ↔ T009/T010 ↔ Domain Manifest `transcriptPath`). Status stays **READY**.
