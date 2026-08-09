# PA capability surface: widen the gate (#102) and remove belief-from-absence (#153)

**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-08-08
**Status**: READY
**Spec source**: unified (this file)
**Stream**: s094 · branch `s094/capability-surface` · project `w1-hardening`
**Issues**: `AI-Substrate/pij#102`, `AI-Substrate/pij#153`

## Business Specification

### Research Context

📚 Incorporates findings from `assets/research-dossier.md` (12 findings, 5 historical learnings, 5 risks).

The three that shape this plan:

- One table feeds both capability seams, so **#102's widening is a table-only edit** — no bin change (F-01).
- `watchdog unwatch` without `--for` can **only** remove the caller's own subscription, and `--for` is already refused outright for a PA before the target check — so widening `unwatch` is self-resignation *by construction*, not by trust (F-03, F-04).
- The payload has one producer and **zero in-repo production consumers** — two independent measurements agree (this stream's and the prime's, run without a head limit): 4 files total, 3 of them tests (F-10).

### Summary

A **PA** is a cheap maintenance seat that is read-only *by construction*: a classification table refuses it verbs rather than a prompt asking it not to. Two rulings change that table and the surface that describes it.

**#102 — widen.** The gate was built on an **authority** test (*refuse verbs that bear authority*). Jordan replaced it with a **harm** test on two axes: **recording vs deciding** (a PA may observe, classify against a stated rule, count, diff, cite and **record** — it may not **conclude**, verify, attest or rule) and **reversible vs terminal**. Under the new test, four refusals are wrong and must move; six are right and must not.

**#153 — remove belief-from-absence.** `pij whoami --json` answers the capability question with two lists that partition a space the payload never enumerates, so *absence from `refusedVerbs`* reads as *allowed*. An exhaustive three-valued map replaces them.

### Goals

- A PA can **durably record what it discovers** (`spine-append`) instead of routing every finding through a prime who may or may not be attentive.
- A PA can **repair the roster it runs** (`chore add`/`update`/`remove`) — it is the seat that discovers roster defects and was the only one barred from fixing them.
- A PA can **see what it has been bound to, and resign from it** (`watchdog list`, `watchdog unwatch`) — without that resignation altering anything else about the seat it resigns from.
- The capability payload is **incapable of being read correctly-but-stalely**: every verb present, three-valued, with the old fields removed so a stale consumer breaks loudly.
- Every widened row and every preserved refusal is **mutation-proven** — the test goes red when the classification is flipped back.

### Non-Goals

- **Widening `watch`.** The ruling widened *resignation* and *visibility*. Binding a PA to a stranger is the creation of a subscription, not the release of one; it stays self/parent.
- **Widening `--for`.** It binds a subscription on another seat's behalf and is refused outright, including when the PA names itself. Untouched.
- **Relaxing the still-refused set.** `close`, `spawn`, `task-close`, `attest`, `state-verify`, `orchestration` stay refused; `attest`/`state-verify` are the load-bearing pair (verification is a **conclusion**).
- **Editing the pij bin** (`.pi/extensions/pij/cli.ts`). Not required by evidence (F-01); owned by stream s093 this wave.
- **Changing the human text surface's behaviour.** #153 is about the machine payload.
- **Retro-fixing out-of-repo probes.** Breaking them is the deliverable, not collateral damage.

### Testing Strategy

