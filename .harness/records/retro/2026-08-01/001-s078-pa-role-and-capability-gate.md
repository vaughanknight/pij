---
record_kind: "retro"
harness_version: "0.12.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-08-01T08:55:00.000Z"
agent: "pij-unwilling-butterfly"
plan_id: "s078-pa-role"
schema_version: "1.2"
retro_id: "2026-08-01T08:55:00Z-pij-unwilling-butterfly-52f7"
started_at: "2026-07-31T00:00:00Z"
ended_at: "2026-08-01T08:55:00Z"
summary: >-
  PM seat for s078 (PA role + capability gate). Shipped #68 (fa3bdc1) and opened
  #69. The stream's own defects were more instructive than its features: I
  widened a TYPE and read it as a widened VOCABULARY, so `pa` was a legal type
  and an illegal argument for the whole life of the PR — with the o-prime's
  diagnosis on the table being "the producer has not merged yet", an untested
  causal story that would have shipped green with the user-visible chip still
  dark. Then I committed, hours later, the exact reader-fabricates-absence error
  whose doctrine had been written and pushed that same morning. The governing
  finding is the LIMIT of the technique the day was built on: an exhaustive
  classification test proves every item has a verdict and is structurally blind
  to a defect living in the RELATIONSHIP between items — four separate PA
  capability gaps were found by live PAs in their first hours, none visible to a
  test that passed and was right to pass. Four governments' seats found defects
  in what I shipped faster than my own gates did.
