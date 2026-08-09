# Coder packet — plan-084, Phase 2: Make the gate target-scoped

**Frozen** 2026-08-05 by `pij-respectable-starfish`. Immutable — if scope changes, I stop you
and re-brief. Supersedes nothing in the Phase-1 packet; the standing rules there still apply
(batons, forbidden paths, TDD, no mocks, `.js` imports, `noUncheckedIndexedAccess`, no commits,
report at both edges, `/pij` § C10 wire discipline).

**Phase 1 is APPROVED and closed.** Review: `docs/plans/084-pa-gate-repair/reviews/review.phase-1.md`.
Read it — it carries three things you need, under "Carried into Phase 2".

## The shape of this phase, in one paragraph

The gate refuses by **party** (`role === "pa"`) when the real rule is about the **target** of
the action. You are not widening the gate. You are adding a **third capability kind** so the
table stays total and exhaustive, then enforcing the target rule in the one place that knows
the target. Phase 1 made the keying field visible; this phase makes the decision correct.

## The two traps that decide whether this phase is real

**TRAP 1 — the gate has TWO seams and the one that fires FIRST cannot see the target.**
`cli.ts:4098` (`paBinRefusal`) runs on raw `process.argv` for **every** top token, *before*
core parse. `core/cli.ts:2233` (`paGate`) runs inside `dispatch()`. `pij watchdog watch <id>`
is refused at **seam 2**, and never reaches seam 1 — the bin's `top === "watchdog"` branch at
`cli.ts:4130` is only a `--help` shortcut. **A fix that lives only in `paGate` will pass its
unit tests and still refuse at the command line.** Key Finding 02.

**TRAP 2 — "parent" means `effectiveParent`, never raw `parentId`.**
`core/tree.ts:15` — `effectiveParent(d) = d.parentId !== undefined ? d.parentId : (d.spawnedBy ?? null)`.
A PA its prime **spawned but never explicitly linked** has no raw `parentId`. A predicate
keyed on the raw field would refuse that PA permission over its actual parent — **rebuilding
`#95` inside `#95`'s own fix**. Key Finding 09. My Phase-1 mutation check proved the guard
test for this is real: swapping in raw `parentId` reddens exactly that test and nothing else.

## Design constraints — these are rulings, not suggestions

1. **Do NOT change `paRefusal(role, verb)`'s signature.** It has 4 consumers, one of which
   (`whoami`, `core/cli.ts:2409`) enumerates refused verbs with **no target concept**. Key
   Finding 05.
2. **Add a third arm to `PaCapability`**: `{ kind: "conditional"; readonly why: string }`. This
   is what lets **both seams** pass the verb through to a handler that knows the target, while
   keeping `PA_VERB_CLASSIFICATION` **total**. TypeScript exhaustiveness must force every
   consumer to handle it — the PR #71 pattern (`const _exhaustive: never`). A widening that
   buys one role re-arms the trap; do not widen.
3. **`paRefusal` returns `null` for `conditional`** (not refused *at the table*), and the
   **handler** makes the real decision.
4. **The target check goes in the HANDLER, never in the gate.** `paGate` must keep its
   early-return (`core/cli.ts:2227-2228`) so no registry read enters the hot path —
   `core/cli.test.ts:5147` asserts `reads === 0`. Key Finding 06. **If that test goes red,
   stop and tell me.**
5. **Target checks fail CLOSED.** Unknown target, null parent, unverifiable relationship →
   **refuse**. Only *caller-identity* resolution keeps the existing deliberate fail-open.
6. **`pa-target.ts` is pure** — pi-free, no DI, takes a descriptor + a target id, returns a
   tagged union. Patterns P2/P4.

## Tasks — 2.1 through 2.12 exactly as tabled in the plan

Read `#### Phase 2` in the plan for the full table. Order matters; it is TDD.

Highlights you must not soften:
- **2.1** — 6 failing tests for `pa-target.ts`, **including spawned-but-never-linked → ALLOW**.
- **2.4** — prove the totality scrape still fails the build: **delete one table entry, watch the
  suite go red, restore.** A mutation proof, not a passing test.
- **2.5** — enforce in the `watchdog watch/unwatch` handler (`core/cli.ts:2316`).
- **2.6** — **the narrowness proof.** Explicit refuse tests for every other `watchdog` action
  (`pause`/`resume`/`exempt`/`reset`/`interval`/`disable-all`/`enable-all`) against a
  non-parent target. An allowance without its narrowness proof is a widening.
- **2.7** — the **bin-shaped** test in `cli.integration.test.ts`. This is the test that would
  have caught TRAP 1.
- **2.8** — `ack-dispatch` recipient identity, in its handler (`core/platform/dispatch.ts:100`
  already validates `ack.seat !== dispatch.to`).
- **2.10** — `whoami` must stop reporting conditional verbs as flatly refused.
- **2.11** — add `pa-capability.ts` + `pa-target.ts` to `docs/domains/pij-orchestration/domain.md`.

## Task 2.9 is GATED — do not start it

`#102` (`chore add/update/remove`, `spine-append`) awaits a human ruling. **Do everything else
first.** If you reach 2.9 and I have not sent you the answer, report and stop — do not guess a
policy for a capability boundary.

## Task 2.13 is MINE, not yours

The **live CLI proof** (AC-06b) is orchestrator-run. Do not attempt it and do not restart the
daemon. For your information so you understand what your code must satisfy: I will run
`just pij` (never bare `pij` — it resolves to the main checkout) against a seat stamped `pa`
and capture a real refusal and a real allow. **The stage does not close until that lands.**

## Allowed paths — WIDER than Phase 1, read carefully

```
.pi/extensions/pij/core/orchestration/pa-capability.ts
.pi/extensions/pij/core/orchestration/pa-capability.test.ts
.pi/extensions/pij/core/orchestration/pa-target.ts            (NEW)
.pi/extensions/pij/core/orchestration/pa-target.test.ts       (NEW)
.pi/extensions/pij/core/cli.ts
.pi/extensions/pij/core/cli.test.ts
.pi/extensions/pij/cli.ts                                     (seam 2 — bin)
.pi/extensions/pij/cli.integration.test.ts
.pi/extensions/pij/core/platform/dispatch.ts                  (2.8 only)
docs/domains/pij-orchestration/domain.md                      (2.11 only)
docs/plans/084-pa-gate-repair/execution.log.md                (append; do not rewrite Phase 1)
```

Forbidden paths are unchanged from the Phase-1 packet. Anything outside the list above → stop
and tell me first.

## Proof commands

```bash
npx tsc --noEmit
npx vitest run .pi/extensions/pij/
harness checks --quick
```

Known flake unchanged: `cli.integration.test.ts` fails under parallel load with a tmux socket
error and passes in isolation. **Re-run before reporting a red, and say that you re-ran.**

## Report shape

Same as Phase 1 — `claim` · `artifacts[]` · `shas[]` · `gates[]` · `observations[]` · `open[]`.

**Resolved output only**: your Phase-1 START card contained a literal `$(git rev-parse …)`
instead of its output. Run the commands; paste the results.

Two things I will check personally, so do not paper over them:
1. **Both seams.** I will read seam 2 and confirm the target rule is enforced there too — not
   just in `paGate`.
2. **The narrowness tests.** An allowance is only as good as the proof that it is narrow.
