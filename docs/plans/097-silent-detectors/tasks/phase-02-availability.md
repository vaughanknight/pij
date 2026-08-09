# Phase 2 tasks — `#141` · `status-stale` states WHICH failure it is

**Stream**: s097 silent-detectors · **Runs after** #156 and #114 (same file).

**Files you may write**: `.pi/extensions/pij/core/anomalies.ts` ·
`.pi/extensions/pij/core/anomalies.test.ts`

**You may NOT write**: `core/watchdog.ts`, `core/daemon/watchdog-manager.ts` (stream `s096`),
`daemon.ts`, `core/types.ts`, `core/state.ts`.

---

## The defect

`status-stale` fires on **card age**, which is the seat's own output. A card goes stale for two
unrelated reasons and the row cannot distinguish them:

- **Discipline** — the seat is working and not reporting.
- **Availability** — the seat is not there at all.

They want **opposite responses**. The first wants a nudge to report; the second means nudging is
pointless because nobody is reading.

Measured cost (`ai-manu`, reported in `#141`): a PM read a 181-minute card as discipline and told
the seat to refresh or park. It was **availability** — the seat had been unresponsive ~3h and
came back to **nine queued nudges**.

## READ THIS BEFORE DESIGNING — the field the issue cites is NOT the field you will use

