# Workshop: Agent SQL Use Cases and Working Patterns

**Type**: Other — Agent Workflow / Prompt Contract
**Plan**: 006-generic-sqlite-session-tool
**Spec**: [Generic SQLite Session Tool Spec](../generic-sqlite-session-tool-spec.md)
**Created**: 2026-05-15T04:26:09Z
**Status**: Draft

**Value Thesis**: This workshop makes the future `sql` tool useful by teaching agents when to reach for structured session storage, what tables to create, how to query progress, and how to avoid treating SQL as either “just todos” or long-term memory.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Implementation Ready

**Selected Value Axes**:
- **Agent Readiness**: The tool only compounds value if the model knows when and how to use it proactively.
- **Operator Usability**: Humans need visible, queryable state for complex sessions, not invisible model-only scratch reasoning.
- **Proof Quality**: Use-case recipes become concrete SQL examples, prompt guidance, and validation scenarios.
- **Review Compression**: Reviewers can check whether tool prompt guidelines and examples cover real workflows.
- **Learning Compounding**: Good table patterns should become reusable habits across future pi sessions and extensions.

**Related Documents**:
- [Research dossier](../research-dossier.md)
- [Workshop 001: Session SQLite Semantics and Safety Boundary](./001-session-sqlite-semantics-and-safety-boundary.md)
- [Workshop 003: Tool, Command, and Result Contract](./003-tool-command-and-result-contract.md)
- [Workshop 004: Default Schema and Migrations](./004-default-schema-and-migrations.md)
- [Workshop 005: Validation and Smoke Harness](./005-validation-and-smoke-harness.md)
- [Workshop 006: Implementation Slices and Extension Boundaries](./006-implementation-slices-and-extension-boundaries.md)
- [GitHub Docs: Copilot CLI session data](https://github.com/github/docs/blob/main/content/copilot/concepts/agents/copilot-cli/chronicle.md)
- [Rogn/copilot-cli-work-overview](https://github.com/Rogn/copilot-cli-work-overview)
- [drvoss/everything-copilot-cli: Session Database](https://github.com/drvoss/everything-copilot-cli/blob/main/guides/copilot-exclusive-features.md#session-database)

**Domain Context**:
- **Primary Domain**: `agent-tooling-interface` — how the agent and human operator use the SQL capability.
- **Related Domains**: `session-work-state`, `extension-authoring-harness`.
- **Domain Registry**: No formal `docs/domains/registry.md` exists; domain names come from the spec’s Target Domains section.

---

## Purpose

Define how agents should use a session-local SQL workbench during real coding sessions. This workshop turns “the tool exists” into practical habits, trigger rules, table recipes, and prompt guidance so agents get value from arbitrary structured storage instead of only using the default `todos` tables.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Decide when a task is complex enough to justify `sql` usage.
- Choose a small table recipe for the current workflow.
- Create, query, and update custom session tables without waiting for user instruction.
- Recover progress after reload/compact/resume by querying the DB.
- Implement prompt guidelines and examples that teach the model these habits.

## Key Questions Addressed

- When should the agent use session SQL instead of just chat context or markdown notes?
- What use cases go beyond the built-in `todos` and `todo_deps` tables?
- What table shapes help with planning, testing, reviews, refactors, research, and batch work?
- How does the agent keep SQL state current without over-logging everything?
- What prompt/tool guidance should make good SQL use automatic?
- What anti-patterns would make the tool noisy, stale, or misleading?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | Implementation can directly use this for tool prompt guidelines, docs examples, and validation scenarios. |
| Primary Value Axis | Agent Readiness | A generic tool is only valuable if the model can recognize good use cases and invent fit-for-purpose schema. |
| Supporting Value Axes | Operator Usability, Proof Quality, Review Compression, Learning Compounding | SQL state should be visible, testable, easy to review, and reusable as a habit. |
| Downstream Loop Improved | Agent execution / Implementation / Review / Testing | Agents spend less attention reconstructing state; implementers get concrete examples to bake into the tool UX. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| GitHub docs on Copilot CLI session data, local SQLite session store, `/chronicle` workflows | Related Documents | Local structured state can power resume, standup, tips, and history Q&A | Ready |
| Community guide describing Copilot CLI per-session SQLite with `todos`, `todo_deps`, and custom tables | Related Documents | Built-in queue plus arbitrary custom tables is an effective agent pattern | Ready |
| `copilot-cli-work-overview` dashboard reads live `todos`/`todo_deps` grouped by state | Related Documents | Structured task state can support human/operator visibility | Ready |
| Perplexity research on agent scratch DB patterns | Conversation research | Tasks/events/artifacts/files/findings/test-runs/issues are broadly useful patterns | Ready |
| Workshops 001/003/004 | Related workshops | Persistence, generic tool contract, default schema | Ready |
| Future implementation prompt guidelines | `index.ts` tool registration | Agent behavior encoded in tool metadata | Missing |
| Future smoke/custom-table proof | `smoke.ts` or store tests | Tool supports arbitrary use-case schema | Missing |

## Research Synthesis

### What Copilot-style tools teach us

Public GitHub documentation describes Copilot CLI session data as local, structured state that supports resume, history Q&A, `/chronicle standup`, `/chronicle tips`, and `/chronicle improve`. That is cross-session history rather than our current-session scratch DB, but it proves a key pattern: **SQLite-backed structured state lets the agent answer workflow questions that chat context alone cannot**.

Community Copilot CLI exploration and dashboards point to an additional per-session pattern closer to this plan:

- default `todos` and `todo_deps` tables for work queues,
- arbitrary custom tables for workflow-specific tracking,
- direct SQLite reads to show in-progress, pending-ready, blocked, and done work,
- explicit dependency/cycle visibility.

The most important insight is not “copy Copilot’s schema.” It is this:

> The agent should treat SQL as a temporary structured workspace it can shape to the task, not as a fixed todo app.

### What broader agent-state research suggests

A local SQLite scratch DB is strongest when the agent needs:

- low-concurrency local state,
- deterministic queries,
- status fields and timestamps,
- many small records that need sorting/filtering/joining,
- compact summaries after context loss,
- evidence that can be inspected by a human.

It is weaker when the agent needs:

- semantic/vector retrieval at scale,
- graph-heavy global knowledge,
- multi-user synchronization,
- permanent project documentation,
- storage of huge raw logs or binary artifacts.

## Core Mental Model

```text
Chat context      = conversational working set
Project files     = durable product/source artifacts
Session SQL       = private structured scratchpad for this session
Research/docs     = cited durable references
Git history       = source-of-truth code changes
```

Use session SQL when the agent needs structured state that is:

- too relational for a flat checklist,
- too temporary for a project file,
- too important to leave only in chat context,
- useful to query repeatedly during this session.

## Trigger Rules: When the Agent Should Use `sql`

### Strong signals — use SQL proactively

Use `sql` when any of these are true:

| Signal | Why SQL Helps | Example |
|--------|---------------|---------|
| 5+ work items | Sorting/filtering/status beats chat memory | Multi-file refactor checklist |
| Dependencies exist | `todo_deps` can compute ready work | “Do model before API before tests” |
| Repeated validation | Track pass/fail/rerun/output | Test matrix or smoke variants |
| Many files to inspect/edit | Prevent duplicate work and missed files | Rename API across repo |
| Findings need triage | Severity/status/category queries | Code review or security pass |
| Research sources accumulate | Preserve source, claim, confidence | Ecosystem survey or library choice |
| User may interrupt/resume | DB survives reload/resume | Long-running feature work |
| Context may compact | Query compact state back in | Long session with many turns |
| Subtasks can be delegated | Aggregate returned outputs | Future subagent/fleet runs |
| The answer depends on counts/groups | SQL summarization is exact | “How many tests still fail?” |

### Weak signals — maybe skip SQL

Do not force SQL for:

- one-off single-file edits,
- trivial commands whose result is immediately used,
- final deliverables that belong in markdown/source files,
- secrets or credentials,
- huge raw logs better kept as files or summarized in chat,
- facts that should become permanent docs or code comments.

### Simple decision rule

```text
If I will need to ask “what is left?”, “what changed?”, “which item is next?”,
“what did I already inspect?”, or “what evidence supports this?” more than once,
use session SQL.
```

## Operating Protocol for Agents

### 1. Start with the default queue

For non-trivial work, create top-level items in `todos` and dependency edges in `todo_deps`.

```sql
INSERT INTO todos (title, description, status, priority) VALUES
  ('Map existing code', 'Identify extension, harness, and lifecycle files', 'pending', 100),
  ('Design table recipes', 'Choose reusable SQL patterns for agent work', 'pending', 80),
  ('Validate with smoke', 'Prove /sql path and custom tables work', 'pending', 60);
```

Use `todo_deps` when order matters.

```sql
INSERT INTO todo_deps (todo_id, depends_on)
SELECT child.id, parent.id
FROM todos child, todos parent
WHERE child.title = 'Validate with smoke'
  AND parent.title = 'Design table recipes';
```

### 2. Add custom tables when the workflow has structure

Default tables answer “what work is left?” Custom tables answer task-specific questions:

- Which files have been inspected?
- Which tests passed?
- Which review findings are unresolved?
- Which sources support each claim?
- Which migration step is blocked?

### 3. Query before acting

Before a work block, ask the DB for the next useful item.

```sql
SELECT t.id, t.title, t.priority
FROM todos t
WHERE t.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM todo_deps d
    JOIN todos prereq ON prereq.id = d.depends_on
    WHERE d.todo_id = t.id
      AND prereq.status != 'done'
  )
ORDER BY t.priority DESC, t.id ASC
LIMIT 5;
```

### 4. Update state immediately after evidence

After inspecting, editing, testing, or resolving an item, update the DB while the evidence is fresh.

```sql
UPDATE todos
SET status = 'done', updated_at = CURRENT_TIMESTAMP
WHERE id = 3;
```

### 5. Rehydrate after reload/resume/compact

When context is stale, query the DB instead of reconstructing from memory.

```sql
SELECT status, COUNT(*) AS count
FROM todos
GROUP BY status
ORDER BY status;

SELECT title, description
FROM todos
WHERE status IN ('pending', 'blocked')
ORDER BY priority DESC, id ASC;
```

### 6. Final answer from queried state

Before reporting done, query open work, failed tests, unresolved findings, and assumptions.

```sql
SELECT 'open_todos' AS kind, COUNT(*) AS count
FROM todos
WHERE status != 'done'
UNION ALL
SELECT 'open_findings', COUNT(*)
FROM review_findings
WHERE status = 'open'
UNION ALL
SELECT 'failing_tests', COUNT(*)
FROM test_cases
WHERE status IN ('failing', 'blocked');
```

## Use Case Catalog

| Use Case | Default Tables? | Custom Tables? | Agent Question SQL Answers |
|----------|-----------------|----------------|-----------------------------|
| Feature implementation | Yes | Maybe `work_log`, `file_work` | What is next? What is blocked? What changed? |
| Repo-wide refactor | Yes | `batch_items`, `file_work` | Which files remain? Which failed? |
| TDD/debugging | Maybe | `test_cases`, `test_runs` | Which case should I write/run next? |
| Code review | Maybe | `review_findings` | What findings are open by severity? |
| Research synthesis | Maybe | `research_sources`, `claims` | Which claims are supported? Which source is stale? |
| Issue triage | Maybe | `triage_items` | Which issues are duplicates/blockers/high priority? |
| API/contract design | Maybe | `contract_cases`, `edge_cases` | Which cases are covered or ambiguous? |
| Migration planning | Yes | `migration_steps`, `rollback_checks` | Which step is safe to run next? |
| Subagent aggregation | Yes | `agent_results` | Which delegated task returned what? |
| Prompt/process improvement | Maybe | `friction_events`, `lessons` | What repeated difficulty should become policy? |

## Table Recipe Principles

1. **Prefer concrete tables over generic blobs** when you will query status/count/grouping.
2. **Include `status`** on anything that can be open/done/blocked.
3. **Include `source` or `evidence`** when a claim must be defended.
4. **Include `updated_at`** when stale rows could mislead.
5. **Keep raw logs out**; store paths, summaries, hashes, or excerpts instead.
6. **Use snake_case descriptive names**; future agents need to infer intent quickly.
7. **Start small**; add columns/tables when queries demand them.
8. **Do not mirror the whole repo**; track what matters to the current session.

## Table Recipes

### Recipe A — File work inventory

Use when inspecting or editing many files.

```sql
CREATE TABLE IF NOT EXISTS file_work (
  path TEXT PRIMARY KEY,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'inspected', 'edited', 'validated', 'skipped', 'blocked')),
  reason TEXT,
  evidence TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Common queries:

```sql
SELECT path, reason
FROM file_work
WHERE status = 'pending'
ORDER BY path
LIMIT 20;

SELECT status, COUNT(*) AS count
FROM file_work
GROUP BY status;
```

### Recipe B — Batch item tracker

Use for repo-wide edits, generated changes, migration sweeps, or repetitive operations.

```sql
CREATE TABLE IF NOT EXISTS batch_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  result TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(batch, target)
);
```

Pick next:

```sql
SELECT id, target
FROM batch_items
WHERE batch = 'rename-api'
  AND status IN ('pending', 'failed')
ORDER BY attempts ASC, id ASC
LIMIT 1;
```

### Recipe C — Test matrix

Use for TDD, bug reproduction, command variants, smoke matrices, or model/tool behavior checks.

```sql
CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT,
  command TEXT,
  expected TEXT,
  status TEXT NOT NULL DEFAULT 'not_run'
    CHECK (status IN ('not_run', 'running', 'passing', 'failing', 'blocked', 'skipped')),
  last_output TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Progress query:

```sql
SELECT status, COUNT(*) AS count
FROM test_cases
GROUP BY status
ORDER BY status;
```

### Recipe D — Code review findings

Use when reviewing diffs, PRs, generated code, security/perf risks, or architecture concerns.

```sql
CREATE TABLE IF NOT EXISTS review_findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  severity TEXT NOT NULL DEFAULT 'medium'
    CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  category TEXT,
  summary TEXT NOT NULL,
  recommendation TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'fixed', 'wontfix', 'verified')),
  evidence TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Review summary:

```sql
SELECT severity, status, COUNT(*) AS count
FROM review_findings
GROUP BY severity, status
ORDER BY severity, status;
```

### Recipe E — Research source ledger

Use when searching the web, GitHub, docs, or prior art and needing source-backed synthesis.

```sql
CREATE TABLE IF NOT EXISTS research_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  title TEXT,
  url TEXT,
  source_type TEXT,
  claim TEXT NOT NULL,
  confidence TEXT DEFAULT 'medium'
    CHECK (confidence IN ('low', 'medium', 'high')),
  used_in_output INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Find unused evidence:

```sql
SELECT title, url, claim
FROM research_sources
WHERE used_in_output = 0
ORDER BY confidence DESC, id ASC;
```

### Recipe F — Decision matrix

Use when comparing designs, libraries, APIs, strategies, or tradeoffs.

```sql
CREATE TABLE IF NOT EXISTS options (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  option_name TEXT NOT NULL,
  pros TEXT,
  cons TEXT,
  risks TEXT,
  decision TEXT NOT NULL DEFAULT 'open'
    CHECK (decision IN ('open', 'selected', 'rejected', 'deferred')),
  rationale TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Show selected/rejected rationale:

```sql
SELECT option_name, decision, rationale
FROM options
WHERE topic = 'sqlite-driver'
ORDER BY CASE decision
  WHEN 'selected' THEN 1
  WHEN 'open' THEN 2
  WHEN 'deferred' THEN 3
  ELSE 4
END;
```

### Recipe G — Contract / edge-case coverage

Use when designing commands, APIs, schemas, slash commands, or tool result contracts.

```sql
CREATE TABLE IF NOT EXISTS contract_cases (
  id TEXT PRIMARY KEY,
  surface TEXT NOT NULL,
  scenario TEXT NOT NULL,
  input TEXT,
  expected TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'specified', 'implemented', 'tested', 'blocked')),
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Coverage query:

```sql
SELECT surface, status, COUNT(*) AS count
FROM contract_cases
GROUP BY surface, status
ORDER BY surface, status;
```

### Recipe H — Delegated work aggregation

Use later if subagents/fleets/batch validators produce independent findings.

```sql
CREATE TABLE IF NOT EXISTS agent_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'superseded')),
  summary TEXT,
  files TEXT,
  confidence TEXT,
  follow_up TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Aggregation query:

```sql
SELECT agent_name, status, COUNT(*) AS count
FROM agent_results
GROUP BY agent_name, status
ORDER BY agent_name, status;
```

## Playbooks

### Playbook 1 — Complex feature implementation

1. Insert top-level tasks into `todos`.
2. Insert blocking edges into `todo_deps`.
3. Create `file_work` for files to inspect/edit.
4. Query ready tasks before each work block.
5. Update task/file status after each edit/test.
6. Before final answer, query open todos, failed tests, and unresolved findings.

Starter SQL:

```sql
CREATE TABLE IF NOT EXISTS work_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Playbook 2 — Repo-wide refactor

1. Create `batch_items` for each target file/symbol.
2. Mark `running` before editing a target.
3. Mark `done`, `failed`, or `skipped` with evidence.
4. Run grouped count queries to detect stragglers.
5. Use `file_work` if inspection and edit state differ.

Important query:

```sql
SELECT target, error
FROM batch_items
WHERE status = 'failed'
ORDER BY attempts DESC, target;
```

### Playbook 3 — Debugging / TDD

1. Create `test_cases` from repro cases and edge cases.
2. Add one `todos` item per failing category if needed.
3. Mark cases as `failing` with output excerpt.
4. Implement fixes.
5. Mark cases `passing` only after command evidence.

Important query:

```sql
SELECT id, name, command, last_output
FROM test_cases
WHERE status IN ('failing', 'not_run')
ORDER BY status, id;
```

### Playbook 4 — Code review

1. Create `review_findings` during inspection.
2. Group by severity to prioritize.
3. After fixes, mark `fixed`.
4. After retesting/re-reading, mark `verified`.
5. Final response includes only verified/resolved state plus remaining open items.

Important query:

```sql
SELECT severity, path, line_start, summary, recommendation
FROM review_findings
WHERE status = 'open'
ORDER BY CASE severity
  WHEN 'critical' THEN 1
  WHEN 'high' THEN 2
  WHEN 'medium' THEN 3
  WHEN 'low' THEN 4
  ELSE 5
END, path;
```

### Playbook 5 — Research synthesis

1. Create `research_sources` before or during searches.
2. Insert one row per useful source/claim.
3. Add confidence and notes while evidence is fresh.
4. Mark `used_in_output = 1` when cited or incorporated.
5. Query low-confidence claims before finalizing.

Important query:

```sql
SELECT topic, claim, title, url
FROM research_sources
WHERE confidence = 'low'
   OR used_in_output = 0
ORDER BY topic, confidence;
```

### Playbook 6 — Resume after context loss

When the model has lost conversational detail:

```sql
SELECT status, COUNT(*) FROM todos GROUP BY status;
SELECT title, description FROM todos WHERE status != 'done' ORDER BY priority DESC, id;
SELECT * FROM review_findings WHERE status = 'open' ORDER BY severity DESC LIMIT 20;
SELECT * FROM test_cases WHERE status != 'passing' ORDER BY id LIMIT 20;
```

Then answer:

```text
I recovered session state from SQL. Open work: X pending todos, Y blocked items,
Z failing tests, and N unresolved review findings. Next ready task is ...
```

## Prompt Guidance to Encode in the Tool

When the `session-sql` extension is implemented, include guidance like this in the tool registration. Do **not** add this to persistent system prompt files before the tool exists.

```text
Use sql as a private structured scratchpad for the current pi session.
Prefer sql when work has multiple items, dependencies, repeated validation,
file inventories, findings, research sources, test matrices, or any state you
will need to query after reload/resume/compact.

Start with the default todos/todo_deps tables for top-level work queues.
Create custom tables freely for the current workflow: file_work, batch_items,
test_cases, review_findings, research_sources, options, contract_cases, or any
small schema that makes the task easier to track.

Keep SQL state current: query before choosing the next item, update after edits,
tests, research, or decisions, and check open rows before final answers.
Do not store secrets, huge raw logs, binary data, or project deliverables here.
Use repo files for durable source/docs and sql for session-local structured work.
```

## Agent Behavior Contract

| Moment | Expected Behavior | Example SQL Action |
|--------|-------------------|--------------------|
| User asks for complex work | Create or update a structured plan | Insert `todos` and dependencies |
| Many files are involved | Track file status | Create/update `file_work` |
| A batch operation starts | Track per-target progress | Create/update `batch_items` |
| Tests are planned/run | Track expected/actual status | Create/update `test_cases` |
| Review findings emerge | Store findings with severity/status | Insert `review_findings` |
| Research sources are collected | Store claim/source/confidence | Insert `research_sources` |
| Context is stale | Rehydrate from DB | Query open todos/findings/tests |
| Before final response | Verify no hidden open work | Count pending/blocked/failing rows |

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Use only built-in `todos` | Agents track every workflow as tasks only | Simple; low schema churn | Loses workflow-specific structure | Rejected |
| Built-in queue + opportunistic custom tables | Top-level work in `todos`; task-specific details in custom tables | Flexible; mirrors Copilot-style custom-table strength | Requires prompt guidance | Selected |
| Preinstall many default tables | Ship `file_work`, `test_cases`, `review_findings`, etc. by default | Discoverable | Bloats default schema; premature ontology | Rejected v1 |
| Generic key-value state only | Store arbitrary facts as key/value | Easy to create | Hard to query counts/groups/deps | Rejected except for tiny state |
| Raw event log in SQL | Insert every action/tool output | Complete trace | Noisy; duplicates session log; can grow fast | Rejected v1 |
| Distilled evidence tables | Store summaries/status/evidence per workflow | Queryable and compact | Requires discipline | Selected |
| Agent must ask before creating tables | Human controls schema | Predictable | Kills usefulness and autonomy | Rejected |
| Agent creates tables when trigger rules match | Tool becomes proactive | Better agent performance | Needs anti-pattern guidance | Selected |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Agent execution | Agent might ignore SQL or only use todos | Trigger rules and playbooks make proactive use clear. |
| Implementation | Tool prompt guidelines would be generic | Concrete text and examples are ready to adapt. |
| Review | Reviewer would debate whether custom tables are expected | Custom-table behavior is a documented design goal. |
| Testing | Smoke might only prove default tables | Validation can include arbitrary custom table creation/query. |
| User operation | Humans might not know what the agent stored | `/sql schema` and table recipes make inspection predictable. |
| Future extensions | Every workflow would reinvent table patterns | Recipes establish reusable schemas and habits. |

## Anti-Patterns

| Anti-Pattern | Why It Hurts | Better Pattern |
|--------------|--------------|----------------|
| Never using SQL unless user explicitly asks | Tool value is lost | Use trigger rules proactively. |
| Putting every thought into SQL | Noise and stale records | Store distilled state/evidence only. |
| Storing secrets/tokens | Unsafe and unnecessary | Keep secrets out of session SQL. |
| Storing huge raw logs | Bloats DB and output | Store command, status, path, and short excerpt. |
| Creating a table and never querying it | Schema theater | Query before decisions and final answers. |
| Updating chat but not SQL | DB becomes stale | Update immediately after evidence. |
| Treating SQL as permanent docs | Data hidden outside repo | Move durable conclusions into source/docs when needed. |
| Over-normalizing tiny workflows | Wastes attention | Use simple tables; add complexity only when queried. |
| Using custom tables instead of `todos` for top-level work | Humans lose one common queue | Keep top-level queue in `todos`, details elsewhere. |
| Copying fork state by assumption | Violates v1 semantics | Forks start empty; recreate only if user asks. |

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- Tool prompt guidelines explicitly say agents may create arbitrary task-specific tables.
- Documentation or examples show at least five custom-table use cases beyond `todos`.
- Store tests or smoke prove creating, inserting into, and querying a custom table works.
- `/sql schema` makes custom tables visible to humans.
- The implementation does not add more default tables solely because recipes exist here.
- Review confirms this guidance stays scoped to the future tool, not persistent prompt policy before the tool exists.

## Open Questions

### Q1: Should the implementation include a `/sql examples` command?

**Direction**: Defer. The tool prompt and workshop examples are enough for v1. Add `/sql examples` only if real use shows discoverability problems.

### Q2: Should the default schema include common recipes like `file_work` or `test_cases`?

**Decision**: No for v1. Keep default schema small (`session_sql_meta`, `todos`, `todo_deps`) and let agents create use-case tables as needed.

### Q3: Should agents ask permission before creating custom tables?

**Decision**: No. Creating local session tables is within the trusted SQL boundary. The agent should ask only when the table contents imply external side effects or user-sensitive data.

### Q4: Should this guidance become `.pi/APPEND_SYSTEM.md` policy now?

**Decision**: No. The tool does not exist yet. Encode guidance in the future tool registration/prompt metadata and only add persistent prompt policy after the capability is available.

## Quick Reference

### Use SQL when

```text
many items | dependencies | repeated tests | file inventory | review findings |
research sources | decision matrix | batch progress | resume/compact risk
```

### Default queue query

```sql
SELECT t.id, t.title, t.status, t.priority
FROM todos t
WHERE t.status != 'done'
ORDER BY t.priority DESC, t.id ASC;
```

### Common custom tables

```text
file_work         — files inspected/edited/validated
batch_items       — per-target batch state
test_cases        — planned/running/passing/failing tests
review_findings   — severity/status/category findings
research_sources  — source-backed claims and confidence
options           — design decision matrix
contract_cases    — API/tool/command edge cases
agent_results     — delegated work aggregation
```

### Before final answer

```sql
SELECT 'todos_not_done' AS bucket, COUNT(*) AS count FROM todos WHERE status != 'done'
UNION ALL
SELECT 'open_findings', COUNT(*) FROM review_findings WHERE status = 'open'
UNION ALL
SELECT 'tests_not_passing', COUNT(*) FROM test_cases WHERE status NOT IN ('passing', 'skipped');
```

If a table does not exist, ignore that bucket and report from the tables used in the session.
