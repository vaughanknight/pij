# Stream brief — s102-stall-notice-discriminator
**From**: pij-continuing-ermine (o-prime, pij) · **Date**: 2026-08-10T21:35Z · **Lifecycle**: provisional

## Structure tree

```text
Jordan (human)
└─ o-prime pij-continuing-ermine · window o-prime
   ├─ this stream <pij id> · window s102-stall-notice-discriminator · PM
   ├─ pij-efficient-bug · PA · sweeps + chores, zero-actuator (do not task it)
   └─ pij-reasonable-dove · PM · parked `waiting` since 2026-08-09 (inactive)
```

## Work item

- **Plan folder**: `docs/plans/102-stall-notice-discriminator/`
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s102-stall-notice-discriminator`
- **Branch**: `s102/stall-notice-discriminator`
- **Base**: `main` at `e434818e0e636d6796cb63d615095f9f5908dcf5`
- **Allocation**: `alloc-s102-stall-notice-discriminator` (ordinal 102 reserved)
- **Landing**: `/builder 8 ship` to PR merge; teardown only after merge or an explicit abandonment ruling
- **Human ask, verbatim**: *"get a pm on it according to our fleet rules. have it use a light builder flow with default settings please."* — referring to **pij#280**
- **Flow**: **light `/builder` flow, DEFAULT SETTINGS.** Do not over-scaffold. This is a small, well-characterised change with a known fix shape; the plan should be proportionate to that.

### The issue — read it first, it is unusually complete

**pij#280**, filed by Jordan. `gh issue view 280 --repo AI-Substrate/pij`

`buildStalledNotice` (`core/binding.ts:308`) has **two** call sites that answer different
questions and emit byte-identical text:

| | line | fires on |
|---|---|---|
| legacy whole-life | `daemon.ts:915` | `d.state === "working" && lastEventAt age > STALE_AFTER_MS` |
| watchdog-derived | `daemon.ts:949` `pushWatchdogResponse` | `event.response === "stalled"` — reads neither `state` nor `lastEventAt` |

Both print `⏸ <id> … has gone quiet (stalled — no activity past the stale threshold). Pane %N is
still alive but silent.` **That sentence describes only the legacy detector.** On the watchdog path
there may have been abundant activity; the seat simply did not answer a nudge in its window.

The shared **latch** is deliberate and correct (`daemon.ts:928-929`). The shared **message** is the defect.

### Measured cost, not hypothetical

Jordan modelled the legacy predicate because the wording described it: **561 consecutive samples,
spanning multiple ⏸ notices, and the legacy predicate was never true — not once.** The instrument
was correct; it measured inputs the firing detector does not read.

## The ask

1. **Distinguish the two in the notice text.** Two words is enough — e.g. `(stalled: no events)` vs
   `(stalled: no watchdog response)` — or pass the source into `buildStalledNotice` as a
   discriminator. The failing property is that *the output cannot distinguish two states*.
2. **Persist the discriminator durably.** `failureReason` is already written by BOTH paths and the
   code already calls it the machine-stable reason (`daemon.ts:913`:
   *"Persist failureReason so pij state/list --json surface the machine-stable reason (FIX-4)"*).
   Both write `"stalled"`. Splitting it (`"stalled"` vs `"watchdog-stalled"`, exact naming yours to
   propose) makes the discriminator queryable via `pij state --json` long after any pane scrollback
   is gone — which closes Jordan's secondary ask **without** a new rotating log.
   **Check the consumers before you split it**: anything comparing `failureReason === "stalled"` must
   keep working, including the clear-on-recovery branches at `daemon.ts:920-924` and `:936-940`.

**Judgement call that is yours, not mine**: whether a rotating push-decision log is still warranted
on top of the `failureReason` split. I think not, but I have not surveyed what else the log lines
carry. Say what you conclude and why.

## Known-unresolved — do not paper over it

There is an open contradiction on the issue that neither Jordan nor I resolved, and **you should not
assert an answer you have not earned**:

- `pushWatchdogResponse` returns early unless `event.response === "stalled"` (`daemon.ts:943`);
- but in the same cycle the watcher relay reports the response as **`unknown`**
  (*"no response was outstanding — nothing was examined; this is not a health claim"*);
- yet a ⏸ arrives anyway. I have ~20 consecutive cycles of both messages co-occurring on
  `pij-efficient-bug`, and ~150 epoch-named capture files if pairing them against notice arrival
  times helps.

Candidates I could not separate: the relay's `unknown` and `WatchdogResponseEvent.response` are
different classifications; they refer to different evaluation moments; or a third path exists.
**If your fix makes this decidable, say so explicitly — that may be its most valuable property.**

## Prior art (paths only)

- `docs/plans/097-silent-detectors/` — nearest thematic neighbour
- `docs/plans/096-watchdog-verdicts/`, `docs/plans/101-daemon-tick-cost/`
- `docs/how/pij-watchdog.md`
- `docs/how/fleet/evidence-discipline.md` (on PR #168, unmerged) — § on controls whose PASS is
  indistinguishable from having examined nothing; this issue is an instance
- Related open issues: **#262** (the stall flag itself; note my retraction there), **#264**
  (independent constants), **#258**

## Descriptive fence

- **Expected touch set** (all verified on disk at brief time):
  - `.pi/extensions/pij/core/binding.ts`
  - `.pi/extensions/pij/core/binding.test.ts`
  - `.pi/extensions/pij/daemon.ts`
  - `.pi/extensions/pij/daemon.test.ts`
  - `docs/how/pij-watchdog.md` (if the persisted values become user-visible)
  - `docs/plans/102-stall-notice-discriminator/**` (yours)
- **Scratch**: `.harness/temp/s102-stall-notice-discriminator/**`
- **Hard exclusions**: `government/**` (o-prime single-writer) · `.the-flow-state.json`,
  `the-flow.json`, `the-flow.md` (the-flow guided mode is their sole writer) · any other worktree
- **Known separate-branch overlap**: `docs/how/fleet/*` is being changed on `docs/fleet-live-findings`
  (PR #168, mine). You should not need those files; if you do, tell me and I will reconcile at merge.
- **New worktree-local path**: persist, tell me, continue. Tell-not-ask (global invariant 11).

## Gates

`harness checks` is the done-gate. **Known environment trap, cost another stream hours today**: this
tmux server's global env carries `FORCE_COLOR=2`, and some harnesses inject `NO_COLOR=1` into tool
child shells; the pair makes Node warn on stderr and fails ~16 tests asserting `stderr: ""`. If you
see that, run `env -u FORCE_COLOR harness checks` and say so in your report — it is **#273**, not
your regression. Verify rather than assume it applies to you: `echo "[$FORCE_COLOR] [$NO_COLOR]"`.

**Do not merge with `gh pr merge --auto`.** `main` has no branch protection (**#274**), so `--auto`
is a synonym for `--merge` and gates nothing. Read `statusCheckRollup` to a concluded state first.

## Orient stack

1. Invoke `/pij prime`; stream triage loads `references/prime/orchestrator.md`
2. Portable global orient: `references/prime/orient-global.md`
3. Repo local orient: `government/orient-local.md`
4. This brief
5. `/thesis` through the host skill mechanism
6. Human preamble + preamble checkpoint
7. Protocol/ritual pages only on demand

## Assignment and reporting

- Assignment is **provisional until Jordan's preamble** and your first report.
- A validated plan stops at `WAITING_FOR_BUILD_CONFIG`; no implementation until the human confirms
  the coder/reviewer profile.
- Report at preamble, every phase checkpoint, and ship, using
  `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`.
- All A2A messages follow **§ C10 — Wire discipline**.
- Worktree-confined work is notify-only; a baton is needed only at convergence or a shared mutable
  resource.
- **Verify-don't-relay points upward, at me.** I published a wrong attribution on #262 today —
  asserting a single call site after grepping the *string* rather than the *function*. If something
  in this brief does not survive your own read of the source, say so; that is the job, not friction.
