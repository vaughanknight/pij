# `pij chore` — first-class change detector + durable duty roster
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-08-02
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from `research-dossier.md`.

## Business Specification

### Research Context

The dossier established four things that shape this plan: a new verb family is an additive
dispatch branch (F-01); the testable verb template is `core/agents/cli-verbs.ts`, not the
older inline `runWatch` style (F-02); the per-seat sidecar shape is already solved by
`adapters/watchdog-store.ts` (F-03); and pij's existing 3-tier scoping (`pij agent`) already
unions at discovery — lower-precedence duplicates are "kept but marked `shadowed` — never
dropped" (`core/agents/pack.ts:1-7`) — while the **lookup** filters `!shadowed` one layer up
(`core/agents/cli-verbs.ts:116-119`). That filter is the part this feature must not carry (F-04).
Two mechanical traps are pre-documented: a top-level `.json` under `~/.pij/` is read as a
phantom peer (F-05), and verbs after the `E-NOREG` guard require a registry home (F-09).

### Summary

Turn a PA's sweep from model-work into tool-work. `pij chore` registers named probes in a
durable roster, runs them on demand, and reports either `NO CHANGE — <N> chores probed, <M> moved` or
per-chore `CHANGED` lines computed from stored fingerprints. Because the tool computes the
diff, a cheap seat can only classify and relay output it could not have invented, and
because the roster is a file rather than model context, it survives compaction, death, and
revive.

### Goals

- A change detector whose delta is **computed by the tool**, never transcribed by a model.
- A duty roster that is durable and inspectable — a revived seat runs `chore list` and
  inherits everything; a prime can see what its PA actually checks.
- Extensible by **registration, not code**: adding a chore is a row, not a patch.
- Chores scopeable to a **seat**, a **repo**, or the **fleet**, merged by union.
- A positive heartbeat with a denominator (`NO CHANGE — 7 chores probed, 0 moved`) emitted by the tool.

### Non-Goals

