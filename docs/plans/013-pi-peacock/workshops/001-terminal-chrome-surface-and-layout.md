# Workshop: Terminal Chrome Surface and Layout

**Type**: Integration Pattern / UI Flow
**Plan**: 013-pi-peacock
**Spec**: Not yet created; source research is [`../research-dossier.md`](../research-dossier.md)
**Created**: 2026-05-27T00:00:00Z
**Status**: Draft

**Value Thesis**: This workshop makes the first `pi-peacock` implementation cheaper and safer by deciding which Pi UI surfaces can express top/bottom color chrome without hiding core Pi information or requiring Pi core changes.
**Target Proof Level**: Preferred Direction
**Current Proof Level**: Preferred Direction

**Selected Value Axes**:
- **Operator Usability**: The chosen surface must make the active Pi workspace obvious without stealing focus or crowding the editor.
- **Safety to Change**: The first slice should not replace core footer/header behavior until preservation rules are explicit.
- **Implementation Readiness**: The workshop should give an agent clear API choices for Phase 1.
- **Review Compression**: Reviewers should be able to check whether the extension stayed inside public Pi extension APIs.

**Related Documents**:
- [`../research-dossier.md`](../research-dossier.md)
- [`002-bottom-status-bar-contract.md`](./002-bottom-status-bar-contract.md)
- [`003-color-palette-state-and-command-contract.md`](./003-color-palette-state-and-command-contract.md)
- [`../../010-sql-backed-todo-extension/workshops/006-claude-code-style-below-editor-todo-strip.md`](../../010-sql-backed-todo-extension/workshops/006-claude-code-style-below-editor-todo-strip.md)

**Domain Context**:
- **Primary Domain**: `agent-tooling-interface`
- **Related Domains**: `extension-authoring-harness`, optional `session-work-state`

---

## Purpose

Clarify which public Pi extension UI surfaces `pi-peacock` should use for terminal top/bottom color chrome. This drives whether Phase 1 is a safe widget/status proof or a larger footer/header replacement.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Preferred Direction** with no additional context.

They should be able to:

- Select the recommended v1 rendering surface.
- Understand which surfaces are safe, risky, or experimental.
- Explain why Pi core modification is out of scope.
- Implement a first slice without disrupting existing footer/status UX.

## Key Questions Addressed

- Should v1 default to widget bars, footer replacement, or status-only plus top bar?
- How do we put color at the top and bottom without taking up too much space?
- What does “top” mean in a terminal TUI where there is no four-edge border?
- What should be deferred until a richer UI workshop/spec?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Preferred Direction | Enough to scaffold and build a narrow proof without over-designing footer internals. |
| Primary Value Axis | Safety to Change | UI chrome can hide existing critical status if implemented through footer/header replacement too early. |
| Supporting Value Axes | Operator Usability, Implementation Readiness, Review Compression | These keep the first slice visible, buildable, and reviewable. |
| Downstream Loop Improved | Implementation + Review | Agents can build from a small accepted surface; reviewers can reject accidental core/footgun changes quickly. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Pi UI APIs exist | Research: IA-02, IC-04..IC-08 | No core change needed | Ready |
| Widget strip precedent | Todo strip workshop + research PL-02 | Safe default surface | Ready |
| Footer replacement risk | Research: Critical Finding 01, DB-06 | Keep footer mode opt-in | Ready |
| TUI width rules | Pi TUI docs + research QT-02/QT-06 | One-line bounded bars | Ready |

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Status only | `ctx.ui.setStatus("pi-peacock", "Peacock: React Blue")` | Very safe; preserves footer; tiny implementation | Does not create visible top/bottom bars | Rejected as default; keep as always-on indicator |
| Widget bars | `setWidget` above editor + below editor | Safe, reversible, does not replace footer/header, tested precedent | Bars are near editor, not whole terminal top/bottom | **Selected for v1 default** |
| Custom footer | `ctx.ui.setFooter(...)` renders full bottom status bar | Best match for user’s bottom status-bar goal | Replaces built-in footer; must preserve model/tokens/statuses | Defer to workshop 002; opt-in Phase 3 |
| Custom header | `ctx.ui.setHeader(...)` top banner | True top-of-Pi area | Replaces startup header/hints; not persistent near editor | Optional later; not v1 default |
| Editor border | `ctx.ui.setEditorComponent(...)` wraps input border | Closest to top/bottom input chrome | Conflicts with editor replacements; invasive | Experimental later |
| Pi core patch | Modify interactive layout directly | Could do exact chrome | Forbidden/no need; violates goal | Rejected |

## Recommended v1 Surface

Use three public, low-risk projections:

