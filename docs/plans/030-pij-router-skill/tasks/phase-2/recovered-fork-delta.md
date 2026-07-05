# Recovered flow-pair SKILL.md fork delta (verbatim)

**Provenance**: recovered **verbatim** from the orchestrator (pij-z4bt25) session context —
the flow-pair skill was loaded into that conversation **before** the 4-Jul 13:23 store redeploy
(`just flow-pair-install`) that overwrote the 331-line deployed fork with the 300-line repo copy.
This is the actual deployed-fork text, **not** a reconstruction. Confidence: HIGH (verbatim).

**How to use it (T2.1b port source)**:
- **Base = the current 300-line repo `skills/flow-pair/SKILL.md`** — it carries the *newer* side-stack
  layout language (my 4-Jul edits) that the old 331-line fork did **not** have. Do NOT wholesale-revert
  to the 331 version or you lose those layout fixes.
- **Graft the two sections below** (the ~31-line fork-add that the redeploy destroyed) into `pair.md`
  as you port. These are the three "lost" invariants: *own-the-deliverable*, *trust-but-verify*,
  *orchestrator sanity pass*.
- In the **AC-04 checklist**, mark these rows **`recovered-verbatim (orchestrator session context,
  pre-redeploy)`** — higher confidence than "reconstructed-from-evidence". No user wording-confirmation
  needed for these three; they are the real text.

> **Note**: this recovers the SKILL.md delta only (that's what was in the orchestrator's context).
> If your T2.2 references-disposition surfaces material deltas in the *other* diverged files, flag
> them separately — but the load-bearing **protocol** prose is fully recovered here.

---

## Section 1 — intro paragraph (immediately under `## Orchestrator Decision Protocol`, before the FSM table)

**You own the deliverable — delegation moves the work, not the accountability.**
You are the expensive model in this fleet for a reason: the coder may be a cheaper,
less-capable model, and the reviewer is a *different* model that may have skimmed.
A worker's green tests and a reviewer's `APPROVE` are both **claims**, not proof.
Trust them enough to keep moving — but the last critical eye on every deliverable
is **yours**. Trust, but verify: before you record any approval, cast your own eye
over the load-bearing part of the result (§ APPROVE). If the verdict doesn't survive
your glance, you re-open it — you never rubber-stamp a verdict you can't stand behind.
This is one cheap spot-check, **not** a re-review; the reviewer still does the deep pass.

## Section 2 — the sanity-pass subsection (immediately AFTER the FSM state table)

### The orchestrator sanity pass — the last gate before APPROVE (reflexive)

A reviewer `APPROVE` is the *input* to your approval, not a substitute for it. Before
you record approval, spend **one cheap glance** confirming the verdict survives your
own eye — this is the "verify" half of trust-but-verify, and it is **not** a re-review:

- **Re-read the actual diff hunk** behind the single highest-severity claim the reviewer
  cleared (or, for a clean CODE pass, the one load-bearing guard). Does the code in front
  of you actually match the verdict's story?
- **Confirm Dim-0 was really exercised** for CODE delegations — the review carries mutation
  evidence (the guard, the sed expr, RED→GREEN), not just the word "non-vacuous." If the
  reviewer asserts test quality with no mutation/named-assertion evidence, that is a missing
  proof — treat it as `FIX_REQUIRED`, not APPROVE.
- **Sniff for a rubber-stamp**: an `APPROVE` with no findings, no files named, and no
  evidence on a non-trivial diff is itself suspect. A reviewer can skim. When the verdict
  is thinner than the change deserves, re-open it (bounce back to the reviewer, or look
  yourself) before recording.

If the verdict holds, record it and move on — the goal is a 30-second confidence check,
not a second review. If it doesn't, you do **not** record APPROVE: loop to `FIX` or
re-dispatch the review. The buck stops with you.
