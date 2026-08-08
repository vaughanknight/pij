# Phase 2 fix5 re-review - 4ec444ec

**Verdict: REQUEST_CHANGES**

P1e is fixed: `read()` scrubs a raw legacy tick on both terminal exits while
continuing to expose a live legacy tick until its first durable rewrite. P1f
also works for every route that actually calls `FsRegistry.revive()`.

One P1 remains because that is not the complete re-incarnation funnel.

## P1 - absent-descriptor rehydration reaches live `writeExact()` without dropping the old map entry

The new drop is confined to `FsRegistry.revive()` (`fs-registry.ts:365-415`),
but a supported absence/recovery path does not call it:

1. `FsRegistry.resolveIdentitySnapshot()` explicitly describes its snapshot as
   the state to restore after a clean shutdown removed the live descriptor
   (`fs-registry.ts:462-477`).
2. `validateResolvedIdentity()` selects that snapshot when
   `this.read(pijId)` is null (`fs-registry.ts:1033-1047`), and `index.ts`
   passes it to `PijSession.boot()` as `durableDescriptor`
   (`index.ts:239-254`, `:319-325`).
3. With no hot descriptor, `wasDissolved` is false. `PijSession.boot()` takes
   its `else` branch and calls `registry.writeExact(descriptor)`, not
   `registry.revive(descriptor)` (`core/session.ts:208-256`).

Thus a fresh heartbeat map entry for the old incarnation is still present when
the snapshot is made live again. `read()` overlays that entry onto the new
descriptor, and a stopped daemon makes the same false-fresh receipt P1f was
meant to eliminate.

I added an ephemeral in-process probe, then removed it without leaving a
working-tree change:

```ts
registry.write(descriptor({ id: "pij-a", harness: "claude" }));
heartbeat().write(["pij-a"], FRESH_TICK);
registry.remove("pij-a");
registry.writeExact(descriptor({ id: "pij-a", harness: "claude", lifecycle: "bound" }));
expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
```

It failed with the old fresh stamp
`2026-06-28T11:59:59.000Z`. This directly falsifies the load-bearing claim
that `revive()` is the only route from terminal **or absent** to live.

Extend the drop to the absent-descriptor snapshot restoration path, with a
regression that exercises the actual `durableDescriptor` boot route. Do not
make the test a bare `writeExact()` unit only: it must prove the production
identity-snapshot wiring reaches the drop.

## Adjudications

- **Concurrent-revive residual:** the sanctioned different-id RMW race is
  accurately characterized for successful persistence. A stale removal
  restored by the later writer is overwritten by the next whole-map heartbeat
  write; it cannot survive that later write absent another racing revive. The
  store's best-effort I/O semantics still allow the documented staleness-grace
  fallback if a drop cannot persist, so the implementation must not describe
  concurrency as its sole possible source.
- **Terminal scrub:** correct. Raw JSON fixtures ensure the hot dissolved and
  archived branches see a real persisted legacy stamp; the live legacy
  fixture proves this is not an over-broad strip.
- **Fixture ordering:** correct in the repaired archived-to-revived criterion.
  It writes the heartbeat after `revive()`, so it proves a genuinely
  new-incarnation observation instead of asking the new drop to preserve an
  old stamp. The other new criteria likewise establish their relevant
  preconditions before asserting the branch under test.

## Independent mutation evidence

Every run used `--expect`:

| Reviewer mutation | Required criterion | Result |
| --- | --- | --- |
| Omit `this.forgetTick(revived.id)` | `P1f: a revived seat inherits NO stamp` | Killed (three P1f criteria failed) |
| Return archived data without `scrubTick` | `P1e: and the ARCHIVE fall-through strips it too` | Killed exactly that criterion |
| Persist the original record in `forget()` | `drops one id and leaves every other stamp intact` | Killed (four store criteria failed) |

The unmodified focused overlay and store suites pass: 62 tests.
