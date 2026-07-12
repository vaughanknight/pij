# Phase 3 Fix — Contaminated External Identity

## Incident

A no-tmux agent had an ambient native identity already joined to a stale
pane-bound descriptor (`paneId:"%0"`, no `deliveryMode`). Skill guidance stopped
new pane discovery, but `pij whoami` trusted the stale descriptor and
`pij inbox register` would preserve the bad push attachment.

## Mission

Implement mode-aware ambient identity validation and explicit external pull
repair without changing registry storage, wire shape, or daemon behavior.

## Allowed Files

- `.pi/extensions/pij/core/current-session.ts`
- `.pi/extensions/pij/core/current-session.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `skills/pij/references/00-routing.md`
- `skills/pij/references/routes/peer.md`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-3-push-path-convergence-and-guidance/execution.log.md`

## Contract

### Ambient self-resolution

- Pass the exact current-process `TMUX_PANE` into ambient registered-self
  validation.
- With a non-empty current pane, accept only a descriptor attached to that exact
  pane and not pull-owned. Any mismatch rejects with exact-pane adoption
  guidance.
- With no current pane, accept only a paneless descriptor with
  `deliveryMode:"pull"`.
- A missing descriptor, stale pane attachment, absent/push delivery mode, or
  contradictory join rejects with an actionable `pij inbox register`
  instruction. Never silently fall through to pane/cwd compatibility resolution.

### External registration repair

- `pij inbox register` against an exact durable ambient identity repairs the
  same pij id to external pull:
  - remove `paneId`, `lastTickAt`, and stale failure/push runtime fields;
  - set `deliveryMode:"pull"`, `state:"idle"`, and current folder/pid;
  - preserve `id`, `dataDir`, `eventsPath`, `startedAt`, `prime`, and durable
    identity/history metadata.
- Repeat registration is idempotent and reports `existing:true`.
- A tmux caller may preserve only a descriptor attached to its exact current
  `$TMUX_PANE`; a different pane is an error, never a repair or takeover.

## Tests

1. Pure tests for external reject, exact-pane acceptance, external repair,
   durable-field preservation, and repeat planning.
2. Production integration:
   - seed a matching ambient descriptor with `paneId:"%0"` and no delivery mode;
   - no-TMUX `whoami` rejects and names `pij inbox register`;
   - `pij inbox register --json` repairs the same id to paneless pull;
   - repeat reports existing and remains pull;
   - no-TMUX `whoami` then resolves the repaired id;
   - exact current-pane tmux resolution remains green.
3. Independently mutate validation and repair; each must make the named
   regression RED, restore byte-identically, then GREEN.

## Gates

- Focused current-session + production integration tests
- `just test`
- `just pij-skill-check`
- `just typecheck`
- `just lint`
- `harness checks --quick`
- package/scope audit and `git diff --check`

## Forbidden

- No types, registry adapter, daemon, package/lock, harness, workflow, or
  persistence migration changes.
- No daemon restart, machine-wide deployment, commit, push, or merge.
- Do not use or mutate quarantined `pij-grieving-gibbon`.

## Report

Send a concise JSON report to `pij-concrete-reptile` with test counts, mutation
evidence, scope, and finding dispositions.
