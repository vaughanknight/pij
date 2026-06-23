# Phase 5: Observe + Diff Capture — Tasks

**Phase**: 5 — Observe + Diff Capture
**Plan**: `docs/plans/016-flow-pair/flow-pair-plan.md` §Phase 5
**Depends on**: Phase 2 (`appendLedgerEvent`, `resolveRunDir`, `LedgerEvent` union)
**Baseline**: 88 tests (Phase 1: 14, Phase 2: 26, Phase 3: 22, Phase 4: 26), 8 lib files + CLI
**Target**: ≥17 new Phase-5 tests; `just flow-pair-test` still ≥88+17=105

---

## Executive Briefing

Phase 5 builds `lib/observe.ts` — the **diff capturer**: a pi-free module that captures
what the worker changed in the repository, writes three diff artifacts to the ledger, and
ties the observation to the active delegation via a new `files.changed` ledger event.

**What it produces (per `AC-04`)**:

```
runs/<runId>/diffs/
  diff-NNNN.patch              ← full git diff HEAD output (unified diff)
  diff-NNNN.stat.txt           ← git diff HEAD --stat (human-readable summary)
  diff-NNNN.changed-files.json ← {diffId, runId, delegationId, changedFiles[], at}
```

**AC-13 (load-bearing flow-state guard)**: before writing any artifact or appending any event,
`capture()` checks that NONE of the diff's changed files are:
- `.the-flow-state.json`, `the-flow.json`, `the-flow.md` (exact match)
- any path starting with `.flow-pair/` (ledger protection)

If any forbidden path appears, `capture()` returns `{ok:false}` immediately — no writes at all.
This is defense-in-depth for the single-flow-state-writer invariant (AC-08).

**P9 ordering** inside `capture()` (critical — the P9 contract this phase must encode):
```
1. Run git commands (read-only — no side effects)
2. Parse changedFiles list
3. [AC-13 guard] Check flow-state files → {ok:false} if any forbidden path present
4. Compute diffId (readdirSync(diffsDir) count-based, like prior phases)
5. [P9] appendLedgerEvent(files.changed event) BEFORE any writeFileSync
   if (!ev.ok) return {ok:false}   ← no artifacts written
6. mkdirSync(diffsDir, {recursive:true})
7. writeFileSync(manifestPath, JSON.stringify({...}))
8. writeFileSync(patchPath, patch)
9. writeFileSync(statPath, stat)
10. return {ok:true, result}
```

The AC-13 guard fires **before** step 5. If the P9 event append fails, **no artifacts are written**.
Both of these must be mutation-checkable (load-bearing assertions that flip RED if removed).

**Manual-observe v1**: no daemon/watcher. `flow-pair observe` invokes `capture()` on demand.

**TDD order**: T001–T003 write failing tests (≥14 total, plus ≥3 CLI subprocess in T006); T004 stubs `lib/observe.ts` +
additive ledger edits; T005 implements full `lib/observe.ts`; T006 wires CLI; T007 gates + mutations.

---

## 7-Column Task Table

