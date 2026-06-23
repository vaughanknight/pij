# Phase 6: Review + fix loop — Task Breakdown

**Phase**: 6 of 8  
**Objective**: Mechanize the deterministic part of code review and generate a narrow fix packet when
review fails. The expensive LLM judgment stays with the orchestrator; `lib/review.ts` handles only
the artifact-contract checks (AC-05) and the scope-bounded fix packet (AC-06).  
**Depends on**: Phases 3, 4, 5 — reuse `appendLedgerEvent`, `resolveRunDir`, `LedgerDeps` pattern,
`PacketRenderer`-style template rendering.

---

## Deliverables

| File | Status | Notes |
|------|--------|-------|
| `skills/flow-pair/lib/review.ts` | NEW | `Review` class + `generateFixPacket()` |
| `skills/flow-pair/test/review.test.ts` | NEW | T001–T005 failing-first tests |
| `skills/flow-pair/test/cli-review.test.ts` | NEW | ≥3 CLI subprocess tests |
| `skills/flow-pair/references/review-rubrics.md` | EXTEND | Fill Dimensions 1–10 (stub exists) |
| `skills/flow-pair/references/templates/review-synthesis.md` | FILL | Stub → full template |
| `skills/flow-pair/references/templates/worker-fix.md` | FILL | Stub → full template |
| `skills/flow-pair/lib/ledger.ts` | ADDITIVE | Add `file?` to `ReviewFinding`; new event types |
| `skills/flow-pair/schemas/review.schema.json` | ADDITIVE | Add `file?` to findings items |
| `skills/flow-pair/schemas/event.schema.json` | ADDITIVE | `review.recorded` + `fix_packet.written` |
| `skills/flow-pair/lib/cli.ts` | ADDITIVE | Wire `review` + `fix` subcommands |
| `docs/plans/016-flow-pair/tasks/phase-6-review-fix-loop/execution.log.md` | NEW | Required artifact |

---

## Proposed public API (`lib/review.ts`)

### Verdicts (P5 — constants single-sourced)

```typescript
export const VERDICT = {
  APPROVE:            "APPROVE",
  APPROVE_WITH_NOTES: "APPROVE_WITH_NOTES",
  FIX_REQUIRED:       "FIX_REQUIRED",
} as const;
export type Verdict = typeof VERDICT[keyof typeof VERDICT];

// Finding kinds (P5)
export const FINDING_KIND = {
  ARTIFACT_CONTRACT: "artifact_contract",
  TEST_QUALITY:      "test_quality",
  SCOPE:             "scope",
  REGRESSION:        "regression",
  OTHER:             "other",
} as const;
```

### `ReviewDeps` interface (P3 — injected)

```typescript
export interface ReviewDeps {
  existsSync(path: string): boolean;
  readFileSync(path: string, enc: "utf8"): string;
  readdirSync(path: string): string[];
  writeFileSync(path: string, data: string): void;
  appendFileSync(path: string, data: string): void;
  mkdirSync(path: string, opts: { recursive: boolean }): void;
}
export function nodeReviewDeps(): ReviewDeps;
```

### `Review` class

```typescript
export class Review {
  constructor(
    readonly ledgerRoot: string,
    private readonly deps: ReviewDeps = nodeReviewDeps(),
  );

  evaluate(opts: EvaluateOpts): {
    ok: boolean;
    verdict?: Verdict;
    findings?: ReviewFinding[];
    reviewId?: string;
    error?: string;
  };

  generateFixPacket(opts: FixPacketOpts): {
    ok: boolean;
    packet?: FixPacket;
    error?: string;
  };
}
```

### `EvaluateOpts`

```typescript
export interface EvaluateOpts {
  runId: string;
  delegationId: string;
  /** Absolute path to the phase task directory; execution.log.md must be present here (AC-05). */
  phaseDir: string;
  /** Absolute repo root — used to make finding `file` paths repo-relative for AC-06 allowedFiles. */
  repoRoot: string;
}
```

### `FixPacketOpts`

```typescript
export interface FixPacketOpts {
  runId: string;
  delegationId: string;    // original delegation (cross-referenced in fix packet)
  reviewId: string;        // review that triggered this fix
  findings: ReviewFinding[]; // subset with severity >= "medium" (or all — caller decides)
  templateDir: string;     // absolute path to references/templates/
  repoRoot: string;        // for relative-path display in the fix packet
}
```

### `FixPacket` (return value)

