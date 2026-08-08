# Phase 2 fix6 re-review - dcdfe509

**Verdict: REQUEST_CHANGES**

The new absent-to-live transition drop fixes the round-5 durable-snapshot
counterexample. Its timing is right: it samples the hot tier before
`unarchive()`, so an archive-only failed record cannot masquerade as an extant
incarnation. The predicate is correctly lifecycle-independent. A concurrent
tick that lands after the descriptor write but before the drop can only have
seen this new descriptor; removing that stamp costs one unverified read and
the next tick repairs it. It cannot produce a false-fresh receipt.

One P1 remains because `unarchive()` can make an old failed incarnation hot
before the later write that makes it live. The predicate then reads that
terminal record as present and retains a stamp the daemon observed before the
new binding.

## P1 - public unarchive followed by failed-seat adoption preserves a terminal stamp on the new bound incarnation

The claimed transition invariant is false after a public unarchive:

1. `runRevive()` invokes `registry.unarchive(seatId)` before it constructs and
   validates the revive plan (`cli.ts:1700`). A failed plan therefore leaves an
   archived `failed` descriptor in the hot tier.
2. `list()` deliberately includes `failed`, and `Daemon.tick()` collects every
   listed daemon-owned harness without a lifecycle filter (`daemon.ts:296-303`).
   It can consequently write a fresh map entry while that terminal record is
   hot.
3. `runAdopt()` regards only `dissolved` as a revive (`cli.ts:2805-2808`).
   It reattaches the failed descriptor as `bound`
   (`core/binding.ts:212-230`) and persists it through `registry.write()`
   (`cli.ts:2894-2908`), not `registry.revive()`.
4. `publish()` now sees `hadHotDescriptor === true`, so it does not call
   `forgetTick`. `read()` overlays the fresh terminal stamp onto the new bound
   descriptor. If the daemon stops after the intermediate tick, that false
   fresh receipt remains for the full stale grace.

I proved the sequence with an ephemeral in-process regression, then removed
it without leaving a source change:

```ts
registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "failed" }));
registry.archive("pij-a", NOW_MS);
registry.unarchive("pij-a");              // public revive pre-validation action
heartbeat().write(["pij-a"], FRESH_TICK); // daemon observes failed hot record
registry.write(descriptor({ id: "pij-a", harness: "claude", lifecycle: "bound" }));
expect(registry.read("pij-a")?.lastTickAt).toBeUndefined();
```

It failed, receiving `2026-06-28T11:59:59.000Z`. Add a permanent regression
covering this public composition, then drop the map stamp at the terminal-hot
to live transition (or when unarchive exposes an archived terminal record).
The solution must preserve the intentional `failed` overlay parity while it
remains terminal and must not suppress a tick written after the new binding.

## Adjudications

- **Unqualified lifecycle predicate:** correct for the new absent-hot branch.
  Requiring an incoming live lifecycle would create a brittle list. Its only
  over-drop race is a tick that observed the newly written descriptor before
  `forget()` runs; that is a bounded, self-healing unverified read, not a
  false-fresh observation.
- **Normal archived-failed route:** fixed. When `publish()` itself unarchives
  an archive-only failed descriptor, its pre-unarchive hot sample is false and
  the new P1g archive criterion proves the drop.
- **Writer/funnel inventory:** `publish()`, `revive()`, and `unarchive()` are
  the three hot-descriptor writers. `claim()` also uses a no-replace hot write,
  but has no production caller; reservation promotion writes only `pending`,
  whose later binding is the same observed incarnation. Neither is this P1.
  The missed composition is instead `unarchive()` changing the *precondition*
  of a later `publish()`, which a destination-only count does not prove safe.

## Independent mutation evidence

Every mutation used mandatory `--expect`:

| Reviewer mutation | Required criterion | Result |
| --- | --- | --- |
| Remove `if (!hadHotDescriptor) this.forgetTick(descriptor.id)` | `P1g: a seat REHYDRATED from the durable identity snapshot inherits NO stamp` | Killed; all three absence/archive P1g criteria failed |
| Replace `readHot()` with archive-falling-through `read()` | `P1g: an ARCHIVED record is not a present incarnation — archive → live drops too` | Killed exactly that archive criterion |

The existing P1g suite is therefore live for both the absent and archive-only
paths. It contains no criterion for the public-unarchive intermediate state;
the unmutated probe above fails before a mutant is needed.
