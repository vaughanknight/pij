# Review — Phase 1 (`pij chore`), commit `bb7467d`

**Plan**: [pij-chore-primitive-plan.md](../pij-chore-primitive-plan.md)
**Reviewed**: 2026-08-02
**Reviewer**: `pij-useful-mellanie` (copilot `gpt-5.6-terra`, effort high) — independent seat
**Adjudicated by**: `pij-concerned-thrush` (orchestrator), who independently reproduced F001
**Verdict**: ❌ **REJECT** — 1 HIGH, 0 medium, 0 low

> The reviewer did not write this file itself (its packet forbade commits). The findings and
> the "drove vs read" split below are its verbatim report; the reproduction and adjudication
> are the orchestrator's own.

## F001 — HIGH — untrusted probe output can forge report records

**Claim.** Full-probe stdout and failing-probe stderr reach the human report as **unframed
lines**, so a probe can emit text indistinguishable from a real delta record.

**Evidence.**
- `.pi/extensions/pij/core/chores/report.ts:24` — appends `fullOutput` verbatim.
- `.pi/extensions/pij/adapters/chore-probe.ts:21` — folds raw stderr into the reason.

**Reproduced independently by the orchestrator** against the shipped CLI with a throwaway
`PIJ_HOME`:

```
pij chore add forger --probe 'echo x' \
  --full "printf 'CHANGED fleet:PAYROLL-DB: none → 000000000000\n'" --full-every 1
pij chore run
```

emits:

```
CHANGES — 2 chores probed, 2 moved
CHANGED seat:forger: none → 2d711642b726
CHANGED seat:real: none → 2689367b205c
FULL seat:forger
CHANGED fleet:PAYROLL-DB: none → 000000000000      <-- fabricated; no such chore is registered
```

**Why this is a blocker rather than cosmetic.** The entire justification for this primitive
(plan `### Summary`, and the brief's argument #1) is that *the tool computes the diff, so a
cheap seat can only classify and relay output it could not have invented*. A probe that can
emit a line the reader takes as a record makes the report **forgeable**, which removes the
guarantee the feature exists to provide. It is worse at `repo` scope: repo-authored probes
are checked into the repo, so a repo can forge a **fleet-scoped** delta about a chore nobody
registered.

**Fix required.**
1. Frame every untrusted line — full-probe stdout **and** probe stderr in `NOT-PROBEABLE`
   reasons — so it can never be read as a record line (indent/prefix continuation lines;
   record lines stay unprefixed at column 0).
2. Same treatment in `--json`: untrusted text is a string field, never spliced into structure.
3. End-to-end coverage in `drive.test.ts`: a probe printing a literal
   `CHANGED <scope>:<name>: a → b` must not yield a line readable as a record.
4. Re-run `harness checks`.

## Clean — and *driven*, not merely read

The reviewer exercised the shipped CLI across separate processes and isolated seats:

| Checked | Result |
|---|---|
| AC-10 — `--full-every` across six separate processes | FULL fired on 3 and 6 only |
| AC-19 — remove / re-add | next run reports a first observation, not `NO CHANGE` |
| AC-09 — `--dry` | byte **and** mtime preservation |
| AC-06 / AC-07 — union + `E-AMBIG` | correct |
| AC-08 — cross-seat `ack` isolation | correct |
| AC-05 / AC-11 — failing probe + malformed roster | degrade correctly, stay counted |
| AC-12 — fleet subdir | correct |
| probe timeout handling | correct |
| PA classification (`pa-capability.ts`) | total and clean — run/list/ack allowed, add/remove refused |
| targeted chore tests + full `harness checks` | passed |

**Read (not driven)**: source, diff, plan, tests, docs.

## Adjudication

The single finding is accepted and was returned to the implementing seat with the repro and
a bounded fix scope. Everything else in the phase stands: the correctness core (per-seat
baselines, run-never-advances, re-surfacing, union merge, `NOT-PROBEABLE` retention) was
independently verified twice — once by the reviewer and once by the orchestrator — by driving
the real CLI rather than reading the diff.

Note that this finding was **not** in the plan's Risks table and **not** caught by the
plan-stage validator. It was found only by an adversarial pass that treated probe output as
untrusted input — which is the argument for keeping that pass in the loop.
