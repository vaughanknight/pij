# Phase 3: Context-Pack Compiler — Tasks

**Phase**: 3 — Context-Pack Compiler
**Plan**: `docs/plans/016-flow-pair/flow-pair-plan.md` §Phase 3
**Depends on**: Phase 1 (`lib/identity.ts`, `lib/paths.ts`), Phase 2 (ledger read strategy, `LedgerEvent` union)
**Baseline**: 40 tests (Phase 1: 14, Phase 2: 26), 4 lib files + CLI
**Target**: ≥22 new Phase-3 tests; `just flow-pair-test` still ≥40+22

---

## Executive Briefing

Phase 3 builds `lib/context-pack.ts` — the **context-pack compiler**: a pi-free module
that reads plan/task/log files, extracts only the sections relevant to a given delegation,
assembles a durable `ContextPackManifest` (written to the run dir with P9), and returns
same-cluster learnings from `prompt-lab/clusters/<cluster>/active.md` (empty list when
Phase 7 has not yet built the cluster).

**Core invariant**: a worker receives only what their delegation scope requires.
The compiler enforces this through three mechanisms:
1. **Section extraction** — only the target phase's block from the plan
2. **Exclusion recording** — every omitted source gets a `{path, reason}` entry
3. **Cluster isolation** — only the cluster named in `opts.cluster` contributes learnings

**Test-design mandate (new gate)**: each behavioural guard must have a test that goes RED
if the guard is removed. No happy-path-only suites. All `{ok:false}` branches are exercised.
Failure-injection (appendFileSync throws) is required for P9.

**TDD order**: T001–T005 write failing tests; T006 makes all 22 tests green; T007 wires
CLI and updates the reference doc.

---

## 7-Column Task Table

| Status | ID   | Task                                                      | Domain     | Path(s)                                                                        | Done-When                                                                                                                       | Notes                                                                                               |
|--------|------|-----------------------------------------------------------|------------|--------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------|
| [x]    | T001 | Write failing tests: `extractSection`                     | flow-pair  | `skills/flow-pair/test/context-pack-extract.test.ts`                           | 6 tests covering section-found, section-absent → `{ok:false}`, file-not-found → `{ok:false}`, subsections, boundary, case-insensitive match; vitest RED on stub | Stub `lib/context-pack.ts` throws `"not implemented"` |
| [x]    | T002 | Write failing tests: `clusterLearnings`                   | flow-pair  | `skills/flow-pair/test/context-pack-extract.test.ts`                           | 3 tests: cluster-dir-absent → `{ok:true,learnings:[]}`, active.md present → one learning entry, active.md absent but dir exists → `[]`; vitest RED | Phase 7 not built — empty is the expected success path |
| [x]    | T003 | Write failing tests: `compile` — error branches           | flow-pair  | `skills/flow-pair/test/context-pack-compile.test.ts`                           | 3 tests: plan-file-missing → `{ok:false}`, phase-section-not-found → `{ok:false, error∋"section not found"}`, invalid-runId (`..`) → `{ok:false}` (resolveRunDir guard propagated); vitest RED | Guards must be mutation-checkable |
| [x]    | T004 | Write failing tests: `compile` — manifest assembly        | flow-pair  | `skills/flow-pair/test/context-pack-compile.test.ts`                           | 7 tests: `packId` matches `^cp-\d{4}$`, plan-phase entry has non-empty hash, tasks.md included when present, execution-log excluded-with-reason when absent, `allowedPaths` matches opts, `forbiddenPaths` contains flow-state names by default, `delegationId` links correctly; vitest RED | Hash = sha256[0:8] of extracted content |
| [x]    | T005 | Write failing tests: P9 invariant + cluster isolation     | flow-pair  | `skills/flow-pair/test/context-pack-compile.test.ts`                           | 3 tests: P9 callLog (appendFileSync before writeFileSync in compile), failure-injection (appendFileSync throws → `{ok:false}` + writeFileSync NOT called), cluster isolation (active.md from cluster-A absent when compiling for cluster-B); vitest RED | TrackingDeps wrapping real fs for P9 order; FailDeps for injection |
| [x]    | T006 | Implement `lib/context-pack.ts` (full: `extractSection` + `clusterLearnings` + `compile`) | flow-pair  | `skills/flow-pair/lib/context-pack.ts`; minor additive edit to `skills/flow-pair/lib/ledger.ts` | All T001–T005 GREEN (22 new tests pass); typecheck clean; lint exit 0; Phase 2 tests still pass | Add `context_pack.created` to `LedgerEvent` union in `ledger.ts` (additive, does not break Phase 2) |
| [x]    | T007 | CLI wire + reference doc + full gate                      | flow-pair  | `skills/flow-pair/lib/cli.ts`; `skills/flow-pair/references/context-packs.md` | `flow-pair dispatch --help` exits 0; `references/context-packs.md` documents API + manifest schema + exclusion rules; `just flow-pair-test` ≥62 passes; typecheck + lint clean | Wire `dispatch` subcommand; reference doc is the Phase 4 contract handoff |

