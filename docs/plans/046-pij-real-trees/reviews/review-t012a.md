# T012 Stage A terminal cold review

## Verdict

**APPROVE_WITH_NOTES**

The two-file smoke change is correct and the accepted Stage A gate is green.
Default scenarios use official non-interactive Pi approval while disabling
automatic extension discovery, every top-level project-local extension is
loaded exactly once, explicit scenario commands remain authoritative, and the
resolver is import-safe. The scratch topology, ownership, repository, filter,
human/JSON, and five mutation proofs satisfy the brief.

The notes are evidence-hygiene only: the accepted full-gate file is
`harness-checks-seq191.log`, not the earlier failing file named
`harness-checks-final.log`; and raw live-source hashes naturally changed for
active descriptors, so source non-mutation must be read as structural rather
than byte-identical.

## Smoke implementation

`harness/scripts/smoke.ts:9-54`:

- derives the project root from `import.meta.dirname`, with no machine or
  worktree literal;
- discovers only top-level `.pi/extensions/*/index.ts` files and sorts them;
- returns an explicit `scenario.cmd` unchanged, including whitespace;
- otherwise builds `pi --approve --no-extensions` followed by one POSIX-safe,
  single-quoted `--extension` argument per sorted local entry;
- computes the complete inventory once and supplies the same command policy to
  every default scenario;
- guards `main()` so importing the resolver does not run smoke.

`harness/scripts/smoke.test.ts` covers deterministic order, spaces,
apostrophes, missing and nested indexes, explicit command precedence, and
import safety. The reviewed repository currently resolves 9 unique top-level
entries and produces exactly 9 `--extension` arguments. The current file blobs
match the immutable patch targets:

- `smoke.ts`: `e4ca949ec8667ca1fa6cce03f8374fc73959029b`
- `smoke.test.ts`: `e8bea38f3fcb7f6bcbe045f9bd70be31a67bef0c`

The accepted full smoke sensor includes the cross-extension `todo` -> `/sql`
scenario. Its earlier adjacent-only failure is useful evidence that loading
only the scenario's own extension was insufficient; Seq 191's complete local
inventory resolved that dependency without re-enabling duplicate global
discovery.

## Mutation matrix

| Mutation | RED | Restore/GREEN |
|---|---|---|
| Remove `--approve` | `mutation-1-remove-approve.log`: default-command assertion failed, exit 1 | Final resolver restored; current smoke resolver suite passes 4/4 |
| Ignore explicit `cmd` | `mutation-2-explicit-precedence.log`: byte-exact override assertion failed, exit 1 | Explicit precedence restored; current suite passes |
| Overwrite `spawnedBy` during link | `mutation-3-overwrite-spawnedby.log`: changed keys became `parentId`, `spawnedBy`, exit 1 | `link-ownership-proof.json` reports only `parentId`; `spawnedBy` remains null |
| Invert repository membership | `mutation-4-invert-repository.log`: unrelated id entered repository output, exit 1 | `repository-exclusion-proof.json` proves global inclusion and repository exclusion |
| Regress to direct `JSON.stringify` | `mutation-5-direct-json-stringify.log`: 8,000-level case raised `RangeError`, exit 1 | Copied source hash restored byte-identically and the focused deep test returned GREEN |

No mutation remained in either product file, the scratch descriptors, or the
copied serializer fixture.

## Scratch topology proof

The evidence uses the explicit reviewed-worktree CLI path and isolated
`.harness/temp/s046/pij-home` registry required by the grant. Initial scratch
hashes match the copied source snapshots.

The link proof for `pij-condemned-cockroach` records:

- `changedKeys: ["parentId"]`;
- `parentId: null -> "pij-primary-carp"`;
- `spawnedBy: null -> null`;
- all unrelated fields unchanged.

The resulting outputs show:

- `pij-concrete-roadrunner` with effective child `pij-minimal-whale`;
- `pij-primary-carp` with linked child `pij-condemned-cockroach`;
- `pij-pregnant-dragon` as a separate adopted root;
- `pij-unrelated-tern` present in global output but absent from the
  repository-default tree;
- activity, liveness, and lifecycle filters returning only matching nodes;
- human output preserving prime, hierarchy, and filtered-parent markers.

The raw `source-sha256.txt` and `source-after-proof-sha256.txt` values differ
for four active descriptors because their daemon-owned activity fields moved
during the proof; the inactive descriptor remained byte-identical. A
structural comparison against the pre-proof snapshots, excluding
`lastTickAt`, `lastEventAt`, and `state`, found all five real source
descriptors unchanged. In particular, the real cockroach descriptor still
matches `cockroach-before-link.json` and has no `parentId`; only the isolated
scratch copy was linked.

## Full-gate evidence

`harness-checks-seq191.log` is the accepted terminal run. It reports
`status: "ok"` and passes all eight sensors:

1. local paths;
2. typecheck;
3. lint;
4. full tests;
5. Windows compatibility;
6. tmux smoke;
7. package audit;
8. snapshots.

The files named `harness-checks-full.log`,
`harness-checks-isolated-full.log`, and `harness-checks-final.log` are earlier
RED diagnostic runs and are not the accepted gate.

The accepted package audit changed the manifest hash from
`c5fc45ee468a4e7293b1e508a498234a087e8698de5df4580509a40936832840`
to
`1e9ab517ae3bf5c98594752449d36951b8f639bbf94fe665f3b5f3f15e1fe7a6`.
The execution log records five `vetted.date` updates, and the owner restored
`.pi/packages.yaml` to the exact pre-check hash without rerunning the gate, as
the brief required.

Additional accepted evidence remains green:

- T001-T011 targeted product regressions: 493/493;
- flow-pair regressions: 148/148;
- `just pij-skill-check`;
- typecheck;
- lint with the recorded pre-existing warnings.

The reviewer reran the current smoke resolver suite (4/4) and focused
`npm run smoke -- pij`; both passed.

## Exact scope

Immutable cumulative patch SHA-256:
`ae59ed2a25db551987b32ebdc552f894e5ce1e1ede540dc28baddbaa35652cf5`.

Comparing patch sections in `diff-0009.patch` and `diff-0010.patch` shows the
only Stage A implementation sections are:

- `harness/scripts/smoke.ts`
- `harness/scripts/smoke.test.ts`

The changed fleet roster and added T011/T012 checkpoint, grant, and review
packets are orchestration/review evidence, not coder implementation scope.
The allowed execution log and `.harness/temp/s046/**` proof bundle are
evidence surfaces. No Driver SDK, pij product, skill, domain, dependency,
package, real-registry, daemon-restart, commit/push, merge, or Stage B change
was introduced by this Stage A implementation.

## Remaining uncertainty

This approval covers the pre-merge smoke trust change and isolated topology
proof. Commit/push/PR readiness and hosted CI remain owner-side follow-through.
Real registry linking, canonical-main deployment, daemon restart, baton use,
and the post-merge live canary remain Stage B and require Jordan's typed
`PROCEED`.