1. **Top color bar**: `ctx.ui.setWidget("pi-peacock-top", component, { placement: "aboveEditor" })`
2. **Bottom color bar**: `ctx.ui.setWidget("pi-peacock-bottom", component, { placement: "belowEditor" })`
3. **Footer status pill**: `ctx.ui.setStatus("pi-peacock", "Peacock: <label>")`

This creates an immediate Peacock identity while preserving Pi’s built-in footer and header.

### Proposed Default Layout

```text
┌──────────────────────────────────────────────────────────────┐
│ PEACOCK  React Blue  #61dafb                                 │  ← top widget, 1 line
└──────────────────────────────────────────────────────────────┘

> user editor remains here

┌──────────────────────────────────────────────────────────────┐
│ pi-peacock · React Blue                                      │  ← bottom widget, 1 line
└──────────────────────────────────────────────────────────────┘

cwd/session/model/tokens/context/statuses remain in Pi's built-in footer
```

The exact glyphs/ANSI background are implementation details. Smoke should match stable text such as `PEACOCK React Blue`, not ANSI escapes.

## Space Budget

| Surface | Default Height | Max Height | Notes |
|---------|----------------|------------|-------|
| Top widget | 1 line | 1 line | Pure color/label strip; no wrapping. |
| Bottom widget | 1 line | 1 line | Keep separate from built-in footer; no prompt text. |
| Status pill | built-in footer row | N/A | Clears with `undefined` when disabled. |
| Custom footer mode | 1-2 lines | 2 lines | Opt-in only; see workshop 002. |

### Why One Line Each

- Terminal vertical space is scarce.
- Pi already has chat history, editor, widgets, and footer.
- Existing todo strip may also occupy below-editor space.
- One-line bars are enough to prove color identity and can later be made configurable.

## Surface Ownership Rules

1. `pi-peacock` may own only its own widget/status keys in v1.
2. It must not clear or overwrite other extensions’ widgets/statuses.
3. It must not call `setFooter()` by default.
4. It must not call `setHeader()` by default.
5. It must clear all owned UI with `undefined` on disable/shutdown.
6. It must use a unique visible text anchor for smoke.

Suggested keys:

```ts
export const PEACOCK_STATUS_KEY = "pi-peacock";
export const PEACOCK_TOP_WIDGET_KEY = "pi-peacock-top";
export const PEACOCK_BOTTOM_WIDGET_KEY = "pi-peacock-bottom";
```

## Operator Flows

### Enable default chrome

```text
/peacock reactBlue
```

Expected visible result:

```text
PEACOCK React Blue #61dafb
...
peacock · React Blue
```

Expected status:

```text
pi-peacock: React Blue
```

### Disable chrome

```text
/peacock off
```

Expected effects:

- Top widget cleared.
- Bottom widget cleared.
- `pi-peacock` status cleared with `undefined`.
- Persisted state records disabled if persistence is enabled.

### Show current state

```text
/peacock status --json
```

Example:

```json
{
  "enabled": true,
  "surface": "widget",
  "placement": "both",
  "preset": "reactBlue",
  "label": "React Blue",
  "hex": "#61dafb"
}
```

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Agent could choose footer/header/editor replacement prematurely. | Agent starts with widget bars + status pill. |
| Review | Reviewer has to infer why footer was replaced. | Footer replacement is explicitly deferred/opt-in. |
| Testing | Team might try brittle ANSI screenshots. | Smoke uses stable labels; unit tests cover color/width. |
| Agent execution | Agent may touch Pi core. | Public extension API boundary is explicit. |

## Validation / Acceptance

This workshop reaches its target proof level when:

- The team accepts widget bars + status pill as Phase 1 default.
- Footer replacement is deferred to workshop 002 / Phase 3.
- Implementation tasks reference the surface ownership rules above.
- Smoke criteria use visible anchors and do not require ANSI screenshots.

## Open Questions

### Q1: Should the top bar include text?

**PROPOSED**: Yes, but minimal: `PEACOCK <label> <hex>`. The user said top text is undecided; a label is useful for smoke and accessibility.

### Q2: Should below-editor `todo-strip` and bottom Peacock bar coexist?

**OPEN**: If both are active, vertical crowding may occur. Initial implementation can render Peacock bottom bar above or below todo strip depending on Pi widget order by key/insertion. If crowded, add `/peacock placement top` or `/peacock bottom off`.

### Q3: Should widget bars use full ANSI background or colored text blocks?

**PROPOSED**: Unit-test a truecolor background encoder, but smoke only text anchors. If terminal capability is uncertain, degrade to colored foreground/glyphs.

## Quick Reference

```text
Default v1:
  top:    setWidget("pi-peacock-top", ..., aboveEditor)
  bottom: setWidget("pi-peacock-bottom", ..., belowEditor)
  status: setStatus("pi-peacock", "Peacock: <label>")

Avoid by default:
  setFooter, setHeader, setEditorComponent, Pi core modifications
```
