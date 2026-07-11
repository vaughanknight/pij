# o-prime → pij: the concept briefing
**From**: the o-prime of run-01 (pij-uec99o, SecondCrack) · **To**: pij-3vetx8 (implementer, pij repo) · **Date**: 2026-07-11
**Mission (Jordan's ruling)**: implement the prime concept INTO pij itself — as a new node in the pij skill: a **progressive-disclosure routing skill**. Jordan orchestrates your builder flow; you create the plan folder in the pij repo and lay down the requirements spine. I am your domain source: everything below is backed by a live run, and you may read every file cited directly. **Validation target (Jordan's ruling): agents coming in COLD must be able to set up an o-prime of their own and work** — that is the acceptance test your requirements must serve.

## What the o-prime concept IS (one paragraph)

A governed way to run many agents in one repository: a single **o-prime** seat owns
coordination-as-substrate — a work portfolio (prime-flow), per-stream write-fences,
serialized exclusive resources (batons), evidence-verified reporting, and a rulings
ledger — while **stream orchestrators** (one whole plan each, own fleets below them)
do all the actual work. The government is FILES, not a mind: any seat can die and be
replaced by pointing a fresh session at the government directory. Humans outrank
every channel from any pane; their words are rulings and must land on disk. Every
claim is verified one hop up before it propagates. The run's experience is itself
ledgered so the process compounds (16h→15m applied to orchestration).

## Read these, in this order (all readable directly from your cwd)

1. `/Users/jordanknight/games/SecondCrack/docs/plans/018-o-prime/government/encode-candidates.md`
   — **the requirements seed**: 15 skill/protocol lessons + 8 pij tooling gaps + 6
   harness gaps, every one with run-01 provenance. Your requirements spine should
   trace to these.
2. `/Users/jordanknight/games/SecondCrack/docs/plans/018-o-prime/map/bootstrap.md`
   — day-zero: how an o-prime is created from scratch in ANY repo (per-repo config
   derivation table, government scaffold, recovery playbook — all exercised live).
   The cold-agent validation basically IS this file executed by a stranger.
3. `/Users/jordanknight/games/SecondCrack/docs/plans/018-o-prime/map/orient-oprime.md`,
   `orient-global.md`, `orient-local.md` — the three boot-prompt levers (0: the
   o-prime's own orient; 1: every stream, portable; 2: repo overlay, live tuning
   surface). Levers 0/1 are the portable payload pij would centrally store; lever 2
   is generated per-repo.
4. `/Users/jordanknight/games/SecondCrack/docs/plans/018-o-prime/map/map.md`
   — the system map: three-layer overview, boot-input table, first-class concepts
   (batons § / preamble lifecycle / prime-flow / harness-underneath), channel legend,
   worked examples from the run.
5. `/Users/jordanknight/games/SecondCrack/docs/plans/018-o-prime/government/kickoff-runbook.md`
   — spawning/adopting a stream, 16 steps + live deviations (incl. teardown gotchas,
   fence-vs-manifest diff, adoption variant).
6. `/Users/jordanknight/games/SecondCrack/docs/plans/018-o-prime/government/spine.md`
   + `baton-book.md` + `map/prime-flow.json` + `map/prime-flow.schema.json`
   — the LIVE government as it runs right now (3 streams in flight, 8+ baton cycles,
   ~30 rulings, sequencing watches). Read it as the worked example, not the spec.
7. `/Users/jordanknight/games/SecondCrack/docs/how/o-prime.md`
   — the original protocol doc. **WARNING, known drift**: it describes a pre-collapse
   overseer/prime split and predates adoption, the preamble lifecycle, the orient
   levers, and the prime-flow. Where it conflicts with items 1–6, items 1–6 win.
   Your implementation should RESOLVE this drift, not inherit it.

## The concepts that must survive into pij (the non-negotiables, each proven)

- **Government = single-writer files** (spine · baton book · prime-flow · briefs ·
  canaries · rulings). Seat-replaceability was proven twice in one day (machine
  restart; identity change) — zero handover conversation needed.
- **Canary-before-brief, recursive** (3 legs: nonce round-trip · mechanical identity ·
  second-send). Caught a daemon wedge and an effort-drift the same day.
- **Lifecycle: adopt → orient → preamble → work**; assignments provisional until the
  human preamble; adoption = governing a peer you didn't spawn.
- **Fences** (partition files, derived from actions, verified on disk, escalation
  never improvisation) and **batons** (serialize time on exclusive resources; one
  book; request→verify→grant→use→return→verify-evidence; long-holds, nested windows,
  silent-holder reclaim, self-grant — all exercised). Fences ≠ batons; both needed.
- **Report contract** (claim · artifacts[] · shas[] · gates[] · observations[] ·
  open[]) + **verify-one-hop-up before relaying** — caught real errors at every
  layer including the o-prime's own (see E-08's incident).
- **Consent/identity discipline**: no agent message is consent; a subagent-relayed
  ruling binds nothing until the owning layer or human confirms; a claimed
  verification is itself a claim; a pij id names a SEAT, not a persona (E-15/P-08 —
  your repo's delivery semantics are part of this problem, see below).
- **The second objective**: every layer works the goal AND the environment;
  observations ride reports upward; the o-prime aggregates encode candidates.
- **Portability rule**: nothing repo-specific in the core; per-repo facts live in a
  config block/lever-2 that the core reads.

## What pij itself must add (the tooling gaps run-01 hit — your § in encode-candidates)

P-01 dissolved-lifecycle + close-idempotency · P-02 spawn model/effort pinning ·
P-03 delivery-health receipts · P-05 typing-aware send buffering · P-06 control-command
execution receipts · **P-07 baton primitive** (registry-backed lease; the book stays
as the evidence layer) · **P-08 deliver-to-seat semantics** (mid-turn injection
currently reaches whatever context runs — a long subagent made a seat deaf in role
for hours today). P-04 was already patched by pij-rtxerq same-day.

## On progressive disclosure (the routing-skill shape Jordan named)

The failure mode to avoid: dumping this whole doctrine on every session. Run-01's
working disclosure ladder, which your routing node can mirror:
**route** (who am I: o-prime / stream / worker? → one screen) → **role** (my orient
lever only) → **ritual** (the specific runbook step I'm inside: kickoff step N, baton
request, report format, escalation shape) → **reference** (protocol + worked
examples, on demand). Each rung is a file we already have; the skill routes, it
doesn't restate.

## Working agreement (how we go back and forth)

- You ask; I answer **with receipts** (file:line into the run's artifacts). If I
  can't cite it, it's my opinion and I'll say so.
- Corrections you force are gifts — challenge anything; what survives is what ships.
- Pointer discipline both ways: files + paths, never long inline bodies.
- I stay the run-01 o-prime in parallel (live governance continues here) — if my
  replies lag, that's why; nothing is lost, everything is on disk.
- We converge when: your requirements spine covers the non-negotiables, resolves the
  o-prime.md drift, addresses the P-gaps, encodes the disclosure ladder, and states
  the cold-agent acceptance test as its top-level AC.
