# Coder packet — plan-084, Phase 1: Make the gate visible

**Frozen** 2026-08-05 by `pij-respectable-starfish` (stream orchestrator, s091). Immutable —
if scope or environment changes, I stop you and re-brief; do not self-amend.

## Identity & placement

| field | value |
|---|---|
| your role | `worker` (coder) under `pij-respectable-starfish` |
| worktree | `/Users/jordanknight/pi-hacking/pij-worktrees/s091-pa-gate-repair` |
| branch | `s091/pa-gate-repair` — **already checked out; never switch or create branches** |
| parent SHA | `efcc889` (base `00e140e`, PR #100) |
| repo | `AI-Substrate/pij` |

`node_modules` is a **symlink** to the main checkout and is already in place.
**Never run `npm install` / `npm ci`** (`.npmrc` carries `min-release-age=7` and `audit=true`;
never weaken either).

## Read first, in this order

1. `docs/plans/084-pa-gate-repair/pa-gate-repair-plan.md` — the plan. **§ Key Findings 01–08 are
   load-bearing; read them before writing a line.**
2. `docs/plans/084-pa-gate-repair/rulings.md` — three verbatim human rulings. Binding.
3. `docs/plans/084-pa-gate-repair/backpressure-coverage.md` — how each criterion gets proved.
4. `.pi/extensions/pij/AGENTS.md` — Patterns P1–P10. Non-negotiable.

## Your scope — Phase 1 ONLY

Phase 1 is **"Make the gate visible"**. It exists first because it is the *verification
instrument* for Phases 2 and 3: without it, "is this seat gated?" cannot be answered at the
command line, which is exactly how `#95` was nearly closed as a non-problem.

Tasks 1.1–1.6 exactly as tabled in the plan's `#### Phase 1` block. In summary:

| # | Task | Done when |
|---|------|-----------|
| 1.1 | **Failing tests first** — `pij state --json` carries `orchestrationRole` + `parentId` for (a) a stamped seat, (b) a `null`-parent seat, (c) a legacy descriptor with neither field | 3 tests red **for the right reason** (key absent, not a crash) |
| 1.2 | Add both keys to the `state` JSON projection | 1.1 green; keys **always present**, `null` when unset — never absent |
| 1.3 | Add role/parent to the `pij state` **text** output when set | Shows role + parent; silent when unstamped |
| 1.4 | Failing test: refusal text contains the role **and** the field name | Test red |
| 1.5 | Update `paRefusalMessage` to name role + field | 1.4 green; identical text at both seams |
| 1.6 | `harness checks --quick` | typecheck + lint + unit green |

**Acceptance**: AC-01, AC-02, AC-03 (see the plan's § Acceptance Criteria and § Acceptance
Coverage Map).

Useful starting coordinates (verified, but re-confirm — the branch is live):
`pij state` JSON projection ≈ `core/cli.ts:3195`; text render just below it;
`projectOrchestrationRole` at `core/orchestration/role.ts:59`;
`paRefusalMessage` at the foot of `core/orchestration/pa-capability.ts`;
its existing message assertion ≈ `pa-capability.test.ts:129`.

## Allowed paths

```
.pi/extensions/pij/core/cli.ts
.pi/extensions/pij/core/cli.test.ts
.pi/extensions/pij/core/orchestration/pa-capability.ts
.pi/extensions/pij/core/orchestration/pa-capability.test.ts
docs/plans/084-pa-gate-repair/execution.log.md        (create; your log)
```

## Forbidden paths — hard stop, no exceptions

```
the-flow.json · the-flow.md · .the-flow-state.json    (guided mode is their SOLE writer)
docs/plans/084-pa-gate-repair/*.md except execution.log.md
government/**                                          (the o-prime's, single-writer)
.fs2/ · .flow-pair/** · scratch/**                      (never stage)
.pi/packages.yaml · .pi/settings.json                   (generated / vetter-owned)
node_modules (a symlink — never touch)
```

Anything outside **Allowed paths** → **stop and tell me before touching it.** A newly needed
path is a fence update I record; it is not yours to take silently.

## Hard constraints — these are why this plan exists

1. **Additive only on `pij state --json`.** It is a consumed contract. **Add** keys; never
   rename, never remove. Legacy descriptors must still load (`core/types.ts:109` comment class).
2. **Do NOT change `paRefusal`'s signature.** It has 4 consumers, one of which (`whoami`, at
   `core/cli.ts:2409`) has no target concept. Key Finding 05. Phase 1 changes only the
   *message builder*, not the predicate.
