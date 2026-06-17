# Execution Log — Phase 1: Domain + skill skeleton + path/identity resolver

**Plan**: `docs/plans/016-flow-pair/flow-pair-plan.md`
**Phase**: Phase 1 of 8
**Started**: 2026-06-17
**Completed**: 2026-06-17

---

## T001 — Write failing tests for lib/identity.ts + lib/paths.ts

**Status**: ✅ complete
**Started**: 2026-06-17

### What was done
- Created `skills/flow-pair/test/identity.test.ts` — 6 tests:
  - HTTPS remote `https://github.com/foo/bar.git` → `github.com-foo-bar`
  - SSH remote `git@github.com:foo/bar.git` → `github.com-foo-bar`
  - Fallback basename+hash when git has no remote
  - Fallback basename+hash when no `.git` dir at all
  - Stability: two calls return identical repoId
  - P3 injected `GitDeps` fake works correctly
- Created `skills/flow-pair/test/paths.test.ts` — 4 tests:
  - Basic `.flow-pair/runs/r-2026-01` path construction
  - Absolute ledger root `/home/user/.flow-pair/runs/r-abc`
  - Stability across calls
  - Empty `runId` → `ok: false` with error
- Created stub `lib/identity.ts` + `lib/paths.ts` (both `throw new Error("not implemented — T002")`)
- Updated `vitest.config.ts` include to add `"skills/**/*.test.ts"` (T006 prerequisite pulled forward to enable TDD)

### Evidence (red phase)
```
FAIL  skills/flow-pair/test/identity.test.ts  6 failed
FAIL  skills/flow-pair/test/paths.test.ts     4 failed
Error: not implemented — T002

Test Files  2 failed (2)
Tests       10 failed (10)
Duration    443ms
```

---

## T002 — Implement lib/identity.ts + lib/paths.ts

**Status**: ✅ complete
**Started**: 2026-06-17

### What was done
- **`lib/identity.ts`**: `deriveRepoId(repoPath, deps?)` — parses HTTPS (`https://host/owner/repo.git`) and SSH (`git@host:owner/repo.git`) remote URLs via regex into `host-owner-repo`; basename+sha256(8-char) fallback; `nodeGitDeps()` production binding via `git remote get-url origin` (caught, returns null on failure)
- **`lib/paths.ts`**: `resolveRunDir(ledgerRoot, runId)` → `join(ledgerRoot, "runs", runId)`; empty-runId guard returns `{ ok: false, error: "runId must not be empty" }`
- Both files: P2 (zero `@earendil-works/*`), P4 (tagged-union `{ok}`), P5 (constants at module scope), P7 (`.js` imports), P3 (`nodeGitDeps()` injectable)
- Exported signatures match T002 Done-When exactly:
  - `deriveRepoId(repoPath: string, deps?: GitDeps): { ok: boolean; repoId: string; error?: string }`
  - `resolveRunDir(ledgerRoot: string, runId: string): { ok: boolean; runDir: string; error?: string }`

### Evidence (green phase)
```
✓ skills/flow-pair/test/paths.test.ts     4 passed  1ms
✓ skills/flow-pair/test/identity.test.ts  6 passed  249ms

Test Files  2 passed (2)
Tests       10 passed (10)
Duration    541ms
```

---

## T004 — SKILL.md router + references/ + templates/ stubs

**Status**: ✅ complete
**Started**: 2026-06-17

### What was done
- Created `skills/flow-pair/SKILL.md` — router skill with:
  - 6 hard invariants (flow-state non-write, pointer delivery, forbidden paths, bounded scope, P9, cluster isolation)
  - Orchestrator decision protocol table (ASK_USER/RUN_LOCAL/DELEGATE/REVIEW/FIX/ACCEPT)
  - Invocation commands for all 7 subcommands
  - Full procedure (resolve → context pack → render → deliver → review → learn)
  - Links to all 11 reference/template files
