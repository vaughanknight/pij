# Phase 2 fix10 re-review - 94577040

**Verdict: REQUEST_CHANGES**

## P1 - the sixth active copy remains in the research dossier

`assets/research-dossier.md:31` still states:

> `lastTickAt` is liveness telemetry regenerated 600ms later by definition.

This is the same false repair premise removed from the source header, no-fsync
docstring, plan, and PR body. It is not an archival review quote: the dossier
opens by presenting its contents as the stream's measured/source-read basis and
uses the sentence as the durability rationale for this change. A stopped or
crashed daemon has no subsequent tick, and a scheduled callback is not bounded
to 600ms.

Replace it with the same actual property now used elsewhere: a subsequent daemon
tick rebuilds the value **if one runs**; otherwise it remains absent and the
receipt path conservatively reports `unverified`. `core/receipts.ts:31-33`
proves the latter for a missing stamp.

The historical claims in `assets/execution.log.md` do not create another live
finding: they are chronological records of earlier reasoning and their later
entries explicitly record the falsifications. The research dossier has no such
historical framing or correction.

## Confirmed

- The two changed source comments are now conditional, and the no-fsync
  rationale correctly rests on missing-stamp degradation rather than eventual
  regeneration.
- The plan and PR body use the same conditional statement.
- The four implementation-owned files contain no further unconditional
  scheduled-repair claim. In particular, P1g's “very next tick” test supplies
  its own `heartbeat.write()` and its companion comment says that this is
  conditional, not evidence that a daemon tick will happen.
- No post-falsification active claim was found. Age is only a prioritization
  signal, not a sound classification rule: Phase 1 also already contained
  correct missing-stamp-to-stale degradation text. The active Phase 1 dossier
  copy shows why the complete PR documentation surface must be searched.

No reviewer-authored mutant was warranted: this commit changes comments and
documentation only, and the defect is a source-verifiable semantic claim.
