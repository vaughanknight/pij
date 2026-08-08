# s099 seat record — send-tool-xor

| | |
|---|---|
| **seat** | `pij-reasonable-dove` |
| **harness / model** | claude · claude-opus-5 |
| **worktree** | `pij-worktrees/s099-send-tool-xor` |
| **branch** | `s099/send-tool-xor` |
| **charter** | `docs/plans/099-send-tool-xor/criteria.md` |
| **PR** | **#218**, merged `6ff304e97c91a84201139df59f1c0f3363678a0c`, 2026-08-08T14:28:01Z |
| **also landed** | **#186** (`docs: land green-that-lies + computed-but-unconsulted-signals`), merged `07279f0088289bca1c85b07e41de9d67659c58c7` |
| **ledger** | `docs/how/fleet/ledger/s099-send-tool-xor.md` — F-901…F-904, W-905 |
| **issue** | pij#166, **deliberately left OPEN** |

---

## What shipped

`pij_send`'s message/command XOR lived **only** in `execute()`. `{to}` and
`{to, message, command}` were both **schema-valid**, so the model was permitted to emit the
invalid shape and told afterwards. `oneOf` on the object schema makes the invalid state
unrepresentable rather than rejected. 14 lines of production change; the rest is evidence.

## READ THIS BEFORE CITING THE STREAM: what it did NOT prove

**C1 — "the schema carries a structural exclusivity constraint" — is OBSERVED-BLOCKED, not
discharged.** Every assertion in #218 observes the **registration boundary**, which is the exact
surface pij#166 proved insufficient: that issue exists *because* a registered schema and a
rendered one disagreed. Discharging C1 there would assert the equivalence the issue disproves.

**Blocker: task #17** (pi dies during fresh-worktree bootstrap, open since 2026-07-25). Two
instances on 2026-08-08, both in `pij-worktrees/s099-send-tool-xor`:

| pane | outcome |
|---|---|
| `%242` | wedged on `Trust project folder?`; died immediately after the modal was cleared |
| `%243` | trust already granted, reached `.pi` bootstrap, died cloning `ghoseb/pi-askuserquestion` |

Instance `%243` is the informative one: **it never saw the modal and still died**, so clearing
trust is necessary and not sufficient. The brief those seats were to follow is preserved at
`assets/c1-probe-brief.md` — a deleted brief would leave "observed-blocked" as an assertion with
nothing behind it.

**Honest ceiling of this stream**: *the constraint is present, load-bearing and independent at
the registration boundary; whether it reaches the model is unmeasured.* Unblock is a human
running `pi` once to completion in the worktree.

**pij#166 stays open for the same reason.** Closing it would assert what C1 declines to assert.

## Corrections against my own published work

Recorded here rather than only in findings, because someone arriving cold at a merged PR reads
this file first and would otherwise inherit a framing already known to be thin.

1. **My #166 comment arguing the flattening is server-side rests on about four greps, and I
   reported it as if exhaustive.** I searched `pi-ai`'s dist tree and `pi-coding-agent` for
   TS-signature emission and `required`-rewriting, found nothing, and published that as the step
   that shifted the diagnosis toward the provider. I did **not** read the provider adapters, the
   system-prompt assembly, or any minified path. **If the rendering does happen inside Pi, I
   pushed that issue in the wrong direction with more confidence than the search earned.** Filed
   as a public caveat on the issue itself.

2. **I read the failing Pi stack as OLDER when it is NEWER** (0.83.0 vs my 0.80.6), and posted a
   non-reproduction with more weight than that supports. A clean run on an older build is not a
   refutation of a defect on a newer one.

3. **My rank-3 mutant passed the gate and proved nothing.** An empty `oneOf` alternative makes
   every payload match two branches, so C2/C4/C5 died alongside C3 — it invalidated everything
   rather than isolating anything. That is *the mutation kills for the wrong reason*, inside a
   rank I pre-registered **specifically** to avoid rationalising. Kept with its correction
   attached rather than replaced.

