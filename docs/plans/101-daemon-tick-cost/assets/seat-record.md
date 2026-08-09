# s101 seat record — daemon-tick-cost

| | |
|---|---|
| **seat** | `pij-cultural-vicuna` |
| **harness / model** | copilot · claude-opus-5 |
| **worktree** | `pij-worktrees/s101-daemon-tick-cost` |
| **branch** | `s101/daemon-tick-cost` (+ 5 further branches, one per instrument) |
| **brief** | `government/briefs/s101-daemon-tick-cost.md` |
| **prime** | `pij-continuing-ermine` (o-prime) |
| **PRs** | **#232** (#181), **#234** (#229), **#235** (#183 disk), **#236** (doctrine), **#245** (#204 + 90d bound), **#246** (source staleness), **#248** (scheduler projection), **#249** (process staleness) — all merged |
| **filed** | **#229**, **#237** (git-ai), **#231** (o-prime's, my stream as specimen) |
| **issues closed** | #181, #229, #204, #183 (disk half) |

---

## READ THIS BEFORE CITING THE STREAM: what it did NOT prove

**The 60% tick reduction is a p50 over 67 post-fix ticks against 25 pre-fix ticks.** Both arms
on the same instrument at M≈699, but the pre-arm is `n=25` and was taken over a few minutes.
The original 482-tick baseline (p50 5162ms at M 598–628) corroborates it; that is two samples
agreeing, not a controlled experiment.

**I did not prove the 7 stall alerts in #182 were false.** I proved this issue's stated
mechanism cannot account for them (every one followed a 4.6–9.0s tick, needing k≥6–13) and
that each cleared within seconds. I did not observe the panes. **The negative result is about
the mechanism, not about the alerts.**

**The flush gate is named and NOT taken.** ~84 gone-pane `capture-pane` calls per tick remain,
the expensive kind (9.05ms vs 6.70ms). I established the count and left it: it is a delivery
guard, not an observation path, and it belongs with #225's owner.

**#229's own arithmetic was wrong when I filed it and I corrected it publicly.** I claimed the
fix takes the tick from 151 unbounded tmux calls to 34. It does not — the flush gate still
captures every owned pane. The residue is pinned as an exact count in a test rather than
described in prose.

**The 90-day archive bound reclaims ZERO BYTES today** and I told Jordan so before he chose it.
The whole archive is younger than 22.7 days. It binds at roughly 4GB steady state. It is a
ceiling, not a cleanup, chosen knowingly.

**`terminal.observedAt` starts the post-mortem clock when the death is OBSERVED, not when it
occurred.** A seat that died while the daemon was down gets its 48h from discovery. I believe
this is right (nobody can read wreckage they did not know about) and it is bounded because the
stamp is latched — but it IS a semantic change and the suite found it, not me.

**I never measured #235's effect on the tick** and said so rather than let it be credited:
it reclaims disk on an hourly throttle and removes no per-descriptor work.

**Unverified but believed:** that the ~212ms residual between predicted (3060ms) and observed
(3272ms) saving is measurement variance plus M growth. It could be a third contributor I have
not identified.

---

## What shipped

| | | measured |
|---|---|---|
| **#181** | batch the `ps` suspension probe | **608 subprocesses/tick → 1**; 1995ms → 13.7ms; **608/608 pids agree** |
| **#229** | share the tick's rendered pane frame | 4 consumers on one frame; gone panes answered with no subprocess |
| **#183** | reclaim orphaned pane taps | **205MB of 244MB**; 185 swept, 29 kept, 0 live taps touched |
| **#204** | age terminal records from death; split the index | 66/66 coverage; 1 record rescued from premature archive |
| **#183** | 90-day archive ceiling | wreckage deleted, tombstone kept forever |
| **#246** | source staleness — disk vs remote | |
| **#248** | scheduler projection — three verdicts, never two | |
| **#249** | process staleness — process vs disk | |
| **#237** | git-ai root cause | reframed from "our teardown is flaky" |

**Tick p50 5457ms → 2185ms at a LARGER denominator (M 689→708).** Attributed per commit:
**#181 2289ms (70%), #229 771ms (24%), residual 212ms (6%)** — so "which commit would you
revert" has a number.

---

## Corrections against my own published work

