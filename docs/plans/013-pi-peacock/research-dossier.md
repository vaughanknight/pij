# Research Report: pi-peacock terminal chrome extension

**Generated**: 2026-05-27T00:00:00Z
**Research Query**: "Add a new Pi extension named `pi-peacock` that applies VS Code Peacock-inspired colors to the top and bottom of Pi's terminal UI, especially the bottom status bar, without modifying Pi core."
**Mode**: Pre-Plan / Plan-Associated
**Location**: `docs/plans/013-pi-peacock/research-dossier.md`
**FlowSpace**: Available
**Subagents**: 8 focused research lenses completed
**Findings**: 86 raw findings synthesized

## Executive Summary

### What It Does

`pi-peacock` should be a normal pij Pi extension that gives a Pi session/workspace a recognizable identity color, inspired by VS Code Peacock. In terminal terms, the feasible v1 surfaces are Pi-rendered top/bottom bars or status chrome through public extension APIs such as `ctx.ui.setWidget`, `ctx.ui.setStatus`, `ctx.ui.setFooter`, and optionally `ctx.ui.setHeader` / `ctx.ui.setEditorComponent`.

### Business Purpose

The purpose is quick visual orientation: when multiple Pi sessions or terminal windows are open, the user should immediately recognize which workspace/session they are in. This mirrors VS Code Peacock's product thesis but adapts it to a terminal layout where top/bottom horizontal chrome makes more sense than all-four-edge borders.

### Key Insights

1. **No Pi core change is needed for v1.** Pi already exposes extension UI hooks for status, widgets, footer replacement, header replacement, and editor replacement.
2. **Bottom status bar integration is possible but high-risk if done by replacing the footer.** `setFooter()` can implement a Peacock-colored status bar, but it replaces Pi's built-in footer, so it must preserve core footer data and other extension statuses.
3. **The safest first implementation is a small extension proof:** scaffold `pi-peacock`, add palette/state store tests, render a top color widget and a bottom status/color strip, and smoke-test install/reload/disable before workshopping custom footer UI.

### Quick Stats

- **Candidate extension files**: 5-6 (`index.ts`, `store.ts`, `ui.ts`, `store.test.ts`, `ui.test.ts`, `smoke.ts`, optional `AGENTS.md`)
- **Primary Pi APIs**: `setStatus`, `setWidget`, `setFooter`, `setHeader`, `setEditorComponent`, `setTitle`
- **External dependencies required for v1**: 0 recommended
- **VS Code Peacock preset colors**: 9 built-in/recommended colors
- **Complexity**: Medium; mostly UI/layout risk, not algorithmic risk
- **Prior Learnings**: 15 relevant discoveries surfaced
- **Domains**: Existing `agent-tooling-interface` + `extension-authoring-harness`; no new domain needed

## Agent Harness Status

### Engineering Harness Substrate

Substrate is present and mature enough for this work.

- **Boot**: `npm install` / `just install`
- **Interact**: `pi` from repo root; project-local extensions autoload from `.pi/extensions`
- **Observe**: `just self-check` = typecheck → lint → test → smoke → package audit → snapshots check
- **Targeted smoke**: `npm run smoke -- pi-peacock` after the extension exists
- **Maturity**: L2 per `docs/project-rules/harness.md`

### Agent Harness Governance

- Agent harness doc exists at `docs/project-rules/agent-harness.md`.
- Legacy engineering harness filename `harness.md` is still in use; consider migrating to `engineering-harness.md` in a separate housekeeping task, but do not do that as part of this read-only research.
- Companion/minih review is available for later implementation phases, but not required for this research step.

## How Pi Extension Chrome Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|---|---|---|---|
| Extension factory | Pi extension entry | `.pi/extensions/<name>/index.ts` | Registers commands, tools, lifecycle handlers, UI hooks |
| `session_start` | Lifecycle event | Pi docs / extension template | Rehydrate state and repaint UI on startup/reload/new/resume/fork |
| `session_shutdown` | Lifecycle event | Pi docs | Clear status/widgets/footer/header/editor overrides and dispose timers |
| Slash command | User API | `pi.registerCommand("peacock", ...)` | Change colors/mode, show status, disable/reset |
| Optional tool | Model API | `pi.registerTool(...)` | Bounded LLM-callable color/status control, if desired |

