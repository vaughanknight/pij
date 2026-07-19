# FsChannel delivery — design read (thread-1, for o-prime deconfliction)

**Status**: READ COMPLETE — awaiting o-prime deconfliction before any implement.
**Recommendation**: **POLL-PRIMARY** for the two live inbox call sites (pi
self-inbox `index.ts:342`, telegram `bridge.ts:626`) — drop `fs.watch`, promote
the existing poll to sole driver, add a poll-loop liveness heartbeat as the
constraint-A signal. A 3-lens panel split **2–1 poll-primary** (poll-primary
advocate + detection-integrity/Stream-1 critic; hybrid advocate dissenting).
**One open decision is genuinely yours** (§7): how the liveness heartbeat
persists without write-amplification. Everything else resolves.

---

## 1. Grounded architecture (verified, corrections folded)

- `FsChannel.watch` (channel.ts:213-260) is **already hybrid**: real `fs.watch`
  + a 1.5s unref'd fallback poll. `POLL_MS=1500` is *defined* at channel.ts:70,
  *consumed* at line 252 (`setInterval(scan, this.watchOpts.pollMs ?? POLL_MS)`).
- **Only two non-test inbox `watch()` call sites**: `index.ts:342` (each live pi
  seat watches its OWN inbox) and `telegram/bridge.ts:626`. Nothing watches
  inboxes centrally.
- The **daemon is already poll-primary** for tmux seats: `daemon.ts` `tick()`
  every ~600ms (`TICK_MS`), `drainTmuxInbox` (loop.ts:469) scans live tmux
  inboxes on tick. **Zero `channel.watch` call sites in the daemon.**
- So fleet-scale `fs.watch` inbox count = (N live pi seats × 1 self-watcher) + 1
  telegram, each opened **once per process**, disposed at shutdown. **Never over
  the ~1395 never-reaped descriptors.**
- FSEvents watcher **open** cost (DL-004, mutation-proven): ~6ms mocked vs
  0.6–1.6s real. In prod, paid **once per live process** (amortized); it only
  balloons in tests that fire `session_start` N times.
- **Correction**: double-drain safety is the per-**file** `seen` set alone
  (channel.ts:231/234) — the 20ms debounce only coalesces `fs.watch` bursts; the
  fallback poll calls `scan()` **un-debounced**. Poll+watch collapse via `seen`,
  not the debounce.
- **Correction**: the injectable `watchFactory`/`pollMs` seam **already exists**
  in the constructor (channel.ts:76-82, honored at 244/252). `index.ts:283` +
  the telegram construction simply don't pass `watchOpts`. Seam-first is a
  one-line thread-through, not new seam construction.

## 2. The fork, costed on the axes that decide it

| Axis | Poll-primary (drop watch) | Watch-primary + poll-net + miss-counter |
|---|---|---|
| **Delivery latency** | ≤ cadence (chosen SLA, load-independent) | ~20–70ms happy path; ≤ poll on drop |
| **Silent drops** | None by construction (no watch to miss) | Possible; poll masks, miss-counter surfaces |
| **shipped==tested** | ✅ CI drives the real prod path | ❌ tests inject no-op watch; real drop never in CI |
| **Open cost** | Zero handles/seat | 0.6–1.6s FSEvents open/seat (amortized) |
| **Correlated failure** (compaction stalls loop) | Stale heartbeat is **observable** after unblock | Poll-net **dead too** exactly when needed |
| **Constraint-A signal** | Loop-liveness stamp (1 timestamp compare) | Miss-**attribution** (trigger-tag scan, grace window) |
| **Complexity** | One mechanism | Two mechanisms + miss accounting + debounced persist |
| **Band-aid retirement** | At the **root** (prod genuinely cheap) | Test-only (prod still pays open) |

**Why poll-primary here.** The hybrid's one irreplaceable win is the ~20–70ms
happy path — but **neither live call site is latency-critical to sub-100ms**
(pi self-inbox drain + telegram forward; a prime→coder steer is fine at
sub-second). Against that single win sit: shipped==tested, no-silent-drop, and
the correlated-failure catch — all of which are *detection-integrity* wins,
your Stream-1 charge. The hybrid advocate itself conceded the miss-counter needs
a debounced persist (a dead watcher writes the descriptor on *every* delivery)
and leans on a sender-clock latency read (benign only single-host).

## 3. Constraint A — resolved (transformed, not eliminated)

Under poll-primary there is **no watch-miss to attribute**. The signal flips
from a two-mechanism differential to a **poll-loop liveness heartbeat**: each
`scan()` records `lastInboxScanAt` for the seat; `detectAnomalies`
(anomalies.ts:125) gains a rule that **mirrors spawn-limbo verbatim**
(anomalies.ts:138-149) — for each live-bound seat, `now - lastInboxScanAt >
K×cadence` ⇒ emit a new `AnomalyKind` (`inbox-poll-stalled`), surfaced on the
daemon tick via `AnomalySweep.tick()` (anomaly-sweep.ts:56) which already reads
`registry.list()` → `AnomalyInputs`. One timestamp compare separates the three
states you named: **starved** (stamp stale) / **genuinely-idle** (stamp fresh,
inbox empty) / **falsely-working** (stamp fresh, inbox draining).