3. **Do NOT touch the gate's decision logic.** Phase 1 is projection + message text only. The
   target-scoping is Phase 2 and is not yours yet.
4. **Do not add a registry read to the gate hot path.** `core/cli.test.ts:5147` asserts
   `reads === 0`. Key Finding 06. If that test goes red, stop and tell me.
5. **TDD, genuinely.** Write the failing test, watch it fail *for the right reason*, then make
   it pass. `AGENTS.md` Pattern P8: tests target `core/`, fakes live in `adapters/fakes.ts`.
   **No mocks** — real fixtures and the existing fakes only.
6. **P7**: `.js` extension on all relative imports (NodeNext/ESM).
7. `noUncheckedIndexedAccess` is ON — guard index access.

## Proof commands

```bash
npx tsc --noEmit                              # type surface
npx vitest run .pi/extensions/pij/            # the suite you are extending
harness checks --quick                        # your phase gate (task 1.6)
```

**Known flake — read before believing a red**: the suite is load-sensitive.
`cli.integration.test.ts` fails under parallel load with a tmux socket error and passes in
isolation. A full run once showed 4 failures and a clean re-run showed 3952 passed / 0 failed.
**Re-run before reporting a red, and say plainly that you re-ran.**

## Batons — you hold none

`git-index` (pathspec-mandatory commits) and `daemon-restart` are **brokered by me**, not you.

- **Do not commit.** Report done; I take the commit decision.
- **Never `git add -A` / `git add .`** — specific pathspecs only, and only if I ask.
- **Never** `--no-verify`, `--no-gpg-sign`, `git reset --hard`, `git checkout .`, `git clean -fd`,
  `git stash`.
- Extension edits need a **daemon restart** to take effect live — that is a baton I hold. Your
  proof is the test suite, not a live `pij` invocation.

## Capture friction as you go

`harness observe "<what was hard or unproven>" --kind <difficulty|confusion|win>` the moment it
bites. This is not optional bookkeeping — it is the phase's `observe` chore and it feeds the
retro drain. A real capture, never a narrated one.

## Report shape — what I need back

Report to me with `pij send pij-respectable-starfish "<text>"`. **Wire discipline: `/pij`
§ C10** — pointer delivery, one instruction per send, no inlined bodies.

Report at **both edges**: when you start, and when you finish.

Your done report must carry:

| field | meaning |
|---|---|
| `claim` | one line: what you assert is true now |
| `artifacts[]` | paths — your execution log, the files you changed |
| `shas[]` | `git rev-parse HEAD` + a `git status --porcelain` summary (you do not commit) |
| `gates[]` | the exact commands you ran and their **real** verdicts |
| `observations[]` | what you captured via `harness observe` |
| `open[]` | anything unresolved, skipped, or that you had to guess |

**Every green is a claim.** I will re-run a gate and read the load-bearing hunk myself. Report
failures and skips plainly — a claim without its artifact is the exact failure mode this whole
system exists to kill. If you are blocked, say `BLOCKED` and why; do not improvise around a
hard edge.

## Questions

If something here is genuinely ambiguous, **ask me inline** — `pij send` — and keep working on
the parts that are not blocked. Do **not** use any modal question UI. Do not ask Jordan
directly; work-local questions come to me.
