# Workshop: Plan/PRD file format & schema

**Type**: Data Model
**Plan**: 008-ralph-loop-extension
**Spec**: [`../ralph-loop-extension-spec.md`](../ralph-loop-extension-spec.md)
**Created**: 2026-05-15
**Status**: Draft

**Value Thesis**: Clarify Q7 chose markdown-checkbox plan files but left the parser grammar, stop-marker placement, and adapter-interface (for v2 prd.json) unpinned. Defining the grammar before code prevents "the parser does this, the runner expects that" drift and gives the iteration runner a single, testable extraction surface.

**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Operator Usability** — users author plan files; the format must be obvious.
- **Implementation Readiness** — the parser is small and copy-pasteable from this workshop.
- **Knowability** — exactly one rule defines "what counts as a task".
- **Migration Safety** — the adapter stub lets v2 add `prd.json` without rewriting consumers.

**Related Documents**:
- [`001-stop-condition-catalog.md`](001-stop-condition-catalog.md) — defines `taskFingerprint` SHA-1 over the trimmed lowercase task title.
- [`002-sdk-iteration-lifecycle.md`](002-sdk-iteration-lifecycle.md) — runner reads `planSnapshot` (string) at iteration start.
- [Spec § Q7](../ralph-loop-extension-spec.md) — clarify decision.
- [External research § 1](../external-research/ralph-loop-provenance.md) — snarktank's `prd.json` shape (for the v2 adapter rationale).

**Domain Context**:
- **Primary Domain**: `agentic-loops` — plan-file consumption is a core contract of the domain.
- **Related Domains**: none in v1. The plan file is user-authored on disk; no other domain owns it.

---

## Purpose

Define the **canonical v1 plan-file grammar** (markdown with task checkboxes and explicit stop marker), the **TS types** the parser produces, the **rules for "next undone task" selection**, and the **adapter interface stub** for future formats (`prd.json`) so v2 work doesn't require rewriting consumers.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Contract Ready** with no additional context.

They should be able to:

- Write a valid markdown plan file from the worked examples.
- Implement `parseMarkdownPlan(text: string): PlanModel` directly from the grammar table.
- Choose `nextUndoneTask(plan: PlanModel)` correctly for every example.
- Decide whether a new plan-file format should be a parser variant or an adapter implementation.

## Key Questions Addressed

- What is the exact markdown grammar for "this line is a task"?
- How are nested tasks handled (sub-bullets)?
- Where does the explicit `STOP` marker go? Whitespace tolerance?
- Where does the agent's `<promise>COMPLETE</promise>` go? (Not in the plan file — in the agent's output stream. See 001.)
- What is the task-title (the substring used for fingerprinting)?
- What is the "next undone task" selection rule?
- What's the `PlanAdapter` interface stub for v2?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Contract Ready | Parser is small; full Implementation Ready level adds little once grammar + types are pinned. |
| Primary Value Axis | Operator Usability | The user authors these files; obvious-or-broken is the only acceptable outcome. |
| Supporting Value Axes | Implementation Readiness, Knowability, Migration Safety | Single grammar table; adapter stub for v2. |
| Downstream Loop Improved | Implementation + User onboarding | Parser ships fast; users have a one-page reference. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Grammar table | § Grammar | Spec Q7 | Ready |
| `PlanModel` TS types | § Data model | runner contract from 002 | Ready |
| Worked examples (5) | § Examples | user-facing docs/how page | Ready |
| Adapter interface | § PlanAdapter | v2 migration | Ready |
| Parser test cases | § Validation | store.test.ts coverage | Ready |
| Edge case ledger | § Edge cases | spinning detection + stop detection robustness | Ready |

## Decision Space

### Markdown task syntax

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| GFM task lists (`- [ ]` / `- [x]`) | GitHub Flavored Markdown standard. | Universal; renderers handle it; editors highlight it. | none material | **Selected**. |
| Custom syntax (`TODO:` / `DONE:`) | Plain-text. | Works without markdown awareness. | Reinvents the wheel; not renderable. | Rejected. |
| HTML comments (`<!-- task: ... -->`) | Hidden in rendered markdown. | Invisible in rendered view. | Confusing for users; non-standard. | Rejected. |

