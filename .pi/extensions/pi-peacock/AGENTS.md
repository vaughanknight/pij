# pi-peacock

Pi extension that colors the full bottom footer/status area with VS Code Peacock-style workspace identity colors.

## Guardrails

- Keep `store.ts` Pi-free: no `@earendil-works/*` imports.
- Use append-only custom session entries (`pi-peacock.settings.v1`) for reload persistence.
- Persist before mutating in-memory settings.
- Use one `session_start` handler for all reasons.
- Clear owned footer/status with `undefined`, never empty strings.
- `ctx.ui.setFooter()` is a singleton custom-footer slot. `pi-peacock` installs a built-in-compatible custom footer at boot so `/peacock` changes background color only; do not add a self-status segment or foreground override. Shutdown clears the owned footer with `undefined`.
- Sanitize all external footer text before ANSI wrapping: cwd, branch, model/provider, thinking labels, and every `footerData.getExtensionStatuses()` value.
- Smoke should use stable text/JSON anchors, not raw ANSI bytes.
- V1 is CLI-only for color choice. Do not add picker/modal UI unless a later plan updates scope.

## Acceptance for v1

- [ ] `/peacock` and `/pi-peacock` are registered.
- [ ] `/peacock list` shows all nine Peacock presets with exact hex values.
- [ ] `/peacock reactBlue` applies `#61dafb`.
- [ ] `/peacock status --json` reports state and actual render telemetry.
- [ ] Footer rendering preserves cwd/branch, provider/model/thinking, context window, and non-empty extension statuses when width permits.
- [ ] `1,050,000` token windows render as `1.1M tokens`, not `1050k`.
- [ ] `/peacock off` disables Peacock coloring without changing footer layout; shutdown clears owned footer/status through `undefined`.
- [ ] `just test`, `just typecheck`, `just smoke`, `just self-check`, and extension-validator evidence pass or blockers are isolated.

## Useful commands

- `just test`
- `just typecheck`
- `just smoke`
- `npm run smoke -- pi-peacock` for targeted diagnosis only
