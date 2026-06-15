# Workshop: Validation and Smoke Strategy

**Type**: Testing / Proof Strategy
**Plan**: 013-pi-peacock
**Spec**: Not yet created; source research is [`../research-dossier.md`](../research-dossier.md)
**Created**: 2026-05-27T00:00:00Z
**Status**: Draft

**Value Thesis**: This workshop prevents visual overclaiming by defining durable evidence for a UI/color extension: pure tests prove color/state/render contracts, and smoke proves Pi loads, paints visible anchors, survives reload, and restores the footer.
**Target Proof Level**: Implementation Ready
**Current Proof Level**: Implementation Ready

**Selected Value Axes**:
- **Proof Quality**: Color/UI claims need evidence beyond “it looked right once.”
- **Operational Reliability**: Footer/status changes can break smoke readiness and daily operator visibility.
- **Review Compression**: Reviewers need a short validation matrix for what was proven and what was not.
- **Learning Compounding**: Prior smoke/reload/status gotchas are encoded into the validation path.

**Related Documents**:
- [`../research-dossier.md`](../research-dossier.md)
- [`001-terminal-chrome-surface-and-layout.md`](./001-terminal-chrome-surface-and-layout.md)
- [`002-bottom-status-bar-contract.md`](./002-bottom-status-bar-contract.md)
- [`003-color-palette-state-and-command-contract.md`](./003-color-palette-state-and-command-contract.md)

**Domain Context**:
- **Primary Domain**: `extension-authoring-harness`
- **Related Domains**: `agent-tooling-interface`

---

## Purpose

Define how to validate `pi-peacock` without brittle screenshots or ANSI assumptions. This workshop turns visual UI requirements into testable store, renderer, command, and smoke evidence.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Write the minimum test files for `pi-peacock`.
- Build a smoke scenario using current Driver SDK `Step` shape.
- Know which assertions belong in unit tests vs smoke.
- Avoid known footer/status/reload gotchas.

## Key Questions Addressed

- How do we prove a colored footer without asserting screenshots?
- What should smoke assert if ANSI color is stripped by tmux capture?
- How do we validate footer replacement does not hide statuses?
- Which commands gate “ready to implement” vs “ready to ship”?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | The validation plan can be directly encoded during Phase 1/2. |
| Primary Value Axis | Proof Quality | Visual features often fail from insufficient evidence. |
| Supporting Value Axes | Operational Reliability, Review Compression, Learning Compounding | Smoke and self-check must stay stable and informative. |
| Downstream Loop Improved | Implementation + Code Review + Merge | Agents can prove behavior and reviewers can check acceptance objectively. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Store test matrix | This workshop | Presets/parser/replay | Ready |
| UI render width tests | This workshop | Full-width bars safe | Ready |
| Smoke sequence | This workshop | Pi load/reload/disable | Ready |
| Prior smoke gotchas | Research PL-03..PL-08 | Avoid brittle failures | Ready |

## Testing Layers

| Layer | Purpose | What to Assert | What Not to Assert |
|-------|---------|----------------|--------------------|
| Store unit tests | Pure color/state/parser/replay | values, tagged results, latest valid state | Pi UI behavior |
| UI/render tests | Width-safe line generation | visible width, labels, status inclusion, ANSI encoder | tmux row positions |
| Index tests (optional) | Wiring/cleanup ordering | calls to setStatus/setWidget/setFooter(undefined), append-before-mutate | actual TUI rendering |
| Smoke | Live Pi integration | command registration, visible anchors, reload persistence, disable restore | raw ANSI bytes/screenshots |
| Self-check | Full repo gate | typecheck/lint/test/smoke/pkg audit/snapshots | diagnosing UI design |

## Minimum Test Files

```text
.pi/extensions/pi-peacock/
├── store.test.ts       # required
├── ui.test.ts          # recommended for footer/widget rendering
├── index.test.ts       # optional if footer cleanup/wiring grows complex
└── smoke.ts            # required once extension exists
```

## Store Test Contract

### Presets

- All nine Peacock preset keys exist.
- Hex values exactly match upstream.
- Labels exactly match contract.
- Aliases resolve as expected.

### Color parsing

- `#61dafb` normalizes to `#61dafb`.
- `61DAFB` normalizes to `#61dafb` if no-hash accepted.
- invalid hex returns tagged error.
- CSS formats return tagged error in v1.
- control characters are rejected.

### Command parsing

- Empty input → help/status.
- `list`, `off`, `reset`, `status --json` parse correctly.
- `surface widget|footer` parse correctly.
- `placement top|bottom|both` parse correctly.
- Unknown verbs return tagged error.

### Replay/persistence

- Empty entries → defaults disabled.
- Latest valid settings wins.
- Malformed data ignored.
- Reset entry disables/defaults.
- Append-before-mutate ordering is testable via fake recorder if store mutators own append.

## UI Render Test Contract

### Widget bars

Inputs:

```typescript
renderPeacockBar({ label: "React Blue", hex: "#61dafb" }, width)
```

Assertions:

- visible width `<= width` for widths `1`, `2`, `10`, `20`, `80`, `160`.
- includes stable anchor at reasonable widths: `PEACOCK` and `React Blue`.
- no embedded newline in a single bar line.
- disabled snapshot returns no lines or clear instruction.

### Footer mode

Inputs:

```typescript
renderPeacockFooter(snapshot, width)
```

Assertions:

