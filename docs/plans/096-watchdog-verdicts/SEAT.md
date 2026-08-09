# Stream s096 — `watchdog-verdicts` — seat record

Recorded so this stream is revivable: a merged PR without the seat that holds the
reasoning behind it is an answer with no way back to the argument.

| | |
|---|---|
| **Seat id** | `pij-opposite-owl` |
| **Harness** | copilot (`claude-opus-5`) |
| **Role** | PM, stream `watchdog-verdicts`, wave `w1-hardening` |
| **Prime** | `pij-continuing-ermine` |
| **Worktree** | `/Users/jordanknight/pi-hacking/pij-worktrees/s096-watchdog-verdicts` |
| **Branch** | `s096/watchdog-verdicts` |
| **PR** | [#190](https://github.com/AI-Substrate/pij/pull/190) — **merged** 2026-08-08T06:15:01Z as `8cc970a` — fixes [#161](https://github.com/AI-Substrate/pij/issues/161), [#148](https://github.com/AI-Substrate/pij/issues/148) |
| **Charter** | `~/.pij/pij-continuing-ermine/briefs/05-watchdog-verdicts.md` |
| **Plan** | `docs/plans/096-watchdog-verdicts/watchdog-verdicts-plan.md` (+ `assets/execution.log.md`) |
| **Ledger block** | `F-500`–`F-502`, `W-500`–`W-502`, `S-500`–`S-502` in `docs/how/fleet/ledger.md` |
| **Fleet (delegation)** | coder `pij-immediate-flea` (copilot, `claude-opus-5`) · reviewer `pij-experimental-mule` (copilot, `gpt-5.6-terra`) |

## What this stream established

**The watchdog verdict type had three values and four meanings.** `responsive` was
returned for *measured alive*, *supervision is off*, and **nothing was examined** — the
third being a variable's **initialiser**, delivered verbatim on any fire with no response
outstanding. **The moment supervision matters most is the moment its state is emptiest.**

The fix gives "I examined nothing" its own token (`unknown`), removes the initialiser,
narrows `WatchdogResponseEvent.response` to `Exclude<WatchdogResponse, "unknown">` so the
**compiler** proves it cannot reach the `failureReason: "stalled"` latch, stops an
unreadable pane counting as a reading, and separates liveness from recovery evidence so a
seat that answers every nudge caps at `suspect`.

**A second defect in the same family, found while scoping the first** and not in either
issue: `paneChanged` was a raw string inequality, so a pane that **dies** (`"…text…"` →
`""`) read as pane *activity*, reached `reportRealRecovery`, and **cleared a real stalled
latch**. Absence reaching the latch as health, by a different door than the initialiser.

## Hypotheses this stream DISPROVED

Recorded first, because someone arriving cold at a merged PR reads this file before the
findings and would otherwise re-derive a framing already known to be wrong.

1. **`lastEventAt` is NOT usable as evidence a peer answered.** This stream's *first*
   Phase-3 design keyed on it and was refuted before implementation: delivering a watchdog
   turn makes the target emit a receipt, and `capture("receipt")` persists `lastEventAt`
   with **zero model involvement** (`core/session.ts` `onInbound` → `emitReceipt` →
   `capture` → `persist`). **The act of supervising writes the field supervision reads.**
   Had it shipped, a pi peer with a live inbox receiver and a wedged model would have been
   read as "answered" on every nudge, making `stalled` **unreachable** for exactly the
   frozen peer the watchdog exists to catch — a false negative traded for a false positive,
   green all the way. The signal used instead is **`statusAt`**, which only the peer's own
   `pij report` moves (`core/registry-write.ts:90` maps it to the `"cli"` writer).
   *(Independently corroborated: s097 found `lastEventAt` has three writers and none means
   "did work"; [#172](https://github.com/AI-Substrate/pij/issues/172) shows a dead seat's
   `lastEventAt` advancing via a recycled pane id.)*

2. **Eligibility does NOT consult `terminal`.** Verified: the word appears **zero** times in
   `eligible()` (`watchdog-manager.ts:190-207`). This was a *proposal* of this stream's that
   briefly circulated as a statement of current behaviour. What eligibility actually consumes
   is the **blind pid probe** (`watchdog-manager.ts:238`), which silently **unwatches** a seat
   whose pid reads absent and **watches forever** one whose pid was recycled. If that change
   is ever made, justify it on **correctness only** — s098 measured that `eligible()` does no
   I/O and never appears in the tick profile.

3. **This stream's own first narrowing was too narrow.** An early finding that #161 was
   "a watcher-notice defect, not state corruption" is correct *about the initialiser* and
   **wrong about the family** — see the pane-death path above, which does reach the latch.

4. **The fleet brief's claim that the ledger merges cleanly is FALSE** (ledger `F-503`). It
   states the ledger is *"append-only, so concurrent appends from six PMs merge cleanly at
   different line ranges."* They do not: the ledger is grouped **by kind**, so every append
   lands at the **same section anchors** — different ids, identical context lines, guaranteed
   collision. Three streams hit it. The conflict itself is a one-minute concatenation; the
   expensive half is diagnostic, because **GitHub does not run checks on a conflicted PR**, so
   the symptom presents as *"CI never triggered"* rather than *"you have a conflict"*. **If a
   PR shows zero check-runs, check `mergeable` first.** *A shared append-only document is a
   shared mutable file* — "append-only" is the exact word that made it sound safe. (Corrected
   at source in the brief.)

5. **pij#188 is a concealment, not a flake** — discovered while discharging this stream's
   convergence obligation, and it changes the fix. The flake fails at `run-proofs.ts:881`;
   this stream's granted assertion is at `:935`; **both are inside `runBoundedCapture()`**. So
   when it fires the scenario aborts and **everything downstream never executes** — not
   failing, not passing, *not running*. Post-merge it fired on **3 of 3** runs, so the
   assertion was dark. **A flake in position one of a scenario is not equivalent to a flake
   anywhere else — it is a mask**, and it is stacked with the fact that no gate runs that file
   at all (KF-03). **Acceptance condition for any fix**: enumerate what is downstream of `:881`
   and re-establish that each can still **fail**. A fix that merely makes the sleep reliable
   would silently restore every masked assertion, they would pass, and they would read as
   though they always had.

## Method notes worth inheriting

- **The four criteria were committed RED against the genuinely unfixed tree** (`8ba6e96`),
  before any source change, so they are reproducible at that sha without simulating
  unfixedness. Three of five first passed *for the wrong reasons* — one satisfied by a
  **neighbour** (watchdog attribution absorbed the delta), one by **absence** (it fired zero
  times), one uncheckable pre-fix. Running them was the only thing that caught it.
- **Four existing assertions had to be edited**, each disclosed in the PR with its both-ways
  result. They are the partition's missing third category: **the files a change invalidates**
  (F-500) — owned by nobody, caught by no gate, surfacing only on failure.
- **AC-04 is a `mutation-only` criterion** — pre-fix there is no no-evidence verdict, so a red
  is unavailable *in principle* and a named mutant is its only possible proof.
- **`run-proofs.ts` is intermittent** on any tree, pre-existing, filed as
  [#188](https://github.com/AI-Substrate/pij/issues/188) — see disproved-hypothesis 5 above:
  it **masks** every assertion downstream of it in the same scenario.
- **File disjointness does not imply proof disjointness.** This stream's granted assertion was
  partition-clean *and* proof-coupled at the same time: an executable proof boots a real
  `Daemon` and therefore **reads through** a file six seats had opinions about. The partition
  models **writers**; nothing in it surfaces that edge. Convergence obligation was pre-recorded
  and discharged: `daemon.ts` did change (`a2a50e2`), and the assertion was re-established
  **both ways on the merged tree**, failing for its *own* reason rather than the flake's.
- **Merged rather than rebased** at convergence — the branch was already pushed, so a merge
  avoids rewriting published history and needs no force-push. Rebase is for unpublished work.
- **Zero check-runs and all-checks-passed render identically.** `gh pr checks` on a PR with no
  runs reports no failures, which reads as fine. Use
  `gh pr view <n> --json statusCheckRollup` — an empty rollup is *visibly* empty. **The
  absence of a red is not the presence of a green.**

## Reported, not fixed (other streams' files)

- `docs/how/pij-watchdog.md:221-228` and `skills/pij/references/00-routing.md:179` — **stale**
  after Phase 3: both state the two-silent-fires rule and name `lastEventAt` as the criterion.
- **`pij spawn --effort` is recorded but not honoured** — registry `effort: high`, peer canary
  reports `medium` (F-502).
