# Pi Peacock Terminal Footer Chrome

**Mode**: Simple

## Research Context

📚 Specification incorporates findings from [`research-dossier.md`](./research-dossier.md) and the workshop set in [`workshops/`](./workshops/).

Key incorporated findings:

- Pi can implement this as an extension using `ctx.ui.setFooter()`; no Pi core modification is needed.
- A prototype red footer confirmed the full bottom footer/status area can be background-colored and visually works well.
- Footer replacement is the chosen v1 product surface, but it must preserve core operator information and existing extension statuses.
- Store/palette/state logic must remain Pi-free; Pi/TUI calls stay in `index.ts` / UI wiring.
- Visual validation should use pure render tests plus stable smoke anchors, not raw ANSI screenshots.

## Summary

Build `pi-peacock`, a project-local Pi extension that applies a VS Code Peacock-inspired identity color to Pi’s bottom footer/status area. The extension lets operators quickly identify the active Pi workspace/session while preserving the footer’s existing operational value: cwd/branch, context/model information, and extension statuses such as MCP, `session-sql`, and `todo`.

The first complete version replaces the prototype hard-coded red footer with a tested footer renderer, a Peacock preset palette, and a small `/peacock` command surface for setting, listing, disabling, and inspecting colors.

## Goals

- Add a `.pi/extensions/pi-peacock/` extension using the pij T2 layout.
- Color the entire bottom footer/status area through `ctx.ui.setFooter()`.
- Preserve P0 footer information:
  - cwd/project path
  - git branch
  - provider/model/thinking level
  - extension statuses from `footerData.getExtensionStatuses()`
- Preserve P1 footer information best-effort:
  - context usage percent/window
  - token/cost/cache stats if public APIs make them available safely
- Provide Peacock preset colors from VS Code Peacock.
- Provide `/peacock` commands for enable/apply/list/status/off/reset.
- Persist user-selected state across `/reload` using append-only custom session entries.
- Include deterministic store/render tests and a Pi smoke scenario.
- Document usage in README quick-start plus `docs/how/pi-peacock.md`.

## Non-Goals

- Do not modify Pi core, pi-mono, or the installed Pi binary.
- Do not color the OS terminal emulator window frame/tab/titlebar in v1.
- Do not implement full VS Code Peacock CSS input compatibility in v1 (`rgb()`, `hsl()`, alpha, named HTML colors beyond aliases).
- Do not add third-party color libraries unless a later plan explicitly accepts that dependency.
- Do not build a full theme/profile manager.
- Do not add default keybindings in v1.
- Do not claim exact token/cost footer parity if public extension APIs do not expose enough data; use best-effort formatting and preserve core status/model information first.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|--------------|----------------------|
| `agent-tooling-interface` | existing | **modify** | Add Pi-visible `/peacock` command UX, footer/status presentation, and smoke-observable outputs. |
| `extension-authoring-harness` | existing capability | **consume** | Use `just new`, T2 extension layout, store tests, smoke, and `just self-check`. |
| `session-work-state` | existing | **consume** | Use append-only custom session entries for lightweight settings replay across reload/resume; no SQLite schema. |

### Domain Notes

- No new domain is created for v1. `pi-peacock` is presentation/status chrome under `agent-tooling-interface`.
- If the feature later grows into a shared visual-identity/theming framework consumed by multiple extensions, reconsider a new domain.

## Testing Strategy

**Approach**: Hybrid

**Rationale**: Use TDD-style unit tests for the complex, deterministic pieces (palette, parser, replay, contrast/formatting, footer rendering) and lightweight smoke for live Pi integration.

**Focus Areas**:

- Store tests:
  - exact Peacock preset values
  - color input parsing and normalization
  - command parsing
  - settings replay from custom entries
  - persist-before-mutate ordering
- UI/render tests:
  - full-width footer line rendering
  - ANSI reset behavior
  - visible width truncation
  - extension status inclusion/sorting
  - token/window formatting (`1,050,000` → `1.1M`, not `1050k`)
- Smoke tests:
  - `/peacock status --json`
  - apply a preset
  - enable footer surface
  - `/reload` preserves state
  - `/peacock off` disables Peacock coloring while leaving the boot-installed built-in-compatible footer layout in place

**Excluded from automated v1 proof**:

- Raw ANSI byte assertions in tmux smoke.
- Pixel-perfect footer row placement.
- Terminal emulator titlebar/tab coloring.

**Mock Usage**: Targeted mocks

- Use fake append recorders for store persistence tests.
- Use fake footer data/status maps for footer render tests.
- Use real Pi/tmux smoke for extension load and command integration.
- Avoid broad mocks that hide footer replacement behavior.

## Documentation Strategy

**Location**: Hybrid (README + `docs/how/`)

**Rationale**:

- README should mention `pi-peacock` and show the shortest command examples.
- `docs/how/pi-peacock.md` should document commands, colors, footer-mode behavior, limitations, and troubleshooting.

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:

| Factor | Score | Rationale |
|--------|------:|-----------|
| S — Surface Area | 1 | One extension plus docs/tests. |
| I — Integration | 2 | Replaces Pi footer and must preserve other extension statuses. |
| D — Data/State | 1 | Lightweight custom-entry settings replay. |
| N — Novelty | 1 | Public APIs exist and prototype validated; full footer preservation still novel in pij. |
| F — Non-Functional | 1 | Width, contrast, terminal ANSI, and UX readability matter. |
| T — Testing/Rollout | 1 | Store/render tests plus smoke; no external services. |

