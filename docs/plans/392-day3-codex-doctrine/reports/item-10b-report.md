# Item 10b report — pane-misbind bind guard

**Outcome**: PARTIAL — the full item is implemented and its extension suite is green;
the mandatory repository-wide gate remains red outside this fence.

## Claim

Pane addresses no longer resolve to terminal history, and the daemon cannot deliver or
bind a stale seat onto a fresh same-harness pane without that seat's own identity evidence.

## Behavior

- One live seat plus dissolved/failed history on the same pane resolves to the live seat.
- Two live seats on one pane return `E-AMBIG`; no caller guesses.
- A source sweep prevents a new direct runtime pane resolver from bypassing lifecycle
  filtering.
- Planned Copilot/branched-Claude binding requires an exact session-id match in the
  descriptor process subtree.
- Discovered Claude/Codex binding requires both its fresh native artifact and a matching
  harness process without contradictory session evidence.
- A durable dissolved descriptor wins over a stale pending tick snapshot before any
  injection or bind.
- Incident replay: pane-less dissolved `pij-nasty-tick` plus a fresh unregistered foreign
  Copilot pane produces zero pane deliveries, zero binds, and zero ready notice.

## Shared resolver scope

The packet named six unfiltered sites. The grep sweep also found the newer chore-seat
resolver, current-registration fallback, and daemon gone-pane owner lookup. All runtime
pane-to-seat resolution now uses `resolveLivePane`; only the specialized
`pendingPaneOccupant` lifecycle check remains direct.

`IndexState.resolvePane` is now documented and typed as a lifecycle-filtered
delivery-target index. Finding C's `sqliteOf(this.channel)` path was left untouched.

## TDD

- Initial item run: 7 failed, 345 passed, 2 skipped.
- Added discovered-Claude foreign-session mutant: failed because old code bound it.
- Final targeted/integration set: 408 passed, 4 skipped.
- Full pij extension suite: 3,974 passed, 15 skipped.

## Gates

- Full pij extension tests: **PASS**.
- Typecheck: **PASS**.
- Changed-file Biome: **PASS**.
- `harness checks`: **FAIL** in repository-wide lint, full test, windows compatibility,
  and smoke; local paths, typecheck, package audit, and snapshots pass.

The packet fence does not permit changes to the failing surfaces, so this candidate cannot
claim `gatesClean: true`.

## Blast radius

The resolver feeds identity attribution, spawn ownership, focus registration, orchestration,
chore attribution, and daemon cleanup. The bind guard affects both deterministic and
transcript-discovery harness lanes, so the proof includes the full extension suite and the
real daemon path rather than only pure helper tests.