| Status | ID   | Task                                                                              | Domain    | Path(s)                                                                           | Done-When                                                                                                                                                                                                             | Notes                                                                                                    |
|--------|------|-----------------------------------------------------------------------------------|-----------|-----------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| [ ]    | T001 | Write failing tests: `capture()` — basic diff artifacts (6 tests)                | flow-pair | `skills/flow-pair/test/observe.test.ts`                                           | 6 RED tests: `{ok:true}` with real git fixture (staged change); `diff-0001.patch` written + non-empty; `diff-0001.stat.txt` written + non-empty; `diff-0001.changed-files.json` has required fields; `result.changedFiles` contains the staged file; **untracked new file in fixture appears in `result.changedFiles`** (proves porcelain sourcing) | Real git fixture: `mkdtempSync` → `git init` → initial commit → staged change + one untracked file → `capture()` |
| [ ]    | T002 | Write failing tests: flow-state guard AC-13 (4 tests)                            | flow-pair | `skills/flow-pair/test/observe.test.ts`                                           | 4 RED tests: (1) nested-path staged file `docs/plans/016-flow-pair/.the-flow-state.json` → `{ok:false}` + no writes — **load-bearing case** (real-world path layout; bare `includes(f)` would miss this); (2) root-level `the-flow.json` staged → `{ok:false}` + no writes; (3) `.flow-pair/runs/x` prefix staged → `{ok:false}` + no writes; (4) **untracked** `the-flow.md` (not staged) → `{ok:false}` + no writes — **guard-bypass test** (validates porcelain sourcing closes the untracked gap) | All 4 cases: `expect(result.ok).toBe(false)` + `expect(appendWasCalled/writeWasCalled).toBe(false)`. Fixture for test 1: `mkdirSync(join(repoDir, "docs/plans/016-flow-pair"), {recursive:true})` before writing the forbidden file. |
| [ ]    | T003 | Write failing tests: P9 ordering invariant (4 tests)                             | flow-pair | `skills/flow-pair/test/observe.test.ts`                                           | 4 RED tests: callLog `appendFileSync:events.jsonl` before any `writeFileSync:diffs/`; FailDeps (`appendFileSync` throws → `{ok:false}` + diff files NOT written); `files.changed` event in `events.jsonl` with correct field set; `{ok:false}` on invalid runId (resolveRunDir guard) | TrackingDeps wraps real deps; FailDeps wraps real git + existsSync/readdirSync but overrides appendFileSync |
| [ ]    | T004 | Create stub `lib/observe.ts` + additive ledger edits                             | flow-pair | `skills/flow-pair/lib/observe.ts` (new); `skills/flow-pair/lib/ledger.ts` (additive); `skills/flow-pair/schemas/event.schema.json` (additive) | Stub exports all types + `Observe` class that throws "not implemented"; `files.changed` in `LedgerEvent` union; `files.changed` oneOf branch in schema (`additionalProperties:false`); `just flow-pair-test` prior 88 still GREEN; new tests still RED | Mirror pattern from `packet.written` / `context_pack.created` in prior phases |
| [ ]    | T005 | Implement `lib/observe.ts` (full: `capture()` + flow-state guard + P9)          | flow-pair | `skills/flow-pair/lib/observe.ts`                                                 | All T001–T003 GREEN (≥14 tests pass); `capture()` returns `{ok:false}` if any git command returns `{ok:false}`; Phase 1–4 tests still pass; typecheck clean; lint exit 0 | P2/P3/P4/P9; uses `spawnSync` (not `execSync`) for git — array args, no shell injection |
| [ ]    | T006 | Wire `flow-pair observe` CLI subcommand + subprocess test                        | flow-pair | `skills/flow-pair/lib/cli.ts`; `skills/flow-pair/test/cli-observe.test.ts` (new) | CLI: `flow-pair observe --run-id <id> --delegation <id> [--repo <path>] [--ledger-root <p>]` prints `diffId` to stdout (exit 0); `--json` emits full `ObserveResult` JSON; error → stderr + exit 2; help updated. **Subprocess test** (`cli-observe.test.ts`): ≥3 tests — success stdout = `diffId: diff-NNNN` only; `--json` output parses as full `ObserveResult` shape; error path (invalid runId) exits 2 with stderr | Mirror `cli-dispatch.test.ts` pattern from Phase 4; `spawnSync` with a real git fixture + ledger |
| [ ]    | T007 | Mutation checks + full gate                                                      | flow-pair | `skills/flow-pair/lib/observe.ts`, `test/observe.test.ts`                         | `just flow-pair-mutate` on AC-13 guard: ≥1 test flips RED → GREEN on restore (nested-path case + no-write assertion); `just flow-pair-mutate` on P9 guard: ≥1 test flips RED → GREEN on restore; `just flow-pair-test` ≥105 passes; typecheck + lint clean; guard names + flipped assertions documented | Required: name the assertion each mutation would flip |

---

## Prior-Phase Context

### Phase 2 seams (directly consumed by `capture()`)

