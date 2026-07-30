# s075 gate report — task-set open/close asymmetry

**PM**: pij-unwilling-butterfly · **o-prime**: pij-wee-albatross
**Branch**: `s075/task-asymmetry` · **Base**: main @ `fdf1687`
**Plan**: `docs/plans/075-task-asymmetry/plan.md`

## Claim

The assignment lifecycle has a far end. `pij task close` discharges an
obligation under scoped authority, the node's denorm clears on the wire as
explicit null, and `axis-disagreement` resolves through the pre-existing
predicate with no projection change to the anomaly surface.

## SHAs

| sha | what |
|---|---|
| `8653402` | `pij task close` + `permittedCloseReasons` authority gate + enrollment + `SPINE_KIND_TASK_CLOSE` |
| `97ef6ab` | ratified denorm clearing — null, never absence |

## What was actually wrong (the brief understated it)

The brief described an asymmetry where the assignee alone could clear an
obligation. Measured: **nobody could.** `closeAssignment()` had existed since
plan 054 with no caller — its own comment says *"No caller exists today"* — and
**91 of 91 assignments on this box were open, with zero ever closed.**

It read as healthy because `report state done` **silences** `axis-disagreement`
without **discharging** the record: `isSemanticActive()` is
`state === undefined || state === "ready"`, so *any* declared state quiets the
detector. `done` and `waiting` silence it identically.

## Gates

| gate | command | verdict |
|---|---|---|
| boot | `harness boot` | ok — typecheck + test, no pre-existing red |
| full suite | `npx vitest run` | **3812 passed / 19 skipped**, 202 files |
| harness | `harness checks --quick` | **ok 7/7** (smoke skipped) |
| typecheck | `just typecheck` | pass |
| lint | biome | pass |

## Mutation proof (dim-0, mandatory)

| # | mutation | result |
|---|---|---|
| 1 | collapse the two authority sets so an opener may close with `done` | **4 tests fail**, incl. the explicit laundering guard |
| 2 | never clear the denorm (option B, the contract-cheap path) | **1 test fails** |
| 3 | emit cleared fields as absent instead of null on the `list` wire | **1 test fails** |

**Recorded honestly: mutation 3's first attempt PASSED and was wrong.** I had
mutated the `card` projection in the `node show` handler while the test reads
`list --json` — a different projection whose source looks identical. A surviving
mutation is normally read as "missing test"; here it silently meant "wrong
target", and those are indistinguishable from the result alone. Re-aimed at the
real projection, it kills.

## Registries touched (named per the brief — the enrollment-checklist class)

1. `FAMILY_SUBCOMMANDS.task` → `"set|close"`
2. `ALLOWED_FLAGS["task close"]` → `reason, actor, json`
3. `MAX_POS["task close"]` → `1`
4. `ParsedCommand` union → `task-close` variant
5. `PlatformCommand` union → `"task-close"`
6. platform-verb routing switch → `case "task-close"`
7. `parseArgs` → `case "task close"`
8. `dispatch` → `case "task-close"`
9. `SPINE_KIND_TASK_CLOSE` in `platform/types.ts`
10. **`USAGE` in `.pi/extensions/pij/cli.ts`** — called out deliberately: omitting
    it is what made `role` undiscoverable in s074

## Design decisions worth carrying

- **Safety is reachability, not policy.** A third party cannot launder a `done`
  because `done` is unreachable from the opener's authority set. There is no rule
  to forget or bypass.
- **The vocabulary already anticipated this.** The four existing
  `ASSIGNMENT_CLOSE_REASONS` partition exactly along the authorship line; no new
  reason values were required.
- **Attribution is not authorisation.** The gate reads `selfId`, never `--actor`.
  An override that relabels who is *recorded* must never select who is
  *permitted*, or any caller grants itself the assignee's rights.
- **Null is an answer; absence is a silence.** Cleared denorm fields reach
  consumers as explicit null because `tree` omits absent keys and the rail treats
  omission as "field not carried", falling through to a cached snapshot.
- **`clearAssignment` is a separate branch**, not a nullable widening of the
  swap. A swap points a node at different work; a clear says it has none.
- **`statusPrev/Next/At/Seq` survive a close.** Blanking a seat's card as a side
  effect of closing a ledger row is the coupled-write hazard this stream exists
  to stop repeating.

## Observations

- `INS` — attribution-vs-authorisation is a **class, not an instance** (o-prime
  asked for graduation): any flag that alters attribution must never be an input
  to authorisation. Every `--actor`/`--as`/`--on-behalf-of` override deserves the
  same audit.
- `DL` — a mutation that fails to kill is either a missing test *or* a mis-aimed
  mutation, and the result cannot distinguish them. Duplicated projection logic
  across verbs is the enabling condition.
- `INS` — "a silence that reads as resolution", fourth instance in one day, now
  at the **ledger** layer.

## Open / not done

- **The 91 legacy rows stay open.** Leave-and-mark per JC-2 D5-b/D5-d; a close is
  testimony and backfilling 91 would manufacture 91 facts. Documented in
  `plan.md` §4.1.
- **A discharge detector is NOT shipped**, and if built must be **epoch-bounded**
  — only assignments opened after this verb exists may flag. Retroactive
  accusation over a period when compliance was impossible is not a signal, and it
  would fire on ~100% of the population on day one.
- **`isSemanticActive` still treats `done` like `waiting`.** That is the
  masking/discharging fix proper, deliberately scoped out because it moves anomaly
  semantics and needs its own ratification round.
- **Section 8 question is unanswered** (non-blocking): should `report state done`
  auto-close the assignee's own assignment? My lean is no — a hidden side effect
  on a testimony surface is how the next silence-reads-as-resolution gets built.
  The o-prime's lean matches. Jordan's call.