```typescript
export interface FixPacket {
  fixPacketId: string;       // "fix-NNNN"
  runId: string;
  delegationId: string;
  reviewId: string;
  fixPacketPath: string;     // absolute path to the written .md file
  pointerMsg: string;        // "[flow-pair ${fixPacketId}] Fix packet at: ${relPath}"
  allowedFiles: string[];    // AC-06: exactly the files extracted from findings (deduplicated)
}
```

---

## New ledger additions

### `ReviewFinding.file` (additive to `lib/ledger.ts`)

Add optional `file?: string` to the existing `ReviewFinding` interface. This is the AC-06 anchor:
`generateFixPacket` extracts `finding.file` values to build `allowedFiles`.

```diff
export interface ReviewFinding {
  dimension: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
+ file?: string;  // repo-relative path; present when finding relates to a specific file
}
```

`schemas/review.schema.json` findings items: add `"file": { "type": "string" }` to `properties`
(leave `additionalProperties: false`; `file` is optional so no change to `required`).

### New `LedgerEvent` branches

```typescript
// In LedgerEvent union — append to existing list
| {
    type: "review.recorded";
    runId: string;
    delegationId: string;
    reviewId: string;
    verdict: string;  // Verdict — string so union stays JSON-serializable
    at: string;
  }
| {
    type: "fix_packet.written";
    runId: string;
    delegationId: string;
    reviewId: string;
    fixPacketId: string;
    fixPacketPath: string;
    allowedFiles: string[];
    at: string;
  }
```

Both added to `schemas/event.schema.json` as new `oneOf` branches with `additionalProperties: false`.
Mirror the `files.changed` pattern exactly (all fields in `required`).

Note: `review.created` (existing) is for `LedgerWriter.writeReview()` — it lacks `verdict`.
`review.recorded` (new) is for `Review.evaluate()` — it includes `verdict` for event-log grep
without reading every `reviews/<id>.json`.

### New constant in `lib/ledger.ts`

```typescript
export const FIX_PACKETS_DIR = "fix-packets" as const;
```

Add `"fix-packets"` to `RUN_SUBDIRS` so `createRun` pre-scaffolds it (like `"diffs"` was added
for Phase 5). Tests that scaffold the run dir manually must also create this subdir.

---

## Task list (TDD order — T001–T002 failing first)

### T001 — Failing tests: AC-05 guard (missing `execution.log.md` → FIX_REQUIRED)

**File**: `skills/flow-pair/test/review.test.ts`

**Fixture**: real temp dir with a complete run structure (run.json + events.jsonl + subdirs incl.
reviews/ and fix-packets/). `phaseDir` is a real temp directory. `execution.log.md` is ABSENT.

**Tests to write (RED at this stage)**:

1. `missing execution.log.md → verdict is FIX_REQUIRED` — asserts:
   - `result.ok === true` (the evaluate() call itself succeeded)
   - `result.verdict === "FIX_REQUIRED"` ← **load-bearing assertion for AC-05 mutation gate**
   - `result.findings` contains an entry with `dimension === "artifact_contract"` and
     `message` matching `/execution\.log\.md/`
   - `result.findings[0].file` is a REPO-RELATIVE path (does NOT start with `/`)
   - **Non-vacuous proof**: if the guard is deleted (`if (!logExists)` → `if (false)`), this
     assertion flips RED. If it only checked `result.ok`, a broken guard still passes.

2. `missing execution.log.md → review record written to reviews/ with FIX_REQUIRED verdict` — asserts:
   - `reviews/rev-0001.json` exists and parses
   - `rec.verdict === "FIX_REQUIRED"`

3. `present execution.log.md → verdict is NOT FIX_REQUIRED for artifact_contract` — asserts:
   - `result.verdict !== "FIX_REQUIRED"` (or `=== "APPROVE"`)
   - `result.findings` has no `dimension === "artifact_contract"` entry
   - This is the "happy path through the guard" — prevents vacuous inversion.

4. `P9: review.recorded event appended before reviews/<id>.json written` — asserts order via
   `TrackingDeps` (same pattern as Phase 2/5: `callLog` records method + path in order).

5. `P4: stubbed writeFileSync throws → {ok:false}, no uncaught exception`.

6. `invalid runId → {ok:false, error}` (resolveRunDir guard).

**Anti-vacuous trap**: fixture MUST include `events.jsonl` (even empty) and `run.json` so that
`resolveRunDir` succeeds and execution reaches the AC-05 check. A fixture missing the run dir
fails at `resolveRunDir` — the guard is never tested.

---

