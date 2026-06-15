# Workshop: Color Palette, State, and Command Contract

**Type**: Data Model / CLI Flow
**Plan**: 013-pi-peacock
**Spec**: Not yet created; source research is [`../research-dossier.md`](../research-dossier.md)
**Created**: 2026-05-27T00:00:00Z
**Status**: Draft

**Value Thesis**: This workshop makes implementation cheaper by turning “Peacock-like colors” into a concrete preset, state, replay, and command contract that can be tested without launching Pi.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Implementation Readiness**: The store, command parser, and replay model should be directly buildable from this document.
- **Proof Quality**: Preset values, parse rules, JSON status, and error cases are explicit and testable.
- **Agent Readiness**: A future implementation agent should not need to re-research VS Code Peacock colors or command grammar.
- **Learning Compounding**: The contract captures prior gotchas: Pi-free store, persist-before-mutate, no hardcoded keybindings, no unvetted dependencies.

**Related Documents**:
- [`../research-dossier.md`](../research-dossier.md)
- [`001-terminal-chrome-surface-and-layout.md`](./001-terminal-chrome-surface-and-layout.md)
- [`002-bottom-status-bar-contract.md`](./002-bottom-status-bar-contract.md)
- Upstream Peacock: `johnpapa/vscode-peacock/src/models/favorites.ts`

**Domain Context**:
- **Primary Domain**: `agent-tooling-interface`
- **Related Domains**: `extension-authoring-harness`, optional `session-work-state`

---

## Purpose

Specify the `pi-peacock` store and command contract: built-in colors, accepted inputs, settings shape, persistence behavior, command outputs, and validation cases.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** for the store/command layer.

They should be able to:

- Implement `store.ts` without Pi imports.
- Write store tests for presets, parser, replay, and render snapshots.
- Wire `/peacock` commands in `index.ts` using tagged store results.
- Keep dependency scope at zero for v1.

## Key Questions Addressed

- Which VS Code Peacock colors do we ship?
- What color input formats are in v1?
- How does state persist across `/reload`?
- What slash commands are required before UI polish?
- What JSON status shape should smoke and future tools consume?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | Store/command work can be built directly from this workshop. |
| Primary Value Axis | Implementation Readiness | The fastest safe path is a tested store with a thin Pi wiring layer. |
| Supporting Value Axes | Proof Quality, Agent Readiness, Learning Compounding | Tests and explicit contracts prevent rework and drift. |
| Downstream Loop Improved | Store implementation + smoke authoring | Presets, parser, replay, and status JSON are no longer ambiguous. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Peacock colors | Research color contract | Preset table | Ready |
| Pij store pattern | AGENTS P1-P10 + templates | Pi-free store design | Ready |
| Prior status clear gotcha | PL-03 | disable/off command | Ready |
| Dependency vetting rules | PL-11 | no new dependencies | Ready |

## Decision Space

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Hex + presets only | Accept `#rrggbb` and known aliases | Simple, no deps, easy tests | Less Peacock input parity | **Selected for v1** |
| Full CSS color parsing | Accept named HTML, RGB, HSL, HSV, alpha | Matches VS Code Peacock | Requires `tinycolor2` or custom parser | Deferred |
| Session custom-entry persistence | Persist settings in Pi session entries | Survives `/reload`; no DB | Session-scoped only | **Selected if commands mutate state** |
| Project file persistence | Write `.pi/peacock.json` or settings | Stable per repo | New file format/migration | Deferred |
| SQLite persistence | Use session SQL | Queryable | Overkill for visual settings | Rejected |

## Built-in Palette Contract

```typescript
export const PEACOCK_PRESETS = {
  angularRed: { label: "Angular Red", hex: "#dd0531", aliases: ["angular", "red"] },
  azureBlue: { label: "Azure Blue", hex: "#007fff", aliases: ["azure", "blue"] },
  javascriptYellow: { label: "JavaScript Yellow", hex: "#f9e64f", aliases: ["javascript", "js", "yellow"] },
  mandalorianBlue: { label: "Mandalorian Blue", hex: "#1857a4", aliases: ["mandalorian", "mando"] },
  nodeGreen: { label: "Node Green", hex: "#215732", aliases: ["node"] },
  reactBlue: { label: "React Blue", hex: "#61dafb", aliases: ["react"] },
  somethingDifferent: { label: "Something Different", hex: "#832561", aliases: ["different", "purple"] },
  svelteOrange: { label: "Svelte Orange", hex: "#ff3d00", aliases: ["svelte", "orange"] },
  vueGreen: { label: "Vue Green", hex: "#42b883", aliases: ["vue", "peacock", "green"] },
} as const;
```

### Rules

1. Hex values are lower-case canonical `#rrggbb` strings.
2. Labels are stable user-facing text.
3. Keys are stable API/status identifiers.
4. Aliases are normalized by lowercasing and removing spaces, hyphens, and underscores.
5. `vueGreen` is also Peacock Green because upstream uses `peacockGreen = #42b883`.

## Accepted Color Inputs in v1

