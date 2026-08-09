# 098 — daemon tick performance: findings

**Stream** `daemon-perf` · **Seat** `pij-related-anglerfish` · **Prime** `pij-continuing-ermine`
**Status**: investigation complete, no production code written.
**Date**: 2026-08-08

Every number below was produced by a command run on this machine during this session.
Nothing here is inferred from reading a loop.

---

## 1. Verdict in one paragraph

The tick is **linear in the working set**, and the working set is **every non-dissolved
descriptor that has ever existed** — 549 of them, against 42 real tmux panes. Two call sites
account for **79%** of a tick, and both run once per descriptor per tick: a
`lastTickAt` heartbeat that performs a **full fsync-barriered registry publish** for every
daemon-owned descriptor (`daemon.ts:292`, 52% of tick), and a suspension probe that spawns a
**`ps` subprocess** for every descriptor carrying a pane (`runtime-axis.ts:116`, 26% of tick).
The prime's hypothesis — that the liveness defect and the performance defect are the same
defect — is **upheld in its conclusion and wrong in its mechanism**: `eligible()` performs no
I/O and is not on the hot path, and `isAlive(pid)` already filters 511 of the 549 corpses.
The retirement gap is real, but it bites through `registry.list()` breadth, not through
`eligible()`.

---

## 2. Where the time goes — measured

### 2.1 The live daemon, sampled non-invasively

`sample 39975 15 1` against the running daemon (pid 39975, 5h37m uptime), 12,568 main-thread
samples ≈ 12.5s of run time in a 15s window — i.e. the main thread is **~84% saturated**.

| phase | ms | % main thread |
|---|---:|---:|
| subprocess spawn (`execFileSync`) | 5810 | **46.2%** |
| fsync | 5297 | **42.1%** |
| readFileSync | 199 | 1.6% |
| readdirSync | 130 | 1.0% |
| renameSync | 115 | 0.9% |
| everything else measured | 291 | 2.3% |
| **accounted** | **11941** | **95.0%** |

Command: `sample 39975 15 1 -file /tmp/daemon-sample.txt`, aggregated by native frame over the
main-thread block only.

**This refutes the registry-read theory outright.** Reading every descriptor is 1.6% of a tick.
Measured directly: `registry.list()` over 549 descriptors is **17.0ms warm** (10 iterations,
170.2ms total). Seven `list()` calls per tick is ~119ms — 0.4% of a 27s tick.

### 2.2 JS-level attribution, via a V8 CPU profile of a real tick

Run against an **isolated APFS clone** of `~/.pij` (`/tmp/pij-perf-home`, every absolute path
inside the 579 descriptors rewritten to the clone, tmux ports stubbed). Harness:
`docs/plans/098-daemon-perf/bench/replay-profile.ts`.

Profiled tick: **11,040ms**. Self time:

| self ms | % | site |
|---:|---:|---|
| 5927 | **52.5%** | `fsync` |
| 2956 | **26.2%** | `spawn` |
| 766 | 6.8% | `chainEventsOf` — `core/anomalies.ts` |
| 248 | 2.2% | `readFileUtf8` |
| 145 / 137 / 124 | 3.6% | `link` / `rename` / `open` |

Walking the profile's call tree to the nearest pij frames:

**fsync (5927ms) is 100% inside `FsRegistry.publish()`** —
```
2013ms 34.0%  writeTextAtomic <- writeAtomic <- syncIdentitySnapshot <- publish
 994ms 16.8%  writeTextAtomic <- writeAtomic <- publish <- write
 658ms 11.1%  maybeFsyncSync  <- publishNoReplace <- claimOwnerRecord    <- claimIdentityDetailed
 656ms 11.1%  maybeFsyncSync  <- publishNoReplace <- claimIdentityRecord <- claimIdentityDetailed
 644ms 10.9%  maybeFsyncSync  <- publishNoReplace <- claimIdentityRecord <- syncIdentitySnapshot
 290ms  4.9%  maybeFsyncSync  <- writeTextAtomic  <- writeAtomic         <- syncIdentitySnapshot
```

