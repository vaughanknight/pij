# Encode candidates — run-01 aggregation
**Writer**: the o-prime (pij-uec99o). The single place skill-authoring/harvest reads.
Each entry: what recurs → the proposed encoding → provenance. Status: OPEN unless marked.

## For the o-prime skill / protocol (the first-class concept)

| # | Lesson (proven in run 01) | Proposed encoding | Provenance |
|---|---|---|---|
| E-01 | Canary evidence must be written at pass time, not recalled later | Skill step: write canary record before brief delivery | OL-009; runbook §8 |
| E-02 | Spine row-first sync; stale roster misleads all readers | Skill rule: row updates BEFORE prose on every event | OL-010/031 |
| E-03 | Dissolved ordinals must be tombstoned, never recycled | Allocation rule in skill | P-018 |
| E-04 | Structure tree in every brief + tree-push on roster change provokes fence hygiene | Already protocol step 3; keep in skill | P-019 |
| E-05 | Preamble is a first-class lifecycle stage (adopt→orient→preamble→work); assignments provisional until it | Already protocol step 5 + orient lever; keep | P-014; Jordan rulings |
| E-06 | Fence-vs-manifest diff at plan validation, both directions | Runbook §15 → skill checklist | OL-032; F6 |
| E-07 | Adoption (governing a peer you didn't spawn) needs its own variant: canary matters more, no-parent row, expect human preamble | Runbook §16 → skill | vsa9qj/wwtt41/lewt29 |
| E-08 | A subagent-relayed ruling binds NOTHING until the pane's owning layer or the human confirms | Protocol rule; the o-prime itself failed this once | DL-002 arc, 03:38Z |
| E-09 | Claimed verification is itself a claim — verify-every-green includes subagent completion messages | orient-global rule 5 (encoded); lift to protocol | DL-001 |
| E-10 | Rulings must land in durable committable space (plan folder), never scratch-only | Preamble-report verification question in skill | s021 correction, 04:27Z |
| E-11 | Plan-freeze+hash when a validator's target mutates mid-read | Validation protocol template | WIN-005 |
| E-12 | Cold readers auditing warm state is the strongest error-correction (overseer→prime, stream→government, adoptee→baton book) | Skill: schedule fresh-eyes audits at adoption + checkpoint | SC-001..004; wwtt41 baton catch |
| E-13 | Author-teaches-consumer beats doc-first (early dogfood via direct pairing, checklist formalizes after) | Skill sequencing pattern (with never-sideways waiver shape) | Jordan 04:45Z |
| E-14 | Workshop-before-flow-creation is legitimate; record workshops as pre-existing input at flow create | builder-integration note | s020 preamble |
| E-16 | **The shared tree must COMPILE at every yield point — direction-neutral** (proven both ways in one hour: s017's orphan test broke s021's measurement window; s021's PerfRecorder CS0023 broke s017's export window). Rules: author anything uncompilable in SCRATCH, move in-tree only when it builds; a stop/yield checklist verifies compilation; the non-owner NEVER fixes the sibling's file (both coders correctly refused) — the o-prime routes an urgent owner-fix instead | stream stop/yield ritual + worker instruction template + "urgent owner-fix" escalation path in the skill | SEQ-06 collision 05:07Z + mirror 05:23Z |
| E-18 | **A human-go in one pane can be mid-execution before governance sees it** (R14 go → coder mid-protocol → o-prime's hold arrived after the patch/legs ran inside a sibling's window). Not an authority conflict — an ORDERING gap. Convention needed: a human-go defaults to "after the o-prime clears the deconfliction" unless the human says NOW-regardless; and streams cc the o-prime BEFORE first execution under any direct go. Damage control that worked: full-stop + honest verbatim delta + quarantine-contended-measurements + surgical snapshot exclusion | orient-global rule + route ritual for direct-go handling | INC-002, SEQ-08 05:36–38Z |
| E-17 | **Convergence needs a mechanical coverage map**: author + reviewer both declared a requirements transfer "converged" while 5/16 seed-ledger entries were unmapped; an independent cold critic caught it in one pass. Rule: a convergence checklist must include "every seed-ledger entry → requirement id or named exclusion" as a CHECKABLE row, never left to author confidence | skill convergence ritual + validate-v2 usage note | 035 spine validation 05:32Z |
| E-19 | Diff-snapshot procedures are blind to untracked files (plain git-diff omitted s017's T203 files; restore-via-checkout impossible for untracked) — snapshot steps need explicit untracked handling + a filesChanged cross-check against the worker report; separately, E-16 extends to COMMITS as the strongest yield points: a commit's transitive type closure must compile at checkout (s017's phase commit would have shipped CS0246 without s021's closure committed first) | flow-pair snapshot step + commit-choreography rule for interleaved grants | s017 reviewer Phase A findings + SEQ-07 closure ruling, 06:19–06:23Z |
| E-15 | A pij id names a SEAT, not a persona — when multiple personas share a pane (orchestrator + subagent), sends must be role-addressed and replies must declare which role speaks; a stood-down persona refusing an instruction addressed to another role is correct behavior | protocol rule + pij send convention | s020 go-signal hold, 04:49Z |

## For pij (tooling)

| # | Gap | Proposed encoding | Provenance |
|---|---|---|---|
| P-01 | Dissolved/retired lifecycle indistinguishable from crashed; close resurrected by queued events | `dissolved` state + close-idempotency across queue drain | s019 teardown; OL-019/P-010 |
| P-02 | Spawn inherits ambient model/effort non-deterministically (effort drifted medium→high same day) | spawn pins + reports model/effort; canary prints both | P-020 + overseer corroboration |
| P-03 | "queued" receipts can't distinguish busy peer from wedged daemon (INC-001 masked for 20 min) | delivery-health in send receipts; daemon tick heartbeat | INC-001 |
| P-04 | Stale descriptor of a dead pane head-of-line-blocked ALL delivery | (patched by pij-rtxerq same-day: non-throwing sends, per-session tick isolation) — verify patch shipped | INC-001, ENCODED upstream |
| P-05 | Mid-turn send interleaving ("stepped on") at 2+ layers | typing-aware send buffering | P-006/P-012, recurring |
| P-06 | `--command compact` to copilot peer queued but never executed; text sends fine | control-command path needs focus-retry + executed receipts | s017 DL-006 |
| P-07 | Baton as convention worked but breach was traceable only via self-report | `pij baton request/return/reclaim` (registry-backed lease) with the book as evidence layer on top | breach 04:29Z; 6 cycles |
| P-08 | **Mid-turn injection reaches whatever context is RUNNING** — a seat running a long subagent delivers sends INTO the subagent (2h12m research task absorbed the orchestrator's go-signals; refusal loop followed; seat effectively deaf in role) | pij: deliver-to-seat semantics (queue until the top-level turn owns the pane) or at minimum tag injections with target-role; sender-visible "delivered INTO subagent turn" receipts | s020 go-signal arc 04:48–04:55Z |

## For the harness (this repo, generalizable)

| # | Gap | Proposed encoding | Provenance |
|---|---|---|---|
| H-01 | `harness observe` default bucket = agent, not stream | spawn-env default (HARNESS_AGENT) | s020 SUGG-001 + s017 double-confirm |
| H-02 | `harness boot` runs the dotnet gate — baton territory with no opt-out | `--no-gates` / no-dotnet boot mode | s021 breach |
| H-03 | Perf numbers measured then DROPPED on green (prove ladder) | persist perf envelope with scenario results; environment+config recorded with numbers | s021 dossier F-09/H-01 |
| H-04 | flow-pair observe diffs repo-wide, fails on unrelated dirt | scope to delegation allowlist | s017 DL-005 |
| H-05 | Skills invisible to copilot workers (.claude/skills only) | expose via .agents/skills | s017 SUGG-002 |
| H-06 | Coder self-invoked review mid-packet | worker-implement template: explicit review-prohibition | s017 DL-004 (flow-pair learn-0001) |
| H-07 | gdscript check rung reports exit-code only — a transient exit-100 gave no failing test names, forcing a full isolated rerun to clear it | rung output carries failing test names (or the gdUnit report path) on non-zero exit | s021 DL-010, 06:59Z |
| H-08 | Fleet workers author test facts BLIND against a tree they cannot compile (scratch-staging + baton discipline = no compile lane pre-window) — s020's P2 window ate a fix round-trip for 3 test-side bugs that a pre-baton compile would have caught | a scratch-solution compile lane for staged test authoring. **Doctrine RULED 07:28Z**: the dotnet baton serializes the shared build surface (obj/bin locks + timing purity), NOT all dotnet CPU — an isolated-output lane (shadow project, obj/bin under .harness/temp/<stream>/, --no-restore, compile-only) falls outside the baton, conditioned on glob-isolation + barred during any sibling's declared quiet window | s020 P2 window CONF-001/DL-001, 07:21Z; ruling 07:28Z |
| E-20 | Scenario map-char legend is tribal knowledge — a fleet coder read '###' as bedrock when it is dirt ('X' is bedrock), authoring a wrong-expectation fact | legend table in the scenario authoring reference (or emitted by the scenario extension itself) | s020 P2 window, 07:21Z |
| E-22 | **The shared git INDEX is an unserialized resource — local commits are not baton-covered** (INC-004): a bare `git commit` during a sibling's apply window swept 24 of its staged files into the committer's commit; caught from the stat + repaired in seconds (soft-reset preserving the victim's index, path-limited recommit) ONLY because the committer read its own stat. Also: the o-prime's "no baton needed" authorization scoped builds but not commit timing | (a) pathspec-mandatory commits as protocol; (b) lightweight commit-slot (announce→ack→commit→confirm) while any apply window is live; (c) baton doctrine names the index/HEAD as a serialized surface distinct from build locks | INC-004 08:12Z, s021 self-report DL-011; both ruled standing 08:13Z |
| E-21 | **Binding-shape claims must be SOURCE-VERIFIED at write time — doctrine is not the contract.** The E4 co-sign asserted 'the door never changes for a new family' from design intent; the live commit phase was per-family hard-coded. Platform author, consumer stream, AND the o-prime all ratified it; a cold reviewer two hops down was the first to read the actual code. Corollary: an over-tight constraint ('zero edits') forces workarounds WORSE than the edit it forbade (loader side-effect broke atomic-swap/M4/cold-start/notice) | co-sign/checklist templates require a source-read receipt (file:line) per binding claim; verifier duty extends to the PREMISE claims, not just the evidence claims | E4 reopen arc 07:44–07:52Z (rev-0003 5×HIGH; Amendment 1 root-cause ownership) |

## Known open drift (harvest-time jobs)

- docs/how/o-prime.md still describes the pre-collapse overseer/prime split — reconcile when the skill is authored (this ledger + spine rulings are the source).
- The o-prime's numbered upward reports (prime-NNNN) lapsed after the overseer collapsed into this seat — the spine became the ledger. Skill must define where the top layer's evidence goes when there is no layer above.