| Input | Example | Accepted? | Output |
|-------|---------|-----------|--------|
| Preset key | `reactBlue` | Yes | React Blue / `#61dafb` |
| Preset label | `React Blue` | Yes | React Blue / `#61dafb` |
| Alias | `react` | Yes | React Blue / `#61dafb` |
| Hex with `#` | `#61dafb` | Yes | Custom / `#61dafb` |
| Hex without `#` | `61dafb` | Optional | Recommend accept and normalize |
| Short hex | `#6df` | No for v1 | tagged error |
| CSS named color | `purple` | No for v1 except preset alias | tagged error |
| RGB/HSL | `rgb(97,218,251)` | No for v1 | tagged error |
| Alpha | `#61dafbcc` | No for v1 | tagged error |
| Escape/control chars | `\x1b[...]` | Never | tagged error |

## State Model

```typescript
export type PeacockSurface = "widget" | "footer";
export type PeacockPlacement = "top" | "bottom" | "both";
export type PeacockColorKind = "preset" | "custom";

export interface PeacockColorSelection {
  readonly kind: PeacockColorKind;
  readonly key?: PeacockPresetKey;
  readonly label: string;
  readonly hex: `#${string}`;
}

export interface PeacockSettings {
  readonly enabled: boolean;
  readonly surface: PeacockSurface;
  readonly placement: PeacockPlacement;
  readonly color: PeacockColorSelection;
  readonly showStatus: boolean;
  readonly footer: PeacockFooterSettings;
}

export interface PeacockFooterSettings {
  readonly preserveStatuses: boolean;
  readonly showCwd: boolean;
  readonly showBranch: boolean;
  readonly showModel: boolean;
  readonly showContext: boolean;
  readonly usageParity: "none" | "best-effort";
}
```

### Defaults

```typescript
export const DEFAULT_PEACOCK_SETTINGS: PeacockSettings = {
  enabled: false,
  surface: "widget",
  placement: "both",
  color: {
    kind: "preset",
    key: "vueGreen",
    label: "Vue Green",
    hex: "#42b883",
  },
  showStatus: true,
  footer: {
    preserveStatuses: true,
    showCwd: true,
    showBranch: true,
    showModel: true,
    showContext: true,
    usageParity: "best-effort",
  },
};
```

## Custom Entry Persistence

### Entry Tags

```typescript
export const ENTRY_PREFIX = "pi-peacock:";
export const ENTRY_SETTINGS = `${ENTRY_PREFIX}settings`;
export const ENTRY_RESET = `${ENTRY_PREFIX}reset`;
```

### Replay Rules

1. Start from `DEFAULT_PEACOCK_SETTINGS`.
2. Ignore entries where `entry.type !== "custom"`.
3. Apply latest structurally valid `ENTRY_SETTINGS` data.
4. `ENTRY_RESET` returns to defaults/disabled.
5. Ignore malformed data; do not throw from replay.
6. Commands must append before mutating memory.

### Structural Replay Type

```typescript
export interface ReplayableEntry {
  readonly type: string;
  readonly customType?: string;
  readonly data?: unknown;
}
```

## Command Grammar

### Command Summary

| Command | Purpose |
|---------|---------|
| `/peacock` | Show help/current status. |
| `/peacock list` | List built-in presets. |
| `/peacock <preset-or-hex>` | Enable and apply color. |
| `/peacock preset <preset>` | Enable and apply preset. |
| `/peacock color <#rrggbb>` | Enable and apply custom hex. |
| `/peacock surface widget` | Use top/bottom widgets. |
| `/peacock surface footer` | Use full bottom footer mode. |
| `/peacock placement top|bottom|both` | Choose widget placement. |
| `/peacock off` | Disable and clear active chrome. |
| `/peacock reset` | Reset to defaults and disable. |
| `/peacock status --json` | Emit machine-readable state for smoke. |

### Parser Union

```typescript
export type ParsedPeacockCommand =
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "apply"; input: string }
  | { kind: "setSurface"; surface: PeacockSurface }
  | { kind: "setPlacement"; placement: PeacockPlacement }
  | { kind: "off" }
  | { kind: "reset" }
  | { kind: "status"; json: boolean };
```

## Command Examples

### Apply a preset

```text
/peacock reactBlue
```

Output:

```text
peacock: enabled React Blue (#61dafb) on widget/both
```

### Apply footer mode

```text
/peacock surface footer
```

Output:

```text
peacock: surface footer — full bottom status bar background enabled
```

### List presets

```text
/peacock list
```

Output:

```text
peacock presets:
- angularRed — Angular Red (#dd0531)
- azureBlue — Azure Blue (#007fff)
- javascriptYellow — JavaScript Yellow (#f9e64f)
- mandalorianBlue — Mandalorian Blue (#1857a4)
- nodeGreen — Node Green (#215732)
- reactBlue — React Blue (#61dafb)
- somethingDifferent — Something Different (#832561)
- svelteOrange — Svelte Orange (#ff3d00)
- vueGreen — Vue Green / Peacock Green (#42b883)
```

### Status JSON

```text
/peacock status --json
```

Output:

```json
{
  "enabled": true,
  "surface": "footer",
  "placement": "both",
  "color": {
    "kind": "preset",
    "key": "reactBlue",
    "label": "React Blue",
    "hex": "#61dafb"
  },
  "showStatus": true,
  "footer": {
    "preserveStatuses": true,
    "showCwd": true,
    "showBranch": true,
    "showModel": true,
    "showContext": true,
    "usageParity": "best-effort"
  }
}
```

### Disable

```text
/peacock off
```

Output:

```text
peacock: disabled
```

Effects:

- append disabled settings or reset entry
- clear status with `undefined`
- clear widgets with `undefined`
- clear footer with `undefined` if active

## Error Codes

| Code | Message | Cause | Recovery |
|------|---------|-------|----------|
| `unknown_command` | `peacock: unknown command` | Parser did not recognize verb | Run `/peacock` for help |
| `unknown_color` | `peacock: unknown color <input>` | Not preset/alias/hex | Run `/peacock list` |
| `invalid_hex` | `peacock: invalid hex color` | Bad custom hex | Use `#rrggbb` |
| `unsupported_surface` | `peacock: unsupported surface` | Not `widget` or `footer` | Use `/peacock surface widget` |
| `unsupported_placement` | `peacock: unsupported placement` | Not `top`, `bottom`, `both` | Use `/peacock placement both` |
| `ui_unavailable` | `peacock: UI unavailable in this mode` | print/json mode | State can persist; no render |

## Store Result Contract

```typescript
export type PeacockStoreResult<T> =
  | { ok: true; value: T; message: string }
  | { ok: false; code: PeacockErrorCode; message: string };
```

No store method should throw for user input or malformed replay data.

## Render Snapshot Contract

```typescript
export interface PeacockSnapshot {
  readonly enabled: boolean;
  readonly statusText?: string;
  readonly color: PeacockColorSelection;
  readonly surface: PeacockSurface;
  readonly placement: PeacockPlacement;
  readonly topEnabled: boolean;
  readonly bottomEnabled: boolean;
  readonly footerEnabled: boolean;
}
```

`index.ts` consumes this snapshot and chooses UI calls.

## Test Scenarios

### Preset resolution

| Input | Expected |
|-------|----------|
| `reactBlue` | React Blue / `#61dafb` |
| `React Blue` | React Blue / `#61dafb` |
| `react` | React Blue / `#61dafb` |
| `peacock` | Vue Green / `#42b883` |
| `#ABCDEF` | Custom / `#abcdef` |
| `abcdef` | Custom / `#abcdef` if optional no-hash accepted |
| `rgb(1,2,3)` | `unsupported_color_format` or `unknown_color` |

### Command parsing

| Command | Parsed Kind |
|---------|-------------|
| `` | `help` |
| `list` | `list` |
| `reactBlue` | `apply` |
| `preset reactBlue` | `apply` |
| `color #61dafb` | `apply` |
| `surface footer` | `setSurface` |
| `placement bottom` | `setPlacement` |
| `status --json` | `status(json=true)` |
| `off` | `off` |
| `reset` | `reset` |

### Replay

| Entries | Expected |
|---------|----------|
| none | defaults disabled |
| valid settings | latest settings applied |
| valid then malformed | valid remains if malformed ignored, or latest valid wins |
| reset after settings | defaults disabled |
| unrelated custom entries | ignored |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Agent must invent commands and state shape. | Commands, types, and outputs are specified. |
| Review | Reviewer checks color values manually. | Preset table and tests establish values. |
| Testing | Smoke has no JSON/state anchor. | `/peacock status --json` provides deterministic assertions. |
| Agent execution | Ambiguous dependency choice (`tinycolor2` or not). | v1 is zero-dependency hex/preset only. |

## Validation / Acceptance

This workshop reaches its target proof level when:

- Store tests can be directly derived from the tables above.
- The command grammar covers enable/list/status/off/reset/surface.
- Preset colors match upstream Peacock values.
- Persistence is append-only and replay-safe.
- No third-party color dependency is required for v1.

## Open Questions

### Q1: Should no-hash hex be accepted?

**PROPOSED**: Yes, normalize `61dafb` to `#61dafb`. Peacock accepts optional `#`, and this is easy without a dependency.

### Q2: Should state be session-only or project-persistent?

**OPEN**: Research recommends custom session entries for reload/resume. For Peacock’s workspace identity goal, project persistence may be more natural. Proposed implementation order:

1. Session persistence first for `/reload` proof.
2. Workshop/spec project persistence separately if needed.

### Q3: Should `/peacock` default to enabling Vue/Peacock Green?

**PROPOSED**: `/peacock` with no args shows help/status, not mutate state. Use `/peacock peacock` or `/peacock vueGreen` to enable the default color.

## Quick Reference

```text
Minimum v1 command set:
  /peacock
  /peacock list
  /peacock reactBlue
  /peacock surface footer
  /peacock status --json
  /peacock off

Minimum store tests:
  presets exact
  color parse/normalize
  command parse
  replay latest valid
  off/reset clear state
```
