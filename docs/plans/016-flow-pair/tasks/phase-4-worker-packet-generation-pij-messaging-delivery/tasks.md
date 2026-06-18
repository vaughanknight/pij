# Phase 4: Worker-Packet Generation + pij-Messaging Delivery — Tasks

**Phase**: 4 — Worker-Packet Generation + pij-Messaging Delivery
**Plan**: `docs/plans/016-flow-pair/flow-pair-plan.md` §Phase 4
**Depends on**: Phase 2 (`LedgerWriter.writeDelegation`, `writePromptTrial`), Phase 3 (`ContextPackManifest` with `entries[].content`)
**Baseline**: 62 tests (Phase 1: 14, Phase 2: 26, Phase 3: 22), 5 lib files + CLI
**Target**: ≥18 new Phase-4 tests; `just flow-pair-test` still ≥62+18

---

## Executive Briefing

Phase 4 builds `lib/packet.ts` — the **packet renderer**: a pi-free module that
consumes a compiled `ContextPackManifest` (Phase 3 output), renders a bounded
markdown worker packet from it, writes the packet body to the ledger's
`prompts/` directory (P9), records a `PromptTrialRecord` (Phase 2), and returns
a short `pointerMsg` string ready for `pij send`.

**The one design boundary this phase must encode explicitly:**

> `lib/packet.ts` renders + writes the packet and builds `pointerMsg`.
> **The actual `pij send` is always an orchestrator/CLI action — never a lib call.**
> The lib has zero `@earendil-works/*` imports (P2) and zero awareness of the
> pij transport layer (domain boundary: `pij-messaging` is a *consume* domain).

This boundary is not a nice-to-have. pij-messaging's transport protocol may
change; `flow-pair`'s packet contract must not couple to it. The CLI
(`cli.ts`) prints `pointerMsg` to stdout — the orchestrator reads it and calls `pij_send`.
The lib must never invoke transport; neither must `cli.ts` (shell-string interpolation
of user-content like `pointerMsg` creates injection vectors and couples transport to CLI).

**Orchestration flow (three steps, owned by CLI/orchestrator):**

```
1. writer.writeDelegation(runId, {taskRef, packetPath})  ← Phase 2 (creates delegation record)
2. compiler.compile({runId, delegationId, ...})           ← Phase 3 (builds manifest)
3. renderer.writePacket({manifest, taskDescription, ...}) ← Phase 4 (writes packet + trial)
```

`writePacket` owns step 3 only. The CLI chains all three. The actual `pij send`
happens AFTER step 3 using `packet.pointerMsg` returned from `writePacket`.

**TDD order**: T001–T004 write failing tests (18 total); T005 implements the
full `lib/packet.ts`; T006 fills the `worker-implement.md` active template;
T007 wires CLI dispatch end-to-end and runs all gates.

---

## 7-Column Task Table

