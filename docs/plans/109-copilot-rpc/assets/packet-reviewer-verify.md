# Reviewer packet — u-copilot-verify (unit 0)

**Read first**: `../SHAPE.md` and
`docs/plans/108-rust-port/assets/REVIEWER.md` — thirteen defect classes and seven
habits, every one from a finding that got past a gate. It is a checklist, not
background.

## What you are grading

Not code. **Evidence.** The unit's output is a claim-by-claim verification of the
Copilot RPC surface against the installed binary.

## What to attack

1. **Does each CONFIRM rest on an observation, or on an absence of contradiction?**
   "It launched without error" is not evidence that a port is listening. This plan's
   single most expensive lesson: a null result reported as a positive — a
   discriminator that never ran, published as proof it discriminated.
2. **Was any claim verified against the wrong thing?** A host swallows a dead
   extension and exits 0 with the expected reply; a readiness probe answers a
   different question than a busy gate; an ack proves the layer that acked.
3. **Instrument state.** Which binary, which version, which process was live at the
   time. A test whose instrument state is not pinned reports the environment, not the
   change.
4. **Did the coder touch a production seat?** That is a finding regardless of outcome.
5. **Are the UNDETERMINED entries honest** — genuinely unsettleable without transport
   code — or are they claims the coder did not attempt?

## Rules of engagement

Numbered findings, file:line where applicable, failure mode, severity. Keep a
**CHECKED AND NOT RAISED** section: it tells the PM the shape of your coverage, not
just its hits. Report your own red rather than re-running until green. Disclose your
own instrument errors — nine were disclosed in the last plan and none reached a
verdict, which is the only reason the rest was trustworthy.

APPROVE only when nothing remains. Across eight waves of the previous plan, over a
hundred findings were raised and **none refuted** — a clean first pass would be the
anomaly.