- Not a gate. `ack` advances a baseline and completes nothing; nothing blocks on a chore.
  (`/builder` chores are gates anchored to a plan node — a different primitive; see the
  brief's comparison table.)
- No scheduler, daemon integration, or cadence enforcement in this plan — `chore run` is
  invoked by whoever already has a loop.
- No new permission model (F-07: pij has no role gating today; this plan adds none).
- No notification/delivery path — the caller relays.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-control-plane` | existing | **modify** | Owns CLI parsing and the validated atomic per-seat sidecars (`adapters/watchdog-store.ts`); the chore roster, fingerprint store, and `pij chore` verb family land here |
| `agent-tooling-interface` | existing | **consume** | Operator-facing CLI conventions: `USAGE` lines, `--json`, `E-*` error codes, exit codes. No changes |
| `agent-runtime` | existing | **consume** | Source of the 3-tier discovery *shape* (project → user → built-in) and of the `shadowed` marking. No code shared; the difference is that chores **do not filter `!shadowed` at lookup** — see AC-06 |

### Testing Strategy

- **Approach**: Hybrid — full TDD for the fingerprint/pending-delta state machine and the
  scope-merge resolver (the correctness core); lightweight validation for CLI wiring and
  usage text.
- **Rationale**: The brief mandates verification by *driving* the tool — register a chore,
  mutate the watched thing, assert the delta, assert an un-acked delta re-surfaces, assert
  `NO CHANGE` only after `ack` — not by reading the diff code.
- **Focus areas**: baseline-advance semantics; un-acked delta re-surfacing; per-seat
  baseline isolation; union merge across scopes; `NOT-PROBEABLE` never dropping a chore;
  malformed-roster degradation.
- **Excluded**: probe *content* correctness (a probe is user-authored shell), scheduling.
- **Mock usage**: **Avoid mocks** — real temp dirs and trivial real shell probes
  (`echo`, a file `cat`). Every test sets `PIJ_HOME` to a temp dir; no test may read the
  operator's real `~/.pij` (a bare real-adapter construction taps live panes — a known
  hazard in this repo).

### Documentation Strategy

- **Location**: `docs/how/pij-chore.md` + a `CHORE_USAGE` block printed by `runChoreVerb`'s
  own `--help` handling (the generic USAGE filter is unreachable from a pre-`E-NOREG` verb —
  see Key Finding 06).
- **Rationale**: `docs/how/` is where every other pij surface documents itself; the USAGE
  lines are the discovery path an agent actually hits.

### Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=2, N=1, F=1, T=2
- **Confidence**: 0.80
- **Assumptions**: probes are synchronous shell commands; a seat identifies itself via
  `PIJ_SESSION_ID`; `writeJsonAtomic` is sufficient concurrency control for a
  single-writer-per-file store.
- **Dependencies**: none new — no new packages.
- **Risks**: see `### Risks & Assumptions`.
- **Phases**: 1 (user-directed).

> **Mode deviation, recorded**: CS-4 would normally route to Full mode. Jordan explicitly
> directed a single phase ("will be single phase"). The work is one cohesive change in one
> domain, so a single phase holds; the cost is that all tasks land in one review pass.

### Acceptance Criteria

| ID | Criterion (observable) |
|----|------------------------|
| AC-01 | With N chores registered and nothing changed, `pij chore run` prints exactly `NO CHANGE — <N> chores probed, 0 moved` and exits 0 |
| AC-02 | After the watched thing changes, `pij chore run` prints the header `CHANGES — <N> chores probed, <M> moved`, one `CHANGED <scope>:<name>: <old> → <new>` line per moved chore, **and** the unchanged list; the run does **not** advance the stored baseline |
| AC-03 | A second `pij chore run` with no further change **re-reports** the same un-acked delta (it does not report `NO CHANGE`) |
| AC-04 | After `pij chore ack <name>`, the next `pij chore run` reports `NO CHANGE` for that chore |
| AC-05 | A probe that exits non-zero reports exactly `NOT-PROBEABLE <scope>:<name>: <reason>`, stays in the roster, counts in the probed denominator, and leaves the baseline unchanged |
| AC-06 | A chore defined at `repo` scope and a chore defined at `seat` scope are **both** present in `chore list` and both probed by `chore run` (union, not shadowing) |
| AC-07 | Two chores sharing a name across different scopes are both retained; a bare `chore ack <name>` returns `E-AMBIG` naming both, and `chore ack <scope>:<name>` succeeds |
| AC-08 | Two seats sharing one repo-scoped chore keep independent baselines: seat A's `ack` does not change what seat B's `chore run` reports |
| AC-09 | `chore run --dry` prints the same report and writes **no** file (store mtimes unchanged) |
| AC-10 | With `--full "<cmd>" --full-every 3`, the **3rd and 6th separate `pij chore run` invocations** against one `PIJ_HOME` additionally print the full command's output under `FULL <scope>:<name>`; runs 1,2,4,5 do not. The counter lives in the per-seat state file, so it survives process exit; `run --dry` does not advance it |
| AC-11 | A malformed roster file makes that scope contribute zero chores and prints exactly `NOT-PROBEABLE <scope>:<roster>: malformed roster`; the command still exits 0 and other scopes still probe |
| AC-12 | The fleet-scope store is created under a `~/.pij/<subdir>/` directory, never as a top-level `~/.pij/*.json` file (verified by asserting the resolved path) |
| AC-13 | `pij chore --help` (and `-h`, `help`, and bare `pij chore`) prints `CHORE_USAGE` and exits **0** — handled inside `runChoreVerb`, because the generic USAGE filter is unreachable from a pre-`E-NOREG` verb |
| AC-14 | `pij chore run --json` emits `{ probed, moved, chores: [{ scope, name, status, old, new }] }` and is stable across a no-change run |
| AC-15 | No file under `core/chores/**` imports a daemon/telegram/tmux/grammy module (dependency direction stays `cli → core`) |
| AC-16 | The chores suite refuses to run unless `PIJ_HOME` resolves to a temp path — no test can read or mutate the operator's live `~/.pij` |
| AC-17 | `pij chore add <name> --probe '<cmd>'` with no `--scope` writes the **seat** roster; re-adding an existing `<scope>:<name>` returns `E-EXISTS`, exits non-zero, and mutates no file |
| AC-18 | `pij chore list --verbose` round-trips every stored field of a registered chore: probe, full, full-every, timeout, scope |
| AC-19 | `pij chore remove <scope>:<name>` drops **only** that scope's row and **purges that key's baseline, pending delta, and `runsSinceFull`** — a subsequent `add` of the same name then reports the next probe as its first observation, not as `NO CHANGE` |
| AC-20 | `pij chore remove` records the removal (name, scope, reason, timestamp) **before** the roster row disappears; the record survives the removal and is readable afterwards |

### Risks & Assumptions

| Risk | Mitigation |
|------|------------|
| A shared baseline would silence one seat's un-relayed delta (seahorse's delta-blindness, reintroduced) | Fixed by construction: definitions may be repo/fleet scoped, **fingerprints and pending deltas are always per-seat** (AC-08) |
| Repo-scoped probes are arbitrary shell arriving from the repo | Stated decision, not an accident: pij already executes repo-authored `./agents` packs. Probes are always readable via `chore list --verbose` |
| A probe whose output can stay identical while the watched thing moves makes a silently blind sensor | Documented probe-authoring rule ("fingerprint must be a superset signal") in `docs/how/pij-chore.md`; not enforceable by code |
| Copying `pij agent`'s shadowing merge | AC-06 is the guard; the resolver is TDD'd against it |
| 32 worktrees on one repo | Roster keyed by repo root; **baseline keyed by worktree** so a branch-scoped probe does not bleed across branches |