- Created 6 `references/*.md` stubs (each has `# Title` + one-sentence placeholder):
  - `architecture.md`, `orchestrator-worker-protocol.md`, `ledger-schema.md`,
    `prompt-taxonomy.md`, `context-packs.md`, `review-rubrics.md`
- Created 5 `references/templates/*.md` stubs:
  - `worker-implement.md`, `worker-fix.md`, `review-synthesis.md`,
    `learning-synthesis.md`, `orchestrator-stage.md`

---

## T005 — lib/cli.ts thin flow-pair CLI entrypoint

**Status**: ✅ complete
**Started**: 2026-06-17

### What was done
- Created `skills/flow-pair/lib/cli.ts` — hand-rolled arg parser (no commander/yargs, mirrors pij CLI shape via `parseArgs`-style loop); P2: zero `@earendil-works/*`
- Subcommands: `start` (functional — calls `deriveRepoId` + `resolveRunDir`); `dispatch/observe/review/fix/accept/ledger` (stubs return `{ok, status: "stub"}`)
- `--help` prints all 7 subcommands + options
- `--json` flag: emits structured JSON to stdout; errors go to stderr as JSON
- Exit codes: 0=success, 1=usage error, 2=runtime error

---

## T006 — justfile + .gitignore + tsconfig.json + vitest.config.ts

**Status**: ✅ complete
**Started**: 2026-06-17

### What was done
- **`justfile`**: added `flow-pair-link` and `flow-pair-test` recipes
  - `flow-pair-link`: `mkdir -p .pi/skills && ln -sf "$(realpath skills/flow-pair)" .pi/skills/flow-pair`
  - `flow-pair-test *ARGS`: `npx vitest run skills/flow-pair/test/ "$@"`
- **`.gitignore`**: `.flow-pair/` was **already present** (line 181) — no change needed
- **`tsconfig.json`**: added `"skills/**/*.ts"` to `include` array (test files excluded by existing `"**/*.test.ts"` in exclude)
- **`vitest.config.ts`**: added `"skills/**/*.test.ts"` to `test.include` (pulled forward to T001 to enable TDD)

### Gotcha
`vitest run <path>` with an include-filtered config ignores the path argument — the path only acts as a filter on files already matched by `include`. Had to update `vitest.config.ts` before T001's red phase could run. Noted as discovery below.

---

## T007 — Validation

**Status**: ✅ complete
**Started**: 2026-06-17

### Evidence
```bash
# just flow-pair-test
✓ skills/flow-pair/test/paths.test.ts     4 passed
✓ skills/flow-pair/test/identity.test.ts  6 passed
Test Files  2 passed (2) | Tests  10 passed (10)

# just typecheck
tsc --noEmit  →  (no output, exit 0)

# just flow-pair-link
✓ .pi/skills/flow-pair → /Users/jordanknight/pi-hacking/pij/skills/flow-pair
```

Skill discovery confirmed: `.pi/skills/flow-pair` symlink present; skill will be auto-loaded on next `pi` session start.

---

## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-06-17 | T006/T001 | gotcha | `vitest run <path>` only filters files already matched by `test.include`; a bare path arg doesn't override the include list | Updated `vitest.config.ts` include before running T001's red phase. `just flow-pair-test` recipe now uses explicit `npx vitest run skills/flow-pair/test/` which also works. |
| 2026-06-17 | T006 | insight | `.flow-pair/` was already gitignored (line 181) — the tasks.md pre-impl check correctly said "exists/modify" but no change was actually required | No action needed; `.gitignore` left unchanged. |

---

## Phase Complete

**All tasks**: T001 ✅ T002 ✅ T003 ✅ (pre-done) T004 ✅ T005 ✅ T006 ✅ T007 ✅

**Test count**: 10 (identity: 6, paths: 4)
**Typecheck**: clean (0 errors, 0 warnings)
**Symlink**: `.pi/skills/flow-pair → /Users/jordanknight/pi-hacking/pij/skills/flow-pair`
