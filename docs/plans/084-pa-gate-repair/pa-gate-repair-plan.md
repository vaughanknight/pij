# PA Capability Gate Repair — target-scoped permission, prime repair path, and a visible role
**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-08-05
**Status**: READY
**Spec source**: unified (this file)

ℹ️ No `research-dossier.md` — evidence was gathered by direct source verification and two
parallel research passes; findings are folded into § Key Findings with `file:line` citations.

## Business Specification

### Summary

A `pa` (Prime Assistant) seat is read-only **by construction** — a capability gate refuses it
the verbs that change lineage, authority, or another seat's state. Three open issues
(`#95`, `#99`, `#102`) report the same structural mistake from three angles: **the gate is
scoped by *party* when it should be scoped by *target*, and it is keyed on a field no
inspection verb displays.** The result is a seat that is refused the only actions it is
uniquely positioned to take, cannot discover that it is refused, and cannot be repaired by
anyone except a human editing JSON by hand.

This plan makes the gate target-aware, gives a prime a real repair path that preserves
evidence, and makes the keying field visible.

### Goals

- A `pa` can bound and unbind **its own** supervision subscription without a privilege round-trip.
- A prime can subscribe or re-bind **on another seat's behalf** — the recovery path when a seat
  is already stamped, unreachable, or dead.
- Re-binding a subscription **never destroys the record of when it was created**.
- Any seat, its supervisor, or a peer can determine **from `pij state` alone** whether a seat is
  gated and who its parent is.
- A refusal **names the role and the field** that caused it.
- A PA can acknowledge a dispatch **addressed to it** (`#99`).
- The PA's duty/capability misalignment on `chore` roster edits and `spine-append` is resolved
  by explicit decision rather than left as an unfunded mandate (`#102`).

### Non-Goals

- **Not** a redesign of the PA role or a widening of the `watchdog` family to role `pa`.
- **Not** the sub-floor capture population census (`#96` — measurement, not code).
- **Not** the chrome-detection work (`#98`).
- **Not** a change to who the daemon supervises (`roleNeedsSupervision` already returns `true`
  for `pa`; PR `#71` made that gate total and it is not touched).
- **Not** a security perimeter. This boundary constrains a cooperative internal seat; the
  existing fail-open-on-unresolvable-caller posture is preserved deliberately.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-orchestration` | existing | **modify** | Owns `core/orchestration/` — the capability table, the refusal vocabulary, and the new target-scoped predicate |
| `pij-control-plane` | existing | **modify** | Owns the CLI surface: the two gate seams, the `watchdog watch/unwatch` handler, the `pij state` projection |
| `pij-messaging` | existing | **consume** | Dispatch/inbox receipts (`ack.seat`) are read to decide the `#99` allowance; no contract change |

`pij-orchestration/domain.md` § Source Locations predates plan 078 and does not list
`pa-capability.ts`. Phase 2 adds it — a domain doc that omits its own gate is the same
invisibility defect this plan exists to fix.

### Testing Strategy

- **Approach**: Full TDD. `AGENTS.md` (`.pi/extensions/pij/AGENTS.md`) mandates a `.test.ts`
  sibling per module (Pattern P8) and mutation-gated review as house practice.
- **Rationale**: this is a permission boundary. Every allowance must be proven to be *narrow* —
  a test that only asserts "the PA can now watch its parent" is worthless without its twin
  asserting "and is still refused for every other target".
- **Focus areas**: the totality property of `PA_VERB_CLASSIFICATION`; target-scoped
  allow/refuse pairs; `addedAt` preservation across re-bind; both gate seams reached by a real
  CLI-shaped invocation, not just the pure predicate.
- **Excluded**: no new smoke scenario — this is CLI/core logic with no tmux surface.
- **Mock usage**: **none**. Real fixtures and the existing fakes in `adapters/fakes.ts` only
  (Pattern P8).

### Documentation Strategy

- **Location**: `docs/how/pij-watchdog.md` only.
- **Rationale**: the brief names it, and it is the operator-facing guide whose behaviour changes.
  No README change — this is not a quick-start concern.

### Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=0, T=2 → 8
- **Confidence**: 0.85
- **Assumptions**: the `PaCapability` union may gain a third arm (it is internal to this repo,
  with 4 known consumers, all enumerated in Key Finding 05).