### Core Execution Flow

1. **Scaffold extension**
   - Command: `just new pi-peacock`
   - Creates `.pi/extensions/pi-peacock/{index.ts,store.ts,store.test.ts,smoke.ts,AGENTS.md}` from templates.

2. **Store owns pure state**
   - `store.ts` should hold presets, normalized color settings, command parser, replay guards, and render snapshots.
   - It must not import `@earendil-works/*` packages.

3. **Index wires Pi APIs**
   - `index.ts` constructs the store with injected `appendEntry`.
   - One `session_start` handler rehydrates and calls `refreshPeacockChrome(ctx)`.
   - Commands mutate store, persist first, then repaint UI.

4. **Render top/bottom chrome**
   - Default v1 path: `ctx.ui.setWidget("pi-peacock-top", ...)` and `ctx.ui.setWidget("pi-peacock-bottom", ..., { placement: "belowEditor" })` plus `ctx.ui.setStatus("pi-peacock", ...)`.
   - Advanced path: `ctx.ui.setFooter(...)` for a true bottom status bar replacement that preserves footer data.

5. **Cleanup**
   - Disable/shutdown must clear with `undefined`, not empty strings.
   - Clear: `setStatus(key, undefined)`, `setWidget(key, undefined)`, `setFooter(undefined)`, `setHeader(undefined)`, `setEditorComponent(undefined)` as applicable.

### Data Flow

```mermaid
graph LR
    A[/peacock command] --> B[parse command in store]
    B --> C[validate preset or hex]
    C --> D[persist settings entry]
    D --> E[mutate store snapshot]
    E --> F[render snapshot]
    F --> G[ctx.ui.setStatus / setWidget / setFooter]
```

### State Management

Recommended v1 state is lightweight and event-sourced through custom session entries if user commands should survive `/reload` and resume. SQLite is unnecessary.

- Stateless/default-only mode is possible for the very first spike.
- If commands mutate color/mode, use custom entries such as `pi-peacock:settings`.
- Rehydrate by scanning `ctx.sessionManager.getEntries()` in one `session_start` handler.
- Persist before mutating memory per pij P9.

## Architecture & Design

### Component Map

#### Core Components

- **`store.ts`**
  - Owns preset constants, color parsing, contrast/foreground selection, command parsing, settings replay.
  - Pi-free and covered by unit tests.

- **`ui.ts`**
  - Owns width-safe line/bar rendering helpers and optional TUI `Component` classes.
  - May import `@earendil-works/pi-tui` if needed; store must not import it.

- **`index.ts`**
  - Owns Pi extension lifecycle, commands, optional tools, and all `ctx.ui.*` calls.

- **`smoke.ts`**
  - Proves command registration, visible text anchor, `/reload` persistence, and disable cleanup.

### Design Patterns Identified

1. **T2 extension layout**
   - Existing pij default: `index.ts` for wiring, `store.ts` for pure logic, tests target store.

2. **Event-sourced settings**
   - Store persists `pi-peacock:settings` entries before in-memory mutation, then replays latest valid entry on session start.

3. **Presentation projection**
   - Store produces a render snapshot like `{ enabled, label, hex, foregroundHex, topLine, bottomLine }`; UI wiring decides whether to project it as status, widgets, footer, or header.

4. **Reversible UI takeover**
   - Footer/header/editor replacement must be opt-in and must restore built-in UI with `undefined` on disable.

### System Boundaries

- **Inside pi-peacock**: color settings, Peacock presets, rendering policy, command grammar.
- **Outside pi-peacock**: Pi core TUI implementation, terminal emulator window chrome, existing extension statuses (`todo`, `session-sql`, `minih-workbench`, `ralph-loop`).
- **Must not cross**: no modification of pi-mono or installed Pi binary without explicit user approval.

## Dependencies & Integration

### What This Depends On