```typescript
// lib/ledger.ts — already exported
export function appendLedgerEvent(
  deps: Pick<LedgerDeps, "appendFileSync">,
  runDir: string,
  event: LedgerEvent,
): { ok: boolean; error?: string }

export function resolveRunDir(
  ledgerRoot: string,
  runId: string,
): { ok: boolean; runDir: string; error?: string }

// LedgerEvent union (additive in T004):
type LedgerEvent =
  | { type: "run.started"; runId: string; repoId: string; at: string }
  | { type: "run.closed"; runId: string; at: string }
  | { type: "delegation.created"; runId: string; delegationId: string; at: string }
  | { type: "prompt_trial.created"; runId: string; delegationId: string; trialId: string; at: string }
  | { type: "review.created"; runId: string; delegationId: string; reviewId: string; at: string }
  | { type: "learning.created"; runId: string; delegationId: string; learningId: string; at: string }
  | { type: "context_pack.created"; runId: string; delegationId: string; packId: string; at: string }
  | { type: "packet.written"; runId: string; delegationId: string; packetPath: string; at: string }
  //                                                                ↑ T004 adds:
  | { type: "files.changed"; runId: string; delegationId: string; diffId: string; changedFiles: string[]; at: string }
```

### Ledger directory (already scaffolded by Phase 2 `createRun`)

```
runs/<runId>/
  events.jsonl           ← append-only event log
  diffs/                 ← scaffolded by createRun; observe writes here
```

The `diffs/` directory already exists (Phase 2 `createRun` scaffolds it). `capture()` does
NOT need `mkdirSync` for the dir itself — but should call `deps.mkdirSync(diffsDir, {recursive:true})`
as defensive belt-and-suspenders for test fixtures that may not have called `createRun`.

---

## Architecture Map

