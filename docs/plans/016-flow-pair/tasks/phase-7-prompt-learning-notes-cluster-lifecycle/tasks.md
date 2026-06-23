# Phase 7: Prompt-learning notes + cluster lifecycle — Tasks

**Phase**: 7 — Prompt-learning notes + cluster lifecycle  
**Plan**: `docs/plans/016-flow-pair/flow-pair-plan.md` §Phase 7  
**Depends on**: Phase 6 (`ReviewRecord` verdicts/findings + fix loop), Phase 2 (`LedgerWriter.writeLearning()` for per-run learning records)  
**Primary AC**: AC-07 — a learning recorded from an `implement-code` miss lands only under `prompt-lab/clusters/implement-code/candidates/`; no other cluster file changes.  
**Boundary**: `lib/learning.ts` owns cluster-isolated prompt-lab candidate files. `lib/ledger.ts#writeLearning()` already owns per-run `learnings/<learn-id>.json`. Keep these concerns separate.

---

## Executive briefing

Phase 7 creates the **cluster-isolation layer** for prompt learning. The ledger already knows how to
record a per-run `LearningRecord` (`writeLearning(runId, delegationId, { cluster, candidatePath })`).
This phase adds a pi-free module that writes the durable prompt-lab candidate note into exactly one
cluster directory, then records that candidate path in the existing per-run ledger.

The source of truth for valid clusters is `skills/flow-pair/references/prompt-taxonomy.md`. It is a
stub today, so the implementation phase must first fill it with the Phase-7 cluster set explicitly
before `lib/learning.ts` relies on the same set. Minimum set from the plan:

- `implement-code`
- `fix-code`
- `review-code`
- `docs-writing`
- `codebase-research`
- `validation-runner`

The lifecycle is intentionally manual in v1:

```text
prompt-lab/clusters/<cluster>/
  active.md        # committed current prompt guidance for that cluster
  candidates/      # generated candidate learning notes only for this cluster
  changelog.md     # manual promotion/audit notes; no silent auto-promotion
```

`recordLearning()` must never write to another cluster as a side effect. Promotion from a candidate
to `active.md` is a human/orchestrator action documented in `changelog.md`, not an automatic write.

---

## Deliverables

| File | Status | Notes |
|------|--------|-------|
| `skills/flow-pair/lib/learning.ts` | NEW | Pi-free `Learning`/`recordLearning()` cluster-isolation layer |
| `skills/flow-pair/test/learning.test.ts` | NEW | T001/T004 tests; AC-07 non-vacuous isolation + P9 |
| `skills/flow-pair/test/cli-learning.test.ts` | NEW | CLI subprocess tests for `flow-pair learn` |
| `skills/flow-pair/prompt-lab/clusters/<cluster>/active.md` | NEW | One per taxonomy cluster |
| `skills/flow-pair/prompt-lab/clusters/<cluster>/candidates/.gitkeep` | NEW | Candidate dir exists without committing generated candidates |
| `skills/flow-pair/prompt-lab/clusters/<cluster>/changelog.md` | NEW | Manual promotion ledger per cluster |
| `skills/flow-pair/references/prompt-taxonomy.md` | FILL | Cluster names, scope, lifecycle, promotion policy |
| `skills/flow-pair/references/templates/learning-synthesis.md` | EXTEND/FILL | Candidate-note template with evidence + non-promotion language |
| `skills/flow-pair/lib/cli.ts` | ADDITIVE | `learn` subcommand, JSON/non-JSON stdout contracts |
| `skills/flow-pair/schemas/learning.schema.json` | CHECK/OPTIONAL | Existing per-run schema may remain; update only if `LearningRecord` gains fields |
| `docs/plans/016-flow-pair/tasks/phase-7-prompt-learning-notes-cluster-lifecycle/execution.log.md` | NEW | Required implementation log |

---

## Proposed public API (`lib/learning.ts`)