| Dependency | Type | Purpose | Risk if Changed |
|---|---|---|---|
| Pi `ExtensionAPI` | Runtime API | Register lifecycle, commands, optional tools | High |
| `ctx.ui.setStatus` | UI API | Cooperative footer/status text | Low |
| `ctx.ui.setWidget` | UI API | Safe top/bottom bars near editor | Medium |
| `ctx.ui.setFooter` | UI API | True bottom status bar replacement | High |
| `ctx.ui.setHeader` | UI API | Top banner/header replacement | Medium |
| `@earendil-works/pi-tui` width helpers | UI utility | Width-safe rendering | Medium |
| Harness Driver SDK | Test harness | Deterministic smoke | Medium |

### External Dependencies

| Library | Version | Purpose | Recommendation |
|---|---:|---|---|
| `tinycolor2` | `1.6.0` upstream Peacock uses it | broad CSS color parsing/lighten/darken/readability | Avoid for v1; implement simple hex/preset helpers locally |

### What Depends on This

Initially nothing should depend on `pi-peacock`. If it replaces the footer, it becomes responsible for not hiding status text produced by other extensions.

Directly affected existing status producers:

- `session-sql` status
- `todo` status and below-editor strip
- `ralph-loop` iteration status
- `minih-workbench` selected/viewing status

## Peacock Color Contract

Built-in/recommended colors from VS Code Peacock:

| Key | Name | Hex |
|---|---|---:|
| `angularRed` | Angular Red | `#dd0531` |
| `azureBlue` | Azure Blue | `#007fff` |
| `javascriptYellow` | JavaScript Yellow | `#f9e64f` |
| `mandalorianBlue` | Mandalorian Blue | `#1857a4` |
| `nodeGreen` | Node Green | `#215732` |
| `reactBlue` | React Blue | `#61dafb` |
| `somethingDifferent` | Something Different | `#832561` |
| `svelteOrange` | Svelte Orange | `#ff3d00` |
| `vueGreen` | Vue Green / Peacock Green | `#42b883` |

Suggested initial validation:

- Accept stable keys (`reactBlue`), labels (`React Blue`), common shortcuts (`react`), and `#rrggbb`.
- Reject arbitrary escape/control strings.
- Defer broad CSS color formats (`rgb(...)`, `hsl(...)`, named HTML colors) unless we decide to add `tinycolor2` or equivalent.

## Quality & Testing

### Current Test Coverage Pattern

Existing pij extensions use:

- Store tests for pure behavior.
- Optional UI tests for width-safe render components.
- Smoke tests for command registration and integration through live Pi/tmux.
- Final `just self-check` before completion.

### Recommended Test Strategy

| Area | Unit Test | UI Test | Smoke |
|---|---|---|---|
| Presets | exact names/hexes | label rendering | `/peacock list` |
| Color parsing | valid/invalid hex + aliases | no ANSI injection | `/peacock reactBlue` |
| Contrast | foreground for light/dark colors | visible width safe | status JSON |
| Persistence | replay latest valid settings | restored snapshot | set → `/reload` → status |
| Cleanup | disabled state | empty/no-op render | `/peacock off` clears anchor |
| Footer mode | snapshot includes statuses | width/truncate | optional advanced smoke |

### Known Issues & Technical Debt Risks

| Issue | Severity | Location | Impact |
|---|---|---|---|
| `setFooter()` replaces built-in footer | High | Pi UI API | Can hide model/tokens/statuses unless reimplemented |
| ANSI color smoke is brittle | Medium | tmux smoke | Prefer visible anchors over escape-byte assertions |
| `setStatus(key, "")` does not clear | Medium | Pi status map | Use `undefined` only |
| Editor replacement can conflict | Medium | `setEditorComponent` | Avoid as default; keep advanced/experimental |
| Terminal emulator chrome color unavailable | Medium | external terminal | Pi extension can color Pi-rendered UI, not OS/titlebar background |

## Modification Considerations

### ✅ Safe to Modify / Implement First

1. **Pure preset/color store**
   - Low risk and easily tested.
