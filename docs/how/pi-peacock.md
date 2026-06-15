# Pi Peacock

`pi-peacock` colors Pi's full bottom footer/status area with VS Code Peacock-inspired workspace identity colors while preserving operational footer information.

## Quick start

```text
/peacock list
/peacock reactBlue
/peacock status --json
/peacock off
```

`/pi-peacock` is an alias for `/peacock`.

## Commands

| Command | Meaning |
|---------|---------|
| `/peacock` | Show current status. |
| `/peacock list` | List the nine bundled Peacock presets with exact hex values. |
| `/peacock <preset>` | Apply a preset, e.g. `/peacock reactBlue`. |
| `/peacock #rrggbb` | Apply a custom six-digit hex color. The leading `#` is optional. |
| `/peacock status --json` | Show machine-readable state plus render telemetry. |
| `/peacock surface footer` | Select footer mode. This is the only v1 surface. |
| `/peacock off` | Disable Peacock background coloring while keeping the same built-in-compatible footer layout. |
| `/peacock reset` | Clear Peacock state for the current session replay log. |

## Presets

| ID | Color |
|----|-------|
| `angularRed` | `#dd0531` |
| `azureBlue` | `#007fff` |
| `javascriptYellow` | `#f9e64f` |
| `mandalorianBlue` | `#1857a4` |
| `nodeGreen` | `#215732` |
| `reactBlue` | `#61dafb` |
| `somethingDifferent` | `#832561` |
| `svelteOrange` | `#ff3d00` |
| `vueGreen` | `#42b883` |

Aliases include common lowercase names such as `react`, `vue`, `peacockGreen`, `node`, `svelte`, and `js`.

## Footer behavior

Footer mode uses `ctx.ui.setFooter()`, which replaces Pi's built-in footer renderer. To avoid a layout jump when colors are toggled, `pi-peacock` installs a built-in-compatible footer at boot and `/peacock` only changes its background color escape; it does not add a Peacock status segment or override foreground color. The renderer reconstructs the important built-in information itself:

- cwd/path
- git branch
- provider/model/thinking level
- best-effort context usage, including `1,050,000` token windows as `1.1M tokens`
- all non-empty extension statuses from `footerData.getExtensionStatuses()`

External footer text is sanitized before ANSI styling so status text cannot inject newlines, tabs, terminal escape sequences, or control characters.

## Limitations

- V1 is CLI-only for color selection. There is no popover/modal color picker yet.
- `setFooter()` is a singleton custom-footer slot. If another extension also calls `setFooter()`, the last owner wins.
- `/peacock off` disables Peacock coloring but keeps `pi-peacock`'s built-in-compatible footer installed. On shutdown/reload teardown, the extension clears its owned footer with `undefined`.
- Context/token/cost parity is best effort. P0 information and extension statuses take priority. Pi does not currently expose every built-in footer toggle to extensions, so `pi-peacock` assumes the normal auto-compact indicator behavior.
- Persistence is current-session/reload scoped through append-only custom session entries; it is not a project-level workspace preference file.

## Validation

```bash
just test
just typecheck
just smoke
just self-check
```

For targeted diagnosis, `npm run smoke -- pi-peacock` runs only this extension's Driver SDK smoke.
