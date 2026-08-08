# Research dossier — s100 tick-heartbeat (Fix A, pij#180)

**Stream** s100 `tick-heartbeat` · branch `s100/tick-heartbeat` · base `a2a50e2`
**Charter**: `daemon.ts:286-293` — the `lastTickAt` heartbeat. Granted additionally:
`adapters/fs-registry.ts` (whole file), new `core/daemon/tick-heartbeat.ts`.
**Not mine**: `daemon.ts:354` (s097), `daemon.ts:639-648` (s095), `core/archive.ts` (ruled
out of scope), Fix B (#181), Fix C.

Everything below is measured on this machine today or read at source. s098's numbers are
cited where I did not re-derive them; the two my fix rests on I reproduced independently.

---

## 1. The defect

`daemon.ts:288-293`, once per 600ms tick:

```ts
for (const snapshot of this.registry.list()) {
	if (!daemonOwnsDelivery(snapshot.harness ?? "pi", snapshot.deliveryMode)) continue;
	const latest = this.registry.read(snapshot.id);
	if (latest) this.registry.write({ ...latest, lastTickAt: tickAt });   // 292
}
```

Each `write()` is an `FsRegistry.publish()` — roughly five fsync-barriered atomic publishes
(descriptor, identity snapshot, owner record, identity record). s098 instrumented
`FsRegistry.prototype` and found **all 132 registry writes in a tick originate at line 292 and
nothing else writes** (#180).

`lastTickAt` is liveness telemetry and it is **disposable**: if it is lost, a subsequent daemon
tick rebuilds it **if one runs**, and until then it is simply **absent** — which the receipt path
degrades to `unverified` (`core/receipts.ts:31-33` returns `daemonTickStale: true` for a missing
stamp). **The safety comes from that degradation, not from regeneration.** So it is the field with
the least durability requirement in the descriptor, paying the highest durability price.

> **Corrected 2026-08-08.** This paragraph originally read *"regenerated 600ms later by
> definition"*. Review falsified that: `runDaemon()` only registers a `setInterval`, so a stopped or
> crashed daemon has no subsequent tick and a delayed callback is not bounded to 600ms. The
> conclusion (no `fsync`) is unchanged; **its reason was wrong**, and a false rationale attached to
> a true conclusion has no failing observable anywhere.

## 2. VERIFIED — the write count is exact (reproduced independently)

`assets/bench/heartbeat-write-count.mjs`, read-only over `~/.pij`:

```
totalJsonDescriptors      588
dissolvedExcludedByList    32     ← fs-registry.ts:148 drops dissolved from list()
listedWorkingSet          556
byHarness                 claude 62 · copilot 70 · pi 424
WRITES_PER_TICK           132     ← 62 claude + 70 copilot
ownedLifecycle            bound 132
```

**132 to the descriptor, and the harness split matches s098 exactly.** This is the number the
fix turns into 1.

## 3. VERIFIED — the fsync cost does not reproduce, and that is the finding

Faithful replication of `writeTextAtomic` (temp + fsync + rename + dir fsync, 40 iterations;
fsync is unconditional in production — `PIJ_TEST_NO_FSYNC` only fires in tests,
`atomic-file.ts:39-42`):

| source | per atomic write | implied heartbeat cost/tick (132 × ~5) |
|---|---:|---:|
| s098, under fleet load | 18.1 ms | ~12 s |
| this stream, quiet | **4.86 ms** | **~3.2 s** |

Not a contradiction — **the heartbeat is part of the load that makes each fsync expensive.**
132 barriers per tick inflate per-write latency, which lengthens the tick, which is the
positive feedback the profile reads as 52.5%. The two numbers are the same system at two
points on its own curve. **Fix A is worth more under load than the quiet number suggests**;
the projection uses 4.86 ms because it is the conservative one.

*Instrument proved before use (F-701)*: the probe carries a no-op control measuring
0.000019 ms/iter against 4.86 ms for real work, so a zero would have been visibly a zero.

## 4. CORRECTION to #180 — right mechanism, wrong picture

#180 says *"a claude seat that died weeks ago is still heartbeat-written every 600ms"*.

- **Mechanism holds**: `daemonOwnsDelivery` filters on harness + deliveryMode only, never
  lifecycle (`core/harness/pi.ts:15-17`).
- **Illustration does not**: `list()` drops `dissolved` (`fs-registry.ts:148`), and all 132
  written descriptors are `lifecycle: bound`. **Zero terminal records in the write set.**

The count and the fix are unaffected. But "dead seats are being written" must not be the
advertised justification, because the write set is entirely live-believed seats. *An issue can
be correct in mechanism and wrong in the picture it paints, and the picture is what a reader
carries away.*

## 5. The reader surface — wider than #180 states, and one reader is not cosmetic

#180 lists "`pij state`, and the tick-staleness check in `core/receipts.ts`". There are four:

| site | use |
|---|---|
| `core/cli.ts:2136` | send-success payload `tickStatus` |
| `core/cli.ts:3044` | send path `tickStatus` |
| `core/cli.ts:3325-3326` | `pij state` display |
| **`cli.ts:3398`** | **claude/copilot/codex: `state = tick.daemonTickStale ? "unverified" : "queued"`** |

`daemonTickStatus(undefined, now)` returns `daemonTickStale: true` (`receipts.ts:31-33`).

**So the naive fix — stop writing the field, update nothing else — makes every send to all 132
daemon-owned seats report `unverified`.** That is the fleet's most-used surface, and it is a
self-inflicted #182: a supervision signal inverted by a change to how fast the observer works.
It would also read as *"the perf fix broke messaging"*, so the true cause would be the last
thing anyone looked at.

**The reader path is therefore inherent to this fix, not a widening of it** — the same way
#118's mkdir necessarily touched the import block.

## 6. The archive axis — a reader #180 does not mention

`core/archive.ts:46`, `archiveAgeAnchorMs`, uses `lastTickAt` as an **archive age axis**; its
comment says it "covers control-plane peers that write no pij events". So the field is
load-bearing for retention, not only telemetry.

Measured (`assets/bench/archive-anchor-reach.mjs`):

```
terminalRecords              32   (dissolved | failed)
terminalWithLastTickAt       32
archivableToday               1
HELD_HOT_ONLY_BY_lastTickAt   3   e.g. pij-silly-pinniped: 45.4h with it, 66.1h without
```

**I hypothesised hundreds and predicted Fix A would collapse the working set. It is three.**
The measurement disproved the hypothesis: dissolved records stop being heartbeat-written at
dissolution, so what they carry is a **frozen stamp**, and the effect is a bounded ~20h
archiving delay rather than indefinite retention.

**Ruling (o-prime, 2026-08-08): accept the change.** Do not touch `core/archive.ts`. State it
in the PR body, test it, and file an issue for the axis itself.

## 7. Design — heartbeat file + read overlay

Daemon writes **one** file per tick; `FsRegistry.read()`/`list()` overlay `lastTickAt` onto
descriptors as they are read. Every existing reader keeps working unchanged and unaware,
because the descriptor's shape *at the port boundary* is identical — which is what makes the
send-receipt surface provably immovable.

**Ruling (a) falls out of the existing seam rather than being engineered**: `sweepArchivable`
reads files directly via `readFile` (`fs-registry.ts:640`), **not** through `read()`, so it
never sees the overlay and dissolved records age from `lastEventAt`/`startedAt` exactly as
ruled. Verified at source, not assumed.

**File shape** — wrapped so it can never be mistaken for a descriptor:

```json
{ "v": 1, "tickAt": "2026-08-08T05:00:00.000Z", "sessions": { "pij-x": "2026-..." } }
```

`readFile` admits a record only when `typeof parsed?.id === "string"`
(`fs-registry.ts:1132`). A top-level `id` key is absent by construction, so `list()` and
`sweepArchivable` ignore the file even though it lives in the `*.json` glob. A bare
`{id: iso}` map would have been unsafe if a session were ever literally named `id`; the
wrapper removes the question.

**Rejected alternative**: update the four reader call sites explicitly. More honest in the
abstract — the overlay makes `read()` do something its name does not advertise — but it puts
the diff inside `core/cli.ts` (s093/s094) and `cli.ts` (s094), and correctness of the receipt
surface beats elegance of the seam. Documented at both ends per o-prime's condition.

## 8. The divergence this creates, and where it must be documented

**A descriptor's shape now depends on which access path read it**: via `read()`/`list()` it
carries `lastTickAt`; via `readFile` it does not. This is **load-bearing, not incidental** —
it is precisely what lands archive ageing on ruling (a).

Documented at **both** ends (o-prime's condition): at the overlay in the adapter, and at the
`readFile` path, so someone arriving from the other direction learns it without finding this
commit. *A divergence documented only where it is created is invisible to everyone who meets
it where it matters.*

## 9. Risks

| # | risk | mitigation |
|---|---|---|
| R1 | Send receipts flip to `unverified` fleet-wide | AC-04 pins the receipt surface as a **preserved property**, asserted before and after |
| R2 | Heartbeat file parsed as a descriptor by `list()`/sweep | wrapper object, no top-level `id`; AC-05 asserts `list()` count is unchanged with the file present |
| R3 | Overlay masks a genuinely dead daemon | the stamp is written by the tick itself; a stopped daemon stops updating it, so staleness still surfaces — AC-09 pins it |
| R4 | Departed ids lose their frozen stamp | intended and bounded; same class as the archive change, stated in the PR body |
| R5 | Pre-fix proof invalidated by a sibling rebase in `daemon.ts` | s099's rule: re-run behavioural criteria on the rebased tree before convergence |

## 10. Open questions

- **OQ-1** (filed, not fixed): should the archive age axis have a first-class home now that
  `lastTickAt` has left the descriptor? Deferred with a number: 3 records, ~20h.
- **OQ-2** (not mine): #181's 548 `ps` spawns dominate once this lands. s097/s095 territory.