### Sub-task semantics

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Nested checkboxes are independent tasks | Each `- [ ]` is a task regardless of indentation. | Simple; matches "one task per loop" — the agent picks the leaf. | Parents can be checked while children remain. | **Selected**. |
| Nested checkboxes are grouped; parent done = all children done | Hierarchical completion. | Mirrors human mental model. | Forces parser to validate parent/child consistency; agent picks parents that already have unchecked children. | Rejected for v1. |

### Stop-marker placement

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Standalone `STOP` line | Line whose trimmed content (case-insensitive) is exactly `STOP`. | Unambiguous; user can drop it anywhere. | Word "STOP" appearing inside other contexts? See edge cases. | **Selected**. |
| Frontmatter field `stop: true` | YAML frontmatter convention. | Structured. | Heavier; user has to add frontmatter. | Rejected for v1; could be a v2 adapter. |
| `<!-- ralph: stop -->` HTML comment | Hidden marker. | Invisible in rendered markdown. | Less discoverable; user has to remember syntax. | Rejected. |

---

## Grammar (v1)

A plan file is a UTF-8 text file (any extension; convention `PLAN.md`). The parser scans line-by-line.

| Token | Regex (line-anchored) | Semantics |
|-------|----------------------|-----------|
| **Undone task** | `^[ \t]*[-*][ \t]+\[[ ]\][ \t]+(?<title>.+?)\s*$` | Adds an `UndoneTask` with the captured title. Leading whitespace permitted; bullet may be `-` or `*`. |
| **Done task** | `^[ \t]*[-*][ \t]+\[[xX]\][ \t]+(?<title>.+?)\s*$` | Adds a `DoneTask` with the captured title. |
| **Stop marker** | `^[ \t]*[sS][tT][oO][pP][ \t]*$` | Sets `plan.stopMarker = { lineNumber, raw }`. Case-insensitive but the line MUST be just `STOP` (with optional surrounding whitespace). |
| **Anything else** | (no match) | Ignored. Including headings, prose, code blocks. |

Notes:
- The parser does NOT understand markdown semantics beyond these line shapes. A code-fenced `- [ ] inside code` IS treated as a task. Users authoring code samples should escape (`\- [ ]`) or rely on the fact that agents see the raw file too — this is a known leak documented in `docs/how/ralph-loop.md`.
- Task titles are trimmed of leading/trailing whitespace; internal whitespace is preserved.
- An empty title (`- [ ] `) is logged as a parser warning but NOT consumed as a task (no fingerprint can be computed reliably).

## Data model

```ts
// .pi/extensions/ralph-loop/store.ts (section: plan parser)

export interface PlanModel {
  /** Source path (absolute). */
  readonly path: string;
  /** Frozen snapshot of file contents at parse time. */
  readonly raw: string;
  /** Tasks in document order. */
  readonly tasks: readonly PlanTask[];
  /** Stop marker, if present. */
  readonly stopMarker: PlanStopMarker | null;
  /** Parser warnings (non-fatal). */
  readonly warnings: readonly PlanWarning[];
}

export type PlanTask =
  | { readonly kind: "undone"; readonly title: string; readonly lineNumber: number }
  | { readonly kind: "done"; readonly title: string; readonly lineNumber: number };

export interface PlanStopMarker {
  readonly lineNumber: number;
  readonly raw: string;
}

export interface PlanWarning {
  readonly lineNumber: number;
  readonly message: string;
}
```

Why the shape:
- **`readonly` everywhere** — once parsed, immutable. Re-parse on next iteration.
- **`PlanTask` is a tagged union** — same discriminator pattern as `StopReason`. Exhaustive matching.
- **`warnings` is a first-class field** — empty-title rows, malformed checkboxes, etc. surface to `/ralph status` (or a notify) so the user sees parser feedback.

## Next-undone-task selection

```ts
export function nextUndoneTask(plan: PlanModel): PlanTask | null {
  // Document order: first undone wins. No priority, no nesting awareness.
  return plan.tasks.find((t) => t.kind === "undone") ?? null;
}
```