```
lib/observe.ts
  ├── ObserveDeps interface               ← P3: injectable; includes execGit for P2 compliance
  │     execGit(args: string[], cwd: string): {ok: boolean; stdout?: string; stderr?: string; error?: string}
  │     writeFileSync(path: string, data: string): void
  │     appendFileSync(path: string, data: string): void
  │     mkdirSync(path: string, opts: {recursive: boolean}): void
  │     existsSync(path: string): boolean
  │     readdirSync(path: string): string[]
  │
  ├── nodeObserveDeps(): ObserveDeps      ← production binding
  │     execGit: uses spawnSync("git", args, {cwd, encoding:"utf8"})  ← NO shell string; array args
  │
  ├── FLOW_STATE_FORBIDDEN = [
  │     ".the-flow-state.json",
  │     "the-flow.json",
  │     "the-flow.md",
  │   ] as const                          ← P5: constant next to the guard that uses it
  │
  ├── ObserveResult interface
  │     diffId: string                    ← e.g. "diff-0001"
  │     runId: string
  │     delegationId: string
  │     changedFiles: string[]            ← from git status --porcelain (staged + unstaged + untracked)
  │     patchPath: string                 ← absolute path to .patch file
  │     statPath: string                  ← absolute path to .stat.txt file
  │     manifestPath: string              ← absolute path to .changed-files.json
  │
  ├── ObserveOpts interface
  │     repoRoot: string                  ← absolute path to repo (for git commands)
  │     runId: string
  │     delegationId: string
  │
  ├── Observe class
  │     constructor(
  │       ledgerRoot: string,
  │       deps?: ObserveDeps,             ← P3: default = nodeObserveDeps()
  │     )
  │
  │     capture(opts: ObserveOpts)
  │       : { ok: boolean; result?: ObserveResult; error?: string }
  │
  │       Algorithm:
  │       1. resolveRunDir(this.ledgerRoot, opts.runId) → {ok:false} on bad runId
  │       2. deps.execGit(["status", "--porcelain"], opts.repoRoot)
  │          if !ok → {ok:false, error: stderr ?? error ?? "git status failed"}
  │          → parse stdout lines → changedFiles: string[]
  │          parse rule: strip first 3 chars ("XY ") from each line;
  │            rename lines (`R  old → new`): take substring after " → "
  │            untracked lines (`?? path`): same strip — included
  │       3. deps.execGit(["diff", "HEAD", "--stat"], opts.repoRoot)
  │          if !ok → {ok:false, error: stderr ?? error ?? "git diff --stat failed"}
  │          → stat: string
  │       4. deps.execGit(["diff", "HEAD"], opts.repoRoot)
  │          if !ok → {ok:false, error: stderr ?? error ?? "git diff failed"}
  │          → patch: string
  │       5. [AC-13 guard] find forbidden = changedFiles.find(
  │               f =>
  │                 FLOW_STATE_FORBIDDEN.includes(basename(f) as never) ||
  │                 FLOW_STATE_FORBIDDEN.some(n => f.endsWith("/" + n)) ||
  │                 f.startsWith(".flow-pair/")
  │             )
  │             // .flow-pair/ is gitignored; porcelain won't list it unless force-added
  │             // — belt-and-suspenders only. Load-bearing: basename/suffix match on
  │             // tracked flow-state files (e.g. nested docs/plans/.../.the-flow-state.json).
  │             if (forbidden) return {ok:false, error:"observe: forbidden path in diff: " + forbidden}
  │       6. diffId = allocate via readdirSync(diffsDir):
  │             existsSync(diffsDir) ? readdirSync(diffsDir).filter(f=>f.endsWith(".json")).length : 0
  │             → `diff-${String(count+1).padStart(4,"0")}`
  │       7. [P9] appendLedgerEvent(this.deps, runDir, {
  │               type: "files.changed", runId, delegationId, diffId, changedFiles, at
  │             })
  │             if (!ev.ok) return {ok:false, error: ev.error}  ← no artifacts written
  │       8. deps.mkdirSync(diffsDir, {recursive:true})
  │       9. deps.writeFileSync(manifestPath, JSON.stringify({...manifest object...}, null, 2))
  │      10. deps.writeFileSync(patchPath, patch)
  │      11. deps.writeFileSync(statPath, stat)
  │      12. return {ok:true, result: {diffId, runId, delegationId, changedFiles, patchPath, statPath, manifestPath}}
  │
  └── exports: Observe, ObserveResult, ObserveOpts, ObserveDeps, nodeObserveDeps

lib/ledger.ts (additive in T004):
  LedgerEvent union += {
    type: "files.changed";
    runId: string;
    delegationId: string;
    diffId: string;
    changedFiles: string[];
    at: string;
  }

schemas/event.schema.json (additive in T004):
  New oneOf branch:
  {
    "title": "files.changed",
    "type": "object",
    "required": ["type", "runId", "delegationId", "diffId", "changedFiles", "at"],
    "properties": {
      "type": { "type": "string", "const": "files.changed" },
      "runId": { "type": "string" },
      "delegationId": { "type": "string" },
      "diffId": { "type": "string" },
      "changedFiles": { "type": "array", "items": { "type": "string" } },
      "at": { "type": "string", "format": "date-time" }
    },
    "additionalProperties": false
  }

lib/cli.ts (T006):
  observe subcommand: upgraded from stub → real
  --run-id <id>     : required
  --delegation <id> : required
  --repo <path>     : default process.cwd()
  stdout: "diffId: diff-NNNN\nchangedFiles: N file(s)"
  --json stdout: {"ok":true,"result":{"diffId":"diff-NNNN","runId":"...","delegationId":"...","changedFiles":[...],"patchPath":"...","statPath":"...","manifestPath":"..."}}
  stderr + exit 2 on error

test files:
  test/observe.test.ts   ← T001 (6) + T002 (4) + T003 (4) = 14 new tests
```

---

## Context Brief

### `ObserveDeps` — injectable interface (P3)

| Method | Signature | Notes |
|--------|-----------|-------|
| `execGit` | `(args: string[], cwd: string) => {ok: boolean; stdout?: string; stderr?: string}` | Uses `spawnSync` (array args — no shell injection); returns `{ok:false}` on non-zero exit |
| `writeFileSync` | `(path: string, data: string): void` | Writes diff artifacts |
| `appendFileSync` | `(path: string, data: string): void` | Used by `appendLedgerEvent` (P9 event) |
| `mkdirSync` | `(path: string, opts: {recursive: boolean}): void` | Creates `diffs/` if absent |
| `existsSync` | `(path: string): boolean` | Guards `readdirSync` on `diffs/` |
| `readdirSync` | `(path: string): string[]` | Counts existing diffs for `nextId` |