```typescript
export const PROMPT_CLUSTERS = [
  "implement-code",
  "fix-code",
  "review-code",
  "docs-writing",
  "codebase-research",
  "validation-runner",
] as const;
export type PromptCluster = (typeof PROMPT_CLUSTERS)[number];

export interface LearningDeps {
  mkdirSync(path: string, opts: { recursive: boolean }): void;
  writeFileSync(path: string, data: string): void;
  readFileSync(path: string, enc: "utf8"): string;
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  appendFileSync(path: string, data: string): void;
}

export interface RecordLearningOpts {
  runId: string;
  delegationId: string;
  cluster: PromptCluster;
  missType: "implement-code" | "fix-code" | "review-code" | "docs-writing" | "codebase-research" | "validation-runner";
  summary: string;
  evidence: string[];
  candidateDelta: string;
  promptLabRoot: string; // absolute path to skills/flow-pair/prompt-lab
}

export interface LearningCandidate {
  learningId: string;
  cluster: PromptCluster;
  candidatePath: string; // absolute path to prompt-lab/clusters/<cluster>/candidates/learn-NNNN.md
  ledgerRecordPath: string; // absolute path to runs/<runId>/learnings/<learn-NNNN>.json
}

export class Learning {
  constructor(
    readonly ledgerRoot: string,
    private readonly deps: LearningDeps = nodeLearningDeps(),
  );

  recordLearning(opts: RecordLearningOpts): {
    ok: boolean;
    candidate?: LearningCandidate;
    error?: string;
  };
}
```

### Separation of concerns

- `Learning.recordLearning()` validates the requested cluster and writes the **prompt-lab candidate
  note** under `prompt-lab/clusters/<cluster>/candidates/`.
- It then delegates per-run metadata to existing `LedgerWriter.writeLearning()` or the same event
  primitive/record shape, so the run ledger still owns `runs/<runId>/learnings/<learn-id>.json`.
- Do **not** move `writeLearning()` out of `ledger.ts`; do **not** make `ledger.ts` aware of
  prompt-lab directory layout.

---

## Non-vacuous AC-07 design

The AC-07 test must execute the real cluster isolation path end-to-end:

1. Create a real temp `prompt-lab/clusters/` tree with at least these directories:
   - `implement-code/{active.md,candidates/,changelog.md}`
   - `fix-code/{active.md,candidates/,changelog.md}`
   - `review-code/{active.md,candidates/,changelog.md}`
   - `docs-writing/{active.md,candidates/,changelog.md}`
   - `codebase-research/{active.md,candidates/,changelog.md}`
   - `validation-runner/{active.md,candidates/,changelog.md}`
2. Snapshot every non-generated file and directory listing before the call.
3. Call `recordLearning()` with `cluster: "implement-code"` and a realistic implement miss.
4. Assert exactly one new file appears under `implement-code/candidates/`.
5. Assert **no files or listings changed** in `fix-code`, `review-code`, `docs-writing`,
   `codebase-research`, or `validation-runner`.
6. Assert `active.md` and `changelog.md` in **all** clusters are byte-identical before/after.
7. Assert the per-run ledger records the same cluster/candidate path via `writeLearning()`.

The wrong-cluster guard must also be exercised through the isolation guard, not by failing earlier:
use a complete valid run fixture and real cluster dirs, then pass a mismatched/invalid cluster case
that reaches cluster validation and returns `{ok:false}` with no prompt-lab writes and no ledger writes.

---

## 7-column task table