---

## Prior-Phase Context

### Phase 1 (directly consumed)

**`resolveRunDir(ledgerRoot, runId)`** from `skills/flow-pair/lib/paths.ts`:
- Returns `{ok:false}` for empty, whitespace, absolute, or traversal-containing `runId`.
- Used by `compile` to locate the run dir for writing the manifest and appending the event.
- **T003 requires**: a test that passes `runId = "../escape"` → `{ok:false}` is propagated.

**`LEDGER_ROOT`, `RUNS_DIR`** from `skills/flow-pair/lib/paths.ts`:
- Default ledger root is `.flow-pair`; `RUNS_DIR` is `runs`.
- `compile` uses these as defaults for `ledgerRoot` when not injected.

### Phase 2 (read-only — no `LedgerWriter` import)

Phase 3 reads ledger files **directly** via `deps.readFileSync`. `LedgerWriter` is not imported.

```typescript
// Phase 3 reads — correct pattern:
const raw = deps.readFileSync(join(runDir, "run.json"), "utf8"); // if needed
// Appends to events.jsonl directly — see §P9 in Context Brief
```

**Run dir layout** (from `references/ledger-schema.md`):
- `events.jsonl` — append-only; `compile` appends `context_pack.created` (P9 first)
- `context-packs/` — **new subdir** created lazily by `compile`; not in Phase 2's 7 subdirs

**One small additive change to `lib/ledger.ts`** (T006): add `context_pack.created` to the
`LedgerEvent` discriminated union. This is additive — Phase 2 tests are unaffected.

---

## Pre-Impl Check

Before writing any code, run these to establish baseline:

1. `just flow-pair-test` — must show `Tests 40 passed (40)`
2. `cat vitest.config.ts` — confirm `skills/**/*.test.ts` is included (new test files auto-discovered)
3. `cat biome.json` — note formatter: tabs, 100-char width, double-quotes, semicolons, trailing commas
4. `cat skills/flow-pair/references/context-packs.md` — confirm it is still the Phase 1 stub (5 lines)

---

## Architecture Map