**Why `execGit` not `execSync`?** — `execSync("git " + args.join(" "), ...)` is a shell-injection
vector; `spawnSync("git", args, ...)` passes args as an array, bypassing the shell entirely.
`nodeObserveDeps()` binds `execGit` to `spawnSync`. Tests use `nodeObserveDeps()` (real git on
the temp fixture) — they do NOT fake `execGit`.

### `ObserveResult`

| Field | Type | Description |
|-------|------|-------------|
| `diffId` | `string` | Monotonic ID, e.g. `"diff-0001"` |
| `runId` | `string` | From `opts.runId` |
| `delegationId` | `string` | From `opts.delegationId` |
| `changedFiles` | `string[]` | From `git status --porcelain` — includes staged, unstaged, and untracked files |
| `patchPath` | `string` | Absolute path: `runs/<id>/diffs/diff-NNNN.patch` |
| `statPath` | `string` | Absolute path: `runs/<id>/diffs/diff-NNNN.stat.txt` |
| `manifestPath` | `string` | Absolute path: `runs/<id>/diffs/diff-NNNN.changed-files.json` |

### `files.changed` event (new LedgerEvent branch — T004)

```typescript
{
  type: "files.changed",
  runId: string,
  delegationId: string,
  diffId: string,           // e.g. "diff-0001"
  changedFiles: string[],   // same list as result.changedFiles
  at: string,               // ISO-8601 timestamp
}
```

Mirrors shape of prior event types; `additionalProperties: false` in schema.

### Flow-state guard (AC-13)

```typescript
const FLOW_STATE_FORBIDDEN = [
  ".the-flow-state.json",
  "the-flow.json",
  "the-flow.md",
] as const;

// In capture(), after parsing changedFiles — BEFORE any write:
const forbidden = changedFiles.find(
  (f) =>
    FLOW_STATE_FORBIDDEN.includes(basename(f) as never) ||
    FLOW_STATE_FORBIDDEN.some((n) => f.endsWith("/" + n)) ||
    f.startsWith(".flow-pair/"),
);
if (forbidden) {
  return { ok: false, error: `observe: forbidden path in diff: ${forbidden}` };
}
```

**Why `basename(f)` not `includes(f)` directly?** — git reports **repo-relative paths** like
`docs/plans/016-flow-pair/.the-flow-state.json`. A bare `includes(f)` check against the
short name list would return `false` for any nested path. `basename(f)` extracts the final
component so the match works regardless of depth. The `f.endsWith("/" + n)` form is a
redundant belt-and-suspenders for any edge case where `basename()` might behave unexpectedly
(e.g. trailing slash). Both checks are needed.

**Why `.flow-pair/` prefix check?** — `.flow-pair/` is gitignored, so `git status --porcelain`
(without `--ignored`) won't list ledger files unless they are force-added (`git add -f`).
The prefix guard is belt-and-suspenders for that adversarial case only. The **load-bearing**
cases are the basename/suffix checks for the three tracked flow-state files.

**Why before P9?** — If the guard fires, we write nothing (no event, no artifacts). Appending
a `files.changed` event for a contaminated diff would make the ledger appear to record a clean
observation when it wasn't.

### `git status --porcelain` parsing

Porcelain format: each line is `XY<space><path>` where `XY` = two status chars.

```
M  README.md        (staged modification)
?? untracked.ts     (untracked new file)
R  old.ts -> new.ts (renamed)
 A nested/new.ts    (staged new file in subdir)
```

Parse rule:
```typescript
const changedFiles = lines
  .map((line) => {
    const rest = line.substring(3); // strip "XY "
    const arrowIdx = rest.indexOf(" -> ");
    return arrowIdx !== -1 ? rest.substring(arrowIdx + 4) : rest;
  })
  .filter(Boolean);
```

`--porcelain` without `--ignored` does NOT list `.gitignore`'d files unless force-added
(`git add -f`). So `.flow-pair/**` never appears in normal runs — the prefix guard is
belt-and-suspenders only.

```
Step 5 [AC-13 guard]  → {ok:false} if any forbidden path  (no writes)
Step 6 diffId alloc   → read-only
Step 7 [P9] appendLedgerEvent(files.changed) → {ok:false} if append fails (no artifacts)
Step 8 mkdirSync
Step 9-11 writeFileSync × 3 (manifest, patch, stat)
Step 12 return {ok:true, result}
```