| Status | ID | Task | Domain | Path(s) | Done-When | Notes |
|--------|----|------|--------|---------|-----------|-------|
| [ ] | T001 | Write failing tests: AC-07 cluster isolation (non-vacuous) | flow-pair | `skills/flow-pair/test/learning.test.ts` | RED tests prove an `implement-code` miss creates exactly one `learn-NNNN.md` under `prompt-lab/clusters/implement-code/candidates/`; all sibling clusters and every `active.md`/`changelog.md` remain byte-identical; the returned `candidate.cluster` is `implement-code`; the run ledger has one matching learning record | Use real temp prompt-lab dirs and a complete run fixture so execution reaches the isolation guard and candidate write path |
| [ ] | T002 | Write failing tests: wrong-cluster/unsafe target rejected fail-closed | flow-pair | `skills/flow-pair/test/learning.test.ts` | RED tests: invalid cluster string returns `{ok:false}` and no writes; mismatched `missType: "implement-code"` with `cluster: "fix-code"` returns `{ok:false}` and no writes; traversal-like cluster values such as `../fix-code`, `/abs`, `implement-code/../fix-code`, and `""` are rejected before any prompt-lab or ledger write | The mismatch case is the load-bearing isolation guard: it has valid dirs + valid run, so it cannot pass vacuously by failing `resolveRunDir` |
| [ ] | T003 | Fill taxonomy + scaffold cluster lifecycle docs | flow-pair | `skills/flow-pair/references/prompt-taxonomy.md`; `skills/flow-pair/prompt-lab/clusters/**` | `prompt-taxonomy.md` lists exactly the canonical cluster slugs, each cluster's scope, lifecycle (`active.md` → `candidates/` → manual promotion via `changelog.md`), and no-auto-promote policy; every canonical cluster has `active.md`, `candidates/.gitkeep`, and `changelog.md` | If implementer discovers another cluster is required, update taxonomy first and add matching tests; do not invent cluster names only in code |
| [ ] | T004 | Write failing tests: P9 ordering and ledger separation | flow-pair | `skills/flow-pair/test/learning.test.ts` | RED tests: ledger event/record is persisted before prompt-lab candidate write according to the chosen implementation order; if ledger append/`writeLearning()` fails, no candidate file is written; `ledger.ts` per-run `learnings/` path is not confused with `prompt-lab/clusters/**/candidates/` | Use `TrackingDeps`/`FailDeps` wrapping real fs except the injected failure. Assertion must flip under `if (!ledger.ok) -> if (false)` mutation |
| [ ] | T005 | Implement `lib/learning.ts` | flow-pair | `skills/flow-pair/lib/learning.ts` | T001/T002/T004 GREEN; module imports only `node:*`, `./ledger.js`, and `./paths.js`; public methods return tagged unions; side effects are constructor-injected; constants are single-sourced and exported; candidate filenames are monotonic (`learn-NNNN.md`) and match the ledger `learningId` | Prefer deriving candidate id from the ledger learning id to avoid two independent counters; if not possible, document the one-writer assumption like prior phases |
| [ ] | T006 | Fill/extend learning synthesis template | flow-pair | `skills/flow-pair/references/templates/learning-synthesis.md` | Template includes cluster, miss type, evidence, what failed, candidate prompt delta, suggested active.md insertion point, reviewer disposition, and explicit `No automatic promotion` instruction | The template is for candidate notes; it must not instruct the writer to edit `active.md` silently |
| [ ] | T007 | Wire CLI `flow-pair learn` + subprocess tests | flow-pair | `skills/flow-pair/lib/cli.ts`; `skills/flow-pair/test/cli-learning.test.ts` | CLI supports `learn --run-id <id> --delegation-id <id> --cluster <cluster> --miss-type <type> --summary <text> --evidence <text>` plus `--json`; non-JSON stdout is exactly `learning: learn-NNNN`; JSON stdout includes `candidatePath` and `cluster`; missing/invalid cluster exits 2 with stderr | Keep CLI thin: validate args, call `Learning.recordLearning()`, print result |
| [ ] | T008 | Validation, mutation checks, execution log | flow-pair | `skills/flow-pair/test/learning.test.ts`; `docs/plans/016-flow-pair/tasks/phase-7-prompt-learning-notes-cluster-lifecycle/execution.log.md` | `just flow-pair-test` passes with Phase-7 tests included; `just typecheck` passes; flow-pair scoped Biome has 0 errors; mutation checks for AC-07 isolation and P9 flip RED then GREEN; execution log records changed files, test counts, mutation sed exprs, and any taxonomy decisions | Full `just self-check` if repo-wide lint baseline allows; otherwise report unrelated baseline failures separately |

---

## Implementation details

### Candidate path construction

Candidate writes must be rooted under one canonical directory:

```typescript
const clusterDir = join(opts.promptLabRoot, "clusters", opts.cluster);
const candidatesDir = join(clusterDir, "candidates");
const candidatePath = join(candidatesDir, `${learningId}.md`);
```

Validate before writing:

- `opts.cluster` is in `PROMPT_CLUSTERS`
- `opts.missType === opts.cluster` for v1 one-to-one learning attribution
- `clusterDir`, `candidatesDir`, `active.md`, and `changelog.md` exist for the selected cluster
- `candidatePath.startsWith(candidatesDir + sep)` after path normalization
- no candidate write occurs if ledger persistence fails