### T002 — Failing tests: AC-06 scope (fix packet `allowedFiles` = exactly finding files)

**File**: `skills/flow-pair/test/review.test.ts` (continued)

**Setup**: a `ReviewRecord` (or the result from T001's evaluate) whose findings include exactly:
- `{ dimension: "test_quality", severity: "high", file: "lib/review.ts" }` (repo-relative)
- `{ dimension: "artifact_contract", severity: "critical", file: "docs/plans/016-flow-pair/tasks/phase-6-review-fix-loop/execution.log.md" }` (repo-relative)
- One additional finding WITHOUT a `file` field (`{ dimension: "scope", severity: "low", message: "..." }`)

The exclusion probe file `"lib/other.ts"` does NOT appear as a finding `file` anywhere.

**Tests to write (RED at this stage)**:

1. `allowedFiles includes lib/review.ts and execution.log.md` — asserts:
   - `packet.allowedFiles` is an array of length 2
   - `packet.allowedFiles.includes("lib/review.ts")`
   - `packet.allowedFiles.includes("docs/plans/.../execution.log.md")`

2. `allowedFiles excludes files not in findings` — asserts:
   - `expect(packet.allowedFiles).not.toContain("lib/other.ts")` ← **load-bearing assertion for AC-06**
   - **Non-vacuous proof**: if `generateFixPacket` is mutated to `allowedFiles = allFiles`, this
     `not.toContain("lib/other.ts")` flips RED. If scope check is vacuous (empty array always),
     the `includes("lib/review.ts")` check flips RED.

3. `allowedFiles deduplicates` — two findings with same `file` → `allowedFiles` contains that
   path only once.

4. `P9: fix_packet.written event appended before fix-packets/<id>.md written`.

5. `fix packet file contains delegationId and reviewId` — asserts template rendered correctly.

6. `pointerMsg format: "[flow-pair fix-0001] Fix packet at: ..."`.

---

### T003 — Type + schema additions (make T001–T002 compile and pass)

**Files**: `lib/ledger.ts`, `schemas/review.schema.json`, `schemas/event.schema.json`

**Changes** (all additive — no existing behaviour changed):

1. **`lib/ledger.ts`**:
   - Add `file?: string` to `ReviewFinding`
   - Add `review.recorded` branch to `LedgerEvent` union
   - Add `fix_packet.written` branch to `LedgerEvent` union
   - Add `FIX_PACKETS_DIR = "fix-packets" as const` (export)
   - Add `"fix-packets"` to `RUN_SUBDIRS` array

2. **`schemas/review.schema.json`** findings items `properties`:
   ```json
   "file": { "type": "string" }
   ```
   (`required` array unchanged — `file` is optional)

3. **`schemas/event.schema.json`** — add two `oneOf` branches:
   ```json
   {
     "type": "object",
     "required": ["type","runId","delegationId","reviewId","verdict","at"],
     "properties": {
       "type": { "type": "string", "const": "review.recorded" },
       "runId": { "type": "string" },
       "delegationId": { "type": "string" },
       "reviewId": { "type": "string" },
       "verdict": { "type": "string" },
       "at": { "type": "string", "format": "date-time" }
     },
     "additionalProperties": false
   }
   ```
   ```json
   {
     "type": "object",
     "required": ["type","runId","delegationId","reviewId","fixPacketId","fixPacketPath","allowedFiles","at"],
     "properties": {
       "type": { "type": "string", "const": "fix_packet.written" },
       "runId": { "type": "string" },
       "delegationId": { "type": "string" },
       "reviewId": { "type": "string" },
       "fixPacketId": { "type": "string" },
       "fixPacketPath": { "type": "string" },
       "allowedFiles": { "type": "array", "items": { "type": "string" } },
       "at": { "type": "string", "format": "date-time" }
     },
     "additionalProperties": false
   }
   ```

**Gate after T003**: `just typecheck` clean; existing 108 tests still pass.

---

### T004 — Implement `lib/review.ts` — `Review.evaluate()` (AC-05)

**File**: `skills/flow-pair/lib/review.ts` (new)

**Header**: P2 (no `@earendil-works/*`) + P3 + P4 + P5 + P9 comment.

**Constants**:
```typescript
export const VERDICT = { ... } as const;
export const FINDING_KIND = { ... } as const;
const REVIEWS_DIR = "reviews" as const;
const REVIEW_ID_PREFIX = "rev" as const;
const REQUIRED_ARTIFACTS = ["execution.log.md"] as const;
```

**`evaluate()` step order**:
1. `resolveRunDir(ledgerRoot, runId)` → return `{ok:false}` if fails
2. Scaffold `reviews/` dir (P5: `REVIEWS_DIR`)
3. `allocateReviewId()` — count `.json` files in `reviews/` (consistent with all other record allocations)
4. Run deterministic checks:
   - For each `REQUIRED_ARTIFACTS` entry: `deps.existsSync(join(phaseDir, artifact))` → if absent
     push `{ dimension: FINDING_KIND.ARTIFACT_CONTRACT, severity: "critical", message: "Missing required artifact: <name>", file: path.relative(opts.repoRoot, join(phaseDir, artifact)) }` and mark verdict `FIX_REQUIRED`.
   - **Finding `file` is repo-relative** (via `path.relative(repoRoot, absPath)`) so it can be used directly in fix packet `allowedFiles`. Absolute paths would be wrong here.
5. Determine final verdict:
   - Any finding with `severity` of `"critical"` or `"high"` → `FIX_REQUIRED`
   - Any finding with `severity` of `"medium"` → `APPROVE_WITH_NOTES`
   - Only `"low"` / `"info"` findings, or no findings → `APPROVE`
   - Phase 6 deterministic checks only produce `"critical"` (artifact_contract) so verdict is binary APPROVE / FIX_REQUIRED; `APPROVE_WITH_NOTES` is reserved for future multi-dimension scoring or orchestrator override.
6. **P9**: `appendLedgerEvent(deps, runDir, { type:"review.recorded", ..., verdict, at })` → if
   `!ev.ok` return `{ok:false}`
7. **P4 try/catch**: `deps.writeFileSync(join(reviewsDir, <id>.json), JSON.stringify(record))` —
   wrap the write; if throws return `{ok:false, error}`
8. Return `{ ok:true, verdict, findings, reviewId }`

**Anti-vacuous warning on P9**: the P9 ordering test uses `TrackingDeps`. The fake deps must wrap
REAL fs (not a stub that returns early) so execution reaches the write step. See Phase 3/5 pattern.

---

### T005 — Implement `generateFixPacket()` in `lib/review.ts` (AC-06)

**Within `Review` class** (or exported standalone function — class method preferred for deps access).

**`extractAllowedFiles(findings)` helper**:
```typescript
function extractAllowedFiles(findings: ReviewFinding[]): string[] {
  return [...new Set(findings.filter((f) => f.file != null).map((f) => f.file!))];
}
```
This is the sole source of `allowedFiles` — the AC-06 invariant.

**`generateFixPacket()` step order**:
1. `resolveRunDir(ledgerRoot, runId)` → return `{ok:false}` if fails
2. `mkdirSync(join(runDir, FIX_PACKETS_DIR), { recursive: true })`
3. `allocateFixPacketId()` — count `.json` files in `fix-packets/` (consistent with all other
   record allocations; write both `fix-NNNN.json` metadata AND `fix-NNNN.md` content)
4. `allowedFiles = extractAllowedFiles(opts.findings)`
5. Read `worker-fix.md` template from `opts.templateDir` (P3: deps.readFileSync)
6. Render: substitute `{{DELEGATION_ID}}`, `{{REVIEW_ID}}`, `{{FIX_PACKET_ID}}`,
   `{{ALLOWED_FILES_LIST}}`, `{{FINDINGS_SUMMARY}}` using single-pass regex
   (same `replace(/\{\{([A-Z_]+)\}\}/g, ...)` approach as Phase 4)
7. **P9**: `appendLedgerEvent(deps, runDir, { type:"fix_packet.written", ..., allowedFiles, at })`
   → if `!ev.ok` return `{ok:false}`
8. **P4 try/catch**: `deps.writeFileSync(fixPacketPath, rendered)` — wrap; if throws return
   `{ok:false, error}`
9. Return `{ ok:true, packet: { fixPacketId, ..., allowedFiles, pointerMsg } }`

**`pointerMsg` format**: `"[flow-pair ${fixPacketId}] Fix packet at: ${path.relative(repoRoot, fixPacketPath)}"`

---

### T006 — Reference documents: rubric + templates

**File 1**: `skills/flow-pair/references/review-rubrics.md` — extend the stub.

Fill Dimensions 1–10 after the existing Dimension 0 section:

| Dim | Name | FIX_REQUIRED trigger |
|-----|------|---------------------|
| 0 | Test quality (mutation-resistance) | Unproven test quality on load-bearing fix |
| 1 | Scope | Worker modified files outside the delegated allowed-files list |
| 2 | Contract | Public signatures differ from task spec |
| 3 | Plan-alignment | Implementation diverges from the phase plan spec |
| 4 | ACs | Any acceptance criterion from tasks.md not exercised by tests |
| 5 | Tests (→ Dim 0) | For code: see Dim 0; for doc/config: missing any coverage |
| 6 | Domain-currency | domain.md or references/ not updated after API/schema changes |
| 7 | Progress log | `execution.log.md` absent or does not reflect actual work done |
| 8 | Regression | Any previously-passing test now fails |
| 9 | Prompt-follow | Worker explicitly ignored a packet instruction |
| 10 | Learning | No key decision captured when a non-trivial choice was made |

Each dimension: ≥3 prose lines explaining what the reviewer checks, at least one concrete example,
and the severity mapping (critical = automatic FIX_REQUIRED; high = likely FIX_REQUIRED; medium =
APPROVE_WITH_NOTES; low = info).

**File 2**: `skills/flow-pair/references/templates/review-synthesis.md` — replace stub.

**Manual fill-in template** (the orchestrator/reviewer populates this by hand or with LLM assistance;
it is NOT rendered programmatically by `lib/review.ts`). Shape:

```markdown
# Review Synthesis — {{DELEGATION_ID}} / {{REVIEW_ID}}

## Header
- **Delegation**: {{DELEGATION_ID}} (run: {{RUN_ID}})
- **Review**: {{REVIEW_ID}}
- **Reviewer**: {{REVIEWER_MODEL}} (cross-model: {{IS_CROSS_MODEL}})
- **Verdict**: {{VERDICT}}
- **Reviewed at**: {{REVIEWED_AT}}

## Findings by severity

### Critical
<!-- Each: dimension · file (if applicable) · message · disposition [fix|accept|defer] -->

### High
<!-- ... -->

### Medium
<!-- ... -->

### Low / Info
<!-- ... -->

## Summary note

{{REVIEWER_SUMMARY}}

## Fix packet (if FIX_REQUIRED)

- Fix packet: {{FIX_PACKET_ID}} at `{{FIX_PACKET_PATH}}`
- Allowed scope: {{ALLOWED_FILES_LIST}}
- Original delegation: {{DELEGATION_ID}}
```

**File 3**: `skills/flow-pair/references/templates/worker-fix.md` — replace stub.

**Programmatic template** (rendered by `generateFixPacket()` via `{{PLACEHOLDER}}` substitution;
placeholders must match those used in `generateFixPacket` step 6 exactly):

```markdown
# Worker Fix Packet — {{FIX_PACKET_ID}}

## Context
- **Original delegation**: {{DELEGATION_ID}}
- **Review**: {{REVIEW_ID}} (verdict: FIX_REQUIRED)
- **Run**: {{RUN_ID}}

## Mission
Fix ONLY the issues listed in the findings below. Do not refactor beyond the named scope.

## Allowed scope (AC-06)
You may only write to these files (exactly — no others):

{{ALLOWED_FILES_LIST}}

## Fix dossier (findings you must address)

{{FINDINGS_SUMMARY}}

## Forbidden paths
Do not touch: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, `.flow-pair/`.

## Report back
When done: run `just self-check`, then reply with a Worker Report per the orchestrator-worker
protocol (see `references/orchestrator-worker-protocol.md`).
```

---

### T007 — CLI wiring + gate

**File**: `skills/flow-pair/lib/cli.ts` (additive)

**New subcommands**:

```typescript
// non-JSON stdout:
//   "verdict: FIX_REQUIRED\n"  (or APPROVE, APPROVE_WITH_NOTES)
// --json: full EvaluateResult
async function runReview(args: string[]): Promise<void>

// non-JSON stdout:
//   "fixPacket: fix-0001\n"
// --json: full FixPacket
async function runFix(args: string[]): Promise<void>
```

Required args:
- `review`: `--run-id <id>`, `--delegation-id <id>`, `--phase-dir <path>`
- `fix`: `--run-id <id>`, `--delegation-id <id>`, `--review-id <id>`, `--template-dir <path>`,
  `--repo-root <path>`

**File**: `skills/flow-pair/test/cli-review.test.ts` (new)

Subprocess tests (≥3):
1. `review --run-id ... --delegation-id ... --phase-dir ...` exits 0 + stdout contains `verdict:`
2. `review --json` → stdout parses as JSON with `verdict` field
3. `fix --json` on a FIX_REQUIRED review → stdout parses with `allowedFiles` as array
4. `review` with missing required arg → exits non-zero + stderr message

**Gate**: `just self-check` clean. All 108 + new tests pass.

---

## Mutation-gate plan

| Guard | Sed expr | Load-bearing assertion | Expected: tests RED |
|-------|----------|----------------------|---------------------|
| AC-05 | `s/if (!logExists)/if (false)/` | `expect(result.verdict).toBe("FIX_REQUIRED")` | ≥1 fail |
| AC-05 (finding) | `s/FINDING_KIND.ARTIFACT_CONTRACT/"other"/` | `expect(finding.dimension).toBe("artifact_contract")` | ≥1 fail |
| AC-06 | `s/extractAllowedFiles(opts.findings)/[]/` | `expect(packet.allowedFiles.length).toBe(2)` | ≥1 fail |
| AC-06 (scope) | `s/f\.file != null/true/` (include file-less findings) | `expect(packet.allowedFiles.length).toBe(2)` (was 3) | ≥1 fail |
| P9 | `s/if (!ev\.ok)/if (false)/` | P9 test FailDeps: `expect(writeFail.writeWasCalled).toBe(false)` | ≥1 fail |

Exact sed expressions adjusted at implement time; the above is the plan. The AC-06 non-vacuous
probe is the mutation `extractAllowedFiles(opts.findings)` → `[]` (empty scope) which flips:
- `expect(packet.allowedFiles).not.toContain("lib/review.ts")` → still green (empty doesn't contain)
- `expect(packet.allowedFiles.length).toBe(2)` → RED (0 ≠ 2) ← this is the load-bearing one

---

## P-rules compliance checklist

| Rule | Enforcement |
|------|------------|
| P2 (pi-free) | `lib/review.ts` imports `node:fs`, `node:path`, `./ledger.js`, `./paths.js` only |
| P3 (inject) | `ReviewDeps` interface; `nodeReviewDeps()` production binding; tests pass real-fs deps |
| P4 (tagged-union) | Every public method returns `{ok, ...}`; all fs in try/catch |
| P5 (constants) | `VERDICT`, `FINDING_KIND`, `REVIEWS_DIR`, `FIX_PACKETS_DIR`, `REQUIRED_ARTIFACTS` in `lib/review.ts` |
| P9 (persist-before-mutate) | `appendLedgerEvent` + `{ok}` check before EVERY `writeFileSync` in both `evaluate()` and `generateFixPacket()` |

---

## Open questions captured (for implement stage)

- **OQ-01**: Single-writer ID allocation (review ID, fix packet ID) — same `readdirSync` count
  approach as Phase 4/5. Not concurrent-safe; acceptable for v1.
- **OQ-02**: `review.recorded` vs reusing `review.created` — chosen `review.recorded` so the
  event includes `verdict` for event-log grep without reading every `reviews/<id>.json`.
- **OQ-03**: Should `generateFixPacket` live in `lib/review.ts` or a new `lib/fix-packet.ts`?
  Chosen: `lib/review.ts` for Phase 6 (single cohesive module); split if it grows.
- **OQ-04**: Template rendering — reuse Phase 4's single-pass regex approach (`{{PLACEHOLDER}}`)
  rather than adding a template engine dependency (P2 safety).

---

*Tasks last validated: 2026-06-23*

---

## Validation record (in-session, 2026-06-23)

Self-validated against 9 dimensions. Findings found and fixed:

| # | Sev | Finding | Fix applied |
|---|-----|---------|-------------|
| F1 | HIGH | `EvaluateOpts` missing `repoRoot` — finding `file` paths would be absolute | Added `repoRoot: string` to `EvaluateOpts`; step 4 now uses `path.relative(opts.repoRoot, ...)` |
| F2 | HIGH | `APPROVE_WITH_NOTES` verdict trigger unspecified | Added verdict mapping in step 5: critical/high → FIX_REQUIRED; medium → APPROVE_WITH_NOTES; low/info → APPROVE; Phase 6 only produces APPROVE/FIX_REQUIRED (artifact_contract = critical only) |
| F3 | MED | Fix packet ID allocation counted `.md` files; inconsistent with all other record allocations | Changed to count `.json` files; spec updated to write both `fix-NNNN.json` (metadata) and `fix-NNNN.md` (content) |
| F4 | LOW | `review-synthesis.md` vs `worker-fix.md` distinction unclear | T006 now explicitly labels review-synthesis as manual and worker-fix as programmatic |

Status: **PASS** (all HIGH findings resolved)
