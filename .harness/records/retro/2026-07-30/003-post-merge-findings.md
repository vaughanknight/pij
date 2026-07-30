---
record_kind: "retro"
harness_version: "0.12.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-30T23:25:00.000Z"
agent: "pij-unwilling-butterfly"
plan_id: "s075-task-asymmetry + s076-watchdog-parked"
schema_version: "1.2"
retro_id: "2026-07-30T23:25:00Z-pij-unwilling-butterfly-post"
started_at: "2026-07-30T19:30:00Z"
ended_at: "2026-07-30T23:25:00Z"
summary: >-
  Post-merge drain. Two findings surfaced while parked awaiting the merge ruling,
  both from cross-seat field reports rather than from my own code: the
  currentAssignment repoint (found by verifying another seat's claim rather than
  relaying it) and a refinement to claim-hedging discipline contributed by
  mastodon after it published a wrong mechanism. Both PRs merged (#62 a7824ab,
  #63 6e12d13); #63 is merged but NOT deployed.
entries:
  - id: DL-001
    kind: difficulty
    description: >-
      "report state --assignment <id>" does not merely SELECT which assignment to
      state — it REPOINTS the node's currentAssignment to it. applyStateSet denorms
      "currentAssignment: record.id" (cli.ts:3484-3489) using the TARGETED
      assignment, so stating a superseded assignment silently makes it current.
      Measured live: mastodon reverted the badge but not the repoint and did not
      know, its descriptor reading currentTask "general" while it governed a fleet.
      Two seats (mastodon, guan) hit the surface independently in two repos.
    target: project-sensor
    severity: degrading
    workaround: "Re-point deliberately with report state ready --assignment <real-one> — the same side effect aimed the right way"
    suggested_encoding: >-
      Sibling of the s075 attribution finding: a flag that reads as SELECTING A
      TARGET also MUTATES STATE. Scope the write, do not redefine what is current;
      repointing deserves its own verb. NOTE the workaround is not a repair —
      correctness achieved by aiming the defect in the right direction is still the
      defect, and the recovery requires knowing the mechanism, which neither
      affected seat did.
    fp: "repoint00001"
    disposition: task
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-30T19:36:13.057Z"
  - id: INS-001
    kind: insight
    description: >-
      A blanket hedge does not travel with the claim it hedges. Mastodon opened a
      report with "observations only, the mechanism is yours, I have not read that
      path" and then asserted a bolded named finding three paragraphs down; a
      reader takes the strong claim and leaves the hedge — and mastodon did exactly
      that re-reading its own message. The published mechanism was wrong.
    target: skill
    suggested_encoding: >-
      Mastodon's rule, found by failing the existing one in the way it did not
      cover: GRADE EACH CLAIM WHERE IT IS MADE. An opening disclaimer is
      indistinguishable from no disclaimer at the point a strong claim lands, and
      more so once that claim is bolded, named, or quoted onward.
    fp: "hedgeplace001"
    disposition: kept
    system:
      compound:
        status: open
        source: user
        first_seen_at: "2026-07-30T19:39:38.477Z"
  - id: WIN-001
    kind: win
    description: >-
      Verifying a peer's claim instead of relaying it found a sharper defect than
      the one reported. Mastodon reported "the badge follows a superseded record";
      reading cli.ts:3484-3489 showed the flag was moving which record was current,
      so it had diagnosed a symptom it had just caused. The wrong mechanism cost
      nothing and bought a named finding.
    target: skill
    suggested_encoding: "Receiver duty: read one load-bearing artifact before relaying. Applied to a peer report, not just to a claimed green."
    fp: "verifyfirst01"
    disposition: kept
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-30T19:36:00.000Z"
---

# Retro — post-merge drain

Both streams merged: **#62** `a7824ab` (task close), **#63** `6e12d13` (watchdog
parked-state muting).

## Deployment gap, recorded because it is currently live

**#63 is merged but NOT deployed.** The daemon runs pre-merge code, so parked
seats are still being nudged. A canonical-main daemon restart is with Jordan
rather than being fired machine-wide unasked. Until then the fix exists in main
and changes nothing observable — which is its own small instance of the day's
theme: *merged* is not *in effect*.

## What these two findings have in common with the rest of the day

Both came from **field reports, verified rather than relayed**. The repoint defect
was found by reading the path behind a peer's claim; the hedging refinement came
from a peer auditing its own wrong claim. Neither was findable from my own code.