Why document order:
- Simplest possible rule; matches user mental model ("top of the file is what I want done first").
- Matches snarktank's `prd.json` selection ("highest priority undone story") — they encode priority via list order, we encode it the same way.
- The agent is free to ignore this and pick differently — the runner uses `nextUndoneTask` ONLY for `taskTitle` extraction when the agent didn't declare one. The agent's own pick wins for fingerprinting.

If `nextUndoneTask` returns `null` AND the plan has no `stopMarker`:
- The run ends with `StopReason.complete` (everything is done).
- This is the "plan exhausted" path — distinct from `<promise>COMPLETE</promise>` (sigil) and from `STOP` line (manual).

## Worked examples

### Example 1 — Minimal

```markdown
# My plan

- [ ] Write the README
- [ ] Add a test
- [ ] Run typecheck
```

Parses to:

```ts
{
  path: "PLAN.md",
  raw: "...",
  tasks: [
    { kind: "undone", title: "Write the README", lineNumber: 3 },
    { kind: "undone", title: "Add a test", lineNumber: 4 },
    { kind: "undone", title: "Run typecheck", lineNumber: 5 },
  ],
  stopMarker: null,
  warnings: [],
}
```

`nextUndoneTask` returns "Write the README".

### Example 2 — Mid-run state

```markdown
- [x] Scaffold the package
- [x] Configure tsconfig
- [ ] Add unit tests
- [ ] Wire up CI
```

Parses to 4 tasks (2 done, 2 undone). `nextUndoneTask` returns "Add unit tests".

### Example 3 — Nested tasks (independent semantics)

```markdown
- [ ] Refactor auth
  - [ ] Move tokens to vault
  - [x] Rotate signing key
- [ ] Update docs
```

Parses to 4 tasks (3 undone, 1 done). `nextUndoneTask` returns "Refactor auth" — the leaf-vs-parent semantics are NOT enforced; the agent picks. If the user wanted to prevent picking parents while children are open, they would author it differently (e.g. omit the parent checkbox).

### Example 4 — Manual stop

```markdown
- [ ] Implement A
- [ ] Implement B

I want to pause here.

STOP

- [ ] Implement C (later)
```

Parses to 3 tasks (all undone). `stopMarker = { lineNumber: 5, raw: "STOP" }`. The store ends the run with `manual_stop` on the FIRST iteration (before picking a task).

### Example 5 — Mixed: complete via plan-exhaustion + warning

```markdown
# Done!

- [x] All of it
- [ ] 
```

Parses to 1 task (1 done), 1 warning ("line 4: empty title; not consumed as a task"). `nextUndoneTask` returns `null` → run ends with `complete` on first iteration.

---

## Edge cases