| Status | ID   | Task                                                                      | Domain    | Path(s)                                                                                                             | Done-When                                                                                                                                              | Notes                                                                        |
|--------|------|---------------------------------------------------------------------------|-----------|---------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------------|
| [ ]    | T001 | Write failing tests: `renderBody` — required sections + content           | flow-pair | `skills/flow-pair/test/packet-render.test.ts`                                                                       | 6 tests: forbidden-paths verbatim, allowed-scope present, plan-phase content, tasks content when present, stub when absent, report-schema section; vitest RED | Stub `lib/packet.ts` throws `"not implemented"` |
| [ ]    | T002 | Write failing tests: `writePacket` — record-writing + pointer             | flow-pair | `skills/flow-pair/test/packet-write.test.ts`                                                                        | 7 tests: trial record written, packet body written to `prompts/<delegationId>.md`, `packetPath` in result, `pointerMsg` format correct, `delegationId` links to manifest, `{ok:false}` on invalid runId, `{ok:false}` on `writePromptTrial` fail; vitest RED | Uses real tmp fixtures |
| [ ]    | T003 | Write failing tests: P9 invariant in `writePacket`                        | flow-pair | `skills/flow-pair/test/packet-write.test.ts`                                                                        | 3 tests: P9 callLog (appendFileSync before writeFileSync), failure injection (packet.written appendFileSync throws → `{ok:false}` + packet file NOT written), trial-appendFileSync failure → `{ok:false}`; vitest RED | TrackingDeps wrapping real fs; FailDeps wraps real fs (same fix as Phase 3) |
| [ ]    | T004 | Write failing tests: pointer-message format                               | flow-pair | `skills/flow-pair/test/packet-render.test.ts`                                                                       | 2 tests: `pointerMsg` contains `delegationId`, `pointerMsg` contains relative `packetPath` (not absolute ledger root); vitest RED | Short format designed for pij send payload |
| [ ]    | T005 | Implement `lib/packet.ts` (full: `renderBody` + `writePacket`)            | flow-pair | `skills/flow-pair/lib/packet.ts`; additive edit to `skills/flow-pair/lib/ledger.ts`                                 | All T001–T004 GREEN (18 tests pass); Phase 2/3 tests still pass; typecheck clean; lint exit 0 | Add `packet.written` to `LedgerEvent` union + `PROMPTS_DIR` constant to `ledger.ts` |
| [ ]    | T006 | Fill `worker-implement.md` active template + update architecture ref      | flow-pair | `skills/flow-pair/references/templates/worker-implement.md`; `skills/flow-pair/references/architecture.md`          | Template has all required sections (mission, repo-root, forbidden-paths, allowed-scope, context, report-schema, stop-conditions); architecture.md notes Phase 4 deliver | Drives `renderBody`'s section injection |
| [ ]    | T007 | CLI dispatch end-to-end + full gate                                       | flow-pair | `skills/flow-pair/lib/cli.ts`                                                                                       | `flow-pair dispatch` chains writeDelegation→compile→writePacket, prints `packet.pointerMsg` to stdout (exit 0); **no `--send-to`** (orchestrator calls `pij_send` tool); `just flow-pair-test` ≥80 passes; typecheck + lint clean; `just flow-pair-mutate` ≥2 guards RED→GREEN | Transport is always orchestrator/SKILL.md via `pij_send` tool — cli.ts never shells `pij send` |

---

## Prior-Phase Context

### Phase 2 (directly consumed by `writePacket`)

```typescript
// lib/ledger.ts — already exported
interface LedgerWriter {
  writeDelegation(runId, {taskRef, packetPath}): {ok, delegation?, error?}
  writePromptTrial(runId, delegationId, {templateRef, promptHash}): {ok, trial?, error?}
  appendEvent(runDir, event): {ok, error?}
}

interface DelegationRecord {
  delegationId: string; runId: string; taskRef: string; packetPath: string;
  createdAt: string; status: "pending" | "accepted" | "fix_required";
}
interface PromptTrialRecord {
  trialId: string; runId: string; delegationId: string;
  templateRef: string; promptHash: string; createdAt: string;
}

// Standalone P9 helper (Phase 3 added):
appendLedgerEvent(deps, runDir, event: LedgerEvent): {ok, error?}
```

**P9 contract**: `writeDelegation` and `writePromptTrial` are already P9-correct (each appends an event before writing the .json file). Phase 4 needs a THIRD P9 event for the packet body file (`packet.written` — additive to `LedgerEvent` union).

### Phase 3 (manifest consumed by `renderBody`)

```typescript
// lib/context-pack.ts — already exported
interface ContextPackManifest {
  packId: string; runId: string; delegationId: string;
  phase: string; cluster: string;
  entries: ContextPackEntry[];      // entries carry .content — no re-read needed
  exclusions: ContextPackExclusion[];
  allowedPaths: string[];
  forbiddenPaths: string[];         // always includes DEFAULT_FORBIDDEN_PATHS
  createdAt: string;
}
interface ContextPackEntry {
  path: string; section?: string;
  content: string;                  // Phase 4 renders directly from this
  hash: string; role: "plan-phase" | "tasks" | "execution-log" | "learning";
}
```

### Orchestration flow (CLI-owned — not lib-owned)

The CLI's `dispatch` subcommand chains three calls in this exact order:
```
1. writer.writeDelegation(runId, {taskRef: taskDescription, packetPath})
   → delegationId (e.g. "dlg-0001")
2. compiler.compile({runId, delegationId, planPath, phase, tasksDir, cluster, allowedPaths})
   → manifest
3. renderer.writePacket({manifest, taskDescription, repoRoot})
   → packet.pointerMsg
4. [Orchestrator] pij_send({ to: workerId, message: packet.pointerMsg })  ← lib boundary ends here
   CLI prints pointerMsg to stdout; orchestrator reads it and calls pij_send tool
```

Step 4 NEVER happens inside `lib/packet.ts`.

---

## Pre-Implementation Check

Before T005, verify:

1. `LedgerWriter.writePromptTrial(runId, delegationId, {templateRef, promptHash})` — confirm
   signature in `lib/ledger.ts`. It allocates `trialId` via `nextId(prompt-trials/)`.