- **#229, filed by me, corrected by me**: "151 tmux calls → 34" was wrong; the flush gate
  survives. Found by writing the test for my own claim.
- **My prediction of the after-arm missed low** (3.2s ±0.5 predicted, 2185ms observed). Cause:
  I modelled #181 alone and forgot #229 shipped in the same restart. **Reported before banking
  the win**, because a prediction that misses is a miss even when it misses favourably.
- **My first flake diagnosis was wrong.** I reported "these files spawn child processes". True
  and not the cause — they all *create git repositories*, which is what summons the git-ai
  daemon. A fact adjacent to the true quantity, used as the true quantity: the exact error I
  spent the day filing in other people's code.
- **My first draft of the #246 sensor read the WRONG CHECKOUT** — this worktree, not the
  daemon's. A number that looks exactly like the answer while being about a different tree,
  i.e. the sensor reproducing the defect it exists to end.
- **My first two drafts of the `liveness-cost` guard flagged their own documentation**, because
  a source-scanning guard that reads prose cannot tell a defect from the explanation of why the
  defect is gone — and the cheapest way to silence it is to delete the explanation.

---

## The finding that generalises: an enumeration reports its own scope as the world

`core/liveness-cost.test.ts` exists **specifically** to catch a per-row process probe. It ran
**6/6 green through 608 forks per tick**, for two independent reasons *either* of which was
sufficient — it scanned `adapters/` while the defect sat in `daemon.ts`, and its pattern
required a literal `$` so it could not have matched `["-p", String(pid)]` anyway. Its own
comment already stated the rule it was breaking.

Four instruments, four scopes, one failure, all in two days:

| instrument | scope it enumerated | what it reported as absent |
|---|---|---|
| `liveness-cost.test.ts` | `adapters/` | 608 forks/tick in `daemon.ts` |
| `harness checks` (#227) | not plans | nine streams of plan drift |
| `rg` (AGENTS.md) | not `.pi/` | the entire extension source |
| a green PR rollup | the head fetched, not the head at merge | a commit that had moved |

**An empty result is the one output that carries no evidence of what it searched.**

---

## Two facts sharing one answer — the class this stream kept meeting

Every defect here reduces to it, and it is why every sensor I shipped has a **third** verdict:

- `watchers: 1` for a subscription whose watcher is a corpse
- a green check for a check that never ran
- `running` for a daemon executing four-commit-stale code
- `lastFireAt: None` for a seat missing from the scheduler entirely
- `[]` from `list-panes` for both "no panes" and "tmux unreachable"
- an empty `ls` for both "no expectations" and "wrong path"

So: `UNKNOWN` is never `not-scheduled`; unreadable is never *clean*; a missing pane list never
means *the pane is gone*. **A sensor built to end that class must not ship with the class
inside it**, which is why o-prime required the distinction be asserted RED-first rather than
intended — and why the third UNKNOWN path in #249 (an unreachable boot sha making the count
unanswerable) matters more than the two I was asked for.

---

## Doctrine landed