2. **`/peacock status/list/set/off` command**
   - Reversible, deterministic, smoke-friendly.
3. **Status pill via `setStatus`**
   - Cooperative with built-in footer.
4. **Top/bottom widget bars**
   - Low/moderate risk; does not replace core footer.

### ⚠️ Modify with Caution

1. **Custom footer mode**
   - Risk: hides built-in footer and other statuses.
   - Mitigation: explicitly render `footerData.getExtensionStatuses()` and core data.
2. **Custom header mode**
   - Risk: replaces startup header/keybinding hints.
   - Mitigation: opt-in and reversible.
3. **Raw ANSI truecolor rendering**
   - Risk: width/truncation and terminal compatibility.
   - Mitigation: local encoder tests, `visibleWidth`, `truncateToWidth`, reset sequences.

### 🚫 Danger Zones

1. **Pi core patches**
   - Forbidden without explicit approval and unnecessary for v1.
2. **Hardcoded keybindings**
   - Violates project rules; use named defaults if shortcuts are added.
3. **New unvetted dependencies**
   - Avoid initially; if needed, use normal npm dependency review or `just pkg add` for Pi packages.

## Prior Learnings

**Compound activity**: no `docs/compound` directory is present in this checkout; compound-retro scan skipped.

### PL-01: Pi exposes UI chrome primitives

- **Source**: `docs/plans/001-pi-extensions/research-dossier.md`, `findings/01-extension-api.md`
- **Insight**: `setStatus`, `setWidget`, `setFooter`, `setHeader`, and `custom()` already exist.
- **Action**: Try public hooks before inventing lower-level terminal rendering.

### PL-02: Below-editor widgets are proven always-visible status UI

- **Source**: Plan 010 todo-strip workshop and retros.
- **Insight**: `setWidget(..., { placement: "belowEditor" })` gives persistent, non-focused UI with stable smoke anchors.
- **Action**: Use widget bars for the first safe slice unless bottom footer replacement is specifically approved.

### PL-03: Clear statuses with `undefined`

- **Source**: Plan 004 and Plan 010 findings.
- **Insight**: `setStatus(key, "")` leaves an empty footer pill.
- **Action**: Always clear with `undefined`.

### PL-04: Footer/status chrome can race smoke readiness

- **Source**: session-sql retro and Plan 006 execution log.
- **Insight**: Extension status/footer changes affected Driver SDK idle detection in the past.
- **Action**: Keep smoke anchors stable and run targeted smoke before broad self-check.

### PL-05: One `session_start` handler repaints all chrome states

- **Source**: AGENTS P10 and extension workshops.
- **Action**: Centralize `refreshPeacockChrome(ctx)`.

### PL-06: Treat `/reload` as terminal

- **Source**: hot reload workshop.
- **Action**: If a Peacock command triggers reload, `await ctx.reload(); return;`.

### PL-07: Test visual chrome with stable anchors, not screenshots

- **Source**: todo-strip validation notes.
- **Action**: Unit-test color/width; smoke-test visible labels.

### PL-08: Use current Driver SDK scenario shape

- **Source**: session-sql retro.
- **Action**: Use discriminated `Step` unions from `harness/driver/index.js`.

### PL-09: T2 layout and Pi-free store are non-negotiable

- **Source**: AGENTS and prior extension plans.
- **Action**: Scaffold with `just new pi-peacock`.

### PL-10: Keybindings must be configurable

- **Action**: Do not add default shortcuts in v1 unless there is a strong reason.

### PL-11: Package changes must go through vetting

- **Action**: Avoid dependencies; if added, follow pij security protocol.

### PL-12: Keep extension assets scoped

- **Action**: If adding theme/assets later, keep them under `.pi/extensions/pi-peacock/` and document them.

### PL-13: Respect Pi theme/capability model

- **Action**: Gracefully degrade colors and avoid raw terminal assumptions where possible.

### PL-14: Rich TUI is possible, but v1 must be bounded

- **Action**: Static/status chrome first; profile/theme manager later.

### PL-15: Capture durable validation evidence

- **Action**: Do not claim complete until `just self-check` passes or blockers are isolated.

