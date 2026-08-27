# Item 10a report — pane-resolution guard

## Claim

The resolution half of the cross-government pane-misbind incident is fixed.
`IndexState.resolvePane` can no longer return a dissolved or failed seat for a retained or
reused pane id.

## Artifacts

- `.pi/extensions/pij/core/daemon/index-state.ts`
- `.pi/extensions/pij/core/daemon/index-state.test.ts`
- `docs/plans/392-day3-codex-doctrine/tasks/item-10a-index-state-guard/execution.log.md`

## SHA

- Implementation: `6948e14a4cc661cffe445df60538293c8df29413`

## Gates

- `index-state.test.ts`: **PASS** — 9/9.
- `just typecheck`: **PASS**.
- Changed-file Biome: **PASS**.

## Scope

Only `byPane` population changed. Terminal descriptors remain indexed by id and
harness-native identity for audit and `pij state`. Pending and bound seats still resolve
their panes.

## Open

Item 10b remains the bind-side half: `loop.ts` must refuse dissolved-seat binding and
require Copilot session-id evidence after the s391 shared-file work lands. The full
daemon-level zero-delivery incident proof belongs with that second half.

---
## Orchestrator correction (cold review F1/F4, verified against source)
**This commit is behavior-neutral HARDENING, not the incident's resolution fix.** Verified: (1) `IndexState.resolvePane` has ZERO production callers (only `rebuild`/`all`/`pending`/`get` are used by `daemon.ts`); (2) `FsRegistry.list()` already drops `dissolved` (`adapters/fs-registry.ts:277`) and the daemon rebuilds from `registry.list()` (`daemon.ts:388,416`), so the `dissolved` guard arm is unreachable via the daemon path — only the `failed` arm could ever change index contents; (3) the incident seat was pane-less (`paneId:None`) and pane %108 was unregistered, so `byPane` was never the delivery route — that is the BIND side (item 10b). The `failed` exclusion is CORRECT but for the reason "**a terminal seat is never a delivery target**", NOT "has no live pane" (a `failed` bind-timeout/pane-input-blocked seat CAN own a live pane — `loop.ts:494` markFailed does not kill the pane). The incident's resolution half is NOT closed by this commit; the real fix is item 10b (bind guard + the 6 ad-hoc pane resolvers in F5). What 10a DOES deliver: `byPane`/`resolvePane` is now a safe **delivery-target index** for item 10b to wire.