`#141` proposes surfacing `consecutiveSilentFires`. **That counter is in-memory only**
(`WatchdogManager`'s private `RuntimeState`), never persisted, and owned by another stream. It is
unreachable and it is **not** what you will implement against.

**The watchdog's VERDICT is durable, and it is already on the descriptor:**

| what | where |
|---|---|
| set | `daemon.ts:813` and `:847` — `persistDaemonWrite(registry, { ...d, failureReason: "stalled" })` |
| cleared on recovery | `:821-826` (legacy) and `:836-841` (watchdog) |
| typed | `core/types.ts:294` — `failureReason?: DeathReason`, with `stalled` documented as *"peer stayed silent through its response threshold"* |

**`inputs.descriptors` is already the first input to `detectAnomalies`.** No new input, no new
persistence, no cross-stream dependency.

### Verified properties of `failureReason: "stalled"` — audited, do not re-derive

- **It is NOT a latch in the `terminal` sense.** Both clear paths carry the disjunct
  `(latch.delete("stalled") || d.failureReason === "stalled")`. `this.pushed` is in-memory, so
  after a daemon restart the latch is empty — the **second half of that disjunct is exactly the
  recover-from-lost-latch path**, and it is present in both writers. The in-memory latch guards
  **repeat notices**, not clearing.
- **A seat THE BLIND PROBE CALLS DEAD is never cleared**: the legacy path early-returns at
  `:802` on `!isAlive(d.pid)`. Per `#142` that probe is wrong in **both** directions, so the
  affected population is **not** "the dead" — it is **"seats the probe misjudges"**:
  - a **live** seat whose registry pid reads absent (the pid is the *pane's shell*, so a seat
    whose shell went while its agent runs reads dead) gets **frozen with a stale `stalled` it can
    never shed**;
  - a **genuinely dead** seat whose pid was **recycled** to an unrelated live process does *not*
    early-return, and **would be cleared** — the wrong outcome by the opposite path.

  **This is why T-2 gates on the `activityCredibility` verdict rather than on `isAlive`.** That
  choice is load-bearing, not defensive: the flag's staleness is governed by a probe known to be
  unreliable in both directions, so the row must not inherit its judgement.
- **An EXEMPT seat is skipped entirely** (`:796` returns on `isExempt`), so it is neither set nor
  cleared and may carry a stale flag across an exemption. Same shape one level out: **absence of
  clearing is not evidence of anything** for that population.
- **`failureReason` is multi-valued** (`quota` · `auth` · `model-not-supported` ·
  `bind-timeout` · `dead` · `pane-input-blocked` · `unknown`). **Check `=== "stalled"`
  specifically.** No other value is evidence about silence.
- **It is binary.** `stalled` is `consecutiveSilentFires >= 2`; the `suspect` state (exactly one
  unanswered fire) is **not persisted**. So **presence** is positive evidence; **absence proves
  nothing** and must never be read as "nudges were answered".

---

## T-1 · Surface the availability evidence on the row

When a `status-stale` row is emitted for a descriptor whose `failureReason === "stalled"`, append
a clause naming that evidence.

## T-2 · What the row may and may not SAY — the hard part

**Three claims are forbidden. Each has a measured reason.**

1. **Never claim DISCIPLINE.** `lastEventAt` does not measure work — it is refreshed by the
   daemon whenever it observes the seat's tmux **pane** as `busy`, throttled to ~10s
   (`daemon/loop.ts:158-176`; full findings in
   `docs/plans/097-silent-detectors/lasteventat-findings.md`). A seat **draining a queue of
   nudges** looks identical to a seat working — which is *precisely* the misdiagnosis `#141`
   reports. A fresh `lastEventAt` therefore supports only *"reachable, and its pane has been
   busy"*.
2. **Never say the seat IS UNAVAILABLE.** Say it **crossed the silence threshold**, and name the
   evidence. *"This seat is unavailable"* will be read as a fact about the world by everyone who
   sees it; *"the watchdog's silence verdict is on this seat"* is what is actually known. Same
   discipline as `#154`'s row reporting an **observation** rather than a fatality — **prose is
   where a claim you have already disowned quietly comes back**.
3. **Never read ABSENCE of the flag as "nudges answered"** (it is binary — see above). A row
   without the clause says nothing about availability either way, and must not imply it does.

**Route a misjudged-liveness seat elsewhere.** Because the flag's clearing is governed by a probe
that is wrong in **both** directions (`#142` — a live seat can read dead and freeze with a stale
`stalled`; a dead seat with a recycled pid can be wrongly cleared), gate the availability clause
on the `activityCredibility` verdict rather than on any liveness probe: if the seat is
`superseded`, this is **not** an availability note about a live seat ignoring nudges — it is
`#114`'s parked-death territory, and rendering it the `#141` way is the same category error this
whole stream exists to fix.

## T-3 · Tests — LABELLED, and assert MEANING not MECHANISM

| # | criterion | kind |
|---|---|---|
| 1 | `status-stale` row for a seat with `failureReason: "stalled"` carries the availability clause | **BEHAVIOURAL** |
| 2 | same row without the flag is byte-identical to today | **PRESERVED-PROPERTY** |
| 3 | `failureReason: "quota"` (or any non-`stalled` value) does **not** produce the clause | preserved / scope-pin |
| 4 | a `superseded` seat does **not** get the availability clause | preserved / scope-pin |
| 5 | the row never contains the word "discipline" or asserts the seat is working-but-not-reporting | preserved / scope-pin |

> ### ⚠ ASSERT WHAT THE FIELD MEANS, NOT THE COUNT THAT CURRENTLY PRODUCES IT
>
> Stream `s096` is changing **when** `stalled` is emitted: their answered-fire counter is keyed
> on `statusAt`, so a seat that files a status card will **cap at `suspect`** and never climb to
> `stalled`. After they land, `failureReason: "stalled"` means *"silent through threshold **and**
> did not card"* rather than *"silent through threshold"*.
>
> **That makes this assertion sharper, not weaker** — but a test that encodes today's threshold
> semantics as an invariant **will fail on their merge, for a good reason**, which is the worst
> kind of red. Assert *"the watchdog's silence verdict is present on this seat"*. Never assert a
> fire count, a threshold, or a nudge tally.

Run criterion 1 against the unfixed tree and watch it fail. Mutation-gate it: remove the clause,
confirm RED, restore, confirm GREEN.

---

## Gates

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s097-silent-detectors
just typecheck && just lint
npx vitest run .pi/extensions/pij/core/anomalies.test.ts
```

## Report back

diff · pre-fix failure output · mutation evidence · anything ambiguous you decided yourself.