### Open Questions

None blocking. Two were defaulted rather than asked (see `### Clarifications`).

### Workshop Opportunities

None. The design points the brief listed (baseline advance, roster ownership, superset
fingerprints, verify-by-driving) are resolved in this plan's Implementation section rather
than deferred.

### Clarifications

#### Session 2026-08-02

| Question | Answer | Source |
|----------|--------|--------|
| Workflow Mode | Simple, single phase | User-directed ("will be single phase") |
| Testing Strategy | Hybrid — TDD on the state machine + resolver, lightweight on CLI wiring | Defaulted per user instruction ("default out the rest of the planning questions") |
| Mock Usage | Avoid mocks; real temp dirs via `PIJ_HOME` | Defaulted; constrained by the repo's live-fleet test hazard |
| Documentation Strategy | `docs/how/pij-chore.md` + CLI USAGE lines | Defaulted to match every other pij surface |
| Scope model | seat / repo / fleet, **union** merge | User-directed ("special chores that are repo / pa dependent") + F-04 |
| Cross-seat roster writes | Not offered in v1 — a seat edits its own seat roster; repo/fleet rosters are plain files with no new enforcement | Defaulted; F-07 (no role gating exists to extend) |

#### Session 2026-08-02 — validation round 1

`/validate-v2` returned **NEEDS ATTENTION** (0 critical, 3 high, 4 medium) against basis
`ba3d0da9…c3c4de89`. All seven were folded in; two of its claims were independently
re-verified against the live repo before acting.