### Suggested `recordLearning()` order

```text
1. resolveRunDir(ledgerRoot, runId)                         # read/validate only
2. validate cluster and missType                            # AC-07 isolation guard
3. validate selected cluster lifecycle files exist           # active.md/candidates/changelog.md
4. allocate/derive learningId                               # single-writer v1
5. render candidate markdown from learning-synthesis fields  # pure string work
6. P9: persist per-run learning record/event first           # existing writeLearning() concern
7. if ledger write failed: return {ok:false}; no candidate write
8. write prompt-lab candidate file under selected candidates/ only
9. return {ok:true, candidate}
```

This ordering keeps recovery inspectable: if the process crashes after the ledger record but before
the candidate write, the ledger records intent. If ledger persistence fails, no prompt-lab candidate
is created without a corresponding run record.

### Candidate note shape

```markdown
# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: <runId>
- **Delegation**: <delegationId>
- **Miss type**: implement-code
- **Created at**: <iso>

## Summary

<summary>

## Evidence

- <evidence item>

## Candidate prompt delta

<delta>

## Promotion status

Pending manual review. Do not edit `active.md` automatically.
```

### CLI contract

Non-JSON success stdout:

```text
learning: learn-0001
```

JSON success stdout:

```json
{
  "ok": true,
  "candidate": {
    "learningId": "learn-0001",
    "cluster": "implement-code",
    "candidatePath": "/abs/.../prompt-lab/clusters/implement-code/candidates/learn-0001.md",
    "ledgerRecordPath": "/abs/.../.flow-pair/runs/<runId>/learnings/learn-0001.json"
  }
}
```

Error behavior: print concise stderr and exit 2. Invalid cluster/miss mismatch must be an error, not
a fallback to another cluster.

---

## Mutation-gate plan

| Guard | Suggested sed expr | Load-bearing assertion | Expected RED |
|-------|--------------------|------------------------|--------------|
| AC-07 selected-cluster only | `s/const candidatesDir = join\(clusterDir, "candidates"\);/const candidatesDir = join(opts.promptLabRoot, "clusters", "fix-code", "candidates");/` | `expect(newFilesIn("implement-code/candidates")).toHaveLength(1)` and `expect(newFilesIn("fix-code/candidates")).toHaveLength(0)` | ≥1 fail |
| AC-07 miss/cluster mismatch | `s/if \(opts\.missType !== opts\.cluster\)/if (false)/` | `expect(result.ok).toBe(false)` for `missType:"implement-code", cluster:"fix-code"`; no-write assertions | ≥1 fail |
| P9 ledger-before-candidate | `s/if \(!ledgerResult\.ok\)/if (false)/` | FailDeps assertion `expect(candidateWriteWasCalled).toBe(false)` | ≥1 fail |
| Candidate path traversal belt | `s/if \(!candidatePath\.startsWith\(candidatesDir \+ sep\)\)/if (false)/` | traversal/unsafe path case remains `{ok:false}` and no writes | ≥1 fail if path guard is implemented as separate check |

Exact sed expressions may be adjusted to match final code, but the execution log must record the
literal expressions used and the RED/GREEN counts.

---

## P-rules compliance checklist

| Rule | Enforcement |
|------|-------------|
| P2 pi-free | `lib/learning.ts` imports only `node:*`, `./ledger.js`, `./paths.js` |
| P3 injection | `LearningDeps` constructor injection; tests use real-fs deps plus focused fail/tracking wrappers |
| P4 tagged unions | `recordLearning()` returns `{ok:true,candidate}` or `{ok:false,error}`; no uncaught fs throws |
| P5 constants | `PROMPT_CLUSTERS`, dir names, template field names live in `lib/learning.ts` or taxonomy and are reused |
| P7 ESM | Relative imports include `.js` |
| P8 tests target lib | AC-07 and P9 tests call `Learning.recordLearning()` directly; CLI tests are additive |
| P9 persist before mutate | Existing `writeLearning()`/ledger persistence succeeds before prompt-lab candidate write |

---

## Context brief

### Existing seams to reuse

