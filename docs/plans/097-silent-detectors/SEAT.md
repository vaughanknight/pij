# Stream s097 — `silent-detectors` — seat record

> **Written by the o-prime, not by the seat.** `pij-annual-lemur` wedged before it could file its
> own — pane alive, `Working` indicator frozen, eleven messages queued and unconsumed. This record
> is therefore **second-hand** and marked as such: the findings below are drawn from the stream's
> own reports, and anything it knew but had not yet reported is lost.

| | |
|---|---|
| **Seat id** | `pij-annual-lemur` |
| **Harness** | claude (`claude-opus-5`, high) |
| **Role** | PM, stream `silent-detectors`, wave `w1-hardening` |
| **Prime** | `pij-continuing-ermine` |
| **Worktree** | `pij-worktrees/s097-silent-detectors` · branch `s097/silent-detectors` |
| **PR** | **#198**, merged 2026-08-08T06:50:16Z |
| **Peers** | `pij-dizzy-giraffe`, `pij-naughty-prawn` — **never closed**; owner wedged |
| **Revive** | `pij revive pij-annual-lemur --print` |

## What shipped

**#198** — *inert-subscription detects a dead RECIPIENT, not just a dead trigger*. Closed **#114**
and **#154**.

## What did NOT ship — do not infer otherwise

**#141, #156 and #125 remain OPEN.** The stream's plan carried phases 01–05 and #198 was phase 1.
**The seat wedged before answering whether those three were later phases or merely un-closed**, so
they stay open as the honest record. *Do not close them on inference; nobody has established which.*

## Its contributions beyond its own fix

This stream produced the wave's most reusable **tooling**, all of it in `~/.pij/shared/mutate.mjs`,
which four other streams used as their default gate.

- **`mutate.mjs` itself** — the in-memory mutation gate.
- **EXIT 1 HAS TWO CAUSES AND THE TOOL CANNOT DISTINGUISH THEM** — a vacuous test, *or* an
  unreachable/equivalent mutant where the test is fine and the mutant is wrong. It had relayed
  exit-1 to three streams as vacuity, discovered the unreachable case **in its own PR**, and
  corrected all three rather than let a tool it built assert a conclusion it had not earned.
  *(Later extended by s100: there is a **third** cause — the code is redundant.)*
- **The graded subprocess guard**, after its own blanket version false-positived on **its own
  spec** — own-source refuses, one-hop warns, and a marker in the mutation target is ignored,
  because the subject shelling out says nothing about whether the spec does.
- **PREFER OBSERVATION TO PREDICTION WHEREVER THE TWO OVERLAP.** The tool already carried an
  `applied` flag that *observed* whether the transform ran — so exit 2 had covered the
  pure-subprocess case **by measurement since v1**. *"I built a predictor for something the tool
  could already observe, then spent three fixes making the predictor less wrong."*
- **The four-minute drift** — it built a second implementation **inside the tool built to remove
  second implementations**, and the copies disagreed before the feature shipped.
- **The N=1 rule** — it falsified its own ledger row (*"append at end of file"* is correct at N=1
  and collides at N=2), and that rule then caught **three more seats including the prime**.
- **`daemon.wiring.test.ts`** — built because *composition-root edits are untested by
  construction*.

It also complied with a ruling that **deleted work it had already finished** (`--list-refusals`),
and reported the deletion rather than quietly keeping it.

## How it ended

Wedged with its deliverable merged and its close-out unfinished: **no seat record of its own, no
issue disposition, two peers left open.** Those peers are uncloseable by anyone else — ownership
does not transfer — and their buffers are unharvested.

> **The stream that built the fleet's detector tooling was itself undetectable as stopped.** Its
> card read `waiting`, its system axis read `working`, and a single pane capture showed `Working`.
> Only a *second* capture, thirty minutes later with every counter identical, distinguished frozen
> from busy.
