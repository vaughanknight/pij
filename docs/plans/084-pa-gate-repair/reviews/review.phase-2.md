# Review — plan-084 Phase 2 (Make the gate target-scoped)

**Verdict**: ⚠️ **REQUEST_CHANGES** — 2 × MEDIUM, both test-boundary gaps; no defect in shipped behaviour.
**Reviewed** 2026-08-05 · base `efcc889` (uncommitted) · branch `s091/pa-gate-repair`
**Cold reviewer**: `phase2-reviewer` (gpt-5.6-sol) · **Persisted by** `pij-respectable-starfish` (reviewer is read-only)

The Phase-1 reviewer's bare "APPROVE, no significant issues" was rejected and re-run; this
reviewer was told so up front and asked to answer eight questions with `file:line` evidence
**including the clean ones**, plus: *"what would you flag that neither the orchestrator nor the
coder has mentioned?"* **Finding 2 is the answer to that question**, and it is the one that
matters.

## Clean, with evidence

| # | Question | Verdict | Key evidence |
|---|---|---|---|
| 1 | Is the allowance NARROW? | **Clean** | Exactly 4 newly-permitted mutations: `watch`/`unwatch` × self/`effectiveParent`. Handler restricts to `watch\|unwatch` then calls `paTargetDecision` once (`core/cli.ts:2283-2289`); write replaces only the caller's entry (`:2372-2390`). `pause/resume/exempt/reset/interval/status` refused at `:2283-2285`; `disable-all/enable-all/list` at `:2305-2334`. `dispatch-packet`/`task-set` rearm paths stay flatly refused. |
| 2 | BOTH seams | **Clean** | `conditional` → `null` from `paRefusal` (`pa-capability.ts:198-209`), so bin (`cli.ts:539-549`, fired `:4097-4102`) and core (`core/cli.ts:2229-2236`) both pass; enforcement occurs **once**, in the handler. Every bin early-branch token enumerated; the only conditional one returning pre-handler is `watchdog --help`, which is output-only. |
| 3 | Fail-closed polarity | **Clean** | Refuses on `undefined`/`null`/whitespace target (`pa-target.ts:67-70`), absent `effectiveParent` (`:73-77`), non-self/non-parent (`:79-82`); unregistered-but-valid target stopped in the handler (`core/cli.ts:2335-2338`). Caller identity still fails **open** by design in both seams. |
| 4 | Exhaustiveness (PR #71 law) | **Clean, with a caveat → Finding 1** | `_exhaustive: never` at `pa-capability.ts:213`; a new role breaks `role.ts:49-55`. Deleting a normal entry reddens the scrape (`pa-capability.test.ts:48-63`). |
| 5 | `ack-dispatch` (#99) | **Clean; log claim verified** | Recipient enforced for **every** role at `core/cli.ts:4267-4275`, before receipt construction. Non-recipient PA leaves the dispatch unacked with no spine event (`core/cli.test.ts:6585-6604`). Recipient comes only from `previous.to`; argument shape cannot override it. **The conditional reclassification is therefore not new enforcement — it stops refusing earlier and lets the pre-existing check do the authorising.** |
| 6 | AC-14 read count | **Clean** | `paGate` returns before `selfId`/registry for allowed, unclassified **and** conditional verbs (`core/cli.ts:2229-2236`); caller/target resolution live in the handler. Zero-read assertion intact. |
| 7 | Test non-vacuity | **Clean for the "prime" pin** | Its three refusal strings use only `pij-pa`, `pij-boss`, `pij-stranger`, `undefined` (`pa-target.test.ts:102-110`); no fixture or interpolated literal in the file contains `prime`; names/comments never enter `decision.why`. |

## Findings

### MEDIUM — 1. The totality scrape does not cover nested `chore` subverbs

`pa-capability.test.ts:23` scrapes only the top-level `chore` token. `paCapabilityVerb`
hand-recognises three mutators (`pa-capability.ts:231-235`) while the real vocabulary lives in
`core/chores/cli-verbs.ts:1046-1063`. **A newly added mutating chore subverb would inherit
`chore: ALLOW` without failing the build** — defeating AC-12's claimed "a new verb fails the
build" property for a bin-owned mutation family.

Pre-existing (not introduced by Phase 2), but it makes **AC-12's claim overstated as written**,
and it lands directly on `#102`/task 2.9, which is about exactly these subverbs.

### MEDIUM — 2. Every runtime parent fixture is a PRIME, so the pm-parent allowance is unpinned

`core/cli.test.ts:7887` uses `desc({ id: PRIME_ID, prime: true })`; `cli.integration.test.ts:3118`
writes `write("pij-prime", { parentId: null, prime: true })`. **A regression that required the
target parent to be a prime would leave the entire suite green.**

The new string pin cannot catch it — `paTargetDecision` never receives the target's descriptor,
so it has no notion of the target's role at all.

**This is the behavioural twin of Key Finding 10.** KF-10 was the *wording* calling a `pm` "its
own prime"; this is the same wrong model, unpinned in *behaviour*. The Phase-2 live proof
already demonstrated a real PA whose parent is role `pm` (`pij-respectable-starfish`), so losing
that allowance would recreate the repaired defect **with a green suite**.

Orchestrator independently verified both fixtures before dispatching the fix.

## Disposition

| Finding | Action |
|---|---|
| 2 | **Fix now** — make at least one handler test and the bin-shaped test use a **non-prime (`pm`) parent** and assert `watch`/`unwatch` still succeed. |
| 1 | **Fix now if cheap** — extend the scrape to a total chore-subverb vocabulary. If not cheap, **narrow AC-12's wording** to state the known limit rather than overstate the property. Do not leave the claim as-is. |

Neither finding is a defect in shipped behaviour. Both are gaps in the **proof**, which on a
permission boundary is the thing being sold.
