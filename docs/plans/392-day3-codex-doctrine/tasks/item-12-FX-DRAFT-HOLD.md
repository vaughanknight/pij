# Item 12-FX — pij-skill-check.test.ts parallelism flake (DRAFT — HOLD dispatch until FREEZE LIFTED)

**Status**: investigated; dispatch HELD (restart #6 freeze; not restart-gating). Owner: this stream, via coder, after the restart settles.
**Symptom** (reviewer): `harness/scripts/pij-skill-check.test.ts` fails ~1/5 under FULL-SUITE parallelism, passes isolated on both mutated and restored trees.

## Root-cause suspects (from investigation)
The test's own skill fixture IS isolated (`mkdtempSync`, `PIJ_SKILL_ROOT=fixtureSkill`). The flake comes from the spawned `bash harness/scripts/pij-skill-check.sh`:
1. **Un-fixtured SHARED repo reads** — the script reads real-repo paths NOT redirected to the fixture: `docs/how/pij-prime.md` (:582/:584), `docs/domains/pij-skill/domain.md` (:586), `docs/plans/035-o-prime-routing-skill/vendored/*` (:610), and `.pi/packages.yaml` marker (:465). A concurrent test that writes any of these races the read. **Most likely culprit — verify which parallel test touches these.**
2. **`cd "$(git rev-parse --show-toplevel …)"` (:7)** — a git call from an external process under concurrent git activity (index.lock in the shared worktree) can perturb cwd; `|| pwd` mitigates but the relative reads above then resolve from cwd.
3. bash-subprocess contention under heavy parallel load.

## Fix direction (E22: keep the failing run's log; fix ISOLATION, never retry into green)
- Reproduce first (N full-suite runs, KEEP the failing log under this plan folder), pin the exact racing read/resource.
- Then isolate: either (a) run this file non-parallel (vitest `sequence`/`poolOptions`/fileParallelism for this file), or (b) snapshot the un-fixtured repo reads into the fixture too so the script reads only isolated copies. Prefer (b) if the racing read is pinned (true isolation); (a) is the fallback.
- Prove: multiple consecutive full-suite runs green; add a comment/guard so the isolation can't silently regress.
- No mutant gate (flake fix, not a behavioral guard); the gate is "deterministic under full-suite parallelism over N runs, logs kept."
