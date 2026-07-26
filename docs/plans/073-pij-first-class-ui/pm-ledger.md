# PM ledger — stream s073, plan 073

PM: pij-exclusive-whitefish · o-prime: pij-reasonable-dove · consumer: pij-cheap-cheetah (chainglass)

## Stream

| | |
|---|---|
| project | `p073-pij-first-class-ui` (planPath `docs/plans/073-pij-first-class-ui/`) |
| allocation | `alloc-s073-pij-first-class-ui`, ordinal 73, all three steps ok |
| worktree / branch | `pij-worktrees/s073-pij-first-class-ui` / `s073/pij-first-class-ui` |
| base | `c4b6fb5` |
| fence | `fence-alloc-s073-pij-first-class-ui`, notify-only; `cli.ts` + `types.ts` declared shared |

## Roster

| seat | id | model | canary |
|---|---|---|---|
| coder | `pij-sacred-pony` | copilot `gpt-5.6-sol` xhigh | **PASS** — model matched via pane-footer, `pane:%2757 pid:57095 native:1e544d20…` |
| reviewer | not yet spawned | cold seat, session-level independence (Jordan, ruled ×4) | acquired at first review, never a phase early |

Assignment `asg-ugliest-coral` on the coder.

## Findings — the tooling substrate

### F1. flow-pair is **not exposed to claude seats**; it is **not** missing (corrected)

My first report said "not installed on this machine". **That was wrong and would have sent a
fixer to install something already present.** Verified:

- `~/.copilot/skills/flow-pair` → `~/pi-hacking/pij/skills/flow-pair` — **exists** (copilot only)
- `~/.claude/skills/flow-pair` and `~/.agents/skills/flow-pair` — **do not exist**
- `~/.claude-alt/skills` is a symlink to `~/.claude/skills`, so a claude seat checking its own
  skills dir correctly finds nothing
- CLI is on PATH: `~/.npm-global/bin/flow-pair`, `readlink -f` →
  `/Users/jordanknight/pi-hacking/pij/skills/flow-pair/lib/cli.ts` — i.e. it resolves into the
  **canonical checkout**, consistent with the documented source-provenance invariant

**Accurate statement**: *the flow-pair skill is exposed to copilot seats only; the CLI is on PATH
and resolves into the canonical checkout.* The gap is an exposure gap, not an install gap.

### F2. Why we still hand-orchestrate the review — and the precise defect shape

Not a degraded fallback. The `flow-pair` CLI's `review` verb is an artifact-contract gate that
**never reads the diff**, so any verdict it emits is not a code review.

**Correction to the reported shape, which I verified in `skills/flow-pair/lib/review.ts`:** the
CLI does **not** fabricate `APPROVE` out of nothing. There *is* a zero-findings guard
(`review.ts:219`) that refuses outright: *"a verdict cannot be minted from zero reviewer input."*
The route doc's description is the accurate one on that point.

The real hole is **narrower and easier to walk into**: `determineVerdict` (`review.ts:140-148`)
returns `FIX_REQUIRED` for critical/high, `APPROVE_WITH_NOTES` for medium, and a bare
**`APPROVE` for anything else — including a findings list that is entirely `low`**. The guard
only covers the *empty* list. So a reviewer who files three low-severity nits gets a
**CLI-computed `APPROVE` that no reviewer ever uttered**, on a diff nothing read. The file's own
comments (`review.ts:217-218`) name this hazard — "a real reviewer's FIX_REQUIRED was shadowed by
a default APPROVE".

**The tool is honest; the risk is entirely caller-side.** `flow-pair --help` says it outright:
*"review — Emit verdict from supplied findings (**contract gate — not a code review**)"*
(`skills/flow-pair/lib/cli.ts:46`), and `review.ts:219`'s refusal carries the verdict-law comment.
**Nothing in flow-pair reads code. Nothing in it reviews.** The verdict verb does exactly what it
advertises. The failure mode is a *caller* mistaking a contract gate for a reviewer — which is
precisely what the pair route exists to prevent.

So: **hand-recording the verdict is not a workaround for a broken tool — it is supplying the input
the tool is designed to consume.** The engine cannot be the reviewer, by construction. We accept
the ledger and prompt-learning loss; we do not accept a verdict nothing read the diff to produce.

### F4. Standing check — look for the guard before proposing one

Twice on 2026-07-26 this fleet was one step from building a guard that already existed, from
opposite directions: the archived tier, and the "refuses to mint from zero findings" case (the
guard is there — the uncovered path is the adjacent all-`low` fall-through). Both times the real
defect sat *next to* the existing guard, not in place of it.

**Before proposing a guard: check whether it exists, then check the path immediately adjacent to
it.** A gap beside a working guard reads exactly like a missing guard, and a fix aimed at the
wrong one lands on code that is already correct while the real hole stays open.

### F3. Control integrity — no self-review, ever