## Domain Context

### Existing Domains Relevant to This Research

| Domain | Relationship | Relevant Contracts | Key Components |
|---|---|---|---|
| `agent-tooling-interface` | Primary owner | Pi-visible commands, tools, UI/status presentation | `/peacock`, status/widgets/footer/header |
| `extension-authoring-harness` | Delivery owner | generator, tests, smoke, self-check | `just new`, `just smoke`, `just self-check` |
| `session-work-state` | Optional | custom entry replay semantics if settings persist | `appendEntry`, `sessionManager.getEntries()` |

### Domain Map Position

`pi-peacock` should sit under `agent-tooling-interface` as a presentation/status UI extension, validated by `extension-authoring-harness`, and optionally consuming session custom-entry semantics for reload persistence.

### Potential Domain Actions

- No new domain for v1.
- If implemented, update `agent-tooling-interface/domain.md` to mention `pi-peacock` presentation/status chrome.
- Reconsider a new `terminal-chrome` or `visual-identity` domain only if multiple extensions start sharing a chrome framework.

## Critical Discoveries

### Critical Finding 01: Footer replacement can hide built-in Pi status

**Impact**: High
**Source**: IA-04, DC-03, IC-06, DB-06
**What**: `ctx.ui.setFooter()` replaces the built-in footer entirely.
**Why It Matters**: User specifically wants bottom status bar customization, but that bottom bar currently carries cwd/branch/session/model/context/token stats and extension statuses.
**Required Action**: Workshop footer design before implementing footer mode; v1 should preserve or explicitly defer built-in footer parity.

### Critical Finding 02: We cannot color the terminal emulator frame from a normal Pi extension

**Impact**: Medium
**Source**: IA-06, external gap notes
**What**: Pi extension APIs can color Pi-rendered TUI content, not the OS terminal window border/tab background.
**Why It Matters**: Scope must be framed as Pi terminal UI chrome, not terminal emulator chrome.
**Required Action**: Use top/bottom rendered bars/status surfaces; document limitation.

### Critical Finding 03: Widget bars are safer than custom footer/header for first proof

**Impact**: High
**Source**: PS-04, IC-04, DE-02, PL-02
**What**: Widgets above/below editor are non-invasive and already validated by todo-strip work.
**Why It Matters**: They let us prove install/render/reload without taking over Pi’s most important footer UI.
**Required Action**: First implementation slice should likely use widgets + status pill, while a workshop designs richer footer mode.

## Proposed Implementation Plan

This is a proposed plan for discussion, not an implementation.

### Phase 0 — UI Workshop Before Footer Takeover

Goal: decide the terminal chrome surface.

Questions to answer:

1. Should v1 default to widget bars, footer replacement, or status-only plus top bar?
2. What information must the bottom bar preserve: cwd, branch, session, model, thinking level, context %, tokens/cost, extension statuses?
3. Is the top bar purely color, or should it include label/session/model text?
4. Should color persist per Pi session, per repo, or via explicit command only?

### Phase 1 — Scaffold and Install Proof

1. Run `just new pi-peacock`.
2. Keep T2 layout and add `ui.ts` if needed.
3. Implement `/peacock` help/status plus fixed default preset.
4. Render minimal top/bottom visible anchors using `setWidget` and `setStatus`.
5. Add smoke proving Pi loads the extension and `/peacock` works.

Acceptance:

- `just typecheck`
- targeted `npx vitest run .pi/extensions/pi-peacock/store.test.ts`
- `npm run smoke -- pi-peacock`

### Phase 2 — Palette and Persistence

1. Add Peacock preset constants with the nine upstream colors.
2. Add `/peacock preset <name|hex>`, `/peacock off`, `/peacock list`, `/peacock status --json`.
3. Persist settings through custom entries, latest-valid-wins replay.
4. Add `/reload` smoke persistence.

Acceptance:

- preset/parse/replay tests
- smoke: set color → reload → status still active → off clears

### Phase 3 — Bottom Status Bar Mode Spike

