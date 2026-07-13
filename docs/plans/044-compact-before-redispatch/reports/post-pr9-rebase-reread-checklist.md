# s044 — Post-PR9 Rebase/Reread Checklist

**Status**: WAITING FOR GRANT + BUILD CONFIG — release, rebase, reread, drift revision, and R9 validation complete.
**Prepared**: 2026-07-13
**Prior validated plan**: v1.4 · sha256 `dc0ebd2dee5348edc1610abe3b8a47b75e3b06142af8c3976454099fa506235c` (superseded by R5).
**Current contract**: v1.8 · sha256 `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018` · R9 `VALIDATED`.
**PR #9 result**: MERGED · merge `1336291a5a2285d37487cf83bda86b7438ba93c4` · Node 22/24/Windows green.

## Release Gate

- [x] `gh pr view 9 --repo AI-Substrate/pij --json state,mergedAt,mergeCommit,statusCheckRollup` reports `MERGED` and all required checks terminal-green.
- [x] O-prime confirms s041 ownership is released for:
  - `skills/pij/SKILL.md`
  - `skills/pij/references/00-routing.md`
  - `docs/domains/pij-skill/domain.md`
- [x] No other active stream owns any of s044's five implementation files.
- [x] No fleet, skill/domain edit, or live proof occurred before all three checks above.

## Base and Worktree Proof

- [x] Record pre-update evidence: branch, `HEAD`, worktree status, descriptor cwd, and validated-plan sha.
- [x] Fetch current remote state: `git fetch origin`.
- [x] Record post-PR9 `origin/main` sha `1336291a5a2285d37487cf83bda86b7438ba93c4`; PR merge commit is the current base.
- [x] O-prime directed checklist execution; untracked plan folder was preserved without stash/reset/clean.
- [x] Rebase `s044/compact-before-redispatch` onto `origin/main` completed cleanly.
- [x] `HEAD` and merge-base are `1336291a5a2285d37487cf83bda86b7438ba93c4`; branch/cwd and plan folder preserved.

## Exact Source Reread

- [x] Read the three released overlap files in full from the rebased tree:
  - `skills/pij/SKILL.md`
  - `skills/pij/references/00-routing.md`
  - `docs/domains/pij-skill/domain.md`
- [x] Read the other two implementation files in full because they define the target and sensor:
  - `skills/pij/references/routes/pair.md`
  - `harness/scripts/pij-skill-check.sh`
- [x] Diff the old approved base `347b6dd732110bc76b3d421e61a401cc228149d6` to post-PR9 main for all five files.
- [x] Re-check historical baseline `2d49d7^:skills/flow-pair/SKILL.md:42-73` and commit `eee2367`.

## Material-Drift Decision

- [x] Re-evaluate the plan's exact ownership contract:
  - root `SKILL.md` = always-loaded completion interrupt pointing to C3;
  - root invariant 5 = delivery-owned waiting (`pij inbox --wait`, never `pij state` wait loop);
  - C3 = timing, lifecycle, reusable/live and `--once` boundary, fire-and-forget/no-`--wait`, immediate continuation, reuse;
  - pair route = coder/reviewer completion sequence plus reload-first safety;
  - C7 = push-mode no-state-poll plus external-pull `pij inbox --wait`;
  - `pij-skill-check` = marker/ownership/order/mutation backpressure.
- [x] Recompute current line budgets and run baseline `just pij-skill-check` — green.
- [x] Compare current source to AC-01..AC-10, T001..T006, Domain Manifest, and mutation matrix.
- [x] Material drift found: PR #9 added external pull/inbox waiting to root/C1/C7/domain; compact wait checks must be narrowly scoped.
- [x] R8 found one remaining root-invariant preservation gap; update the unified plan to v1.8.
- [x] Freeze v1.8 sha `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018`.
- [x] Cold `/validate-v2` R9 is `VALIDATED` for that exact sha with no material findings.

## Fence and Build Configuration

- [x] Produce a fence-vs-manifest diff in both directions: no non-plan worktree edits exist; all five planned files exist and are released.
- [ ] Request and receive an exact o-prime grant for the five non-plan files:
  1. `skills/pij/SKILL.md`
  2. `skills/pij/references/00-routing.md`
  3. `skills/pij/references/routes/pair.md`
  4. `harness/scripts/pij-skill-check.sh`
  5. `docs/domains/pij-skill/domain.md`
- [x] Confirm plan-owned evidence paths remain allowed under `docs/plans/044-compact-before-redispatch/**` and scratch under `.harness/temp/s044/**`.
- [ ] Read back the proposed fleet verbatim and obtain Jordan's confirmation:
  - separate Copilot `gpt-5.6-sol` xhigh coder;
  - separate Copilot `gpt-5.6-sol` xhigh reviewer.
- [ ] Persist confirmed ids/models/effort/placement in the plan roster before dispatch.

## Ready-to-Dispatch Proof

- [x] `harness boot` green on the rebased worktree.
- [x] Working tree contains only owned plan artifacts before the implementation grant is exercised.
- [x] Builder reads `wait_state=WAITING_FOR_BUILD_CONFIG`.
- [ ] Start `/pij pair` only after rebase/reread, any required revalidation, exact grant, and build-profile confirmation.
- [ ] Canary coder identity/model/effort/cwd/branch/placement before the first packet; acquire the reviewer cold at first review.

## Stop Conditions

Stop and report to o-prime if PR #9 is not merged/green, any overlap remains owned, rebase touches an unapproved path, source drift changes the plan contract, the five-file grant is incomplete, or the build profile is not explicitly confirmed.
