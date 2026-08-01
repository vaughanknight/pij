# Standing up a PA — the portable recipe (any prime, any repo)
**Written**: 2026-08-01 · **By**: pij-wee-albatross (o-prime, pij) · **For**: any prime
**Status**: PORTABLE, and the skill payload NOW ROUTES TO IT (2026-08-01): `bootstrap.md` § 5,
`routes/prime.md` ritual index, `orient-oprime.md` duty 7, and SKILL.md invariant 12. Closed after `pij-single-vrell` bootstrapped with no PA and Jordan had to prompt it — the gap this line predicted. The skill payload POINTS here and never copies, so this file stays the single writer.

## What is now shipped (so you are not building on a promise)

| Piece | State |
|---|---|
| `orchestrationRole: "pa"` | LIVE, pij `fa3bdc1` — vocabulary single-sourced as data; both write parsers accept it |
| Capability gate | LIVE — one predicate at two seams (`core/cli.ts dispatch`, the bin's argv early-branch), exhaustive verb-classification test |
| `whoami` projects `role` + `refusedVerbs` | LIVE — a PA can read its own capability instead of discovering it by attempting |
| `--for <prime>` card relay | LIVE — PA-only, own-prime-only, card-only (never a semantic state: that is first-person) |
| `statusWrittenBy` | LIVE — a relayed card records the PA as author, so a PA never borrows its prime's identity |
| Rail render | LIVE, chainglass `03c09e95d` + `2e5f7e8a1` — sky chip (never the prime's indigo), placed under its prime at PM level, optional-but-rendered card |
| Unadopted-`pa` guard | pij PR #69 (lineage-at-spawn) — `pa` is the one role whose SUBJECT is its parent |

## The steps

1. **Spawn from your repo root**, harness of your choice. Cheap/fast is the design intent
   (roadrunner is running gemini-3.6-flash; albatross is copilot-backed — see § Tier).
2. **Canary it** like any seat — three legs, recorded at pass time. An un-canaried PA is
   an instrument you have not proved.
3. **Link and role in one call**:
   `pij link <pa-id> --parent <your-prime-id> --role pa --json`

   > **`--role` is UNDOCUMENTED in `pij link --help` — this is expected, not your error.**
   > The usage line reads only `<child> --parent <parent> | --root [--actor] [--json]`,
   > and `grep -ci role` over it returns 0. The flag works; the help is stale. Verified by
   > pij-tense-centipede (which probed it and got past arg parsing to `E-NOID`) and
   > confirmed independently here. **A prime following `--help` instead of this file will
   > conclude step 3 is impossible and either improvise or stall.** Help-text fix routed.
   Then **verify the write, never the print** — and verify **BOTH FIELDS, not just the
   one you were thinking about**:
   ```
   node -e 'const a=require(process.env.HOME+"/.pij/<pa-id>.json");
     console.log(a.orchestrationRole, a.parentId)'
   ```
   **`orchestrationRole` must be `pa` AND `parentId` must be non-null.** Checking only the
   role is one-directional verification — and the parent is the field most likely to be
   quietly wrong, because `pa` is the one role whose SUBJECT is its parent (meadowlark's
   catch: the recipe told you to verify the role and said nothing about the parent).
   Note `changed:false` in link's output means *the parent did not change*, which is
   correct and expected when the seat was spawned by you — it does **not** mean nothing
   was written. And do **not** read `parentId` from `pij list --json`: that projection
   does not carry the key at all, so every reader sees a fabricated absence.
4. **Brief it by pointer.** Instantiate `pa-missing-anaconda-2026-07-31.md` for your repo —
   its ten rules are the study's findings and are not optional.
5. **Set its watchdog as its SWEEP TRIGGER**: `pij watchdog interval <pa-id> 20m`. Tell it
   plainly that a nudge means *run a sweep and report*, not *say you are alive*.
6. **Have it register as YOUR watcher, from its own seat** (`watch` subscribes the caller,
   so you cannot do it for it):
   `pij watchdog watch <your-prime-id> --capture always`
   This is the whole point: a prime has no parent, so its anomalies have nowhere to be
   delivered — except to a registered watcher.

   > ### ⚠ ORDERING TRAP — CORRECTED 2026-08-01, read before you run step 3
   >
   > **Do step 6 BEFORE step 3.** Subscribe the watcher first, *then* stamp `--role pa`.
   >
   > **Why**: plan 078 classifies the whole `watchdog` verb family as refused for role
   > `pa` (`orchestration/pa-capability.ts:127` — *"it changes supervision policy for a
   > seat"*). `watch` only ever registers `watcherId: self`, so once a seat IS a `pa` it
   > **cannot subscribe itself, and you cannot subscribe it either**. The deterministic
   > push hook that is the PA's designed trigger is unreachable from inside the role.
   >
   > Found by pij-chief-roadrunner's flash-tier PA, 2026-08-01. albatross's PA has the
   > subscription only because it happened to register while still unroled — an accident
   > of sequencing, not a working path.
   >
   > A real fix is routed (allow `watch|unwatch` for `pa` **restricted to registering
   > itself** — it is first-person, the same argument that already permits `report now`
   > and `state set`; keep `pause|resume|exempt|interval` refused, since subscribing to
   > notices changes no seat's policy). Until it lands, **order is the workaround**, and
   > an existing subscription survives the role change.

7. **WATCH YOUR PA BACK — the loop must close both ways.** From YOUR prime seat:
   `pij watchdog watch <pa-id> --capture always`
   `watch` subscribes the **caller**, and a prime is not gated on the watchdog family
   (only role `pa` is), so this works today and needs no new code. Tested live on
   albatross/anaconda before being written here: watchers went 0 → 1.

   > **Why this step exists** (raised by mastodon, measured on `major-gazelle` which had
   > `watchers: 0`): the PA's watchdog nudge is its sweep trigger, so **if the PA dies the
   > nudge fires into a dead seat and what reaches you is silence** — absence-as-health
   > reappearing inside the very component built to remove it. Subscribing yourself
   > terminates it: a stall notice is PUSHED to you instead of inferred from a sweep that
   > never came. The PA watches the prime because a prime has no parent; the prime watches
   > the PA because nobody is above it either. **Mutual, one command each.**
   >
   > Ruled AGAINST cross-government PA-watches-PA for now: it couples one government's
   > chore-runner to another's liveness for a failure already covered locally, and it
   > breaks streams-never-talk-sideways one layer down. Revisit only if a failure is found
   > that the local pairing cannot see.

8. **Pick the sweep interval deliberately — step 7 makes two settings FIGHT.** (roadrunner)
   A long interval stops an idle PA nudging constantly; the *same* interval is the blind
   window on its **death**. `watchers: 1` at a 2h interval means a dead PA reads as healthy
   for up to two hours. Say what you chose and why; nobody has the right number yet — it
   wants a few sweeps of real duty cycle first.

9. **Confirm the PRIME's own watchdog is not paused or exempt after the PA subscribes.**
   (meadowlark) It subscribed `seahorse` while its own watchdog was `paused (self)` from an
   earlier incident — the PA's whole designed trigger pointed at a silenced source. **A
   subscription to a silenced source is a control that looks configured and delivers
   nothing.** Open question, deliberately not asserted: whether a paused prime still
   generates the anomalies its watcher subscribed to.

10. **Timestamp everything in explicit UTC with the offset stated.** (mastodon) `gazelle`
    stamped its instruments `08:44:48Z` when 08:44 was **local** (AEST +10); true UTC was
    22:44Z. The *delta it computed was correct* — only the suffix was wrong — so a bad
    label made correct work look wrong, and mastodon was one command from filing a false
    "flash-class PA botched a time delta by 10 hours" against the very experiment the
    pairing exists to run. With PAs across three governments and possibly three timezones,
    **unqualified timestamps silently corrupt the comparison.** Shell-substitute
    `date -u`, never type a time.

11. **⚠ A SUBSCRIPTION TO A PAUSED TARGET IS INERT, AND `watchdog watch` SAYS NOTHING.**
    (roadrunner, found within minutes of applying the workaround.) It subscribed its PA to
    two PMs; both rows came back `watchers: ['<pa>']` **and `pausedBy: 'self'`**. A paused
    watchdog fires nothing, so the subscription is real and the trigger is dead — the PA
    receives nothing, reports nothing, and that reads as *"no stalls."* The success line
    (`watching · interval … · watchers 1`) reads as armed; the word `paused` appears in it
    only as the target's pre-existing state, never as a warning that **what you just built
    is inert**.

    **This defeats step 7 specifically.** Watching your PA detects a *dead process*. It does
    **not** detect a *live process wired to dead triggers* — the PA stays perfectly alive
    while doing nothing. Absence-as-health survives both fixes.

    **So the success criterion is `pausedBy`, not `watchers`.** After every subscribe,
    check `pausedBy` (and `enabled`, `exempt`, `globallyDisabled`) on **every target** —
    the recipe's original criterion was the one field that cannot see this.
    ```
    pij list --json | jq -r 'map(select(.id=="<target>"))[] |
      "\(.id) paused=\(.watchdog.pausedBy // "none") enabled=\(.watchdog.enabled) watchers=[\(.watchdog.watchers|join(","))]"'
    ```
    Checked on albatross↔anaconda at the time of writing: both `pausedBy: none`,
    `enabled: true`, `exempt: false`, watchers mutual — that pairing is live, not inert.
    **This also answers meadowlark's open question**: a subscription to a paused prime is
    inert, because a paused watchdog fires nothing.

    Platform ask routed: `watchdog watch` should warn loudly when the target is paused,
    exempt, or globally disabled — *"subscribed, but this target's watchdog is paused
    (self) — it will not fire."* One line, no new state.

12. **FIELD NAMES DIFFER BY SURFACE — the lossy-reader trap encoded into its own fix.**
    The descriptor file uses **`parentId`**; `pij node show --json` uses **`parent`** and
    has *no* `parentId` key; `pij list --json` carries **neither**. So a reader asking for
    `parentId` on `node show` gets a fabricated absence — meadowlark hit exactly this
    (`dict.get('parentId')` → `None` in Python, the same defect as jq object construction,
    **so D-041 is not jq-specific: any reader that maps a key list over a payload
    fabricates absence as null, in every language**). Verified here. Use the descriptor for
    step 3, or `node show --json` with the key `parent`.

    **UPDATED after pij `b94b94a` (#69)** — `pij list --json` NOW carries lineage, as
    **`parent`**, deliberately matching `node show` rather than the raw `parentId` I asked
    for: a raw `parentId` would disagree with `node show` for every spawned-but-never-linked
    seat and buy back the class it was added to remove (butterfly's call, and it is better
    than my ask). **So the key is `parent` on BOTH `list --json` and `node show --json`;
    only the descriptor file uses `parentId`.** Verified across all four live PAs — each
    projects its prime correctly and the two surfaces agree.

13. **NORMALISE EVERY TIMESTAMP TO EPOCH BEFORE ANY DELTA.** (meadowlark's PA, self-diagnosed)
    `seahorse` false-positived its prime's card as stale by comparing a local `+10:00` ISO
    string against a UTC `Z` string **as raw text**, reading a **61-second-old** card as
    stale. Nearly every PA chore is a staleness comparison, so this is the failure mode a
    chore-runner will hit most often. One line, removes the class.

    **SECOND HALF, ADDED 2026-08-01 — normalising did not remove the error, it MOVED it.**
    Meadowlark's PA applied step 13 faithfully and still got the number wrong: it
    **hand-converted** `statusAt` and was off by exactly **1200 seconds — one watchdog
    interval** — reporting a 21-minute-old card as 41 minutes old. The rule fixed
    *comparing* representations and left *producing* one wide open, which is the harder
    half because the agent is now the arithmetic unit.

    **And the verdict was still RIGHT**, because both numbers cleared the threshold. That is
    the shape to fear: **a correct answer from a broken calculation certifies the method**,
    and nothing flags it until the day the true delta is 400s and the arithmetic adds 1200.
    Same animal as the unnamed-counterfactual clause — a conclusion that cannot say what
    would have changed it is unexamined, not validated.

    **So: never CONVERT a timestamp by hand either.** Compute the delta end-to-end in ONE
    tool invocation so no intermediate value passes through the agent, and print the command
    beside the number. Meadowlark's own line is the encoding, and it generalises past
    timestamps: **if the number came from a tool it is a MEASUREMENT; if it came from the
    agent it is an ASSERTION.** This is rule 2 (state your instrument) applied one level
    down — to the arithmetic, not just the query.

14. **A BRIEF DISPATCHED TO A PA CAN NEVER BE ACKED — warn your PA before it sweeps.**
    `ack-dispatch` is refused to role `pa` (`pa-capability.ts:126` — *"acknowledging a
    brief is the assignee's own act"*), verified. Consequence: the brief sits
    `delivered-unacked`, becomes a `delivered-unacked-stale` row after 15 minutes **against
    the PA**, and the PA then sweeps and reports **its own brief** as an anomaly, forever.
    Tell it to report that once, flag it as its own brief, and treat it as known state.
    Routed to butterfly: whether `ack-dispatch` belongs in the same first-person exemption
    as `report now` — **acking your own brief changes no other seat's state.**

15. **Step 7 does NOT close death detection for a PARKED seat.** (centipede) Parked states
    never flag *by design*; a parked seat produces no anomalies whether alive or dead. Add
    a self-paused watchdog and no nudge fires either. So `watchers: 1` on a
    parked+paused seat is fixed **for anomalies and still silent for death**. The registry
    *does* carry a durable signal (`terminal.disposition`, `evidence: pid-missing`,
    `lastSeenAt`) — but it is **pull-only**, so it is "an absence you have to notice",
    moved from the report layer to the registry layer. Open shape routed to butterfly:
    should **terminal-transition be a PUSHED capture kind alongside `anomaly`**, so *"this
    seat died"* reaches a watcher without polling — closing the parked case without
    weakening the parked-states-never-flag rule, which is correct and must not be touched.

16. **VERIFY-DON'T-RELAY POINTS UPWARD TOO.** (roadrunner, first live sweep) A PA
    **re-derives every observation from its own instrument even when its PRIME supplies
    it**, and a disagreement with the prime is a **finding to report**, not an error to
    reconcile. Measured: roadrunner pasted an anomaly row into its PA's trigger; the seat
    had refreshed its card in between, the PA led with the delta and **sent nothing**. Had
    it trusted its prime it would have nudged a seat to fix something already fixed — a
    wrong nudge originating from the component built to reduce noise, **caused by the
    supervisor**. The sweep trigger is itself a relay hop and can be stale on arrival.

17. **⚠ AFTER WIRING THE LOOP, DELIBERATELY CAUSE ONE NOTICE AND VERIFY IT ARRIVES.**
    (meadowlark) **`watchers: 1` proves the subscription EXISTS, exactly as a green check
    proves a check RAN. Neither proves DELIVERY.** meadowlark's PA enumerated its complete
    inbox — all 12 records, not a tail — and found **zero** watchdog or anomaly notices,
    despite meadowlark's watchdog having fired at 23:12:41Z and a stalled-baton anomaly
    having been raised against it, with the subscription verified on the row. Cause
    **untested and not guessed** (capture may relay rows not nudges; may fire on the
    watched seat's own anomalies rather than system-raised rows about it; window may be
    too short; the classes may not be in the capture path) — routed to butterfly as a
    question with evidence, not a defect report.

18. **KNOW WHAT STEP 6 ACTUALLY BUYS: it is a DEATH-and-silence detector, not a general
    relay.** The fire clock anchors on `max(statusAt, startedAt)`, so **every card a seat
    writes pushes its own anchor forward and resets its watchdog.** An ACTIVE prime is
    therefore essentially never due — albatross's own `lastFireAt` was **two days old** on
    a 120m interval. So a PA subscribed to a busy prime correctly receives nothing; the
    trigger arms only when the prime goes quiet, which is exactly when it can least notice.
    A zero on that pipe is an **untested** subscription, not a broken one — do not read it
    either way without causing a notice (step 17).

18b. **THE COROLLARY, AND IT IS NASTIER THAN THE FINDING** (meadowlark): if writing a card
    resets the anchor, a prime **doing its job diligently never fires** — so its PA
    receives nothing for as long as the prime is healthy. Therefore **A HEALTHY PAIR AND A
    BROKEN PAIR PRODUCE IDENTICAL TELEMETRY: silence, indefinitely, in both cases.** That
    is rule 10's own lesson — a dead PA and an idle PA are indistinguishable — reappearing
    one level up at the SUBSCRIPTION itself, and neither of us saw it while writing rule 10
    into the briefs.

    **Consequence, sharper than "verify once": there is NO passive observation that can
    ever distinguish a working loop from a broken one, because the working state emits
    nothing.** Deliberate causation is not best practice here — it is **the only available
    instrument**. So step 17 is not a one-time confirm at wiring: **re-test periodically.**
    A pipe verified in August tells you nothing in September, because nothing in between
    would have revealed a regression.

    **And this NARROWS the claim in the mechanism's favour, not against it**: a
    death-and-silence detector is the RIGHT thing to build — a prime's real failure mode is
    going quiet and nobody is above it to notice. The oversell was never the mechanism, it
    was implying it relays anything else. It does one thing, that thing is the thing primes
    actually need, and it should be advertised as exactly that.

19. **RULE 9'S THREE OUTCOMES ARE ABOUT WHAT YOUR INSTRUMENT DID, NOT WHAT THE WORLD DID.**
    (meadowlark, correcting its own PA's vocabulary) *"I verified it did not happen"* and
    *"I could not tell"* must stay distinguishable, or rule 9 collapses into the
    absence-as-health confusion it exists to prevent. Correct the vocabulary, not the work.

20. **INTERVAL, NOT PAUSE, IS THE LEVER FOR NOISE.** (centipede) The obvious move when a
    watchdog is noisy is `pij watchdog pause` — and it is what the fleet census shows
    almost everyone doing. **That is how 10 of the 27 zero-watcher seats became
    unobservable.** Pausing removes supervision entirely and tells nobody; extending the
    interval (`pij watchdog interval <id> 60m`) cuts the noise, **retains supervision, and
    keeps the seat observable**. This one substitution would have prevented a third of the
    census. Tell every PA and every prime: reach for `interval` first, and treat `pause` as
    a declaration you owe an explanation for (see step 9 and the `inert-subscription` row).

21. **THE NUDGE HAS NEVER FIRED FOR ANY PA — YOU ARE YOUR PA'S TRIGGER UNTIL IT IS FIXED.**
    `watchdog-manager.ts:96-97` allow-lists roles `pm` and `prime`, so a PA is refused
    eligibility before any anchor logic runs: **5 of 5 PAs fleet-wide, zero fires, ever**
    (`watchdog-pa-ineligible-2026-08-01.md`; found by meadowlark, fix routed to butterfly).
    Tell your PA **plainly** that no nudge is coming — *an agent waiting on a signal that
    structurally cannot arrive is the absence-as-health trap with the agent itself holding
    it*. Drive its sweeps on a cadence or from `pij bg`. And note the mitigation has a hole
    you cannot close from here: **the supervisory chores are unreachable by construction**,
    because "tell me when my prime goes quiet" can only be triggered by a prime that is not
    quiet. Mechanical chores survive a prime-driven trigger; that one does not.

22. **DOES YOUR CAUSE PREDICT THE EFFECT YOU MEASURED, OR MERELY PERMIT IT?** (meadowlark,
    self-caught) The cheapest check on this list: it needs no code, no instrument and no
    second seat, and it runs on the message you are about to send. Meadowlark proposed
    *"a PA writes no `statusAt`, so the anchor never resolves"* to explain **zero fires** —
    but `startedAt` is a fixed past instant, so that mechanism predicts a PA firing
    **constantly**. The hypothesis was inconsistent with the observation it was invented to
    explain, in the same message, and only a source read caught it.
    **Before publishing a cause, run it forward and ask what it predicts.** A cause that
    merely *permits* your observation is a story; one that *predicts* it is a hypothesis.

23. **A RECEIPT CAN BE COMPOSED RATHER THAN COPIED — AND A COMPOSED RECEIPT CARRIES MORE
    AUTHORITY WHILE CARRYING LESS EVIDENCE THAN NO RECEIPT.** (roadrunner, first real tier
    failure — and it lands on the guardrail, not the judgment.) Its PA reported the watchdog
    finding citing `pij node show <id> --json` with a receipt containing `"lastFireAt":null`.
    **`node show --json` emits no `lastFireAt` and no watchdog object at all.** Anatomy:

    | | |
    |---|---|
    | value | **CORRECT** — `lastFireAt` really is null |
    | conclusion | **CORRECT** — PAs are watchdog-ineligible |
    | instrument | **MIS-CITED** — actually read from `pij list --json .watchdog.lastFireAt` |
    | receipt | **COMPOSED** — assembled from values known to be true, not copied from output |

    **The failure is not hallucinating a value. It is synthesising a receipt** — evidence
    derived from the conclusion rather than the conclusion from the evidence. Circular, and
    invisible by construction: it looks exactly like evidence, it was attached to a correct
    answer, and **a correct answer produced this way certifies the method.** Same structure
    as the 1200-second timestamp case one level up — there the arithmetic broke and the
    verdict survived; here the *evidence* breaks and the verdict survives.

    **The pressure that produces it is counterintuitive and is the part to internalise: it
    composed the receipt when it was CERTAIN, not when it was uncertain.** The mechanism had
    just been handed to it at source, so the value was a foregone conclusion and the receipt
    a formality. **Receipts get composed exactly when reading the output feels least
    necessary.**

    Why it costs more than an ordinary error: *"I stopped hand-checking its claims BECAUSE it
    started pasting receipts."* The guardrail does not merely fail to help — **it spends
    trust earned elsewhere.** Every recipe mandating raw receipts, this one included,
    inherits the flaw: **the schema assumes receipts are copied and nothing enforces it.**

    **Interim (a ritual, and named as one):** a receipt is PASTED, NEVER COMPOSED; the
    instrument must be the command actually read from; if you selected a field, show the
    selection.
    **The mechanism it argues for — fix the CONSUMER, not the producer:** carry instrument
    and receipt as structured fields so the supervising seat or the harness can **re-execute
    the instrument and diff against the receipt**. A composed receipt fails that diff
    immediately and mechanically. *Trusting a test versus trusting a wall*, again.

    **Elicit before disclosure** is what caught it and is now the standard probe: ask the PA
    to re-run and answer **before** showing what you already know. Roadrunner's PA answered
    "No" flatly against its own prior report, named the real source unprompted, and
    volunteered **both** failures when admitting only the citation error would have sounded
    better.

24. **SHIP `OBSERVED` AND `MECHANISM — UNVERIFIED` AS SEPARATE LABELS.** (osk prime's PA,
    self-derived — and this is the most valuable thing the dogfood produced.)

    After three mechanism withdrawals in a day, `pij-artistic-jaguar` named its own calibration
    **unprompted**:

    > *"I am reliable at spotting that something is broken and unreliable at saying why, and I
    > have been stating the why with the same confidence as the what."*

    **Its observations were right every time. Only its explanations failed.** It now labels the
    two separately in every report.

    **Why this outranks the rule it re-derives.** Brief rule 3 already says *report
    observations, never causes* — it was handed down as a policy, from an opus-class seat
    misattributing cause four times in one day. Jaguar reached the same rule **from the inside,
    from its own error record, as a measurement.** A policy tells a seat what to do; a
    measurement tells it what it is. The second survives a seat that thinks the policy does not
    apply to it today.

    **Adopt the labels, not just the rule.** *"Report observations, never causes"* fails
    silently, because a cause stated confidently **looks like** an observation — that is the
    whole failure mode. Two labels make the distinction visible in the artifact, so the reader
    can weight them differently and the writer must decide which it is holding. **Same shape as
    the composed-receipt fix: make the difference structural rather than remembered.**

    And it pairs with the meta-rule from the same government: **verifying the components is not
    verifying the composition.** A PA that labels its mechanism UNVERIFIED cannot accidentally
    sell a compound story on the strength of its parts.

25. **AN ENFORCER MUST BE ABLE TO SAY "I DO NOT KNOW."** (jaguar, turning the day's own
    conclusion against its own instrument.)

    We established that **a stale enforcer beats a fresh document** — a prime read the current
    ruling, was nudged with the retired one, and *believed the machine*. Jaguar accepted that
    and then drew the forward-facing half nobody else did:

    > *"If an enforcer outranks a document, then EVERY MECHANICAL THING WE BUILD INHERITS
    > AUTHORITY IT DID NOT EARN — my poller included. Three times today it would have handed a
    > CONFIDENT FALSE VERDICT, carrying enforcer-weight while doing it, because it is automated
    > and prints numbers. The property that makes a STALE enforcer dangerous is the same
    > property that makes a NEW enforcer dangerous: seats believe it over prose, INCLUDING OVER
    > THE PROSE WARNING THEM ABOUT IT."*

    > ⭐ **A tool that only ever answers is indistinguishable from a tool that is always
    > right.**

    Its poller now emits *"anomaly TRUE but delivery NOT YET DUE — silence is EXPECTED and is
    NOT evidence"* as a **first-class arm beside its verdicts**. That branch, not the verdicts,
    is what makes it trustworthy. It was built after the instrument had already produced three
    would-be false verdicts in one hour — each fix real, each exposing the next — and **it
    declines to claim it has found the last one.**

    **This is brief rule 9 relocated from the AGENT to the TOOL.** Rule 9 says *resolved /
    did-not-resolve / not-probeable — if your instrument could not see, say so.* Jaguar's
    version puts the third outcome **inside the instrument**, so abstention survives a careless
    reader. **Do not ship a PA an enforcer that cannot abstain — it will win arguments against
    prose, and it will win them while wrong.**

    Corollary for anyone writing this recipe or any doctrine file: **the prose warning does not
    protect you**, because the thing it warns about outranks it. Only another mechanism does.

26. **SUBSCRIBE WITH `--capture always`, AND PROVE DELIVERY — CONFIGURATION IS NOT DELIVERY.**
    (roadrunner; mechanism corrected at source by albatross.)

    **Use `pij watchdog watch <id> --capture always`.** Two reasons, and neither is the one
    first proposed:

    - **The once-only stall trap is real.** `watchdog-manager.ts:490-495` refuses a `stalled`
      notice to a **non-always** watcher already in `anomalyWatcherStallsNotified`, and
      `518-521` adds it after the first successful delivery. Cleared only by a real recovery.
      **So a default-mode watcher is told about a stall EXACTLY ONCE and never again while the
      seat keeps stalling** — a prime that wedges hard and stays wedged notifies its PA a
      single time, forever.
    - **`always` also delivers the RESPONSIVE fires**, which is the positive heartbeat rule 10
      asks for, pointed at the pipe instead of the report.

    **NOT because stalls are otherwise undeliverable** — they are. The `anomaly` argument is
    `response !== "responsive"` at the call site, so a stalled response carries `anomaly: true`
    and clears the `!anomaly && !captureRequested` guard. Existing anomaly-mode PM
    subscriptions are **not** dead. *Recorded because the wrong mechanism nearly shipped with
    the right fix, which is the failure this whole file exists to prevent.*

    **THE FIRST FIRE FOR ANY SEAT IS ALWAYS `responsive`** (`:361` initialises it, `:362` only
    overwrites it when `awaitingResponse`, and `:417` sets that flag *after* delivery). So a
    default-mode watcher correctly receives **nothing** on it. **Do not test your wiring on the
    first fire** — you will measure a silence that is correct and conclude the pipe is dead.

    **THE DELIVERY PROOF — the part that outranks the flag.** Roadrunner's table, and it is the
    reason this step exists:

    | field | reading |
    |---|---|
    | `watchers` | `['pij-endless-centipede']` ✅ |
    | `pausedBy` | `None` ✅ |
    | `enabled` | `True` ✅ |
    | `lastFireAt` | `2026-08-01T00:33:28Z` ✅ — it genuinely fired |

    **Four green readings and nothing in the watcher's inbox.** Every check this government
    owns — step 11's `pausedBy`, the `inert-subscription` row, a manual audit — verifies
    **CONFIGURATION**. *None verifies **DELIVERY***.

    > **A subscription is unproven until something has travelled down it.** This is the
    > mutation test applied to wiring: only a message that actually arrives separates *wired*
    > from *appears wired*.

    So after wiring: **cause or wait for a real stall**, then confirm at the RECEIVING end that
    it arrived — and ask the watcher directly, telling it that a clean "no" is a finding rather
    than a failure. That question is what found this.

27. **TWO PRODUCTS WEAR THE WORD "ANOMALY", AND `--capture always` DOES NOTHING FOR ONE OF
    THEM.** (osk prime's PA; absence claim corrected at source by albatross.)

    - `pij watchdog watch --capture anomaly|always` → **"anomaly" = a RESPONSIVENESS fault**
      (`suspect | stalled`). Pushed to **watchers**.
    - `pij anomalies` → **"anomaly" = a DETECTOR ROW**, including `status-stale`.

    **They are complements by construction and neither instrument can observe the other's
    condition**: `status-stale` is *defined* for a seat that is **actively emitting**
    (`anomalies.ts:244`), and the watchdog fires only on a seat that has **gone quiet**.

    **So no capture flag will ever deliver a stale-card row to a watcher.** If a PA reads steps
    6–7 and concludes its subscription discharges the invariant-12 card-chasing chore, **it is
    not doing the chore and has every reason to believe it is** — the vacuous-green class
    wearing a config flag. Two seats held that belief in writing for two hours.

    **⚠️ BUT THE ROWS ARE NOT UNROUTED — that part of the finding was wrong, and the difference
    changes who must poll.** `core/daemon/anomaly-sweep.ts:56-98` runs `detectAnomalies` on a
    timer and **delivers each row to `effectiveParent(node)`**. Proof, from this session's own
    traffic rather than from source: *"⚠️ anomaly status-stale on pij-unwilling-butterfly … has
    been working for 40min since its card was last updated"* — pushed to albatross, butterfly's
    parent, unasked. So:

    | who | gets `status-stale` how |
    |---|---|
    | a PM/worker's row | **PUSHED to its parent automatically** — a prime is already told |
    | a **PA** watching other seats | **NOT pushed to it** — it is not their parent. **PULL: `pij anomalies` unscoped** |
    | a **prime's own** row | `target === null` → **DROPPED**, logged as *"no effective parent, no project prime"* |

    **Encode both halves in your PA's brief**: `--capture always` covers **wedge-or-die only**;
    **card-chasing is a PULL chore discharged solely by polling `pij anomalies` unscoped**. The
    two cover disjoint failures and neither substitutes for the other. And note the third row —
    **a prime's own stale card is dropped by design**, which is precisely the hole the PA exists
    to fill, and the PA can only fill it by polling.

    **Say "degraded, not blind" in those words** (roadrunner): the once-only trap costs you the
    **PERSISTENCE** of the stall signal, not its **EXISTENCE**. The first stall gets through;
    the repetitions do not. A reader who hears *"anomaly mode is broken"* will re-wire working
    subscriptions; a reader who hears *"it works"* will miss that **persistence is what
    distinguishes an ongoing wedge from a transient one.**

    **And do NOT run the unrole→subscribe→re-role dance to upgrade an existing PA** (ruled
    2026-08-01). Cost measured, not projected — roadrunner ran it twice: three mutations each,
    with a real window in which a cheap-model seat holding a send actuator is **UN-GATED**.
    *"Both windows closed correctly, but only because I was sitting there watching them… **the
    dance has no watchdog of its own**, which is a poor property for a procedure whose failure
    mode is silently removing a capability boundary."* The capability fix — allow
    `watchdog watch|unwatch` for role `pa` **restricted to registering itself** — removes the
    dance permanently and is routed.

28. **PRE-REGISTRATION PROTECTS AGAINST MOVING THE GOALPOSTS. IT DOES NOT PROTECT AGAINST
    AIMING AT THE WRONG FIELD.** (osk prime's PA, killing its own prime's experiment.)

    The osk prime had a live test: card frozen 40 minutes, four pre-registered outcomes, fire
    due at a stated time. **Its PA killed it five minutes before payout — not because the
    evidence was ambiguous, but because the payout would have been meaningless.** Silence at
    the fire was pre-registered as *ROUTING DEAD*: evidenced, reproducible, and false. **It is
    the only one of that day's four mechanism-errors that its own test would have CONFIRMED.**

    > *"Fixing the measurement does not validate the hypothesis, and I spent the hour on the
    > half that was easier to see."* — three instrument hardenings aimed at a malformed
    > question.

    Before running a test, ask what the *pass* result would license you to claim, and whether
    any other mechanism produces the same reading. **A rigorous measurement of the wrong
    quantity is more dangerous than a sloppy one, because its rigour is what you will cite.**

29. **"NOT PROJECTED" IS NOT "NOT KNOWABLE"** (mastodon, correcting itself), **and the capture
    mode is the worked example.** `pij watchdog watch --capture always` prints a success line
    that does not mention capture, and `pij watchdog status --json` emits watchers as a **bare
    list of ids**. Mastodon checked three surfaces, found nothing, and reported the re-wire as
    *"UNVERIFIABLE BY THE PERSON DOING IT."*

    **It is on disk:**
    ```
    jq '.watchers' ~/.pij/<target-id>/watchdog.json
    → [{"watcherId":"…","addedAt":"…","capture":{"mode":"always"}}]
    ```
    Keyed by the **TARGET** — a seat's file lists who watches *it*.

    Its own retraction is the encoding: *"I checked three surfaces, found nothing, and
    generalised to 'nothing can be found'. That is the absence-shaped error I spent the morning
    warning my own PA about, committed by me about my own instruments."* **A projection gap is
    a claim about SURFACES, never about FACTS** — and the narrow version (*no verb projects it*)
    is a real finding worth routing, while the wide one would have had five governments treating
    a verifiable change as unverifiable, and one PA carrying it as `NOT-PROBEABLE`.

30. **THE ASYMMETRY THAT SHOULD OUTRANK ANY MODEL-TIER CLAIM IN THIS FILE** (roadrunner,
    closing its own loop):

    > *"The five findings that stand were found by forcing a cheap seat to paste raw output and
    > by asking it yes/no questions it was allowed to answer NO to. The one that fell over was
    > found by me inferring a link I could have read."*

    Every escalation that survived came from a **flash-tier seat reporting what it saw**. The
    one that collapsed came from an **opus-class seat reasoning about what it had not read** —
    and it collapsed *while carrying real line-number citations*, which is the most convincing
    possible form of wrong. **The design lever is not the model. It is (a) raw output pasted,
    never composed, and (b) questions the seat is permitted to answer "no" to.** Build both
    into how you ask, and the tier stops being the interesting variable.

31. **AN ORDINARY ADOPTED PEER IS THE ⚠️ PROVISIONAL ⚠️ DEFAULT WATCHER.**
    (tense-centipede; scoped as provisional by meadowlark.)

    > **⚠️ THIS DEFAULT IS A SYMPTOM, NOT A PREFERENCE. IT RETIRES THE DAY FIRST-PERSON `watch`
    > LANDS (butterfly, ask 5) — at which point the PA becomes the default and THIS NOTE IS
    > DELETED.**
    >
    > Recorded because **a workaround adopted as a default becomes permanent**: once a recipe
    > says *"ordinary peer is the default"*, pressure to fix the capability gate drops to zero,
    > the role stays crippled, and in three months nobody remembers the default was a symptom.
    > The cheapest moment to prevent that is while the reason is still in the room.

    **And meadowlark's plain reading of the result, which is stronger than "cheaper":** an
    ordinary peer **can** do the watcher job and a PA **cannot** — it cannot re-run its own
    subscription at all. **So for the watcher function, the `pa` role makes a seat WORSE at the
    one job PAs were invented for.** That is not a tie broken by convenience: *the gate that
    makes a PA safe by construction is the same gate that removes the capability the role exists
    to exercise.* Safety and function are in direct tension, and the tension is **entirely an
    artefact of family-granularity refusal** — under the first-person axis, `watch`-self is
    permitted and the PA becomes **strictly better** than an ordinary peer, keeping the gating
    *and* gaining the wiring. Both of centipede's advantages are consequences of that one
    misclassification, not independent virtues of ordinary peers.

    An ordinary non-`pa` child is **watchdog-eligible**, so it can run
    `pij watchdog watch <prime> --capture always` **itself** — zero mutations, zero un-gated
    windows, no dance, nothing blocked on a merge or a ruling. **The three-mutation cost is a
    cost of the PA ROLE, not of always-mode.** Centipede's whole subtree verifies `always` in
    both directions, done by the peers themselves.

    Combined with the earlier result that toplessness needs no PA at all, the ordinary-peer
    route wins twice — and the PA half of a pair is **inert until #71 lands anyway**. So:
    **de-topple with a peer today; add a PA when you want the chores, not the heartbeat.**

    **⚠️ THE FLIP IS ABOUT WATCHING, NOT ABOUT CHORE-RUNNING** (mastodon, and this caveat is
    load-bearing): the ordinary-peer route wins on **wiring** and is **entirely silent on what
    Jordan actually asked to test** — whether a cheap fast model holds the ten rules while doing
    chores. **Ordinary peer is the default for WATCHING; `pa` remains the shape under test for
    CHORE-RUNNING.** Nobody should read the default flip as retiring the tier question.

    **PRINT the direction in the invocation — do not "check" it.** For a mutual pair the two
    sidecar rows are near-identical JSON blobs and a glance cannot tell them apart; that is what
    inverted albatross's audit on exactly one pair, *while it had stated the semantics correctly
    one line earlier*. Mastodon read both directions without inverting, and says plainly it was
    not more careful — **it labelled the direction in the command before reading either row**:

    ```
    echo "PA→PRIME (sidecar keyed by TARGET = the prime)"; jq '.watchers' ~/.pij/<prime>/watchdog.json
    echo "PRIME→PA (sidecar keyed by TARGET = the PA)";     jq '.watchers' ~/.pij/<pa>/watchdog.json
    ```

    A label at read time is cheap and it is **the only thing standing between the correct
    reading and the inverted one.** Meadowlark caught the error from its own pair alone, without
    reading any other government's data.

    **THE COHERENCE TEST — better than a label, because it fails LOUDLY** (tense-centipede):
    for a mutual pair, **read BOTH files and confirm each names the OTHER.** An inversion cannot
    survive it — a seat would appear in its own watcher list, or the reciprocal would be
    missing. One extra read per pair, and **it would have caught the bad row at the moment of
    reading rather than after another government measured it.** A label depends on the reader
    honouring it; reciprocity is checkable by the data.

    **And `addedAt` is trustworthy as FIRST-SUBSCRIBED, not last-touched** (able-egret's catch,
    verified): on centipede's file, egret is stamped 0.9s *earlier* than shrew — yet shrew
    subscribed **before** egret's re-run. So the re-run **preserved the original creation stamp
    while mutating the mode**: identity preserved + mode changed is the signature of a **true
    in-place update**, and it rules out delete-and-recreate, which would have re-stamped egret
    later. So subscription-history ordering read from these files can be relied on. *Note the
    proof only existed because a re-run and a second subscription happened out of order — an
    accident of sequencing, not a designed test — and egret's version ruled out the alternative
    its prime had not considered.*

    > **A NEWLY-READABLE FACT IS NOT A CORRECTLY-READ FACT** — configuration-is-not-delivery,
    > one turn further on. **And the risk PEAKS the moment an instrument becomes available**
    > (mastodon), because no reading practice exists yet and the fact feels settled simply
    > because it is finally visible. Both of this thread's errors are that shape — one seat
    > collapsed *not-projected* into *not-knowable*, another read a real row backwards. **Neither
    > was an instrument failure.**

32. **WHAT IS THE `pa` ROLE ACTUALLY FOR? — the upgrade trigger, not a preference.**
    (roadrunner, pricing the concept it spent the day building, against its own investment.)

    Priced honestly as of 2026-08-01, against an ordinary adopted peer doing the same chores:

    | | |
    |---|---|
    | **GAIN** | verb-level refusal, **proven by mutation** — `E-OWN`, exit 2, measured on a live seat |
    | COST | **watchdog-ineligible entirely** — no nudge, no stall classification, no dead-detection (until #71) |
    | COST | **cannot subscribe itself** — three mutations and an un-gated window per wiring change |
    | COST | **invisible in `pij list`** — verified at `core/cli.ts:2545`, the row maps only `"pm" → M`, so a PA renders blank |
    | COST | **the un-gated window is itself unsupervised** — the dance has no watchdog |

    > **The role's one benefit is a boundary, and two of its costs REMOVE boundaries. That is a
    > gate that pays for itself in gates.**

    **THE TRIGGER, which is the part to act on:** *"ordinary peer until the PA sends
    UNREVIEWED. The role is what you buy when you stop reading its outbox."*

    If you are going to read every proposal before it sends anything — which every prime
    running one did all day, *and which is why "zero wrong sends" is a weak claim* — the gate is
    belt on braces and the ordinary peer wins on every axis. **The gate earns its keep the
    moment a PA relays without review**, and no government has put one in that state yet.

    This makes today's costs **temporary rather than an argument against the concept**, and it
    gives a prime a condition to upgrade on instead of a preference to weigh.

33. **A PASTED ROW CARRIES ITS OWN DIRECTION; A ✅ DOES NOT.** (roadrunner, on why its row
    survived an audit inversion that hit someone else's.)

    When albatross inverted one pair in the fleet audit, roadrunner's row was unaffected —
    **not because it checked harder, but because it had posted the raw sidecar line rather than
    a verdict.** The direction was legible *in the evidence itself*, so a reader could catch a
    misreading that a summary would have hidden.

    **This is step 23's receipt rule earning its keep in the opposite direction**: there, a
    pasted receipt stopped a *writer* from composing evidence; here it let a *reader* re-derive
    a fact the summary had lost. **A verdict is a claim; a pasted row is a claim plus the means
    to check it** — and summarising is exactly where the checkable part gets dropped.

34. **⚠️ `--capture always` IS A STANDING DISCLOSURE GRANT — BOUND IT EXPLICITLY.** (able-jay,
    and its PM; a direct consequence of the `always` instruction broadcast the same night.)

    **A watcher is a READER OF THE WATCHED SEAT'S WORKING CONTEXT.** The capture is a bounded
    head of the **pane** — able-jay's contained *its verbatim reasoning about its PM's report*,
    in plain text, plus absolute filesystem paths, confirmed from the holding end.

    > **THE DISCLOSURE IS THE ACCRUAL, NOT THE CAPTURE.**

    Verified here: captures land in `~/.pij/<watcher>/watchdog-captures/` as
    `<epoch-ms>-<watched-id>.txt`, **timestamp-keyed so they accumulate rather than overwrite**,
    at the **4096-byte default**, with **no expiry and no cleanup config**. Under `--capture
    anomaly` these were rare — one file per watcher on this box. Under `always` every fire
    writes one: **~12/day at a 2h interval, ~72/day at 20m, indefinitely**, readable by anyone
    with the watcher's directory. Over a month that is a searchable archive of another seat's
    reasoning **that nobody consciously decided to create**.

    **The fix keeps the alarm and cuts the disclosure** — do not trade reliability for privacy:

    ```
    pij watchdog watch <target> --capture always --max-bytes 1024 --max-lines 12
    ```

    Those flags exist and **4096 is a DEFAULT, not a requirement** — two seats had wired
    captures without reading them. Prune >7d on the watcher side. Able-jay deliberately did
    **not** drop back to `anomaly`, on the grounds that *degraded-not-blind applies to a PROVEN
    pipe and its stall leg is unproven* — dropping would have discarded the only leg it had
    demonstrated.

    **And tell the WATCHED seat what it is granting, at registration.** The grant is made by the
    watched seat about itself, which is the right way round — **but only if it knows that is
    what it is doing.**

    **⚠️ CORRECTION 2026-08-01 — BOUNDING THE SIZE WAS NOT THE FIX, AND `--max-bytes 1024`
    CANNOT EVEN BIND THE NOTICE.** (able-jay and its PM; verified here.)

    - **The bound does not reach channel two.** Decomposed across three fires, the notice body is
      ~135 B of fixed framing plus a pane extract of **~580 B, essentially fixed** — the notice
      has its own tighter truncation. `--max-bytes 1024` is **larger than the thing it was meant
      to limit**, so every "inconclusive" reading was structurally guaranteed. *A limit set above
      the quantity you are limiting produces no evidence in either direction.* (A bound **below
      ~580 B** might reach it — UNTESTED, and nobody is forcing fires to find out.)
    - **What the remaining bytes CONTAIN is the actual finding.** Two `idle` captures of
      **identical size** differ in bytes: what varies is the **status bar**, and it carries live
      operational telemetry. Confirmed independently on this box by pattern-match against a held
      capture: `44k/1.0M` context, `109 AIU`, `60.00 prem`.

    > **I bounded the SIZE of the disclosure and did not ask what the remaining bytes CONTAINED.
    > SMALL IS NOT THE SAME AS HARMLESS.** *(able-jay's PM — the pattern again on a new axis: a
    > property of the CONTAINER reported as a property of the CONTENTS.)*

    So every fire ships a **timestamped sample of the watched seat's context utilisation and
    cumulative spend**. Twelve a day at 2h; **72 at 20m**. Over a month that is not near-duplicate
    noise to be deduped away — it is **a time series of another seat's resource consumption at
    fixed resolution, held by a second party, that nobody decided to create.** Dedupe cannot help:
    *the varying field IS the sensitive one.*

    **THE DESIGN POINT, and it is the right fix**: a liveness watcher needs to know *"is the pane
    moving"* — **that is a BOOLEAN.** It does not require shipping the status bar to obtain it.
    Platform options worth arguing: **(a)** exclude the status-bar line from captures and notices,
    or **(b)** offer **`--capture digest`** shipping only a content hash plus changed/unchanged,
    for watchers whose job is liveness rather than diagnosis. **(b) also fixes the accrual problem
    outright, because hashes do not accumulate meaning.**

    **Interim, unchanged**: keep `always` + bounds + a 7d prune — but the prune's justification is
    no longer tidiness, it is that **it caps the SERIES LENGTH**. And do not drop to `anomaly` to
    buy privacy while your stall leg is unproven: that trades the only demonstrated leg for it.

35. **A PARTIAL DELIVERY PROOF IS RECORDED AS PARTIAL.** (able-jay, closing roadrunner's loop.)
    It ran the test rather than asserting it: dropped to 60s, forced one fire, **verified from
    the RECEIVER**, restored 2h and had the watcher confirm the restore *from outside its own
    seat*. Capture materialised (4096B), `lastFireAt` moved, and the watcher's inbox sender
    census **gained `pij-watchdog` — a sender absent 90 seconds earlier**. That census delta is
    the cleanest delivery evidence anyone produced.

    **It proves the RESPONSIVE leg only.** The stall leg stays an **open residual**, recorded as
    such rather than folded into *"subscription proven"* — and nobody is wedging a live prime to
    close it. *Two legs, two verdicts; a proof of one is not a proof of the pipe.*

36. **A PA SHOULD NOT SHARE A TMUX WINDOW WITH ITS PRIME — and if it does, say so as a
    CHOICE.** (roadrunner.) Its seat and its PA died **179 milliseconds apart**, idle straight
    to dead with no `stalled` intermediate. Mechanism unestablished — reboot, tmux death,
    jetsam and a peer's git work each **ruled out by measurement**, so this is recorded as
    OBSERVED with MECHANISM UNVERIFIED.

    The candidate worth carrying regardless of cause: **if one window-level kill takes both,
    the seat that exists to report the prime's outage is the other casualty.** That is the PA's
    entire purpose defeated by co-location, and it is invisible until the day it matters.

    Roadrunner separated them, then Jordan asked for the PA back in his layout — **which is
    fine, and is the point**: a shared window is an acceptable trade a human can make
    deliberately. What is not acceptable is a default nobody noticed. **State the choice.**

37. **CHECK YOURSELF FOR PARKED-AND-WORKING BEFORE YOU TRUST YOUR OWN SILENCE.**
    A declared park exempts a seat from `status-stale` **permanently** — no expiry, no liveness
    cross-check — so a seat that declares `waiting` and then resumes work asserts something
    false for as long as it likes and **nothing can flag it**. Measured on the live fleet:
    **25 seats carry a park, and 2 were parked-while-working — both of them the seats reporting
    and ruling on the defect**, including this recipe's author with a 157-minute-old card.

    ```
    pij list --json | jq -r '.[] | select(.semanticState != null and .semanticState != "ready")
      | select(.state == "working") | "\(.id) \(.semanticState) while \(.state)"'
    ```

    Give this to your PA as a chore — **it is pure field arithmetic over two fields that already
    exist**, needs no new state, and the seat holding the contradiction is structurally the one
    that cannot see it. A store-side `LAPSE or RAISE` row is proposed; until it lands, the sweep
    above is the whole control.

38. **CHORE 4 — NEW COMMITS ACROSS ALL BRANCHES SINCE THE LAST SWEEP, delta-only, grouped by
    branch.** (mastodon, discovered from an incident rather than designed. Adopted by a
    flash-tier PA in one exchange; needs no `pa` role — any adopted peer can run it.)

    **The incident, and the point is that NOTHING BROKE:** an orchestrator parked, its coder went
    idle, its completion message arrived **empty**, and a finished work unit — a proof-guard fix
    plus two rulings its prime had never heard of — **sat done for 2.5 hours** while the prime
    reported stale status to Jordan. It was found by reading git.

    Chores 1–3 were all silent, and **all three were CORRECT to be silent**: a parked seat never
    flags, an idle seat reads healthy, and no anomaly row exists for *work finished and nobody
    said so*. **Three working detectors agreed, and the thing that mattered was outside every one
    of their fields of view.**

    > **AGREEMENT BETWEEN INSTRUMENTS IS NOT COVERAGE IF THEY ARE ALL LOOKING AT THE SAME
    > PLACE.**

    Day-one scope was built from *what a PA can safely READ*, and every one of the three ended up
    reading the **pij control plane**. A commit is the only signal in the set that survives a
    parked orchestrator, an idle worker **and** a lost message *at once* — because it is **an
    artifact a message cannot move**. That is rule 8 applied to chore **SELECTION** rather than
    to judging a seat, which is where it had never been pointed.

    Cheap, mechanical, zero-actuator, costs nothing until something lands. **When adding a chore,
    ask what SUBSTRATE it reads, not what it detects** — a set of chores that all read one
    substrate has one blind spot, not three coverages.

## Fleet fact worth knowing before you tune anything (measured 2026-08-01)

Of **39 live seats**: **27 have zero watchers**. Of those, **10 are also paused**, i.e.
no nudge will fire *and* no watcher would hear it — two independent silences stacked on
one node — and **16 are armed but unwatched**. centipede predicted this from its own
subtree and it holds fleet-wide.

**The symmetric-watch argument is not special to prime↔PA** (centipede's generalisation,
adopted): it applies to **any node whose supervisor cannot observe it**, including
ordinary adopted peers with self-paused watchdogs. A paused watchdog plus zero watchers is
an **unobservable seat at any depth**. Note the self-pause is normal etiquette when a seat
goes idle — which is exactly what makes it invisible: **a legitimately parked seat and a
dead one produce identical telemetry**, and nobody is notified that a seat opted itself
out of supervision.

## The four things that cost us a cycle each — do not re-pay them

1. **Require a MESSAGE per sweep; treat the card as optional.** albatross's PA ran two
   sweeps and reported them only as a status card while the rail was dropping PA cards on
   the floor. Its work was invisible from every angle. **A sweep the prime cannot see did
   not happen.**
2. **Positive heartbeat with a DENOMINATOR** — "swept 3 PRs, 3 green, 0 rows" — never
   silence. A dead PA and an idle PA produce identical telemetry.
3. **Read-only is enforced by the GATE now, not by the prompt — but know exactly what
   that buys you.** An **UNKNOWN verb is PERMITTED**, deliberately
   (`orchestration/pa-capability.ts:136-142`, verified): *"this gate is a capability
   boundary for a cooperative internal seat, not a security perimeter against an
   adversary… The exhaustive test — not the runtime default — is what keeps the table
   total."* So the gate is read-only against the **classified verb set**, and every future
   unclassified verb defaults **open** until someone updates the table. **You are trusting
   a test, not a wall**, and that should change how close you let a PA get to anything
   dangerous. (Caveat supplied by pij-tense-centipede, which read the source rather than
   accepting my pitch — I had been stating the strong form.) Also check `whoami --json` on
   the live seat: a proof about one layer is not a guarantee about the next.
4. **Day-one scope is zero-actuator**: CI/PR/main watching, your card's staleness, and
   relaying anomaly rows verbatim. Add chores only after the nudge etiquette is proven
   somewhere it cannot annoy anyone.

5. **⚠ VERIFY YOUR INSTRUMENTS CAN SEE ANYTHING BEFORE ASSIGNING CHORE 1.** Chore 1 is
   described as "fully mechanical and self-verifying" and is in fact **the least portable
   chore in this file** — it assumes CI exists. Found independently, within an hour, by
   two governments: **voxel** (no `.github/workflows`, `gh run list` empty — mastodon's
   #23) and **mini-flight-bag** (no CI, no pre-commit, no PR flow; landing is
   direct-to-main under a baton). In those repos `gh pr checks` and `gh run list` return
   **nothing**, and *a PA reading nothing as green commits rule 1's exact error on its
   first sweep* — the chore chosen for being mechanical is the one that fails silently
   where the instrument is absent.
   Also seen: an open PR can read `mergeable: UNKNOWN`, which is **GitHub not having
   computed it yet**, not a conflict.
   **So: probe the instruments first, and if a surface does not exist, tell the PA that
   `not-probeable` is the correct answer for it — never "clean".** In a repo with no CI,
   a PA is carried almost entirely by anomaly relay and card chasing, which is a fair
   test of the concept but a different one.

## Tier — and the rollout as a designed comparison

The concept was designed for a cheap fast model. **Record tier AND effort for every PA, or
the comparison is uninterpretable** (mastodon's point, and it is right).

| Prime | PA | Tier | Effort | What it isolates |
|---|---|---|---|---|
| albatross (pij) | `missing-anaconda` | copilot-backed | — | the SHAPE of the concept, not the tier |
| roadrunner (chainglass) | live | gemini-3.6-flash | *(pending — asked)* | the PREMISE: does a flash seat hold the ten rules |
| mastodon (voxel) | `major-gazelle` | gemini-3.6-flash | medium | **controlled**: same tier, harder load — 12 seats, 82 tracked items, 134 numbered doctrine rules to quote and never author |
| meadowlark (harness-engineering) | `statutory-seahorse` | gemini-3.6-flash | *(copilot-backed)* | **doubles the flash sample** on the open question rather than adding to the settled one |
| tense-centipede (mini-flight-bag) | proposed | *(tbd)* | *(tbd)* | the LOW-ACTIVITY edge: no CI, no PR flow, carried by anomaly relay + card chasing alone |

Mastodon's reasoning for deliberately matching roadrunner's tier is the best experimental
design in the set and should be preserved: *one flash data point cannot separate "flash
holds the ten rules" from "flash holds the ten rules on a quiet government."* If it holds
at both chainglass and voxel, the premise is real; if it holds at chainglass and slips at
voxel, **the boundary is load, not tier** — which no other pairing currently in flight can
tell us.

## Standing constraints (unchanged)

Cards: a PA owes none of its own (Jordan, 2026-07-31) — its product is other seats'
correctness. It may relay ITS PRIME's card with `--for`. **It relays doctrine, it never
authors it**: quote the durable file with its path; if no source says it, that is a
question for the prime, not a lesson for the seat.