**spawn (2956ms) is 100% from one site** —
```
2956ms 100%   inputsFor <- drive <- tick  (core/daemon/runtime-axis.ts) <- Daemon.tick (daemon.ts)
```

### 2.3 The two call sites, named

**(a) `daemon.ts:286-293` — the `lastTickAt` heartbeat.**

```ts
for (const snapshot of this.registry.list()) {
    if (!daemonOwnsDelivery(snapshot.harness ?? "pi", snapshot.deliveryMode)) continue;
    const latest = this.registry.read(snapshot.id);
    if (latest) this.registry.write({ ...latest, lastTickAt: tickAt });   // <- line 292
}
```

Instrumented by patching `FsRegistry.prototype` (harness:
`docs/plans/098-daemon-perf/bench/write-callers.ts`) — **every one of the 132 registry writes
in a tick originates at `daemon.ts:292`. Nothing else writes.**

```
tick: 11716ms
total counted operations: 132
  132  registry.write  Daemon.tick .pi/extensions/pij/daemon.ts:292:30
```

132 is exactly the count of `claude` (62) + `copilot` (70) descriptors in the working set —
`daemonOwnsDelivery` filters on harness and delivery mode only, **not on lifecycle and not on
liveness**, so a claude seat that died in July is still heartbeat-written every 600ms today.

**Each of those writes costs ~5 fsync-barriered atomic publishes**, because
`FsRegistry.publish()` writes the descriptor *and* `syncIdentitySnapshot()` *and*
`claimIdentityDetailed()`'s owner + identity records, each via `writeTextAtomic` →
`fsync(file)` + `fsyncDirBestEffort(dir)` (`adapters/atomic-file.ts:101-118`).

Measured cost of one atomic write (file fsync + dir fsync) on this machine: **18.1ms**
(40 iterations). Independent of directory size — `/tmp` scratch dir 18.09ms vs `~/.pij` with
579 JSON files and 929 subdirectories 18.35ms. **It is the physical barrier, not the
directory.** 132 writes × ~45ms (≈2.5 atomic writes' worth of fsyncs each) ≈ 5.9s — which
closes against the 5927ms measured.

**(b) `core/daemon/runtime-axis.ts:116` — the suspension probe.**

```ts
paneSuspended: descriptor.paneId === undefined ? null : this.deps.isSuspended(descriptor.pid),
```

`isSuspended` is wired at `daemon.ts:342-351` to `execFileSync("ps", ["-o","state=","-p",...])`.
**548 of 549 working-set descriptors carry a `paneId`**, so this is ~548 subprocess spawns per
tick. 2956ms / 548 ≈ 5.4ms each, consistent with the measured subprocess cost below.

### 2.4 Why the real daemon is 27–34s where the replay is 11s

The replay stubs the tmux port, so it does not pay for `isPaneDead()` — which
`reconcileDeaths` calls per descriptor (`daemon.ts:644`, `paneExists:` callback) against a
`registry.list()` of all 549. Measured real subprocess cost on this machine (50 calls each):

| call | mean |
|---|---:|
| `tmux capture-pane` on a **live** pane | 6.70ms |
| `tmux capture-pane` on a **gone** pane | **9.05ms** (errors, and costs *more*) |
| `tmux display-message` on a gone pane | 7.48ms |

~548 `ps` + ~548 `tmux display-message` ≈ 1100 spawns ≈ 7–9s, which is the gap between the
11s replay and the 27–34s reality, and matches the live sample's spawn share (46%) exceeding
the replay's (26%).

---

## 3. The growth law — measured, not asserted

`docs/plans/098-daemon-perf/bench/growth-law.ts` builds pruned clones of the real home
(deterministic sorted prefix, so each size is a subset of the next) and times a real
`Daemon.tick()` after a warm-up tick.

| descriptors | tick ms | ms/descriptor | registry writes | registry reads | `list()` |
|---:|---:|---:|---:|---:|---:|
| 40 | 1655 | 41.4 | 11 | 22 | 7 |
| 100 | 1560 | 15.6 | 14 | 28 | 7 |
| 200 | 5395 | 27.0 | 40 | 83 | 7 |
| 349 | 6795 | 19.5 | 74 | 153 | 7 |
| 548 | 11122 | 20.3 | 127 | 262 | 7 |

Fitted exponent between consecutive points, over the range where fixed costs stop dominating:

```
200 -> 349: size x1.75, time x1.26  (exponent 0.41)
349 -> 548: size x1.57, time x1.64  (exponent 1.09)
100 -> 548: size x5.48, time x7.13  (exponent 1.15)
```

**The tick is linear in the working set** (exponent ≈ 1.0–1.15; the super-linear-looking
100→200 step is the point where the daemon-owned subset starts appearing in the sorted
prefix). Registry writes scale linearly with it: 14 → 127. `list()` is constant at 7 per tick
and, as established, irrelevant.

### 3.1 The same series with real subprocess I/O — because the first one proved less than it looked like

The table above was measured with the tmux port **stubbed**, which zeroes the spawn half of the
tick. Applying s099's correction (an assertion must carry the claim, not the precondition that
makes it reachable): a linearity result measured on a configuration where 26–46% of the cost is
set to zero is evidence about the *fsync* half, not about the tick. The claim in the section
heading was stronger than the experiment behind it.

