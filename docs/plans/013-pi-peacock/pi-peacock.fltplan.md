# Flight Plan: Pi Peacock Terminal Footer Chrome

**Plan**: 013-pi-peacock
**Spec**: [`pi-peacock-spec.md`](./pi-peacock-spec.md)
**Plan Doc**: [`pi-peacock-plan.md`](./pi-peacock-plan.md)
**Status**: Landed
**Mode**: Simple
**Generated**: 2026-05-27T00:00:00Z

## Mission

Build `pi-peacock`, a Pi extension that colors the entire bottom footer/status area with a VS Code Peacock-inspired workspace identity color while preserving core footer information and existing extension statuses.

## Architecture Vision

- **Store**: Pi-free presets, command parser, settings, and custom-entry replay.
- **UI renderer**: Width-safe footer lines, ANSI background/foreground, readable text, status preservation, human-scale token formatting.
- **Pi wiring**: `/peacock` command, lifecycle rehydrate/repaint, footer install/restore, shutdown cleanup.
- **Validation**: Store/render tests first, then live Pi smoke, then `just self-check`.

## Key Decisions

- Use a normal project-local Pi extension; no Pi core changes.
- Use `ctx.ui.setFooter()` as the chosen v1 surface because the prototype looked fantastic.
- Keep widget/status mode only as a fallback; it cannot satisfy footer acceptance criteria.
- Use VS Code Peacock preset colors plus `#rrggbb` / no-hash hex.
- Use session custom entries for reload persistence in v1.
- Format large token windows as human-scale values: `1,050,000` → `1.1M`, not `1050k`.

## Tasks Snapshot

| ID | Task | Path(s) |
|----|------|---------|
| T001 | Scaffold `pi-peacock` T2 extension and remove starter ping. | `.pi/extensions/pi-peacock/` |
| T002 | Add store tests. | `.pi/extensions/pi-peacock/store.test.ts` |
| T003 | Implement store contracts for presets, commands, settings, replay. | `.pi/extensions/pi-peacock/store.ts` |
| T004 | Add UI/render tests for width, sanitization, statuses, ANSI safety, and token formatting. | `.pi/extensions/pi-peacock/ui.test.ts` |
| T005 | Implement footer render helpers, sanitizers, and token formatting. | `.pi/extensions/pi-peacock/ui.ts` |
| T006 | Wire lifecycle and `/peacock` commands with singleton-footer ownership documented. | `.pi/extensions/pi-peacock/index.ts` |
| T007 | Build footer snapshot from public Pi context/footerData and test wiring boundary. | `index.ts`, `ui.ts`, `index.test.ts` |
| T008 | Add smoke. | `.pi/extensions/pi-peacock/smoke.ts` |
| T009 | Add extension-local AGENTS guidance. | `.pi/extensions/pi-peacock/AGENTS.md` |
| T010 | Add docs. | `docs/how/pi-peacock.md`, `README.md` |
| T011 | Update domain docs. | `docs/domains/agent-tooling-interface/domain.md`, `docs/domains/domain-map.md` |
| T012 | Run validation gates. | repo root |

## Must Preserve

- cwd/project path
- git branch
- provider/model/thinking
- extension statuses from `footerData.getExtensionStatuses()`
- best-effort context/token stats

## Watchouts

- Footer replacement can hide built-in footer/status information.
- `setFooter()` is a singleton custom-footer slot; `pi-peacock` owns a built-in-compatible custom footer from boot so color toggles do not change layout.
- Sanitize all external footer text before ANSI wrapping.
- Smoke should not assert raw ANSI bytes.
- Clear status/footer with `undefined`, never empty strings.
- Store must import no `@earendil-works/*` packages.
- Do not reintroduce the removed prototype files as-is; rebuild from spec/workshops.

## Flight Log

| Time | Event | Evidence |
|------|-------|----------|
| 2026-05-27 | Landed implementation. | `just self-check` passed; `npm run smoke -- pi-peacock` passed; extension-validator run `2026-05-27T16-13-24-613Z-07e1` reported scenario 13 passed / 0 failed, with degraded report validation due validator schema conflict on `/summary`. |

## Ready Command

```text
/plan-6-v2-implement-phase --plan "docs/plans/013-pi-peacock/pi-peacock-plan.md"
```
