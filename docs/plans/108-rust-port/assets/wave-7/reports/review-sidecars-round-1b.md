# Review round 1b — the `Lost`/`Failed` red is deterministic, not a flake

Reviewer `pij-favourite-araminta`. Head: **`26bf238e`** (`s108/w7-sidecars`, the
coder's combined execution head). Addendum to
[round 1](./review-sidecars-round-1.md) and [round 1a](./review-sidecars-round-1a.md).

## What is fixed, verified on the shipped surface

Re-run by me against the real `pij-rs` binary and a real daemon
(`127.0.0.1:7496`, state dir `/tmp/araminta-live-4`), not through a test harness.

| finding | evidence at `26bf238e` |
|---|---|
| **F12** producer reported FAILED for work that landed | `pij sidecar: ok — {"job_id":1,"serial_key":"j1"}`, **EXIT 0** |
| **F9** one retry wedged the runner | after the same duplicate `bg-start`: `j2.json` **exists**, row 4 `done`, and two `delivery:pij-test` turns were delivered. The bystander progresses. |
| **F1** non-zero exit reported as finished | `boom.json: failed 3` — status `failed`, exit code `3` recorded |
| — | `j2.json: done 0` for a healthy job |

The duplicate row still retries (row 2, `attempt 7`) but with bounded backoff, and
it no longer starves anything — which was the finding.

## The red, and why the diagnosis matters more than the failure

The composed gate failed
`background_reports_failed_and_lost_without_starving_other_completions`
(`sidecars.rs:779`, `left: Lost, right: Failed`). It passes in isolation — I ran
it alone and got `ok`, which agrees with the PM's 3/3 targeted and 5/5 suite runs.

**Every one of those greens is the same defect not being triggered**, and the
load-shaped reading of it is wrong. Bounded convergence polling — the proposed
fix — would not have worked.

### Reproduced deterministically, 3/3, with no load and no stress

Witness: a job whose **process group outlives its direct child**. Command
`sleep 1 & echo partial; exit 3`.

```
PROBE after pass 1 (group still alive) = Running
PROBE after pass 2 = Lost, exit_code = None      [3 runs, 3 identical]
```

Probe committed beside this file as `probe-lost-vs-failed.rs`, re-runnable.

### The mechanism, from the code

`background.rs:375-388`:

```rust
let status = match children.get_mut(id) { Some(child) => child.try_wait()?, None => None };
if status.is_some() { children.remove(id); }     // CONSUMES the observation
Ok(status)
```

`observe_completions`, `:337-341`:

```rust
let exit = self.reap(&record.id)?;                        // consumed HERE
if !group_pids(record.pgid)?.is_empty() { continue; }     // and discarded HERE
match exit { Some(s) if s.success() => Done, Some(s) => Failed, None => Lost }
```

Pass 1 reaps the direct child, receives `ExitStatus(3)`, removes it from
`children` — then bails on the very next line because a grandchild still holds
the group. The status is now unrecoverable. Pass 2 finds
`children.get_mut(id) == None`, reads that absence as `None`, and concludes
**`Lost`**.

So the exit status was observed, on time, correctly — and then thrown away by a
guard sequenced after the consumption. **Polling to a deadline gives more chances
to consume-and-discard**; it would make this rarer, and a rarer wrong answer is
worse than a reliable one.

### Root, in this plan's own vocabulary

`reap()` returns `None` for **three different facts**: *not exited yet*,
*already observed by an earlier pass*, and *never ours*. The classifier reads
that single absent value as the strongest negative conclusion available.

That is **E-004 verbatim** — "the instrument collapsed two states", the exact
failure `E-NOREG` exists to prevent — and **COMMON 1.5**, absent is not empty.
`Lost` is an honest and valuable state; it is being *reached* from an absence
that does not mean what it is read to mean.

It is also the same shape as my own two instrument errors this review: a zombie
row read as a survivor, and a `tail`-truncated log read as a test count. In all
three the observation was fine and the reading of its absence was not.

### Fix shapes — coder's choice

1. Check `group_pids` **before** reaping, so the status is only consumed when it
   can be used.
2. Persist the observed exit onto the record the instant it is seen, so a later
   pass reads durable state rather than a map that forgot.
3. Make `reap` distinguish *never-ours* from *already-observed* instead of
   returning `None` for both.

Any of the three closes it. (2) also survives a daemon restart, which is the
property `Lost` exists to describe.

## Standing

* `26bf238e` is **not** green: one stage (`test`) fails. Not shippable as-is.
* F3/F4's durable cursor is present at this head but I have **not** yet re-run my
  offset probe against it — the classifier defect took priority because a fix was
  about to be built on a wrong cause. That verification is outstanding and I will
  not call F3 closed until I have run it.
* The window stays unspent. Round-1 findings F6, F8 and F10 remain open and are
  unchanged.