- **Dependencies**: none external. Base `00e140e` (PR #100).
- **Risks**: see § Risks.
- **Phases**: 3.

### Acceptance Criteria

| id | Criterion |
|---|---|
| AC-01 | `pij state <id> --json` emits `orchestrationRole` and **`parent`** as first-class keys; both are present (value or `null`) for **every** descriptor, never absent. `parent` carries `effectiveParent(d)` — the same notion and the same key name `pij list` and `pij node show` already project (Key Finding 09). |
| AC-01b | For a descriptor with `parentId` **absent** and `spawnedBy` **set**, `parent` reports the `spawnedBy` seat — and the Phase-2 predicate agrees. A raw-`parentId` reading would refuse a spawned-but-never-linked PA permission over its real parent, rebuilding this issue's own trap. |
| AC-02 | `pij state <id>` text output shows role and parent when set. |
| AC-03 | A gate refusal names **both** the role and the field that keyed it (e.g. `role 'pa' (field: orchestrationRole)`). |
| AC-04 | A `pa` whose `parentId` is `P` can run `pij watchdog watch P` and `pij watchdog unwatch P` successfully. |
| AC-05 | The same `pa` is **still refused** `watchdog watch X` for any `X` that is neither itself nor `P`, and is still refused every other `watchdog` action (`pause`/`resume`/`exempt`/`reset`/`interval`/`disable-all`/`enable-all`) for **every** target. |
| AC-06 | The allowance is enforced identically whether the verb arrives via the bin seam or the core dispatch seam — proven by a test that exercises the bin-shaped path, not only the pure predicate. |
| **AC-06b** | **The allowance is demonstrated at the LIVE COMMAND LINE against built code** — a `pa` refused for a non-parent target and allowed for its own parent, captured as verbatim CLI transcripts. A green test on a two-seam gate proves one seam; this is the proof that the *other* seam agrees. **No daemon restart required** — determined by observation 2026-08-05, not assumed: the refusal is adjudicated in the **CLI process, per invocation**, so a worktree edit is live to `just pij` immediately. The daemon runs from the *main* checkout and never sees worktree source. **Bind to the worktree CLI (`just pij`), never bare `pij`** — bare `pij` resolves to the main checkout (`harness/scripts/pij-cli.cjs`) and would silently prove nothing. *(Constraint raised by o-prime `pij-continuing-ermine`; its challenge to the assumed restart is what removed the baton.)* |
| AC-07 | `pij watchdog watch <target> --for <seat>` registers `<seat>` as the watcher of `<target>`, not the caller. |
| AC-08 | `pij watchdog unwatch <target> --for <seat>` removes `<seat>`'s subscription. |
| AC-09 | Re-binding an existing subscription (any path: plain `watch`, PA self-serve, or `--for`) **preserves the original `addedAt`**; a genuinely new subscription stamps it. |
| AC-10 | A `pa` caller is refused `--for` (it would bypass the target restriction). |
| AC-11 | A `pa` that is the recipient of dispatch `D` can run `pij ack D --packet-sha …`; a `pa` that is **not** the recipient is refused. |
| AC-12 | `PA_VERB_CLASSIFICATION` remains **total** — `pa-capability.test.ts`'s scrape still fails the **build** on any unclassified verb, **including nested `chore` subverbs** (scraped from `core/chores/cli-verbs.ts`, with a self-guard so a regex matching nothing cannot make the test vacuous). **This is a build-time property only.** An unclassified verb is still *permitted at runtime* by deliberate policy — the gate is a capability boundary for a cooperative internal seat, not a security perimeter, and refusing unknown verbs would break every future verb until someone remembered this file. The exhaustive test, not a runtime default, is what keeps the table total. |
| AC-13 | `pij whoami --json` reports conditionally-permitted verbs distinguishably from flatly-refused ones (it currently lists `watchdog` as flatly refused, which becomes untrue). |
| AC-14 | The read-count invariant at `core/cli.test.ts:5136` still passes — no new registry read is added to the gate's hot path. |

### Risks & Assumptions

See § Risks in the implementation half (single table, not duplicated here).

### Open Questions

| # | Question | Owner | Status |
|---|----------|-------|--------|
| OQ-1 | `#102`: Jordan ruled "bring them in", but the issue itself judges `chore add/update/remove` and `spine-append` *coherent, not self-defeating*. Phase 2 proposes: **allow `spine-append`** (per-seat attributed, append-only, therefore distinguishable and non-destructive — Key Finding 08) and **keep `chore add/update/remove` refused** with an improved message naming the relay path. | Jordan | **Open — asked, not blocking Phase 1** |

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| The `--for` ownership model | CLI Flow | `--for` can overwrite another seat's subscription because the existing filter keys on the *caller*, not the *target watcher* (Key Finding 03). | Should `--for` refuse when the named seat already has a subscription? Should it require `--rebind` to be explicit? |

### Clarifications

#### Session 2026-08-05

| Q | A (Jordan, verbatim) | Effect |
|---|---|---|
| Preserve `addedAt` on every re-bind path, or only `--for`? | *"original"* | Every path — R-01. AC-09. |
| Should the PA allowance cover `unwatch` as well as `watch`? | *"yes"* | Target-scoped across both actions — R-02. AC-04. |
| Are `#99` and `#102` in scope? | *"yes bring them in"* | Both in — R-03. AC-11, OQ-1. |
| Build as one chunk or reviewable stages? | *(no answer within 66 min; defaulted to stages, declared to o-prime, reversible)* | Mode: Full, 3 phases. |

Full verbatim record with readings: [`rulings.md`](./rulings.md).

Prior ruling on `#95` itself (2026-08-05, pre-stream): implement **both** the PA-self-serve fix
and the prime-acts-on-behalf `--for` fix, and **fold** the `pij state` projection fix into the
same issue.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: **the `--for` ownership model** (unworkshopped — Phase 3 designs it inline against Key Finding 03).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | Two parallel research passes ran instead; findings folded into § Key Findings |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No `[NEEDS CLARIFICATION]` markers remain. OQ-1 is a tracked open question against Phase 2, not a blocking marker. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md`. |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` (project rules are `harness.md`, `agent-harness.md`). |
| G4 | ADR Compliance | N/A | No `docs/adr/`. |
| G5 | Structure | PASS | All required sections present and populated; cross-refs resolve. |
| G6 | Testing Alignment | PASS | TDD declared; every phase leads with its test task. |
| G7 | Domain Completeness | PASS | All 3 target domains exist in `docs/domains/registry.md`; no NEW domains; manifest covers every file in every task table. |

### Summary

The gate refuses by *party* (`role === "pa"`) when the real rule is about the *target* of the
action. This plan introduces a third `PaCapability` arm — **conditional** — so the table stays
total while deferring the decision to the one place that knows the target, then implements the
target predicate, the `--for` repair path, and the `addedAt` preservation the sanctioned path
currently destroys. Because a gate whose keying field is invisible cannot be self-diagnosed,
the projection fix lands **first** so the later phases are verifiable at the command line
rather than only in tests.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/cli.ts` | `pij-control-plane` | contract | `pij state` projection, both handler seams, refusal wiring |
| `.pi/extensions/pij/core/cli.test.ts` | `pij-control-plane` | internal | Handler + projection tests |
| `.pi/extensions/pij/cli.ts` | `pij-control-plane` | contract | Bin seam (`paBinRefusal`) + raw-argv target resolution |
| `.pi/extensions/pij/cli.integration.test.ts` | `pij-control-plane` | internal | Bin-shaped path proof (AC-06) |
| `.pi/extensions/pij/core/orchestration/pa-capability.ts` | `pij-orchestration` | contract | The table, the `PaCapability` union, refusal text |
| `.pi/extensions/pij/core/orchestration/pa-capability.test.ts` | `pij-orchestration` | internal | Totality scrape + allow/refuse pairs |
| `.pi/extensions/pij/core/orchestration/pa-target.ts` | `pij-orchestration` | contract | **NEW** — the target-scoped predicate (no such helper exists — Key Finding 01) |
| `.pi/extensions/pij/core/orchestration/pa-target.test.ts` | `pij-orchestration` | internal | **NEW** — predicate unit tests |
| `.pi/extensions/pij/core/tree.ts` | `pij-control-plane` | consume | `effectiveParent` — the authoritative parent notion for both the projection and the Phase-2 predicate (Key Finding 09); **read-only, not modified** |
| `docs/domains/pij-orchestration/domain.md` | `pij-orchestration` | contract | Add `pa-capability.ts` + `pa-target.ts` to Source Locations |
| `docs/how/pij-watchdog.md` | `pij-control-plane` | contract | Document the PA allowance, `--for`, and `addedAt` preservation |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | **No parent/ownership helper exists anywhere.** `parentId` is a raw optional field (`core/types.ts:184`); no `isParent`/`ownsTarget` predicate in `core/`, `core/orchestration/`, or the bin. | Write `pa-target.ts` as a new pure module in `pij-orchestration`. Pi-free, DI-free, pure function — Patterns P2/P4. |
| 02 | Critical | **The gate has two seams and the one that fires FIRST cannot see the target.** `cli.ts:4098` (`paBinRefusal`) runs on raw argv for every top token *before* core parse; `core/cli.ts:2233` (`paGate`) runs inside `dispatch()`. `pij watchdog watch <id>` is refused at seam 2 and never reaches seam 1 — the bin's `top === "watchdog"` branch (`cli.ts:4130`) is only a `--help` shortcut. | A fix in `paGate`/`paRefusal` alone **passes its unit tests and still refuses at the CLI**. Both seams must let the verb through (via the `conditional` arm) and the handler must enforce. AC-06 exists to prove this. |
| 03 | Critical | **`--for` can hijack a subscription.** The handler filters existing watchers by `watcher.watcherId !== self.value` (`core/cli.ts:2318`) — keyed on the **caller**. With `--for X`, X's pre-existing subscription is not filtered, so the append produces a **duplicate** entry for X. `unwatch` has the mirror defect: it removes only `self.value`, so a `--for`-created subscription is un-removable by its own owner. | Re-key the filter on the **effective watcher id** (`--for` value, else self) for both `watch` and `unwatch`. This is the same one-line-shaped fix that makes AC-08 and AC-09 possible. |
| 04 | High | **`addedAt` is currently read by nothing.** `watchdogBlock` (`core/cli.ts:1844`) projects `.map(w => w.watcherId)`, discarding it; `renderWatcherRoster` (`core/watchdog.ts:456`) takes `string[]`. No staleness or anomaly reader touches it. | Preserving it changes **no observable output** — the change is safe. But it also means the only evidence a re-bind occurred disappears: emit a spine/log line on re-bind so the trail is not silently lost. |
| 05 | High | **Changing `paRefusal`'s signature ripples to 4 consumers**, one of which has no target concept: `core/cli.ts:2233` (seam 1), `cli.ts:~545` (seam 2), `core/cli.ts:2409` (**`whoami` capability projection — enumerates refused verbs with no target**), and `pa-capability.test.ts`. | **Do not change `paRefusal(role, verb)`.** Add the third union arm + a separate `pa-target.ts` predicate. `whoami` then needs AC-13 so it stops claiming `watchdog` is flatly refused. |
| 06 | High | **A registry read in the gate would violate a live invariant.** `core/cli.test.ts:5136` asserts `reads === 0` for a 25-node `tree --global --json`; `paGate`'s own comment records that "existing read-count invariants caught exactly that". | Resolve the **target** inside the watchdog handler (`core/cli.ts:2316`), never in the gate. The gate keeps its current behaviour: zero reads for allowed verbs, one for refused. AC-14. |
| 07 | High | **`ack-dispatch`'s recipient is not knowable at the gate.** The gate sees only `cmd.verb`; the dispatch record is resolved later in the handler (`cli.ts:4133`). `core/platform/dispatch.ts:100` already validates `ack.seat !== dispatch.to`, and `core/inbox.ts:287` binds the receipt to `ack.seat`. | Same `conditional` treatment: let it past the gate, enforce recipient-identity in the handler where the dispatch record exists. The existing `dispatch.ts:100` check is the natural home. |
| 11 | **Critical** | **KEY FINDING 10'S BEHAVIOURAL TWIN — we fixed the sentence and left the belief untested.** Every runtime parent fixture is a **prime**: `core/cli.test.ts:7887` (`desc({ id: PRIME_ID, prime: true })`) and `cli.integration.test.ts:3118` (`write("pij-prime", { parentId: null, prime: true })`). **A regression that required the target parent to BE a prime would leave the entire suite green.** The KF-10 string pin cannot catch it — `paTargetDecision` never receives the target's descriptor and has no notion of the target's role. Found by the Phase-2 cold reviewer; missed by the coder, the orchestrator, **and** the o-prime who found KF-10 itself. | **A WORDING FIX AND A BEHAVIOUR FIX ARE DIFFERENT FIXES, AND CORRECTING THE FIRST FEELS LIKE DOING BOTH.** Remedy: at least one handler test and the bin-shaped test must use a **non-prime (`pm`) parent** and assert `watch`/`unwatch` still succeed — **mutation-proved** (make the predicate demand a prime; the new fixtures must redden). Anything less re-encodes the belief. This is a **test suite that cannot return the contrary answer** — the first instance of the day's theme found inside our own verification rather than inside the product. |
| 10 | **Critical** | **A message that says "prime" where the code means "parent" is FALSE for an entire class of PAs.** `pa-target.ts` refused with *"its own prime ('pij-respectable-starfish')"* — a seat that is role `pm`, `prime: false`. The gate keys on `effectiveParent`, and **a PA's parent need not be a prime**: it is a `pm` in both the s091 topology and the o-prime's own, so this is not an edge case. Found by the o-prime reviewing the Phase-2 **live transcript** — i.e. **inside the evidence file offered as proof the gate works**. The proof was correct; the prose inside it was not. | Use **`parent`** consistently in every refusal string and comment — not a style fix, **the only word that is true in all cases**. Note the class: this is **not** an absence read as a value (the day's other defects), it is a **confident wrong value stated in the place a refused seat is most likely to trust** — strictly worse than a silent one, because it asserts rather than omits. |
| 09 | **Critical** | **The gate's notion of "parent" must be `effectiveParent`, not raw `parentId`.** `core/tree.ts:15` — `effectiveParent(d) = d.parentId !== undefined ? d.parentId : (d.spawnedBy ?? null)`. They diverge exactly when `parentId` is absent and `spawnedBy` is set — a **spawned-but-never-linked** seat. `core/cli.ts:2531` carries a load-bearing D-041 comment: `list`/`node show` deliberately project `effectiveParent(d)` under the key **`parent`**, because a raw `parentId` "would disagree with `node show` for every spawned-but-never-linked seat and buy back the class it was added to remove". *(Found by the Phase-1 coder `pij-yucky-mosquito`, 2026-08-05; verified at source by the orchestrator before ruling.)* | Project **one** key, `parent` = `effectiveParent(d)` — the repo's own name and notion. **Do not** also emit a raw `parentId`: two keys that usually agree and occasionally do not is the absent-vs-value confusion this plan exists to kill. **Phase 2's target predicate must consume `effectiveParent`** — keying it on raw `parentId` would refuse a spawned-but-never-linked PA permission over its actual parent, rebuilding `#95`'s trap inside its own fix. |
| 08 | Medium | **`spine-append` is per-seat attributed and append-only.** `core/cli.ts:4619` resolves an `actor` + `actorProvenance` on every event; `appendOnce` dedups by opId. A PA's entry is therefore distinguishable and non-destructive. | Supports the OQ-1 recommendation: allowing `spine-append` for a PA is low-risk; allowing `chore add/update/remove` (durable roster mutation) is not the same class. |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Make the gate visible | `pij-control-plane` | Project `orchestrationRole`/`parentId` in `pij state` and name role+field in every refusal | None |
| 2 | Make the gate target-scoped | `pij-orchestration` | Add the `conditional` capability arm + `pa-target.ts`, wire both seams, allow PA↔parent watch/unwatch and recipient `ack-dispatch` | Phase 1 |
| 3 | Add the repair path | `pij-control-plane` | `--for <seat>` on watch/unwatch, re-keyed watcher filter, and `addedAt` preserved on every re-bind | Phase 2 |

Phase 1 is first **because it is the verification instrument for Phases 2 and 3** — without the
projection, "is this seat gated?" is unanswerable at the command line, which is precisely how
`#95` was nearly closed as a non-problem.

#### Phase 1: Make the gate visible

**Objective**: A seat, its supervisor, or a peer can determine role and parent from `pij state`, and a refusal states its own cause.
**Domain**: `pij-control-plane`
**Delivers**:
- `orchestrationRole` + `parentId` in the `pij state --json` projection and text output
- Refusal message naming role **and** field
**Depends on**: None
**Key risks**: `pij state --json` is a consumed contract; keys must be **added**, never renamed or removed (additive/migration-safe discipline, `core/types.ts:109` comment class).

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Write failing tests: `pij state --json` carries `orchestrationRole` + `parent` for a stamped seat, a `null`-parent seat, a legacy descriptor with neither field, **and — the regression guard for Key Finding 09 — a descriptor with `parentId` absent + `spawnedBy` set, asserting `parent === spawnedBy`** | `pij-control-plane` | 4 tests red for the right reason (key absent) | TDD-first; there is currently **no** `pij state` output-shape test |
| 1.2 | Add both keys to the `state` JSON projection, using `effectiveParent(d)` for `parent` | `pij-control-plane` | 1.1 green; keys always present, `null` when unset — never absent | `core/cli.ts:3195` region; `projectOrchestrationRole` (`core/orchestration/role.ts:59`) + `effectiveParent` (`core/tree.ts:15`) |
| 1.3 | Add role/parent to the `pij state` text output when set | `pij-control-plane` | Text line shows `role: pa · parent: <id>`; absent when unstamped | Mirrors the existing `modelLine`/`effortLine` pattern |
| 1.4 | Write failing test: refusal text contains the role **and** the field name | `pij-orchestration` | Test red | Extends `pa-capability.test.ts:129` |
| 1.5 | Update `paRefusalMessage` to name role + field | `pij-orchestration` | 1.4 green; both seams emit identically (message is built in one place by design) | `pa-capability.ts` — signature unchanged |
| 1.6 | Run `harness checks --quick` | `pij-control-plane` | typecheck + lint + unit green | Fast gate; full `harness checks` runs at Phase 3 |

**Acceptance**: AC-01, AC-02, AC-03.

#### Phase 2: Make the gate target-scoped

**Objective**: The gate refuses by target, not by party, without losing its totality property.
**Domain**: `pij-orchestration`
**Delivers**:
- `PaCapability` third arm: `{ kind: "conditional"; readonly why: string }`
- `core/orchestration/pa-target.ts` — the pure target predicate
- Both seams updated to pass `conditional` through
- Handler-side enforcement for `watchdog watch/unwatch` and `ack-dispatch`
- `#102` decision applied per OQ-1
**Depends on**: Phase 1 (its projection is how this phase is verified at the CLI)
**Key risks**: Key Finding 02 — an enforcement change that lives only in `paGate` will pass unit tests and still refuse at the command line. Key Finding 06 — no registry read may enter the gate.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Write failing tests for `pa-target.ts`: self→allow, parent→allow, arbitrary→refuse, `parentId` null→**refuse**, target absent from registry→**refuse**, **and spawned-but-never-linked (`parentId` absent, `spawnedBy` set)→ALLOW via `effectiveParent`** | `pij-orchestration` | 6 tests red | Target checks fail **CLOSED**; only caller-identity keeps the existing fail-open. Key Finding 09 — the predicate consumes `effectiveParent`, never raw `parentId` |
| 2.2 | Implement `pa-target.ts` as a pure, pi-free function | `pij-orchestration` | 2.1 green | Patterns P2/P3/P4; no DI needed — takes descriptor + target id |
| 2.3 | Add the `conditional` arm to `PaCapability`; reclassify `watchdog` and `ack-dispatch` | `pij-orchestration` | Type-level exhaustiveness forces every consumer to handle it (PR #71 pattern) | `paRefusal` returns `null` for `conditional` — signature **unchanged** (Key Finding 05) |
| 2.4 | Assert the totality scrape still fails the build on an unclassified verb | `pij-orchestration` | Mutation-proven: remove one entry → suite red; restore → green | AC-12; the scrape mechanism is `pa-capability.test.ts:14-35` |
| 2.5 | Enforce the target predicate in the `watchdog watch/unwatch` handler | `pij-control-plane` | PA↔parent allowed; every other target refused with the Phase-1 message | `core/cli.ts:2316` — **in the handler, not the gate** (Key Finding 06) |
| 2.6 | Keep every non-watch/unwatch `watchdog` action refused for a PA, for all targets | `pij-control-plane` | Explicit refuse tests for pause/resume/exempt/reset/interval/disable-all/enable-all | AC-05 — the narrowness proof |
| 2.7 | **Bin-shaped** test proving the allowance survives seam 2 | `pij-control-plane` | A test exercising the raw-argv path, not just the pure predicate | AC-06; this is the test that would have caught Key Finding 02 |
| 2.8 | Enforce recipient identity for `ack-dispatch` in its handler | `pij-messaging` (consume) | Recipient PA acks; non-recipient PA refused | Key Finding 07; reuse `core/platform/dispatch.ts:100` |
| 2.9 | Apply the OQ-1 decision for `#102` | `pij-orchestration` | Allow `spine-append`; keep `chore add/update/remove` refused with a message naming the relay path — **or** as Jordan rules | Key Finding 08; do not proceed past this task without the OQ-1 answer |
| 2.10 | Update `whoami` so conditional verbs are not reported as flatly refused | `pij-control-plane` | `whoami --json` distinguishes the two | `core/cli.ts:2409`; AC-13 |
| 2.11 | Add `pa-capability.ts` + `pa-target.ts` to the domain doc's Source Locations | `pij-orchestration` | Doc lists both | A gate missing from its own domain doc is this plan's own defect class |
| 2.12 | Run `harness checks --quick` + the read-count test explicitly | `pij-control-plane` | Green, including `core/cli.test.ts:5136` | AC-14 |
| **2.13** | **LIVE CLI PROOF — the stage cannot end without it.** Run the real commands against worktree code via **`just pij`** (never bare `pij` — it resolves to the main checkout): a `pa` seat against a **non-parent** target (expect refusal, naming role + field) and against **its own parent** (expect success). Capture both transcripts verbatim. | `pij-control-plane` | Two verbatim CLI transcripts, pasted to the o-prime as return evidence | **AC-06b.** **No baton, no restart** — proven by observation that the CLI evaluates the refusal per invocation. Needs a seat stamped `pa`: stamp a disposable child with `pij link --role pa`, prove both cases, then unstamp. |

**Acceptance**: AC-04, AC-05, AC-06, **AC-06b**, AC-11, AC-12, AC-13, AC-14.

#### Phase 3: Add the repair path

**Objective**: A prime can subscribe or re-bind on a seat's behalf, and no re-bind ever destroys `addedAt`.
**Domain**: `pij-control-plane`
**Delivers**:
- `--for <seat>` on `watchdog watch` and `watchdog unwatch`
- Watcher filter re-keyed on the effective watcher id
- `addedAt` preserved on every re-bind path
- `docs/how/pij-watchdog.md` updated
**Depends on**: Phase 2
**Key risks**: Key Finding 03 — `--for` on the current caller-keyed filter produces duplicate subscriptions and un-removable entries.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Write failing test: re-binding an existing subscription preserves the original `addedAt`; a new one stamps it | `pij-control-plane` | 2 tests red | **No such test exists today** — this is the defect that destroyed evidence |
| 3.2 | Preserve `addedAt` on re-bind, copying the in-repo precedent | `pij-control-plane` | 3.1 green | `core/watch-subscription.ts:75` is the pattern; capture the prior entry **before** the filter drops it (`core/cli.ts:2318-2326`) |
| 3.3 | Emit a log/spine line on re-bind so the change is still auditable | `pij-control-plane` | A re-bind is observable without `addedAt` moving | Key Finding 04 — preserving the stamp must not erase the trail |
| 3.4 | Write failing tests for `--for`: registers the named seat; `--for` refused for a `pa` caller; `--for` on an existing subscription re-binds rather than duplicating | `pij-control-plane` | 3 tests red | AC-07, AC-10; Key Finding 03 |
| 3.5 | Add `for` to the watchdog flag set and the parsed command type | `pij-control-plane` | Flag parses; unknown-flag path unaffected | `core/cli.ts:876` flag set; type at `core/cli.ts:364` |
| 3.6 | Re-key the watch/unwatch filter on the effective watcher id | `pij-control-plane` | 3.4 green; `unwatch --for` removes the right entry | `core/cli.ts:2318`; AC-08 |
| 3.7 | Update `docs/how/pij-watchdog.md` | `pij-control-plane` | Documents the PA allowance, `--for`, and the `addedAt` guarantee | Documentation Strategy |
| 3.8 | Run **full** `harness checks` | `pij-control-plane` | All sensors green; re-run once on a red before believing it (known load-sensitivity) | The brief's ship gate |

**Acceptance**: AC-07, AC-08, AC-09, AC-10.

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.1, 1.2 | `core/cli.test.ts` — state projection tests |
| AC-01b | 1.1 (4th fixture), 2.1 (6th case) | `core/cli.test.ts` + `pa-target.test.ts` — the spawned-but-never-linked regression guard |
| AC-02 | 1.3 | `core/cli.test.ts` — text output test |
| AC-03 | 1.4, 1.5 | `pa-capability.test.ts` — message content |
| AC-04 | 2.1, 2.2, 2.5 | `pa-target.test.ts` + handler tests |
| AC-05 | 2.6 | Explicit per-action refuse tests |
| AC-06 | 2.7 | `cli.integration.test.ts` — bin-shaped path |
| AC-06b | 2.13 | Live CLI transcripts (baton-gated), pasted to the o-prime |
| AC-07 | 3.4, 3.5, 3.6 | Handler tests |
| AC-08 | 3.6 | `unwatch --for` test |
| AC-09 | 3.1, 3.2 | Re-bind preservation tests |
| AC-10 | 3.4 | PA-caller `--for` refusal test |
| AC-11 | 2.8 | Dispatch handler tests |
| AC-12 | 2.4 | Mutation-proven totality scrape |
| AC-13 | 2.10 | `whoami --json` test |
| AC-14 | 2.12 | `core/cli.test.ts:5136` (existing, must stay green) |

### Patterns worth carrying out of this stream

Three, all discovered while building rather than planned for. **Read #0 first — it is the
correction to the other two**, and it was earned the hard way, by this stream violating its own
recorded principle fifteen lines from where it wrote it down.

#### 0. A pin protects PRECISELY what it covers — and its firing creates confidence about the unpinned thing beside it

`core/usage-flags.test.ts` pinned the one-line usage string at `cli.ts:332`. It fired, correctly,
and that line was fixed. **`WATCHDOG_USAGE` at `cli.ts:342-348` was not pinned — and was not
fixed.** That block is what `pij watchdog --help` prints: **the string a human reads.**

So the new recovery flag was documented in **the string a test reads** and not in the one a
person reads. Nobody lied and nobody was careless: **the coverage boundary silently became the
work boundary.** The green test truthfully said *"the flag is documented"* — about the string it
inspects.

This is the same shape as every defect this stream filed, arriving **from inside our own remedy**:
*a check cannot return the contrary answer about the string it does not read.*

**And the irony is exact.** The sentence in pattern #1 below — *"a prime cannot use a recovery path
it cannot discover"* — was written **four hours earlier**, adopted as a pattern in this very
document, and then violated in the adjacent string by the same stream.

> **Writing a principle down does not install it. Only a check does, and only where the check
> looks.**

Remedy applied: the fix, **plus a pin on the `--help` path itself** (`cli.integration.test.ts:3370`),
which carries its own vacuity guard (`:3404` — *"if `watchdog --help` ever stopped printing the
watchdog block, every assertion above would still pass"*). The pin is the durable half; the fix
alone would have been one more thing to re-break.

**THE REMEDY — PIN THE PATH, NOT THE INSTANCE; AND GUARD THE PIN.** Pattern 0 names a failure;
this is its fix, and it came from the coder rather than from either reviewer:

| move | why |
|---|---|
| **Pin the PATH, not the flag** | A flag-level pin protects **one flag**. A path-level pin protects **every future flag on that surface**, so the coverage boundary stops being narrower than the work boundary. In the coder's words (`cli.integration.test.ts:3368`): *"This pins the HELP PATH ITSELF, not the flag list, so the failure mode recurs loudly rather than silently for the next flag too."* |
| **Guard the pin against its own hollowing** | `:3404` — *"if `watchdog --help` ever stopped printing the watchdog block, every assertion above would still pass against whatever text came back."* So it pins a token only that block contains. A pin that guards its own pin. |

> **CAVEAT, raised by the coder and recorded WITH the credit — without it the pattern is only
> half true.** A path-level pin holds **only while the helper actually reaches that surface**.
> That is what the recursive guard at `:3404` is for. **Pin the path, THEN pin that the path is
> live.** Without the second half the first half is a *better-scoped illusion* — which is the same
> failure one level up.

The discipline underneath, which is the transferable part: **catching a vacuous test in review is
good; assuming your OWN new test is vacuous until you prove otherwise is a different discipline,
and it is the one that scales.** A reviewer catches what it happens to read; a coder that guards
every pin it writes removes the class.

*(Refinement contributed by the o-prime, explicitly as a correction to its own day-long praise of
encoded pins. It is not a retraction — the three pins that fired all caught real defects. It is
the boundary condition on them.)*

#### 1. A recovery path that cannot be discovered is not a recovery path

> **A prime cannot use a recovery path it cannot discover.** *(Phase-3 coder, on why `--for` must
> appear in the usage line.)*

`#95` is a defect about **a capability nobody could see**. Shipping its fix as an
**undocumented flag** would reproduce the shape of the bug inside the cure — an invisible fix for
an invisible capability is not a fix, it is the same defect wearing a patch.

This is why a one-line usage-string change is load-bearing rather than cosmetic, and it belongs
in the PR description: a reviewer skimming that diff will not otherwise see why it mattered.

#### 2. What a LEGITIMATE escape hatch looks like — bounded, loud, and self-pinning

The recurring failure of this stream was that **the obvious fix is the destructive one**:
`toMatchObject` to silence a pin, `watchdog reset` to clear a problem (wiping a live
subscription), clearing a real parked state to quiet a sensor. Each **passes**, feels like a fix,
and removes a working mechanism.

The unanswered question underneath: *every seat under pressure will reach for an escape hatch, so
what does a legitimate one look like?* `core/usage-flags.test.ts` answers it, and the answer is
**not "no escape hatch"**:

| property | mechanism |
|---|---|
| **scoped** | the tolerated list covers **only drift predating s078** — not a general exemption |
| **loud** | each entry is **named**, "rather than tolerated in silence" (`:46`) |
| **self-pinning** | **`:80` pins the list itself** — *"a flag that gets documented must leave it"* |

**The escape hatch cannot accumulate — with one limit, found after this was written.** Using it
is visible; leaving it is compulsory.

> **LIMIT (added post-hoc, and it qualifies the claim above rather than illustrating it).** A
> self-pinning bound stops **one** unbounded grant. It does **not** stop **repeated bounded
> grants composing into one**. Demonstrated on this stream's own seat: a watchdog exemption is
> bounded by construction — 60 minutes, self-expiring, cannot silently become permanent. Four
> more hourly renewals would be **five hours of silence assembled through the very mechanism
> designed to prevent it**, and *the pin never fires, because each individual use is legitimate*.
>
> The seat declined the second renewal for that reason, which is how the limit surfaced. So the
> honest form of this pattern is: **a bounded hatch prevents accumulation by a single act, not by
> a habit.** Nothing in the mechanism can see a pattern of uses — only uses. Detecting *that*
> needs the same missing thing as `#130`: a record of outcomes across repetitions, not a check on
> each one.
>
> The corollary matters more than the caveat: **you cannot escape-hatch your way out of a missing
> measurement.** A well-shaped bound converts "silence forever" into "silence for exactly N" —
> strictly better, and strictly not a fix for why the silence was wanted.

That is the general form of the thing this repo keeps wishing existed. Set against the defects
filed from this stream — every one of them a **silent** absence — the encoded pins are the only
mechanisms that behaved correctly, and they did so **three for three**: `whoami`'s `toEqual`
(caught an additive contract change), the coder's own no-`prime` assertion (caught its own
would-be-vacuous fixture), and `usage-flags` (caught an undocumented flag). None of them silent.

### Known limits — stated, not hidden

**Re-binds are observable at the moment of action, but NOT durably auditable.** Task 3.3 asked
for a "log/spine line" on re-bind, because Key Finding 04 established that preserving `addedAt`
removes the only evidence a re-bind occurred. What shipped is in the **command's own output**
(human `re-bound (original addedAt preserved)`; `--json` `watcherRebound`) — in-fence and
assertable, which is what "observable" must mean for a proof.

What it is **not**: a durable record. A person running the command sees it; **a person reading
the sidecar later does not.** A spine event would close this and needs a new `SPINE_KIND_*` in
`core/platform/types.ts` — another domain, at the end of a stream, which is the widening this
brief forbids. **Recorded as a follow-up, not as done.** *(Surfaced by the Phase-3 coder as an
explicit scope question rather than resolved silently in its favour.)*

**`watchdog status` and `list` remain refused to a PA, which is incoherent.** A PA can read the
same watchdog block via `pij state <id> --json`, which is allowed — so refusing these two reads
blocks nothing and only reroutes it. Kept refused because no ruling covers them, AC-05 enumerates
the *mutating* actions, and refusing them matches pre-existing behaviour (no regression).
**Discipline over tidiness**: widening a narrow allowance by two verbs to make the story neater
would dilute the narrowness proof that is this plan's core deliverable. One line to change
whenever someone rules on it.

#### 3. How to handle an UNRULED policy question without guessing or blocking

`#102` (OQ-1) asked whether a PA may edit its chore roster or append to the spine. No ruling
arrived. The stream did **three** things and none of them was to wait:

1. **Did not guess a policy.** A capability boundary is exactly the wrong place to infer intent.
2. **Did not block.** Task 2.9 was the *only* task that depended on it; everything before and
   after proceeded, and Phase 3 shipped in full.
3. **Did not silently pick a side.** The incoherent behaviour was **kept** (matching pre-existing
   behaviour, so no regression) and **named as incoherent in place**, one line from changeable.

The same shape was applied to `watchdog status`/`list`: refused, recorded as incoherent, one line
either way — see § Known limits.

> **This converts an open decision from a schedule risk into a diff**, and leaves the evidence
> intact for whoever eventually rules.

*(Named as a precedent at the o-prime's request. Its own contrast is worth recording: while the
stream handled the uncertainty this way, the o-prime's `stateNote` continued describing `#102` as
"gates task 2.9" for **86 minutes** after it had stopped gating anything — the `#129` defect
again, on the seat relaying the picture upward. Handling an unruled question well is not the same
as reporting its status accurately, and the second is the harder half.)*

**Watcher updates are unlocked read-modify-write — a concurrent write can silently erase a
co-watcher or a preserved `addedAt`.** Filed as **#133**. Pre-existing and **not introduced by**
this repair, but this repair widens the writer set (a PA may now write its parent's roster; a
prime may write via `--for`), which raises collision probability against an unchanged mechanism.
Atomic *file publication* (`adapters/watchdog-store.ts:76-85`) does not make the *transaction*
atomic. **Deliberately not fixed here**: the remedy is an interprocess lock or a store-level
atomic-update API — a different change, and bolting a lock on at the end of a stream is how a
concurrency bug gets a plausible fix that is never properly exercised. Found by the Phase-3 cold
reviewer answering *"what did all three of us miss?"* — the author, the orchestrator and two prior
reviewers had all not raised it.

### Ship constraints

**The projection fix and the refusal text land together, or not at all.** The refusal message
tells a blocked seat to run `pij state <id> --json` to read its own `orchestrationRole` and
`parent`. On `main` today that command returns neither — which is `#95` itself. **A partial
ship therefore leaves the error message pointing at the defect it is teaching around.**
*(Raised by o-prime `pij-continuing-ermine`; the orchestrator hit exactly this an hour earlier
while diagnosing its own stale state and had to fall back to `pij list`.)*

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fix lands in `paGate` only and still refuses at the CLI (Key Finding 02) | **High** | **Critical** | AC-06 + task 2.7 require a bin-shaped test; the `conditional` arm is consulted by *both* seams from the one table |
| Widening `watchdog` to role `pa` instead of scoping by target | Medium | Critical | AC-05's per-action refuse tests; PR #71's exhaustive-switch law is explicitly preserved, not bypassed |
| `--for` duplicates or orphans a subscription (Key Finding 03) | **High** | High | Task 3.6 re-keys the filter on the effective watcher id; task 3.4 tests the pre-existing-subscription case |
| A registry read enters the gate hot path (Key Finding 06) | Medium | High | Target resolution lives in the handler; AC-14 keeps `core/cli.test.ts:5136` green |
| Target check fails **open** on an unresolvable relationship | Medium | High | Task 2.1 fixes the polarity by test: null parent and unknown target both **refuse** |
| `pij state --json` consumers break on a renamed key | Low | High | Additive only — keys added, none renamed or removed |
| A red suite is believed without re-running | Medium | Medium | Brief records the known load-sensitivity: `cli.integration.test.ts` fails under parallel load with a tmux socket error and passes in isolation. Re-run before believing a red, and say so |
| OQ-1 answered differently after Phase 2 starts | Medium | Low | Task 2.9 is the only `#102` task and is explicitly gated on the answer; nothing before it depends on the outcome |
