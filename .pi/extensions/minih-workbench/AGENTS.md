# minih-workbench

Pi-native Minih Workbench extension. Phase 1 is a read-only artifact inventory and adapter foundation.

## Source of truth

- Minih owns runs, liveness, inbox/state/history, events, reports, and companion lifecycle.
- This extension may read Minih artifacts and project bounded Pi-facing views; it must not create a second canonical run store.
- All Minih artifact/CLI/helper access goes through `minih-adapter.ts`.
- Never parse ANSI output from `minih view`, `minih attach`, or Minih's Ink human UI.

## Phase 1 boundary

- Read-only only: no composer, no `send`, no `stop`, no control messages, no push-context delivery, no arbitrary Minih launch/install flows.
- `/minih status --json`, `minih_runs_list`, `minih_run_status`, and `minih_read_report` are pull surfaces only.
- Phase 3 placeholders are allowed as inert types/constants/facade methods; do not implement side effects early.

## Layout and imports

- Keep T2 layout: `index.ts`, `store.ts`, `minih-adapter.ts`, `persistence.ts`, `ui.ts`, tests, smoke, and fixtures.
- `store.ts` imports nothing from `@earendil-works/*` or the Pi runtime.
- `persistence.ts` is a narrow injected facade; do not import session SQL internals into store contracts.
- Relative imports use `.js` extensions.
- No `any`; use structural types at boundaries and tagged-union results over throws.
- Constants live in `store.ts` next to the data they constrain.

## UI and keybindings

- Phase 1 does not implement the full modal viewer.
- Future UI code must use named actions/default keybinding constants rather than hardcoded key checks.
- `Esc` is close/detach only in future modal work; it must never stop or kill a Minih run.

## Fixtures and validation

- Tests use deterministic fixture run directories under `fixtures/`; routine validation must not require live Minih/Copilot.
- Fixture coverage should include active, stale/dead, completed/report-ready, malformed/missing, permission-like, coordinated, non-coordinated, and large transcript/tool-output cases.
- Adapter/store tests prove bounded payloads, visible truncation markers, separated status axes, report-ready projection, and no-write Phase 1 invariant.
- Before reporting complete: `just self-check` from the repo root.

## Package/dependency policy

- Default to local Minih CLI/artifact contracts and fixtures unless a vetted dependency is necessary.
- Any new package must be added through `just pkg add <source>` with vet/audit evidence.
- Never hand-edit `.pi/packages.yaml`, `.pi/settings.json`, pi-mono, or the installed Pi binary.

## Companion review watchlist

- Scope creep into modal/send/stop/push before their phases.
- Direct filesystem reads in `index.ts`/`ui.ts` instead of `minih-adapter.ts`.
- Unbounded raw reports, tool output, paths, or environment values in tool/command responses.
- Collapsing liveness, terminal result, inside status, outside status, attention, and UI focus into one ambiguous status.
- Watchers or expensive polling before Phase 2.
