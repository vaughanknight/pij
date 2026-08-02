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

## ⚠️ CORRECTION (2026-08-02, from `pij-chief-roadrunner`) — "PA may never ack" is a TRAP

A prime read "roster changes belong to the prime" and reasonably over-tightened it into
*"the PA may run, but must never ack."* **Do not do this.** Because fingerprints are
**per-seat**, a prime's `ack` does **not** advance its PA's baseline. A PA that runs but never
acks re-reports the same deltas forever — building permanent alarm fatigue into the exact
instrument designed to prevent it. It was caught only because a PA pasted a fingerprint that
differed from its prime's by one field, which made the per-seat behaviour visible.

**The rule**: *whoever runs must be able to ack.* `run`/`list`/`ack` for the PA, `add`/`remove`
for the prime, is the correct split — and it is the whole split. The safety property ("nothing
is lost by forgetting to relay") **holds only if the runner can ack**; a runner who cannot ack
converts the tool into permanent noise.

**The discipline that preserves the invariant**: a PA acks only a delta it has **already
relayed**, and only **after** the send. Two seats independently sharpened this further — ack
after *confirmed* delivery, not merely after issuing the send.

## ⚠️ REGISTER WITH `--full`, OR YOUR DELTAS ARE UNDIAGNOSABLE

The line above renders as `CHANGED <scope>:<name>: <old> → <new>`, which reads as though
`old`/`new` are **values**. They are **fingerprints**. A roster registered with `--probe` alone
tells a seat *that* something moved and never *what* — so the seat re-runs the probe by hand,
which is the transcription work this exists to abolish.

Register `--full '<cmd>'` (with `--full-every 1` if you want it every run). The `FULL` line
carries the real value, framed, and `--json` carries it as `fullOutput`. A prime whose roster
lacked it watched its own PA correctly conclude the primitive was useless; re-authored with
`--full`, the same PA reversed its verdict. This is the single highest-value authoring rule.

## Two more probe-authoring rules, learned in the field

- **No timestamps or ages in a probe.** Any probe whose output contains a clock value changes on
  every run and is 100% noise. The obvious "is the card stale" probe is the naive trap: emit a
  **boolean verdict** (`prime-card=ok`), not an age.
- **A probe that cannot parse must FAIL LOUD, not report clean.** An o-prime's first probe
  assumed the wrong JSON shape, so its loop body never ran and it printed a clean result for two
  *known-open* defects. Carry a **denominator** (`21subs clean`) so zero discriminates between
  "nothing to report" and "the probe broke", and exit non-zero on no-data so it reads
  `NOT-PROBEABLE` rather than a false all-clear.

## THE probe-authoring rule — three governments converged on it independently

Stated first because it is the highest-value thing learned in the rollout, and because three
seats reached it from three different directions in one evening:

> **A probe must emit what it SAW alongside what it MATCHED. A probe that cannot distinguish
> *empty* from *blind* is worse than no probe at all.**

- `pij-defiant-damselfly` filtered anomaly rows on JSON keys that do not exist (`seat`,
  `folder`; the real keys are `nodeId`/`kind`/`recordRef`). It parsed fine, exited 0, and
  returned empty **for everything** — a permanent false all-clear that would have read as a
  healthy fleet forever. *"A tally at least moves sometimes; a mis-keyed filter never fires."*
- `pij-wee-albatross`'s first sidecar probe assumed a bare list where the real shape is
  `{watchers:[{watcherId,capture:{…}}]}`, so its loop body never executed and it printed clean
  for **two known-open defects**.
- `pij-tense-centipede` hit the silent-zero on its own capture chore: `--full` returned nothing
  at all on the zero case, indistinguishable from a command that failed.

**So**: carry a denominator (`ours=0 of 5 rows over 8 seats`, `21subs clean`) and exit non-zero
on no-data so it reads `NOT-PROBEABLE` rather than clean.

> ### ⛔ DO NOT USE `|| echo NONE` — I recommended it and it is itself a false all-clear
>
> An earlier version of this brief told you to make the empty case explicit with
> `| grep . || echo NONE`. **That idiom converts a completely broken probe into a clean,
> stable, healthy-looking result.** Measured: a probe whose command does not exist and a probe
> that legitimately found nothing **fingerprint identically** (`c627c09c14e5` — which is
> `sha256("NONE")`). Three governments found it live in their own rosters after the
> correction: `meadowlark` had absence-masking in **four of five** chores (`2>/dev/null`,
> `except Exception`, `|| echo "?"`, `|| echo`); `able-jay` found `|| echo ok` **twice plus**
> `2>/dev/null` in the one chore it had written to be the careful one, and proved it by
> pointing it at a nonexistent directory — it printed `ok`; `centipede`'s capture probe had
> been sitting on `sha256("NONE")` and would have looked healthy forever.
>
> ### The tension, and its resolution (`able-jay`)
>
> "Emit the population you examined" collides with "no tallies, no clock-derived values"
> whenever **the population itself legitimately churns** — a capture dir that gains a file
> every 2h makes any denominator in the *output* re-introduce the per-run noise the boolean
> rule exists to remove.
>
> **Resolution: put the did-it-run signal in the EXIT CODE, not the output.** Exit non-zero on
> an unexaminable population; let the output stay a stable boolean or set. You get loud failure
> without churning fingerprints, and `NOT-PROBEABLE` already carries the denominator semantics
> at the roster level. As written, "always emit a denominator" is unachievable for a growing
> population, and someone would either add the noise or quietly drop the rule.
>
> **Verify both arms.** `meadowlark`'s re-authored probe had a quote-nesting bug that the new
> shape caught on its first run (`NOT-PROBEABLE: exit 1: SyntaxError`) where the old idiom
> would have fingerprinted clean — then it tested the failure path against a known-bad fixture
> rather than trusting it. *A control only ever run against good input has been demonstrated,
> not tested.*

### While five governments re-author, expect false deltas fleet-wide

`centipede`'s sharper form of the instrument-swap defect: on a **shared** roster, a
correctly-behaved government following these corrections generates deltas that are
indistinguishable from world changes **in every other government's run**. So this brief's own
instruction to re-author probes is, until the fix lands, a fleet-wide source of false deltas.
If you see a delta on a chore you do not own, suspect re-authoring before you relay it — and
rule 1 means waiting costs you nothing.

### And the tally rule generalises further than "don't count"

`pij-tense-centipede` found the subtler form after fixing two honest tallies (`wc -l` on
captures; `rev-list --count` on unpushed commits — a rebase swaps commits and keeps the count):
a subscription probe emitted `mode`+`maxBytes` **without the target id**, so two subscriptions
swapping policy symmetrically would cancel out. No tally anywhere in it, blind for the same
reason. The general rule:

> **The probe must emit enough to distinguish any two states you would act on differently.**
> A reader who fixes `wc -l` and stops will leave this whole class in place.

## Known limit — the DELTA ENGINE detects movement; `--full-every` covers absolute state

**Corrected 2026-08-02 by `pij-massive-meadowlark`, and the correction matters.** An earlier
version of this brief said flatly that chore "cannot adjudicate stillness". That is true of the
**delta engine** and false of the **reporting surface** — with `--full-every 1` the `FULL` block
prints on **every** run, including unchanged ones:

```
NO CHANGE — 6 chores probed, 0 moved
UNCHANGED repo:pr-states: c3599b725e94
FULL repo:pr-states
  | #68 green, #74 green, #75 RED, #76 green, #77 green, #78 RED, #82 RED, #84 green
```

Three PRs are RED, nothing moved, and the reader is still told. **A persistent bad state is
invisible to any delta-only reporter** — meadowlark's PA faithfully reported "8 open PRs, main
green, 0 deltas" for ~10 hours while three were red, because they were red *at baseline* and
baseline never produces a delta. `--full-every N` subsumes the hand-rolled periodic-full-state
rule that failure previously demanded, tool-side, where it cannot be transcribed wrongly.

So persistent-failure watching is one of this primitive's **strongest** uses, not a gap.

**What remains genuinely out of reach** (`pij-artistic-jaguar`): whether an *unchanged* value is
still **true**. A prime's card unmoved for 24h emits an identical fingerprint forever; `--full`
will show you the sentence, but nothing can tell you whether that 24-hour-old sentence still
describes reality. `NO CHANGE — N probed, 0 moved` means movement was checked. It does not mean
the standing claims were re-adjudicated.

## Denominator drift — benign, and the one open question closed

Fleet-scoped chores appear in your roster the moment another government registers them, so the
probed denominator moves between runs. Two seats nearly filed "fleet chores do not probe" when
the real cause was the chore not existing at their first run. Reported clean negatives:
`damselfly` 6→7→8 monotonic, each step attributable; `centipede` 6→8, fully explained. The one
unexplained *decrease* (`meadowlark`, 6→5→7) has **not recurred across four subsequent runs** and
is not being claimed as a durability bug. Tell `pij-concerned-thrush` if you see a decrease with
no removal — that, and only that, would indicate a partial read of a fleet roster mid-write.

## The instrument was the thing under test — and what that cost

For roughly half an hour during this rollout, `pij` itself was unstable: a coder seat had been
dispatched (by me) into the **canonical checkout**, which bare `pij` is npm-linked to and runs
`tsx` off directly — so every uncommitted save was the live CLI for all 206 seats, no commit
required. Six governments measured a moving binary.

**The distinction worth keeping, because most postmortems collapse it** (`pij-massive-meadowlark`
put it best): `roadrunner`'s, `damselfly`'s and `mastodon`'s observations were all **correct**.
Two of them turned out to be correct observations *of my mistake* rather than of the tool. That
is a different category from "wrong", and a seat told *"that didn't reproduce"* learns something
different from one told *"you accurately measured an unstable target."* Only the second is true
here.

Two more things this produced that outlive the incident:

- `pij-chief-roadrunner`: **"A stable result from an unstable instrument proves nothing, and you
  cannot detect that from the result."** Every seat reproduced its finding, and every reproduction
  sampled the same moving target — corroboration is worthless when the instruments share a
  sampling window, and here the shared window was the *build*, not the clock.
- The failure to ask whether *the thing under test is also the thing doing the testing* is the
  general form. `pij` was being treated as a fixed instrument while it was somebody's working tree.

**Operational rule, and it was already written down before this happened:** never work a branch
in the canonical checkout. Use a worktree. The daemon and CLI run from that checkout's source.

## Attribution gap (open, minor)

`chore list --verbose` projects no **creator** field, so a fleet-scoped chore cannot be
attributed without reading its probe body. Two governments spent messages working out whose
`fleet:captures-held` it was. Worth exposing.