- `skills/flow-pair/lib/ledger.ts`
  - `LedgerWriter.writeLearning(runId, delegationId, { cluster, candidatePath })`
  - writes per-run `learnings/<learn-id>.json`
  - appends `learning.created` before the per-run record
- `skills/flow-pair/lib/paths.ts`
  - `resolveRunDir(ledgerRoot, runId)` path traversal guard for run IDs
- `skills/flow-pair/references/templates/learning-synthesis.md`
  - currently a stub; fill as candidate-note template, not an active-template auto-promoter
- `skills/flow-pair/references/prompt-taxonomy.md`
  - currently a stub; fill with canonical clusters and lifecycle before implementation relies on it

### Prompt-lab layout after T003

```text
skills/flow-pair/prompt-lab/
  clusters/
    implement-code/
      active.md
      candidates/
        .gitkeep
      changelog.md
    fix-code/
      active.md
      candidates/
        .gitkeep
      changelog.md
    review-code/
      active.md
      candidates/
        .gitkeep
      changelog.md
    docs-writing/
      active.md
      candidates/
        .gitkeep
      changelog.md
    codebase-research/
      active.md
      candidates/
        .gitkeep
      changelog.md
    validation-runner/
      active.md
      candidates/
        .gitkeep
      changelog.md
```

Generated candidate notes (`learn-NNNN.md`) should normally be reviewed before commit; tests create
them in temp prompt-lab fixtures. The committed tree uses `.gitkeep` to preserve empty candidate dirs.

### Non-vacuous fixture recipe