```
lib/context-pack.ts
  │
  ├── ContextPackDeps (P3 interface)
  │     readFileSync / existsSync / readdirSync
  │     writeFileSync / appendFileSync / mkdirSync
  │
  ├── nodeContextPackDeps(): ContextPackDeps      ← production binding
  │
  ├── CONTEXT_PACKS_DIR = "context-packs"         ← P5 constant
  ├── PACK_ID_PREFIX = "cp"                        ← P5 constant
  ├── DEFAULT_FORBIDDEN_PATHS = [                  ← P5 constant
  │     ".the-flow-state.json",
  │     "the-flow.json",
  │     "the-flow.md",
  │     ".flow-pair/"
  │   ]
  │
  ├── ContextPackCompiler class
  │     constructor(repoRoot: string, ledgerRoot: string, deps?: ContextPackDeps)
  │
  │     extractSection(filePath: string, sectionHeading: string)
  │       : { ok: boolean; content?: string; error?: string }
  │         1. deps.readFileSync(filePath) — {ok:false} on ENOENT
  │         2. split by "\n"
  │         3. find first heading where:
  │              norm === target OR norm.startsWith(target+":") OR norm.startsWith(target+" ")
  │              (exact/prefix match — not substring, prevents Phase-1 matching Phase-10)
  │         4. record heading level L (count leading "#")
  │         5. capture lines until next heading with level ≤ L
  │         6. {ok:false, error:"section not found: <heading>"} if step 3 fails
  │
  │     clusterLearnings(cluster: string)
  │       : { ok: boolean; learnings?: ClusterLearning[]; error?: string }
  │         1. path = join(this.repoRoot, "skills/flow-pair/prompt-lab/clusters", cluster)
  │         2. if !deps.existsSync(path) → {ok:true, learnings:[]}   ← graceful
  │         3. activePath = join(path, "active.md")
  │         4. if !deps.existsSync(activePath) → {ok:true, learnings:[]}
  │         5. return [{cluster, sourcePath: activePath, content: readFileSync(activePath)}]
  │
  │     compile(opts: CompileOpts)
  │       : { ok: boolean; manifest?: ContextPackManifest; error?: string }
  │         1. resolveRunDir(this.ledgerRoot, opts.runId) — {ok:false} on bad runId
  │         2. extractSection(opts.planPath, opts.phase) — {ok:false} if missing/absent
  │         3. read opts.tasksDir/tasks.md if exists (entry) else (exclusion, reason:"not found")
  │         4. read opts.tasksDir/execution.log.md if exists else (exclusion, reason:"not found")
  │         5. clusterLearnings(opts.cluster) — returns [] if Phase 7 not built
  │         6. hash each included entry (sha256[0:8] of entry.content)
  │         7. deps.mkdirSync(packDir, {recursive:true}) — create context-packs/ BEFORE readdirSync
  │         8. nextId(packDir, PACK_ID_PREFIX) — cp-NNNN (readdirSync safe now dir exists)
  │         9. [P9] const ev = appendLedgerEvent(this.deps, runDir, event)
  │            if (!ev.ok) return {ok:false, error: ev.error}   ← writeFileSync never called
  │        10. deps.writeFileSync(join(packDir, packId+".json"), JSON.stringify(manifest))
  │
  └── exports: ContextPackCompiler, ContextPackManifest, ContextPackEntry,
               ContextPackExclusion, ClusterLearning, CompileOpts,
               ContextPackDeps, nodeContextPackDeps
               (+ CONTEXT_PACKS_DIR, PACK_ID_PREFIX, DEFAULT_FORBIDDEN_PATHS)

lib/ledger.ts (additive exports added in T006):
  appendLedgerEvent(deps: LedgerDeps, runDir: string, event: LedgerEvent)
    : { ok: boolean; error?: string }
  (standalone helper extracted from LedgerWriter.appendEvent — reuses the tested primitive;
   Phase 3 imports this instead of reinventing append+failure-check logic)

lib/ledger.ts (additive edits in T006):
  LedgerEvent union += { type:"context_pack.created"; runId:string; delegationId:string;
                          packId:string; at:string }
  export appendLedgerEvent(deps, runDir, event) — standalone wrapper (no LedgerWriter needed)

lib/cli.ts (T007):
  Subcommands += "dispatch"
  dispatch routes to compiler.compile via opts parsed from flags

Test files:
  test/context-pack-extract.test.ts  ← T001 + T002 (extractSection + clusterLearnings)
  test/context-pack-compile.test.ts  ← T003 + T004 + T005 (compile, manifest, P9, isolation)
```

---

## Context Brief

### Types exported from `lib/context-pack.ts`

**`ContextPackEntry`**

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | Source file path (absolute) |
| `section` | `string?` | Section heading searched (undefined = whole file) |
| `content` | `string` | Extracted text content (Phase 4 renders from this — no re-read needed) |
| `hash` | `string` | sha256[0:8] of `content` |
| `role` | `"plan-phase" \| "tasks" \| "execution-log" \| "learning"` | How this entry is used by Phase 4 |

**`ContextPackExclusion`**

| Field | Type | Description |
|-------|------|-------------|
| `path` | `string` | File/path that was excluded |
| `reason` | `string` | `"not found"` / `"wrong cluster"` / `"other phase"` |