| Finding | Resolution |
|---------|------------|
| HIGH — the generic `--help` filter is unreachable from a pre-`E-NOREG` verb (proven: `pij agent --help` → `E-ARG`) | Re-verified by running it. Key Finding 06 rewritten; T011 + AC-13 now require `runChoreVerb` to handle `--help` itself, modelled on `runOrchestrationVerb` (`cli.ts:3382-3386`) |
| HIGH — `remove` had no AC and no state-purge rule | AC-19 + AC-20 added; state machine now specifies purge-on-remove and receipt-first recording (brief borrows #2/#3) |
| HIGH — `--full-every N` had no durable counter and no cross-process proof | `runsSinceFull` added to `ChoreState`, the Storage table, T004; AC-10 reworded to separate invocations and assigned to T012 |
| MED — `add` had no AC (default scope, re-add behaviour) | AC-17 + AC-18 added; `E-EXISTS` on re-add |
| MED — the report string existed in four forms | Normalised everywhere to `NO CHANGE — <N> chores probed, <M> moved`; AC-11 given a literal |
| MED — the changed-case report was unspecified, so Goal 5's denominator was unverifiable when something moved | `CHANGES — <N> chores probed, <M> moved` header + unchanged list specified; AC-02 extended |
| MED — two wrong citations (`FsRegistry.list()`; "shadowing drops") | Re-verified `pack.ts:1-7` directly. Finding 03 repointed to `adapters/fs-registry.ts:137-151`; Finding 01 restated — discovery already unions, the defect would be carrying the `!shadowed` **lookup** filter |
| MED — Domain Manifest omitted the 5 test files G7 claims it covers | The 5 test-file rows added |

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | Supplies Key Findings 01–06 and the domain/anti-reinvention read |
| backpressure-coverage.md | y | Certainty **Partial** (14 RUN · 2 EXTEND · 0 BUILD). Its two recommended extensions are folded in as T015/T016 + AC-15/AC-16 |
| validations/ round 1 | y | NEEDS ATTENTION → all 3 HIGH + 4 MED folded in; ACs grew 16 → 20 (see `### Clarifications` § validation round 1) |
| workshops/*.md | n | — |
| government/briefs/chore-primitive-2026-08-02.md | y | Authoritative requirement source for baseline/ack semantics and the gate-vs-sensor boundary |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No `[NEEDS CLARIFICATION]` markers remain; the 6 open items were defaulted on user instruction and recorded in `### Clarifications` |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | No `docs/adr/` |
| G5 | Structure | PASS | All required sections present and populated |
| G6 | Testing Alignment | PASS | Hybrid: T001–T003 are tests-first for the state machine and resolver; every AC has a measurable observable |
| G7 | Domain Completeness | PASS | All 3 target domains exist in `docs/domains/registry.md`; no NEW domains; every file in the task table — **including all 5 test files** — appears in the Domain Manifest (validation round 1, MED-7) |

### Summary

Add a `pij chore` verb family that stores named shell probes in a union-merged three-scope
roster, fingerprints their output per seat, and reports computed deltas that persist until
explicitly acked. The core (roster resolution, fingerprint/pending-delta reduction, report
rendering) is pure and unit-tested; a thin fs adapter persists it; the CLI branch is an
adapter over the pure verbs. Behaviour is proven by driving the tool end-to-end against
real temp dirs, not by reading the diff code.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/chores/types.ts` | pij-control-plane | contract | `Chore`, `ChoreScope`, `ChoreState`, `ChoreRunReport` shapes |
| `.pi/extensions/pij/core/chores/resolve.ts` | pij-control-plane | internal | Pure 3-scope discovery + **union** merge + collision keying |
| `.pi/extensions/pij/core/chores/reduce.ts` | pij-control-plane | internal | Pure fingerprint→delta reducer: pending stays open until ack; ack advances baseline |
| `.pi/extensions/pij/core/chores/report.ts` | pij-control-plane | internal | Pure human + `--json` renderers (`NO CHANGE — <N> chores probed, <M> moved`) |
| `.pi/extensions/pij/core/chores/cli-verbs.ts` | pij-control-plane | contract | `add`/`run`/`list`/`ack`/`remove` as pure result objects with injected deps |
| `.pi/extensions/pij/adapters/chore-store.ts` | pij-control-plane | internal | Validated atomic roster + per-seat state files (`writeJsonAtomic`, degrade-to-undefined) |
| `.pi/extensions/pij/adapters/chore-probe.ts` | pij-control-plane | internal | Runs a probe via `sh -c` with a timeout; returns `{ok, output, reason}` |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | cross-domain | One dispatch branch + one `CHORE_USAGE` block + USAGE index line |
| `.pi/extensions/pij/core/chores/reduce.test.ts` | pij-control-plane | internal | Unit proof of the delta state machine (AC-01..AC-05, AC-10) |
| `.pi/extensions/pij/core/chores/resolve.test.ts` | pij-control-plane | internal | Unit proof of union scoping + collision keying (AC-06, AC-07) |
| `.pi/extensions/pij/core/chores/drive.test.ts` | pij-control-plane | internal | End-to-end drive-it proof incl. two-seat isolation (AC-03, AC-04, AC-08, AC-19) |
| `.pi/extensions/pij/core/chores/boundary.test.ts` | pij-control-plane | internal | Import-boundary static scan for the new surface (AC-15) |
| `.pi/extensions/pij/adapters/chore-store.test.ts` | pij-control-plane | internal | Store contract: atomic write, degrade, subdir path, dry-run (AC-09, AC-11, AC-12) |
| `docs/how/pij-chore.md` | agent-tooling-interface | contract | Operator/agent-facing surface docs incl. the probe-authoring rule |
| `docs/domains/pij-control-plane/domain.md` | pij-control-plane | contract | Record the new sidecar + verb family in the domain's owned-files table |
| `docs/domains/registry.md` | pij-control-plane | contract | History row for plan 076 |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `pij agent`'s discovery **already unions** — lower-precedence duplicates are "kept but marked `shadowed` — never dropped" (`core/agents/pack.ts:1-7`). The drop happens one layer up, in the **lookup filter** `!a.shadowed` (`core/agents/cli-verbs.ts:116-119`). Reusing that filter is what would hide a fleet chore a repo redefines | Keep the union discovery; **do not carry the `!shadowed` lookup filter**. Key the effective roster by `<scope>:<name>` so every scope's row stays addressable. Cheaper and lower-risk than re-writing the merge. AC-06/AC-07 are the guards; T002 is TDD'd against it |
| 02 | Critical | A shared baseline recreates delta-blindness — one seat's `ack` silences another's un-relayed delta, presenting as a truthful `NO CHANGE` | Definitions may be repo/fleet scoped; **state is always per-seat** (`~/.pij/<seat>/chore-state.json`), AC-08 |
| 03 | High | `FsRegistry.list()` reads `readdirSync(pijHome)` + `.json` filter and accepts anything with a string `id` — a top-level `~/.pij/*.json` is read as a phantom peer (`adapters/fs-registry.ts:137-151`; the trap is *described* at `adapters/watchdog-store.ts:105-112`) | Fleet store goes in `~/.pij/pij-chores/chores.json`; AC-12 asserts the resolved path |
| 04 | High | The registry write law exists because contested `SessionDescriptor` fields caused five lost-update incidents (`core/registry-write.ts:1-45`) | Keep all chore state in standalone sidecars — one writer per file, no contested fields, no `RegistryPort` involvement |
| 05 | Medium | Verbs after the `E-NOREG` guard require `~/.pij` to exist (`cli.ts:4064-4070`) | Register `chore` **before** the guard so repo-scoped chores work in a registry-less clone; seat scope degrades with a note when `PIJ_SESSION_ID` is absent |
| 06 | High | The generic `--help` filter sits at `cli.ts:4079-4084`, **after** the `E-NOREG` guard — so a verb registered *before* the guard (which Finding 05 requires) returns and never reaches it. Proven by execution: `pij agent --help` prints `E-ARG: unknown subverb '--help'` | `runChoreVerb` must handle `--help` / `-h` / `help` / empty-args **itself**, copying `runOrchestrationVerb` (`cli.ts:3382-3386`) — the pre-guard verb that gets this right (prints USAGE, exits 0). AC-13 |

### Implementation

**Objective**: Ship `pij chore add|run|list|ack|remove` with union-merged seat/repo/fleet
scoping, per-seat baselines, and deltas that stay open until acked.

**Testing Approach**: Hybrid — T001–T003 write the failing tests for the reducer, resolver,
and store contract before their implementations; T004–T011 are implementation with
lightweight validation; T012 is the end-to-end drive-it proof; T015–T016 extend two existing
sensors (import boundary, temp-home guard) per the backpressure survey.

#### Surface contract (what to build to)

```
pij chore add <name> --probe '<cmd>' [--full '<cmd>'] [--full-every N]
                     [--scope seat|repo|fleet] [--timeout <ms>] [--json]
pij chore run [--dry] [--json]        run every probe, diff vs the per-seat baseline
pij chore list [--verbose] [--json]   roster: scope, name, probe, last run, last delta
pij chore ack <name|scope:name> [--json]   advance the baseline AFTER the delta was relayed
pij chore remove <name|scope:name> --reason '<why>' [--json]   purges that key's state; recorded first
pij chore --help | -h | help          print CHORE_USAGE, exit 0 (handled inside runChoreVerb)
```

`<name>` alone resolves when unambiguous; a name defined in more than one scope requires
`<scope>:<name>` and otherwise returns `E-AMBIG` naming every match.

**Storage**
| What | Where | Scope of the file |
|------|-------|-------------------|
| seat roster | `~/.pij/<seat>/chores.json` | one seat |
| repo roster | `<repoRoot>/.pij/chores.json` | one repo (checked in) |
| fleet roster | `~/.pij/pij-chores/chores.json` | the machine (subdir — Finding 03) |
| **all** baselines + pending deltas + `runsSinceFull` | `~/.pij/<seat>/chore-state.json` | **always one seat** (Finding 02) |

Baseline entry key: `<scope>:<name>` for `seat`/`fleet`; `repo:<name>@<worktreeRoot>` for
`repo` (so a branch-scoped probe does not bleed across worktrees).

**State machine (the load-bearing rule)**
`run` probes → fingerprint = sha256(trimmed stdout), displayed as first 12 hex.
- fingerprint == baseline and no pending → `unchanged`
- fingerprint != baseline → `changed`; write/refresh a **pending** delta `{old: baseline, new: fingerprint}` — **`run` never advances the baseline**
- pending exists → re-report it every run (refresh `new` if it moved again; `old` stays the last acked baseline)
- probe fails/timeouts → `not-probeable`; no delta, no baseline change, chore stays in the roster and in the denominator
- `ack` → baseline := pending.new; clear pending
- `remove` → drop that scope's row **and purge that key's baseline + pending + `runsSinceFull`**, so a later `add` under the same name starts clean rather than inheriting a stale baseline that would suppress the first real delta. The removal reason is recorded **before** the row disappears (brief borrow #2/#3: removal is a recorded event, receipt-first).
- `add` → default scope is **seat**; re-adding an existing `<scope>:<name>` returns `E-EXISTS` and mutates nothing (a silent overwrite would orphan that key's baseline — the same hazard through a second door).
- `runsSinceFull` is a per-chore-key counter in the **per-seat state file** (never in-memory — the CLI is a fresh process per `run`). `run` increments it; when `--full-every N` is set and the counter reaches N, the full command runs, its output is printed under `FULL <scope>:<name>`, and the counter resets. **`--dry` advances nothing** (consistent with AC-09).

**Report strings (exact — one form, used everywhere)**
- quiet run: `NO CHANGE — <N> chores probed, <M> moved` (the brief's authoritative form; `<M>` is `0` here)
- a run with movement: the **same header** `NO CHANGE`→`CHANGES — <N> chores probed, <M> moved`, then one line per moved chore `CHANGED <scope>:<name>: <old> → <new>`, then the unchanged list. The denominator appears in **both** cases — that is Goal 5.
- failed probe: `NOT-PROBEABLE <scope>:<name>: <reason>`

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Write failing tests for the pure delta reducer: unchanged / changed / pending re-surfaces / ack advances / not-probeable | pij-control-plane | `.pi/extensions/pij/core/chores/reduce.test.ts` | Tests exist and fail for the right reason (module absent) | Covers AC-01..AC-05 at unit level |
| [ ] | T002 | Write failing tests for the scope resolver: union across 3 scopes, collision retains both, bare-name ambiguity | pij-control-plane | `.pi/extensions/pij/core/chores/resolve.test.ts` | Tests exist and fail; one test asserts **union, not shadowing** | Finding 01; AC-06, AC-07 |
| [ ] | T003 | Write failing tests for the store contract: atomic write, malformed → degrade, fleet path is a subdir | pij-control-plane | `.pi/extensions/pij/adapters/chore-store.test.ts` | Tests exist and fail; path assertion is literal | Findings 03; AC-11, AC-12 |
| [ ] | T004 | Define `Chore`, `ChoreScope`, `ChoreState` (baseline, pending, **`runsSinceFull`**), `ChoreRunReport`, `ChoreStatus`, `ChoreRemovalRecord` | pij-control-plane | `.pi/extensions/pij/core/chores/types.ts` | `just typecheck` passes; no `any`; `runsSinceFull` is per chore key in the per-seat state | Validator H3 — the counter has to be durable, not in-memory |
| [ ] | T005 | Implement the pure reducer | pij-control-plane | `.pi/extensions/pij/core/chores/reduce.ts` | T001 green | Never advances a baseline outside `ack` |
| [ ] | T006 | Implement the pure 3-scope resolver (union + `<scope>:<name>` keying + `E-AMBIG` on a bare colliding name) | pij-control-plane | `.pi/extensions/pij/core/chores/resolve.ts` | T002 green | Mirror `agent` discovery *shape*, invert the merge rule |
| [ ] | T007 | Implement the store: roster read/write per scope + per-seat state file, `writeJsonAtomic`, validator returns `undefined` on malformed | pij-control-plane | `.pi/extensions/pij/adapters/chore-store.ts` | T003 green | Model on `adapters/watchdog-store.ts:71-88` |
| [ ] | T008 | Implement the probe runner: `sh -c` in the seat's cwd, default 30s timeout, captured stdout trimmed, non-zero/timeout → `{ok:false, reason}` | pij-control-plane | `.pi/extensions/pij/adapters/chore-probe.ts` | A failing probe yields `not-probeable`, never throws | AC-05 |
| [ ] | T009 | Implement the report renderers (human + `--json`) incl. the denominator line and `FULL` blocks | pij-control-plane | `.pi/extensions/pij/core/chores/report.ts` | Snapshot-free assertions on exact strings | AC-01, AC-10, AC-14 |
| [ ] | T010 | Implement `add`/`run`/`list`/`ack`/`remove` as pure result objects with injected deps (`cwd`, `pijHome`, `seatId`, probe runner, clock). `add`: seat default + `E-EXISTS` on re-add. `remove`: record the reason **first**, then drop the row **and purge that key's baseline/pending/`runsSinceFull``. `list --verbose`: round-trip every stored field | pij-control-plane | `.pi/extensions/pij/core/chores/cli-verbs.ts` | Unit tests drive every verb with no process spawn; AC-17..AC-20 observable | Template: `core/agents/cli-verbs.ts`. Do **not** carry `agents`' `!shadowed` lookup filter (Finding 01) |
| [ ] | T011 | Wire the CLI: one dispatch branch **before** the `E-NOREG` guard, a `CHORE_USAGE` block, the USAGE index line, and `--help`/`-h`/`help`/empty-args handled **inside `runChoreVerb`** | pij-control-plane | `.pi/extensions/pij/cli.ts` | `pij chore --help` prints `CHORE_USAGE` and exits 0 — verified by running it, not by inspection | Findings 05, 06; AC-13. Copy `runOrchestrationVerb` (`cli.ts:3382-3386`); the generic filter is unreachable pre-guard |
| [ ] | T012 | End-to-end drive-it proof: register → mutate the watched file → `run` reports the delta → `run` again re-reports it → `ack` → `run` says NO CHANGE; plus the two-seat baseline-isolation case; plus **`--full-every N` across N separate `run` invocations**; plus **remove→re-add starts clean** | pij-control-plane | `.pi/extensions/pij/core/chores/drive.test.ts` | AC-01..AC-10 and AC-19 observed through the real verbs against a temp `PIJ_HOME` | The brief's mandate: prove by driving, not by reading. Separate invocations, not one in-process loop (validator H3) |
| [ ] | T013 | Write `docs/how/pij-chore.md` incl. the scope table, the state machine, and the **probe-authoring rule** (fingerprint must be a superset signal) | agent-tooling-interface | `docs/how/pij-chore.md` | Doc names all five verbs, all three scopes, and the ack rule | |
| [ ] | T014 | Record the surface in the domain docs | pij-control-plane | `docs/domains/pij-control-plane/domain.md`, `docs/domains/registry.md` | New owned-file rows + a 2026-08-02 history row for plan 076 | |
| [ ] | T015 | Extend the import-boundary sensor to the new surface: copy `core/agents/boundary.test.ts`, retarget it at `core/chores/**` | pij-control-plane | `.pi/extensions/pij/core/chores/boundary.test.ts` | No file under `core/chores/**` imports daemon/telegram/tmux/grammy; test green | Backpressure survey — extension, not a new sensor |
| [ ] | T016 | Guard the chores suite: assert `PIJ_HOME` resolves to a temp path before any test runs | pij-control-plane | `.pi/extensions/pij/core/chores/` (suite setup) | A suite run with an unset/real `PIJ_HOME` fails loudly instead of touching the operator's live `~/.pij` | Backpressure survey — the live-fleet-contamination hazard |
| [ ] | T017 | Full gate: `just self-check` (or `harness checks`) green | pij-control-plane | — | Every sensor passes; no new lint/type/test failures | |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T005, T009, T012 | `reduce.test.ts` + `drive.test.ts` — exact `NO CHANGE — <N> chores probed, 0 moved` string |
| AC-02 | T005, T012 | `drive.test.ts` — delta reported **and** stored baseline byte-unchanged after the run |
| AC-03 | T005, T012 | `drive.test.ts` — second consecutive `run` re-reports the same pending delta |
| AC-04 | T005, T010, T012 | `drive.test.ts` — `ack` then `run` → `NO CHANGE` |
| AC-05 | T008, T005 | `reduce.test.ts` + a probe that exits 1 → `not-probeable`, still in denominator |
| AC-06 | T006 | `resolve.test.ts` — union assertion (both a repo and a seat chore probed) |
| AC-07 | T006, T010 | `resolve.test.ts` — bare ambiguous name → `E-AMBIG`; `scope:name` resolves |
| AC-08 | T007, T012 | `drive.test.ts` — two seat ids, one repo chore, independent state files |
| AC-09 | T010 | store mtimes unchanged after `run --dry` |
| AC-10 | T009, T010, **T012** | `FULL <scope>:<name>` block on the Nth **separate invocation** only; counter durable across processes |
| AC-11 | T003, T007 | malformed roster → 0 chores from that scope, exit 0, other scopes intact |
| AC-12 | T003, T007 | literal assertion that the fleet path contains a directory segment under `~/.pij` |
| AC-13 | T011 | `pij chore --help` exit 0 with the family's USAGE lines |
| AC-14 | T009 | stable `--json` shape on a no-change run |
| AC-15 | T015 | `core/chores/boundary.test.ts` — no daemon/telegram/tmux/grammy import under `core/chores/**` |
| AC-16 | T016 | suite setup fails when `PIJ_HOME` is not a temp path |
| AC-17 | T010 | `cli-verbs` unit — bare `add` lands in the seat roster; duplicate `add` → `E-EXISTS`, files byte-unchanged |
| AC-18 | T010 | `cli-verbs` unit — `list --verbose` round-trips probe/full/full-every/timeout/scope |
| AC-19 | T010, T012 | `drive.test.ts` — remove then re-add: the next `run` reports a first observation, not `NO CHANGE` |
| AC-20 | T010 | `cli-verbs` unit — the removal record exists and is readable after the row is gone |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Implementer copies `pij agent`'s shadowing merge | Medium | High — a fleet chore silently disappears | T002 is written **before** T006 and asserts union explicitly (Finding 01) |
| Implementer lets `run` advance the baseline (the "obvious" diff implementation) | Medium | Critical — an unrelayed delta is lost forever and the next run truthfully says `NO CHANGE` | T001 has a dedicated "run does not advance baseline" test; called out in the state-machine block |
| Baselines placed alongside the repo roster (shared) | Low | Critical — reintroduces delta-blindness across seats | AC-08 two-seat test; storage table states "always one seat" |
| A top-level `~/.pij/chores.json` is created | Low | Medium — read as a phantom peer by `FsRegistry.list()` | AC-12 asserts the resolved path shape |
| A test constructs a real adapter and touches the operator's live `~/.pij` | Medium | High — taps real panes, blows timeouts | Every test sets `PIJ_HOME` to a temp dir; no real-adapter construction in this plan's tests |
| Single phase carries a CS-4 surface into one review | Medium | Medium — a large review pass | Task ordering is tests-first so the review has behavioural evidence, not just code |
| `remove` then re-`add` under the same name inherits a stale baseline and suppresses the first real delta | Medium | Critical — delta-blindness through a second door | AC-19: `remove` purges baseline + pending + counter; AC-17: re-`add` of a live name is `E-EXISTS`, never a silent overwrite |
| `--full-every N` counted in memory passes unit tests but never fires in the shipped CLI (fresh process per `run`) | Medium | High — a silently dead feature that looks tested | `runsSinceFull` lives in the per-seat state file; AC-10 is asserted across **separate invocations** in T012, not in one in-process loop |