Re-run with `capturePane` and `isPaneDead` hitting **real tmux**, and only the mutating methods
(`sendText`, `killPane`) stubbed — a profile must never type into a pane or kill one.
Harness: `bench/growth-law-realio.ts`.

| descriptors | tick ms | ms/descriptor | registry writes | registry reads |
|---:|---:|---:|---:|---:|
| 100 | 2997 | 30.0 | 16 | 34 |
| 200 | 8344 | 41.7 | 46 | 98 |
| 348 | 14051 | 40.4 | 90 | 188 |
| 547 | 18291 | 33.4 | 153 | 324 |

```
100 -> 200: size x2.00, time x2.78  (exponent 1.48)
200 -> 348: size x1.74, time x1.68  (exponent 0.94)
348 -> 547: size x1.57, time x1.30  (exponent 0.58)
100 -> 547: size x5.47, time x6.10  (exponent 1.06)
```

**The claim survives the stronger experiment.** Overall exponent **1.06** — linear — and the
absolute cost moves from 20.3 to 33.4 ms/descriptor, materially closer to the live daemon's
~51 ms/descriptor. The residual gap is the `listPanes`/pane-signals path, still stubbed here,
plus contention from 42 live agent panes that the live daemon pays and this harness does not.

Both series agree on the property that matters: **nothing in the tick is bounded by the number
of live seats.**

Real-world slope, from the live daemon rather than the replay: 27,425ms / 538 = **51.0
ms/descriptor**; 34,234ms / 538 = 63.6 ms/descriptor. Observed range today in the daemon pane:
16,458ms → 38,645ms at 539–540 live (30.5–71.6 ms/descriptor; the variance is machine
contention from 42 live agent panes).

**The prime's unbounded-degradation claim is upheld.** Nothing in the tick is bounded by the
number of *live* seats. It is bounded by the number of *descriptors that have ever existed and
not been dissolved*, which is monotonically increasing. At the measured real slope of ~51
ms/descriptor, the tick passes 60 seconds at **~1,200 descriptors** — roughly twice today's
population, i.e. weeks away at the observed rate of accumulation.

---

## 4. The retirement gap — the hypothesis, corrected

The brief's hypothesis is that 507 terminal-stamped sessions stay in the working set because
`eligible()` (`core/daemon/watchdog-manager.ts:166-207`) never tests `terminal`. Measured
against the live registry:

```
working set (lifecycle != dissolved) : 549
  carries `terminal`                 : 515
  paneId GONE (vs live tmux)         : 500
  paneId LIVE                        : 48
  real tmux panes                    :  42
  pid ALIVE                          :  38          <-- the number that matters
  pid ALIVE but pane GONE            :   2          <-- recycled-pid corpses
```

**`eligible()` is not the mechanism, on two independent grounds:**

1. **It does no I/O.** `WatchdogManager.reconcile()` is pure map bookkeeping; it appears
   nowhere in the CPU profile. Fixing `eligible()` alone would not move the tick by a
   measurable amount.
2. **`isAlive(pid)` already retires them.** `reconcile()` gates on
   `!eligible(session) || !this.deps.isAlive(session.pid)` (`watchdog-manager.ts:236`), and
   only **38** of 549 descriptors have a live pid. The recycled-pid failure (#142) is real but
   affects **2** descriptors right now, not 507.

**The actual retirement gap is one level up**: the hot loops iterate
`this.registry.list()` and `this.index.all()`, neither of which filters on liveness at all.
`daemonOwnsDelivery` (`core/harness/pi.ts:15`) tests harness and delivery mode only. So the
507 corpses are not retained *by the watchdog* — they are retained by **every consumer of
`registry.list()`**, and the watchdog is simply the one place someone thought to look.

Second path, to answer the brief's question 3 directly: **yes, there is a second path, and it
is the dominant one.** Even with `eligible()` fixed, `daemon.ts:292` would still heartbeat-write
all 132 daemon-owned descriptors and `runtime-axis.ts:116` would still `ps`-probe all 548.

### 4.1 Pane ventriloquism — the prime's mechanism, reproduced and bounded

The prime supplied a proven mechanism mid-investigation: `observeActivity`
(`core/daemon/loop.ts:171-185`) refreshes `state` and `lastEventAt` from pane readiness **with
no terminal guard**, so when a pane id is re-issued, a live seat's work writes activity into a
dead seat's descriptor. Any retirement rule keyed on staleness would then never retire that
corpse, because someone else keeps it fresh.

I ran the count the prime asked for — descriptors whose `paneId` is currently held by a pane
whose real pid belongs to a *different* descriptor
(`tmux list-panes -a -F '#{pane_id} #{pane_pid}'` joined against the registry):

```
working set: 549   real panes: 42
live panes claimed by >1 descriptor                          :  9
CORPSES BEING VENTRILOQUISED (pane held by a different, live descriptor):  9
live panes with exactly one correct claimant                 : 27
descriptors whose paneId exists but whose pid is NOT the pane's pid: 13
```

**The mechanism is real and reproduces exactly**, including the prime's own case. Every one of
the nine corpses carries `terminal.disposition = unrequested-by-pij`, and every one has a
`lastEventAt` within seconds of its live twin's:

```
pane %47 (real pid 31163)
   corpse pij-unwilling-butterfly pid 19325 terminal=unrequested-by-pij lastEventAt=04:45:50.847Z
   live   pij-sacred-orangutan                                          lastEventAt=04:46:10.289Z
pane %11 (real pid 65242)
   corpse pij-able-eel           pid 57934 terminal=unrequested-by-pij lastEventAt=02:09:57.809Z
   live   pij-tiny-bug                                                  lastEventAt=02:09:59.235Z
pane %23 (real pid 3163)   <- two corpses on one live pane
   corpse pij-able-egret         pid 65592 terminal=unrequested-by-pij lastEventAt=05:07:41.602Z
   corpse pij-zoophagous-firefly pid  5116 terminal=unrequested-by-pij lastEventAt=05:07:51.902Z
   live   pij-technological-starfish                                    lastEventAt=05:07:50.788Z
```

A 1.4-second gap between a corpse's activity stamp and its live twin's is not coincidence; it
is the write.

**Vacuity check on this measurement.** Applying s093's heuristic (spend the gate on the newest,
least-examined artifact — this count was written in one pass to answer the prime's ask), I fed
the counter synthetic pane tables with known answers to confirm it can report something other
than the number it reported:

```
empty pane table                -> 0    (expect 0)
all panes, pid = first claimant -> 12   (expect >0: every duplicate claimant)
all panes, pid matches nobody   -> 0    (expect 0: no live occupant to ventriloquise)
real tmux pane table            -> 9
```

It discriminates in both directions, so the 9 is a measurement rather than a constant.
Harness: `bench/pane-ventriloquism-selftest.mjs`.

The self-test also surfaced a broader figure: **27 descriptors share a `paneId` with at least
one other descriptor, across 13 panes.** Only 9 of those are live ventriloquism; the remainder
are corpse-on-corpse collisions on pane ids that no longer exist. So pane-id reuse has been
overwriting descriptor identity for far longer than the currently-live cases show, and the
9 is the instantaneous visible slice of a larger historical corruption.

**But it cannot be the reason the working set never shrinks, and I want to be exact about why.**
Ventriloquism requires a *live* pane to do the ventriloquising, so the number of corpses it can
keep fresh at any instant is bounded above by the number of live panes — **42**, currently 9 in
practice. It cannot account for 491. The other ~482 corpses have panes that do not exist at
all, so nothing refreshes them: they are stale, they are `terminal`-stamped (515 of 549 carry
one), and they are *still* not dissolved.

So there are two distinct retention mechanisms, and they need different fixes:

| population | why it is retained | fix |
|---:|---|---|
| ~9 (≤42) | actively refreshed by a live seat on a recycled pane — staleness-keyed retirement will never fire | terminal guard in `observeActivity`; identity check (pane pid == descriptor pid) before attributing activity |
| ~482 | stale **and** `terminal`-stamped, and nothing dissolves them | a retirement rule that actually dissolves; today `terminal` is stamped and then nobody acts on it |

The larger population is the one that drives the tick, and it is not defeated by ventriloquism —
it is simply never collected. That distinction matters for sequencing: fixing `observeActivity`
is correctness-critical (a live seat's work is being recorded against a dead seat's identity)
but will not measurably move the tick.

**This also sharpens the brief's warning about the obvious fix.** Excluding `terminal`-stamped
sessions would exclude all 515 — including the 9 whose freshness is manufactured by someone
else's work. Their freshness proves nothing about them in either direction, so neither their
presence nor their staleness is usable as a retirement signal. That is a second, independent
reason not to key retirement on `terminal`, on top of #142 and #155.

---

## 5. The instrument now corrupts its own measurement

Reported live by the prime mid-investigation: `pij-shaggy-lark` raised a stalled alert
("has gone quiet ... pane alive but silent") while its pane footer read `Working` and
`pij state` read `working · active, last event 2s ago`. The same output carried
`daemon tick: stale (45s old)`.

The mechanism, from source:

- The stall verdict is `daemon.ts:774-777`:
  `ageMs = now - Date.parse(d.lastEventAt)`; `stalled = (d.state === "working") && ageMs > STALE_AFTER_MS`, with `STALE_AFTER_MS = 60_000` (`core/state.ts:14`).
- For a control-plane peer, `lastEventAt` is refreshed **by the daemon's own pane
  observation**, once per tick (`daemon.ts:552-560`, `capturePane` → `observeActivity`).

So `ageMs` does not measure "time since the seat last worked". It measures **"time since the
observer last successfully looked"**. Let `T` = tick duration and `k` = consecutive
observations in which pane-change detection does not fire (the known `booting`/unknown-layout
case the code already documents at `daemon.ts:556-560`). Reported age ≈ `(k+1) · T`, and a
false positive requires `(k+1) · T > 60s`.

| tick duration `T` | `k` needed for a false stall | state |
|---|---|---|
| 600ms (design, `TICK_MS = 600`) | k ≥ 100 | unreachable in practice |
| 30s | k = 1 | one missed observation is enough |
| **34s (observed)** | **k = 1** | **reachable now — and observed** |
| ≥ 60s | k = 0 | **unconditional: every working seat, every tick** |

**Answer to the prime's question (1):** false positives become reachable at `T > 30s`, which
requires only a single missed pane-change observation; they become **unconditional** at
`T ≥ 60s`, where no missed observation is needed at all. Today's ticks span 16.5–38.6s, so the
fleet is **astride the k=1 threshold** — which is why the symptom is intermittent and
per-seat rather than universal. At the measured slope this becomes unconditional at ~1,200
descriptors.

The separate `daemon tick: stale (45s old)` line has already crossed *its* threshold
unconditionally: `DAEMON_TICK_STALE_AFTER_MS = 30_000` (`core/receipts.ts:16`), and
`lastTickAt` is stamped at tick **start**, so with `T = 34s` every descriptor's tick-staleness
is >30s by the time the tick ends. **That warning is now permanently on, fleet-wide, and
therefore carries no information.**

**Answer to the prime's question (2):** this is evidence *for* unbounded degradation and it is
a worse curve than latency. Latency degrades linearly and visibly. The false-positive rate is a
**step function of a linear quantity**: harmless below `T=30s`, intermittent between 30s and
60s, total above 60s. The supervision layer does not degrade gracefully — it inverts, and the
inversion is silent because a false "stalled" is indistinguishable from a true one at the
point of consumption.

This is the coupled-instrument family (pij#160): **the observer's latency is an input to its
own verdict.** The structural fix is for staleness to be computed against evidence with its own
timestamp (the pane's own last-change time, already tracked by `paneSignals`), never against
"when the observer last looked".

---

## 6. What else is unbounded (brief question 5)

| surface | size now | bound |
|---|---:|---|
| `~/.pij` total | 1.7G | none found |
| `~/.pij/archive` | 1.0G, 2,517 files | swept, but the sweep logs `1 record(s) SKIPPED (conflicting archive state)` every tick — a permanently stuck record |
| `~/.pij/pane-signals` | 271M | one `.raw` tap file per pane ever seen; retired panes are detached but files remain |
| `~/.pij/identities` | 24M | grows with every `syncIdentitySnapshot` |
| working-set descriptors | 549 (+30 dissolved) | **the tick's linear term** |
| `~/.pij` subdirectories | 929 | one per session ever created |

The `archive sweep: 1 record(s) SKIPPED (conflicting archive state)` line appears in the daemon
pane on most ticks — a record that can neither be archived nor cleared, retried forever.

---

## 7. The cheapest honest fix, and its risk (brief question 4)

### 7.1 The trap in the obvious fix — my read

The brief asks whether excluding `terminal`-stamped sessions is a good trade, given that
`terminal` comes from a probe wrong in both directions (#142, #155).

**My read: don't take that trade, and you don't need to.** The trade is bad on its own terms —
`terminal` is a latch that is never cleared (#155), so a revived seat carries a stale death
stamp and would be silently dropped from supervision, which converts a latency bug into a
"nobody is watching this live seat" bug. That is strictly worse, because latency is visible to
the operator and a supervision hole is not.

But the trade is also **unnecessary**, because the measurement says the expensive filter is not
liveness at all. The two hot sites are expensive **per descriptor regardless of liveness**, and
both can be made cheap without deciding whether anything is dead:

### 7.2 Fix A — stop fsyncing a heartbeat (52% of the tick, ~5.9s)

`daemon.ts:292` performs a **full crash-durable identity-claiming registry publish** to record
a monotonically-increasing clock reading. `lastTickAt` is liveness telemetry: if it is lost in
a crash it is *regenerated 600ms later by definition*. Paying five fsync barriers for it is
paying a durability price for the one field in the descriptor that has no durability
requirement.

Three options, cheapest first, all liveness-agnostic:

1. **Write `lastTickAt` to a single separate file** — one `{id: iso}` map, one atomic write per
   tick instead of 132. Cost falls from ~5.9s to ~18ms. Readers (`pij state`, the tick-staleness
   check in `core/receipts.ts`) consult the map. **This is the single highest-leverage change
   available** and it removes 52% of the tick.
2. **Skip the write when the descriptor is otherwise unchanged and its pane is gone** — cheaper
   to implement, but still O(live panes) fsyncs and still writes corpses until they are
   dissolved.
3. **Make `publish()` skip `syncIdentitySnapshot`/`claimIdentityDetailed` when identity fields
   are unchanged** — 34%+11%+11% of the fsync cost is re-claiming an identity that has not
   moved. Independently worth doing; benefits every writer, not just the heartbeat.

### 7.3 Fix B — stop spawning `ps` per descriptor (26% of the tick, ~3.0s)

`runtime-axis.ts:116` spawns one `ps` per descriptor with a pane. **One** `ps` invocation can
report every pid at once (`ps -o pid=,state= -p <pid1>,<pid2>,...` or a single full-table read),
turning 548 spawns into 1. This is a pure adapter change at `daemon.ts:342-351` — the port
signature `isSuspended: (pid) => boolean | null` can stay if the adapter memoises one table per
tick.

Note this probe is **already dead weight for 511 of 549 descriptors** whose pid is not alive —
but that is an optimisation on top, not a prerequisite.

### 7.4 Fix C — the same `ps`-batching argument applies to `isPaneDead`

`reconcileDeaths` (`daemon.ts:644`) calls `isPaneDead` per descriptor. `tmux list-panes -a -F
'#{pane_id}'` returns every live pane in **one** subprocess (measured: the whole set in a
single call), against which 548 membership tests are free. Same shape as Fix B.

### 7.5 Together

Fixes A + B + C remove ~79% of the replay tick and, by the live sample's spawn share, more than
that in reality — without deciding that any session is dead, and therefore **without touching
the `terminal` semantics or creating a supervision blind spot**. Corpse retirement remains
worth fixing on liveness grounds (#142/#155/#171/#172), but it is no longer on the critical
path for performance, and it should not be rushed *for* performance.

---

## 8. Ownership — who should land what

Per the charter's partition, the fix is **one or two lines in files other streams own**. Stated
plainly, as the brief asks:

| fix | file:line | owner |
|---|---|---|
| **A** — heartbeat write | `daemon.ts:286-293` | **unowned in the charter's list**; nearest is s092 (`pij-complex-bat`, `daemon.ts` bootstrap/lock) |
| **A3** — `publish()` identity re-claim | `adapters/fs-registry.ts` (`publish`, `syncIdentitySnapshot`) | unassigned |
| **B** — `ps` batching | `daemon.ts:342-351` wiring + `core/daemon/runtime-axis.ts:116` | s097 (`pij-annual-lemur`) owns `daemon.ts:354` — **this is inside their range** |
| **C** — pane-liveness batching | `daemon.ts:639-648` | **s095 (`pij-fair-aphid`)** — the charter assigns exactly this range |
| corpse retirement | `core/daemon/death-reconciler.ts`, `core/state.ts` | s095 |
| `eligible()` + `terminal` | `core/daemon/watchdog-manager.ts` | s096 (`pij-opposite-owl`) — **and my finding is that this is not a perf fix; do not sell it as one** |

**Recommendation**: Fix A is the whole game (52%) and sits in a part of `daemon.ts` no stream
has claimed. Fixes B and C are small and land naturally inside s097's and s095's existing
ranges. I would not open a parallel path around any of these boundaries.

---

## 9. Citation verification against `main`

Applying s099's convergence rule to this stream's artifact. A findings document has no
fail-first criteria to re-prove, but it has the same exposure in a different currency: **every
`file:line` here is a claim that convergence can silently invalidate.** `daemon.ts` has taken
three streams this run (s092 merged as `a2a50e2`, s095 at :639-648, s097 at :354), and a
citation that has drifted still *reads* as correct — grep finds the symbol, the sentence still
parses, and the line now points at something else.

Re-verified against `origin/main` at `a2a50e2` on 2026-08-08, by extracting the file at that
ref and printing each cited line:

| citation | line on `main` | verdict |
|---|---|---|
| `daemon.ts:292` — `lastTickAt` write | `if (latest) this.registry.write({ ...latest, lastTickAt: tickAt });` | holds |
| `daemon.ts:342-351` — `isSuspended` / `ps` | `isSuspended: (pid) => { ... execFileSync("ps", ...) }` | **corrected** (was cited as 345-355) |
| `daemon.ts:552-560` — pane observation | `const pane = this.ports.capturePane(current.paneId);` (552), `observeActivity` (554) | holds |
| `daemon.ts:644` — `paneExists` | `paneExists: (paneId) => !this.ports.isPaneDead(paneId),` | **corrected** (was cited as 645) |
| `daemon.ts:671` — tick log | `this.log(\`tick: ${Date.now() - tickStartedAtMs}ms, ...\`)` | holds |
| `daemon.ts:775` — `staleAge` | `const staleAge = ageMs === null \|\| ageMs > STALE_AFTER_MS;` | holds |
| `daemon.ts:866` — `classifyDeathReason` | `const reason = classifyDeathReason(this.ports.capturePane(d.paneId));` | holds |

s092's merged change touched only the import block and `runDaemon` (hunks at `-11,9`, `-33,6`,
`-1091,7`, `-1121,6`), and its two edits to the import region cancelled out, so nothing between
lines 292 and 866 shifted. **Two citations were wrong at authoring time** — off by one and by
three — not from drift but from transcription. Both are corrected above and in the body.

**The rule generalises past tests.** s099's finding is that a proof established against your
tree can stop being load-bearing after a sibling rewrites around it. An evidence citation is a
proof of the same kind, and it is *more* fragile, because a stale line number produces no
failing signal anywhere — no suite goes red, no gate exits non-zero. The only thing that
catches it is printing the line and reading it. Whoever implements #180/#181 should re-run the
table above against their own rebased tree before trusting a single line number in this
document.

---

## 10. Reproduction


All harnesses are in `docs/plans/098-daemon-perf/bench/` and run against an **isolated clone**.
None of them writes to `~/.pij`; `profile-tick.ts` refuses a home outside `/tmp`.

```bash
# 1. isolated clone (APFS clonefile; ~5 min, negligible disk)
cp -Rc ~/.pij /tmp/pij-perf-home
python3 - <<'PY'
import glob
for p in glob.glob("/tmp/pij-perf-home/*.json"):
    s = open(p).read()
    if "/Users/<you>/.pij" in s:
        open(p, "w").write(s.replace("/Users/<you>/.pij", "/tmp/pij-perf-home"))
PY

# 2. V8 CPU profile of one real tick
npx tsx docs/plans/098-daemon-perf/bench/replay-profile.ts   # -> /tmp/tick.cpuprofile

# 3. call-site attribution of every registry write
npx tsx docs/plans/098-daemon-perf/bench/write-callers.ts

# 4. growth law
SIZES=40,100,200,350,549 npx tsx docs/plans/098-daemon-perf/bench/growth-law.ts

# 5. the live daemon, non-invasively
sample "$(python3 -c 'import json;print(json.load(open("'"$HOME"'/.pij/daemon.lock"))["pid"])')" 15 1
```

Note for anyone reusing these: a linked worktree has no `node_modules`, and `npm install`
currently fails with `--min-release-age cannot be provided when using --before`. Symlinking the
main checkout's `node_modules` is what unblocked this stream.
