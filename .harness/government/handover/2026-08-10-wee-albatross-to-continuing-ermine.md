# Seat handover — pij-wee-albatross → pij-continuing-ermine (o-prime, pij)
**Written**: 2026-08-10T07:20Z by `pij-continuing-ermine` · **Trigger**: written *retroactively*,
by the successor, because it was never written at the time.

## 0. Why this file exists, and read this part even if you skip the rest

**My succession was never recorded.** On 2026-08-05 `pij-wee-albatross` ran out of usage credits
mid-flight. What reached me was a live `pij send` dump from its PA (`pij-missing-anaconda`) into a
fresh context — accurate, detailed, and **existing nowhere on disk.** Everything I knew about the
seat I inherited lived in one context window, which is precisely the condition that ended my
predecessor.

I then ran for two days without writing this file, while filing issues about instruments whose
corrections lived only in context, and while merging a PR (#275) whose entire purpose was that
*"nine corrections lived only in a context window."* **I was the instance of my own finding.**

> **If you are reading this as an incoming seat: write your outbound handover EARLY, while nothing
> is wrong.** The trigger for needing one is the same event that removes your ability to write it.
> Credits and context both end without warning and neither gives you a final turn.

## 1. What I actually inherited (recorded now so the chain is not broken again)

From `pij-missing-anaconda`'s dump, 2026-08-05:

- **PR #105** merged; **PR #116** open with CI green; **issue #106** open (pane `%517` shared by one
  live PA and two ghost descriptors — dissolving by pane/PID would have killed the live seat).
- **337 dead registry rows** awaiting an operator call.
- A **git stash** left by albatross in the canonical checkout (two `docs/plans/083-a2a-wire-discipline`
  files).
- Standing PA: `pij-missing-anaconda`, zero-actuator sweeps.

**None of that was on disk.** I am recording it here as history, not as live state — see §2 for what
is actually live now.

## 2. Live state at handover time

| | |
|---|---|
| **My seat** | `pij-continuing-ermine`, o-prime, `ready` |
| **PA** | `pij-efficient-bug` (copilot/gemini-3.6-flash), ~20 min watchdog, healthy, 30h+ uptime |
| **Other child** | `pij-reasonable-dove` — PM, parked `waiting` since 2026-08-09, legitimately muted |
| **Anomaly rows against my seats** | **0** (board carries 9, all other governments) |
| **Open PR** | **#168** only — 8 files, 4,655 insertions, one conflicting file (`docs/how/fleet/ledger.md`) |
| **Merged by me** | #275 (PA brief corrections) |
| **Open decisions with Jordan** | (a) tmux `FORCE_COLOR` unset; (b) #168 disposition |

## 3. The two things you must not re-learn the hard way

**Receipts do not prove a seat is alive.** `drainInbox` stamps `readAt` at the top of the daemon
tick, *before* injection, and passes it unchanged into `markRead`. A receipt records the daemon
typing text into a pane. I built a fleet-wide liveness instrument on this, published it, used it to
refute a detector, and had to withdraw all of it. **Ask what must be TRUE for a field to move**, not
who wrote it:

| field | moves iff |
|---|---|
| `statusAt` | the seat ran `pij report now` |
| `lastEventAt` | the seat emitted **or** its pane painted while `working`; watchdog paint excluded |
| receipt | the daemon drained an inbox — the seat need not exist |

**Your PA's sweep header reports YOUR card, not its own.** It now says so explicitly
(`PRIME CARD (<id>) statusAt: …`) because I read it as noise about itself for most of a night. If a
successor PA is stood up, keep that label.

## 4. Open threads that may reopen

- **#262** — the stall flag. The surviving recommendation is **the anchor, not the threshold**:
  seats are visibly active within ~8s against a 60,000 ms constant, and the predicate still fires
  because it measures time since *before* the fire. Six other results from that investigation were
  withdrawn; do not resurrect them from the comment history without reading the retractions.
- **#274** — `main` has **no branch protection**, so `gh pr merge --auto` is a synonym for `--merge`.
  Verify CI explicitly before merging; never treat `--auto` as a gate here.
- **#273** — ambient `FORCE_COLOR=2` in the tmux **server** global env (not pij's server; started for
  an unrelated project). Combined with a harness-injected `NO_COLOR=1` it fails 16 tests in
  `harness checks`. Fix direction is hermetic tests, not `env -u` as a remembered workaround.
- **Cross-government**: `pij-massive-meadowlark` (harness-engineering), `pij-chief-roadrunner`
  (chainglass), `pij-respectable-clam`. Nothing owed to any of them as of this write.

## 5. Traps I hit that are cheap to avoid

- **`pij state --json` and `pij list --json` do not carry `paneId`.** `pij tree --global --all --json`
  does. Reading an absent key through `.get()` returns `None`, which is indistinguishable from a real
  null — **I made this error three times in one session.** Assert the key exists before reading it.
- **`cat >>` creates a file that does not exist** and never says which it did. On a branch whose merge
  base predates the file, an "append" silently becomes a 43-line stub of a 319-line document. Check
  `git show <branch>:<path> | wc -l` against main after any append in a worktree.
- **`rg` skips hidden paths** and this repo's source is under `.pi/`. Always `--hidden`.
- **Reading your own `lastEventAt` is meaningless** — you cannot measure your own response latency,
  because measuring is a response. Read another seat's.

## 6. The standing duty, corrected

Supervise the PA on **seat-caused** evidence only: did `statusAt` or `lastEventAt` move after the
fire. Do not time it precisely from a single read — tooling round-trip under load is ~29s, the same
size as the response, and `lastEventAt` is last-write-wins so one sample cannot find a first
occurrence. Relay chore determinations and confirm the fingerprint actually advanced; **fingerprints
are per-seat, so your ack does nothing for the PA's baseline.**

Keep your own card fresh. Nothing above you will chase it — that is what the PA is for, and it is the
only seat positioned to do it.
