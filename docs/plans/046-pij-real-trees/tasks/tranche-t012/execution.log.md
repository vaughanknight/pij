# Execution log — T012 Stage A

**Status**: complete
**Grant**: Spine Seq 188; continuation Seq 191
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Delegation**: `dlg-0006`

## Checkpoints

| At | Actor | State | Evidence |
|----|-------|-------|----------|
| 2026-07-13T20:51:00+10:00 | orchestrator | Stage A grant accepted | two harness paths + scratch/evidence only; Stage B ungranted |
| 2026-07-13T20:52:00+10:00 | orchestrator | packet frozen | `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0006.md` · hash `c2bae70b` |
| 2026-07-13T20:56:00+10:00 | coder | resolver GREEN | default `pi --approve`, byte-exact explicit command precedence, and import-safe direct entry; 3/3 tests |
| 2026-07-13T21:03:00+10:00 | coder | scratch proof GREEN | reviewed-worktree CLI only; isolated `PIJ_HOME`; parent/owner, repository, filter, JSON, and human-output evidence captured |
| 2026-07-13T21:08:00+10:00 | coder | mutations killed | all five required mutations produced intended RED and were restored |
| 2026-07-13T21:10:00+10:00 | coder | targeted gates GREEN | smoke resolver 3/3; T001-T011 product 493/493; flow-pair 148/148; skill sensor, typecheck, and lint passed |
| 2026-07-13T21:12:00+10:00 | coder | full gate BLOCKED | all sensors passed except smoke; package audit refreshed `.pi/packages.yaml` dates, requiring owner cleanup |
| 2026-07-13T21:16:00+10:00 | orchestrator | smoke root cause confirmed | global and project extension discovery double-loaded identical tools, causing Pi to exit status 1 |
| 2026-07-13T21:18:00+10:00 | coder | isolated pij smoke GREEN | `--no-extensions` plus a safely quoted local extension fixed duplicate loading; adjacent-only discovery exposed todo's session-sql dependency |
| 2026-07-13T21:24:00+10:00 | orchestrator | Seq 191 granted | load the complete deterministic top-level project-local extension inventory exactly once |
| 2026-07-13T21:27:00+10:00 | coder | full gate GREEN | all eight harness sensors passed, including every tmux smoke scenario |
| 2026-07-13T21:30:00+10:00 | orchestrator | audit cleanup complete | five `vetted.date` changes restored byte-identical to `HEAD`; accepted full gate remains green |

## Delivered

- Added deterministic discovery of every top-level project-local
  `.pi/extensions/*/index.ts`, excluding nested and missing-index directories.
- Added an exported smoke-command resolver that defaults to
  `pi --approve --no-extensions` plus one safely shell-quoted `--extension`
  entry per discovered local extension, sorted independently of filesystem
  order. Global extensions are disabled and local extensions load exactly once.
- Preserved an explicit scenario `cmd` byte-for-byte as the authoritative
  override.
- Added a direct-entry guard so importing `smoke.ts` does not discover or run
  scenarios.
- Added unit coverage for complete top-level inventory, deterministic order,
  safe quoting including spaces and apostrophes, no machine/worktree-specific
  path, explicit precedence, and import safety.

## Scratch reviewed-worktree proof

- Used only
  `npx tsx /Users/jordanknight/pi-hacking/pij-worktrees/s046-pij-real-trees/.pi/extensions/pij/cli.ts`
  with `.harness/temp/s046/pij-home` as `PIJ_HOME`.
- Copied exact descriptors located through `pij path <id> --state` for
  `pij-primary-carp`, `pij-condemned-cockroach`,
  `pij-concrete-roadrunner`, `pij-minimal-whale`, and
  `pij-pregnant-dragon`; source and scratch SHA-256 evidence is under
  `.harness/temp/s046/evidence/`.
- Captured global and `pij-primary-carp` subtree JSON before and after linking
  `pij-condemned-cockroach` under `pij-primary-carp`.
- Structural comparison proved the link changed only `parentId`;
  `spawnedBy` and every unrelated field remained unchanged.
- Global output showed the s046 coder/reviewer effective edge
  `pij-concrete-roadrunner` -> `pij-minimal-whale`, the linked prime/stream
  edge, and `pij-pregnant-dragon` as a separate adopted seat.
- An unrelated synthetic repository descriptor appeared in `--global --all`
  but was excluded by the repository-default `tree --all`.
- Activity, liveness, and lifecycle JSON filters each returned only matching
  nodes; composed human output rendered the expected prime, hierarchy, and
  filtered-parent markers.

## Required mutation evidence

| # | Mutation | RED evidence | Restoration |
|---|---|---|---|
| 1 | Removed `--approve` from the resolver default | default-command unit test failed | product resolver restored |
| 2 | Ignored explicit scenario command precedence | byte-exact precedence test failed | product resolver restored |
| 3 | Overwrote `spawnedBy` in the linked scratch descriptor | ownership comparison reported `parentId` and `spawnedBy` changes | correct linked descriptor restored byte-identically |
| 4 | Assigned the synthetic descriptor to the reviewed repository | repository exclusion assertion included `pij-unrelated-tern` | unrelated-repository descriptor restored byte-identically |
| 5 | Replaced iterative JSON serialization with direct `JSON.stringify` in a copied product/test tree | copied 8,000-level test failed with `RangeError: Maximum call stack size exceeded` | copied source restored byte-identically and test returned GREEN |

## Gates

| Gate | Result |
|---|---|
| `just test harness/scripts/smoke.test.ts` | PASS - 4/4 |
| T001-T011 targeted product regressions | PASS - 493/493 |
| `just flow-pair-test` | PASS - 148/148 |
| `just pij-skill-check` | PASS |
| `just typecheck` | PASS |
| `just lint` | PASS - ten pre-existing warnings and one schema-version notice |
| isolated single pij smoke | PASS |
| full `harness checks` | PASS - local-paths, typecheck, lint, full test, Windows compatibility, smoke, package audit, and snapshots |

The first full run exposed duplicate tool registration because Pi discovered
both global and project-local copies. An adjacent-only isolation attempt made
the pij smoke green but correctly failed todo's `/sql` dependency. Seq 191
resolved both constraints by disabling automatic extension discovery and
loading the complete sorted top-level local inventory exactly once.

The final package audit changed only five `.pi/packages.yaml` `vetted.date`
values. The pre-check hash was
`c5fc45ee468a4e7293b1e508a498234a087e8698de5df4580509a40936832840`;
the post-check hash was
`1e9ab517ae3bf5c98594752449d36951b8f639bbf94fe665f3b5f3f15e1fe7a6`.
The owner restored the manifest byte-identical to `HEAD`; audit was not rerun.

## Deferred

- Real registry mutation, daemon restart, merge, and post-merge canonical canary remain Stage B and require typed `PROCEED`.
- Commit/push/ready and all Stage B work remain pending.