- every line visible width `<= width`.
- all P0 statuses included at sufficient width.
- extension statuses are sorted deterministically.
- provider/model right segment survives before verbose usage under width pressure.
- background encoder wraps/pads full width in pure encoder tests.
- reset sequence is appended when raw ANSI is used.

## Smoke Strategy

### Principles

1. Use stable visible text anchors.
2. Do not assert raw ANSI color in smoke.
3. Do not assert exact terminal rows.
4. Keep terminal width wide enough to reduce wrapping.
5. Disable animation; v1 should have no animation.
6. Include `/reload` persistence.
7. Include `/peacock off` cleanup.

### Recommended Scenario

```typescript
import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
  name: "pi-peacock",
  cols: 140,
  rows: 40,
  steps: [
    {
      kind: "type",
      text: "/peacock status --json",
      press: "Enter",
      expect: /"enabled":\s*false|peacock: disabled/i,
      expectTimeoutMs: 5000,
    },
    {
      kind: "type",
      text: "/peacock reactBlue",
      press: "Enter",
      expect: /React Blue|#61dafb/,
      expectTimeoutMs: 5000,
    },
    {
      kind: "type",
      text: "/peacock surface footer",
      press: "Enter",
      expect: /surface footer|full bottom status/i,
      expectTimeoutMs: 5000,
    },
    {
      kind: "type",
      text: "/peacock status --json",
      press: "Enter",
      expect: /"surface":\s*"footer"/,
      expectTimeoutMs: 5000,
    },
    {
      kind: "type",
      text: "/reload",
      press: "Enter",
      expect: /Reloaded|extensions/i,
      expectTimeoutMs: 30000,
    },
    {
      kind: "type",
      text: "/peacock status --json",
      press: "Enter",
      expect: /"label":\s*"React Blue"/,
      expectTimeoutMs: 5000,
    },
    {
      kind: "type",
      text: "/peacock off",
      press: "Enter",
      expect: /peacock: disabled/i,
      expectTimeoutMs: 5000,
    },
  ],
};

export default scenario;
```

Exact strings can change during implementation, but the scenario shape should follow this pattern.

## Footer Preservation Smoke

Because smoke cannot easily inspect status maps directly, include visible anchors:

- When `session-sql` is loaded, `session-sql: ready` should remain visible in footer mode if possible.
- If status visibility is too environment-dependent, expose `/peacock status --json` field:

```json
{
  "footer": {
    "preservesStatuses": true,
    "lastRenderedStatusCount": 3
  }
}
```

Do not fake preservation in JSON without actually rendering statuses in the footer renderer.

## Validation Commands

### During implementation

```bash
npx vitest run .pi/extensions/pi-peacock/store.test.ts
npx vitest run .pi/extensions/pi-peacock/ui.test.ts
just typecheck
npm run smoke -- pi-peacock
```

### Before declaring complete

```bash
just self-check
```

If `just self-check` fails for unrelated pre-existing dirty-state issues, record exact command output and isolate the blocker. Do not silently claim complete.

## Failure Modes and Diagnostics

| Failure | Likely Cause | Diagnostic | Fix |
|---------|--------------|------------|-----|
| Smoke times out at boot | Custom footer removed expected prompt/footer shape | Run `npm run smoke -- pi-peacock` with footer mode disabled; inspect pane capture | Preserve enough footer shape or adjust smoke after proving idle still works |
| Footer loses todo/session-sql | Renderer ignores `footerData.getExtensionStatuses()` | Unit-test statuses in footer snapshot | Render sorted statuses |
| ANSI breaks width | Counting escape bytes as visible | Add `visibleWidth` tests | Use TUI width helpers |
| `/peacock off` leaves blank footer pill | Used empty string clear | Search for `setStatus(..., "")` | Clear with `undefined` |
| `/reload` loses color | No replay or invalid replay guard | Store replay tests | Append settings and rehydrate on `session_start` |
| Color visible but not testable | No stable text anchor | Smoke cannot assert | Include label/hex text in status or JSON |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Agent decides ad hoc what to test. | Test files and assertions are enumerated. |
| Review | Reviewer relies on screenshots/manual claims. | Reviewer checks unit/smoke matrix. |
| Testing | ANSI/full-screen assertions likely brittle. | Anchors + pure render tests split proof correctly. |
| Merge | Self-check requirements might be forgotten. | `just self-check` is explicit final gate. |

## Validation / Acceptance

This workshop reaches its target proof level when:

- Store, UI, and smoke test scopes are accepted.
- Smoke asserts visible anchors and reload/disable behavior.
- Footer preservation is unit-tested and smoke-observable through text/JSON.
- Final implementation plan includes `just self-check` as mandatory completion gate.

## Open Questions

### Q1: Should smoke require footer mode in Phase 1?

**UPDATED BY USER INPUT / PROPOSED**: Yes if the desired product is full bottom-area background. Still keep widget/status mode unit-tested or available as fallback if footer smoke reveals readiness issues.

### Q2: Should we capture ANSI in smoke?

**PROPOSED**: No for v1. Unit-test ANSI encoder; smoke-test labels and state. If color proof becomes mandatory, extend Driver SDK intentionally rather than embedding brittle raw capture assumptions.

### Q3: Should screenshots be part of validation?

**PROPOSED**: Optional human evidence only, not the automated gate. The harness is tmux text/regex based today.

## Quick Reference

```text
Proof split:
  Store tests: presets, parser, replay
  UI tests: width, statuses, ANSI encoder
  Smoke: /peacock loads, footer mode visible, reload persists, off restores
  Final: just self-check
```
