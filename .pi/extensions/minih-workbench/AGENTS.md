# minih-workbench

Pi-native Minih Workbench extension. Phase 3 has landed: the extension provides Minih inventory, native run-list UI, full-area modal viewing, lazy feed refresh, gated send, confirmed stop controls, compact pushed context, durable audit/cursor persistence, and deterministic fixture/fake validation.

## Source of truth

- Minih owns runs, liveness, inbox/state/history, events, reports, and companion lifecycle.
- This extension may read Minih artifacts and project bounded Pi-facing views; it must not create a second canonical run store.
- All Minih artifact/CLI/helper access goes through `minih-adapter.ts`.
- Never parse ANSI output from `minih view`, `minih attach`, or Minih's Ink human UI.

## Interaction boundary

- `/minih`, `/minih list`, `/minih view <slug> <runId>`, and `/minih report <slug> <runId>` open native Pi UI over Minih-owned artifacts.
- `/minih send <slug> <runId> <body>` and `minih_send_message` are write-capable only after explicit run id, fresh capability check, active coordinated writable state, and intent audit persistence.
- `/minih stop <slug> <runId>` and `minih_stop_run` use dedicated control messages only; model tools require exact `confirm: "stop <slug>/<runId>"`, and human UI/commands require `ctx.ui.confirm`.
- `/minih status --json`, `/minih status <slug> <runId> --json`, `/minih report <slug> <runId> --json`, `minih_runs_list`, `minih_run_status`, and `minih_read_report` remain bounded pull surfaces.
- No arbitrary Minih launch/install flows, no model-controlled root override for writes, and no raw artifact writes outside `minih-adapter.ts`.

## Layout and imports

- Keep T2 layout: `index.ts`, `store.ts`, `minih-adapter.ts`, `persistence.ts`, `ui.ts`, tests, smoke, and fixtures.
- `store.ts` imports nothing from `@earendil-works/*` or the Pi runtime.
- `persistence.ts` is a narrow injected facade; do not import session SQL internals into store contracts.
- Relative imports use `.js` extensions.
- No `any`; use structural types at boundaries and tagged-union results over throws.
- Constants live in `store.ts` next to the data they constrain.

## UI, feed, and keybindings

- Phase 2 UI code uses native Pi TUI components only; never embed Minih Ink or parse ANSI output.
- UI code must use named actions/default keybinding constants from `store.ts` rather than hardcoded key checks.
- List/modal feeds start only while the UI is open, use injected readers/timers where practical, coalesce refreshes, and ignore callbacks after dispose.
- Watcher failures become diagnostics and fall back to bounded/disposable polling.
- `Esc` is close/detach only; it must never stop, kill, control, message, or push context from a Minih run.

## Fixtures and validation

- Tests use deterministic fixture run directories under `fixtures/`; routine validation must not require live Minih/Copilot.
- Fixture coverage should include active, stale/dead, completed/report-ready, malformed/missing, permission-like, coordinated, non-coordinated, and large transcript/tool-output cases.
- Adapter/store/feed/UI/index tests prove bounded payloads, visible truncation markers, separated status axes, report-ready projection, list/modal focus/scroll state, feed disposal, write capability gates, exact stop confirmation, persist-before-side-effect ordering, redaction, and duplicate suppression.
- Driver SDK smoke proves `/minih` list → Enter modal → pane focus → Esc close, gated send success with a fake writer, read-only send rejection, report pane, and reload cleanup over fixtures.
- Before reporting complete: `just self-check` from the repo root.

## Package/dependency policy

- Default to local Minih CLI/artifact contracts and fixtures unless a vetted dependency is necessary.
- Any new package must be added through `just pkg add <source>` with vet/audit evidence.
- Never hand-edit `.pi/packages.yaml`, `.pi/settings.json`, pi-mono, or the installed Pi binary.

## Companion review watchlist

- Write/control paths that skip capability checks, exact confirmation, or persistence-before-side-effect.
- Direct filesystem reads/writes in `index.ts`/`ui.ts` instead of `minih-adapter.ts`.
- Unbounded raw reports, tool output, paths, or environment values in tool/command responses.
- Collapsing liveness, terminal result, inside status, outside status, attention, and UI focus into one ambiguous status.
- Watchers or expensive/global always-on polling outside an open list/modal lifecycle.