| Case | Behavior | Why |
|------|----------|-----|
| `- [ ] STOP` (a task whose title is "STOP") | Parses as undone task with title "STOP"; **does not** trigger stop marker. | Stop marker is a standalone line; task syntax wins for indented/bulleted "STOP". |
| `STOP` inside a code block | Triggers stop marker (parser doesn't understand code blocks). | Acceptable limitation; documented in `docs/how/`. |
| `Stop` (mixed case) on its own | Triggers stop marker (case-insensitive). | Reduces user surprise. |
| Multiple `STOP` lines | Only the first is recorded in `plan.stopMarker`; subsequent lines are ignored. | Deterministic; we honor the earliest user intent. |
| `- [x] task` with title that hashes to same fingerprint as a current undone task | Spinning detection still uses the *agent's pick*, not the plan file. | Fingerprint comes from the agent's reported `taskTitle` per 002, not from `nextUndoneTask`. |
| File modified mid-run | Snapshot at iteration start (per 002). Next iteration sees the new content. | Mid-iteration consistency without locks. |
| File deleted mid-run | Next iteration's snapshot read returns ENOENT; store treats as `manual_stop`. | Plan-gone = stop. Documented in `docs/how/`. |
| Non-UTF8 bytes | Parser reads with `'utf8'` and Node replaces invalid sequences with U+FFFD; warning row per replacement line. | Permissive; never crashes. |
| Very large plan file (>1 MB) | Warning logged; parser still completes. | We don't impose a hard cap; the agent's own context window will object first. |
| BOM at file start | Stripped; parser proceeds normally. | Editor compatibility. |
| Windows line endings (`\r\n`) | Normalized to `\n` before regex matching. | Cross-platform. |

---

## PlanAdapter interface (v2 stub)

NOT shipped in v1. The store uses `parseMarkdownPlan` directly. The interface is documented here so v2 can drop in `prd.json` (or any other format) without touching the runner or store evaluator.

```ts
// Future: .pi/extensions/ralph-loop/plan-adapter.ts

export interface PlanAdapter {
  readonly format: string;             // "markdown" | "prd.json" | "custom:foo"
  parse(text: string, path: string): PlanModel;
}

export const markdownAdapter: PlanAdapter = {
  format: "markdown",
  parse: parseMarkdownPlan,
};

// v2: pick adapter by extension or content sniff
export function selectAdapter(path: string, head: string): PlanAdapter {
  if (path.endsWith(".json") && head.includes('"stories"')) return prdJsonAdapter;
  return markdownAdapter;
}
```

v1 hardcodes `markdownAdapter` at the call site. The store NEVER references `selectAdapter`; that's a v2 concern. The interface here is so the v2 PR is small.

---

## Validation rules

1. **Every task line has a non-empty trimmed title** OR a warning is emitted (no silent drops).
2. **`stopMarker.lineNumber` is 1-based.** Matches editor conventions.
3. **`tasks` is in document order.** Tests assert this with shuffled inputs.
4. **The parser is pure.** `parseMarkdownPlan(x) === parseMarkdownPlan(x)` for identical input — no `Date.now()`, no `Math.random()`, no I/O.
5. **No `as` casts.** Parser uses structural construction; P6 enforced.

---

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | "Write a markdown parser somehow; figure out 'next task'; handle stop somehow" | Copy the grammar table to a regex; build `PlanModel`; `find()` for next task |
| Review | "Does this handle edge cases?" | Diff against § Edge cases table; every row has a vitest case |
| Testing | "What inputs should I test?" | Copy the 5 worked examples + every edge-case row into `store.test.ts` |
| User onboarding | "How do I write a plan file?" | Copy Example 1 from `docs/how/ralph-loop.md` |
| Companion | "Is the parser breaking?" | Diff against grammar table; warn if regex changes without test changes |

---

## Validation / Acceptance

This workshop reaches Contract Ready when:

- [ ] `PlanModel`, `PlanTask`, `PlanStopMarker`, `PlanWarning` types compile with `tsc --noEmit`.
- [ ] `parseMarkdownPlan` exists in `store.ts` and is pure (no side effects).
- [ ] Every Worked Example has a vitest test that asserts the full parsed `PlanModel`.
- [ ] Every Edge Case row has a vitest test.
- [ ] `nextUndoneTask` has at least 3 tests (mixed, all-done, all-undone, empty).
- [ ] The `PlanAdapter` interface lives in a comment block or a `.ts` file with `// v2` annotation — NOT exported from `index.ts` in v1.

---

## Open Questions

### Q1: Should the parser strip leading `#` heading markers from task titles?

**RESOLVED**: No. Headings are not tasks; the grammar table doesn't match them. If a user writes `# - [ ] foo`, the line doesn't match (no leading dash/star). Deterministic and obvious.

### Q2: Should the stop marker accept additional words?

E.g. `STOP HERE` or `STOP — let me think`.

**RESOLVED**: No. v1 grammar matches exactly `STOP` (case-insensitive) on its own line. Multi-word patterns are user-confusing and the parser already records the matching line's `raw` for forensics. If users want commentary, they can put it on the next line.

### Q3: Should completed tasks count toward "task budget" (e.g., a "max 50 tasks" cap)?

**OPEN — defer to v2**. v1 has no per-plan task budget. The iteration cap (default 10) bounds the run; the plan can have hundreds of tasks without breaking anything.

### Q4: Should the parser support `- [-]` (skipped) or `- [!]` (blocked) states?

**OPEN — defer to v2**. v1 grammar is binary (done/undone). v2 could add a `PlanTask` variant for "skipped" that's treated like done for spinning but not for completion.
