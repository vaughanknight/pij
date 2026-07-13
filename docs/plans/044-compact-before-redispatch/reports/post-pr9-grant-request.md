# s044 report — post-PR9 grant request

**From**: pij-eventual-scorpion · **To**: pij-primary-carp · **Date**: 2026-07-13 · **Stage**: exact grant + build-profile confirmation

## claim

The armed post-PR9 checklist is complete through rebase, full five-file reread, material-drift revision, and cold R9 validation. Plan v1.8 is `VALIDATED` at sha256 `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018` on merged base `1336291a5a2285d37487cf83bda86b7438ba93c4`. No non-plan edit or fleet exists.

## artifacts[]

- `docs/plans/044-compact-before-redispatch/compact-before-redispatch-plan.md`
- `docs/plans/044-compact-before-redispatch/validation/compact-before-redispatch-plan-validation-r9.md`
- `docs/plans/044-compact-before-redispatch/reports/post-pr9-rebase-reread-checklist.md`
- `docs/plans/044-compact-before-redispatch/the-flow.json`

## shas[]

- plan v1.8 — `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018`
- R9 validation — `c9a38610a2f1bba9b9c25216b8c6d816ef929302f05481c633fd8c175f2c32ec`
- checklist — `bd47198063bf83016edcb7bc2e76a4dc9e3b21d2f917e06d55912224b8c9a9c2`
- flight plan — `60562735dbb95c380ca96917508c530fa2585bd722b93f309b33b4a32f0085c9`
- rebased `HEAD` / merge-base — `1336291a5a2285d37487cf83bda86b7438ba93c4`

## gates[]

- PR #9 — MERGED; Node 22/24/Windows green; ownership released at Spine Seq 141.
- Rebase — clean; untracked plan folder preserved without stash/reset/clean.
- Full source reread — `SKILL.md`, `00-routing.md`, `pair.md`, `pij-skill-check.sh`, and `pij-skill/domain.md`.
- Baseline `just pij-skill-check` — green after PR #9.
- Material drift — v1.8 protects root invariant 5 and C7 `pij inbox --wait` while scoping R5 no-`--wait` to compact dispatch.
- Cold `/validate-v2` R9 — `VALIDATED`, no material findings, exact plan/base match.
- `harness boot` — ready; typecheck and tests green.
- Fence-vs-manifest — no non-plan worktree changes; all five requested paths exist and are unowned.
- Builder — `wait_state=WAITING_FOR_BUILD_CONFIG`.

## exact grant request

Grant implementation access to exactly:

1. `skills/pij/SKILL.md`
2. `skills/pij/references/00-routing.md`
3. `skills/pij/references/routes/pair.md`
4. `harness/scripts/pij-skill-check.sh`
5. `docs/domains/pij-skill/domain.md`

Retain plan evidence under `docs/plans/044-compact-before-redispatch/**` and scratch under `.harness/temp/s044/**`.

Grant conditions from the validated plan:

- structural sensor RED before payload changes;
- preserve PR #9 root invariant 5, C1/C7 push-vs-pull behavior, Pull guidance concept/history, and `pij inbox --wait`;
- compact is first-action fire-and-forget with no compact `--wait` or receipt gate;
- no `.pi/extensions/pij/**`, CLI, daemon, flow-pair engine, package, schema, or dependency changes;
- cold reusable-peer event-order canary and mutation matrix before acceptance;
- no daemon restart required for skill-only work.

## build-profile readiness

Proposed profile, read back verbatim for Jordan's confirmation:

- **Coder**: separate Copilot `gpt-5.6-sol` at `xhigh`.
- **Reviewer**: separate Copilot `gpt-5.6-sol` at `xhigh`, acquired cold at first review.

No peer has been spawned. After confirmation, persist ids/model/effort/placement in the plan roster before dispatch.

## observations[]

- `OBS-PR9-01 / compatibility / pij-skill` — compact no-`--wait` checks must be command-scoped because external `pij inbox --wait` is a required delivery primitive.
- `OBS-PR9-02 / backpressure / agent-harness` — root and C7 need independent preservation sensors; either can otherwise drift while the other remains green.

## open[]

- Exact five-file grant.
- Jordan's verbatim build-profile confirmation.
- Fleet creation and implementation remain unauthorized until both are received.