2. `PROMPTS_DIR` constant — not yet in `lib/ledger.ts`; Phase 4 adds it (additive).
3. `packet.written` event type — not yet in `LedgerEvent` union; Phase 4 adds it (additive).
4. `skills/flow-pair/references/templates/worker-implement.md` — currently a stub (5L). T006 fills it.
5. Phase 2 `createRun` scaffolds `prompts/` as one of 7 subdirs — confirm it exists at
   `join(runDir, "prompts")` so `writePacket` doesn't need `mkdirSync` for the dir itself.

---

## Architecture Map

```
lib/packet.ts
  ├── PacketRendererDeps interface            ← P3: injectable fs (no execSync — transport never in lib)
  │     readFileSync, writeFileSync, appendFileSync, existsSync
  │
  ├── nodePacketRendererDeps(): PacketRendererDeps   ← production binding
  │
  ├── PACKET_TEMPLATE_REF = "worker-implement@v1"  ← P5 constant
  │     (PROMPTS_DIR imported from ./ledger.js — P5: constants next to the data they constrain)
  │
  ├── PacketRenderer class
  │     constructor(
  │       ledgerRoot: string,
  │       templateDir: string,   ← absolute path to skills/flow-pair/references/templates/
  │       writer: LedgerWriter,  ← Phase 2 LedgerWriter (P3 injected)
  │       deps?: PacketRendererDeps,
  │     )
  │
  │     renderBody(manifest: ContextPackManifest, opts: RenderOpts)
  │       : { ok: boolean; body?: string; error?: string }
  │         1. Load template from deps.readFileSync(join(templateDir, "worker-implement.md"))
  │         2. Replace template placeholders with manifest fields:
  │              - forbidden paths section ← manifest.forbiddenPaths (verbatim, one per line)
  │              - allowed scope ← manifest.allowedPaths (one per line)
  │              - plan-phase content ← entries.find(r=>"plan-phase").content
  │              - tasks content ← entries.find(r=>"tasks")?.content ?? "(no tasks found)"
  │              - execution-log ← entries.find(r=>"execution-log")?.content ?? "(not yet created)"
  │              - learnings ← entries.filter(r=>"learning").map(e=>e.content).join("\n---\n") || "(none)"
  │              - delegationId, runId, phase, repoRoot, taskDescription
  │         3. return {ok:true, body}
  │
  │     writePacket(opts: WritePacketOpts)
  │       : { ok: boolean; packet?: WorkerPacket; error?: string }
  │         1. resolveRunDir(this.ledgerRoot, manifest.runId) — {ok:false} on bad runId
  │         2. renderBody(manifest, opts) — {ok:false} on template-missing
  │         3. promptHash = sha256slice8(body)
  │         4. packetPath = join(runDir, PROMPTS_DIR, manifest.delegationId + ".md")
  │         5. [P9] appendLedgerEvent(this.deps, runDir, packet.written event)
  │            if (!ev.ok) return {ok:false}    ← writeFileSync never called
  │         6. deps.writeFileSync(packetPath, body)
  │         7. writer.writePromptTrial(runId, delegationId, {templateRef, promptHash})
  │            if (!result.ok) return {ok:false}
  │         8. pointerMsg = buildPointerMsg(manifest.delegationId, packetPath, manifest.runId)
  │         9. return {ok:true, packet: {...}}
  │
  └── exports: PacketRenderer, WorkerPacket, WritePacketOpts, RenderOpts,
               PacketRendererDeps, nodePacketRendererDeps,
               PACKET_TEMPLATE_REF
               (PROMPTS_DIR imported from ./ledger.js, not re-exported from packet.ts)

lib/ledger.ts (additive edits in T005):
  LedgerEvent union += { type: "packet.written"; runId: string; delegationId: string;
                          packetPath: string; at: string }
  const PROMPTS_DIR = "prompts" as const  (exported — single source, used by Phase 4 + CLI)

lib/cli.ts (T007):
  dispatch subcommand upgraded: chains writeDelegation → compile → writePacket
  prints packet.pointerMsg to stdout and exits 0
  NO --send-to flag — orchestrator calls pij_send tool directly
  (shell-string injection risk: pointerMsg contains `[...]` POSIX metacharacters;
   repoRoot with spaces breaks double-quoted shell strings; transport belongs to orchestrator)

Test files:
  test/packet-render.test.ts  ← T001 (renderBody: 6) + T004 (pointerMsg: 2)
  test/packet-write.test.ts   ← T002 (writePacket records: 7) + T003 (P9: 3)
```

