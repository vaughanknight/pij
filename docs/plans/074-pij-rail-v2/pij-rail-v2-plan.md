# pij rail v2 — the pij half of the chainglass rail

**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-07-29
**Status**: READY (planning cleared by `pij-wee-albatross`; per-phase code gates below)
**PM**: `pij-unwilling-butterfly` · **Reports to**: `pij-wee-albatross` (o-prime, pij)
**Worktree**: `pij-worktrees/s074-pij-rail-v2` · **Branch**: `s074/pij-rail-v2` · **Base**: main @ `8a63c58`
**Spec source**: unified (this file)

---

## Business Specification

### Research Context

📚 This plan implements the **pij half** of a two-repo feature. It has no research dossier of its
own by design: the design work was done in chainglass and arrived as three Contract Ready
workshops, which this repo reviewed before agreeing to any of it.

| Input | Path | Role |
|---|---|---|
| Source brief | `chainglass/docs/plans/090-pij-rail-v2/albatross-brief.md` | the ask |
| CG plan (§ Joint Contracts) | `chainglass/docs/plans/090-pij-rail-v2/pij-rail-v2-plan.md` | coupling surface |
| Direction + 16-AC owner map | `chainglass/docs/plans/089-first-class-pij/v2-enhancements.md` | AC provenance |
| **JC-1** status event | `chainglass/…/workshops/001-jc1-status-event.md` | **authoritative contract** |
| **JC-2** orchestration role | `chainglass/…/workshops/002-jc2-orchestration-role.md` | **authoritative contract** |
| **JC-3** question text | `chainglass/…/workshops/003-jc3-question-text.md` | **authoritative contract** |
| This repo's contract review | `docs/plans/074-pij-rail-v2/contract-review-001.md` (SHA `36c6860`) | verdicts, amendments A-1…A-6, nine OQ answers |
| PM brief | `government/briefs/s074-pij-rail-v2-brief.md` | allocation, gates, hazards |
| Inherited defect context | `government/handover/2026-07-28-inherited-open-handles.md` §B/B2/B3, A.4 | #35, #68, A.4, interval overshoot |

**Single-source rule**: the three workshops are the contracts. This plan implements them and
never restates them. Where this plan and a workshop disagree, **the workshop wins** — and if the
workshop is wrong, it is amended in chainglass first (that is what gates G-B/G-C below enforce).

### Summary

Chainglass is building a left-rail fleet view that answers *"who is doing what, what's next, and
who needs me"*. It can render none of that today because three facts do not exist in pij's
record: **a PM's now/next**, **whether a seat is a PM at all**, and **what a seat is asking the
human**. CG is coding behind fake seams against contract-exact shapes; nothing on their side
blocks on us, and every item we land lights up in the rail with no CG release coupling.