If the reviewer cannot be brought to `bound` after one heal attempt, this stream **HALTS** with a
named error surfaced to a human. It does **not** fall through to the orchestrator reviewing the
coder's work. The orchestrator sanity pass is a spot-check *on top of* an independent verdict,
never a substitute for one — with no reviewer peer there is **no verdict**.

Dove reports this same degradation is an open control-integrity bug in flow-pair's lazy-spawn
reviewer path. Hold the line under time pressure.

## Proof method — per file, in isolation (SUPERSEDES the pin below)

> **The pin of 3 recorded below is RETRACTED as a decision procedure.** It is kept because the
> D-035 characterisation in it is still true and because the retraction is the lesson.

**The full-suite red set on this box is a random variable.** Two back-to-back runs from the repo
root with `b05eba9` applied: **run A = 4 failed / 3 files, run B = 8 failed / 5 files.** The extra
files were `worktree.test.ts` (2), `core/cli.test.ts` (1), `harness/scripts/packages-bootstrap.test.ts`
(1), `skills/flow-pair/test/cli-observe.test.ts` (1). All four run in isolation on a clean tree:
**7 passed, 298 passed, 2 passed, 3 passed** — every one green alone. At least seven different
tests across five files have appeared so far, and *which* ones appear changes run to run.

So **"only my guard flipped, known-red set unchanged" is not decidable here.** Against a pin of 3
a coder either sees extra reds and wrongly concludes something landed underneath them, or — the
dangerous one — sees their injected regression sitting among four unexplained reds and files it as
noise.

**The method, binding on this stream:**

1. Prove **per file, in isolation**. Never against the full suite. Isolated runs *are*
   deterministic here — the four greens above establish it.
2. An injection proof is: **run that file alone → baseline green → inject → confirm exactly ONE
   test flips → restore → confirm green.** Decidable, cheap, load-independent.
3. Full-suite runs are **merge-time only**, and any failure in one is a **candidate for
   isolation-checking, never a fact**.

### F6. The baseline is a measurement too

We applied isolation rigour to the *suspicious* failure (D-035) and not to the *reference* that
framed it — because a baseline feels like ground truth rather than an observation. It is an
observation, taken under conditions, with the same failure modes as any other. **A reference
measured under varying conditions is a signal that lies**, and it lies in the worst direction:
it launders a real regression as expected noise.

Completes the set. F4: look beside the guard you are adding. F5: look for guards others wrote
against the surface you are changing. **F6: hold your reference to the same standard as your
subject.**

## Retracted pin — the reported red set at `c4b6fb5`

**Superseded by the section above. Not a valid baseline.** The D-035 characterisation stands; the
count does not.

| # | test | class |
|---|---|---|
| 1 | `cli.integration.test.ts` › *top-level help advertises the prime list filter* | **deterministic** |
| 2 | `daemon-push.test.ts` › *pushes a stalled notice to the creator when a bound session is working+stale* (T011/T012) | load-sensitive |
| 3 | `daemon-push.test.ts` › *does NOT push for a non-stalled session (working with fresh events)* | load-sensitive |

- **#1 is `afdb839`'s fallout, not ours.** Fails alone. Help emits
  `pij list [--here] [--prime] [--archived] [--badge] [--json]` (`core/cli.ts:282`) while the
  assertion still expects the substring without `[--badge]`.
- **#2 and #3 are D-035, confirmed rather than assumed.** The whole `daemon-push.test.ts` file
  passes in isolation (19 passed, 2 skipped) including both; they fail only under full-suite
  contention against the 5s subprocess budget. Characterised, not defective.

### F5. Injection proves your guard, not everyone else's

`afdb839` ran the injection discipline correctly and still shipped main red. Injection proves the
guard **you wrote** is load-bearing; it says nothing about a guard **someone else wrote against a
surface you changed**. `afdb839` touched `cli.test.ts`; the stale assertion lives in
`cli.integration.test.ts` — a file the change never opened. Help text is a shared contract surface
with assertions scattered across files, and `tsconfig`'s `**/*.test.ts` exclusion (task #12) means
nothing type-level was ever going to catch a stale string assertion either.

Companion to F4. F4: *look beside the guard you are adding.* F5: *look for guards others wrote
against the surface you are changing.*

## Standing rulings carried into this stream

- **Merged is ADOPTED, not VERIFIED.** No item is reported shipped off a merge. Everything that
  fooled this fleet on 2026-07-26 was green at exactly the merge stage.
- `planId` owner `cli`, **not** append-only. Discriminating control = a **second** write by a
  non-owner over an existing value; set-then-read proves nothing.
- `planId` independent of `Project.planPath`, opaque, never derived; disagreement is not an error.
- Resolution outcome is **emitted in the spawn receipt, never stored** on the descriptor.
- `--plan-id` dropped from `dispatch`. Two writers: `spawn` creates, `attest` corrects.
- One verb: `pij attest`. `--designation` lands with item 2 as a pure addition (Jordan sequences).
