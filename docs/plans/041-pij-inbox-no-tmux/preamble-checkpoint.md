# Preamble checkpoint — s041 inbox without tmux

## claim

Read-only orientation is complete. The assignment is understood as a pull inbox
surface for non-tmux sessions (`check` plus blocking `--wait`), durable automatic
read-state, immediate read-marking after tmux injection, a Windows compatibility
sweep, and minor `/pij` skill guidance updates while preserving existing send and
receipt behavior. Planning has not started.

## artifacts[]

- `docs/plans/041-pij-inbox-no-tmux/original-ask.md`
- `government/briefs/s041-brief.md`
- `skills/pij/references/prime/orient-global.md`
- `government/orient-local.md`
- `docs/how/pij.md`
- `AGENTS.md`

## shas[]

- repository HEAD: `40528df52e9d5168b02f0f69f6fd3891caf21f9c`
- `government/briefs/s041-brief.md`: `4b4e7506198e9fb786e1e06a48baf3b77b7a1310`
- `government/orient-local.md`: `693f9e227f66a8a1e14174381b7aa1d65031b21e`
- `skills/pij/references/prime/orient-global.md`: `5c17886cd758a6d591c6dddce8f4d8806870dc44`
- `docs/plans/041-pij-inbox-no-tmux/original-ask.md`: `10e0b5096938509eb9c57e1f5f7d09a457a62ede`

## gates[]

- `pij whoami`: `pij-concrete-reptile`, working in the repository root.
- Canary: `CANARY-S041-4482` echoed to `pij-3vetx8`.
- `harness boot`: ready; typecheck and tests passed.
- Existing message delivery is file-backed through `FsChannel`.
- Bound tmux delivery currently injects and removes consumed inbox files.
- Pi owns its in-process inbox receiver; the daemon intentionally does not drain it.
- The CLI core and integration surfaces needed for `check` are currently modified by
  s040, so implementation requires an o-prime-serialized overlap window.

## observations[]

- Binding diagnostics proved `COPILOT_AGENT_SESSION_ID` was available and
  `pij phonehome` established the native Copilot binding.
- Delivery could not reach this peer while binding was pending; the o-prime used
  direct pane injection. That control-plane defect is already owned by a sibling
  stream.
- The current inbox directory was empty after daemon injection, matching today's
  delete-on-consume behavior and confirming that unread history needs an explicit
  persistence design rather than relying on retained message files.

## open[]

- Read-state persistence: mutate message envelopes in place, retain immutable
  messages plus a read-state index/sidecar, or move messages between unread/read
  locations?
- Blocking behavior: should `pij check --wait` wait indefinitely by default, or
  have a finite default timeout with an explicit override?
- Windows proof: require a Windows CI runner, add platform-focused tests only on
  current runners, or stage CI coverage separately?
- Exact code-fence manifest must account for s040 ownership of
  discovery/binding/spawn/fs-registry/CLI integration and coordinate any overlap
  through the o-prime.

## rulings[]

- Workflow: Full.
- Testing: hybrid — TDD for core/read-state behavior, integration coverage for
  filesystem/CLI seams, and Windows execution proof.
- Test doubles: existing fakes and real filesystem fixtures; no mocks.
- Documentation: `docs/how/` plus `/pij` skill guidance.
- Read state: immutable message files plus one atomic read marker per message.
- `pij check --wait`: indefinite by default; optional milliseconds impose a
  timeout.
- No-tmux identity: add current-session registration/adoption without tmux;
  spawn and daemon-driven injection remain tmux-only.
- Windows proof belongs in the engineering harness as well as CI: extend the
  deterministic `harness checks` sensor inventory so the Windows-compatible
  surface is a done/ship signal, not only a workflow configuration.