**Honest caveat (the critic's, kept front-and-centre):** the unref'd poll can
*itself* stall under compaction, so this heartbeat is **load-bearing** to keep
the ceiling honest. Poll-primary trades "silent watch death masked by poll" for
"silent poll death **caught by** heartbeat" — strictly better (today's watch
death is *never* detected), but it is a transform, not a deletion. Put
`watcherMissCount`/episode into `Anomaly.evidence` so `latchKeyOf` re-alerts per
stall episode (empty evidence latches once-per-node forever — spawn-limbo's
"emptiness is the symptom" does *not* re-alert, which is wrong for a recurring
fault).

## 4. Constraint B — dissolved

The "poll over 1395 descriptors" cost trap **never existed in code**: the poll
is a per-`watch()`-call `setInterval` over one inbox dir, and the daemon's tmux
drain is already gated to live/bound seats. Cost = cadence × live-seat count of
microsecond `readdir`s — trivially under the daemon's existing all-tmux-inbox
tick scan. The measurable poll cost still becomes **direct pressure for Stream-3
reaping** (an over-broad `isLive` inflates it), which is the good kind of
pressure.

## 5. Constraint C — chosen cadence & ceiling

**Recommend 500ms** delivery cadence for live-bound seats — just under the
daemon's 600ms tmux tick so a pi seat is never *less* responsive than a tmux
seat, giving a prime uniform sub-tick interactive latency across seat kinds.
**Latency ceiling = ≤ 520ms** (500 + 20ms debounce), stated as the honest,
**load-independent** delivery SLA: a message not caught this tick is caught the
next — no unbounded tail. (The critic argued 750ms to keep the heartbeat sampler
faster than the stamp; unnecessary — the compare is level-triggered on a
persisted stamp, so the 600ms tick observes a 500ms stamp fine.)

## 6. Seam-first plan (o-prime's condition)

**First concrete artifact**: thread `watchOpts` through the two construction
sites, promoting the *existing* constructor seam.
- `index.ts:283`: `new FsChannel(pijHome)` → `new FsChannel(pijHome, { pollMs:
  500, watchFactory: () => ({ close(){} }) })` (no-op watcher = zero handle).
- Telegram construction site: identical promotion.
- Boot tests + `channel.test.ts` inject a controllable/no-op watcher at `pollMs:
  5` for deterministic sub-100ms drains.

**Decisive property**: because **prod also uses the no-op watchFactory**, the
FSEvents open cost is gone *in production* — so the `index.test.ts` 20s band-aid
retires **at the root** (test matches a genuinely-cheap prod), not by mocking a
still-expensive prod. This is why seam-first lands cleaner under poll-primary
than under hybrid (where prod keeps paying the open and ships a path CI never
drives). This artifact alone kills the last loosened gate (thread-3
boot-contention).

## 7. THE decision for you + remaining open questions

**Your call (the one real tax):** how does `lastInboxScanAt` persist **without
per-500ms-per-seat write-amplification** (the daemon deliberately avoids this,
loop.ts:121)? `lastEventAt` (types.ts:165) **cannot** piggyback — it's
pi-event-bumped, so it goes stale on an idle-but-alive seat (the exact state
that must NOT read as dead). Three candidates:
- **(a) Piggyback on the existing watchdog heartbeat write** — cheapest, but
  stall-detection latency = watchdog cadence (coarse, ~minutes).
- **(b) Decoupled cadences** — deliver at 500ms (readdir only, no persist),
  stamp the heartbeat at a chosen coarser cadence (e.g. 2–3s) → bounded writes,
  ~K×3s detection. *My lean.*
- **(c) Tiny per-seat sidecar file** stamped per-poll, read by the tick — avoids
  the registry merge but is still per-500ms I/O.

Other open questions, now answerable: **poll cadence** → §5 (500ms). **Miss
mechanism** → §3 (liveness stamp, not attribution). **Failure isolation** → one
signal, thresholded: a stale stamp is a stalled loop; there is no watcher/slow
split to make. **Restart-rider packaging** → the seam + no-op watchFactory ship
together as one delivery-path change; verified live by the existing
`daemon.test.ts` + the retired `index.test.ts` band-aid running green at the
honest 5s budget.

## 8. Proposed sequence (on your go)

1. **Seam + no-op watchFactory** at the two construction sites (poll-primary
   delivery); retire the `index.test.ts` band-aid at the root. — kills thread-3.
2. **Liveness heartbeat** persistence (your §7 ruling) + `inbox-poll-stalled`
   AnomalyKind mirroring spawn-limbo, evidence-keyed for per-episode re-alert.
3. Verify: full suite green at honest 5s; a forced poll-stall surfaces the
   anomaly on the daemon tick to the effective parent.

Nothing here is built until you deconflict — it touches every delivery path.