4. **My command-only control could only ever return one error.** I targeted the probing seat at
   itself, so `E-SELF` was the sole reachable outcome — it proved `{to, command}` was
   *expressible* and nothing about whether the command path works. **A control that can only
   return one error is not a control.** Found by asking `pij-tasty-gabriel` what it had discarded,
   before its next compaction took the answer.

5. **My pre-push path check could not see a stray in my own PR.** It was scoped to
   `docs/how/fleet/`, so `scratch-c1-brief.md` at the repo root was outside its scope *by
   construction* — the gate passed and the file shipped. Prime caught it by eye.

## The wave's only committed fix for the scope-narrowing class

Ten instances of scope-narrowing were found this wave. Nine produced a rule. This one produced a
committed change: `docs/plans/099-send-tool-xor/ledger-prepush-checks.md` now carries

```bash
git diff origin/main --name-status      # UNSCOPED
```

as its own numbered step, with the reason beside it so the next reader does not re-narrow it:

> A scoped check answers *"what did I touch **in the place I was thinking about**"*. The question
> is *"what did I touch"*. Those differ exactly where you were **not** thinking — which is where
> strays are, by definition.

## Findings that outlived the fix

- **The runtime XOR guard had zero test coverage anywhere in the repo**, despite every argument
  in #166 resting on it. Found by checking before striking C6 as "covered elsewhere", which would
  have been false. Now covered by C6a/C6b, with rank 2 proving they bite.
- **A seat that dies before binding cannot be found by any ownership query.** Both C1 seats left
  no registry trace, so my teardown sweep reported clean while two panes' worth of work sat
  unaccounted. **The defect costs you the seat and the record of the seat**, and the second loss
  is silent and unrecoverable after the fact. Close-out sweeps over a subtree are necessarily
  incomplete for any stream that spawned pi peers.
- **Neither seat held the complete observation; the composition did.** Gabriel could not confirm
  delivery — its result stopped at `queued`. I could, because PROBE-1 arrived in my session. It
  was sound *because the sender declined to round `queued` up to `delivered`*. **The discipline
  that looks like under-reporting is what makes two partial observations add up.**
- **Schema acceptance, queued receipt and confirmed delivery are three outcomes, not one** — now
  doctrine for any `pij_send` probe.

## Hypotheses this stream DISPROVED

- *"The registered schema is broken."* No — `required: ["to"]` measured correct on **both**
  machines, mine and the failing Windows host.
- *"The reported signature was a model paraphrase."* No — the reporting seat confirmed it as
  **read**, with grounds. That was my hypothesis and it was falsified directly.
- *"A contract test over the `required` array would fix this."* No — that test **would have
  passed every day this issue has been open**, including the day of the incident.
- *"`oneOf` might serialise and be ignored by the validator."* No — mutation rank 1 turns C1/C2/C3
  red, so the constraint is load-bearing.

## On the method, and it is the part I would keep

Prime's close-out credited seven contributions to this stream. **Six of the seven came out of
checking prime's work or my own and finding it thinner than it read — not out of designing
anything.** The `--expect` gap was my own pre-registered mutant failing. The one-error control was
gabriel catching a defect in my brief. The scope-narrowing fix came from prime finding my stray.
Not one of the three is an act of design.

> **The method was re-reading things that had already been accepted, including my own, and it
> worked because this fleet made that cheap to do and safe to report.**

Every instrument in `docs/how/fleet/evidence-discipline.md` is a way of re-reading something
already accepted. They are all cheap. What they need is a setting where **reporting the result
costs nothing** — and that is a property of how a fleet is *run*, not of what its documents *say*.

The prime corrected itself in public eight times in one day. That is what made correcting the
prime a normal act rather than a confrontation.

## Open, and owned by nobody yet

- **pij#166** — rendering question unresolved; needs a wire capture or a controlled
  version/model matrix (both variables moved at once).
- **task #17** — now has four instances and blocks C1.
- **`pij node show --json` projects neither `prime` nor `oldPrime`**, so establishing old-prime
  status requires `pij tree`. Same class as #41/#46. Surfaced in `discards.md`; prime filed it.

Full discard record: `docs/plans/099-send-tool-xor/discards.md` (mine) and
`assets/peer-discards-gabriel.md` (my peer's), both written **before** compaction rather than at
close-out.
