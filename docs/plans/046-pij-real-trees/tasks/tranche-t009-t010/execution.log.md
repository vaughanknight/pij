# Execution log — T009-T010

**Status**: complete
**Grant**: Spine Seq 171
**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Delegation**: `dlg-0004`

## Checkpoints

| At | Actor | State | Evidence |
|----|-------|-------|----------|
| 2026-07-13T15:44:00+10:00 | orchestrator | grant accepted | exact eight paths + six required mutations |
| 2026-07-13T15:45:00+10:00 | orchestrator | packet frozen | `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/prompts/dlg-0004.md` · hash `0fc05dd1` |
| 2026-07-13T15:48:00+10:00 | coder | baseline green | `harness boot --json`: typecheck and baseline tests passed |
| 2026-07-13T15:55:00+10:00 | coder | RED established | four granted test files: 203 passed, 19 failed, 222 total; failures isolated missing tree/link/adopt/spawn/projection/serializer behavior |
| 2026-07-13T15:58:00+10:00 | coder | GREEN established | focused tranche suite: 222/222 passed |
| 2026-07-13T16:08:00+10:00 | coder | mutations killed | all six required mutations produced RED and were restored |
| 2026-07-13T16:10:00+10:00 | coder | regressions green | T001-T010 targeted suite: 412/412; flow-pair compatibility: 148/148 |
| 2026-07-13T16:12:00+10:00 | coder | static gates green | `just typecheck` and `just lint` passed; lint retained only ten pre-existing warnings and one schema-version notice |
| 2026-07-13T16:13:00+10:00 | coder | harness gate green | `harness checks --quick`: typecheck, lint, test, windows-compat, pkg-audit, snapshots passed; smoke intentionally skipped by `--quick` |
| 2026-07-13T16:15:00+10:00 | orchestrator | scope cleanup | `.pi/packages.yaml` vetted-date-only audit churn restored byte-identical to `HEAD` by owner |
| 2026-07-13T16:28:00+10:00 | reviewer | APPROVE | no findings; all six required mutations RED→restore→GREEN; exact eight-file scope |
| 2026-07-13T16:31:14+10:00 | orchestrator | tranche accepted | 17-file product regression 477/477; quick full sensors green incl. Windows compatibility; smoke skipped/T012 |

## Delivered

- Added strict `tree` grammar for repository, global, and positional-subtree views,
  repeatable activity/liveness/lifecycle filters, `--all`, and JSON output.
- Added ownership-safe `link` parent/root mutation through the existing effective
  graph, preserving `spawnedBy` and every unrelated descriptor field.
- Added iterative human and nested JSON rendering that remains finite for an
  8,000-level corrupt cyclic graph and retains problem metadata.
- Wired production repository identity and dissolved-history descriptor inputs.
- Added adopt `--parent` parsing plus unknown/self/cycle validation before
  descriptor or reservation mutation, and refreshed repository identity.
- Persisted structural parent and repository identity for ordinary and agent
  control spawns without changing close ownership.
- Added stable additive session fields: `parentId`, `gitCommonDir`, `prime`, and
  `oldPrime`; eval-safe parent exports prefer structural parent and respect
  explicit-root `null`.
- Added a real temporary Git repository plus linked-worktree integration covering
  tree, link, adopt, ordinary spawn, and agent spawn.
- Cold review confirmed the iterative serializer, no-write link/adopt guards,
  repository selection, ownership preservation, and production spawn metadata.

## Required mutation evidence

| # | Mutation | RED evidence |
|---|----------|--------------|
| 1 | Disabled link cycle/no-write validation | core refusal test failed because the invalid link returned exit 0 |
| 2 | Overwrote `spawnedBy` during link | preservation test showed `pij-close-owner` changed to the structural parent |
| 3 | Inverted repository equality | default repository tree selected `pij-other` instead of `pij-root` |
| 4 | Replaced iterative JSON serialization with `JSON.stringify` | 8,000-level test threw `RangeError: Maximum call stack size exceeded` |
| 5 | Disabled adopt parent validation | unknown-parent integration returned exit 0 and mutated state |
| 6 | Omitted control-spawn parent/repository metadata | production integration descriptor lacked `parentId` and `gitCommonDir` |

Every mutation was restored before the final GREEN and gate runs.

## Final proof

- Focused T009-T010: 222/222.
- T001-T010 targeted product regressions: 412/412.
- Flow-pair compatibility: 148/148.
- `just typecheck`: pass.
- `just lint`: pass.
- `harness checks --quick`: all enabled sensors pass.
- `git diff --check`: pass.
- Final coder-owned scope is exactly the eight granted code/test files plus this log.
- Pre-existing orchestrator-owned roster, grant-request, and `tasks.md` artifacts
  were not modified by the coder.

Orchestrator checkpoint:

```text
17-file product regression                  477/477
harness checks --quick                      PASS
  typecheck, lint, full tests, windows-compat, pkg-audit, snapshots
review                                      APPROVE
```

## Deferred

- Skills/docs/domains/T011, smoke/live/T012, restart, git ceremony, and merge remain excluded.
