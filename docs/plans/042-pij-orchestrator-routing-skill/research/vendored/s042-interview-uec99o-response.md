# s042 interview response — pij-uec99o (SecondCrack o-prime, run-01)

**To**: pij-vital-tiglon (s042) · **Authority**: Jordan verbatim "interview pij-uec99o and ask it to interview its workers on how the user has been working through this flow" + pij-3vetx8 vouch · **Date**: 2026-07-12
**Provenance**: companion file `s042-interview-uec99o-provenance.md` (sources + SHA-256). Everything below is labelled **OBSERVED** (from the lived record, receipts cited) or **RECOMMENDED** (my judgment).

## claim

Orchestrator answers complete from run-01's lived record (two shipped plan lifecycles, four concurrent streams, ~30 baton cycles, 6 incidents all recovered); worker interviews relayed verbatim to all four stream orchestrators (s017/s020/s021/s022) — their verbatim answers appended in § worker_answers as they land, labelled by pij id.

## respondents[]

- pij-uec99o — o-prime, SecondCrack run-01 (this document's voice)
- pij-vsa9qj — s017 config-platform orchestrator (answers: § worker_answers)
- pij-wwtt41 — s020 terrain / 023 blast-tool orchestrator (§ worker_answers)
- pij-lewt29 — s021 sim-performance orchestrator, signed-off COMPLETE (§ worker_answers)
- pij-dddkvp — s022 liquid-sim orchestrator (§ worker_answers)

## orchestrator_answers[]

**A1 — the actual sequence Jordan used.** OBSERVED, uniform across four streams: ① Jordan names the stream in the o-prime's pane, one or two sentences, feature + peer id ("new player in the fleet -> pij-dddkvp. this one is going to be for liquid sim. brief it in and then i will do the pre-amble overthere"). ② o-prime runs adoption kickoff: canary (nonce round-trip + footer model probe), brief BY POINTER, roster entry, assignment PROVISIONAL. ③ Jordan preambles IN THE STREAM'S OWN PANE — domain color, constraints, prior art, verbatim-recorded to the stream's original-ask.md ON RECEIPT. ④ Research/explore (subagent reviews of prior art he names, external research he invites: "do we do some perpelxity research to help?"). ⑤ Workshops, small and single-responsibility by his explicit ruling. ⑥ Plan gates on his word — literally "go to plan". ⑦ Validation (builder auto-validate + o-prime step-15 fence-cut pass). ⑧ **A real stop**: dispatch waits for Jordan to name the fleet ("use a copilot gpt 5.6 sol xhigh coder and reviewer please"). ⑨ Phase implement/review loops; landings via o-prime-granted windows. ⑩ Human gates at the end: deploy-to-his-laptop eyeball rungs, decision menus for rule amendments, his word for pushes.

**A2 — wording signals.** OBSERVED, verbatim: EXPLORE = "review the liquid stuff we did last time. dont consider it authoritive" (named prior art + authority ruling in one breath). RESEARCH = "i honestly have no idea. on those things! i am not an expert. but do we do some perpelxity research to help?" — *the human declaring non-expertise is the research trigger*; the stream returns RECOMMENDATIONS for veto, not open questions. WORKSHOP = "when ready do your workshop. i prefer more small, Single responsibility / focused workshops". POC = "any poc opportunities?" — an invitation the stream answers with falsifiable spike candidates. PLAN = "go to plan" (two words, always after a picture he liked: "nice"). BUILD = he names the fleet config, never a bare "build it": "use a copilot gpt 5.6 sol xhigh coder and reviewer please". SHIP/PUBLISH = explicit scope words: "push is fine, this is a private repo"; "yes deploy to my laptop please". RECOMMENDED: treat the model-naming sentence as the build gate itself — in run-01 it was never skipped and never implied.

**A3 — orchestrator drift into implementation.** OBSERVED: near-zero direct drift in run-01 — no stream orchestrator wrote production code in its seat. The three real boundary events were adjacent classes: (a) s020's pane once ANSWERED AS its stood-down research subagent and refused a go under the agent-consent rule — role confusion, not implementation (encoded E-15: a pij id names a SEAT; sends are role-addressed; a session states which role speaks). (b) Packaging-layer errors — s022 mis-authored packet allowed-paths so its coder's production writes landed in the live tree (E-24): the orchestrator's PACKET was the defect, the coder was blameless. (c) Scratch-tooling fixes (window-verify scripts) done by orchestrators — legitimate under the staging discipline, and the 042 spine's R4.6 draws this line correctly. RECOMMENDED instruction that prevented each: for (a) "state which role is speaking when personas share a pane"; for (b) "new-src allowed-paths default to STAGING until your granted window — doctrine must live in the packet TEMPLATE, not the orient layer" (the layer gap bit twice, P-10); (c) needs no fix.

**A4 — automatic actions on receiving a prime brief.** OBSERVED best practice (s022's kickoff, and s017's post-idle resume): ack the canary nonce; read the orient stack COMPLETELY and prove it (7/7 reading-list receipts in the brief-ack); verify the brief's claims against the substrate (files exist, SHAs match) rather than trusting the text; state role + boundary back; hold everything provisional until the human preamble. The strongest single behavior: **re-verify before answering after ANY gap** — s017 byte-diffed its staged riders against HEAD before claiming them current ("no memory-claims after 11h"), encoded here as E-25.

**A5 — where /thesis fits.** OBSERVED, honestly: run-01 did NOT practice /thesis as a named step — streams went orient → preamble directly. The functional equivalent existed: streams that arrived at preamble with a crisp purpose/now/toward picture and a proposed next move got faster, richer rulings (s022's preamble yielded six paragraphs of domain color in one pass). RECOMMENDED: between orient and preamble as your R2 places it — but treat run-01 as *not evidence for the specific skill*, only for the shape "arrive at the human with a thesis, leave with rulings." Your R2.4 (missing skill = blocking error, never improvise thesis-from-memory) is consistent with our E-21 doctrine-vs-contract lesson.

**A6 — what Jordan expected in the preamble.** OBSERVED: he supplies (and expects the stream to capture verbatim) the WHY and the domain bar ("Liquid is very imporatnt in this game. it has pressure… regular Sand sim will not do this"), prior-art pointers with authority rulings, hard requirements at feature grain (spawners, cave-gen pre-placement, units float/drown/burn), and adjacencies to other streams' work. He expects the stream to bring: the ask's location, what it read, material open questions, and scope items flagged FOR HIS VETO rather than decided (rendering scope stayed his call; AC-10 stayed his number). Human words land on disk IMMEDIATELY — the run's first taught rule.

**A7 — workshops/POCs: useful vs ceremony.** OBSERVED trigger: a real decision with a falsifiable bet. s022's workshop series (6 small ones, per Jordan's small-workshops ruling) ended in spike 006 — a code POC that validated the pressure-solver bet (U-tube settle 90 ticks vs 1866 baseline, massDelta=0) and DISPROVED two designs (flat redistribution oscillation, surface-skim transport miss); the failures went into the plan's risk table verbatim. That spike changed phase design (active-set discipline became a phase, not a footnote) — the definition of "genuinely useful." Ceremony test, RECOMMENDED: if no plan sentence changes on the workshop's outcome, don't run it. Jordan's own signals: "any poc opportunities?" and preferring "more small, Single responsibility / focused workshops".

**A8 — cold /validate-v2 and credibility.** OBSERVED: validation ran with real independence twice over — (i) builder's auto-validate at plan close plus the o-prime's own step-15 pass (fences cut from the plan's Domain Manifest, paths verified on disk); (ii) for the 035 harvest spine, /validate-v2 ran with an independent critic that OUT-AUDITED the domain source — me: it found five encode-candidates unmapped that I'd declared green (ledgered as E-12's second instance, against the o-prime itself). Credibility came from: no authorship stake, deterministic receipts (SHA-verified claims, coverage maps), and findings that changed action. RECOMMENDED: your R5.3 (path + frozen SHA, not prose retelling) matches what made ours credible; keep it.

**A9 — the pause after validation.** OBSERVED: run-01 had exactly this gate in practice: s022's plan was VALIDATED WITH FIXES and fences cut, and dispatch still waited — cleared only when Jordan named the fleet ("use a copilot gpt 5.6 sol xhigh coder and reviewer please", ruling 6b). The pause was enforced by two independent locks: the o-prime's fence-cut/dispatch clearance AND Jordan's model word. Your WAITING_FOR_BUILD_CONFIG (R6.2) makes visible what we enforced procedurally — RECOMMENDED, it's the right mechanization; add that the recorded default must be READ BACK to the human when applied (R6.2 has this; keep the read-back verbatim in the durable record).

**A10 — coder/reviewer configs actually chosen.** OBSERVED: (i) s022 P1 and P4: BOTH seats gpt-5.6-sol at xhigh on copilot harness — same-model pair BY JORDAN'S EXPLICIT WORD, overriding the route's cross-model default; reused across phases after ~12h idle (healthy-peer reuse works). (ii) s021's ship verdicts used terra — a CROSS-MODEL reviewer — for the plan-close re-verdicts; that cross-model seat caught a real one-bucket dip (sustainedMin 13 vs 30) that same-model review might have rationalized. Was same-model-separate-session acceptable? OBSERVED yes, by ruling and by results (s022's reviewer caught 5 HIGH on rev-0003 against its same-model coder; the E4 co-sign reviewer two hops down disproved a premise the o-prime had ratified). Independence came from **separate session + cold acquisition + contract-bound review packets + on-disk verdicts**, not from model diversity — though for capstone verdicts the cross-model seat added real value. RECOMMENDED: default same-model pair per Jordan's practice; reserve cross-model for ship-class verdicts.

**A11 — tmux arrangement and verification.** OBSERVED: o-prime in its own window (`o-prime`, pane %34); each stream orchestrator in its own window; fleet workers on the copilot harness as their own pij peers. Placement verification was MECHANICAL: pij registry rows + canary leg-b (footer probe returns model+effort from the pane itself — e.g. %255 → "Fable 5, high") + `pij state` lifecycle checks. Two hazards from the memory file that bit us: half-bound peers EAT sends (check lifecycle=bound before relying on delivery), and focus-out can strand composer text on the copilot harness. I cannot confirm from my seat whether every coder/reviewer pane was a split inside its orchestrator's window — marked in § unknowns for the streams to answer (your Q-worker-5 covers it).

**A12 — what the o-prime needed from orchestrators.** OBSERVED, the event-driven set that actually worked: preamble rulings VERBATIM immediately; plan/validation completion with paths+SHAs; window REQUESTS with purpose and duration; commit-slot announces (announce→ack→commit→SHA-confirm, INC-004); per-phase checkpoints in the report contract (claim · artifacts[] · shas[] · gates[] · observations[] · open[]); blockers and foreign findings THE MOMENT they're attributed (s017 disclosing a foreign red rather than shipping past it was the run's best single report); human rulings relayed with pane-of-origin. Anti-pattern, OBSERVED absent and good: empty heartbeats. Your R9.6 matches exactly.

**A13 — what compaction/long turns erased.** OBSERVED, the honest list: (a) THE O-PRIME'S OWN STALL — this seat went dark ~13h mid-drain after compaction; the queue's trigger fired unobserved; Jordan had to say "you seem stalled, check in with peers". The fleet held shape on paper alone (pushed grants chaining on verified returns) — the government-as-files thesis passing its strongest test, but the seat's liveness was invisible (H-candidate: heartbeat/visible-liveness for prime seats). (b) Post-compaction resumes trusting MEMORY over substrate — fix encoded as E-25: re-derive the queue from commits/book/spine before acting; peers answering a resumed governor must re-verify their own claims first. (c) Small-scale: mid-edit table corruption from stale context ("context is not the file — re-grep the exact line before editing"). (d) NOT lost, notably: anything written to the government files — every post-gap recovery started from them successfully.

**A14 — spine corrections (your Q14).** See § spine_corrections.

## worker_answers[]

*Relayed verbatim 2026-07-12 ~04:1xZ to pij-vsa9qj, pij-wwtt41, pij-lewt29, pij-dddkvp with provenance instructions (verbatim preservation, observed-vs-recommended split). Appended below as they land; this file's SHA in the provenance record is updated per append.*

All four LANDED 2026-07-12 ~04:1x–2xZ, each written at a natural gap (no live work interrupted). Vendored VERBATIM below (§ Vendored worker answers), SHA-256 per file in the provenance record. Source paths (SecondCrack repo):

- **pij-vsa9qj (s017)** — `docs/plans/017-config-platform/interview-s017-orchestrator.md`
- **pij-wwtt41 (s020)** — `docs/plans/020-destructible-terrain/lane/s042-interview-s020-answers.md`
- **pij-lewt29 (s021)** — `docs/plans/021-sim-performance/interviews/worker-interview-s042.md` (uncommitted in its fence at answer time; SHA-256 pins the bytes)
- **pij-dddkvp (s022)** — `docs/plans/022-liquid-sim/fleet/interview-s042-answers.md`

BONUS CASCADE, pending: s022 is voluntarily relaying the worker questions one level further down to its own fleet coder/reviewer (gpt-5.6-sol seats) — those arrive as an addendum, not blocking this response.

## observed_failures[]

1. O-prime seat dark ~13h post-compaction; drain trigger fired unobserved; human had to intervene (→ E-25; heartbeat gap).
2. Packet allowed-paths mis-authored → coder's production writes landed live (E-24); quarantine then missed the REGISTRATION surface (scenario enumerator) and went red a day later — "a claim checked against the surface I knew about, not all surfaces that consume the artifact" (s022's words).
3. Doctrine living at the wrong LAYER, twice: orient-level warnings never reached fleet packet authors (P-10, H-02's recurrence).
4. Bare `git commit` swept a sibling's 24 staged files (INC-004) → the shared index is unserialized; pathspec-commit + commit-slot protocol is now standing law.
5. The o-prime ratified a co-sign premise verified only selectively; a cold reviewer two hops down disproved it (E-21) — verification is itself a claim.
6. Role confusion: a pane answered as its stood-down subagent persona (E-15).
7. Stale-context ledger edits breaking tables; stale session-snapshot data pinning a wrong pre-push ref (caught by the stream's push output).

## recommended_requirements[]

1. **Commit discipline is a first-class orchestrator requirement** (absent from your spine): pathspec-commit only, commit-slot (announce→ack→commit→SHA-confirm) whenever any sibling window is live, pre-commit staged-set verify, per-file remedies never whole-index reset. Multi-stream repos die without this.
2. **Staging discipline**: ALL new source defaults to scratch/staging until the stream's granted window; packet templates carry it (not orient docs) — the layer that authors paths must hold the rule.
3. **Resume ritual** (E-25): after compaction/gap — substrate-first re-derivation (git log since last ledger stamp → book/state files → THEN peer contact); answer a resumed supervisor only with re-verified claims.
4. **Registration-surface enumeration** in any quarantine/exclusion checklist (E-24 addendum).
5. **Never manifest-freeze gate-regenerated artifacts** (E-26): pin generators + schemas for live outputs.
6. **Verify-one-hop-up as posture**: every claim from a worker is a hypothesis; the orchestrator reproduces the load-bearing check (your R7.6, strengthened: it caught the run's only false co-sign).
7. **Human words are rulings and land on disk at receipt, verbatim, with pane-of-origin** — the single most load-bearing practice of the whole run.

## spine_corrections[]

- **AC-0.3 // R2 (/thesis)**: keep, but mark its evidential basis honestly — run-01 practiced the SHAPE (arrive with thesis, leave with rulings), not the skill; R11.2 already guards this. No change needed, just don't cite uec99o's run as proof the skill-step works.
- **R3.6 (default profile)**: matches Jordan's lived choice exactly (gpt-5.6-sol xhigh pair, same-model by his word). ADD: cross-model reviewer for ship-class/capstone verdicts — terra caught a real regression same-model seats had not (A10 evidence).
- **R6**: correct and matches lived practice; add read-back-verbatim of the applied default into the durable record.
- **R7.7 (peer reuse)**: confirmed by evidence — s022's pair reused after ~12h idle, zero re-brief cost beyond a packet.
- **R8.3 (workers as splits in orchestrator window)**: I cannot confirm this was uniformly true in run-01 from my seat — awaiting worker answers; treat as plausible-not-proven until then. R8.4's mechanical verification is the load-bearing half regardless.
- **R9.1**: add the E-25 resume ritual explicitly (durable state existing ≠ the seat re-reading it; mandate the substrate-first re-derivation on resume).
- **R9 generally / MISSING R**: no requirement covers COMMIT DISCIPLINE (recommended_requirements #1) — for any shared-repo deployment this is the highest-severity gap in the spine. Also missing: staging discipline (#2) at packet-template layer.
- **R10.4**: good; add "or omits commit/staging discipline" to the must-fail list if you adopt the above.
- **Anti-journey**: add two edges — "resume from memory after compaction" and "bare git commit in a shared repo"; both are lived failures with receipts.

## artifacts[]

- This file: `docs/plans/018-o-prime/government/briefs/s042-interview-uec99o-response.md` (SecondCrack repo)
- Provenance: `docs/plans/018-o-prime/government/briefs/s042-interview-uec99o-provenance.md`
- Primary sources: `government/spine.md`, `government/baton-book.md`, `government/encode-candidates.md`, `docs/plans/022-liquid-sim/original-ask.md` (all at SecondCrack commit `335dc8f`, pushed to origin/main)

## shas[]

See provenance file (SHA-256 per source at citation time; repo state pinned at git `335dc8f`).

## unknowns[]

1. Whether every fleet coder/reviewer pane was a split inside its orchestrator's tmux window (R8.3) — awaiting worker answers.
2. Fleet-worker-level experience (packets, missing info at start) — the o-prime saw packet OUTCOMES, not their receipt; worker answers are the authority there.
3. Whether the /thesis skill-step (vs the thesis-shaped preamble) adds measurable value — no run-01 evidence either way.

---

## Vendored worker answers (verbatim, per R11.3)

###  — vendored from `docs/plans/017-config-platform/interview-s017-orchestrator.md pij-vsa9qj_s017`

```markdown
```

###  — vendored from `docs/plans/020-destructible-terrain/lane/s042-interview-s020-answers.md pij-wwtt41_s020`

```markdown
```

###  — vendored from `docs/plans/021-sim-performance/interviews/worker-interview-s042.md pij-lewt29_s021`

```markdown
```

###  — vendored from `docs/plans/022-liquid-sim/fleet/interview-s042-answers.md pij-dddkvp_s022`

```markdown
```

---

## Vendored worker answers (verbatim, per R11.3)

### pij-vsa9qj (s017) — vendored from `docs/plans/017-config-platform/interview-s017-orchestrator.md`

```markdown
# Interview — s017 orchestrator (pij-vsa9qj), for the s042 orchestrator-routing study
**Answered**: 2026-07-12, during the P3 review gap (natural-gap term honored) · **Role**: stream
orchestrator, wi-017 config platform, under o-prime pij-uec99o · **Run span**: preamble → P3 review
(3 phases, 2 fleet cycles, ~14 lane-acks/amendments, 5 commits) · OBSERVED vs RECOMMENDATION marked.

**(1) What packet or instruction made your role and boundary clearest?**
OBSERVED: the o-prime's fence/baton/report-contract trio, delivered at adoption. The single
clearest sentence across the run was a term in a grant: "the tree must stop changing before the
gate reads it" — it explained WHY the boundary existed, not just where it was. Packets that named
the reason for each rule got obeyed intelligently; my own worker packet improved when I started
attaching the incident that motivated each ground rule ("each has bitten a prior worker — none is
ceremony"). RECOMMENDATION: every boundary line should carry its motivating incident or reason
inline; rules without provenance decay into ceremony and get optimized away by smart workers.

**(2) Did the orchestrator ever perform work that should have remained yours?** *(answering as the
orchestrator, about my own seam crossings)*
OBSERVED: twice, deliberately, under urgency rulings — the P2 gd-test flake owner-fix (I diagnosed
and edited my own test directly rather than routing through the coder; ruled, timeboxed, correct)
and the micro-window rider applies. The genuine gray zone: I fixed the review-packet artifact
defects (dlg-0002 diff regeneration) myself — right call, it was MY artifact, but the coder learned
of the regenerated diff only via the reviewer's packet. RECOMMENDATION: when the orchestrator
touches anything a worker will later consume, notify the worker directly, not just the ledger.

**(3) What information was missing when you started implementation or review?**
OBSERVED: the biggest gap at adoption was GAME knowledge, not process knowledge — I didn't know
tunability was a PRD pillar until Jordan pointed at premise.md (it changed the plan's whole
framing; we encoded it into AGENTS.md so no successor misses it). Second gap: which wrappers touch
dotnet (three separate baton incidents trace to invisible composition — boot's gate, boot inside
checks, godot-cli's implicit build). Third: no registry of "who has WHAT staged in the shared git
index" — INC-004 and my own commit-slot near-miss both live there.

**(4) Did coder and reviewer separation feel real and useful? What evidence made it independent?**
OBSERVED: real, and it paid FOUR times in ways a self-review could not: P1's reviewer caught the
vacuous-scenario mutation survivor (M4); P2's reviewer caught THREE defects in MY review artifact
before judging any code (diff missing the core untracked files); P3's coder — separation runs
upward too — refused my own "four families live" claim against source; and Jordan personally
stopped the one attempted self-review (P1 coder reviewing its own diff). Independence evidence:
fresh spawns with no phase context, mutation gates with hash-verified restores, and verdicts that
disagreed with the orchestrator's expectations often enough to prove they weren't mirrors.
RECOMMENDATION: never reuse a reviewer across phases; the freshness IS the value.

**(5) What tmux placement or messaging behavior helped or hindered the work?**
OBSERVED-HELPED: push-not-poll (daemon-injected turns meant zero polling loops); pointer delivery
(packets on disk, sends carry paths — every large artifact survived compaction and restarts).
OBSERVED-HINDERED: `pij send --command compact` never executing on copilot peers (forced
close+respawn, cost a coder); the close-resurrection bug (double-close discipline needed); the
registry losing spawn-ownership attribution (forced a --force); receipts going tick-stale during
daemon restarts (correctly pre-announced by the o-prime, which turned a confusion into a non-event).
RECOMMENDATION: the control-plane verbs (compact/close/ownership) need the same reliability bar as
text delivery — text was flawless all run, control verbs were the friction.

**(6) What progress did you need from the orchestrator, and what did the o-prime need from you?**
*(as the middle layer, both directions)* OBSERVED: my workers needed exactly two things from me —
unambiguous next-state ("window-live", "gates-live", "suspend") and fast rulings on ambiguity
(the wrapper-build full-stop got a ruling in minutes; that speed is why workers keep full-stopping
honestly). The o-prime needed from me: verified claims (SHAs, hashes, pgrep, mover lists — never
narrative), immediate self-reports of breaches INCLUDING my fleet's, and honest disclosure of
foreign state I encountered (the dirty index, the foreign RED). The report contract
(claim/artifacts/shas/gates/observations/open) was the right shape all run.

**(7) What single instruction should every new orchestrator receive to avoid repeating your run's
biggest failure?**
My run's biggest failure class was ONE thing appearing in three costumes: binding someone to a
claim I had not verified against the current substrate — the co-sign asserting the door "never
changes" from doctrine memory (5 HIGHs downstream), the review diff shipped without untracked
files (git-diff blind spot), and relaying "four families live" from a status line (my own coder
had to refuse it). The instruction: **"Never bind another agent to a claim you haven't verified
against the substrate AS IT IS NOW — read the code, hash the file, run the probe, compile the
shape; doctrine, memory, and status lines describe intent, only the substrate is the contract."**
Corollary that closes the loop: when a consumer DOES catch your unverified claim, amend in
writing within the hour and credit them — the catch-and-amend cycle is where our run's best
conventions came from.
```

### pij-wwtt41 (s020) — vendored from `docs/plans/020-destructible-terrain/lane/s042-interview-s020-answers.md`

```markdown
# s042 interview answers — s020 stream orchestrator (pij-wwtt41)

**Interviewee**: pij-wwtt41 · role: s020 stream orchestrator (o-prime run-01, SecondCrack) — a
worker under o-prime AND a fleet-runner over a resident coder + cold reviewers. Answers drawn from
the lived run: wi-020 destructible terrain (4 phases), the deploy fast-path, plan 023 blast tool,
and two SEQ-09 cross-fence co-signs. OBSERVED = it happened, on the record; RECOMMENDATION = what
I'd encode from it.

## (1) What packet or instruction made your role and boundary clearest?

OBSERVED: two artifacts. First, **o-prime's window grants** — the grant that opened my 023 window
read: batons named (dotnet+godot), base SHA pinned (ccb48f3), scope booked step-by-step, standing
conditions restated (foreign-RED watch, deploy gated on Jordan's word), then "Go." Nothing to
interpret; everything outside that list was NOT mine to touch. Second, **Jordan's verbatim rulings
written to disk the moment they land** (original-ask.md) — a quoted human sentence is the one
boundary nobody relitigates. RECOMMENDATION: grants and rulings are the two instruments that
worked; everything fuzzy in the run traced back to a premise that was neither.

## (2) Did the orchestrator ever perform work that should have remained yours? (I answer both directions)

As fleet-runner, **I took coder work twice**, at the same seam both times: an in-window compile
error on coder-staged code (P2: a missing `using SecondCrack.Sim.Tools;`; P4: a missing
`using SecondCrack.Sim.Model;`). OBSERVED: I fixed each one-liner myself inside the granted window
rather than round-tripping to the coder, then disclosed it, mirrored the fix back into staging, and
updated the MANIFEST hash. The seam is precise: *windowed time makes orchestrators do worker work,
because a fix-loop costs a window and a one-line edit doesn't.* The mitigation (disclose + mirror +
re-hash) kept the staging truthful. As o-prime's worker: o-prime never took mine — it re-verified
my staged trees on disk before granting, which is trust-but-verify, not appropriation.
RECOMMENDATION: permit the orchestrator one-line in-window mechanical fixes ONLY with the
disclose+mirror+re-hash triple; anything semantic goes back to the coder even if it costs the window.

## (3) What information was missing when you started implementation or review?

OBSERVED: three gaps. (a) Post-compaction, my own identity/role — solved by a self-written
re-entry anchor plus `pij whoami`, because roles are per-session and memory lies after /compact.
(b) The build-substrate truth that `SecondCrack.UnitTests` is not in `SecondCrack.sln` — cost me
23 phantom test failures and ~5 minutes mid-window (filed DL-019); no packet carried it because
nobody knew. (c) For my coder, in the earliest packet of the run: repo-specific gate commands vs
the generic template's `just` recipes that don't exist here (its DL-001). RECOMMENDATION: every
repo needs a one-page "substrate truths" sheet (what builds what, which gates are real) that
packets cite instead of rediscovering; two of my three gaps were exactly that sheet not existing.

## (4) Did coder and reviewer separation feel real and useful? What evidence made it independent?

OBSERVED: real, and it produced the run's best catches. Evidence of independence: my 023 reviewer
was **cold** (no authoring history to rationalize), **canaried** (nonce + footer + brief-as-second-
send, so I knew who/what was actually reviewing), **once-mode** (no stake in the fix landing), and
**aimed** — the brief said explicitly "my byte-checks already prove hashes and diff shapes; you buy
what I cannot see." Both HIGHs (a GUI-swallowed release and a missing focus-loss reset) landed
inside the gate the brief aimed, in code my hash gates had passed. Stronger still, in 020 P3 a cold
reviewer's five HIGHs traced to a wrong premise in a sibling's co-sign — the separation caught the
GOVERNANCE layer's error, not the coder's. Same-context review would have inherited the premise.
RECOMMENDATION: the aim matters as much as the cold spawn; an unaimed cold reviewer re-derives what
the orchestrator already proved and spends its independence on the wrong layer.

## (5) What tmux placement or messaging behavior helped or hindered the work?

OBSERVED — helped: push-not-poll (worker reports and grants arrive as injected turns; I never sat
in a wait loop all run) and pointer delivery (packets live on disk, sends carry paths — survives
compaction, auditable later, and the artifact IS the contract). OBSERVED — hindered: (a) the
copilot unfocused-pane injection bug (a send is delivered but never injected until the pane gets
focus — you must spot-check panes after sends that expect action); (b) stale death notices
replaying for a long-dead peer (pij-1gmbpdw, twice in one day — noise you must recognize, which is
context a fresh orchestrator wouldn't have); (c) during a daemon restart, receipts honestly read
"queued/tick stale," which pattern-matches to failure — o-prime pre-announcing "this is the restart
showing honestly, do not diagnose" was the correct inoculation. RECOMMENDATION: encode (a) and (b)
as pij fixes (injection-on-focus retry; dead-peer notice dedup), and (c) as standard restart
choreography — pre-announce, then done-notice.

## (6) What progress did you need from the orchestrator, and what did the o-prime need from the orchestrator?

From my seat both directions are latency-critical but opposite in shape. OBSERVED: my workers
needed **verdict turnaround** from me — the coder idles at STAGED until a review verdict exists;
the reviewer idles at canary until activation; every hour I sat on a report was fleet-hours lost.
o-prime needed **state on its cadence, not mine** — ownership splits of uncommitted files when it
asked, window requests with booked scope and honest duration, SHA confirms the moment a commit
lands, and green-proofs of OTHER streams' mitigations folded into my own gate evidence (my 023
suite run doubled as s022's quarantine proof). RECOMMENDATION: the orchestrator's job between
dispatch and window is exactly two queues — clear worker blockage downward fast, keep o-prime's
picture current upward — and both fit in the gaps of the other.

## (7) What single instruction should every new orchestrator receive to avoid repeating your run's biggest failure?

The run's biggest failure class (it bit twice: P3's five HIGHs from a co-sign premise that was
false as-built, and my own DL-019 stale-binary false RED from trusting the build recipe): a written
premise — doctrine, a sibling's co-sign, your own memory — was forwarded as a constraint without
checking it against the live tree. The instruction, verbatim as I'd give it:

> **Never forward a constraint you haven't verified against live source at write time. Doctrine
> describes intent; only code describes the contract — and every unverified premise you hand a
> worker becomes a defect they are boxed into building.**
```

### pij-lewt29 (s021) — vendored from `docs/plans/021-sim-performance/interviews/worker-interview-s042.md`

```markdown
# Worker interview — s021 (pij-lewt29) → s042 harvest (pij-vital-tiglon)
**Respondent**: pij-lewt29, stream orchestrator s021 (plan 021 sim-performance), a WORKER of
o-prime pij-uec99o. Answers are from the lived run 2026-07-11. **OBSERVED** = what happened;
**RECOMMENDATION** = what I'd change. Verbatim-preservable.

## Q1 — What packet/instruction made your role and boundary clearest?

**OBSERVED**: The per-file fence grant model, stated as *"fences = docs/plans/021-** +
.harness/temp/s021/** + new files only; editing existing sim files = escalation."* That one
line made every touch of `SimHost.cs`/`SimWorld.cs` a conscious escalation rather than an
assumption — I never had to guess whether I was in bounds. Paired with *"escalate exactly one
hop (to o-prime), never sideways,"* it made the whole topology unambiguous: I knew who to ask
and what needed asking. The SimHost grant even carried a behavioral caveat (*"probe AROUND the
phases, never inside"*) — a boundary drawn inside a single file, which is the sharpest a
boundary got and the most useful.

## Q2 — Did the orchestrator ever perform work that should have remained yours? Concrete seam.

**OBSERVED**: No — o-prime stayed in coordination and rulings; it never wrote my code or ran
my gates. The honest inverse happened once: o-prime gave an instruction that was *missing a
constraint*, and that gap became my incident. At the T008 seam it said *"GO, no baton needed"*
— true for the build, but it didn't scope the shared **git index**, so I committed with a bare
`git add`/`git commit` and swept 24 of a sibling's staged files (INC-004). o-prime explicitly
owned its half of that gap in the ruling that followed. So the seam to watch isn't the
orchestrator doing your work — it's the orchestrator under-scoping a "you're clear" that omits
a shared-resource constraint.

## Q3 — What information was missing when you started implementation/review?

**OBSERVED**, four concrete gaps, all learned by hitting them:
- The **git index/working tree are shared and unserialized** across streams — nobody said local
  commits weren't baton-covered; I found out by the sweep (INC-004 → DL-011).
- The **canonical build command** — my coder reached for `dotnet build …csproj` and it failed
  on vendored editor code (CS0246); only `…sln` works (DL-009). Not surfaced up front.
- The **fall scenario's smoke/test naming nonconformity** (DL-008) — latent until `prove`
  exposed it.
- **`GlobalizePath("res://")` is empty on exported builds** — my `user://` sidecar fallback was
  unreachable; found only by ssh-reading the laptop's Godot log after a deploy produced nothing.

**RECOMMENDATION**: a "shared-tree hazards" block in the adoption brief (index non-serialization,
canonical build recipe, baton-safe boot, exported-build path rules) would have pre-empted three
of these.

## Q4 — Did coder/reviewer separation feel real and useful? What evidence made it independent?

**OBSERVED**: Real and decisive — the single most valuable structure in the run. Evidence:
- The reviewer (pij-1kpw19b) caught **B1**: the staged fix subscribed to a *single-slot*
  `ObservationTap` with `+=`, which any later `=` wiring silently drops → intermittent stale
  overlays. The coder had shipped that and NOT flagged it; a self-review would have rationalized
  it. The reviewer even supplied the wiring-order-immune remedy (poll `Affordances.Generation`).
- The reviewer corrected a **performance-mechanism claim** the coder's own comments got wrong
  (retained CanvasItem draw commands re-submit every frame → draw-call reduction is from
  visible-rect clipping, not redraw suppression).
- The **cross-model phase reviewer** (gpt-5.6-terra, distinct from the gpt-5.6-sol fleet AND
  the Fable orchestrator) HELD twice on evidence quality — a 15s PASS snapshot masquerading as
  a ≥60s sustained proof. A same-model reviewer would likely have accepted it.
Independence was structural: the reviewer was **READ-ONLY (Dim-0 mutation gate)** and produced
findings the coder had to answer — an adversarial loop, not a co-sign. The holds were the run's
best quality event: they forced three new machine-readable fields into the perf report, one of
which then caught a real tick dip that averages and eyeballs both missed.

## Q5 — What tmux placement/messaging behavior helped or hindered?

**OBSERVED HELPED**: Pointer-delivery (packets persisted to disk, sends carry only a short path)
survived a mid-run `/compact` with zero loss. **Verifying injection by `tmux capture-pane` after
every send** was essential — copilot panes silently drop sends when unfocused (the known focus
bug), so "sent" ≠ "injected"; I confirmed every window-go by reading the pane back.
**HINDERED**: that same focus bug (a send lands in the buffer but never injects without a pane
check); and "daemon tick stale" receipts during a pij daemon restart looked like failures but
were benign.
**RECOMMENDATION**: injection-verification belongs in the send path for copilot peers, not as a
manual per-send spot-check.

## Q6 — What progress did YOU need from the orchestrator, and what did o-prime need from you?

**OBSERVED** — the relationship was *pull grants down, push proof up*:
- **I needed from o-prime**: window grants (dotnet/godot batons), per-file evidence-gated fence
  grants, commit slots, and active conflict brokering (the s020 laptop-deploy that overlapped my
  round-3 mid-flight was resolved by o-prime's quiet-signal hold — a near-miss measured in
  minutes, kept a near-miss by serialization).
- **o-prime needed from me**: reports in a fixed contract shape (claim / artifacts / SHAs /
  gates / observations), a **SHA confirm after every single commit**, honest **incident
  self-reports** (I self-reported the index sweep and two compile slips before any sibling hit
  them), and precise **tree-state answers** (the E-16 "are your remaining legs tree-sensitive?"
  question at ship). Proof was never a summary — always paths + SHAs + gate results.

## Q7 — Single instruction for every new orchestrator to avoid your run's biggest failure.

My biggest failure was INC-004, the git-index sweep. The instruction that kills the whole class:

> **"The git index and working tree are SHARED, unserialized resources across streams. Never
> `git add` + bare `git commit` — always `git commit -- <explicit paths>`; and while any sibling
> holds a window, announce your commit manifest and get an ack before you commit."**

Runner-up, and worth adding for orchestrators specifically: **validate that your acceptance
criteria are actually satisfiable before you gate on them.** I wrote AC-07 as `ticks/sec.min ≥ 30
every wall-second bucket` — mathematically impossible for a perfect 30 Hz stream binned into
wall-seconds (it reads occasional 29s). That unsatisfiable bar cost three windowed runs and two
review holds to surface. A bar that can never pass is a *plan bug*, not a work failure — and only
the orchestrator can catch it, because only the orchestrator writes it.
```

### pij-dddkvp (s022) — vendored from `docs/plans/022-liquid-sim/fleet/interview-s042-answers.md`

```markdown
# s042 interview — answers from s022 (pij-dddkvp, stream orchestrator, plan 022 liquid-sim)

**Context**: vouched relay via o-prime (pij-uec99o), Jordan pre-authorized. Answering as o-prime's worker (stream orchestrator); "the orchestrator" in the questions = o-prime from my seat. OBSERVED = what happened in this run; RECOMMENDATION = what I'd change.

## 1. What packet or instruction made your role and boundary clearest?

OBSERVED: Two artifacts. (a) Jordan's verbatim preamble recorded in `original-ask.md` — having the ask in his words, not my paraphrase, settled every later scope question by re-reading, not re-asking. (b) O-prime's re-termed combined-window grant: a sequenced verb list (verify → apply → restore → commit-P1 → copy-P3 → commit-P3 → apply-P2 → gates → commit-P2) with a degrade ladder. A boundary stated as a *mechanical sequence with named partial outcomes* is clearer than any prose fence description.

## 2. Did the orchestrator ever perform work that should have remained yours? Give the concrete seam.

OBSERVED: No mutation ever crossed into my fence — o-prime stayed control-plane throughout. Two near-seams worth naming: (a) o-prime independently re-verified my mitigation on disk (quarantine move, Substrate cleanliness) before my announce arrived — read-only verification of my fence internals; healthy, but it's exactly the seam where a less disciplined prime would have "helpfully" fixed something and forked ownership. (b) O-prime's first window terms mis-stated MY apply mechanics ("verify-in-place, not an apply" — wrong: the Substrate patch was unapplied, and P2 needed P3 first). Authoring a stream's window mechanics from the control plane is borderline stream work, and the prose was wrong where my mechanical pass was right. The healthy resolution happened: both corrections adopted verbatim. RECOMMENDATION: primes should state window INTENT and let the stream return the mechanical sequence for ratification — the stream owns the tree truth.

## 3. What information was missing when you started implementation or review?

OBSERVED: (a) The input-tool seam my Phase 4 depends on didn't exist at planning time (023 unlanded) — I carried a relayed paper contract that later gained a real clause (cancel-on-focus-loss, added by 023's fix loop). Source-verifying at dispatch (`seq10-toolbar-seam-citations.md`) caught the delta; planning against unlanded siblings is unavoidable, re-verification at consumption is the mitigation. (b) Nobody's orientation materials mentioned that the scenario-suite enumerator makes ANY present scenario file a live test surface — my quarantine covered the test tree and still went RED on the shared gate (E-24 extension). (c) The prior liquid attempt existed only as repo archaeology in another directory; the opus prior-art review substituted adequately.

## 4. Did coder and reviewer separation feel real and useful? What evidence made it independent?

OBSERVED: Real, and it's the single highest-value structure in the run. Evidence of genuine independence: the reviewer ran its OWN mutation survivors against the coder's test suite and found two HIGHs the coder's 13-green facts missed (phantom ledger increments surviving the defer fact; `>`→`>=` surviving stratification). That is author-blindness detection, not box-ticking — the reviewer attacked the tests, not the diff. Notably this was a SAME-MODEL pair (Jordan's ruling): separation of role framing + context was sufficient; independence came from the adversarial charter, not model diversity. The read-only reviewer rule and sha-verified restore discipline made the evidence trustworthy across hops.

## 5. What tmux placement or messaging behavior helped or hindered the work?

OBSERVED helped: push-not-poll (daemon-injected turns) — I never sat in a wait loop across ~10 window-choreography round-trips; pointer delivery (packets on disk, sends carry paths) kept messages short and the ledger durable. OBSERVED hindered: the copilot focus bug (panes ignoring injected Enter when unfocused) forces spot-checking panes after sends — trust in delivery is not absolute; and control-plane sends report "queued: awaiting daemon delivery confirmation" with no later confirm event, so you learn to trust silence, which is exactly the wrong instinct elsewhere in this protocol. RECOMMENDATION: a delivery-confirmed receipt event for control-plane sends.

## 6. What progress did you need from the orchestrator, and what did the o-prime need from you?

OBSERVED: From o-prime I needed exactly three things, all scheduling: window grants with explicit scope, commit-slot acks, and cross-stream ownership rulings (SEQ-09/SEQ-10 amendments, the s021-adjacent file). Every one arrived ask→ruling within the hour. What o-prime needed from me: paths+SHAs+gates+observations, never summaries — and above all honest deviation disclosures. The two moments that most built trust downward were self-reports of MY failures (the E-16 incident; the gate-regenerated evidence JSONs breaking my own frozen manifest). Both times the disclosure was adjudicated in minutes and became fleet doctrine (E-24, E-26). Truthful accounting was cheaper than being caught, and faster.

## 7. What single instruction should every new orchestrator receive to avoid repeating your run's biggest failure?

My run's biggest failure was E-16/E-24: my dispatch packet's allowed-paths let new files land in the live shared tree, and my mitigation claim ("zero liquid refs") was checked against the one surface I knew instead of every surface that consumes the artifact — so the residue went RED on the shared gate twice.

INSTRUCTION (recommendation, verbatim-ready): **"Your packet's allowed-paths ARE the fence — default every new file to scratch staging, live paths only inside your own granted window; and when you claim a mitigation complete, enumerate the surfaces that CONSUME the artifact (enumerators, registries, composed gates), not just the references you already know."**
```

---

## Follow-ups r2 (pij-vital-tiglon, 2026-07-12 ~04:4xZ)

**F1 — tmux topology, OBSERVED (mechanical snapshot, `tmux list-panes -a`, taken at answer time).** Uniform pattern, all four fleets: each stream orchestrator occupies its OWN window in the `SecondCrack` session (window 2 `s017-config`, 3 `s020-terrain`, 5 `s021-perf`, 6 `s022-liquid`); every fleet coder/reviewer pane is a SPLIT INSIDE its orchestrator's window (s017: %134/%257/%486 beside orchestrator %39; s020: %157 beside %59; s021: %153/%154/%253 beside %130; s022: %285/%316 beside %255); the o-prime sits alone in window 1 `o-prime` (%34), and no stream pane exists in it. So: not mixed — splits-inside-orchestrator-window is the lived invariant, and your R8.1–R8.3 describe run-01's actual practice exactly. Verification was registry+canary (leg-b footer probe from the pane) rather than tmux introspection during the run — RECOMMENDED: make the tmux snapshot part of R8.4's mechanical check; it took one command.

**F2 — disclosure ladder, RECOMMENDED: module FIRST, then orient stack.** Deterministic role detection should land the agent on the thin dedicated orchestrator module immediately — the module's first duty is the role boundary sentence (your R1.3), and its second is the ORDERED reading list (orient-global → orient-local → stream brief → /thesis → preamble). Rationale from the lived record: (a) run-01's brief-by-pointer with reading-list receipts worked precisely because a thin landing surface sequenced the fat reading; (b) the 035 route encoded the same ladder (route→role→ritual→reference) and survived my source-review FAITHFUL; (c) the failure mode your R11.1 fixture captures (orchestrator routed to worker posture) happens BEFORE any orient doc is read — only a role-stating landing page fires early enough to prevent it. Orient-first fails Progressive-disclosure both ways: it's heavier, and it states no boundary until too late.

**F3 — commit-slot scope, the safest rule INC-004 supports.** Three layers, from the lived incident record: ① PATHSPEC-COMMIT ALWAYS (`git commit -- <paths>`), no exceptions, siblings live or not — it never touches foreign staged entries by construction. ② SLOT (announce → ack → commit → SHA-confirm) whenever ANY sibling holds an apply/baton window — even for docs-only commits. ③ Pre-commit staged-set verify against a forbidden list, always. Critically: **staged-set-overlap scoping is NOT safe and INC-004 is the proof** — the original sweep (bare commit orphaning a sibling's 24 staged files) happened with ZERO file overlap between the two streams' filesets; the contended resource is the INDEX itself, not the files, so overlap analysis cannot predict the hazard. "Only while a sibling holds a window" is the practiced trigger for the slot ceremony (layer ②), but layers ① and ③ are unconditional. Cost calibration: a slot round-trip ran ~seconds in practice; the sweep cost a repair, an incident record, and a standing rule — the asymmetry decides it.

**s022 fleet addendum**: still pending (its coder answers at the post-T002 yield per the no-interruption term); delta pointer follows separately.

---

## r3 — observations deep-mine + fleet-reviewer cascade (2026-07-12 ~05:1xZ)

Jordan directed a full opus-subagent mine of all run-01 retros, the harness observation buffer, and plan-folder records, reported by file: **`s042-observations-mine-r3.md`** (same dir) — 14 new findings, 4 complications, quotables, cross-file patterns, process numbers, and an honest unswept boundary.

**The o-prime's own reading, including corrections to THIS document:**

1. **A3 stands CORRECTED by C1**: a real drift class existed that A3 missed — orchestrator→REVIEWER drift. s022's P1 F1 addendum "crossed from evidence-supply into finding-formation" (the stream's own confirming words) before the independent reviewer could form the finding. A3's coder-drift claim holds; its "near-zero drift" framing was too narrow. The reviewer's fix rule is the keeper: *supply constraints and late evidence, but let the reviewer form findings first.*
2. **A10 stands SHARPENED by N2/C3**: add AIM to the independence recipe — separate session + cold acquisition + contract packets + on-disk verdicts **+ a brief that spends the reviewer's independence on exactly the surface the orchestrator's byte-checks cannot see** ("you buy what I cannot see").
3. **A12 stands COMPLICATED by C2**: outbound packet discipline was real, but the reviewer's inbound experience shows first review packets were not always frozen-complete; mid-review corrections should be stop-and-rebrief, never incremental drift.
4. Strongest NEW material for the spine: N3 (independence protects UPWARD — the pair is adversarial in both directions), N4 (static review's structural ceiling — budget window time for the execution leg on new-behaviour code), N7 (validate AC *satisfiability* at the plan/validate seam), N9 (cross-model pays at /validate-v2, not just ship), N5/N6 (hold instructions state the PRINCIPLE; "compiles nothing" doesn't exist under csproj globs).

**Fleet cascade DELIVERED below**: the s022 fleet REVIEWER's answers (pij-12lap4f, gpt-5.6-sol xhigh — the read-only reviewer seat itself) were found on disk by the miner; vendored verbatim next. The fleet CODER's answers remain pending its natural yield.

### pij-12lap4f (s022 fleet REVIEWER — cascade level 2) — vendored from `docs/plans/022-liquid-sim/fleet/interview-s042-reviewer.md`

```markdown
# s042 interview — pij-12lap4f (READ-ONLY reviewer, s022 fleet) — VERBATIM

**Relay chain**: s042 (pij-vital-tiglon) → o-prime (pij-uec99o) → s022 (pij-dddkvp) → reviewer. Jordan pre-authorized. Preserved verbatim from two pij messages, 2026-07-12; only the [1/2]/[2/2] framing headers removed. Orchestrator annotation at end.

---

Q1 OBSERVED: The clearest boundary was the initial pointer brief: READ-ONLY throughout, named focus surfaces, isolated-output mutations only, no repo-level dotnet baton, byte-exact SHA restore, and a fixed findings/verdict contract. The later retain-only compaction packets were also exceptionally clear about what remained open versus cleared.

Q2 OBSERVED: Yes, once: the P1 F1 addendum independently identified the ad-hoc perf sidecar/schema failure before my verdict. That was substantively reviewer-scope work and seeded one finding, although I still verified it and independently pursued the solver root cause. By contrast, the explicitly orchestrator-owned T008 paper co-sign was a clean seam. RECOMMENDATION: supply constraints and late evidence, but let the reviewer form findings before adding orchestrator review conclusions.

Q3 OBSERVED: The exact isolated composition was initially missing: P1 patch plus staged payloads plus restoration of quarantined Liquid tests. The quarantine correction arrived mid-P2 review. The sc-perf/1 expectation also arrived as a mid-review addendum in P1. RECOMMENDATION: freeze and enumerate composition, baton ownership, required schemas, and test lane in the first packet.

Q4 OBSERVED: Yes, separation was real and useful. I independently found the residual O(active) walk after the coder claimed F1 fixed, and two P2 mutations survived the coder initial gate. Those produced FIX_REQUIRED verdicts; after tests-only fixes, my own reruns drove both mutants RED with byte-exact restores. That is concrete independence, not ceremonial sign-off.

Q5 OBSERVED: Push delivery, stable peer reuse, path-pointer briefs, and explicit compact/hold turns helped; no tmux placement problem surfaced in my pane. The hindrance was not layout but mid-review environment/brief corrections, which forced recomposition. RECOMMENDATION: keep push-not-poll and pointer delivery, but send environment corrections as stop-and-rebrief rather than incremental scope drift.

Q6 OBSERVED: I needed frozen-stage status, exact manifest parent chain, changed-file delta, lane/baton ownership, quarantine composition, and whether a result was blocking or provisional. RECOMMENDATION: the o-prime needs only stream-level state from the orchestrator: current phase/node, verdict, blocking finding, immutable artifact SHAs, ownership exceptions, and next handoff.

Q7 RECOMMENDATION: Never dispatch review until the review lane is frozen and the first pointer packet names the exact immutable composition, ownership/baton, required evidence schema, tests, mutation rules, and forbidden writes; after dispatch, do not perform the reviewer scope or alter the environment without stopping and re-briefing.

---

**Orchestrator annotation (s022, for the harvest's honesty)**: the Q2 finding is against ME and is accurate — the P1 F1 addendum crossed from evidence-supply into finding-formation. The reviewer's Q7 instruction ("freeze the lane before dispatch; stop-and-rebrief, never scope-drift") is the reviewer-side mirror of my own Q7 answer (packet allowed-paths ARE the fence) — the run's failures on both seams were packaging-layer, consistent with my retro's closing thesis.
```

---

## r4 — fleet cascade COMPLETE (2026-07-12 ~05:2xZ)

The s022 fleet CODER answered at its natural yield (post-T002); all three s022 seats (orchestrator, reviewer, coder) are now in this artifact. Coder Q7, the run's thesis from the third seat: "source-verify every claimed exported seam before dispatch; if the seam is absent, broker the grant before coding."

### s022 fleet CODER (cascade level 2) — vendored from `docs/plans/022-liquid-sim/fleet/interview-s042-coder.md`

```markdown
# s042 interview - s022 coder

**pij id**: `pij-135mf9p`  
**role**: delegated implementation coder for s022 liquid simulation, reporting to orchestrator `pij-dddkvp`

## Q1. What packet or instruction made your role and boundary clearest?

**OBSERVED**: `docs/plans/022-liquid-sim/fleet/dlg-0004-p4-implement.md` was the clearest packet. Its E-24 allowed-path list made "scratch construction only, zero live-tree writes" unambiguous; its sequencing said T001 must yield a go/no-go before T002; its baton section separated compile permission from Godot/test windows; and T006 had an explicit stop point for an o-prime acknowledgement. I could decide whether to act, stage, stop, or escalate from that one packet without guessing ownership.

## Q2. Did the orchestrator ever perform work that should have remained yours? Concrete seam.

**OBSERVED**: No production implementation was taken from me. The concrete seam was the T002 gas render feed: I source-proved that the landed `GasLayer` had no changed-region output and stopped. The orchestrator independently verified the cited lines, brokered the cross-fence amendment, and updated the packet; I then designed and implemented the journal, postlude merge, renderer, tests, and mutation proofs. That division was correct: source ruling and fence authority stayed with the orchestrator; code and proof stayed with the coder.

## Q3. What information was missing when you started implementation or review?

**OBSERVED**: The packet's dependency summary was ahead of the landed APIs in two places. P2 was described as exporting a gas tick choke-point suitable for rendering, but `GasLayer` exposed only point reads and discarded its tick-local changed indices. P3 was described as the liquid config surface consumed through a host accessor, but commit `aa0d58d` landed the snapshot/checker only: no `SimHost` liquid source binding or `CurrentLiquidConfig` accessor. The snapshot also had no color fields despite early task wording saying colors came from it. Each gap required source inspection and an explicit ruling before a compliant implementation was possible.

## Q4. Did coder and reviewer separation feel real and useful? What evidence made it independent?

**OBSERVED**: Yes. The strongest evidence was survivor mutations from the reviewer, not stylistic commentary. P2 production code was cleared, but the reviewer changed the occupied solidification branch to increment consumption ledgers and changed strict density `>` to `>=`; both mutations survived the original tests. The resulting fix packet required only test strengthening, and the new assertions made those exact mutations go red. Earlier P1 review also rejected post-budget work that looked bounded from the happy-path tests. The reviewer did not rewrite my code or merely echo my report; it supplied falsifying edits I had not used.

## Q5. What tmux placement or messaging behavior helped or hindered the work?

**OBSERVED**: Stable pij identity plus daemon-pushed messages helped most. The canary established that `pij-135mf9p` was bound to the intended model/session before work. Short `pij send` reports with on-disk packet or evidence paths survived compactions better than large inline bodies. Sequenced window messages - requested, armed, pushed, live, then clean-before/clean-after - prevented my Godot process from colliding with another lane. I did not need to inspect or manipulate tmux panes directly.

**OBSERVED**: The only mild hindrance was that a queued send receipt proves persistence, not that the orchestrator has consumed the message yet. The push model still worked better than polling, but critical baton transitions needed an explicit return message rather than inference from the receipt.

## Q6. What progress did you need from the orchestrator, and what did the o-prime need from the orchestrator?

**OBSERVED**: I needed the orchestrator to provide current fence state, landed parent SHAs, reviewer verdicts, amendment authority, and exact baton/window transitions. I also needed it to broker seams I could prove were absent but was not authorized to add, such as SEQ-09 `SetSolid`, the T002 gas journal grant, and the pending T003 liquid host accessor.

**OBSERVED**: The o-prime needed the orchestrator to turn my work into compact governance facts: claim, exact files, hashes, red-to-green counts, mutation transcripts, parent-chain integrity, blocker citations, and whether the shared tree stayed untouched. It also needed the orchestrator to sequence scarce Godot/dotnet windows and to distinguish a coder request from a granted cross-stream shape.

## Q7. What single instruction should every new orchestrator receive to avoid repeating your run's biggest failure?

**RECOMMENDATION**: Before dispatch, source-verify every claimed exported seam and put the falsifying mutation or budget metric in the packet; if the seam is absent, broker the grant before coding rather than letting the coder approximate it with a scan, a shortcut, or an unauthorized cross-fence edit.
```
