# Stream s095 — `liveness-fields` — seat record

Recorded so this stream is revivable: a merged PR without the seat that holds the
reasoning behind it is an answer with no way back to the argument.

| | |
|---|---|
| **Seat id** | `pij-fair-aphid` |
| **Harness** | copilot (`claude-opus-5`, effort high) |
| **Role** | PM, stream `liveness-fields`, wave `w1-hardening` |
| **Prime** | `pij-continuing-ermine` |
| **Worktree** | `/Users/jordanknight/pi-hacking/pij-worktrees/s095-liveness-fields` |
| **Branch** | `s095/liveness-fields` |
| **PR** | [#200](https://github.com/AI-Substrate/pij/pull/200), merged 2026-08-08T07:35:18Z (head `a0e3fca`) |
| **Charter** | `~/.pij/pij-continuing-ermine/briefs/00-fleet-onboarding.md` + the stream charter relayed inline |
| **Issues** | [#142](https://github.com/AI-Substrate/pij/issues/142) (registry pid is the pane shell), [#155](https://github.com/AI-Substrate/pij/issues/155) (terminal is a latch) — both closed, verified individually |
| **Ledger block** | `F-400`–`F-407`, `W-400`–`W-404`, `S-400`–`S-403` in `docs/how/fleet/ledger/s095-liveness-fields.md` |
| **Fleet peers** | coder `pij-guilty-skunk` (copilot `claude-opus-5`) · reviewer `pij-serious-dinosaur` (copilot `gpt-5.6-terra`) |
| **Artifacts** | `docs/plans/095-liveness-fields/` — plan, research dossier, published contract, execution log, round-1 review, rebase checklist |

## Corrections this stream made to its own record — read these first

**Four claims were stated and later falsified by measurement.** They are here, not only in the
findings, because someone arriving cold at a merged PR reads the seat record first and will
otherwise re-derive a framing already known to be wrong.

1. **#142's own proposed remedy would have inverted the bug.** The issue proposes `pgrep -P`
   because "the registry pid is the pane's shell". Measured across 23 live seats: the agent is
   **at** the registry pid for **16** and one level below for **7**, split by spawn path
   (`--session-id` fresh spawn vs `--resume` under a shell), not by harness. A one-level `pgrep`
   returns "no agent" for the majority — **false-dead on 16 seats, the destructive direction.**
   The shipped probe is a bounded descendant walk, self included.

2. **#155's population is not "seats that returned", and this dossier said it was.** That issue
   counts seats that *emitted events after being observed terminal* and reads them as returning.
   For any seat whose **pane** was recycled, that is a corpse being ventriloquised by whichever
   live seat inherited its pane id. Measured: `pij-unwilling-butterfly` (dead, no process at any
   depth) had `lastEventAt` advance **43 minutes between two reads**, while
   `pij-sacred-orangutan` — alive, sharing recycled pane `%47` — landed 20s later. Mechanism:
   `observeActivity` (`core/daemon/loop.ts`) advances `state`/`lastEventAt` from pane readiness
   **with no terminal guard** (pij#172). The count stands; the interpretation does not.

3. **This seat told the prime that s096's watchdog guard reads `terminal`. It does not.**
   `terminal` appears **zero times** in `eligible()` (`watchdog-manager.ts:190-207`). I asserted
   it from issue text instead of opening the file, and the prime had already relayed it. The real
   seam is worse: `watchdog-manager.ts:240` consumes **the blind pid probe itself**, so s096's
   dependency was on Phase 1, not Phase 2, and stronger than either of us thought.

4. **AC-17 was labelled BEHAVIOURAL and is MUTATION-ONLY.** Verified at `origin/main`
   `death-reconciler.ts:109`: pre-fix, a descriptor carrying `terminal` hits `continue`, so a
   persistently dead seat on tick two produces **zero writes and zero notices there too** — the
   observable is identical in both worlds and only the *reason* differs. Its pre-fix red is
   unavailable **in principle**; a red recorded for it would have been an artefact. Discharged by
   a named mutant instead.

## What this stream shipped

**#142 and #155 are one defect in series, both inside `reconcileDeaths()`.** The probe writes a
value it cannot contradict; the loop guard makes that value permanent. Fixing either alone is
observably a no-op for every already-stamped seat, which is why they landed as one change.

- **An identity-aware, three-valued probe.** Bounded descendant walk over a `ps -ww` snapshot,
  matched on the **parsed** `--session-id`/`--resume` value (not a substring — a worktree path can
  contain a uuid). Truncated/unparseable ⇒ `unknown`. Process start time may only ever
  *corroborate*; it can never demote a match, because a revived agent legitimately starts after
  its descriptor.
- **A false-ALIVE direction neither issue claims.** `pij-weak-gurgeh` holds registry pid 952;
  pid 952 is now `IntuneMdmDaemon`, **started three days after the descriptor was written**.
  `isAlive(952)` is `true` forever, so that seat could never be declared dead. Existence is not
  identity.
- **`terminal` became a revisable observation** under an explicit six-row transition table. The
  load-bearing row is the quiet one: `terminal` present + probe `absent` ⇒ **no write, no notice**.
- **`activityCredibility()`**, published as a contract *before* it existed so s097 could code
  against it in parallel. `cause` byte-stable, `reason` never parsed, **`unknown` non-suppressing**.

## The hypotheses this stream disproved

- **"The registry pid is the pane's shell."** True for 7 of 23 live seats, false for 16.
- **"`terminal` + a later event means the seat returned."** Not for a recycled pane (§2 above).
- **"The remedies in #142 exist."** `agentPid` appears **nowhere**; `close --force` gates on
  ownership only (`core/close.ts`) and has **no liveness call site**. A remedy with no call site
  is an untested claim sitting in an issue.
- **"My tests fail without the fix."** Independent validation found **two acceptance criteria
  that already passed on unfixed code**, and a later mutation found a third that was vacuous
  (it compared `undefined` to `undefined` against a pristine seat).

## Three defects this stream found in *itself*

1. **Relocation escapes a guard without tripping it (W-404).** `core/liveness-cost.test.ts`
   asserts that swapping the ProcessPort for `ps`/`tmux` silently costs N forks — this PR's
   headline risk, written by someone else months earlier. The coder **knew** about it, cited it by
   name, and put the fork in a new file to keep `process.ts` compliant. That left the guard
   watching six files that no longer contain the thing it guards: still present, still green,
   **no longer load-bearing.** *Correct local compliance producing global narrowing is far harder
   to catch than negligence, because the diff looks conscientious.* Guard extended.
2. **A whole-file grep cannot tell "wired" from "present" (F-407).** Mutant M3 orphaned the
   capture from its call site — capture still taken, grep still finds it, port still wired
   end-to-end, death sweep receives nothing. **AC-18b stayed green; only the call-site slice went
   red.** A criterion that would have survived a rebase breaking the wiring it existed to protect.
3. **A parse failure that degrades to "not found" is a fleet-wide kill switch (F-406).** A
   GNU-only `lstart` parser meeting macOS renders every row unreadable-with-empty-command, and an
   empty command is not a harness process — so the ladder returns **`absent` for every seat on the
   machine**. One capture bug, one tick, entire fleet stamped terminal. The portability bug is
   ordinary; the defect is that **the unreadable case and the absent case shared an output.**
   Encoded at the capture site, not just recorded here.

## The instrument worth carrying forward

> **Diff your file against main and require that the only changed line is your own row.**

Written to end an hour-long thread in which three successive versions of a heading assertion were
each correct for a tree that had already moved. It answers every question those assertions reached
for — did the shared section survive, is mine gone, is exactly one present, did I touch another
stream's row — **without naming a heading, a string, or a shape**, because it does not identify my
section at all. **It asserts that I produced none.** Its subject is my own action, which is the
only thing in the system I control.

Its general form is the same as this stream's defect: *assert something only you can generate, and
prefer asserting that you generated nothing.*

## Live at close-out

Both peers were asked, before reaping, whether anything in their buffers existed nowhere else.
All stream artifacts were verified present on `main` **before** the question was asked, not
assumed: execution log, round-1 review, dossier, contract, rebase checklist, ledger file.

**Neither peer answered "nothing".** The question recovered four rows that would otherwise have
died with the buffers:

- **F-408** (reviewer) — `mutate.mjs` could not resolve `vitest/config` from a session directory,
  failing *upstream* of the gate: no mutant, no red, no green. Plus the two negative
  confirmations that make its REDs mean what they claim.
- **F-409** (coder) — **a defect in this stream's own merged code**: the row-4 clear is
  load-bearing only because of a writer string in another file, and **zero tests detect** its
  removal. This stream's own criteria are *true and irrelevant* to it, because they assert on a
  pure function's return value rather than on the registry write. Verified independently at
  source by this seat before relaying.
- **F-410** (coder) — `npm install` fails in a fresh linked worktree and reads as a broken repo.
- **F-411** (coder) — the mandatory-port dead end, and the 18 failures that are not regressions.

> **F-409 is the one that matters, and it is an indictment of this stream rather than a credit to
> it.** The stream whose entire subject is *"present is not load-bearing"* shipped a clear that is
> present in one file and load-bearing only because of an argument in another — and proved its own
> correctness with assertions that could not have detected the difference. The defect class was
> not escaped by understanding it. It recurred one level below where we were looking.

The general form, which is why close-out found it: **close-out is the only moment anyone asks a
peer a question it was not dispatched to answer.** The coder was not asked to audit anything. It
was asked what it *discarded*, and went looking.