---

## Context Brief

### Types exported from `lib/packet.ts`

**`WorkerPacket`**

| Field | Type | Description |
|-------|------|-------------|
| `delegationId` | `string` | From `manifest.delegationId` |
| `runId` | `string` | From `manifest.runId` |
| `packetPath` | `string` | Absolute path to rendered packet file |
| `body` | `string` | Full rendered markdown content |
| `pointerMsg` | `string` | Short message for `pij send` (contains delegationId + relative packetPath) |
| `templateRef` | `string` | Template version used (e.g. `"worker-implement@v1"`) |
| `promptHash` | `string` | sha256[0:8] of `body` |

**`WritePacketOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `manifest` | `ContextPackManifest` | ✓ | — |
| `taskDescription` | `string` | ✓ | — |
| `repoRoot` | `string` | ✓ | — (absolute repo path) |
| `templateRef` | `string?` | — | `PACKET_TEMPLATE_REF` |

**`RenderOpts`**

| Field | Type | Required |
|-------|------|----------|
| `taskDescription` | `string` | ✓ |
| `repoRoot` | `string` | ✓ |
| `templateRef?` | `string?` | — |

**`PacketRendererDeps`**

Same 4 methods (no `mkdirSync` — `prompts/` is scaffolded by Phase 2 `createRun`; no `readdirSync` — not needed by writePacket):
`readFileSync`, `writeFileSync`, `appendFileSync`, `existsSync`.

### Pointer-message format

```
[flow-pair ${delegationId}] Packet at: ${relativePath}
```

Where `relativePath` is the `packetPath` **relative to repoRoot** (not absolute), so the worker can read it regardless of their working directory. Example:
```
[flow-pair dlg-0001] Packet at: .flow-pair/runs/2026-06-17T12-55-00Z-abc123/prompts/dlg-0001.md
```

The relative path is computed as `path.relative(repoRoot, packetPath)`.

### New event type in `LedgerEvent` (additive)

```typescript
// Add to LedgerEvent union in lib/ledger.ts (T005):
| { type: "packet.written"; runId: string; delegationId: string; packetPath: string; at: string }
```

### P9 in `writePacket`

```
1. [read/compute] renderBody, promptHash, packetPath
2. [P9] appendLedgerEvent(this.deps, runDir, packet.written event)
   if (!ev.ok) return {ok:false, error: ev.error}   ← writeFileSync never called
3. [write packet] deps.writeFileSync(packetPath, body)
4. [write trial]  writer.writePromptTrial(runId, delegationId, {templateRef, promptHash})
   if (!trial.ok) return {ok:false, error: trial.error}