**`ContextPackManifest`**

| Field | Type | Description |
|-------|------|-------------|
| `packId` | `string` | `cp-NNNN` (monotonic per run, from `context-packs/` dir count) |
| `runId` | `string` | Link to parent run |
| `delegationId` | `string` | Link to delegation this pack serves |
| `phase` | `string` | Exactly the `phase` string passed to `compile` |
| `cluster` | `string` | Prompt-lab cluster name |
| `entries` | `ContextPackEntry[]` | Included sources |
| `exclusions` | `ContextPackExclusion[]` | Omitted sources with reasons |
| `allowedPaths` | `string[]` | Paths worker may modify |
| `forbiddenPaths` | `string[]` | Paths worker must never touch |
| `createdAt` | ISO 8601 | |

**`ClusterLearning`**

| Field | Type | Description |
|-------|------|-------------|
| `cluster` | `string` | Cluster name |
| `sourcePath` | `string` | Absolute path to `active.md` |
| `content` | `string` | Raw file content |

**`CompileOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `runId` | `string` | ✓ | — |
| `delegationId` | `string` | ✓ | — |
| `planPath` | `string` | ✓ | — (absolute path to plan file) |
| `phase` | `string` | ✓ | — (section heading: exact or prefix-colon/space match) |
| `tasksDir` | `string` | ✓ | — (absolute path to tasks directory) |
| `cluster` | `string` | ✓ | — |
| `allowedPaths` | `string[]` | ✓ | — |
| `forbiddenPaths` | `string[]?` | — | `DEFAULT_FORBIDDEN_PATHS` |

### `DEFAULT_FORBIDDEN_PATHS` (P5 constant)

```typescript
export const DEFAULT_FORBIDDEN_PATHS = [
  ".the-flow-state.json",
  "the-flow.json",
  "the-flow.md",
  ".flow-pair/",
] as const;
```

Always present in `manifest.forbiddenPaths` unless caller overrides.
**Implementation note**: spread to avoid TypeScript `readonly` conflict: `forbiddenPaths: opts.forbiddenPaths ?? [...DEFAULT_FORBIDDEN_PATHS]`.

### Section extraction algorithm

```
Input: filePath (absolute), sectionHeading (non-empty string to match, case-insensitive)

