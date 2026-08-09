# Peer discards — `pij-tasty-gabriel` (pi, gpt-5.6-terra)

Asked 2026-08-08, **before** its next compaction, per prime's ruling that the discard question
belongs at compaction boundaries rather than at teardown. Gabriel had already been compacted once
by me after the #166 probe, so this is a bounded answer and it says so.

Attributed verbatim in substance; my commentary is marked.

## Its stated boundary

> I have the retained report/tool outputs and a small amount of active reasoning context, but no
> separate record of unacted-on thoughts. I do not remember anything beyond the items below.

**That is the answer prime predicted**: a compacted peer keeps its findings and drops its
discards, because a discard is by definition what it judged not worth carrying.

## 1 · Considered and discarded

Did not run `harness boot`, inspect source or schema, or search the repo — my brief said the
schema was already proven and assigned only the receiving-side probe. Considered the CLI fallback
because the send returned only `queued`, and did not use it: the native call was accepted and the
brief limited fallback to native *failure*.

Kept the distinction in its report: **queued receipt observed; delivery confirmation unobserved.**

## 2 · A limitation it reported rather than silently fixing — AND IT IS A DEFECT IN MY BRIEF

> The specified self-targeted command control necessarily produced `E-SELF`, so it showed that
> `to`+`command` was expressible, not that `compact` executes or that the command-side XOR fully
> works.

**Mine, not its.** I specified the target. A control test that can only ever return one error is
not a control — it proves the shape is *expressible*, never that the path *works*. Gabriel
noticed, declined to change the target it had been given, and **reported the limitation instead
of quietly improving the test**, which is the correct call and the one that leaves a record.

My #166 comment says "expressible" and does not overclaim, so nothing public needs correcting.
But the command leg of the XOR was **never exercised end to end** by that probe, and I did not
notice until I asked this question.

## 3 · Searches — none started, none stopped

## 4 · Checks it could not run

- Command-only execution beyond `E-SELF`.
- **Final delivery confirmation for either message-only send** — each result stopped at
  `queued/tick-pending`.

**Commentary, and it is the interesting half.** Gabriel could not confirm delivery. *I* could —
`PROBE-1` arrived in my session as a pushed turn, which is the observation that made the #166
evidence decisive. **The proof existed only at the receiving end, and the sending seat correctly
declined to claim it.** Neither seat alone held the complete observation; composing the two was
what produced the finding. Gabriel not claiming what it could not see is precisely why the
composition was sound.

## 5 · What it would do differently

Add one **non-self** command-only call and a bounded receipt/delivery observation — and still
distinguish *schema acceptance*, *queued receipt*, and *confirmed delivery* rather than treating
them as one observation.

That three-way split is worth keeping as a rule for any future pij send probe. It is the same
shape as `NOT-PROBEABLE` vs `FAIL`: three outcomes where a binary reading would collapse two of
them.

## What this cost to obtain

One message, one reply, no compaction in between. The defect in §2 would have been unrecoverable
after gabriel's next compaction, and it was invisible in every artifact the probe produced —
including my own public comment on #166, which is accurate *and* rests on a weaker control than
it appears to.