Total: 7 → CS-3.

**Confidence**: 0.82

**Assumptions**:

- `ctx.ui.setFooter()` remains available in the Pi version used by pij.
- Public context/footer data is sufficient for P0 preservation.
- Exact token/cost parity can be best-effort unless public APIs expose it cleanly.
- The extension can use raw ANSI truecolor with reset sequences in rendered strings.

**Dependencies**:

- Pi extension API (`ExtensionAPI`, `ExtensionContext`, `ExtensionCommandContext`).
- `@earendil-works/pi-tui` width helpers.
- Harness Driver SDK smoke.

**Risks**:

- Footer replacement may affect Driver SDK idle detection.
- Footer replacement may accidentally hide extension statuses.
- ANSI rendering can break width calculations if not tested.
- Prototype context-window formatting showed a real issue: `1050k` should be displayed as `1.1M` tokens.

**Phases**:

1. Scaffold + store/palette/command foundation.
2. Footer renderer + UI wiring.
3. Persistence/reload + smoke hardening.
4. Docs/domain updates/final self-check.

## Acceptance Criteria

1. **Extension exists and loads**
   - Given Pi is launched from the pij root,
   - When extensions load,
   - Then `pi-peacock` registers `/peacock` without errors.

2. **Footer surface colors the full bottom area**
   - Given `/peacock surface footer` and a color are active,
   - When Pi renders the footer,
   - Then every footer line rendered by `pi-peacock` has the Peacock background applied across the full visible width.

3. **Footer preserves P0 status information**
   - Given footer mode is enabled,
   - When the footer renders,
   - Then cwd/branch, model/thinking, and all non-empty extension statuses from `footerData.getExtensionStatuses()` remain visible when width permits.

4. **Context window formatting is human-scale**
   - Given context window is approximately `1,050,000` tokens,
   - When `pi-peacock` renders context usage,
   - Then it displays approximately `1.1M` tokens, not `1050k`.

5. **Preset palette is available**
   - Given `/peacock list`,
   - When the command runs,
   - Then it lists the nine VS Code Peacock preset colors with exact hex values.

6. **Preset/color application works**
   - Given `/peacock reactBlue`,
   - When the command runs,
   - Then the footer uses React Blue (`#61dafb`) and `/peacock status --json` reports that selection.

7. **Disable preserves the default footer layout without Peacock color**
   - Given footer mode is active,
   - When `/peacock off` runs,
   - Then the footer keeps the same built-in-compatible layout and disables Peacock background coloring. On shutdown, the extension clears its owned footer via `undefined`.

8. **State survives reload**
   - Given a Peacock color is active,
   - When `/reload` runs,
   - Then the selected color/surface rehydrates from custom entries and remains active.

9. **Store remains Pi-free**
   - Given `.pi/extensions/pi-peacock/store.ts`,
   - Then it imports nothing from `@earendil-works/*`.

10. **Validation passes**
   - Targeted store/render tests pass.
   - `just typecheck` passes.
   - `npm run smoke -- pi-peacock` passes.
   - Before completion, `just self-check` passes or unrelated pre-existing failures are explicitly isolated.

## Risks & Assumptions

- **Footer data parity risk**: Built-in token/cost formatting may not be fully public. V1 prioritizes P0 data and best-effort usage/context.
- **Smoke readiness risk**: Custom footer may alter Pi prompt/footer shape. Smoke must prove readiness remains stable.
- **Status hiding risk**: Failing to render `footerData.getExtensionStatuses()` would regress other extensions.
- **Accessibility/readability risk**: Some preset backgrounds require light/dark foreground selection for contrast.
- **Persistence scope risk**: Session persistence proves reload; project persistence may be desired later for true workspace identity.

## Open Questions

1. Should project-level persistence be added in v1, or is session/reload persistence enough for the first real slice?
2. How close does token/cost/cache formatting need to match the built-in footer for v1 acceptance?
3. Should `/peacock` default to footer mode immediately, or require `/peacock surface footer` before applying colors?

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Footer technical API parity | Integration Pattern | Confirm exact public data available for built-in footer parity before implementation. | What footer fields are accessible? How should missing token/cost fields degrade? |
| Project persistence model | Storage Design | Workspace identity may need to survive new Pi sessions, not just `/reload`. | Store in `.pi/peacock.json`, settings, or session entries only? |
| Color picker UX | CLI Flow / UI Flow | Selecting colors may become interactive after core renderer lands. | `/peacock pick`? autocomplete? modal picker? favorites? |

## Clarifications

### Session 2026-05-27

| Question | Answer | Impact |
|----------|--------|--------|
| Workflow mode | Simple | Keep planning lightweight despite CS-3 complexity; still require targeted tests and smoke. |
| Testing strategy | Hybrid | TDD-style tests for store/render; lightweight live smoke for Pi UI. |
| Mock policy | Targeted mocks | Use fakes for store/footerData; real smoke for integration. |
| Documentation strategy | Hybrid | README quick mention plus `docs/how/pi-peacock.md`. |
| Prototype footer feedback | “Looks fantastic” | Confirms `ctx.ui.setFooter()` is the chosen product direction. |
| Prototype cleanup | Remove test extension | Prototype code was removed; future implementation should be rebuilt intentionally from spec/workshops. |
| Context formatting correction | `22.9%/1050k` should be `22.9%/1.1M tokens` | Add explicit acceptance/test requirement for compact token formatting. |