Mutation-checkable:
- **AC-13 guard mutation** (`if (forbidden) → if (false)`): The negative test
  `expect(result.ok).toBe(false)` flips to failing (result becomes `{ok:true}`), and
  the no-write assertion (`appendWasCalled === false` / no `writeFileSync:diffs/`) flips
  if the guard is moved after any ledger/artifact write.
- **P9 guard mutation** (`if (!ev.ok) → if (false)`): The FailDeps test
  `expect(writeWasCalled).toBe(false)` flips to failing (writeFileSync is called).

### Vacuous-test trap (CRITICAL)

The Phase 3 lesson applies here: **FailDeps must wrap real fs/git for everything except the
injected failure**. If `readFileSync` (or `execGit`) fails BEFORE the P9 guard, the test goes
RED vacuously (the guard never executes). FailDeps must:
- Use real `execGit` (real git on the fixture — changedFiles are computed before the guard)
- Use real `existsSync` / `readdirSync` (for diffId computation)
- Throw only on `appendFileSync` — injecting failure at the exact guard line
- Track `writeWasCalled` via a fake `writeFileSync` that records the call

### Git fixture pattern (used in all 12 tests)

```typescript
// Shared helper
function makeGitFixture(): { repoDir: string; cleanup: () => void } {
  const repoDir = mkdtempSync(join(tmpdir(), "observe-test-"));
  execSync("git init", { cwd: repoDir, encoding: "utf8" });
  execSync("git config user.email ci@test.com", { cwd: repoDir });
  execSync("git config user.name CI", { cwd: repoDir });
  // initial commit to establish HEAD
  writeFileSync(join(repoDir, "README.md"), "# Test\n");
  execSync("git add README.md", { cwd: repoDir });
  execSync("git commit -m init", { cwd: repoDir });
  // staged change + one untracked file (so git status --porcelain lists both)
  writeFileSync(join(repoDir, "src.ts"), "export const x = 1;\n");
  execSync("git add src.ts", { cwd: repoDir });
  // Also create an untracked file (not git add'd)
  writeFileSync(join(repoDir, "untracked.ts"), "export const y = 2;\n");
  return { repoDir, cleanup: () => rmSync(repoDir, { recursive: true, force: true }) };
}

// For flow-state guard tests: same fixture but add forbidden file
function makeGitFixtureWithForbiddenFile(filename: string) {
  const { repoDir, cleanup } = makeGitFixture();
  const targetPath = join(repoDir, filename);
  // Required for nested forbidden paths like `.flow-pair/runs/x`.
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, "forbidden content\n");
  execSync(`git add "${filename}"`, { cwd: repoDir });
  return { repoDir, cleanup };
}
```

Note: `git status --porcelain` captures staged changes AND untracked files. After `git add src.ts`,
the file appears in the diff. The fixture does NOT commit the staged change — observe captures
the in-progress state.

### Mutation-resistance checklist

| Guard | Location | Mutation | Assertion that flips RED | Test |
|-------|----------|----------|--------------------------|------|
| AC-13 flow-state | `if (forbidden) return {ok:false}` | `if (false)` | `expect(result.ok).toBe(false)` and no event/artifact write assertion | T002 test 1 (`docs/plans/016-flow-pair/.the-flow-state.json` — nested path, load-bearing) |
| P9 event failure | `if (!ev.ok) return {ok:false}` | `if (false)` | `expect(deps.writeWasCalled).toBe(false)` | T003 FailDeps test |
| resolveRunDir guard | inherited from Phase 2 | any | `expect(result.ok).toBe(false)` | T003 invalid-runId test |

---

## Discoveries

1. **`diffs/` already scaffolded by Phase 2 `createRun`** — like `prompts/`, Phase 2's
   `createRun` creates all 7 run subdirectories including `diffs/`. `capture()` calls
   `deps.mkdirSync(diffsDir, {recursive:true})` defensively (for test fixtures that
   bypass `createRun`). Tests must scaffold the `diffs/` dir OR rely on this defensive call.

