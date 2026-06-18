# Worker Packet — {{DELEGATION_ID}}

**Run**: {{RUN_ID}}
**Delegation**: {{DELEGATION_ID}}
**Phase**: {{PHASE}}

---

## Mission

{{TASK_DESCRIPTION}}

---

## Repo Root

```
{{REPO_ROOT}}
```

Work inside this repo root. All relative paths below resolve from here.

---

## Forbidden Paths (NEVER edit these)

The following paths are owned by the orchestrator. **Do not read, write, or delete them.**

{{FORBIDDEN_PATHS}}

If you are about to touch any of these, stop and re-read the allowed scope.

---

## Allowed Scope

You may ONLY create or modify files within:

{{ALLOWED_PATHS}}

Stay inside this scope. Do not touch anything outside it without explicit permission.

---

## Context

### Phase Plan Section

{{PLAN_PHASE_CONTENT}}

---

### Tasks

{{TASKS_CONTENT}}

---

### Execution Log

{{EXEC_LOG_CONTENT}}

---

### Cluster Learnings

{{LEARNINGS_CONTENT}}

---

## Report Schema

When your work is complete, send a report via `pij_send` using this exact JSON schema:

```json
{
  "delegationId": "{{DELEGATION_ID}}",
  "outcome": "COMPLETE | PARTIAL | BLOCKED",
  "summary": "1–3 sentences describing what was done and the current state",
  "filesChanged": ["path/to/file1.ts", "path/to/file2.ts"],
  "testsRun": 0,
  "testsPassed": 0,
  "gatesClean": true,
  "notes": "optional — blockers, decisions, questions for the orchestrator"
}
```

---

## Stop Conditions

- **Run your self-check gates before reporting** (`just flow-pair-test`, `just typecheck`, `just lint`)
- **Do NOT edit forbidden paths** under any circumstances
- **Do NOT write `.flow-pair/`** and do NOT read any ledger files under `.flow-pair/` —
  the orchestrator owns the entire ledger directory. Exception: you may read **only this
  packet file** (the one you are currently executing from, under `.flow-pair/.../prompts/`).
  Never read `events.jsonl`, `run.json`, delegation records, or other ledger files.
- **Send your report via `pij_send`** with the schema above before stopping
- If you hit a blocker you cannot resolve, set `"outcome": "BLOCKED"` and describe it in `"notes"`