| Field | Value |
|---|---|
| **Approach** | **Full TDD** — every phase writes the failing assertion before the change that satisfies it. |
| **Rationale** | The charter's DONE criterion is *"tests must FAIL without the fix"*. A capability gate is exactly the kind of code whose tests pass vacuously if written after the fact — plan 084 caught two vacuous tests of its own this way (H-03). |
| **Focus areas** | Both seams (core `dispatch()` **and** the bin's raw-argv branch — H-04); the exhaustiveness of the payload; the still-refused set as a regression guard. |
| **Mutation proofs** | Mandatory, per the predecessor stream's explicit instruction to this one (H-02). Each mutation flips **exactly one** thing and names both a red test and a green neighbour (H-03). Most flip a **classification**; mutations 13 and 14 flip **handler ordering and guard behaviour** instead — a distinction worth keeping, because F1's defect was not in the table at all and a mutation suite that only ever flips table rows would have proved the gate correct while the harm arrived through a shared preamble. |
| **Mutation tooling** | `~/.pij/shared/mutate.mjs` for in-process specs only, **always with `--expect "<test name>"`** — under a gate that asks only *"did anything go red"*, a **flake is indistinguishable from a kill**, so any spec with an intermittent test silently satisfies every mutation ever run against it. Its two guards cover **different** vectors and neither covers the other: green-before-mutating kills a *pre-existing* red; `--expect` kills a *concurrent* flake. **Specs that shell out must be mutated ON DISK** (non-empty `git diff`, an assertion not a build failure, byte-identical restore) — a Vite transform never reaches a subprocess. Three of this stream's four target specs are on the 14-file subprocess list; only `pa-capability.test.ts` is clean, verified transitively (its whole import closure is type-only). |
| **Adjudicating a banked result** | Valid **iff the named red test executes the mutated module in-process**. The tool's per-file refusal is a conservative default and says what it can no longer *certify*, never what is *true*. This is why every mutation records **which test** went red, not just an exit code — a row with a test name can be adjudicated on the record; a row with only a verdict must be re-run. |
| **Excluded** | No new end-to-end tmux/driver scenarios — the surface is a CLI payload and a predicate. |

### Mock Usage

**None beyond what exists.** The gate is pure (`pa-capability.ts` has no ports; `pa-target.ts` is pure by construction) and the CLI tests already use constructor-injected fakes and `test-home` fixtures (P3). No new mock layer.

### Documentation Strategy

- `docs/how/pij-watchdog.md:87-93` states the two-bucket story and **becomes false** — corrected in Phase 2.
- `docs/how/fleet/ledger.md` — this stream's `F-300` / `W-300` / `S-300` block.
- The **PR body** carries the removal announcement, the defaulted-read residual (R-02b), and both blast-radius measurements.

### Acceptance Criteria

**Every criterion is labelled by kind**, per the fleet ruling of 2026-08-08 (adopted from stream s095, whose own validation found two of its criteria already passing against pre-fix code):

- **BEHAVIOURAL** — must **FAIL on the pre-fix tree**, and fail as a *failure*, not as an error or crash. This is the only kind that is evidence of the fix.
- **NEW-API** — cannot fail first because it will not compile against the pre-fix tree. Declared as a compile-time exception.
- **MUTATION-ONLY** — **no pre-fix form exists**: the claim is about a mechanism that does not exist pre-fix, so a red is unavailable *in principle*, not merely absent. Its sole proof is a **named mutant**, and a criterion whose mutant cannot be named is not a criterion. (Fourth label, from s100. Its natural home is "behavioural", where it then quietly never produces a red and nobody notices the difference between *did not fail* and **could not fail**.)
- **PRESERVED-PROPERTY** — must pass **before and after**. A regression guard. **Never evidence of the fix**; it earns its keep only under mutation.
- **PROCESS** — a claim about how the work was done, verified by inspection rather than by a runner.

| AC | Kind | Criterion |
|---|---|---|
| AC-01 | **BEHAVIOURAL** | A `pa`-role seat is **permitted** `spine-append` at **both** seams. |
| AC-02 | **BEHAVIOURAL** | A `pa`-role seat is **permitted** `chore add`, `chore update` and `chore remove` at **both** seams. |
| AC-03 | **BEHAVIOURAL** | A `pa`-role seat is **permitted** the watchdog read `list`, for any target. |
| AC-04 | **BEHAVIOURAL** | A `pa`-role seat is **permitted** `watchdog unwatch <a third-party target>`, and the write removes **only** its own watcher row. **Must be written against a stranger target**: against self/parent this is already true pre-fix and the criterion would silently become a preserved property. |
| AC-04b | **MUTATION-ONLY** | A PA's third-party `unwatch` performs **no persisted exemption reconciliation**: when the PA holds a subscription the target's sidecar is written **exactly once** and differs **only** by the removal of the PA's own watcher row; when it holds none there is **no write at all** and the sidecar is byte-identical. Asserted on the **whole sidecar plus a store write-count**, never on the `watchers` array — that is the one field the defect does not touch. **Discharged by mutation 13** (self-resign branch moved back *after* the reconcile preamble → all four cases red; an inert fixture would have left them green). **Relabelled from BEHAVIOURAL**: pre-fix, a PA's third-party `unwatch` is *refused and never executes*, so this claim has **no pre-fix form** — which is exactly why its pre-fix red fired on `exitCode === 0` and proved the permission half instead. *(Wording is "persisted" deliberately: `watchdogBlock` reconciles **in memory** to render the result line — `core/cli.ts:1841` — and always will. A criterion saying "no reconciliation" would be false-by-construction after a correct fix.)* |
| AC-04c | **PRESERVED-PROPERTY** | `watchdog status`, `pause`, `resume`, `exempt`, `reset`, `interval`, `disable-all` and `enable-all` remain refused for a `pa`, for every target. |
| AC-05 | **PRESERVED-PROPERTY** | `watchdog watch` remains restricted to the PA **itself or its own `effectiveParent`**; a third-party target is still refused. Guarded by mutation 5. |
| AC-06 | **PRESERVED-PROPERTY** | `watchdog --for` remains refused outright for a `pa`, **including when it names itself**, and the check still runs **before** target resolution. |
| AC-07 | **PRESERVED-PROPERTY** | `close`, `spawn`, `task-close`, `attest`, `state-verify` and `orchestration` remain refused; the remaining refusals in the table are unchanged. Guarded by mutations 6–11, one per verb. |
| AC-08 | **BEHAVIOURAL** | The `watchdog` **condition text** states the per-action rule accurately (`list`: any target · `unwatch`: any target, own subscription only · `watch`: self or parent · everything else refused), and `pij whoami` renders it. |
| AC-09 | **PROCESS** | Every classification changed **and** every classification deliberately preserved is mutation-proven, **one mutation per preserved refusal** — not one sampled row. Each red assertion and its named green neighbour are **independently runnable tests** (`it.each` or separate `it`s), never members of one loop whose first failure hides the rest. |
| AC-10 | **BEHAVIOURAL** | For a **`pa`** seat, `pij whoami --json` carries a `verbs` object with **one entry per classified verb**, each valued `allow` \| `conditional` \| `refuse`. Asserted as `toHaveProperty("verbs")` **before** any key-set comparison, so the pre-fix run reports a failure rather than a `TypeError` on `undefined`. |
| AC-11 | **BEHAVIOURAL** | `refusedVerbs` and `conditionalVerbs` are **absent** from `pij whoami --json`. |
| AC-12 | **BEHAVIOURAL** | The payload carries an explicit **schema marker** so a consumer detects the shape change deliberately rather than inferring it from a missing key. Same guard-then-compare ordering as AC-10. |
| AC-13 | **BEHAVIOURAL** | For a **non-`pa`** seat the map is equally total and uniformly `allow` — no role produces a payload in which an absence encodes anything. |
| AC-14 | **BEHAVIOURAL** | The `toEqual` pin at `cli.inbox.integration.test.ts:207` is **preserved, not downgraded**, and asserts the map is **exhaustive** (its key set equals the classification table's), not merely present. |
| AC-15 | **PROCESS** | The three in-repo test files are **updated to the new shape**, never relaxed to accommodate it. Verified by reading the diff for weakened assertions. |
| AC-16 | **PROCESS** | Documentation and **live instructional material** asserting the two-bucket payload is corrected or explicitly superseded — including `government/briefs/pa-standup-recipe.md:12` and `government/briefs/pa-missing-anaconda-2026-07-31.md:23-26`, which are standing instructions to real PA seats, not history. Verified by a **repository-wide** `rg --hidden` sweep returning only deliberate historical records (archived plans, execution logs). |

**Tally**: 10 BEHAVIOURAL · 1 MUTATION-ONLY · 4 PRESERVED-PROPERTY · 0 NEW-API · 3 PROCESS — 18 criteria. Ten must be watched failing before any implementation begins (§ Pre-fix RED gate); AC-04b cannot be and is discharged by mutation 13 instead.

### Pre-fix RED gate — mandatory, before implementation

> **"Must fail without the fix" is a claim about a test, and it deserves the same evidence bar as any other claim.** A criterion written from the same mental model that wrote the fix will pass vacuously by default, not by carelessness.

Before a single line of the implementation is written, each phase runs its BEHAVIOURAL tests against the **unfixed** tree and **records the actual failure output** in `assets/execution.log.md`.

Rules:

- A behavioural criterion that **passes** on the pre-fix tree is a **defect in this plan** — it must be rewritten or discarded, not explained.
- A behavioural criterion that fails with an **error or crash** (e.g. `TypeError: Cannot read properties of undefined`) does **not** satisfy the gate — it proves the field is missing, not that the behaviour is wrong. Restructure it to assert presence first, then content, so the pre-fix run is a clean assertion failure.
- **PRESERVED-PROPERTY criteria are expected to pass here.** That is not a finding; it is what they are. They are proven by their mutation row instead.

**Not applicable to this stream**: the s095 tick/sweep warning. This change touches no repeated tick, timer or sweep — it is a synchronous predicate and a payload projection, evaluated once per CLI invocation. No transition table is required and none is invented.

### Close-out — the seat record goes via PR, and carries this stream's corrections

**`main` is protected; a docs-only push is declined unconditionally.** The seat record therefore lands as a small PR, `s094/seat-record` → `main`, docs-only, merged by the o-prime. Budget for it — this is the *last* step of teardown, and had the original push-to-main instruction stood it would have failed for every seat in the wave, **after** each had reported done and stood down, and **invisibly**, because nothing reports *"the seat could not write its own record"*. A silent failure at the final step of a teardown ritual is the worst possible placement: the seat is gone, and the thing that would have raised the alarm is the thing that did not happen.

**Contents**: seat id · harness + model · worktree path · branch · charter path · PR number with merge sha · the `F-300`…`S-302` ledger block · and **any hypothesis this stream disproved**.

**Corrections go in the seat record, not only in the findings.** Someone arriving cold at a merged PR reads the seat record **first**, so a framing already known to be wrong gets re-derived if the correction lives only in a findings section. This stream has three that must travel:

1. **`watchdog status` was in the widening and is not** — it is not a pure read at that seam.
2. **A4 was an unreachable mutant, not a vacuous test** — the four isolation cases are sound; a red there would have meant the fix failed. The log's first version said the opposite.
3. **`AC-04b` is MUTATION-ONLY, not BEHAVIOURAL** — it has no pre-fix form, which is why its pre-fix red could only ever fire on `exitCode === 0`.

The seat record is an artifact that **cannot fail**, carrying load-bearing claims, **read first** — the exact profile that makes an uncorrected framing durable.

### Post-rebase re-proof gate — mandatory, before convergence

> **The fail-first proof was established against THIS tree, pre-merge. Convergence can invalidate it, and nothing re-runs it.** A sibling rewriting the file around a guard leaves the guard present and the suite green while the guard becomes unreachable. **Still-present and still-load-bearing are different claims, and only the first survives a rebase for free.** (Fleet ruling 2026-08-08, from s099; verified concretely 2026-07-25 by re-running a mutation revert on a combined tree.)

**Every behavioural criterion in this stream is at risk**, because every one of them either asserts on, or is asserted in, a file another stream writes:

| Criterion | Lives / asserts in | Category | Why at risk |
|---|---|---|---|
| AC-14 | `cli.inbox.integration.test.ts:207` | **4 — shared test file** | s093 owns `:219-250` in the same file. Known sequencing pair. |
| AC-01…AC-08 | subject is `core/cli.ts` (`paWatchdogRefusal`, watchdog case) | **partial collision** | s093 edits send dispatch in the same file; distant regions, but "usually merges cleanly" is not a plan. |
| AC-10…AC-13 | subject is `core/cli.ts` (whoami block) | **partial collision** | same file, different region. |
| AC-01, AC-02 (bin seam, task 1.12) | asserts the bin gate at `cli.ts:4108` | **6 — the bin** | **s093 edits `cli.ts:4212-4253`.** A restructure of the bin's argv dispatch could leave the gate unreached. |

**The bin case is the one to watch, and task 1.12's control is what catches it.** If a sibling's bin restructure caused the gate never to fire, the *positive* half of 1.12 (`chore add` permitted) would still pass — permitted is what an absent gate produces. Only the `close` control fails. **That control is therefore also this stream's post-rebase canary**, which is a second reason it must not be dropped as redundant.

**Procedure**: after any rebase and before handing the PR to convergence, re-run every row above against the **rebased** tree — the behavioural ones by re-establishing their pre-fix RED (revert the fix in-memory via `~/.pij/shared/mutate.mjs`, confirm red), the preserved-property ones via their mutation rows. Record the results in the execution log **as a separate, dated section** from the authoring-time proof. A criterion that no longer fails without the fix has lost its proof, and a green suite then proves nothing.

### Clarifications

| # | Question | Ruling | Source |
|---|---|---|---|
| C-1 | Widen the PA gate, or narrow the PA's duties? | **Widen.** *"we're not the police, we just want the work done appropriately. If PA is taking load off the Prime then that's a great thing."* | Jordan, on `#102` |
| C-2 | Keep `refusedVerbs`/`conditionalVerbs` as derived views (per #153's body), or remove them (per its amendment)? | **Remove both.** Keeping them *is* an additive change — the exact thing #153 identifies as silent to a stale consumer. A fix that is not loud is not this fix. | Prime ruling, 2026-08-08, relayed from the #153 amendment |
| C-3 | May the shared `cli.inbox.integration.test.ts` be edited (s093 also owns lines in it)? | **Yes, additively.** `toEqual` must not be downgraded; the new map is pinned with equal strictness; lines 219+ left for s093. Sequencing pair recorded on the prime's merge order. | Prime ruling, 2026-08-08 |
| C-4 | Does `watchdog status` come along with `list`? | **No — retracted.** The first draft of this plan widened `status` on the argument that it is a read. **Independent validation measured otherwise**: `status` falls through to the target path and can `store.write` a third party's sidecar via exemption reconciliation (`core/cli.ts:2374-2383`). It was an extrapolation beyond the ruling, and the extrapolation costs a write, so it is dropped. `list` alone satisfies *"a way to see what it carries"*, and it is a genuine pure read. | This plan, corrected by validation finding F2 |
| C-5 | A PA's permitted third-party `unwatch` still runs exemption reconciliation on the target's sidecar, which can **un-pause another seat's watchdog** (`watchdog.ts:88-103`). Is that acceptable? | **No.** That is supervision policy for a seat that is neither the PA nor its parent — the exact harm the target rule exists to prevent, arriving through a path the target rule does not guard. The permitted effect of a PA's self-resignation is **the removal of its own row and nothing else**. Implemented as a non-reconciling, no-op-if-absent path (task 1.9). | This plan, per validation finding F1 |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | **PASS** | 5 clarifications resolved (C-1…C-5); no `[NEEDS CLARIFICATION]` markers remain. |
| G2 | Constitution | **PASS** | P3 (no global state), P5 (constants beside their data), P8 (tests target the store/predicate), P9 (persist before mutate) all upheld; no `any`; no inline imports. |
| G3 | Architecture | **PASS** | No new module, no new port. The change is table rows, one handler predicate, and one payload projection. |
| G4 | ADR Compliance | **N/A** | No ADR governs the PA gate; the governing decisions are the two issue rulings, recorded as C-1/C-2. |
| G5 | Structure | **PASS** | All required sections present and populated. |
| G6 | Testing Alignment | **PASS** | Full TDD declared; every phase table opens with its test tasks; all 18 ACs are measurable (each names a command, a field, or a red/green outcome) and each is labelled by kind, so no preserved property is miscounted as evidence of the fix. |
| G7 | Domain Completeness | **N/A (domains off)** | `HARNESS_DOMAINS` unset. |

### Summary

Change the PA capability table from an authority model to a harm model, then replace the payload that describes it. Phase 1 moves four classifications (`spine-append`, three `chore` mutators) and splits the `watchdog` condition along its **action** axis so reads and resignation are permitted while binding stays lineage-scoped — with the still-refused set pinned as a regression guard and every row mutation-proven. Phase 2 replaces `refusedVerbs`/`conditionalVerbs` in `whoami --json` with a single exhaustive three-valued `verbs` map plus a schema marker, updates the three in-repo test files, and extends the deliberate `toEqual` pin to assert exhaustiveness. The expected outcome is a PA that can record, repair and resign, and a capability payload whose next schema change cannot be silent.

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | One table drives both seams via `paRefusal`; the bin calls it at `cli.ts:4108` and core at `core/cli.ts:3496`. | Widen in `pa-capability.ts` only. **Do not touch the bin** — it is s093's this wave, and no evidence requires it. |
| 02 | Critical | `watcherId = cmd.forSeat ?? self.value` (`core/cli.ts:2427`), and `--for` is refused for a PA at `:2307-2317`, **before** the target check. | `unwatch` can be target-unrestricted safely; the guard that made it dangerous is a different, earlier check that stays. |
| 03 | High | `watchdog list` returns **before** `cmd.id` is required (`core/cli.ts:2356-2375`). | The action check must stay ahead of target resolution; widen on the action axis or `list` is never reached. |
| 04 | High | `cli.inbox.integration.test.ts:207` pins the payload with `toEqual` *deliberately*, and it caught the last additive change weeks after being written (H-01/WIN-005). | Extend the pin; **never** downgrade to `toMatchObject`. Downgrading would silence the one mechanism that detects the defect this stream fixes. |
| 05 | High | The conditional bucket is computed only when `role === "pa"` (`core/cli.ts:2543`). | Every acceptance test constructs a `pa` descriptor. A prime's own `whoami` is not evidence. |
| 06 | Medium | `chore remove` writes a durable `removals` record (scope, name, reason, timestamp) **before** deleting; `spine-append` stamps `actor` + `actorProvenance` under the write lock. | Both widened writes already satisfy *reversible + recorded*. No new attribution work. |
| 07 | Medium | Chore scopes are `seat` \| `repo` \| `fleet` and **union**. | A PA may add a `fleet`-scoped duty for every seat. In scope per C-1, but stated here so it is a decision rather than a discovery. |
| 08 | Medium | Removal is loud only for a consumer that **indexes directly**; a defaulted read (`d.get('refusedVerbs', [])`) yields `[]` → *"nothing is refused"* — silent **and** permissive. | Cannot be fixed by any payload shape. Mitigate with AC-12's schema marker; **state it plainly in the PR** rather than let it be discovered. |
| 09 | **Critical** | A PA's permitted third-party `unwatch` runs `reconcileWatchdogExemption` on the **target's** sidecar first (`core/cli.ts:2378-2383`), and on an expired exemption that calls `withoutPause` (`watchdog.ts:88-103`) — **un-pausing a seat that is neither the PA nor its parent**. `unwatch` also writes unconditionally (`:2451-2453`), even with no subscription to remove. | Task 1.9's self-resign-only path. **The first draft's mitigation compared `watchers` and would have passed** — the defect lands in the pause/exempt fields. Found by validation, not the author. |
| 10 | **High** | `watchdog status` is not a pure read at this seam — it falls through to the same reconcile-and-write path. | `status` dropped from the widening (C-4 retracted); it stays refused and is pinned by AC-04c + mutation 12. |
| 11 | **High** | The existing refusal assertions are a **loop** (`pa-capability.test.ts:108-116`); the first failure hides every later one, so "the neighbours stayed green" is not demonstrable under mutation. | Task 1.2 converts them to one independent test per verb, and the mutation table carries one row per preserved refusal (mutations 6–11). |
| 12 | **Medium** | `government/briefs/pa-standup-recipe.md:12` and `pa-missing-anaconda-2026-07-31.md:23-26` instruct **live PA seats** to read `refusedVerbs`. A `docs/`-scoped sweep does not see them. | Task 2.8 corrects them and widens the sweep to the whole repository. |

### Phases

#### Phase Index

| Phase | Title | Objective (1 line) | Depends On |
|-------|-------|--------------------|------------|
| 1 | Widen the gate to the harm test | Move four classifications and split the `watchdog` condition by action, with the refused set pinned and every row mutation-proven. | None |
| 2 | Exhaustive verbs map, lists removed | Replace the two lists with one total three-valued map plus a schema marker, and extend the pin to exhaustiveness. | Phase 1 (the map projects the table Phase 1 changes) |

#### Phase 1: Widen the gate to the harm test

**Objective**: A PA can record, repair its roster, see what it carries, and resign — while every refusal that matters is proven still to hold.
**Delivers**:
- `spine-append` + `chore add|update|remove` reclassified `allow`.
- `watchdog` condition split by action: `list` any target · `unwatch` any target (self-resignation) · `watch` self/parent · everything else refused, **including `status`**.
- A **non-reconciling, no-op-if-absent** self-resignation path, so a PA's third-party `unwatch` cannot alter that seat's exemption state.
- Condition text rewritten to state the per-action rule.
- Acceptance + regression tests at **both** seams, one independent test per verb; 14 mutation proofs (12 flip a table row or a target rule; 13 and 14 mutate **handler ordering and guard behaviour**, which is where F1's defect actually lived).

**Depends on**: None
**Key risks**: Widening on the target axis instead of the action axis would silently fail to reach `list` (finding 03). The exemption reconcile writes a third party's sidecar on the way to the `unwatch` branch, and a test scoped to the `watchers` array cannot see it (F1). A mutation that is too broad proves nothing (H-03).

| # | Task | Success Criteria | Notes |
|---|------|------------------|-------|
| 1.1 | Write failing unit assertions in `pa-capability.test.ts` that a `pa` is permitted `spine-append` and the three `chore` mutators — **one independent `it` per verb** (`it.each`), never a loop. | Red before the table changes, green after; `paCapabilityVerb("chore","add")` still routes to its own key. | AC-01, AC-02; F3 |
| 1.2 | Convert the existing grouped refusal assertions to **one independent test per verb**, covering `close`, `spawn`, `task-close`, `attest`, `state-verify`, `orchestration`. | Green before and after; each is separately runnable so a neighbour's greenness is demonstrable under mutation. | AC-07; F3 — replaces the loop at `pa-capability.test.ts:108-116` |
| 1.3 | Write a failing dispatch-level test that a `pa` may run `watchdog list`. | Red before, green after; a non-`pa` seat unaffected. | AC-03; finding 03 |
| 1.4 | Write assertions that `watchdog status`, `pause`, `resume`, `exempt`, `reset`, `interval`, `disable-all`, `enable-all` stay refused for a `pa` — one independent test each. | Green before and after. | AC-04c; F2 |
| 1.5 | Write a failing dispatch-level test that a `pa` may `watchdog unwatch` a **third-party** target and that its own row is removed. | Red before, green after. | AC-04; finding 02 |
| 1.6 | Write the failing self-resignation isolation tests: **two sidecar fixtures × two subscription states = four cases.** Fixtures: (a) an **expired explicit** `exemptUntilMs`, (b) a **legacy** exemption with `pausedAtMs` and **no** `exemptUntilMs`. States: PA watcher **present** (expect exactly one write, whole sidecar equal except the PA's row) and **absent** (expect **zero** writes, byte-identical sidecar). | Red before, green after, in all four. | AC-04b; **F1**. Two fixtures are required because `exemptUntilMs !== undefined` **returns before** the legacy branch (`watchdog.ts:80-92`) — one combined fixture exercises one path while looking like it covers both. |
| 1.7 | Write assertions that `watchdog watch <stranger>` is still refused and `--for` is still refused **including when self-named**. | Green before and after; the `watch` test goes red under mutation 5, the `--for` test under mutation 14. | AC-05, AC-06 |
| 1.8 | Reclassify `spine-append` and `chore add|update|remove` to `ALLOW`, with the harm-test rationale recorded at the rows. | 1.1 green; 1.2 still green. | AC-01, AC-02 |
| 1.9 | Change `paWatchdogRefusal` to return a **three-valued** result — refusal · full access · **self-resign-only** — and give the watchdog handler a self-resign branch that **returns before the generic reconciliation block at `core/cli.ts:2378-2383`**, removes only the caller's own watcher row, and **writes nothing when that row is absent**. | 1.6 green in all four cases; every non-`pa` caller's path byte-identical to today. | **F1**. The early return is the load-bearing part — a branch placed *after* the preamble is "non-reconciling" in intent only. |
| 1.10 | Permit `list` and target-unrestricted `unwatch` in the action split; the action check stays **ahead** of target resolution. | 1.3/1.5/1.7 green; the `--for` branch remains first. | AC-03…AC-06; finding 03 |
| 1.11 | Replace `PA_WATCHDOG_CONDITION` with per-action wording, kept as the single named constant beside the table (P5). | `pij whoami` renders it; `paConditionalWhy("watchdog")` returns it; three surfaces still agree. | AC-08 |
| 1.12 | Add bin-seam coverage in `cli.integration.test.ts`: a **positive** `chore add` (the verb that exercises the raw-argv `paCapabilityVerb(top, argv[3])` subverb mapping) plus a **still-refused control at the same seam** — `close`, which proves the bin gate fires at all. **The mapping's own proof is mutation 2 run at the bin**, not a second test: after the widening no chore subverb is refused, so no refused *chore* control can exist. | Both seams proven; a `PIJ_SESSION_ID`-only test is not accepted as bin coverage. | **F6**; H-04 (DL-007). Control corrected after the coder observed that the widening removes the refused chore case — a positive-only bin test would pass even if the seam never consulted the table. |
| 1.13 | Run the Phase 1 mutation table and record each result in `assets/execution.log.md`. | Every mutation red in the named test; every named neighbour green; `git diff` clean afterwards. | AC-09; H-02, H-03 |

**Mutation proofs (Phase 1)** — one per changed row **and one per deliberately preserved refusal** (F3).

| # | Mutation | Must turn red | Must stay green |
|---|---|---|---|
| 1 | `spine-append` back to `refuse` | 1.1's spine test | 1.1's chore tests |
| 2 | `chore add` back to `refuse` | 1.1's `chore add` test **and 1.12's bin-seam test** | 1.1's `chore update`/`remove` tests |
| 3 | `watchdog list` dropped from the permitted actions | 1.3 | 1.5 |
| 4 | `unwatch` re-restricted to self/parent | 1.5 | 1.7's `watch` test |
| 5 | `watch` widened to any target | 1.7's `watch` test | 1.5 |
| 6 | `close` flipped to `allow` | 1.2's `close` test | every other 1.2 test |
| 7 | `spawn` flipped to `allow` | 1.2's `spawn` test | every other 1.2 test |
| 8 | `task-close` flipped to `allow` | 1.2's `task-close` test | every other 1.2 test |
| 9 | `attest` flipped to `allow` | 1.2's `attest` test | every other 1.2 test |
| 10 | `state-verify` flipped to `allow` | 1.2's `state-verify` test | every other 1.2 test |
| 11 | `orchestration` flipped to `allow` | 1.2's `orchestration` test | every other 1.2 test |
| 12 | `status` added to the permitted actions | 1.4's `status` test | 1.3 |
| 13 | Self-resign branch moved to **after** the reconcile preamble (i.e. reverting only the early return of 1.9) | 1.6's four cases | 1.5 |
| 14 | The `--for` guard removed for a `pa` | 1.7's `--for` test | 1.7's `watch` test |

#### Phase 2: Exhaustive verbs map, lists removed

**Objective**: No belief about capability is formable from an absence, and the next change to this payload cannot be silent.
**Delivers**:
- `verbs`: a total three-valued map in `whoami --json`.
- `refusedVerbs` / `conditionalVerbs` **removed**.
- An explicit schema marker.
- The `toEqual` pin preserved and extended to assert exhaustiveness.
- Three in-repo test files updated; `docs/how/pij-watchdog.md` corrected; the fleet ledger block appended.

**Depends on**: Phase 1
**Key risks**: A 63-key literal in the integration pin would invite a future author to downgrade it to `toMatchObject` — silencing the alarm this stream exists to protect (finding 04, R-01).

| # | Task | Success Criteria | Notes |
|---|------|------------------|-------|
| 2.1 | Write a failing test that a **`pa`** seat's `whoami --json` carries `verbs` with exactly one entry per classified verb, each three-valued. Scoped explicitly to a `pa` payload. | Red before, green after; key set compared against `PA_VERB_CLASSIFICATION`, not a hand-list. `toHaveProperty` guard precedes the comparison. | AC-10; **F4** — the PA/non-PA split is what makes mutation 9's neighbour claim true |
| 2.2 | Write a failing test that `refusedVerbs` and `conditionalVerbs` are **absent** (`not.toHaveProperty`), for both a `pa` and a non-`pa` seat. | Red before, green after. | AC-11 |
| 2.3 | Write a failing test that a **non-`pa`** seat's map is equally total and uniformly `allow`. A distinct test from 2.1, so mutation 9 has a real green neighbour. | Red before, green after. | AC-13; finding 05, **F4** |
| 2.4 | Write a failing test that the payload carries the schema marker at its declared value. | Red before, green after. | AC-12 |
| 2.5 | Replace the two lists in the `whoami` projection with the exhaustive map + marker; keep the human text surface behaviour-equivalent. | 2.1–2.4 green; `pij whoami` (non-JSON) still prints role, refusals and the condition line. | AC-10…AC-13 |
| 2.6 | Update `core/cli.test.ts` (15 references) and `cli.integration.test.ts` (5) to index the map. | Assertions **strengthened or equivalent** — no `toContain` on a list replaced by something weaker. | AC-15 |
| 2.7 | Update `cli.inbox.integration.test.ts:207`: keep `toEqual`, add `verbs` + the marker, and assert the map's key set **equals** the table's. | Pin still `toEqual`; exhaustiveness asserted, not shape-matched; lines 219+ untouched. | AC-14; C-3, finding 04 |
| 2.8 | Correct `docs/how/pij-watchdog.md:87-93`, **`government/briefs/pa-standup-recipe.md:12`** and **`government/briefs/pa-missing-anaconda-2026-07-31.md:23-26`** — the last two are standing instructions to live PA seats, not history. | A **repository-wide** `rg --hidden 'refusedVerbs\|conditionalVerbs'` returns only deliberate historical records (archived plans, execution logs, the 084 flight plan). | AC-16; **F5** |
| 2.9 | Append the `F-300` / `W-300` / `S-300` block to `docs/how/fleet/ledger.md`. | Every row carries evidence and cost. | Fleet brief §6 |
| 2.10 | Run the Phase 2 mutation table and record results. | Each mutation red in the named test; neighbours green. | AC-09 |
| 2.11 | Add a comment at `pa-capability.test.ts`'s verb-surface scrape naming the pin in `cli.inbox.integration.test.ts` that depends on it. | The scrape states that deleting it removes the only table→reality proof, leaving the payload pin blind to table shrinkage. | **Coder's finding via A5** — the two proofs are in different files and nothing connects them; a future author deleting the scrape would not know what else it holds up. |

**Mutation proofs (Phase 2)** — numbered continuously with Phase 1 so a mutation id is unambiguous across the plan.

| # | Mutation | Must turn red | Must stay green |
|---|---|---|---|
| 15 | Drop one verb from the emitted map | 2.1 and 2.7's exhaustiveness assertion | 2.2 |
| 16 | Re-add `refusedVerbs` beside the map | 2.2 | 2.1 |
| 17 | Emit the map only when `role === "pa"` | 2.3 | 2.1 |
| 18 | Bump/remove the schema marker value | 2.4 | 2.1 |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.1, 1.8 | unit + mutation 1 |
| AC-02 | 1.1, 1.8 | unit + mutation 2 |
| AC-03 | 1.3, 1.10 | dispatch test + mutation 3 |
| AC-04 | 1.5, 1.10 | dispatch test against a stranger + mutation 4 |
| AC-04b | 1.6, 1.9 | four-case whole-sidecar + write-count test + mutation 13 |
| AC-04c | 1.4 | per-action refusal tests + mutation 12 |
| AC-05 | 1.7, 1.10 | dispatch test + mutation 5 |
| AC-06 | 1.7 | dispatch test (self-named `--for`) + mutation 14 |
| AC-07 | 1.2 | six independent tests + mutations 6–11 |
| AC-08 | 1.11 | `paConditionalWhy` + `pij whoami` render |
| AC-09 | 1.13, 2.10 | both mutation tables (1–14, 15–18), logged |
| AC-10 | 2.1, 2.5 | PA payload test + mutation 15 |
| AC-11 | 2.2, 2.5 | `not.toHaveProperty` + mutation 16 |
| AC-12 | 2.4, 2.5 | marker test + mutation 18 |
| AC-13 | 2.3, 2.5 | non-`pa` totality test + mutation 17 |
| AC-14 | 2.7 | the preserved `toEqual` pin |
| AC-15 | 2.6, 2.7 | updated test files, diff-reviewed for weakening |
| AC-16 | 2.8 | `rg` sweep (with `--hidden`) |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| A PA's third-party `unwatch` un-pauses another seat's watchdog via exemption reconciliation, and a test scoped to `watchers` cannot see it. | **Measured — was live in the first draft of this plan** | Critical | Non-reconciling, no-op-if-absent self-resignation path (task 1.9); the test compares the **whole sidecar** plus a write count (task 1.6, AC-04b); mutation 13 pins it. Found by independent validation, not by the author. |
| A defaulted-read consumer (`get('refusedVerbs', [])`) reads `[]` as *"nothing is refused"* — silent **and** permissive. | Certain for any such consumer | High | **Unfixable by payload shape; do not paper over.** Removal is still strictly better (today both the defaulted and the direct reader are wrong; after, only the defaulted one is). Add the AC-12 schema marker and **state the residual plainly in the PR**. |
| The `toEqual` pin gets downgraded to `toMatchObject` to avoid a large literal. | Medium | Critical | Assert **key-set equality against the imported table** rather than inlining 63 keys (F-12). Plan 084 explicitly forbade the downgrade; C-3 restates it. |
| Widening on the target axis misses `list`, which branches before target resolution. | Medium | Medium | Finding 03; task 1.8 fixes the axis explicitly and mutation 3 proves it. |
| A mutation too broad passes a vacuous test. | Medium | Medium | Each mutation names both a red test and a green neighbour (H-03). |
| `cli.inbox.integration.test.ts` conflicts with s093 at merge. | Low | Medium | Additive edit confined to `:207`; prime holds the sequencing pair and merges this one deliberately. |
| A `fleet`-scoped chore added by a PA creates a duty for every seat. | Low | Medium | In scope per C-1; recorded as finding 07 so it is a decision, not a discovery. Escalate only if the prime narrows it. |
