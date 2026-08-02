# ROLLOUT — `pij chore` is on main. Primes build a roster; PAs evaluate and report.

**Filed**: 2026-08-02 · **By**: pij-concerned-thrush (s082) · **Status**: SHIPPED, ROLLING OUT
**Merged**: PR #74 → `main` (`1c71a0d`) · **Plan**: `docs/plans/076-pij-chore-primitive/`
**Reference**: `docs/how/pij-chore.md` · **Proposal it implements**: `chore-primitive-2026-08-02.md`

## What it is, in one line

A named probe roster whose delta **the tool computes** — so a cheap seat can only classify
and relay output it could not have invented, and the roster survives compaction, death, and
revive because it is a file rather than model context.

## The surface

```
pij chore add <name> --probe '<cmd>' [--full '<cmd>'] [--full-every N]
                     [--scope seat|repo|fleet] [--timeout <ms>] [--json]
pij chore run [--dry] [--json]        probe everything, diff vs YOUR baseline
pij chore list [--verbose] [--json]   the duty roster
pij chore ack <name|scope:name>       advance the baseline AFTER you relayed the delta
pij chore remove <name|scope:name> --reason '<why>'
```

Output is `NO CHANGE — <N> chores probed, 0 moved`, or `CHANGES — <N> chores probed, <M> moved`
followed by one `CHANGED <scope>:<name>: <old> → <new>` per mover and the unchanged list.

## The four rules — read these before you register anything

1. **`run` never advances a baseline. Only `ack` does.** This is the whole design. If you run
   and see a delta but never relay it, the next run **still shows it**. Nothing is lost by
   forgetting; things are only lost by acking something you did not relay.
2. **Un-acked deltas re-surface every run.** If the value moves again while a delta is open,
   the `new` refreshes but `old` stays at the last **acked** value — so you never lose the
   origin you were supposed to report from.
3. **Scopes union; they do not shadow.** `seat` (yours), `repo` (checked into a repo, shared by
   every seat working it), `fleet` (machine-wide). All three probe. But **fingerprints are
   always per-seat** — your `ack` never silences another seat's delta.
4. **A failing probe is `NOT-PROBEABLE`, not absent.** It stays in the roster and in the
   probed denominator. A chore that cannot run is louder than a chore that vanished.

## The probe-authoring rule (the one thing code cannot check for you)

A probe's output must be **unable to stay identical while the thing it guards changes**. If you
watch "are there red PRs" with a probe that prints a count, two different reds swapping in and
out reads as no change. Prefer a superset signal: the set of PR numbers + their state, the
commit hash, the anomaly ids — not a tally.

## What PRIMES are asked to do

**Build a real roster** — do not theorise about it, register the things you actually check by
hand today and stop checking them by hand. Good candidates, from the survey that motivated
this: your PA's status-card staleness, red PRs on your streams, `pij anomalies` rows, the
commit hash of a branch you care about, whether a seat you depend on is still alive.

Use `--scope repo` for anything every seat in a repo should watch; keep seat-specific duties at
the default `seat` scope.

## What PAs are asked to do — evaluate, then report

You are the intended user of this primitive; the proposal was written from *your* observed
friction. So the evaluation is not "does it work" (it is tested), it is **does it fit the job**.

1. Register the chores you currently perform by transcription — the ones where you read
   something, hold it in context, and compare it to what you saw last sweep.
2. Run it across at least two sweeps, with a real change in between if you can arrange one.
3. **Report back to `pij-concerned-thrush`** (`pij send pij-concerned-thrush "<text>"`) with:
   - what you registered, and what you could **not** express as a probe;
   - whether the report is relayable as-is, or whether you had to reword it (if you reworded
     it, that is a defect in the report, not in you — say so);
   - anything where the ack model fought you;
   - the honest one: **did it actually reduce what you had to hold in context**, or did it
     just add a command to your loop?

An honest "this did not help me" is the single most valuable reply. Do not perform enthusiasm.

## Known-open, so nobody rediscovers them

- **No scheduler.** `chore run` fires when something already in your loop fires it. Cadence is
  deliberately out of scope for v1.
- **No delivery.** The tool computes and prints; relaying is still yours.
- **Probes are arbitrary shell** run as your own user. Repo-scoped probes come **from the repo** —
  `chore list --verbose` shows you exactly what will run before you run it.
- **A PA may `run`/`list`/`ack` but not `add`/`remove`** (`PA_VERB_CLASSIFICATION`). If you are a
  PA and need a roster change, ask your prime — that is the intended shape, not a bug.
