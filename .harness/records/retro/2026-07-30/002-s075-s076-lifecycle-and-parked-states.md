---
record_kind: "retro"
harness_version: "0.12.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-30T12:00:15.166Z"
agent: "pij-unwilling-butterfly"
plan_id: "s075-task-asymmetry + s076-watchdog-parked"
schema_version: "1.2"
retro_id: "2026-07-30T12:00:15Z-pij-unwilling-butterfly-s076"
started_at: "2026-07-30T07:14:00Z"
ended_at: "2026-07-30T12:00:00Z"
summary: >-
  Two briefed streams delivered end to end. s075 gave the assignment lifecycle a
  far end (pij task close) after measurement showed the brief understated the bug:
  nothing could close an assignment at all, 91 of 91 open, zero ever closed, hidden
  because report state done silences the detector without discharging the record.
  s076 stopped the watchdog nudging seats that correctly declared a parked state, a
  defect filed while being its victim. Both PRs green and mutation-proven, both
  gated on a per-PR human merge ruling established earlier the same day.
entries:
  - id: INS-001
    kind: insight
    description: >-
      A silence that reads as resolution, FOURTH instance in one day, at the ledger
      layer. report state done silences axis-disagreement without closing the
      assignment: isSemanticActive() is "state undefined or ready", so done and
      waiting quiet the detector identically. 91/91 assignments open, zero ever
      closed, unnoticed because the symptom was suppressed for an unrelated reason.
    target: project-sensor
    suggested_encoding: >-
      When a detector goes quiet, distinguish MASKED from DISCHARGED. A detector
      that cannot tell them apart reports a permanently-open ledger as healthy.
    fp: "s075masking01"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-30T07:21:10.585Z"
  - id: INS-002
    kind: insight
    description: >-
      An attribution override must never select an authority set. pij task close
      gates on selfId, never --actor: --actor relabels who is RECORDED, and if it
      also chose which reasons were permitted, any caller could grant itself the
      assignee's authority by passing --actor <assignee>. Self-service, and it
      would look correct in review because both readings are reasonable.
    target: project-sensor
    suggested_encoding: >-
      CLASS not instance (o-prime asked for graduation): a flag that alters
      ATTRIBUTION must never be an input to AUTHORISATION. Audit every
      --actor/--as/--on-behalf-of override for the same coupling.
    fp: "s075attrib01"
    disposition: encoded
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-30T07:34:20.284Z"
  - id: DL-001
    kind: difficulty
    description: >-
      My first mutation proof exercised neither the code under test nor the surface
      under assertion, and PASSED, which I nearly recorded as evidence. I mutated
      the card projection in the node-show handler while the test reads list --json
      — two projections whose source looks identical.
    target: tooling
    severity: degrading
    workaround: "Traced the enclosing case, re-mutated the real list projection; both mutations then killed the test"
    suggested_encoding: >-
      A surviving mutation is either a MISSING TEST or a MIS-AIMED MUTATION and the
      result alone cannot distinguish them. Prove the mutated line EXECUTES on the
      tested path first. Duplicated projection logic is the enabling condition —
      routed by the o-prime to the backlog as a missing single-source invariant.
    fp: "s075mutaim01"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-30T07:43:05.503Z"
  - id: DL-002
    kind: difficulty
    description: >-
      The watchdog nudged me five times AFTER I declared state=question, because
      eligible() never reads semanticState at all. Both anomaly detectors exempt
      parked states; the only mechanism that pushes a turn into a human-visible
      pane did not. No correct action existed — watchdog pause asserts "stop
      nudging me", a weaker claim than "I am blocked on a human".
    target: project-sensor
    severity: degrading
    workaround: "pij watchdog exempt, re-applied hourly as it lapsed"
    suggested_encoding: >-
      Fixed in s076 (PR #63) at the FIRE SEAM, not eligible(): muting is not
      unwatching and a parked seat can still die. The incentive damage was the
      mission — a seat punished for declaring learns to stay silent, destroying the
      axis the declaration exists to populate.
    fp: "s076parked01"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-30T08:56:06.538Z"
  - id: INS-003
    kind: insight
    description: >-
      Anomaly reachability depends on an INCIDENTAL PAYLOAD FIELD, not a routing
      decision. anomaly-sweep.ts:76 falls back to the assignment's project primeId
      only when anomaly.assignmentId is defined. axis-disagreement carries one;
      status-stale does not. So for a parentless prime the two kinds have OPPOSITE
      deliverability — status-stale drops, axis-disagreement reaches the project
      prime, which for a seat that IS that prime is itself.
    target: project-sensor
    suggested_encoding: >-
      Make routing explicit per anomaly kind rather than emergent from payload
      shape, and name SELF-DELIVERY as its own outcome — it is neither delivered to
      a supervisor nor dropped, and the drop counter cannot see it. Reported by
      mastodon, verified at source by me.
    fp: "sweeproute01"
    disposition: task
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-30T11:08:28.902Z"
  - id: INS-004
    kind: insight
    description: >-
      An alarm whose prescribed remedy mechanically satisfies its own detection
      condition certifies only that the seat SPOKE. axis-disagreement measures
      idleness from lastEventAt; posting a card updates lastEventAt; so "declare a
      state" clears the flag with zero work. Mastodon measured it on itself: 4h of
      twelve commits and five peer sends read as idle, then one card cleared it.
    target: project-sensor
    suggested_encoding: >-
      Generalises with guan's pixel gate — that proves PAINTED never READABLE, this
      proves EMITTED never WORKED. The load-bearing consequence is on the REPORTING
      side: mastodon nudged eight seats whose flags cleared BY ANSWERING and
      reported them resolved with more confidence than the instrument supports.
      Judge from axes a message cannot move.
    fp: "sweepselfclr1"
    disposition: task
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-30T11:08:28.922Z"
  - id: WIN-001
    kind: win
    description: >-
      Verifying the brief against source before planning changed the mission. The
      s075 brief said the assignee could clear an obligation; measurement showed
      nobody could, and closeAssignment had been dead code since plan 054. The
      o-prime endorsed the rescope rather than defending the brief.
    target: plan
    suggested_encoding: "A brief is a claim like any other. Measure its premise before planning against it."
    fp: "s075rescope01"
    disposition: kept
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-30T07:20:00.000Z"
  - id: MW-001
    kind: magic-wand
    description: >-
      I wish a cross-cutting policy question had one predicate reaching every call
      site. Three mechanisms answer "should this seat be left alone" and only two
      agreed — the same drift shape as s074's "who owes a card", where four sites
      disagreed. Two instances in one day suggests the pattern is the fix.
    target: project-sensor
    suggested_encoding: >-
      One predicate per cross-cutting policy question, honoured at every call site,
      with a test that fails when a new call site forgets it.
    fp: "policydrift01"
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-30T08:56:06.538Z"
---

# Retro — s075 lifecycle close, s076 parked states

## What shipped

| PR | stream | state |
|---|---|---|
| #62 | s075 — `pij task close` + ratified denorm clearing | green, mergeable, awaiting per-PR human go |
| #63 | s076 — watchdog parked-state muting | green, mergeable, awaiting per-PR human go |

## The through-line for the whole day

Every defect found was **something unexamined being read as something proven**, at
six altitudes:

| altitude | unexamined signal | read as |
|---|---|---|
| code | a comment nobody executed | a description of the code |
| inference | a human's "should" nobody measured | current fact |
| governance | a precedent nobody contested | granted authority |
| ledger | a detector silenced for another reason | an obligation discharged |
| proof | a mutation aimed at the wrong file | a test that holds |
| instrument | a flag cleared by answering the nudge | work completed |

The last two are the sharpest: both are *verification* machinery producing the
failure it exists to prevent.

## Two distinctions that carried across streams

- **s075** — masking is not discharging. A declared state and a closed obligation
  are different facts; conflating them left 91 obligations permanently open while
  the board read healthy.
- **s076** — muting is not unwatching. Suppressing a nudge is not suspending
  supervision; the guard in `eligible()` would have switched off the dead-seat axis
  for parked seats.

Same shape one system apart. Noticing the first is what made the second obvious in
minutes rather than after a later incident.

## Process note

The per-PR merge ruling (D-039, established earlier the same day) held under
pressure: two green PRs sat gated for hours rather than being merged on inferred
authority. That is the ruling working. The cost is visible; the alternative is the
failure that produced it.