0. if sectionHeading.trim() === "" → {ok:false, error:"sectionHeading must not be empty"}
1. read file via deps.readFileSync → {ok:false, error:"not found: <path>"} on ENOENT
2. split by "\n"
3. scan lines for first markdown heading (starts with "#") where:
     const norm = line.replace(/^#+\s*/, "").trim().toLowerCase()
     const target = sectionHeading.trim().toLowerCase()
     match if: norm === target
           OR: norm.startsWith(target + ":")
           OR: norm.startsWith(target + " ")
   (exact OR prefix-colon OR prefix-space — prevents "Phase 1" matching "Phase 10")
4. if none found → {ok:false, error:"section not found: <sectionHeading>"}
5. record level L = number of leading "#" in matched line
6. collect from matched line (inclusive) to next line where:
     line matches /^#{1,L}\s/ (same level or higher, exclusive)
7. return {ok:true, content: collectedLines.join("\n").trim()}
```

### New event type in `LedgerEvent` (additive)

```typescript
// Add to LedgerEvent union in lib/ledger.ts:
| { type: "context_pack.created"; runId: string; delegationId: string; packId: string; at: string }
```

### P9 in `compile`

```
1. [read phase] resolve runDir, extractSection, read tasks.md/log.md, clusterLearnings
2. [compute phase] build entries, exclusions, manifest struct;
   includes deps.mkdirSync(packDir, {recursive:true}) + nextId(packDir) for id allocation
3. [P9] const ev = appendLedgerEvent(this.deps, runDir, event)
   if (!ev.ok) return {ok:false, error: ev.error}   ← writeFileSync never called on failure
4. [write phase] deps.writeFileSync(join(packDir, packId+".json"), JSON.stringify(manifest,null,2))
```

`appendLedgerEvent` is the standalone helper exported from `lib/ledger.ts` in T006:
```typescript
export function appendLedgerEvent(
  deps: LedgerDeps,
  runDir: string,
  event: LedgerEvent,
): { ok: boolean; error?: string }
```
This mirrors Phase 2's `LedgerWriter.appendEvent` pattern exactly — reusing the tested primitive
rather than reinventing append+failure-check (which was Phase 2's CRITICAL finding).

### Mutation-resistance checklist

Every item below must have a test in T001–T005 that goes RED if the guard is removed:

| Guard | Guard location | Test that catches removal |
|-------|---------------|--------------------------|
| `extractSection` → file not found | ENOENT catch → `{ok:false}` | T001: "file not found → {ok:false}" |
| `extractSection` → section not found | `if (!found) return {ok:false}` | T001: "section absent → {ok:false}" |
| `clusterLearnings` → dir absent | `if (!existsSync(clusterPath)) return {ok:true,learnings:[]}` | T002: "cluster dir absent → empty" |
| `compile` → plan file missing | `extractSection` returns `{ok:false}` propagated | T003: "plan file missing → {ok:false}" |
| `compile` → phase section missing | `if (!extract.ok) return {ok:false}` | T003: "phase section absent → {ok:false}" |
| `compile` → bad runId | `if (!dirResult.ok) return {ok:false}` | T003: "invalid runId → {ok:false}" |
| P9: appendLedgerEvent before writeFileSync | order of calls | T005: "P9 callLog" |
| P9: failure propagation | `if (!ev.ok) return {ok:false}` before writeFileSync | T005: "failure injection" |
| Cluster isolation | filter learnings by `opts.cluster` | T005: "cluster isolation" |
| Exclusion recording | `if (!existsSync(logPath)) exclusions.push(...)` | T004: "execution-log excluded-with-reason when absent" |

---

## Discoveries

1. **`context-packs/` is a new subdir** not in Phase 2's `createRun` 7-subdir scaffold.
   `compile` must create it lazily with `deps.mkdirSync(packDir, {recursive:true})`.
   No change to Phase 2 required.

2. **`context_pack.created` is a new `LedgerEvent` type**. T006 adds it additively to
   the `LedgerEvent` union in `lib/ledger.ts`. This is a pure union-extension — no Phase 2
   tests are affected.

3. **`compile` reuses `appendLedgerEvent`** — a new standalone export from `lib/ledger.ts`
   (added in T006) that wraps the append in a try/catch and returns `{ok, error?}`.
   Phase 3 imports only this helper (not `LedgerWriter`). This reuses the tested primitive
   rather than re-implementing append+failure-check logic — which was exactly Phase 2's
   CRITICAL finding. `ContextPackCompiler` stays decoupled from `LedgerWriter`.

4. **`extractSection` uses exact/prefix-colon/space match** on heading text (case-insensitive).
   Searching `"Phase 3"` matches `"#### Phase 3: Context-pack compiler"` (prefix-colon).
   Does NOT use substring `includes()` — that would match `"Phase 10"` when searching
   `"Phase 1"` if Phase 10 appeared first. The three-condition match rule is:
   `norm === target || norm.startsWith(target+":") || norm.startsWith(target+" ")`
   where `norm = line.replace(/^#+\s*/, "").trim().toLowerCase()`.

5. **`clusterLearnings` must tolerate missing dirs**: Phase 7 has not been implemented.
   The method must return `{ok:true, learnings:[]}` — not `{ok:false}` — when the
   cluster dir is absent. This is the expected path for Phases 3 and 4.

6. **`packId` monotonic allocation** follows the same pattern as Phase 2 record IDs:
   `count = readdirSync(packDir).filter(f => f.endsWith(".json")).length + 1`.
   `packDir` is lazily created — `compile` must `mkdirSync(packDir, {recursive:true})`
   BEFORE calling `readdirSync(packDir)` for id allocation. Both happen before
   `appendLedgerEvent` (step 9 in the Architecture Map). P9 still holds: the event is
   appended before the record file is written; mkdir is infrastructure, not data.

7. **`planPath` and `tasksDir` are absolute paths** passed by the caller. The compiler
   does not resolve them relative to `repoRoot`. The `repoRoot` is only used for the
   cluster-learnings path: `join(repoRoot, "skills/flow-pair/prompt-lab/clusters", cluster)`.

8. **`hash` computation**: `createHash("sha256").update(content).digest("hex").slice(0, 8)`
   from `node:crypto` — same pattern as Phase 1 `identity.ts`. Import at top of file.

---

## Directory Layout

```
New files:
  skills/flow-pair/
    lib/
      context-pack.ts                     ← T006 (ContextPackCompiler + types + deps)
    test/
      context-pack-extract.test.ts        ← T001 (extractSection) + T002 (clusterLearnings)
      context-pack-compile.test.ts        ← T003–T005 (compile: errors, manifest, P9, isolation)
    references/
      context-packs.md                    ← T007 (updated: full API + manifest schema)

Modified:
  skills/flow-pair/lib/ledger.ts          ← T006 (additive: +context_pack.created to LedgerEvent)
  skills/flow-pair/lib/cli.ts             ← T007 (additive: +dispatch subcommand)

Read-only (do not modify):
  docs/plans/016-flow-pair/flow-pair-plan.md
  skills/flow-pair/lib/paths.ts
  skills/flow-pair/lib/identity.ts
  .the-flow-state.json / the-flow.json / the-flow.md
  .flow-pair/  (orchestrator owns)

Created (this file):
  docs/plans/016-flow-pair/tasks/phase-3-context-pack-compiler/
    tasks.md                              ← THIS FILE
```

---

## Validation Record (2026-06-17)

### Validation Thesis

**Raison d’être**: Give a fresh implementation agent enough precision to TDD `lib/context-pack.ts` without clarification.

**Value claim**: Implementation agent produces a correct ContextPackCompiler with P9, P3, mutation-resistance tests, and Phase 4 compatibility on the first attempt.

**Artifact promise**: Method signatures, type definitions, step-by-step algorithm, test specs with mutation-resistance links, and Phase 4 handoff contract specified completely.

**Intended beneficiaries**: Implementation agent (worker), Phase 4 (`lib/packet.ts`).

**Proof target**: Implementation (contract-level)

**Evidence standard**: Concrete signatures, algorithm with numbered steps, test counts + mutation-resistance checklist, directory layout.

**Thesis source**: `docs/plans/016-flow-pair/flow-pair-plan.md` §Phase 3

**Thesis verdict**: Advanced (with fixes)

**Main thesis risk**: Phase 4 rendering requires `ContextPackEntry.content`; without it Phase 4 cannot render packet without re-reading files across unknown section boundaries — **fixed** by adding `content` field.

---

| Agent | Lenses Covered | Issues | Verdict |
|-------|---------------|--------|---------|
| In-session (parent) | Source Truth, Algorithm Correctness, P9 Design, Types Consistency, Forward-Compatibility, Mutation-resistance | 1 CRITICAL + 5 HIGH + 1 MEDIUM fixed; 0 open | ✅ FIXED |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| Phase 4 `lib/packet.ts` | `ContextPackEntry.content` to render packet without re-reading files | Shape mismatch | ✅ Fixed | `content: string` added to `ContextPackEntry` |
| Phase 4 `lib/packet.ts` | `allowedPaths` + `forbiddenPaths` in manifest | Shape mismatch | ✅ | Context Brief §ContextPackManifest |
| Phase 6 `lib/review.ts` | `exclusions[]` with controlled-vocabulary `reason` field for execution.log detection | Shape mismatch | ✅ | Exclusion schema has `"not found"` as controlled value; mutation-resistance test added |

**Thesis alignment**: Value claim advanced at Implementation proof level; all 6 CRITICAL/HIGH findings were mechanical (step order, match rule, content field, P9 helper, type cast, checklist) and are now fixed.

**Outcome alignment**: The dossier now specifies the context-pack compiler precisely enough for Phase 4 to receive a manifest with content-bearing entries, forbidden-path lists, and cluster-isolated learnings — "include just enough for the worker to succeed; nothing more" is achievable.

Overall: ⚠️ **VALIDATED WITH FIXES** — 7 CRITICAL/HIGH findings applied; artifact now at Implementation proof level.

