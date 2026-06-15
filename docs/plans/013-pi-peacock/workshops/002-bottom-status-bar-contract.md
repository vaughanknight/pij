# Workshop: Bottom Status Bar Contract

**Type**: UI Contract / Integration Pattern
**Plan**: 013-pi-peacock
**Spec**: Not yet created; source research is [`../research-dossier.md`](../research-dossier.md)
**Created**: 2026-05-27T00:00:00Z
**Status**: Draft

**Value Thesis**: This workshop makes `pi-peacock` safer to implement by specifying exactly how a Peacock-colored bottom status bar should cover Pi's existing footer area while preserving the information operators already depend on.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Operator Usability**: The colored footer must improve workspace recognition without removing model/session/context/status information.
- **Safety to Change**: Footer replacement is a high-risk UI takeover; this contract defines preservation and rollback rules.
- **Implementation Readiness**: An agent should be able to implement the footer renderer from this contract with minimal clarification.
- **Review Compression**: Reviewers can compare the implementation against a concrete segment list and acceptance matrix.

**Related Documents**:
- [`../research-dossier.md`](../research-dossier.md)
- [`001-terminal-chrome-surface-and-layout.md`](./001-terminal-chrome-surface-and-layout.md)
- [`003-color-palette-state-and-command-contract.md`](./003-color-palette-state-and-command-contract.md)
- Pi example: `pi-fork/packages/coding-agent/examples/extensions/custom-footer.ts`

**Domain Context**:
- **Primary Domain**: `agent-tooling-interface`
- **Related Domains**: `extension-authoring-harness`, optional `session-work-state`

---

## Purpose

Clarify how `pi-peacock` should color the entire existing bottom footer/status area, including the rows that currently show cwd/branch, token/cost/context, model/thinking, MCP/session-sql/todo statuses, and provider/model information.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Contract Ready** with no additional context.

They should be able to:

- Implement an opt-in custom footer mode that colors the whole footer area.
- Preserve the current bottom status information in a Peacock-colored layout.
- Know which data can be pulled from public Pi footer APIs and which may need graceful omission.
- Write tests/smoke assertions that prove the footer remains usable.

## Key Questions Addressed

- Can we get a background across the entire existing bottom footer area?
- What text/status segments must remain visible?
- How should the footer handle width pressure?
- How does this coexist with other extension statuses such as `session-sql` and `todo`?

---

## User Target

The desired bottom area is the existing Pi footer/status area, not an extra strip below the editor:

```text
~/pi-hacking/pij (main)
↑390k ↓16k R7.2M $0.000 (sub) 18.6%/1.1M (auto)                                                                                                  (github-copilot) gpt-5.5 • medium
MCP: 1/2 servers session-sql: ready todo: 3 open
```

The product intent is:

> Put Peacock color behind the entire bottom area while keeping the status bar useful and extensible.

This means footer mode should become a first-class design target, not just a later decorative option. The safe implementation still needs a rollback path and preservation rules.

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Contract Ready | Footer mode needs a concrete contract before implementation because it replaces core Pi UI. |
| Primary Value Axis | Operator Usability | The footer is the operator's model/session/status dashboard. |
| Supporting Value Axes | Safety to Change, Implementation Readiness, Review Compression | These prevent accidental information loss and make implementation review objective. |
| Downstream Loop Improved | Implementation + Smoke validation | Agents can build and test a known segment contract instead of improvising a footer. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| `setFooter` receives `footerData` | Research IA-04, IC-06 | Footer can preserve extension statuses/branch | Ready |
| Built-in footer contains key operator info | Research DC-03 | Preservation list required | Ready |
| `setFooter` replaces built-in footer | Research Critical Finding 01 | Reversible/opt-in rules | Ready |
| Existing statuses from todo/session-sql/minih | Research DC-03/DB-06 | Status segment must include all extension statuses | Ready |

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Extra below-editor bar | Keep default footer untouched and add a colored widget | Safest; easy smoke | Does not color the actual bottom status area user wants | Rejected as final bottom goal; useful fallback |
| Footer background wrapper | Replace footer and render built-in-equivalent lines on Peacock background | Matches user target | Requires recreating footer data layout | **Selected target** |
| Theme-only footer colors | Switch Pi theme tokens to recolor built-in footer | No footer replacement | Theme tokens may not isolate footer; broad side effects | Rejected for v1 |
| Pi core footer decoration API | Add/modify core to support footer background | Clean long-term | Forbidden for this extension-first plan | Rejected unless upstream API requested later |

## Footer Mode Contract

### Contract Name

`surface: "footer"`

### Ownership

When footer mode is enabled, `pi-peacock` owns the active custom footer component. It must:

1. Render a Peacock-colored background across every footer line it owns.
2. Preserve the major information classes from Pi's built-in footer.
3. Render all extension statuses from `footerData.getExtensionStatuses()`.
4. Restore the built-in footer on disable/shutdown with `ctx.ui.setFooter(undefined)`.
5. Avoid hard failures if some public data is unavailable.

### Expected Public Inputs

Available from the extension command/lifecycle context and footer factory:

| Data | Source | Status |
|------|--------|--------|
| cwd / repo path | `ctx.cwd` | Available |
| git branch | `footerData.getGitBranch()` | Available in footer mode |
| extension statuses | `footerData.getExtensionStatuses()` | Available in footer mode |
| current model | `ctx.model` | Available through captured current context; refresh on model events if needed |
| context usage | `ctx.getContextUsage()` | Available through context |
| provider count | `footerData.getAvailableProviderCount()` | Available |
| token/cost exact parity | Built-in footer internal/session stats | Partially available; preserve best-effort or defer exact parity |

### Data Preservation Tiers

| Tier | Segment | Must Preserve? | Source | Notes |
|------|---------|----------------|--------|-------|
| P0 | cwd/project path | Yes | `ctx.cwd` | Essential orientation. |
| P0 | git branch | Yes | `footerData.getGitBranch()` | User explicitly showed `(main)`. |
| P0 | provider/model/thinking | Yes | `ctx.model`, `pi.getThinkingLevel()` if captured | User explicitly showed `(github-copilot) gpt-5.5 • medium`. |
| P0 | extension statuses | Yes | `footerData.getExtensionStatuses()` | Must keep `MCP`, `session-sql`, `todo`. |
| P1 | context usage percent/tokens | Best effort | `ctx.getContextUsage()` | Preserve if public API enough. |
| P1 | token/cost/cached usage | Best effort | session/model usage APIs if public | Do not block v1 if exact built-in footer parity is unavailable. |
| P2 | provider availability count | Optional | `footerData.getAvailableProviderCount()` | Useful but not central. |

## Proposed Footer Layout

Target: same information density as current footer, with a Peacock background behind each line.

```text
<bg> ~/pi-hacking/pij (main)                                                                                                                           </bg>
<bg> ↑390k ↓16k R7.2M $0.000 (sub) 18.6%/1.1M (auto)                                                   (github-copilot) gpt-5.5 • medium </bg>
<bg> MCP: 1/2 servers  session-sql: ready  todo: 3 open                                                                                               </bg>
```

### Segment Model

```typescript
interface PeacockFooterSnapshot {
  readonly colorHex: string;
  readonly foregroundHex: string;
  readonly cwdLabel: string;
  readonly branchLabel?: string;
  readonly usageLabel?: string;
  readonly contextLabel?: string;
  readonly providerLabel?: string;
  readonly modelLabel?: string;
  readonly thinkingLabel?: string;
  readonly statuses: readonly PeacockStatusSegment[];
}

interface PeacockStatusSegment {
  readonly key: string;
  readonly text: string;
}
```

### Line Contract

| Line | Left Segment | Right Segment | Required? | Width Behavior |
|------|--------------|---------------|-----------|----------------|
| 1 | `cwdLabel (branch)` | empty or session name | Yes | Left truncates with ellipsis if needed. |
| 2 | usage/context labels | provider/model/thinking | Yes if data available | Left and right fit with spacer; right preserved first. |
| 3 | extension statuses | empty | Yes if statuses exist | Join statuses; truncate as needed. |

If there are no extension statuses, line 3 may be omitted unless `alwaysShowStatusLine` is configured.

## Width and Truncation Rules

1. Every rendered line must have visible width `<= width`.
2. Background must fill to exactly the visible width where feasible.
3. ANSI escape sequences must not be counted as visible width.
4. Use `visibleWidth()` and `truncateToWidth()` from `@earendil-works/pi-tui`.
5. Prefer preserving the right provider/model segment over verbose usage text.
6. At very narrow widths, render only:

```text
<bg> pij (main) </bg>
<bg> gpt-5.5 </bg>
<bg> todo: 3 </bg>
```

## Color Rules

### Background

Use the active Peacock color as a full-line background:

```ts
const bg = `\x1b[48;2;${r};${g};${b}m`;
const fg = `\x1b[38;2;${fr};${fg};${fb}m`;
const reset = "\x1b[0m";
```

If raw truecolor is not accepted for v1, use a theme-token fallback or colored block glyphs, but footer mode’s goal remains full-background coverage.

### Foreground

Choose readable foreground from contrast:

- dark foreground default: `#15202b`
- light foreground default: `#e7e7e7`
- compute relative luminance/contrast in the pi-free store or UI helper

## Command Contract

Footer mode should be explicit:

```text
/peacock surface footer
/peacock footer on
/peacock footer off
/peacock off
```

`/peacock off` must clear all surfaces, including footer mode.

`/peacock status --json` example:

```json
{
  "enabled": true,
  "surface": "footer",
  "placement": "bottom",
  "preset": "reactBlue",
  "hex": "#61dafb",
  "footer": {
    "lines": 3,
    "preservesStatuses": true,
    "preservesBranch": true,
    "usageParity": "best-effort"
  }
}
```

## Implementation Sketch

```typescript
function installFooter(ctx: ExtensionContext, snapshot: PeacockSnapshot): void {
  ctx.ui.setFooter((tui, theme, footerData) => {
    const disposeBranch = footerData.onBranchChange(() => tui.requestRender());

    return {
      dispose: disposeBranch,
      invalidate() {},
      render(width: number): string[] {
        const footerSnapshot = buildFooterSnapshot({
          cwd: ctx.cwd,
          model: ctx.model,
          contextUsage: ctx.getContextUsage(),
          branch: footerData.getGitBranch(),
          statuses: Array.from(footerData.getExtensionStatuses()),
          color: snapshot.color,
        });
        return renderPeacockFooter(footerSnapshot, width);
      },
    };
  });
}
```

Potential issue: captured `ctx.model` may need refreshing on `model_select`/`thinking_level_select`. If stale, call `refreshPeacockChrome(ctx)` from those events.

## Coexistence Rules

### Existing extension statuses

Must render all non-empty statuses:

```text
MCP: 1/2 servers  session-sql: ready  todo: 3 open
```

Sort by key for deterministic output, matching built-in footer behavior where practical.

### Below-editor widgets

Footer mode should not add an additional bottom widget by default. Avoid double-bottom chrome:

- `surface: widget` → top/bottom widgets + built-in footer.
- `surface: footer` → optional top widget + Peacock footer; no bottom widget unless explicitly configured.

### Header/top bar

Footer mode does not imply header replacement. Top bar remains a separate `topEnabled` or `headerEnabled` setting.

## Testing Contract

### Unit tests

- `renderPeacockFooter()` fills/truncates width safely.
- Statuses are sorted and included.
- Right model segment is preserved under width pressure.
- Foreground contrast picks light/dark correctly.
- Disable clears footer state.

### Smoke tests

Use stable text anchors:

```text
/peacock surface footer
/peacock reactBlue
```

Expect:

- `Peacock: React Blue` or `PEACOCK React Blue` visible.
- `(main)` or branch text still visible where deterministic.
- `session-sql: ready` remains visible if loaded.
- `/peacock off` clears Peacock anchor and restores built-in footer.

Do **not** assert ANSI background bytes in smoke unless the driver grows explicit ANSI capture support.

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Agent must guess how much footer to preserve. | P0/P1/P2 preservation tiers are explicit. |
| Review | Reviewer manually compares against current footer. | Segment table defines required behavior. |
| Testing | Smoke may assert colors or row numbers. | Smoke asserts stable text + unit tests check rendering. |
| UX discussion | “Bottom area” is ambiguous. | It specifically means Pi's current footer/status area. |

## Validation / Acceptance

This workshop reaches its target proof level when:

- Footer mode is accepted as an explicit target surface.
- P0 preservation segments are agreed.
- Implementation plan includes a fallback safe mode.
- Tests cover rendering width/status preservation.

## Open Questions

### Q1: Do we need exact usage/token parity with the built-in footer?

**OPEN**: The user showed token/cost/context data. Public APIs may expose enough for good parity, but exact built-in footer internals may not be public. Proposed answer: P0 preserve model/branch/statuses; P1 best-effort usage parity in v1.

### Q2: Should footer mode be default in first implementation?

**OPEN / UPDATED BY USER INPUT**: Research originally recommended widget mode first. User specifically wants full bottom background. A reasonable compromise is:

1. Implement store/palette/status plus safe widget mode first if needed for quick install proof.
2. Make footer mode the main workshoped product target for v1 acceptance.

### Q3: Should the Peacock footer be one line or preserve multiple footer lines?

**PROPOSED**: Preserve multiple lines if the built-in footer currently uses them. Full bottom area coloring means all footer lines should share the background.

## Quick Reference

```text
Footer mode goal:
  color the entire existing bottom footer/status area
  preserve cwd/branch, model/thinking, extension statuses
  best-effort usage/context stats
  clear with setFooter(undefined)

Implementation APIs:
  ctx.ui.setFooter(factory)
  footerData.getGitBranch()
  footerData.getExtensionStatuses()
  ctx.model
  ctx.getContextUsage()
```