2. **`spawnSync` not `execSync`** — `execSync` concatenates args into a shell string, creating
   a shell-injection vector when file paths or branch names contain spaces/metacharacters.
   `spawnSync("git", args, {cwd, encoding:"utf8"})` bypasses the shell entirely. This is
   the same reason `--send-to` was dropped from Phase 4's CLI.

3. **`changedFiles` from `git status --porcelain`** — captures staged, unstaged, AND untracked
   files. `git diff HEAD --name-only` (prior design) omits untracked files entirely, meaning:
   (a) the worker's brand-new `lib/*.ts` files would be invisible in `changedFiles`, and
   (b) an untracked `.the-flow-state.json` would **bypass the AC-13 guard entirely** (a
   guard-bypass security hole). Porcelain sourcing closes both problems. `git diff HEAD` is
   still used for the patch body (untracked content isn't diffs, it's new files).

4. **`FLOW_STATE_FORBIDDEN` guard matches by basename/suffix, not full path** — git reports
   **repo-relative paths** (e.g. `docs/plans/016-flow-pair/.the-flow-state.json`). A bare
   `FLOW_STATE_FORBIDDEN.includes(f)` would return `false` for any nested path — the guard
   would be **vacuous in production**. Fix: `FLOW_STATE_FORBIDDEN.includes(basename(f))`
   (catches the file regardless of directory depth) plus `f.endsWith("/" + n)` (belt-and-
   suspenders). The `.flow-pair/` prefix check is NOT load-bearing (gitignored, never appears
   in normal porcelain output); the basename/suffix checks ARE load-bearing.

5. **diffId allocation via `readdirSync` count** — same pattern as Phase 2 `nextId`. Count
   `.json` files in `diffs/` (not all files, since we write `.patch` and `.stat.txt` too).
   `existsSync(diffsDir)` guard prevents `ENOENT` when `diffs/` hasn't been created yet.

6. **`appendLedgerEvent` works with `ObserveDeps` structurally** — `appendLedgerEvent` expects
   `Pick<LedgerDeps, "appendFileSync">`. `ObserveDeps` has `appendFileSync` with the same
   signature. TypeScript structural typing means `this.deps` is compatible without a cast.

7. **Test fixtures must use `execSync` from node:child_process for fixture setup** (not
   `nodeObserveDeps()`). The fixture setup runs `git init`, `git add`, `git commit` directly
   via `execSync`. The test then passes `nodeObserveDeps()` (which uses `spawnSync` internally)
   to `new Observe(ledgerRoot, nodeObserveDeps())`.

8. **The `files.changed` event must be appended BEFORE the `diffId` appears in any artifact** —
   this ensures recovery: if a crash occurs between the event append and the artifact writes,
   the ledger records the intent even if no artifacts exist yet. The `diffId` in the event
   matches the `diffId` in the artifact file names.

---

## Directory Layout

```
New files:
  skills/flow-pair/
    lib/
      observe.ts                           ← T004 stub → T005 full impl
    test/
      observe.test.ts                      ← T001 (6) + T002 (4) + T003 (4) = 14 tests
      cli-observe.test.ts                  ← T006 ≥3 subprocess tests (success/json/error)

Modified:
  skills/flow-pair/lib/ledger.ts           ← T004 additive: +files.changed to LedgerEvent union
  skills/flow-pair/schemas/event.schema.json ← T004 additive: +files.changed oneOf branch
  skills/flow-pair/lib/cli.ts              ← T006: upgrade observe stub → real subcommand

Read-only (do not modify):
  docs/plans/016-flow-pair/flow-pair-plan.md
  .the-flow-state.json / the-flow.json / the-flow.md
  .flow-pair/   (orchestrator owns)
  skills/flow-pair/lib/paths.ts
  skills/flow-pair/lib/identity.ts
  skills/flow-pair/lib/ledger.ts           (except the T004 additive edits listed above)
  skills/flow-pair/lib/context-pack.ts
  skills/flow-pair/lib/packet.ts

Created (this file):
  docs/plans/016-flow-pair/tasks/phase-5-observe-diff-capture/
    tasks.md                               ← THIS FILE
```

---

## Validation Record (2026-06-18)

### Validation Thesis

