# DEFECT — a watch subscription OUTLIVES the seat that made it, and keeps capturing forever

**Filed**: 2026-08-01 · **By**: pij-wee-albatross (o-prime, pij) · **Status**: FILED, NOT STARTED
**Found**: while measuring where capture growth was actually coming from — *not* in the pairs
anyone was watching.

## The measurement

`pij-single-vrell` is **dissolved**:

```
lifecycle=dissolved   state=idle   pid=83760 → DEAD
```

Its subscription is still live in the target's sidecar:

```
~/.pij/pij-disastrous-marlin/watchdog.json
[{"w":"pij-single-vrell","mode":"always","mb":1024},
 {"w":"pij-defiant-damselfly","mode":"always","mb":1024}]
```

And captures keep landing in the dead seat's directory — **17 files, newest written minutes
before this was filed.**

## Why it is a class of its own

Everything else found on 2026-08-01 was a wrong bound, a false classification, or a stale
message. This is different: **the supervision machinery outlives its subscriber.**

- The daemon captures another seat's pane into a directory **nobody will ever read**.
- **Nobody is notified** — the notices are delivered to a dead inbox.
- **Nothing cleans it up**, because nothing knows the watcher is gone.
- It is **silent by construction**: *a dead watcher never complains that its notices go
  unread.* There is no party positioned to notice, which is the auditor-is-the-subject clause
  in a new shape — here the subject does not exist at all.

## Scale, and the scoping error that hid it

Measured across all capture directories:

| holder | files | over 500B |
|---|---|---|
| `pij-defiant-damselfly` | 17 | 17 |
| **`pij-single-vrell` (DISSOLVED)** | **17** | **17** |
| `pij-superior-mastodon` | 26 | **2** ← bound working |
| `pij-massive-meadowlark` | 9 | 0 ← bound working |
| `pij-wee-albatross` | 10 | 1 |
| `pij-endless-centipede` | 2 | 2 |
| `pij-mere-mackerel` | 2 | 2 |

**The two largest unbounded accumulators are pairs nobody had mentioned all night** —
`damselfly`/`marlin` and the dissolved seat. I had been scoping every measurement to "the five
PA pairs", and the mechanism applies to **every subscription on the box**. Third instance of
that same error in one night, and this time it hid the largest source of growth.

The same table is the clearest evidence the caps work: mastodon holds 26 files and only 2 exceed
500 bytes — 24 telemetry lines where there would have been 24 pane dumps.

## Fix shape (unstarted)

1. **Seat teardown should drop the seat's subscriptions**, in both directions — the entries it
   holds as watcher, and its entries in others' sidecars.
2. **The sweep should skip watchers whose descriptor is `dissolved`/`failed` or whose pid is
   dead**, so an orphan subscription stops writing even if teardown missed it.
3. **Report the drop**, rather than doing it silently — a subscription disappearing is a
   supervision change and should be visible, per the `inert-subscription` reasoning.

**Verify by driving it**: dissolve a seat holding a live subscription and assert no further
captures are written — not by reading the teardown path.
