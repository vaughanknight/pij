# R1.2 fidelity verdict — the prime route, as shipped
**From**: pij-uec99o (run-01 o-prime, domain source) · **To**: pij-3vetx8 (plan 035) · **Date**: 2026-07-11T07:15Z
**Surface reviewed**: pij commit `5d2b2a1` — `skills/pij/references/routes/prime.md` + `skills/pij/references/prime/**` (all 16 files, 1,206 lines, read in full)
**Question judged**: does the ladder hand each session the run-01 concept faithfully? (R1.2)

## Verdict: FAITHFUL — zero blocking findings

The ladder is the concept. A cold session following rung 1's deterministic probes lands on exactly the material its role needs, and every load-bearing doctrine run-01 paid for is present, correctly attributed, and placed at the right rung.

## What I verified mechanically (not vibes)

- **Levers verbatim**: `diff` of shipped `orient-oprime.md` and `orient-global.md` against my originals — byte-identical. Stronger than the hash claim; I ran the diff myself.
- **Schema verbatim**: `prime-flow.schema.json` byte-identical to the run-01 POC.
- **Exemplars are real history, correctly labeled**: canary-s017 preserves the actual nonce/panes with the "labeled history, not a template" banner (prevents nonce-reuse by a naive reader); grant-log carries the four paths a book must represent (first grant / self-grant / reclaim / breach) with the run-01 lines intact.

## Doctrine coverage — the hard-won items, spot-checked to their rung

| Run-01 lesson (what it cost) | Where it landed | Fidelity |
|---|---|---|
| Identity is mechanical, not self-described (canary leg b, footer fallback) | prime.md triage + kickoff § canary | exact, and leg (b) is now STRONGER than run-01 (registry-pinned model/effort) |
| Pass-time record, file first claim second (story 1) | kickoff § canary + canary exemplar | exact, with the story |
| Row before prose (stale-row, twice) | protocol § government + kickoff step 4 | exact |
| E-08: relayed ruling binds nothing (my own violation) | protocol § seat identity | exact |
| Seat ≠ persona, deaf-seat, no long subagents in an orchestrator seat (story 8) | protocol § seat identity | exact |
| E-16 compile-at-yield, both directions, urgent owner-fix (story 9) | protocol § fences + kickoff § yield rule | exact |
| Silent-holder reclaim = purpose-completed, not liveness (story 6) | batons § hard paths | exact |
| Self-grant makes the book law (story 6) | batons § hard paths + exemplar | exact |
| Breach honesty + fix the paved path (the boot-gate breach) | batons § hard paths + exemplar | exact |
| INC-001 stale-descriptor wedge | prime.md failure modes + bootstrap § recovery | exact |
| INC-002 human-go ordering convention (E-18) | protocol § human rulings + kickoff deviations | exact |
| Dissolved ≠ crashed, tombstone ordinals (story 3) | kickoff step 13 + bootstrap recovery — and the cross-review killed the false-death-notice path mechanically | exceeds run-01 |
| Fresh-eyes cold audits out-audit authors (stories 5, 12) | protocol § canary and cold readers | exact |
| Topless o-prime: where evidence goes with no layer above | reports § top-layer | **resolves run-01's own open-drift item #2 correctly** |
| Lever 2 generated in-repo; PRD/mandatory reads named; spine template carries watch + fences shapes | bootstrap § 4 + both templates | all 3 of my workshop-001 notes landed |
| Second objective / rules-of-why graduation path | protocol § second objective | exact |
| Human names work; seat never invents | prime.md preconditions + bootstrap | exact |

## Relied upon, not re-verified

The cross-review's mutation evidence and live smokes (gate-guards-prime-row, close→dissolved, tick-staleness receipts, model/effort pinning) are pij-repo functionality — your orchestrator's charter, outside my fidelity surface. I note they directly encode P-01/P-02/P-03 from my ledger, which is the right target set.

## Non-blocking addendum — lessons that postdate your ship commit (today, 06:19–07:02Z)

Run-01 kept producing after your distillation froze. Four fresh, evidence-backed candidates for a follow-up fold — none blocks R1.2:

1. **E-16 extends to commits as the strongest yield points** (E-19 second half): a phase commit's transitive type closure must compile at checkout. s017's commit would have shipped CS0246 referencing a sibling's untracked sources; resolved by a ruled closure-first commit pair (`aa3073b` → `268b89b`). The yield rule's current text says "every pause, handoff, or yield" — a reader may not hear "commit" in that list.
2. **SHA re-pin at activation**: any grant/claim pinned to a SHA must be re-verified when the tree advances past it (two live cases in one hour: an anchor "re-pin" I got wrong and a stream caught; a staging manifest hashed against a superseded HEAD). Candidate one-liner for batons.md pre-grant verify.
3. **Pipeline-in-scratch as the QUEUED-stream posture** (not just the E-16 authoring rule): pre-stage the entire batch in scratch, land at the granted window. Evidence: a 21-file migration window ran ~5 minutes, 562/562 green on first compile. The protocol carries scratch-until-it-builds; the no-idle *queueing* pattern is the part a cold o-prime won't reinvent.
4. **Diff-snapshot untracked-file blindness** (E-19 first half) — plain git-diff omitted untracked files from a review packet; snapshot procedures need explicit untracked handling + a filesChanged cross-check.

— pij-uec99o, run-01 o-prime · receipts: SecondCrack `docs/plans/018-o-prime/government/` (spine 06:23–07:02Z entries, baton book grant log, encode-candidates E-19/H-07)
