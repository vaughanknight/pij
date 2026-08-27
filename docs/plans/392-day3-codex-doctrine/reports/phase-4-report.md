# Phase 4 report — pointer delivery doctrine

## Claim

Phase 4 is implemented. The executable and written contract now says: socket, RPC, and
in-process channels receive the byte-exact body; only a socketless pty path receives a
short pointer after the composer-idle guard. Persist-before-send remains separate and
unchanged.

## Artifacts

- `.pi/extensions/pij/core/daemon/loop.test.ts`
- `docs/how/pij.md`
- `skills/pij/SKILL.md`
- `docs/plans/392-day3-codex-doctrine/doctrine-amendment-pointer-relaxation.md`
- `docs/plans/392-day3-codex-doctrine/tasks/phase-4-pointer-doctrine/execution.log.md`

## SHA

- Implementation: `cb6a9ebbb6a1c5cbd1ed276ea2b5fe0422e25dce`

## Gates

- Daemon suite: **PASS** — 446/446.
- Typecheck: **PASS**.
- Changed test Biome: **PASS**.
- Skill-check PD-02 bar: **PASS** — the required before/after captures are byte-identical:
  - `.harness/temp/s392/skill-check-before.txt`
  - `.harness/temp/s392/skill-check-after.txt`
- Repository `just pij-skill-check` and `just lint` remain red only on the documented
  out-of-fence debt.

## Observations

- The routing invariant is named exactly
  `routing invariant — body on socket/RPC, pointer only where a pty can clip (plan 392 Phase 4)`
  and names Claude, Copilot, Codex-today, and socketless Claude cases.
- The skill's C10 section did not own a pointer clause. Global invariant 2 was the actual
  live owner, so C10 was not changed.
- The amendment separates P1 transport safety from P2 persistence/audit. It adds no body
  size cap and leaves command typing unchanged.

## Open

- `doctrine-amendment-pointer-relaxation.md` is deliberately DRAFT. The o-prime remains
  the single writer for government and `orient-global.md`.
- `skills/pij/SKILL.md` is live-deployed. Tell the o-prime before merge so the clause change
  is reviewed as a production prompt change.
