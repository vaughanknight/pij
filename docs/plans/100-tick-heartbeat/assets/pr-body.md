# PR body — s100 tick-heartbeat (draft, finalised at ship)

> Three things here would otherwise be filed as defects by a reader meeting them cold, one is a
> deliberate behaviour change I was ruled into, and one is a **correction to a figure in my own
> commit message**. All five are load-bearing.

## What this does

`daemon.ts:288-293` wrote `lastTickAt` to **every** daemon-owned descriptor on **every** 600ms
tick. Measured: **132 writes per tick** (62 claude + 70 copilot), each an `FsRegistry.publish()` of
~5 fsync-barriered atomic writes. s098's profile attributes **52.5% of a 27-34s tick** to that one
line, and instrumentation showed every registry write in a tick originates there.

`lastTickAt` is liveness telemetry: it is rebuilt on a subsequent daemon tick **if one runs**, and
until then it is simply absent — which readers correctly degrade to `unverified`. So it is the field
with the least durability requirement, and it was paying the highest durability price.

**Now: one persist per tick, to one file, independent of working-set size.** Closes #180.

## Read this before filing any of it as a defect

### 1. The heartbeat file is deliberately NOT fsynced
Temp-write + rename, no `fsync`, unlike `writeTextAtomic`. That is the point: paying a physical
barrier for a value a subsequent tick rewrites *is* the defect being removed.

**The rationale is conditional, and an earlier draft of this body stated it as a guarantee.** There
is no promise of a next tick — `runDaemon()` only registers a `setInterval`, so a stopped or crashed
daemon has no next tick at all, and a delayed callback is not bounded to 600ms. What makes the
decision sound is not regeneration but **the reader's degradation**: a missing stamp reads
`unverified`, which is the safe answer. Review falsified the original phrasing; it is corrected here
rather than softened.

### 2. `fs-registry.ts` in a "heartbeat" diff is inherent, not scope creep
`cli.ts:3398` decides the **send receipt** for every claude/copilot/codex peer from
`daemonTickStale`, and `daemonTickStatus(undefined, …)` is `stale: true` (`core/receipts.ts:31-33`).
A change that only stopped writing the field would report **`unverified` for every send to all 132
daemon-owned seats**.

### 3. A descriptor's shape depends on which access path read it
Via `read()`/`list()` it carries `lastTickAt`; via `readFile` it does not. **Load-bearing** —
`sweepArchivable` uses `readFile`, which is what lands the archive behaviour below. Documented at
both ends.

### 4. The overlaid value is scrubbed before every durable write, and on terminal reads
`publish()` takes `existing` from `read()`, and callers spread read results into writes — including
`stampSenderActivity` on **every `pij send`, in a CLI process**. Without the scrub the synthetic
stamp is persisted back: a performance fix **relocating its own cost** onto the path it was measured
against. Caught by independent validation *before* implementation.

### 5. The tick axis has FOUR mechanisms because it has four structurally different cases
The tick's rebuild-whole write prunes the steady state · the lifecycle gate and scrub cover
**terminal** seats · a drop in `revive()` covers **terminal → live** · a transition check in
`publish()` covers **absent → live** and **terminal-hot → live**.

A gate cannot cover a revived seat, which is genuinely live. A drop cannot cover a dissolved seat,
which never calls `revive`. **Several review rounds were spent discovering that one mechanism
cannot serve cases that differ structurally**, and each failure looked like a bug in the mechanism
rather than a category error in the design.

## Deliberate behaviour change (ruled, not incidental)

**Archive ageing no longer uses `lastTickAt`.** `core/archive.ts:46` used it as an age axis for
"control-plane peers that write no pij events". With the field out of the descriptor,
`sweepArchivable` ages records from `lastEventAt`/`startedAt`.

**Measured blast radius**: 32 terminal records, **3** held hot *only* by `lastTickAt` — so **3
records archive roughly 20h earlier**. Bounded, in the direction #183 wants. Follow-up: **#204**.

I hypothesised this would be *hundreds*, and that the fix would collapse the working set. The
measurement said three. **Anyone planning #181 on the assumption that this shrinks the working set
should stop.**

## AC-13 was restated, not met

> **AC-13′** — the overlay never shows a **dissolved** seat as live, and a reincarnation stamp is
> bounded by **the next heartbeat write**, and in its absence by the 30s staleness grace.

**Residual, asserted by criteria rather than merely documented**: a freshly revived seat is live, so
it receives the overlay, and with a stopped daemon there is no next write to end the inheritance.
That is optimistic about a seat that is **genuinely alive** — strictly better than the two
falsehoods removed (a dissolved seat reading live; a live seat reading dead).

An earlier commit message bounded this residual at "one tick / ~600ms". **That was wrong** — there
is no next write when the daemon is stopped. Corrected here and in the criteria.

## CORRECTION to a figure in commit `4ec444ec`

That commit's message says **"588 of them on the machine this was found on"**, about legacy
descriptors carrying their own `lastTickAt`. **The correct figure is 164.**

588 was the *total descriptor count*, measured that morning for a different question and then spent
as the size of the legacy-stamp population. Re-measured on the live registry:

```
total descriptors                      647
carrying their own lastTickAt          164
NO lifecycle                           482
lifecycle-absent AND carrying a stamp    0
lifecycle-absent AND daemon-owned        0
```

**The commit is immutable; this is the correction of record.** An authoritative-looking number is
inherited rather than re-derived, so leaving it would propagate a 3.5× overstatement.

**The zero intersections also resize one finding honestly.** The legacy re-adoption defect is real
and correctly diagnosed, and has **zero live instances** — every lifecycle-absent record here
belongs to a harness family the daemon never owns. **Latent, not active.** Fixed because nothing
prevents a future record from hitting it, not because seats are affected today.

## Evidence

- **Write count**: reproduced independently, 132 exactly, harness split matching s098's.
- **fsync cost**: s098 measured 18.1 ms/write under fleet load; this stream measured **4.86 ms**
  quiet. Not a contradiction — **the heartbeat is part of the load that makes each fsync
  expensive**, so the two are one system at two points on its own feedback curve. Projections use
  the conservative 4.86 ms.
- **Criterion kinds are labelled** — behavioural / new-API / preserved-property / mutation-only — so
  a reader seeing green ticks can tell which of them could ever have failed.
- **Mutation kill sets are OBSERVED, not intended.** Several predicted pairings were false and are
  corrected from what actually died.
- **Multiple independent review rounds**, each with reviewer-authored mutants and reproduced probes.

## Corrections to #180 itself

Its **mechanism** is right: `daemonOwnsDelivery` filters on harness and delivery mode only, never
lifecycle. Its **illustration** is not — `list()` drops `dissolved`, and all 132 written descriptors
are `lifecycle: bound`. **Zero terminal records in the write set**, so "dead seats are being written
every 600ms" must not be used as the justification. The count and the fix are unaffected.