This plan ships seven items plus two guards the contract review found. The items are individually
small; the plan's real content is **the order**, because three of the seven walk into
silent-failure classes this repo has already paid for — a descriptor denorm that a daemon tick
replays away (incident #1, five times), a scheduler that reads a missing input as *nothing to
report* (the #68 / A.4 shape), and a recovery verb that prints success and writes zero bytes
(#35).

### Goals

1. A PM records now/next in **one call**, and the rail renders it verbatim with an honest age.
2. A seat's orchestration role is **readable from the record**, never inferred from tree position
   — by CG *and* by pij's own watchdog.
3. A seat's question to the human travels as **text**, not just a kind, and stops being true on
   exactly the transitions that end it.
4. The watchdog nudges **PMs and only PMs**, including the PM who has never reported.
5. A prime is told about unadopted seats in its repo and adopts them in one call; **orphans are
   never warned**.
6. The skill routes make the status verb happen **automatically**, not by memory.
7. Every new descriptor field has a **declared owner** before anything writes it.

### Non-Goals

- **No new read surface for CG.** No SSE, no streaming, no new endpoint, no new fence entry. CG
  reads the spine file and the already-allowlisted CLI verbs exactly as today.
- **No change to `Role` / `PIJ_ROLE`,** to prime designation semantics, to `adopt`'s identity
  model, or to badge derivation.
- **No periodic status from workers or the prime.** PM-only, by ruling.
- **No migration/backfill of `orchestrationRole`.** Absence is the designed state (JC-2 D5).
- **No spine rotation.** Answering OQ-2 established the log is permanent; this plan does not
  change that, and the growth note in the review is recorded, not actioned.
- **No composition verb.** Item 6 is skill/doc automation over shipped verbs, not a new wrapper.

### Target Domains

| Domain | Registry | Involvement |
|---|---|---|
| `pij-control-plane` | existing | **modify** — descriptor fields + ownership table, CLI verb tables, `list`/`tree`/`node show` projections, `denormDescriptor`, sweep-adopt notice, #35 |
| `pij-orchestration` | existing | **modify** — `RoleService`, `orchestration role` verb family, `link --role`, `role-set` spine event |
| `pij-messaging` | existing | **modify** — watchdog eligibility + clock + nudge text |
| `pij-skill` | existing | **modify** — skill-route automation (item 6) |
| `session-work-state` | existing | **consume** — semantic-state vocabulary and assignment denorms are read and extended, not redefined |

No new domain. Every change lands in a registered one.

### Testing Strategy

- **Approach**: **TDD, RED-first, on the store/pure layer** — repo pattern P8 (tests target the
  store, not the wiring). Every phase orders its test task before its implementation task.
- **The write-law test is the plan's keystone** and it has a verbatim template already in the
  repo: `core/registry-write.test.ts:40-42` asserts `applyWriteLaw(proposed, disk, "cli")` keeps
  the CLI's value while `"daemon"` restores disk's. Every new owned field gets that pair. This is
  the "cheap experiment" WS-002 proposed, and A-1 makes it mandatory rather than optional.
- **Mock usage**: targeted; existing injected-port seams (P3). No new fakes.
- **Excluded**: rendering assertions (CG's side); real cross-repo integration in CI — the contract
  is the spine line and the JSON row, and both are asserted structurally on this side.
- **Regression locks required before touching shipped behaviour**: `isFireDue` (phase 5),
  `denormDescriptor` (phases 3/4), `adopt` (phase 6).

### Documentation Strategy

- **Location**: no new doc tree. This plan + the three workshops carry the design.
- `docs/how/` gains nothing; **item 6 is the documentation strategy** — the rule goes into the
  skill routes as automation, per the repo's *encode, don't document* doctrine. A paragraph
  telling PMs to run a verb is worth nothing; a route step that runs it is worth everything.
- `docs/difficulties.md` gains the #35 entry's resolution when phase 6 lands.

### Complexity

- **Score**: CS-4 (medium-high) · **Breakdown**: S=2 (nine phases, four surfaces), I=2
  (cross-repo contract, ratified but live), D=1 (chainglass fold), N=0 (no new tech), F=1 (two
  shipped behaviours modified: the scheduler and `adopt`), T=1 (three silent-failure classes).
- **Confidence**: 0.85. The unknowns are not technical; they are the two human-owned decisions
  (verb name, copy) and the fold timing.
- **Dependencies**: chainglass folds A-1/A-2 into WS-001/WS-003 before phases 1/3/4/5 code.
  Nothing on the CG *render* side blocks anything here.
- **Phases**: 10 (three of them parallelisable).

### Acceptance Criteria

Bound to the v2 owner map (`v2-enhancements.md:50-65`); pij-owned rows only, plus four
plan-local criteria this repo's review added.

| # | Criterion (observable) | Source | Phase |
|---|---|---|---|
| AC-01 | Every new descriptor field carries a `DESCRIPTOR_FIELD_OWNER` row, proved by a `applyWriteLaw` pair asserting the CLI's value survives and a `"daemon"` write does not clobber it | A-1 (review) | 1 |
| AC-02 | A seat's role is readable from `list --json`, `tree --json` and `node show --json` as a **total** union `prime\|pm\|worker\|null`, with `prime` winning and a `role-conflict` anomaly raised when both are present | V2-AC-14, JC-2 | 2 |
| AC-03 | `pij <status-verb> "<did>" "<next>" [--state <word>]` records the whole update in **one call**: one spine `status` event, or two events under one write lock in the ruled order `state-set`→`status` correlated by `state-set:<seq>` | V2-AC-10, JC-1 | 3 |
| AC-04 | Over-limit text (>280 status / >200 note) and an unresolvable self are **refused** with a named `E-ARG`/`E-NOID`; nothing is ever silently truncated or attributed to a guessed seat | JC-1 D-4/D-20, JC-3 D4 | 3, 4 |
| AC-05 | A partial platform write is reported honestly in the existing WAS-set framing, naming exactly what landed | JC-1 § Failure semantics | 3 |
| AC-06 | `state set <word> --note "<one line>"` is accepted only for `blocked` and `question`, denorms `stateNote{text,state,at}`, and the note **does not survive** `state clear`, a differing `state set`, or a `task set` | V2-AC-16, JC-3, OPEN-4 | 4 |
| AC-07 | The watchdog nudges a seat **iff** its projected role is exactly `"pm"`; prime and workers are never nudged; an unknown role is silence | V2-AC-13, JC-2 D6 | 5 |
| AC-08 | A PM that has **never** recorded a status is nudged — the clock has a never-null floor anchor and no branch treats a missing status as "nothing due" | A-2 (review) | 5 |
| AC-09 | The nudge text carries the **paste-ready one-call command**, requiring zero syntax recall | V2-AC-13 | 5 |
| AC-10 | `pij adopt` on a dissolved seat either writes the binding it reports, or refuses with a named error and the remediation that actually works — never prints `(pane %N, bound)` having written zero bytes | #35 (blocking, inherited) | 6 |
| AC-11 | When a **prime** runs any pij command and unadopted seats exist in its repo or worktrees, the prime is notified and can adopt + designate in one call. **Orphans are never warned** | V2-AC-12, V2-AC-03 (PIJ half) | 7 |
| AC-12 | The skill routes make a PM run the status verb at start and stop of work without being asked, and make roles get declared at spawn/adopt/link | V2-AC-15 | 9 |
| AC-13 | *(optional)* The daemon persists the interstitial tag on the descriptor and projects it, so a wedged seat is observable to a reader for the first time | V2-AC-16 (D1 tier), item 7 | 10 |
| AC-15 | A type-level lock placed where `tsconfig` cannot compile it is **rejected by a sensor**, and the sensor itself is proved by moving the real historical lock back into an excluded file and watching it go red | plan-local (P1 fix-round friction, proposed by `pij-panicky-caribou`) | 8 |
| AC-14 | No phase leaves `docs/plans/074-pij-rail-v2/` claiming a behaviour that `harness checks` has not proved on the branch, at **zero failures**. The C1 baseline red was closed by phase 6 (`244c78f`); **no phase may claim a baseline exception**, and any red is that phase's own | repo doctrine | all |

### Risks & Assumptions

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | **The ownership row is forgotten on a later field.** The table is a shared 20-line literal and this plan adds five entries to it | high | Phase 1 owns the table **exclusively**; no other phase edits it. Every new field ships with the `applyWriteLaw` pair (AC-01). |
| R-2 | ~~Merge conflicts on shared literals~~ — **DISSOLVED 2026-07-29** (spine 23568) | — | Sequential execution makes 2/3/4 sequential commits on one branch: no rebase, no conflict on `core/cli.ts`'s row literal, verb tables or `denormDescriptor`. The risk is not mitigated, it no longer exists. |
| R-3 | ~~The fold does not land, or lands changed~~ **CLOSED 2026-07-29** | — | G-B passed at spine 23206: A-1 in WS-001 + WS-003, A-2 in WS-001 verbatim, E-26 corrected, resolved OQs recorded. The workshops are the single source and they now carry the amendments. No residual risk. |
| R-4 | **The scheduler change surprises someone.** Keying on `statusAt` removes activity re-anchoring for PMs | medium | Named as its own task (5.2) with its own test, not folded into the targeting change. |
| R-5 | **#35's fix touches the recovery path everyone depends on** | high | Phase 6 is regression-locked first (6.1), and the three live workarounds (leech's symlink, roadrunner's two hardlinks) are **not** cleared by it — #35 ≠ #37/#36b. Explicit non-goal. |
| R-6 | **`npm ci` is broken machine-wide in worktrees** — npm 11.10.0 derives `--before=now-7d` from `min-release-age=7` and its own git-dep child rejects the pair | high | Sanctioned workaround: `rsync -a` node_modules from the canonical checkout (same lockfile, zero registry interaction). **Never bypass the age policy** (#22 ruling). Applies to every additional worktree the fleet creates. |
| R-7 | Jordan's three decisions (verb name, boot-prompt copy, constant collapse) arrive late | low | None block. Verb name is rename-cost-only **provided** the verb is registered once and dispatched from a single table — made an explicit constraint in task 3.2. |

**Assumptions**: the three workshops stay authoritative and are the only place amendments land;
the boot gate baseline is one named pre-existing red (below); CG ships nothing that requires a pij
release to be useful.

**Boot gate at base `8a63c58`** — typecheck green; suite **3633/3634**; **one pre-existing red,
also red on canonical main**: `cli.integration.test.ts > … top-level help and skill guidance
distinguish pull from push delivery`. Named in every gate report; never silently inherited.

### Open Questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| OQ-A | Verb name — `pij status` or `pij now`? Review recommends `pij now` (three status nouns; `pij state <id>` **reads** what `pij status` would **write**) | Jordan | nothing — rename-cost-only under task 3.2's single-registration constraint |
| OQ-B | D1 boot-prompt copy — `"stuck on a startup prompt (<tag>) — open the pane"` vs the current `"asked a question"` (factually wrong: all three tags are startup interstitials, detection is `lifecycle === "pending"`-only) | Jordan | phase 9 only |
| OQ-C | Does `QUESTION_AGED_MS` collapse into `STATUS_STALE_MS`? | Jordan | nothing — both are CG-side constants |
| OQ-D | Does `prime set/retire/unset` grow a spine audit event (Q-11, answered *yes but separate*)? | albatross | nothing — sized into phase 2 as an optional task 2.9 |

### Workshop Opportunities

**None.** Three Contract Ready workshops already exist, were reviewed at
`contract-review-001.md`, and were ratified with two blocking amendments. Re-workshopping in this
repo would create a second source, which the single-source rule forbids.

### Clarifications

Recorded from rulings received, so they are not re-derived:

1. **A-1 scope** (albatross, 2026-07-29): ownership rows land as **one prerequisite change** ahead
   of items 1 and 3 — granted as the review recommended.
2. **Code gates** (albatross): item 2 is clear to code once this plan stands; items 1/3/5 code only
   after cheetah confirms A-1/A-2 folded into the workshops.
3. **A-2 placement** (albatross): the floor anchor lands **inside item 5**, and the scheduler
   behaviour change gets its own named line.
4. **Fleet** (Jordan, via albatross): copilot **gpt-5.6-sol coders, terra reviewers**, via
   `/pij pair`; canary effort **mechanically** — process args are truth, self-reports have lied;
   compaction fire-and-forget.
5. **Orphans are never warned** (Jordan, 2026-07-29) — a seat with no governance is not asked to
   fix its own governance.
6. **Merged is ADOPTED, not VERIFIED.** Nothing here is reported shipped off a merge.
7. **G-B cleared** (albatross, 2026-07-29, spine 23206): cheetah folded A-1 into WS-001 + WS-003
   and A-2 into WS-001 **verbatim**, corrected E-26, and recorded every resolved open question in
   the workshops. Items 1/3/5 are clear to code against the amended docs once G-C passes.
8. **A-4 is chainglass's** (their T007 bounds the `statuses` map). Recorded so this repo does not
   carry a task for it — the finding was ours, the fix is theirs.

---

## Planning Seam

_Refinement opportunities recorded as evidence; none gate._

| Artifact | Present? | Effect on the plan |
|---|---|---|
| research-dossier.md | n | **deliberate** — design arrived as three Contract Ready workshops from chainglass; a dossier here would be a second source |
| workshops/*.md | y (3, in chainglass) | **authoritative**, ratified 2026-07-29 (spine 23195) with amendments A-1/A-2 |
| contract-review-001.md | y | supplies the two blocking amendments, the nine OQ answers, and every phase-ordering constraint |
| government brief | y | allocation, boot gate, bootstrap hazard, #35 gate on item 4 |

---

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|---|---|---|---|
| G1 | Clarify | **PASS** | six rulings recorded under § Clarifications; four open questions, none blocking |
| G2 | Constitution | **N/A** | no `docs/project-rules/constitution.md` (dir holds `harness.md`, `agent-harness.md`) |
| G3 | Architecture | **N/A** | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | **N/A** | no `docs/adr/` |
| G5 | Structure | **PASS** | all required sections present |
| G6 | Testing Alignment | **PASS** | every phase orders its RED test task before implementation |
| G7 | Domain Completeness | **PASS** | 5 domains, all in `docs/domains/registry.md`; no new domain |
| **G-A** | **Ratification** | **PASS** | sent to chainglass from the o-prime's seat, spine 23195 |
| **G-B** | **Fold confirmation** | **PASS** | cheetah confirmed 2026-07-29 (spine **23206**, ref `gate-cleared`, `unlocks:items-1-3-5`): **A-1 folded into WS-001 + WS-003, A-2 into WS-001 verbatim, E-26 corrected, all resolved OQs recorded.** The workshops are now the single source for the amendments |
| **G-C** | **Plan stands** | **PASS** | albatross ruled 2026-07-29, spine **23224** (`plan-stands`, refs `gate:G-C-pass`, `plan:…@7a48671`, `phases:9`, `deviation-approved:item2-field-into-P1-forced-by-F02`, `merge-order:2-3-4`, `authorized:P1-P6-tasks+fleet`). **The item-2-field-into-P1 deviation is approved and upgraded: F-02's `satisfies` clause makes field+row atomic, so it is forced by the type system, not preferred** |

**All three gates are PASS.** The single-source rule is satisfied — this repo does not code an
amendment until the amendment is in the contract it was made against, and it now is. **No phase is
gate-blocked.** What remains is structural ordering, not gating: phase 1 before 2/3/4, phase 6
before phase 7, and the recorded merge order 2 → 3 → 4 at convergence.

**Authorized 2026-07-29 (spine 23224)**: phase tasks for **P1** and **P6**, then the sol/terra pair
fleet. P6's regression lock (6.1) is the first code this stream ships, and **its RED is the proof
the #35 fix is real** — a green 6.2 against an unmoved 6.1 is the whole claim.

### Summary

Ten phases. **Phase 1 is a prerequisite that ships no behaviour** — it declares six descriptor
fields and their owners, and proves the ownership law with the test template the repo already
has. Phases 2/3/4 are the three joint contracts, dependency-independent of each other and
parallelisable. Phase 5 joins JC-1 and JC-2 into the PM-keyed nudge and carries the A-2 fix.
Phases 6→7 clear #35 and then ship sweep-adopt on top of a verb that actually writes. Phase 8 is
the automation that makes the whole thing self-sustaining; phase 9 is the explicitly optional
stretch.

### Domain Manifest

| Domain | Files touched (indicative) |
|---|---|
| `pij-control-plane` | `core/types.ts`, `core/registry-write.ts`, `core/cli.ts` (verb tables, `denormDescriptor`, `list`/`tree`/`node show` projections), `cli.ts` (adopt/#35), `core/anomalies.ts` |
| `pij-orchestration` | `core/orchestration/role.ts` (new), `core/orchestration/prime.ts`, `core/orchestration/cli.ts`, `core/tree.ts`, `core/discovery.ts` |
| `pij-messaging` | `core/watchdog.ts`, watchdog turn construction |
| `pij-skill` | `.pi/skills/` + `skills/pij/` route modules |
| `session-work-state` | `core/platform/types.ts` (spine kinds), `core/platform/assignment.ts` (comment only, per OPEN-1's forward obligation) |

### Key Findings

Carried from the contract review so no phase re-derives them. Every line pinned in this worktree
at `8a63c58`.

| # | Finding | Evidence | Consequence for phasing |
|---|---|---|---|
| **F-01** | An undeclared descriptor field is **silently lossy for its own writer** — discarded whenever disk holds a value, no error, no log line | `core/registry-write.ts:59-65`; incident list `:9-11` | Phase 1 exists |
| **F-02** | `DESCRIPTOR_FIELD_OWNER` is `satisfies Partial<Record<keyof SessionDescriptor, …>>` — **the ownership row cannot compile before the descriptor field exists** | `core/registry-write.ts:94` | Phase 1 must land fields *and* rows in one change; A-1 is not a one-line table edit |
| **F-03** | `isFireDue` returns `false` when every anchor is null | `core/watchdog.ts:134-146` | A-2; the never-reported PM is invisible without a floor |
| **F-04** | pij already has the always-present floor-anchor pattern | `core/archive.ts:36-44` (docstring `:39`) | Phase 5 reuses it rather than minting a second answer |
| **F-05** | `evaluateResponse` inputs carry **no** semantic-state field | `core/watchdog.ts:160-166` | The suspect path stays blind to a declared `waiting` — scoped out explicitly in 5.6 |
| **F-06** | The stale-clearing destructure names exactly one field | `core/cli.ts:2789` | HAZARD-1; and A-6 — two field families with **opposite** lifetimes will share this function |
| **F-07** | `denormDescriptor` has exactly three call sites | `core/cli.ts:3800`, `:3897`, `:3997` | The blast radius of phases 3/4 is bounded and knowable |
| **F-08** | The spine log is byte-append-only and permanent; tiering moves `~/.pij/<id>/`, never `spine/` | `adapters/spine-store.ts:3-20`; `adapters/fs-registry.ts:584-606`; `core/archive.ts:23,33` | OQ-2 answered; no backfill work in any phase |
| **F-09** | `closeAssignment` has **no caller** outside tests | `grep -rn`, whole extension | OPEN-1 needs no producer change; only a forward-obligation comment (4.8) |
| **F-10** | `PrimeService.update` writes the descriptor and appends nothing | `core/orchestration/prime.ts:35` | Q-11 debt; optional task 2.9 |
| **F-11** | The human designation column is a **1-char ternary under a 1-char header** | `core/cli.ts:2118` | Q-13 is free; `M` yes, `w` no — blank must keep meaning *undesignated* |
| **F-12** | `list --json` rows are a hand-built literal and the denorm is a pure field read (N × `node show` = 179 rows ≈ 80s) | `core/cli.ts:2061-2103`, comment `:2085-2091` | Every projection in this plan is O(1) per row; no phase may add a join |
| **F-13** | The write-law test template already exists | `core/registry-write.test.ts:40-42` | AC-01's proof is a copy-paste, so there is no excuse for omitting it |
| **F-14** | `#35` — `adopt` on a dissolved seat prints `(pane %N, bound)` and writes zero bytes; the guarded verb for the case is `RegistryPort.revive` (`core/ports.ts:73`), which `adopt` calls neither | review + handover §B3 | Phase 6 precedes phase 7; the sweep targets exactly the dissolved population |
| **F-20** | **A narrowing gate silently converts every test whose fixture falls outside it into a VACUOUS PASS.** P5's strict PM eligibility was correct, ruled, reviewed and mutation-proved. Its collateral: **ten** fixtures in `docs/plans/055-pij-watchdog/proofs/run-proofs.ts` (`tmux-default`, `pause-target`, `compact-tmux`, `frozen-peer`, `root`, `capture-peer`, `exempt-child`, `tmux-peer`, `pi-peer`, `prebind-peer`) stopped exercising their scheduling / transition / exemption / lifecycle assertions — they now passed **because the fixture was filtered out before the behaviour ran**, not because the behaviour was right. **Every sensor stayed green.** Nobody sized this — not the PM, and not the reviewer who checked P5's blast radius and passed it — because we all examined the gate's OWN tests rather than what the gate now EXCLUDES | found by the coder auditing the class rather than the two named instances, 2026-07-29 | **Fourth instance of F-19's family.** When adding a gate, the question is not only "is the gate right" but "what did the gate just stop testing" |
| **F-19** | **"Correct today, unprotected tomorrow" — three instances, one class.** P1 shipped a `Role` exact-union lock that was **type-erased** (tsconfig excludes `*.test.ts`). P6 shipped a post-write verification guard **no test exercised** (`if (false)` left T002 green). P3 shipped a pre-lock reread fix that is correct on all four family paths but has a regression on **only one** (mutating the three siblings to stale reads left **326 tests green**). Every time the CODE was right and the PROOF was absent; every time only a **mutation** found it. **A fix without a failing mutation is correct today and unprotected tomorrow** — the next editor who "simplifies" it is told everything is fine | P1 `core/types.test.ts`; P6 T002; P3 `core/cli.ts:4191/:4221/:4325` — each reproduced independently by the PM | This is the standing argument for Dim-0 being mandatory rather than advisory. **Three for three**, and none would have been caught by review-by-reading |
| **F-18** | **A sensor that survived contact with the future.** `RAW_WRITE_ALLOWLIST`'s detector carries the comment *"Deliberately textual: it must catch a writer that does not exist yet."* It then caught `RoleService` — a writer that did not exist when the test was written — and forced it to enrol and justify rather than silently joining the raw-write population. **This is the standard P8's sensor should aspire to**: not a check that encodes today's known-bad list, but one whose detection survives capabilities nobody had imagined | `core/registry-write-law.test.ts:53-116`; tripped live 2026-07-29 | Cited by P8 as its design target |
| **F-17** | **A-2's null-anchor is a GENERAL defect, not a PM one — proved by anti-correlation.** Over one session the stall detector fired **7 times on a healthy working coder** and **0 times on 3 seats genuinely wedged for nine minutes**. It cannot see exactly the seats that need it: "stalled" keys on a seat whose events went quiet, and a seat that **never emitted an event has no anchor to go quiet from** — `isFireDue`'s null-anchor branch, live in the spawn path. pij's own `send` error says it outright: *"wedged boot; **the watchdog cannot see pre-bind seats**"*. **A documented gap nobody wired to a fix.** Scope note: this is EVIDENCE for A-2's shape, and **P5's implementation stays PM-nudge-only** — generalising the fix to the spawn path is platform scope (filed, spine 23569) | live measurement 2026-07-29; `core/watchdog.ts:134-146`; pij `send` refusal text | Task 5.3 unchanged; recorded so the floor-anchor rationale is not read as PM-specific |
| **F-16** | **Self-pause is sticky through BOTH compact and working transitions — the composition, not either function, is the bug.** `applyCompactPause` (`core/watchdog.ts:120-126`) returns the sidecar unchanged when `pausedBy !== undefined`, so compacting an already-self-paused seat records nothing; `applyWorkingTransition` (`:114-117`) then clears **only** `pausedBy === "compact"`. A self-paused seat therefore has **no automatic clearing path at all** — only an explicit `pij watchdog resume`. Observed live on `pij-panicky-caribou`: self-paused after reporting P6 done (exactly as the nudge text instructs), compacted (no-op), dispatched P1, worked — still `paused (self)`. **This is the mechanism behind dove's 47/51 paused-fleet census**: pause once, correctly, then unwatched forever | `core/watchdog.ts:109-126`; tiers `core/types.ts:451`; live observation 2026-07-29 | Task 5.9. Also explains why that census is *durable* rather than churning |
| **F-15** | Live spine 5,087,199 B / 22,664 lines / **0** `kind:"status"` / **1,429** distinct peers vs **237** hot / **4,037** archived | measured on `~/.pij`, 2026-07-29 | `"status"` is genuinely unclaimed. The 6:1 gap is A-4, and **chainglass took it on their side (their T007 bounds the `statuses` map) — no pij obligation, no task in this plan** |

### The `report` family — Jordan's ruling, 2026-07-29

**Ruled in-pane.** JC-1's verb is not a bare verb: it is one subcommand of a new **`report`**
family, and `state set/clear/verify` **move into it**. Jordan authorised unshipping the old
spelling.

```
pij report now      "<what I just did>" "<what's next>" [--state <word>] [--note "<text>"]
                                                        [--project <slug>] [--json]
pij report question "<what I need from you>"            [--assignment <id>] [--json]
pij report blocked  "<what I am waiting on>"            [--assignment <id>] [--json]
pij report state    <word>                              [--assignment <id>] [--refs a,b] [--json]
pij report clear                                        [--assignment <id>] [--json]
pij report verify   <node>                              [--assignment <id>] [--json]
```

**The organising sentence**: *everything under `report` is a seat making a **first-person claim
about itself**; everything outside it is either measured by pij or is about the work rather than
the worker.*

**Why a family and not `pij status` / `pij now`.** The bare top-level surface has a grammar:
imperative verbs are **actions** (`spawn`, `send`, `adopt`, `link`, `close`), bare nouns are
**reads** (`list`, `models`, `sessions`, `anomalies`). `status` is a noun that would *write*;
`now` is an adverb that reads as a query. `report` is an imperative and fits. *(`post` was rejected
— too close to `send`.)*

**The collision dissolves as a side effect**: once the writes leave, `pij state <id>` is a bare
noun that only reads, restoring the noun-equals-read rule. That is a better outcome than the
work-around this plan originally proposed.

| Decision | Ruling |
|---|---|
| **First person** | `report now/question/blocked/state/clear` take **no `<node>`** and self-resolve, refusing `E-NOID` on a merely *asserted* seat — JC-1's D-20 rule generalised to the family, killing "one PM's claim under another PM's name" everywhere. `report verify <node>` keeps its positional: verifying someone else's `done` is inherently supervisory |
| **Note-bearing states are first-class** | The question/blocked text is the **positional** of its own subcommand, not a `--note` flag on a vocabulary word. This enforces JC-3's OPEN-4 ruling *structurally* — `hold` cannot take a note because no `report hold "<text>"` exists to type |
| **Compound form retained** | `report now … --state question --note "…"` stays for "here is my progress **and** I am stuck on you". Two entry points, but genuinely different speech acts, not two ways to say one thing |
| **`task set` stays out** | Declaring which work you are assigned is bookkeeping about the *work*, not a first-person claim about the *seat*. Folding it in would make `report` mean "any write", which is no concept at all |
| **Inline markdown SUPPORTED, block markdown DEFERRED** | Inline (`` `code` ``, `**bold**`, `[links]`) survives JC-1 D-6's whitespace collapsing untouched — **zero contract change**, and it should be documented so agents use it. Block markdown needs newlines, so it would amend JC-1 D-6 **and** JC-3 D4, raise the caps, and change CG's render. **Filed separately with a sanitisation requirement attached**: parsing agent-authored text into HTML is a new injection surface on text pij accepts from any seat, and today's verbatim-into-a-clamp render is structurally safe |

**Records are UNCHANGED.** `semanticState`, `stateNote{text,state,at}`, the `state-set` spine kind
and the status event all keep their ratified shapes — **only the verb surface moves**, so
chainglass's consumed-field subsets are untouched. The amendment to cheetah is about spelling, not
data.

### Enrollment checklist — where a new capability must REGISTER

*(Added mid-stream, o-prime ruling 2026-07-29, after **three** scope omissions in one phase — all
the same class. Every packet's `--allowed-paths` in this plan was built by reasoning about where
the **code** lives; every miss was a place a new capability must **enroll**.)*

This repo has several **governance registries**. Each is individually excellent. Collectively they
are a checklist that, until now, existed only in the heads of people who had been bitten.

**The list grew while this plan was running** — it began as three rows; the P2 review found a fourth
(spine kind vocabulary) and a fifth (the revive strip-list), and the **first use of the pre-dispatch
audit** split the verb row into three, because P2's miss was never a *dispatch* problem at all: it
was a *service-construction* problem, and the row as first written would have sent the next PM
looking in the wrong place. That is itself
the argument for the deferred sensor: a checklist maintained by hand is a checklist that is already
incomplete.

| If your phase adds… | You MUST enrol in | Where | Failure mode if you don't |
|---|---|---|---|
| a **descriptor field** the CLI writes | `DESCRIPTOR_FIELD_OWNER` | `core/registry-write.ts:73-94` | **Silent.** The field is discarded whenever disk holds a value — no error, no log line (`:59-65`). Incident #1, five times |
| a **raw `registry.write`** call site | `RAW_WRITE_ALLOWLIST` + a reason string | `core/registry-write-law.test.ts:53` | Loud red. The detector is deliberately textual so it catches writers that do not exist yet |
| a **verb** | `core/cli.ts`'s three tables (`ALLOWED_FLAGS`, `MAX_POS`, parse/execute) | `core/cli.ts:666-707` | Unparseable. **Unknown verbs DO fall through** from the control-plane `main()` to core, so plain verbs need nothing else |
| a verb needing a **new service** | the control-plane deps object — import **and** construction | `cli.ts:157` / `:3346` (`PrimeService` is the template) | The service is unreachable; the verb cannot be wired. **This is what P2 hit** — it was never a dispatch problem |
| a verb's **help text** | `USAGE` in the control-plane `cli.ts` | `cli.ts` | `pij <verb> --help` silently prints the ENTIRE usage instead of the verb's line — the filter matches `pij <verb>` and finds nothing |
| a **spine event kind** | the platform kind vocabulary | `core/platform/types.ts` (`SPINE_KIND_*`) | Consumers that match by exact kind name cannot route it. Found by the P2 reviewer — a **fourth** registry neither the PM nor the coder had listed |
| a **field that must survive seat revival** | the revive strip-list's stated policy | `cli.ts` `stripDissolvedAdoptRuntime` | Silently inherits the blacklist default. P6 classified `orchestrationRole` explicitly, so it was *not* inherited by accident — that is the pattern to copy |
| a **type-level invariant** | compiled code — **never** a `*.test.ts` | any included `.ts` (`tsconfig` excludes `**/*.test.ts`) | **Silent.** `tsc` never compiles it, vitest erases it. Cost P1 a full review round |

**The mirror rule — MOVING or REMOVING a surface.** The table above is about *adding*. Removal has
the opposite discovery method and its own failure mode:

| If your phase **removes or renames**… | You MUST find | How | Failure mode |
|---|---|---|---|
| a verb or subcommand | every **caller** — tests, and especially **user-facing remediation strings** | `grep` the old spelling repo-wide. It is mechanical; there is no excuse for missing it | A remediation that names a removed verb is **a documented instruction to run something that errors** — this is #35 in a different costume (`whoami` prescribed the broken `adopt`). Found live at `core/anomalies.ts:389`, whose lost-dispatch remediation told the reader to run `pij state set …` |

**Allow the test file with the production file.** This repo co-locates `*.test.ts` beside its
subject. Allowing `watchdog-manager.ts` without `watchdog-manager.test.ts` **permits the change and
forbids the proof** — incoherent on its face, and it happened. Mechanical rule: **if a path is
allowed, its co-located test file is allowed automatically.** No human should be deriving this
per-packet; it is the strongest case for the coder's proposed effective-contract validation at
packet-compile time.

**Prescriptive migrates; descriptive stays.** The grep finds both, and they must be treated
oppositely. The test is one question: **does this text tell someone to do something, or does it say
what someone did?**

- **Migrate** — skill routes, `docs/how/`, remediation strings, usage text, `AGENTS.md`. A stale
  prescriptive surface is an instruction to run something that errors.
- **Do NOT touch** — historical briefs, past plans, execution logs, handover files,
  `government/spine.md`. Rewriting them **falsifies the record**: a plan that said "we ran
  `pij state set`" in July was *true* in July. This repo already holds the norm explicitly —
  `spine.md` is a frozen historical record that must never be appended to.
- Where a file does both, migrate only the prescriptive part.
- **The sharper test is: DOES IT EXECUTE?** Intent is the wrong axis when the artefact is *code*.
  `docs/plans/055-pij-watchdog/proofs/run-proofs.ts` **looks** historical — it sits under a closed
  plan's folder — but `harness/scripts/smoke.ts` runs it, so it is a **live caller**. Location is a
  hint, never the answer. A single file can hold a historical narrative **and** a live fixture; touch
  only the executing part. *(Found by the coder applying the rule and hitting its blind spot.)*

**Timing rule**: prescriptive surfaces migrate **in the phase that removes the verb**, never in a
later cleanup phase. Deferring them opens a window where the routes prescribe dead commands to every
agent that loads them — the #35 shape a third time. *(Applied live: P3 absorbed the skill/doc
migration that P9 originally owned; P9 keeps only the teaching work.)*

**Enrollment is a checklist you must know; callers are a grep you can always run.** Adding and
moving are not the same problem and must not be audited the same way. The pre-dispatch audit covers
both.

**Reason-string discipline** (learned the hard way on `RAW_WRITE_ALLOWLIST`): the reason is a
**governance record that outlives you**, not a comment to get past a red. Reasons that look similar
are often different arguments and must not be copy-pasted:

- `core/orchestration/prime.ts` — *"deliberately **overwrites** the externally-owned prime flags"* →
  an **overwrite justification**.
- `core/orchestration/role.ts` — *"owns `orchestrationRole` and must declare `"cli"` so the write
  law keeps its computed value"* → an **ownership declaration**.

Conflating those two would put a wrong sentence into the one file whose entire purpose is being
right about who writes what.

**Named packet step — mandatory, not a private habit.** Before dispatching any phase packet, audit
its `--allowed-paths` against this table for every capability the phase adds. This step is named
here so the next PM performs it too, rather than rediscovering the table three round-trips at a
time.

**Deferred, filed not planned**: a sensor that detects a new verb or descriptor field and asserts
it is registered everywhere it must be. Right target, and three-for-three is strong evidence — but
it needs design this plan should not absorb mid-flight (what triggers it, how a "new verb" is
detected textually, whether the three registries stay three). It rides the stream-close encode pass
with **P8's sensor as its precedent**.

### Phases

#### Phase Index

| Phase | Title | Primary domain | Objective (1 line) | Depends on | Entry gate |
|---|---|---|---|---|---|
| 1 | **Descriptor prerequisite (A-1)** | pij-control-plane | Five fields declared and **owned**, proved by the write law; zero behaviour | — | G-C |
| 2 | **Item 2 — orchestrationRole (JC-2)** | pij-orchestration | A seat's role is in the record and on three reads, prime always winning | 1 | G-C |
| 3 | **Item 1 — `report` family + `report now` (JC-1)** | pij-control-plane | The family exists, `state set/clear/verify` move into it, and one call records now/next | 1 | G-C |
| 4 | **Item 3 — `report question` / `report blocked` (JC-3)** | pij-control-plane | A question travels as text and dies with the state word it belonged to | 1, 3 | G-C |
| 5 | **Item 5 — PM-keyed nudge (+A-2)** | pij-messaging | Only PMs are nudged, including the PM who has never reported | 2, 3 | G-C |
| 6 | **#35 — adopt writes what it reports** | pij-control-plane | The documented recovery path stops lying to the class it serves | — | G-C |
| 7 | **Item 4 — prime sweep-adopt** | pij-orchestration | A prime is told about unadopted seats and adopts+designates in one call | 6 (hard), 2 (soft) | G-C |
| 8 | **Harness sensor — type-proof placement** | harness | A type-level lock written where the compiler cannot see it is rejected mechanically, not by memory | 2, 3, 4 merged | G-C |
| 9 | **Item 6 — skill-route automation** | pij-skill | PMs run the status verb because the route runs it, not because they remember | 2, 3, 4 | G-C |
| 10 | **Item 7 — interstitial D1 (optional)** | pij-control-plane | A wedged seat becomes observable to a reader for the first time | 1 | OQ-B for copy |

**Execution shape — SEQUENTIAL (o-prime ruling 2026-07-29, spine 23568).** Phases **2, 3, 4** have
no dependency on each other and were originally planned as a three-stream parallel fleet. They are
now run **sequentially in one worktree, one coder at a time**.

*Why the change*: worktree-per-stream was built exactly as ruled — three branches off `8e6904f`,
each `rsync`-bootstrapped from canonical, green boot verified — and **every coder spawned into a
brand-new worktree directory failed to bind**, sitting at `lifecycle: pending` with `last event
never`. The harness was provably fine (a pane driven directly answered and burned 32k tokens); only
pij's spawn-to-bind handshake fails there. Verified three ways, including a solo respawn that ruled
out rapid succession. **Filed as platform work, not fixed mid-stream** (spine 23569).

*Why this is not merely a fallback*: serialization **satisfies the isolation requirement and
dissolves the convergence risk the merge order existed to manage**. The recorded order 2 → 3 → 4
becomes trivially true — they are sequential commits on one branch, so there is no rebase and no
conflict on the shared `core/cli.ts` surfaces at all. The trade is a modest wall-clock loss for the
removal of an entire risk class.

*Preserved*: the three worktrees stay bootstrapped until stream close — zero cost, and it keeps the
parallel option open if the handshake is fixed mid-stream.

Phase 6 was independent of all of this and has already landed.

---

#### Phase 1: Descriptor prerequisite (A-1)

**Objective**: every field this plan will later write has a declared owner *before* anything
writes it.
**Domain**: pij-control-plane
**Delivers**: five optional descriptor fields; five `DESCRIPTOR_FIELD_OWNER` rows; the
`applyWriteLaw` proof pairs.
**Depends on**: none. **Entry gate**: G-C. *(G-B closed 2026-07-29, spine 23206 — A-1 is folded into WS-001 + WS-003, so this phase now implements a contract rather than anticipating one.)*
**Ships no behaviour.** Nothing reads or writes these fields at the end of this phase — which is
exactly why it is safe to land first and why it must.
**Key risk**: none technical. The risk is that it is seen as trivial and skipped into another
phase, which is how incident #1 happened five times.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 1.1 | **RED**: `applyWriteLaw` pairs for `stateNote`, `statusPrev`, `statusNext`, `statusAt`, `statusSeq`, `orchestrationRole` — each asserting the `"cli"` value survives and a `"daemon"` write restores disk | pij-control-plane | 6 red tests naming AC-01 | TDD; template at `core/registry-write.test.ts:40-42` (F-13) |
| 1.2 | Declare the fields on `SessionDescriptor` — all optional, per the file's own migration-safe convention (`core/types.ts:229`): `stateNote?: { text: string; state: SemanticState; at: string }`, `statusPrev?`/`statusNext?`/`statusAt?: string`, `statusSeq?: number`, `orchestrationRole?: StoredOrchestrationRole` | pij-control-plane | typecheck green | **Must precede 1.3** — F-02: the `satisfies` clause will not compile otherwise |
| 1.3 | Add the six rows to `DESCRIPTOR_FIELD_OWNER`, all `"cli"`, grouped under a comment naming incident #1 | pij-control-plane | 1.1 green | `core/registry-write.ts:73-94` |
| 1.4 | Define `StoredOrchestrationRole = "pm" \| "worker"` and `OrchestrationRole = "prime" \| StoredOrchestrationRole` with the docstring JC-2 D1-c specifies (stored ≠ projected; `"prime"` is **never** stored) | pij-orchestration | typecheck green; `Role` untouched | The comment is load-bearing: it is what stops a later editor storing `"prime"` |
| 1.5 | Assert in `core/types.test.ts` that `Role` is still exactly `"parent" \| "worker"` and that `PIJ_ROLE`'s narrowing at `index.ts:282-283` is unchanged | pij-control-plane | green | A regression lock on the thing JC-2 refuses to widen |
| 1.6 | `harness checks` on the branch | — | **exit 0, ZERO failures** | AC-14 |

---

#### Phase 2: Item 2 — orchestrationRole (JC-2)

**Objective**: role is a fact in the record with one writer, projected total on every read CG polls.
**Domain**: pij-orchestration (+ control-plane wiring)
**Delivers**: `RoleService`; `pij orchestration role set|unset [<id>] <pm|worker>`; `link --role`;
`role-set` spine kind; projections on `list --json`, `tree --json`, `node show --json`; the
`role-conflict` anomaly; the `M` column.
**Depends on**: phase 1. **Entry gate**: G-C. **JC-2 was ratified as written — no fold was ever needed here.**
**Key risks**: the `tree` spread leaks the stored partial form unless re-stamped (JC-2 D4-b); a
second writer for prime-ness would be a correctness bug, not a redundancy.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 2.1 | **RED**: `projectOrchestrationRole` — prime wins over a stored role; stored passes through; absent → `null` | pij-orchestration | red, naming AC-02 | TDD; the **one** join, never duplicated in a consumer |
| 2.2 | **RED**: `hasRoleConflict` true iff `prime === true` **and** a stored role is present | pij-orchestration | red | Deterministic precedence must not mean a silent disagreement |
| 2.3 | `core/orchestration/role.ts` — `RoleService` shaped **verbatim** on `PrimeService` (`prime.ts:13-38`), declaring `"cli"` on every write | pij-orchestration | 2.1/2.2 green | Never writes the descriptor directly |
| 2.4 | Verb family `pij orchestration role set\|unset [<id>] [--json]`; `[<id>]` defaults to self as `prime set` does; usage text extended | pij-orchestration | `--help` shows it; wrong-arg fails loud | `core/orchestration/cli.ts:17-19` |
| 2.5 | `pij link --role <pm\|worker>` — designation in the adoption call, written **through `RoleService`** | pij-control-plane | one call adopts and designates | JC-2 D2-c; the migration vector (D5-d) |
| 2.6 | `role-set` spine kind on the `node-linked` template: uncoupled, under the platform write lock, attribution resolved before any write; `prev`/`next` carry the words; **`unset` omits `next`** (string-typed, never null) | session-work-state | event appended on change only | `core/platform/types.ts:237-243` |
| 2.7 | Projections: `list --json` row (beside `prime`/`oldPrime`), `tree --json` node (**re-stamp over the spread** — mandatory, not optional), `node show --json` card (hand-built, inherits nothing) | pij-control-plane | key **always present**; `null` = unknown; no per-row fan-out (F-12) | `core/cli.ts:2083-2084`, `:4340-4344`, `:4139` |
| 2.8 | `role-conflict` anomaly through the existing surface | pij-control-plane | `pij anomalies` lists it | `core/anomalies.ts` |
| 2.9 | Human column grows `M`: `P` · `O` · **`M`** · blank. **`w` is deliberately not rendered** — it would make blank ambiguous between *worker* and *undesignated*, which is the distinction JC-2 D4 exists to preserve | pij-control-plane | 1-char column, unchanged width | Q-13, F-11 |
| 2.10 | *(optional, OQ-D)* `prime set/retire/unset` appends a `prime-set` spine event, closing the asymmetry Q-11 names | pij-orchestration | history exists for the **winning** designation too | Sized here because `RoleService` solves the same problem; ships in either order |
| 2.11 | Wrong-arg fail-loud tests for every new verb path | pij-orchestration | AC-02 | grant-class regression precedent |
| 2.12 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

**Day-one expectation, stated so it is not read as a bug**: with this phase shipped and no
designations made, **6 seats project `prime`, ~232 project `null`, zero PMs, zero nudges.** That
is the contract behaving correctly (JC-2 D5). Population converges by adoption, never by script.

---

#### Phase 3: Item 1 — the `report` family + `report now` (JC-1)

**Objective**: a PM records now/next in one call, and the record is honest about what landed.
**Domain**: pij-control-plane
**Delivers**: the verb; the spine `status` kind; the two-events-one-lock composition; the WAS-set
failure ladder; the `statusPrev/Next/At/Seq` denorm.
**Depends on**: phase 1. **Entry gate**: G-C *(G-B closed — WS-001 carries A-1 and A-2 verbatim, and E-26's third status noun is corrected)*.
**Key risks**: merging the two events would break s055's exact-kind consumer; a status attributed
to a guessed seat is undetectable after the fact.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 3.1 | **RED**: arg validation — 2 required non-empty positionals; whitespace collapsed **before** the length check; >280 chars → `E-ARG` naming the limit; unknown `--state` word → `E-ARG` naming the whole vocabulary; unresolvable self → `E-NOID` | pij-control-plane | red, naming AC-03/AC-04 | TDD; guard template `core/cli.ts:1336-1337` |
| 3.2 | Create the **`report` family**: subcommand grammar in the three tables **plus its `USAGE` block** in the control-plane `cli.ts` | pij-control-plane | `pij report --help` lists the family, not the whole usage | Enrollment-checklist row — omitting USAGE silently prints the ENTIRE usage. **OQ-A is RULED: `report`** (Jordan, 2026-07-29) |
| 3.2b | **Move `state set`→`report state`, `state clear`→`report clear`, `state verify`→`report verify`.** Unship the old spelling (Jordan authorised). `pij state <id>` stays a **read** | pij-control-plane | old spellings gone; `pij state <id>` still reads | Restores noun-equals-read; the status/state collision dissolves rather than being worked around |
| 3.2c | **First-person rule**: `report now/state/clear` drop `<node>` and self-resolve, `E-NOID` on a merely asserted seat. `report verify <node>` KEEPS its positional | pij-control-plane | an asserted seat is refused | D-20 generalised: kills "one seat's claim under another's name" family-wide. Verify is supervisory by nature |
| 3.3 | Bare path: append one spine `kind:"status"` event on the existing envelope; `refs` carry `node:<seat>` + assignment + project, **never** `state:<word>` | session-work-state | worked example in JC-1 reproduced byte-for-byte | D-11: one fact, one carrier |
| 3.4 | `--state` path: **two events, one `withPlatformWriteLock`, ruled order `state-set` → `status`**, correlated by a `state-set:<seq>` ref | pij-control-plane | both events, one lock, never reordered | Merging breaks a **shipped** consumer (s055 reads `state-set` by exact kind) |
| 3.5 | Failure ladder in the existing WAS-set framing: state-set leg fails → no status attempted; status append fails after state-set → name exactly what landed; denorm fails → the record is truth, the denorm is a cache | pij-control-plane | AC-05; each rung has a test | `core/cli.ts:3874-3899` house style |
| 3.6 | Project attribution ladder: `--project` → current assignment's `projectSlug` → **omitted**. Never `""`, never `null` | pij-control-plane | "no project" is a designed case, not a failure | The general assignment has none by construction |
| 3.7 | The status leg **never materialises an assignment**; only the `--state` leg does, exactly as today | pij-control-plane | recording what you did creates no record you did not ask for | D-13 |
| 3.8 | Denorm `statusPrev/Next/At/Seq` via `denormDescriptor`, and **assert they survive a `task set`** | pij-control-plane | regression test | A-6: opposite lifetime to `stateNote`; if they cleared, A-2's floor problem would recur on every task swap |
| 3.9 | Project the denorm into `list --json` and the `node show` card | pij-control-plane | pure field read (F-12) | Consumer is pij's own watchdog, **not** CG |
| 3.10 | One-line confirmation shaped after `state set`'s, so the family reads as one | pij-control-plane | `--json` emits the stamped event verbatim | Token economics |
| 3.11 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

---

#### Phase 4: Item 3 — `report question` / `report blocked` (JC-3)

**Objective**: a question travels as text, and stops being true on exactly the transitions that
end it.
**Domain**: pij-control-plane
**Delivers**: `--note` on `state set`; the `stateNote` denorm; the HAZARD-1 destructure fix; the
`semanticState` companion projection.
**Depends on**: phase 1. **Entry gate**: G-C *(G-B closed — WS-003 carries A-1)*.
**Key risk**: **HAZARD-1 is the single most dangerous line in this plan** — a `stateNote` not
added to the stale-clearing destructure survives `state clear` and an assignment swap, pinning an
answered question at the top of the rail indefinitely.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 4.1 | **RED**: `--note` accepted **only** with `blocked` or `question` — every other one of the eight words is `E-ARG` naming both permitted words | pij-control-plane | 8 cases, 6 refusals | OPEN-4 answered **no** for `hold`: it is the first step to a per-worker status backdoor |
| 4.2 | **RED**: >200 chars or any newline → `E-ARG` naming the limit; `--note` with no value → `E-ARG` | pij-control-plane | red, naming AC-04 | Never silently truncate — a half-question reads as a complete, different question |
| 4.3 | **RED (HAZARD-1)**: after `state set question --note …`, assert `stateNote` is **absent** following each of `state clear`, `state set <other-word>` (no note), and `task set` | pij-control-plane | 3 red tests | The failure this test prevents is invisible on this side and loud on CG's |
| 4.4 | Add `"note"` to the `state set` allowlist; value-flagged, **not** in `BOOLEAN_FLAGS` (as `--refs` is not) | pij-control-plane | 4.1/4.2 green | `core/cli.ts:699` |
| 4.5 | Stamp `stateNote: { text, state, at }` in the `state set` denorm | pij-control-plane | 4.x green | `core/cli.ts:3897-3901` |
| 4.6 | **Add `stateNote` to the stale-clearing destructure** at `core/cli.ts:2789` | pij-control-plane | 4.3 green | HAZARD-1 |
| 4.7 | **(A-6)** State the per-field clearing policy in the comment beside that destructure: `semanticState`/`stateNote` **clear** on swap; `statusPrev/Next/At/Seq` **survive**. One sentence in an existing comment block | pij-control-plane | the next editor must choose, not inherit | Encode, don't document — the rule lives where the edit happens |
| 4.8 | **(OPEN-1 forward obligation)** Comment at `core/platform/assignment.ts:84` recording that `closeAssignment` has no caller today, and that whoever adds one inherits the clearing decision for all three field families | session-work-state | comment present | F-09; the plan doc nobody will be reading by then is not the right home |
| 4.9 | Project `stateNote` on `list --json` rows and the `node show` card | pij-control-plane | pure field read | JC-3 D5 |
| 4.10 | **Companion ask**: project `semanticState` on `list --json` rows | pij-control-plane | closes a pre-existing consumer gap | Identical cost to the three denorms already there; CG's supersede guard needs it |
| 4.11 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

---

#### Phase 5: Item 5 — PM-keyed watchdog nudge (+ A-2)

**Objective**: the watchdog nudges PMs and only PMs — **including the PM who has never reported.**
**Domain**: pij-messaging
**Delivers**: role-gated eligibility; the `statusAt` clock with a never-null floor; the paste-ready
nudge text; the named scheduler-behaviour change.
**Depends on**: phases 2 and 3. **Entry gate**: G-C *(G-B closed — A-2 is in WS-001 verbatim, so the floor anchor is contract, not local invention)*.
**Key risks**: this phase modifies a shipped scheduler that every seat on the machine depends on;
and the naive reading of the ruling produces silence for the exact population it targets.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 5.1 | **Regression lock first**: pin current `isFireDue` behaviour for non-PM seats — activity re-anchoring, freeze cadence, paused/disabled short-circuits | pij-messaging | green **before** any change | The blast radius is every seat |
| 5.2 | **RED (A-2)**: a seat with `orchestrationRole === "pm"`, **no `statusAt`**, and **no `lastFireAt`** is due after one interval | pij-messaging | red, naming AC-08 | The whole point. F-03: today this returns `false` |
| 5.3 | Add the never-null floor anchor, reusing `archiveAgeAnchorMs`'s shape (`core/archive.ts:36-44`): a null result means *cannot prove*, not *nothing due* | pij-messaging | 5.2 green | F-04 — the pattern is one file over; do not mint a second answer |
| 5.4 | **RED + impl**: nudge iff projected role is **exactly** `"pm"` — strict positive match. Unknown role is silence; `prime` and `worker` excluded | pij-messaging | AC-07; today this nudges nobody, which is correct | Precedent and cautionary tale are the same field: `relay` → `"relay (never watched)"`, added after the 20-nudge incident |
| 5.5 | **Named scheduler-behaviour change (its own line, its own test)**: keying on `statusAt` **removes activity re-anchoring for PMs** — a PM working hard and reporting nothing will now be nudged. That is the intent; it is a change to the scheduler, not only to targeting, and the docstring at `core/watchdog.ts:129-133` must be updated to say so | pij-messaging | docstring and test agree | Albatross ruling 2; review § A-2 second-order note |
| 5.6 | **Explicitly scope out** the suspect path: `evaluateResponse` stays blind to the semantic axis in this plan (F-05). Record it as a named non-goal with the live evidence — a SUSPECT was raised on this PM seat while it was declared `waiting`, twice-refreshed | pij-messaging | non-goal recorded, not silently inherited | A.4; leaving it unstated ships a PM-keyed nudge on a detector that cannot see a declared idle |
| 5.7 | Nudge text carries the **paste-ready one-call command** — zero syntax recall — in the existing `[pij watchdog #N for <id>]` frame | pij-messaging | AC-09 | Uses whichever verb name OQ-A settles; single-sourced per 3.2 |
| 5.8 | Quote **behaviour, not setting**, in any interval reporting: intervals overshoot ~1.57× the configured value | pij-messaging | no doc or message claims 20m as observed cadence | Inherited measurement; do not re-derive |
| 5.9 | **Re-arm a self-paused watchdog on new work** (o-prime ruling 2026-07-29): on a NEW dispatch/assignment for a seat, clear `pausedBy` **iff `pausedBy === "self"`**. Operator pauses and `exempt` are **not** touched — an operator silenced a seat on purpose; a seat that silenced itself did so about **finished** work, and that consent does not extend to work it had not yet been given | pij-messaging | a seat that self-paused then received new work is `watching` again; operator pause and `exempt` survive untouched | See **F-16**. Without this, item 5 ships **broken-by-etiquette on day one**: a PM that follows the nudge's own instruction after its first status is unwatched forever and A-2's floor anchor never fires for it — A-2's silent population, reintroduced one layer up through the etiquette rather than the code. Touches no CG-consumed field |
| 5.10 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

---

#### Phase 6: #35 — adopt writes what it reports

**Objective**: the documented recovery path stops succeeding silently while writing nothing.
**Domain**: pij-control-plane
**Delivers**: `adopt` either persists the binding it reports or refuses with a working remediation.
**Depends on**: none. **Entry gate**: G-C. Depends on no other phase and on no cross-repo gate — **the first thing the fleet can start.**
**Why it is in this plan**: item 4 targets unadopted seats, and every restart-killed seat is
dissolved. A sweep built on today's `adopt` would print success and persist nothing across exactly
the population it exists to fix.
**Key risk**: this is the recovery verb everyone uses; regression-lock before touching it.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 6.1 | **Regression lock**: pin `adopt`'s current behaviour on a live, non-dissolved descriptor — the path that works today must not move | pij-control-plane | green before any change | R-5 |
| 6.2 | **RED**: `adopt` on a **dissolved** descriptor must not print `(pane %N, bound)` — either the write lands and `whoami`/`phonehome` confirm it, or a named error names the remediation that actually works | pij-control-plane | red, naming AC-10 | F-14 |
| 6.3 | Route the dissolved case through the guarded verb that exists for it — `RegistryPort.revive` (`core/ports.ts:73`) — rather than adding a third write path | pij-control-plane | 6.2 green | `adopt` currently calls neither `revive` nor `writeExact` |
| 6.4 | Fix the success line: the word "bound" is gated on `harnessSessionId` read off a descriptor the verb just failed to write, while the pane is interpolated **from the request** — so it reports the caller's intent as the system's state | pij-control-plane | the line can only claim what disk says | `core/cli.ts:2925` (per the inherited mechanism read) |
| 6.5 | Correct `whoami`'s remediation text, which currently prescribes `adopt` — the verb that is broken for this class | pij-control-plane | remediation names a path that works | The documented recovery path being closed *for the class it serves* is the whole defect |
| 6.6 | **Explicit non-goal, recorded**: this does **not** clear #37 or #36(b), and it does **not** release leech's symlink or roadrunner's two hardlinks. Those wait on a different fix and their notification obligations sit with the o-prime | pij-control-plane | non-goal recorded | Three live workarounds; if a fix ships and nobody tells the holders, they become permanent infrastructure |
| 6.7 | `docs/difficulties.md` — mark #35 resolved with the mechanism, not the symptom | — | ledger updated | Repo doctrine |
| 6.8 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

---

#### Phase 7: Item 4 — prime sweep-adopt

**Objective**: when a prime runs any pij command and unadopted seats exist in its repo or
worktrees, the prime is told and adopts + designates in one call.
**Domain**: pij-orchestration
**Delivers**: the prime-only notice; adopt-and-designate in one call.
**Depends on**: **phase 6 (hard)**; phase 2 (soft — `link --role` makes it one call).
**Key risks**: notifying the wrong population; and silently changing the adoption axis.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 7.1 | **RED**: the notice fires only for a caller with `prime === true`; **orphans are never warned**, whatever their role | pij-orchestration | red, naming AC-11 | Jordan's ruling; a seat with no governance is not asked to fix its own governance |
| 7.2 | **RED (explicit non-change)**: `isUnadopted` still keys on `prime !== true` — designating a seat `"pm"` must **not** move it out of the adoption sweep and orphan its subtree | pij-orchestration | regression test pinning `core/tree.ts:25-26` | JC-2 D7-c; the failure would be silent and structural |
| 7.3 | Detection over the prime's repo **and its worktrees**; keys on `prime`, **not** on JC-2 — the two items ship in either order | pij-orchestration | works with phase 2 absent | JC-2 D7-a, recorded so no false dependency is built |
| 7.4 | The notice carries the paste-ready `link --parent … --role …` one-call command | pij-orchestration | zero syntax recall | Same token-economics rule as 5.7 |
| 7.5 | Rate/repeat discipline: a prime is told once per new unadopted seat, not once per command | pij-orchestration | no nudge storm | The 20-nudge incident is the precedent for what happens when this is wrong |
| 7.6 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

---

#### Phase 8: Harness sensor — type-proof placement

**Objective**: make the trap that cost this plan a full review round **impossible to repeat**,
mechanically.
**Domain**: harness (engineering harness, not the pij extension)
**Depends on**: the 2 → 3 → 4 merge (so it does not contend with the parallel streams).
**Sequenced before phase 9** so the lesson ships encoded rather than as an execution-log warning.
**Proposed by**: `pij-panicky-caribou` (coder), from its own P1 fix-round friction — credited here
because the proposal is the valuable part.

**Why it exists**: `tsconfig.json` excludes `**/*.test.ts`, so a type-level assertion written in a
test file is **decorative** — `tsc` never compiles it and vitest erases it to `expect(true)`.
Phase 1 shipped a `Role` exact-union lock that let `Role | "pm"` through a **green** `just
typecheck`. A silent guard against a silent failure is worse than no guard: it buys false
confidence. The execution-log warning protects **this** fleet; a sensor protects **every future
one**.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 8.0 | **Design target, read before building**: `RAW_WRITE_ALLOWLIST`'s detector (F-18) is the standard to aspire to — a textual check explicitly built to catch *"a writer that does not exist yet"*, which then did. Aim for detection that survives capabilities nobody has imagined, not a list of today's known-bad files | harness | the sensor's own comment states what future thing it is built to catch | F-18 |
| 8.1 | **RED**: the sensor fires on a type-only exactness/identity assertion (`Assert<…>`, `Equal<…>`, `Exact<…>`, `satisfies true` and equivalents) located in any file `tsconfig.json` excludes | harness | red before the sensor exists | Detect by tsconfig's own `exclude`, never a hardcoded glob — the exclusion list is the thing that makes such a proof decorative, so read it rather than restate it |
| 8.2 | Implement the sensor in `.harness/extensions/checks/` so it joins the single `harness checks` verdict | harness | appears as its own named sensor | Repo doctrine: new back-pressure sensors go here so one verb stays the "are we done?" gate |
| 8.2b | **Second real target, already found**: `core/platform/types.test.ts` documents that its typed fixture declarations "fail `tsc`" if an envelope shape drifts — but `tsconfig` excludes the file, so vitest runs the runtime guards while the annotations compile nowhere. The claim is false today. The sensor must flag it, and the claim must then be corrected or the proof moved | harness | the sensor finds this without being told about it | Found out-of-delta during the P1 fix re-review. Two independent instances mean the trap is a **pattern**, not an accident |
| 8.3 | **Mutation proof of the sensor itself** — move `RoleExactnessInvariant` back into `core/types.test.ts` and confirm the sensor goes **RED**; restore and confirm **GREEN**. Transcript required | harness | the sensor demonstrably detects the real historical defect | A sensor nobody proved is the same class of artefact as the lock it replaces |
| 8.4 | Keep `just self-check` in sync per the repo's standing rule | harness | both composites agree | |
| 8.5 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

---

#### Phase 9: Item 6 — skill-route automation

**Objective**: the status verb happens because the route runs it, not because a PM remembers.
**Domain**: pij-skill
**Depends on**: phases 2, 3, 4 shipped.
**Key risk**: writing a paragraph instead of a step. A wiki line that says "remember to run X" is
worth nothing.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 9.1 | `/pij ready` and the PM-facing routes declare a role at adopt/link time | pij-skill | a designated seat is the default, not the exception | Feeds JC-2's convergence path (D5-d) |
| 9.2 | Status at **start and stop** becomes a route step in the PM/pair routes, with the one-call command inline | pij-skill | AC-12 | Automation in the definition of done |
| 9.2b | **Teach the family AXIS**, not the subcommands — *everything under `report` is a first-person claim about yourself*. An agent that grasps the axis guesses the subcommands correctly; one that memorised verbs does not. *(The mechanical retirement of the old spelling was pulled forward into P3 — see the timing rule above.)* | pij-skill | no route teaches a verb that no longer exists | Blast radius measured at 2 skill files + `docs/how/pij.md`, migrated in P3 |
| 9.2c | Document **inline markdown is supported** in the text fields (`` `code` ``, `**bold**`, `[links]` — they survive JC-1 D-6's whitespace collapsing untouched). State plainly that **block markdown is not**: newlines are refused | pij-skill | the worked example uses inline markdown | Zero contract change; it just needs saying, or nobody uses it |
| 9.3 | The routes teach `state set … --note` for `question`/`blocked` and **do not** invent a word for "actively working" — the vocabulary has none, and absence is the honest expression | pij-skill | no route suggests a non-existent state | Observed live this session: `state set … working` → `E-ARG` naming all eight words |
| 9.4 | A worked now/next example lands in the route, sized to the 280-char limit | pij-skill | a PM never has to guess the shape | The PM seat's own dogfooding is the source |
| 9.5 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

---

#### Phase 10: Item 7 — interstitial persistence, D1 (OPTIONAL)

**Objective**: a seat wedged on a boot prompt becomes observable to a reader for the first time.
**Domain**: pij-control-plane
**Depends on**: phase 1 (field pattern). **Explicitly optional** — the plan is complete without it.
**Why it is worth doing**: today the tag exists as a local `const` inside one daemon tick, is spent
on a single notify, latched in memory, and written to a log line. **Nothing readable carries it**,
so CG renders nothing for a wedged seat and the strip must say *"no declared questions"* rather
than *"nobody needs you"*.

| # | Task | Domain | Success criteria | Notes |
|---|---|---|---|---|
| 10.1 | **RED**: `interstitial: { label, at, paneId }` persisted on the descriptor when the daemon classifies needs-human, and **cleared** when readiness leaves interstitial | pij-control-plane | red, naming AC-13 | Descriptor, **not** the spine: the daemon ticks continuously and a re-latching interstitial would pump an irreversible append-only log |
| 10.2 | Ownership: the daemon owns this field (`"daemon"`), unlike every other field in phase 1 — it is mechanical telemetry, the same class as `systemState` | pij-control-plane | row present and asserted | The one field in this plan the CLI must **not** own |
| 10.3 | Project it on `list --json` rows | pij-control-plane | pure field read | Kind-only chip on CG's side |
| 10.4 | Closed tag vocabulary: `folder-trust`, `login`, `update-prompt`, plus the literal `"interstitial"` fallback | pij-control-plane | unknown tag renders generic, never as text | |
| 10.5 | **Blocked on OQ-B for copy only**: the wording is Jordan's call; the field can land before the wording does | pij-control-plane | field ships regardless | Detection is `lifecycle === "pending"`-only, so "asked a question" is factually wrong for all three tags |
| 10.6 | **D2 (pane excerpt) is NOT in this plan** — explicit stretch, sized separately if ever wanted | — | non-goal recorded | JC-3 D6 tiering |
| 10.7 | `harness checks` | — | **exit 0, ZERO failures** | AC-14 |

---

### Acceptance Coverage Map

| AC | Phase(s) | Proof |
|---|---|---|
| AC-01 | 1 | `applyWriteLaw` pairs, six fields (1.1) |
| AC-02 | 2 | projection tests on three reads + conflict anomaly (2.1, 2.2, 2.7, 2.8) |
| AC-03 | 3 | one-call composition under one lock, ruled order (3.3, 3.4) |
| AC-04 | 3, 4 | refusal tests at both limits and on unresolvable self (3.1, 4.2) |
| AC-05 | 3 | WAS-set ladder, one test per rung (3.5) |
| AC-06 | 4 | HAZARD-1 clearing tests across all three transitions (4.3, 4.6) |
| AC-07 | 5 | strict `=== "pm"` eligibility (5.4) |
| AC-08 | 5 | never-reported PM is due after one interval (5.2, 5.3) |
| AC-09 | 5 | paste-ready command in the nudge frame (5.7) |
| AC-10 | 6 | dissolved-seat adopt test (6.2, 6.3) |
| AC-11 | 7 | prime-only notice; orphans never warned (7.1) |
| AC-12 | 9 | route steps, not prose (9.1, 9.2) |
| AC-13 | 10 | persisted + cleared interstitial tag (10.1) — optional |
| AC-15 | 8 | sensor fires on a type-proof in an excluded file; **sensor itself mutation-proved** (8.1, 8.3) |
| AC-14 | all | `harness checks` on the branch, baseline red named |

**Coverage of the seven asked items**: 1→P3 · 2→P2 · 3→P4 · 4→P7 (gated on P6) · 5→P5 · 6→P9 ·
7→P10 (optional). **Plus** two guards the review added (P1 = A-1, P5 = A-2) and one inherited
blocker absorbed because item 4 cannot ship without it (P6 = #35).

### Merge-time obligation — a NOTIFICATION that must not fall through a rotation

**The rail does not light up when a phase lands. It lights up when this branch MERGES TO MAIN.**
Measured by `pij-cheap-cheetah` (chainglass PM) 2026-07-29: the CLI on this machine serves the
**canonical checkout**, so live `pij list --json` shows **310 rows, zero carrying
`orchestrationRole`**, even though JC-2 is implemented and approved on `s074/pij-rail-v2`.
Chainglass needs **no seam flip at all** — its production reader already reads the real field, and
the fake was test-only.

**Obligation**: ping `pij-cheap-cheetah` at merge so it can verify the render.

**Cheetah's PRE-REGISTERED prediction**, recorded here *before* the observation, which is what
makes it evidence rather than a post-hoc rationalisation:

> **SHAPE**: six prime chips · everything else role-unknown · **zero PM cards** until designations
> start. **Counts are recorded as observations, never as pass criteria.**

Amended by cheetah after I flagged that its original `~232` carried a **stale denominator** — the
seat population moved during this session because the PM was spawning and closing fleet peers, so a
count-based test would have failed on an artefact of the tester. Any other **shape** is a finding. This is the cheapest possible end-to-end proof of JC-2 and it costs
one message.

**Why this is written down rather than remembered**: the inherited handover
(`government/handover/2026-07-28-inherited-open-handles.md` §B/B2) carries **three live
workarounds** — leech's symlink and roadrunner's two hardlinks — each waiting on a notification
when a fix lands, with the standing warning that *if either ships and nobody tells the holders,
three workarounds silently become permanent infrastructure.* This is a **fourth** notification
obligation of the same class. It lives in the plan, not in a PM's context window, precisely because
PM seats rotate and context windows do not survive them.

### Post-merge reality is SPLIT — CLI goes live, daemon behaviour does not

**O-prime ruling 2026-07-29.** The machine-wide daemon runs the **canonical checkout from before
the merge** until someone restarts it, and a daemon restart is **baton-class** (machine-wide
interruption, historically Jordan-gated). So merging does **not** make everything live:

| Ships at merge (canonical CLI) | Waits for a baton-governed daemon restart |
|---|---|
| the `report` family — `now`/`question`/`blocked`/`state`/`clear`/`verify` | **PM-keyed nudge eligibility** (P5) |
| `orchestrationRole` + `link --role` + the projections | **A-2 floor anchor** — the never-reported PM becoming due |
| `pij adopt` writing what it reports (#35) | **self-pause re-arm** on new work (5.9) |
| `stateNote`, status events, all denorms | the new nudge copy actually being *delivered* |

**Why this must be stated rather than discovered**: cheetah's shape verification reads
`pij list --json`, which is CLI — so **the role chips, now/next and absence states are all
verifiable at merge**. But anyone checking "does a PM actually get nudged" will see nothing, and a
**correct render would be read as a missing feature**. The ping in obligation 1 must say which half
is live.

**Merge itself is Jordan-gated** — repo doctrine is worktrees + PR with squash merges (standing,
2026-07-12), and push-to-main is baton-class. A clean fast-forward being *available* does not make
the mechanics ours to choose.

### Definition of Done (plan level)

1. `harness checks` exits 0 on the branch, with the one pre-existing red named in the report.
2. Every AC has a named test, not a narrative.
3. Every new descriptor field has an ownership row **and** its `applyWriteLaw` pair.
4. The three workshops carry the amendments; no behaviour here contradicts them.
5. Reports carry **paths + SHAs + gates + observations** — never summary-only.
6. **Merged is ADOPTED, not VERIFIED.** Nothing is reported shipped off a merge.
7. **`pij-cheap-cheetah` is pinged at merge** and the render verified against its pre-registered prediction.
8. Every phase's retro is harvested; magic wands and difficulties land in the ledger. A session
   that improves neither harness went wrong.

### Fleet

Per Jordan's standing directive: copilot **gpt-5.6-sol coders**, **terra reviewers**, via
`/pij pair`. **Canary effort mechanically — process args are truth, self-reports have lied.**
Compaction fire-and-forget. Three-stream shape is phases 2/3/4 with the recorded merge order
2 → 3 → 4; phase 6 runs independently alongside.

**Worktree discipline for any additional stream**: one worktree + branch per stream, green boot
before any spawn, **`rsync -a` node_modules from the canonical checkout** (R-6 — `npm ci` is broken
machine-wide in worktrees and the age policy is never bypassed), never `npm link` from a worktree,
never restart the machine-wide daemon from a worktree, commits pathspec-mandatory.

**Spawning hazard**: `pij spawn --harness pi` dies silently at boot from a linked worktree
(global extension links collide with the worktree's project-local extensions). Spawn pi peers from
the **main checkout** and have them `cd` in with absolute paths. Copilot peers are unaffected.