**Raison d'être**: Expand `flow-pair-plan.md` Phase 5 into implementation-ready work for `lib/observe.ts`: capture worker diffs recoverably, append a `files.changed` ledger event, and enforce AC-13 before any write.

**Value claim**: Phase 5 becomes safer and cheaper to implement/review because the dossier names the exact artifacts, event schema, DI surface, P9 ordering, AC-13 no-write invariant, mutation checks, and Phase-6 handoff shape.

**Artifact promise**: A Phase-5 implementer can write 12 red tests, add the observe API/schema/CLI, and produce a result that downstream review/fix code can consume without re-deciding contracts.

**Intended beneficiaries**: Phase-5 implementation agents, reviewers, the Phase-6 review/fix loop, and the orchestrator ledger/recovery workflow.

**Proof target**: Implementation, with Integration checks for the immediate Phase-6 consumer.

**Evidence standard**: Source-code match to Phase-2 ledger exports and current schemas, plan alignment with Phase 5 AC-04/AC-13, mutation-checkable tests for AC-13 and P9, explicit CLI/API result shape for Phase 6, and baseline test evidence.

**Thesis source**: `docs/plans/016-flow-pair/flow-pair-plan.md:348-357` — “Capture what the worker changed, recoverably” and deliver `lib/observe.ts` + `changed-files.json` + `files.changed`; `flow-pair-plan.md:360-370` for the Phase-6 consumer.

**Thesis verdict**: Advanced.

**Main thesis risk**: If implementers weaken the AC-13 no-write assertions or the observe JSON contract, Phase 6 can accept contaminated or inaccessible diff evidence.

---

| Validator | Lenses Covered | Thesis Axes Covered | Issues | Verdict |
|-----------|----------------|---------------------|--------|---------|
| Inline thesis/source pass | Thesis Alignment, Evidence Sufficiency, Proof-Level Fit, Domain Boundaries | Implementation Readiness, Safety to Change | 0 open | ✅ aligned |
| Inline safety/testability pass | Edge Cases & Failures, Hidden Assumptions, Technical Constraints | AC-13 Safety, P9 Testability | 1 HIGH fixed, 1 MEDIUM fixed | ⚠️ → ✅ |
| Inline forward-compat/API pass | Forward-Compatibility, Integration & Ripple, System Behavior | Downstream Usefulness, Contract Integrity | 1 HIGH fixed, 1 MEDIUM fixed | ⚠️ → ✅ |
| Baseline gate | Deployment & Ops, Regression | Review Compression | 0 | ✅ `just flow-pair-test` 88/88 passed |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| Phase 6 `lib/review.ts` / review-synthesis | Consume the observed diff evidence for artifact-contract checks and write a review record | Shape mismatch | ✅ | `ObserveResult` includes `diffId`, `changedFiles`, `patchPath`, `statPath`, `manifestPath`; T006 now requires full `--json` result for CLI consumers |
| Phase 6 fix dossier + fix packet | Scope fixes to files named by review findings / observed changes | Encapsulation lockout | ✅ | `files.changed` event + changed-files manifest expose `changedFiles[]`; result paths expose the artifacts without importing private observe internals |
| Phase 8 SKILL wiring (`start→dispatch→observe→review→fix→accept`) | Invoke observe through the CLI, not a TS import, and pass machine-readable output to later steps | Contract drift | ✅ | T006 now requires non-JSON stdout plus a machine-readable `--json` stdout contract |

**Thesis alignment**: The value claim is advanced at Implementation proof level; the main thesis risk is that weak AC-13 no-write or observe-JSON assertions would let Phase 6 consume unsafe/inaccessible diff evidence.

**Outcome alignment**: Yes — by requiring patch/stat/changed-files artifacts, a `files.changed` event, AC-13 no-write guard, and a Phase-6-consumable JSON `ObserveResult`, the dossier advances “Prove one high-value loop end-to-end before automating anything: `READY plan → delegate one implement phase → observe diff → review → fix → accept → record learning`.”

**Standalone?**: No — downstream Phase 6 (`flow-pair-plan.md:360-370`) depends on Phase 5's observe artifacts and contracts.

Overall: ⚠️ VALIDATED WITH FIXES