entries:
  - id: DL-001
    kind: difficulty
    description: >-
      `pa` was added to StoredOrchestrationRole and two compiled exactness
      invariants proved the union widened — while BOTH producer parsers guarded
      with `role !== "pm" && role !== "worker"`, a comparison against `string`
      that the compiler cannot relate to the union. Widening the type produced
      ZERO compile errors at the exact two places deciding whether the value may
      ever be typed. `pij link --role pa` returned E-ARG for the PR's whole life,
      through a green suite and an approved review.
    target: tooling
    severity: degrading
    workaround: "None available — the failing command was the only signal, and it was reported by a peer, not by any gate."
    suggested_encoding: >-
      Encoded: the vocabulary is now DATA (STORED_ORCHESTRATION_ROLES) with the
      type DERIVED from it, one runtime guard consumed by both parsers, one
      choices string in every usage and error. Tests ITERATE the vocabulary
      rather than naming members, so a member a parser refuses fails WITH THE
      PARSER NAMED. General rule: a compiled invariant proving a type is exact
      proves nothing about a parser comparing literals against it.
    disposition: kept

  - id: DL-002
    kind: difficulty
    description: >-
      Measuring parentless seats I counted `d.parent == null` over `pij list
      --json` and got 122 of 122 — an alarming, fabricated answer. `list` does
      not project `parent` at all; my reader turned a MISSING KEY into a NULL
      VALUE. The doctrine naming this exact class had been written, committed and
      pushed by the o-prime that same morning; writing it down did not prevent
      the third instance of it (cheetah, the o-prime, me).
    target: tooling
    severity: degrading
    workaround: "Re-measured against node show, which projects lineage. Caught only because the number was implausible — nothing in the output corrected it."
    suggested_encoding: >-
      Encoded at the PRODUCER instead of asking three governments to remember jq
      semantics: list rows now project `parent`, using effectiveParent under the
      SAME key name node show uses. A raw parentId would have disagreed with node
      show for spawned-but-never-linked seats — buying the class back inside the
      fix. The row had been publishing the VERDICT (`unadopted`) while
      withholding the EVIDENCE it derives from.
    disposition: kept

  - id: DL-003
    kind: insight
    description: >-
      The PA gate refuses the whole `watchdog` family to `pa`; `watchdog watch`
      only ever registers the caller. So a PA cannot subscribe itself and its
      prime cannot subscribe it — the deterministic push hook the PA concept
      names as its trigger is unreachable from inside the role. The day's own
      D-040 fix, an exhaustive table test asserting every verb is explicitly
      classified, PASSED here and was RIGHT to: `watchdog` is classified,
      correctly, as refused. Neither half is wrong alone.
    target: plan
    suggested_encoding: >-
      Completeness over ITEMS is blind to defects in the RELATIONSHIPS between
      items. "Every verb has a verdict" and "the role can still do the job it
      exists for" are different claims and only the first is mechanically
      checkable by the technique we leaned on all day. A capability boundary
      needs a test that the role's PURPOSE remains reachable. Ledgered as D-042.
    disposition: kept

  - id: DL-004
    kind: difficulty
    description: >-
      I shipped `ack-dispatch: refuse("acknowledging a brief is the assignee's
      own act")` — writing the FIRST-PERSON ARGUMENT into the refusal that
      VIOLATES it. When the PA IS the assignee that sentence argues to ALLOW.
      Consequence: a brief dispatched to a PA can never be acked, goes
      delivered-unacked-stale, and the PA then reports its own brief as an
      anomaly forever. Every PA in the fleet hits it.
    target: plan
    severity: degrading
    workaround: "None; found by a peer government's PA in its first hours."
    suggested_encoding: >-
      A sound rule applied to a MIS-ASSUMED SUBJECT — I pictured a PA acking
      someone ELSE'S brief and never pictured a brief addressed to the PA. A
      refusal should be forced to state which SUBJECT it assumes. Fix shape found
      in our own codebase: authority is per-TARGET, not per-VERB, and
      resolveRelayTarget already does it (report-now ALLOW outright, report-now
      --for gated on caller-is-pa AND target-is-own-prime). Allow the verb, gate
      the target.
    disposition: kept

  - id: DL-005
    kind: difficulty
    description: >-
      `pij bg` reported "FAILED (exit 1) — CI: PR#69". CI had not failed; I had
      pushed a commit mid-watch, superseding the run the watcher followed. For a
      WATCHER the exit code describes the INSTRUMENT, not the thing observed, so
      a watcher losing its subject and a build genuinely breaking produce an
      identical red line in identical words.
    target: tooling
    severity: annoying
    workaround: "Measured the PR head directly instead of believing the notification; restarted the watcher."
    suggested_encoding: >-
      Distinguish "the watched thing failed" from "the watcher lost its subject"
      — the string 'no checks reported' is already a reliable discriminator for
      the gh case. Weaker fallback: stop rendering a watcher's own exit code with
      the word FAILED. Same family as the voided nudge clock and DL-002: the
      instrument's state read as the subject's state.
    disposition: kept

  - id: DL-006
    kind: difficulty
    description: >-
      I deliberately held a ledger commit local and unpushed pending a ruling on
      whether docs go direct to main. Another seat operating in the SAME
      canonical checkout pushed it and built three commits on top. "Local and
      unpushed" is not a holding state when the working copy is shared — it is
      "staged for whoever runs git push next".
    target: project-sensor
    severity: annoying
    workaround: "Noticed only because main's log had moved under me when I went to add the next entry."
    suggested_encoding: >-
      Either seats get their own worktree for main-targeted doc work, or holding
      a decision must use a branch rather than an unpushed commit. A deliberate
      hold that another actor can silently discharge is not a hold.
    disposition: kept

  - id: DL-007
    kind: win
    description: >-
      Cheetah asked for a corrected help string describing THEIR render. I did
      not write their correct sentence in: a help string in pij describing
      chainglass's UI is untestable BY CONSTRUCTION, so nothing can notice it
      decayed and today's truth only re-arms the drift on a slower clock. Pulled
      the claim back to pij's own boundary instead. Mastodon independently made
      the same move an hour earlier on a decayed ssh host (env var, not the new
      address).
    target: skill
    suggested_encoding: >-
      Replacing a decayed literal with a fresher literal is not a repair. When a
      claim crosses a boundary you cannot execute, retreat the claim to where you
      can test it rather than refreshing it.
    disposition: kept

  - id: DL-008
    kind: magic-wand
    description: >-
      I would wish for a gate that asks whether a change is REACHABLE, not just
      whether it is correct. Every defect I shipped this stream passed
      typecheck, lint, the full suite and CI, and every one was found by a person
      or a peer TRYING TO USE THE THING: `--role pa` refused by a parser, a PA
      unable to subscribe its own trigger, a PA unable to ack its own brief, a
      flag no help text mentioned. My gates prove the code is internally
      consistent. Not one of them attempts the user's first move. The cheapest
      version is not exotic — for any new value, flag or role, execute the
      command a human would actually type, once, and assert it does not error.
    target: tooling
    suggested_encoding: >-
      A reachability smoke: for each newly-added vocabulary member or flag, run
      the canonical invocation end-to-end. Four of this stream's defects would
      have failed such a check within seconds, and all four were instead found by
      peers after merge or after review.
    disposition: kept
---

# Retro — s078 PA role, capability gate, and the limits of classification

**Merged:** `fa3bdc1` (#68 — `pa` role value, two-seam capability gate,
exhaustive verb-classification test, `whoami` legibility, `writtenBy` relay).
**Open:** #69 — lineage-at-spawn, `list` projects `parent`, boundary-retreat on a
cross-repo help claim, `link --role` documented with a scrape test.

## The one finding worth carrying forward

The day was built on a technique that worked spectacularly once and then defined
its own limit. The exhaustive verb-classification test **caught nine verbs I had
not enumerated** — genuinely load-bearing, and it survives me not being here.

It was then structurally blind to **four** real capability defects, because each
lived in a *relationship* rather than an *item*: `watchdog` is correctly
classified as refused, and that correct verdict is what kills the PA's own
trigger. Every half was right. The composition was silent.

**Completeness over items cannot see a composition gap.** That is not a flaw in
the test; it is the boundary of what "total" means when applied to a table.

## What actually found the defects

Not my gates. In order: a human asking why his PA had no label; four peer
governments' PAs in their first hours of existing; a peer reading my help text.
Everything I shipped passed CI.

The magic wand above is the honest response — **a gate that attempts the user's
first move**, once, for every new value or flag. Four of this stream's defects
die instantly to that, and none of them died to anything I had.