5. return {ok:true, packet}
```

`writeDelegation` is OUTSIDE `writePacket` — called by the CLI before invoking Phase 3 and Phase 4.

### Lib-vs-orchestrator boundary (the explicit split)

| Layer | Responsibility | May call `pij send`? |
|-------|----------------|----------------------|
| `lib/packet.ts` | Render body, write packet file (P9), write trial record, return pointerMsg | **NO** — zero transport awareness |
| `lib/cli.ts` dispatch | Chain writeDelegation → compile → writePacket; print pointerMsg to stdout | **NO** — cli.ts also never shells pij send (injection risk; transport is orchestrator’s domain) |
| Orchestrator (SKILL.md) | Read pointerMsg from `flow-pair dispatch` stdout; call `pij_send` tool | **YES** — pi session action |

The rule: anything that touches `@earendil-works/*` or the `pij` binary stays ABOVE the lib layer.

### Mutation-resistance checklist

| Guard | Guard location | Test that catches removal |
|-------|---------------|--------------------------|
| `renderBody` → template file not found | ENOENT catch → `{ok:false}` | T001: "missing template → {ok:false}" |
| `renderBody` → forbidden paths present verbatim | string inclusion check | T001: "forbidden paths verbatim in body" |
| `writePacket` → bad runId | `resolveRunDir` guard | T002: "invalid runId → {ok:false}" |
| `writePacket` → packet file written to `prompts/` | `writeFileSync` path | T002: "packet body at prompts/<delegationId>.md" |
| `writePacket` → trial record written | `writePromptTrial` result check | T002: "trial record written" |
| P9: `appendLedgerEvent` before `writeFileSync` | call order | T003: "P9 callLog" |
| P9: failure propagation for packet write | `if (!ev.ok) return {ok:false}` | T003: "failure injection — packet file NOT written" |
| Pointer format | `relativePath` in message | T004: "pointerMsg contains packetPath" |

---

## Discoveries

1. **`prompts/` dir already exists** — Phase 2's `createRun` scaffolds `prompts/` as one of 7
   subdirs. `writePacket` does NOT need `mkdirSync` for it. If the dir is absent (old run or
   test fixture), `writePacket` should attempt the write and let the ENOENT propagate to the
   outer try/catch → `{ok:false}`. Tests must scaffold the prompts dir.

2. **Delegation pre-created before compile** — `writeDelegation` allocates `delegationId` via
   `nextId(delegationsDir, readdirSync)`. The CLI must call `writeDelegation` BEFORE calling
   `compile` so the `delegationId` from the ledger matches the `delegationId` passed to
   `compile`. `writePacket` receives a manifest with this pre-allocated ID — it does NOT
   call `writeDelegation` again.

3. **Template rendering is string interpolation, not Handlebars** — `worker-implement.md`
   uses `{{PLACEHOLDER}}` markers (double-brace, no whitespace). `renderBody` replaces them
   via `body.replace(/\{\{FORBIDDEN_PATHS\}\}/g, list)` etc. No external template engine.
   This keeps `lib/packet.ts` dependency-free.

4. **`pointerMsg` uses relative path** — absolute paths differ between machines.
   `path.relative(repoRoot, packetPath)` produces a portable ledger-relative path
   (e.g., `.flow-pair/runs/.../prompts/dlg-0001.md`). The worker resolves from their
   repo root. Test: `relative(repoRoot, packetPath)` starts with `.flow-pair/`.

5. **`PacketRendererDeps` reuses LedgerDeps shape** — structurally identical to `LedgerDeps`
   (same 6 methods — or 5 if `readdirSync` is omitted; Phase 4 does not need `readdirSync`).
   TypeScript structural typing allows passing a `LedgerDeps` instance where
   `PacketRendererDeps` is expected. Define separately (P2: no cross-import of interface just
   for structural reuse).

6. **`pij send` shell-out: DROPPED** — cli.ts does NOT shell `pij send`. The `pointerMsg` =
   `"[flow-pair dlg-0001] Packet at: .flow-pair/runs/.../prompts/dlg-0001.md"` contains `[`/`]`
   (POSIX character-class metacharacters); a `repoRoot` with spaces would break the
   double-quoted shell string; `peerId` is unquoted at the shell level. Using `spawnSync` with
   an arg array would avoid injection but the correct fix is not to invoke transport from CLI
   at all — the orchestrator already has the `pij_send` tool. CLI prints `pointerMsg` to
   stdout; orchestrator reads and sends.

7. **`promptHash` is `sha256[0:8]` of rendered body** — same pattern as Phase 1 identity +
   Phase 3 entry hash. `createHash("sha256")` from `node:crypto`. Import at top of file.

---

## Directory Layout

```
New files:
  skills/flow-pair/
    lib/
      packet.ts                              ← T005 (PacketRenderer + types + deps)
    test/
      packet-render.test.ts                  ← T001 (renderBody: 6) + T004 (pointer: 2)
      packet-write.test.ts                   ← T002 (writePacket: 7) + T003 (P9: 3)

Modified:
  skills/flow-pair/lib/ledger.ts             ← T005 additive: +packet.written + PROMPTS_DIR
  skills/flow-pair/lib/cli.ts                ← T007 additive: upgrade dispatch (full chain, print pointerMsg, no --send-to)
  skills/flow-pair/references/templates/
    worker-implement.md                      ← T006 (fill: all sections with {{PLACEHOLDER}} markers)
  skills/flow-pair/references/architecture.md ← T006 additive: note Phase 4 deliverable

Read-only (do not modify):
  docs/plans/016-flow-pair/flow-pair-plan.md
  skills/flow-pair/lib/paths.ts
  skills/flow-pair/lib/identity.ts
  skills/flow-pair/lib/context-pack.ts       (Phase 3 — complete)
  .the-flow-state.json / the-flow.json / the-flow.md
  .flow-pair/  (orchestrator owns)

Created (this file):
  docs/plans/016-flow-pair/tasks/phase-4-worker-packet-generation-pij-messaging-delivery/
    tasks.md                                 ← THIS FILE
```

---

---

## Validation Record (2026-06-18)

### Validation Thesis

**Raison d’être**: Give the implementation worker a self-contained, precise contract for Phase 4 so it can build `lib/packet.ts`, the worker-packet template, and the CLI dispatch upgrade without ambiguity.

**Value claim**: Phase 4 implementation completes correctly the first time: lib boundary holds (P2), P9 ordering is testable and mutation-checked, transport-injection risk is absent, and the orchestrator can deliver the packet via `pij_send` without CLI coupling.

**Artifact promise**: Worker can implement T001–T007 from this dossier alone; each promise in the Architecture Map, Context Brief, and mutation checklist is concrete enough to code and test against.

**Intended beneficiaries**: Implementation worker (pij-1gzyr0p), orchestrator reviewer (pij-xnj6p0), future maintainers.

**Proof target**: Implementation

**Evidence standard**: Type signatures, step-by-step algorithms, mutation checklist, explicit P9 ordering, explicit lib-vs-orchestrator boundary table.

**Thesis source**: `docs/plans/016-flow-pair/flow-pair-plan.md` §Phase 4

**Thesis verdict**: Advanced

**Main thesis risk**: T003 failure-injection tests need a fake `LedgerWriter` (not just `PacketRendererDeps` injection) for the `writePromptTrial` failure branch — this gap is documented in MEDIUM findings and must be addressed during T003 authoring.

---

### Findings applied

| ID | Severity | Issue | Fix applied |
|----|----------|-------|-------------|
| F1 | HIGH | `--send-to` shells `execSync(\`pij send ${peerId} "${pointerMsg}"\`)` — shell injection vector: `[`/`]` POSIX metacharacters in pointerMsg; spaces in repoRoot break double-quoted string; peerId unquoted at shell level | Dropped `--send-to` entirely; cli.ts prints `pointerMsg` to stdout; orchestrator calls `pij_send` tool. Updated T007 Done-When, Architecture Map cli.ts, lib-vs-orchestrator table, Discovery §6, Orchestration flow step 4. |
| F2 | HIGH | `PROMPTS_DIR = "prompts"` defined in both `lib/packet.ts` exports AND `lib/ledger.ts` additive section — P5 violation (constant should be next to the data it constrains) | Removed from packet.ts; packet.ts imports from `./ledger.js`. ledger.ts is now the single source. Updated Architecture Map, Context Brief, exports list. |
| F3 | MEDIUM | `mkdirSync` in `PacketRendererDeps` contradicts Discovery §1 (prompts/ already scaffolded by createRun; writePacket doesn’t call mkdirSync) | Updated Architecture Map interface list and Context Brief to 4 methods (removed mkdirSync). Not applied — MEDIUM; worker informed. |
| F4 | MEDIUM | T003 “trial-appendFileSync failure” test needs a fake `LedgerWriter` (injected via PacketRenderer constructor), not a `PacketRendererDeps` override — writePromptTrial is a LedgerWriter method | Gap documented in thesis risk. Not applied — MEDIUM; worker must add FakeLedgerWriter in T003 authoring. |

**Note on F3**: `mkdirSync` was already removed from the Architecture Map and Context Brief interface list in the F2 pass above — effectively applied as a byproduct of the F1/F2 cleanup.

### Forward-Compatibility

| Consumer | Requirement | Mode | Verdict | Evidence |
|----------|-------------|------|---------|----------|
| T005 implementer | `PacketRendererDeps` has exactly the methods writePacket calls | shape mismatch | ✅ | Interface now 4 methods matching writePacket’s usage (readFileSync, writeFileSync, appendFileSync, existsSync) |
| T007 CLI dispatch | No `--send-to` flag; prints pointerMsg to stdout | contract drift | ✅ | Done-When updated; transport boundary explicit |
| Orchestrator / SKILL.md | Receives pointerMsg string; calls pij_send tool | encapsulation lockout | ✅ | pointerMsg in WorkerPacket return; no lib sends transport |
| Phase 5 (observe) | packet.written event in events.jsonl | shape mismatch | ✅ | packet.written added to LedgerEvent union in ledger.ts additive section |

**Thesis alignment**: Phase 4 dossier advances its implementation-readiness promise; P9 ordering, lib boundary, and type contracts are concrete and testable; main risk is the T003 fake-LedgerWriter gap (MEDIUM, worker-actionable).

**Outcome alignment**: Orchestrator can call `flow-pair dispatch`, read `pointerMsg` from stdout, and deliver via `pij_send` tool — no CLI shell-string coupling, no injection risk, transport stays fully in the orchestrator layer.

Overall: ⚠️ VALIDATED WITH FIXES (F1+F2 HIGH fixed; F3+F4 MEDIUM open, worker-informed)