**A one-directional safety interlock is not a policy** (#236, in `AGENTS.md`). Ask what
REMOVING the check does: **more → brake; different → policy**, and a policy inherits whatever
its input is wrong about. It settled whether #235 was blocked on #204 — the sweep reads an
mtime, so "does it consult a timestamp?" was honestly *yes*, but age could only ever **spare** a
file, never cause a deletion.

**A restart installs whatever is on disk; it does not fetch. Necessary, and not sufficient.**
The brief opened with the inverse trap and drew the rule RESTART BEFORE MEASURING, which was
then followed correctly and still measured the wrong binary. **A rule derived from one instance
of a class closes that instance, not the class** — which is why #246 and #249 are sensors and
not runbook lines.

---

## On method — what made verifying cheap (o-prime asked, and this is the honest answer)

Three of my prime's statements were wrong today: that the restarted daemon contained my fixes;
that 598 and 609 were different denominators; and the daemon pane id, twice. Catching all three
cost **under a minute each**, and I want to be precise about why, because "be sceptical" is not
transferable advice.

**1. The claims were falsifiable in one command, and I checked the ones that were load-bearing
rather than the ones that felt doubtful.** "The daemon contains #181" is not an opinion — it is
`test -f process-states.ts` in the checkout the process names in its own command line. I did not
suspect ermine; I checked because *every subsequent number depended on it*. The filter is **what
does this claim carry**, not **do I believe it**.

**2. The instrument usually names its own provenance, if you ask it.** The daemon's `ps` line
contains the path it is executing. `git merge-base --is-ancestor` answers "is this commit in
that tree" exactly. `tmux list-panes` answers which pane exists now. In each case the honest
answer was one layer beneath the relayed one, and **relayed facts have a source that can be
addressed directly** — a pane id from a message is hearsay; `list-panes | grep pij-daemon` is
the pane.

**3. The cost asymmetry is enormous and worth naming out loud.** Verifying cost ~30 seconds.
Not verifying would have published **a false negative on my own merged fix** — the most
damaging result available, since it argues for reverting working code. When one side of a
decision is seconds and the other is a wrong retraction, there is no judgement call to make.

**4. Two opposite errors leaving a value unchanged is a repeatable question, not an instinct.**
`ls ~/.pij/expectations` → 0 was about to become "the path is dead". An empty store and a
mistyped path produce the same zero. Asking *what two opposite errors would leave this
unchanged* is a **procedure**, and it caught a wrong claim before I filed it.

**5. What actually made it cheap was that I was never punished for it.** Ermine answered "you
were right, I was wrong" three times without defensiveness, changed their own close-out rule on
my argument, and twice adopted my counter-proposal over their own instruction. **A seat verifies
its prime when disagreeing is cheaper than being wrong** — and that price is set by the prime,
not the seat. That is the transferable part, and it is not a property of me.

---

## Friction and magic wand

**MW-1 — the gate is not trustworthy on this machine.** #237: a machine-global `git-ai` daemon
writes `.git/ai/` into every temp git repo ~3s after creation, racing test teardown. Six
failures across five files, plus hook timeouts. I re-ran `harness checks` **nine times** today,
and "just re-run it" is the reflex that will hide a real regression. Filed with a reproduction
and a verified mitigation; not taken, because it touches shared harness config.

**MW-2 — merging is a race and `gh` already has the fix.** The o-prime merged #232 while I was
pushing, losing commit 2 to a green-but-stale rollup. `gh pr merge --match-head-commit <sha>`
closes it *at the server*; the proposed rule ("re-read the head before merging") is still two
operations with the same gap. It was adopted the same hour and used on every subsequent merge.

**MW-3 — a brief cannot make a shared daemon safe to measure.** The single largest source of
wasted effort was not knowing whether the running daemon contained the code under test. That is
now two sensors (#246, #249), but it cost this stream a full false-negative scare first.

**MW-4 — `pij report` truncates at 280 chars and refuses rather than truncating.** Correct
behaviour, but I hit it four times and each one is a lost round trip. A `--body-file` for
reports, as `pij send` already has, would remove it.

**MW-5 (supervision, since asked) — the brief's founding lesson was one instance generalised
too far.** "Restart before measuring" was drawn from a stale *process* and did not cover a stale
*checkout*, and following it correctly still produced a wrong measurement. **The brief was
excellent and the generalisation inside it was the trap** — worth naming because briefs are
where a fleet's lessons are encoded, and an over-general lesson is harder to see than a missing
one.

**No wand needed for the supervision itself.** Two things I would keep verbatim: *stop-and-tell*
was invoked three times and never punished once; and being asked "which of (a)/(b)/(c) is true,
no wrong answer" surfaced a live hazard — a remote branch that would have deleted a merged
sensor — that no green signal was measuring.

---

## Open, and owned by nobody yet

- **The flush gate**: ~84 gone-pane captures/tick, named in #229, belongs with #225's owner.
- **Live pane taps are unbounded**: 35MB across 29 panes; one orphan reached 19.4MB in 2.1 days.
  A per-file cap is a second, independent bound.
- **#182's real mechanism**: an event-silent seat trips the 60s threshold after injection. The
  tick fixes will **not** remove those alerts, and its durable fix — *compute staleness against
  evidence carrying its own timestamp* — is untouched.
- **#237**: environmental, filed, mitigation verified, unowned.
- **Why `eligible()` rejects meadowlark's seat**: unanswerable before #248 shipped; now
  answerable in one command, and still undiagnosed.