```typescript
function makePromptLabFixture(root: string): void {
  for (const cluster of PROMPT_CLUSTERS) {
    const dir = join(root, "clusters", cluster);
    mkdirSync(join(dir, "candidates"), { recursive: true });
    writeFileSync(join(dir, "active.md"), `# ${cluster} active\n`);
    writeFileSync(join(dir, "changelog.md"), `# ${cluster} changelog\n`);
  }
}
```

The AC-07 test must snapshot `clusters/**` after this fixture is complete, then call the real
`Learning.recordLearning()` implementation. A test that stubs out the candidate write or fails before
cluster validation does not prove AC-07.

### Open questions for implementation

- **OQ-01: Cluster source-of-truth mismatch** — `prompt-taxonomy.md` is currently a stub even though
  the packet names it as the cluster-set source. Phase 7 should fill it first, using only the six
  explicit clusters in the plan unless the orchestrator approves more.
- **OQ-02: ID allocation** — best option is to reuse/derive the candidate id from the per-run
  `LearningRecord.learningId`. If the implementation cannot get the id before candidate rendering,
  document the same single-writer count-based allocation assumption used in prior phases.
- **OQ-03: Ledger/candidate order** — this task set chooses ledger-first for P9 consistency. If the
  implementer chooses candidate-first, AC-07 can still pass but P9/recovery semantics must be
  explicitly reviewed.

---

## Self-validation record (tasks stage, 2026-06-23)

| Check | Result | Evidence |
|-------|--------|----------|
| Plan alignment | PASS | Uses Phase 7 objective, deliverables, and AC-07 exactly |
| Existing structure grounded | PASS | Reuses `writeLearning()` and keeps ledger/prompt-lab concerns separate |
| Cluster source grounded | PASS with spec gap | `prompt-taxonomy.md` is a stub; tasks require filling it first from the six explicit plan clusters |
| AC-07 non-vacuous | PASS | Requires real cluster dirs, snapshot before/after, real `recordLearning()` call, sibling-cluster no-write assertions |
| P-rules | PASS | P2/P3/P4/P5/P7/P8/P9 checks included |
| Forbidden-path discipline | PASS | Writes limited to `skills/flow-pair/**` plus this Phase-7 tasks dir |

*Tasks last validated: 2026-06-23*

---

## Validation Record (2026-06-23, validate-v2 / orchestrator-run lenses)

### Validation Thesis
- **Raison d'être**: Make prompt-learning compound across flow-pair runs WITHOUT cross-cluster leakage (an implement-code miss must not pollute fix-code/review-code guidance).
- **Value claim**: Each cluster's `active.md` stays a trustworthy, manually-curated prompt; candidates accrue safely and are promoted by humans, not silently.
- **Artifact promise**: `lib/learning.ts` writes a candidate to exactly one cluster dir + records intent in the per-run ledger; no silent auto-promotion.
- **Intended beneficiaries**: future worker runs (better prompts), the orchestrator (auditable learning), the human reviewer (manual promotion gate).
- **Proof target**: Implementation (concrete API + non-vacuous AC-07 test + mutation gate).
- **Evidence standard**: source-code match for reused seams; a RED-able AC-07 isolation test; P9 ordering test that flips under mutation.
- **Thesis source**: `flow-pair-plan.md` §Phase 7 + AC-07 (lines 132–134).
- **Thesis verdict**: Advanced.
- **Main thesis risk**: the v1 `missType === cluster` one-to-one constraint makes `missType` redundant, slightly muddying the "attribution" value claim.

### Lens results (orchestrator-run, source-truth-verified)
| Lens | Verdict | Evidence |
|------|---------|----------|
| Source Truth | ✅ | `writeLearning(runId,delegationId,{cluster,candidatePath})` matches ledger.ts:465; stubs confirmed; `ID_PREFIXES.learning="learn"` aligns candidate filename; `resolveRunDir` exists; `learning.created`+P9 already in writeLearning |
| Cross-Reference (plan↔tasks) | ✅ | Plan deliverables (clusters tree, learning-synthesis.md, lib/learning.ts) all tasked; AC-07 mapped to T001/T002; plan rows 7.1–7.3 decomposed into T001–T008 (acceptable) |
| Completeness | ✅ | P9 ordering (T004), mutation gate (T008 table), vacuous-test-trap addressed (real fixture + guard-driven-after-valid-run), CLI contract (T007) |
| Thesis Alignment | ✅ Advanced | Cluster isolation + manual promotion + candidate notes directly serve "compounding learning without leakage" |
| Forward-Compatibility | ✅ | Public `Learning`/`recordLearning`/`PROMPT_CLUSTERS` + additive `learn` CLI suffice for Phase 8 MVP wiring; ledger.ts kept unaware of prompt-lab layout (clean separation) |

### Forward-Compatibility Matrix
| Consumer | Requirement | Mode | Verdict | Evidence |
|----------|-------------|------|---------|----------|
| Phase 8 MVP wiring | stable `Learning` public API + `learn` CLI | shape mismatch | ✅ | API + CLI stdout contract fully specified (T005/T007) |
| Phase 8 dogfood run | end-to-end record→candidate→manual promote | lifecycle ownership | ✅ | manual-promotion-only; candidate + ledger both produced |
| Existing ledger.ts | must not learn prompt-lab layout | encapsulation lockout | ✅ | tasks explicitly forbid coupling; writeLearning stays per-run |

### Issues
- **MED — CLI `promptLabRoot` resolution unspecified** (T007): flags list omits `--prompt-lab-root`, so the implementer must decide how the CLI resolves it (likely `join(skillDir,"prompt-lab")` mirroring the existing `templateDir` pattern in `runFix`). Implementer should state the default explicitly. Not blocking.
- **LOW — `missType` redundant with `cluster` in v1**: the `missType === cluster` one-to-one constraint (T002) makes `missType` a dead field for now. Acceptable as a forward-looking slot for many-to-one attribution; keep but document, or drop. Non-blocking.
- **LOW — orphan ledger record on candidate-write failure**: ledger-first (P9) means a crash after the ledger write but before the candidate write leaves an intent record with no candidate. Tasks acknowledge this as acceptable recovery semantics; fine.

### Verdict
**VALIDATED WITH NOTES** — source-truth-accurate, non-vacuous AC-07 design, P9-correct, mutation-gated, clean ledger/prompt-lab separation. 1 MED + 2 LOW, all non-blocking, carried as implement directives. Thesis advanced at Implementation proof level.

**Thesis alignment**: compounding-learning-without-leakage thesis is advanced; AC-07 isolation is testable and mutation-guarded; main risk is the redundant v1 missType field.
**Outcome alignment**: the tasks deliver a cluster-isolation layer + manual-promotion lifecycle that lets Phase 8 wire and dogfood learning end-to-end without cross-cluster pollution.