1. Implement opt-in footer mode with `ctx.ui.setFooter()`.
2. Preserve `footerData.getExtensionStatuses()` and as much core footer context as feasible.
3. Keep widget/status mode as fallback.
4. Add unit tests for footer line rendering and smoke anchors.

Acceptance:

- no hidden todo/session/minih statuses in footer mode
- smoke idle detection still works

### Phase 4 — Polish and Docs

1. Add `docs/how/pi-peacock.md`.
2. Document surfaces, limitations, color presets, and how to disable.
3. Add local `AGENTS.md` for extension-specific constraints if footer/editor mode exists.
4. Run `just self-check` before declaring implementation complete.

## External Research Opportunities

### Research Opportunity 1: Terminal emulator color escape support

**Why Needed**: Pi extension APIs cannot color OS terminal chrome, but some terminal emulators may support proprietary escape sequences for title/tab color.
**Impact on Plan**: This is optional and should not block v1. It could inform a future terminal-specific enhancement.
**Source Findings**: IA-06, Critical Finding 02

**Ready-to-use prompt:**

```text
/deepresearch "Research current terminal emulator support in 2026 for setting tab/window/title/background accent colors via escape sequences from a terminal application. Focus on macOS terminal emulators likely used with Pi (Ghostty, iTerm2, WezTerm, Apple Terminal, VS Code terminal). Determine whether a Node/TypeScript CLI app can safely set and restore per-session tab/title colors without corrupting scrollback or user settings. Include risks, portability, detection strategies, and whether this should be avoided in a Pi extension."
```

**Results location**: `docs/plans/013-pi-peacock/external-research/terminal-emulator-color-escapes.md`

## Appendix: File Inventory

### Core Local Files to Reuse

| File | Purpose |
|---|---|
| `harness/templates/extension/index.ts.template` | starter extension wiring |
| `harness/templates/extension/store.ts.template` | pi-free store pattern |
| `harness/templates/extension/smoke.ts.template` | current Driver SDK smoke shape |
| `.pi/extensions/todo/index.ts` | status + below-editor widget precedent |
| `.pi/extensions/todo/store.ts` | constants/keybindings/store pattern |
| `.pi/extensions/minih-workbench/ui.ts` | width-safe component patterns |
| `docs/project-rules/harness.md` | Boot/Interact/Observe contract |

### Pi Docs / Examples Consulted

| File | Relevance |
|---|---|
| `pi-fork/packages/coding-agent/docs/extensions.md` | extension lifecycle, commands/tools, UI APIs |
| `pi-fork/packages/coding-agent/docs/tui.md` | Component API, setStatus/setWidget/setFooter patterns |
| `pi-fork/packages/coding-agent/docs/packages.md` | distribution/dependency model |
| `examples/extensions/custom-footer.ts` | custom footer replacement pattern |
| `examples/extensions/custom-header.ts` | custom header replacement pattern |
| `examples/extensions/border-status-editor.ts` | editor-border status/chrome pattern |
| `examples/extensions/widget-placement.ts` | above/below widget placement |

### Upstream Peacock References

| File | Relevance |
|---|---|
| `johnpapa/vscode-peacock/README.md` | product thesis |
| `johnpapa/vscode-peacock/docs/guide/README.md` | commands, settings, affected elements, input formats |
| `johnpapa/vscode-peacock/src/models/favorites.ts` | recommended colors |
| `johnpapa/vscode-peacock/src/color-library.ts` | color parsing/manipulation approach |
| `johnpapa/vscode-peacock/package.json` | commands/settings/default favorites |

## Next Steps

1. Review this research and decide the v1 UI surface:
   - **Recommended**: widget top/bottom bars + status pill first.
   - **Workshop**: custom footer/status bar replacement before implementing it.
2. If proceeding, run a design workshop for bottom status bar content and top bar text.
3. Then run `/plan-1b-specify "pi-peacock terminal chrome extension"` or proceed directly to a scoped implementation phase if you want to skip formal spec.

---

**Research Complete**: 2026-05-27T00:00:00Z
**Report Location**: `docs/plans/013-pi-peacock/research-dossier.md`
