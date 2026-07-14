# s048 upstream pi-mono hardening reconciliation

**Source of truth**: `government/briefs/s048-pi-mono-hardening-note.md` (Seq 197; correction in Seq 198)

## Corrected native npm semantics

| Check | Evidence | Result |
|-------|----------|--------|
| npm version | `npm --version` in s048 worktree | `11.10.0` |
| Default | `npm config get min-release-age` and `npm config list -l` | `null` |
| Unit | npm 11.10.0 `@npmcli/config` definition hint `<days>`; documentation; implementation cutoff `Date.now() - (86400000 * value)` | **days** |
| Upstream value | `pi-mono/.npmrc` | `min-release-age=2` = two days |
| s048 value | Jordan’s seven-day direction | `min-release-age=7` = seven days |

The prior `10080`/minutes plan assumption was invalid: it would configure **10,080 days**. It is removed from the plan, research, task/probe contract, flow note, and validation evidence before any implementation/coder dispatch.

## Control classification

| Upstream pi-mono control | Classification | s048 action / boundary |
|--------------------------|----------------|------------------------|
| Exact direct external dependency pins | Complementary | No manifest-wide pinning change is granted. Preserve current dependency behavior. |
| `save-exact=true` | Complementary | Do not add it incidentally; it requires a separate dependency-policy decision. |
| `min-release-age=2` | Adopted pattern | Use the same native control at the human-directed `7`-day value. |
| Lockfile ground truth | Already covered | Prove `npm ci` succeeds and leaves manifests/lock untouched. |
| Lockfile commit guard | Complementary | No new pre-commit hook or git policy is in s048’s fence. |
| Published CLI shrinkwrap | Explicitly outside | pi-mono release/package-publishing control, not pij’s release-age seam. |
| Isolated npm/Bun release smoke | Explicitly outside | A release-process expansion is not authorized. |
| `--ignore-scripts` | Already covered / complementary | Existing pij Pi install/update commands already use it; preserve it and do not create lifecycle-policy machinery. |
| CI `npm ci --ignore-scripts` | Complementary | Not changing CI or root install semantics without a refreshed fence. |
| Scheduled `npm audit` + audit signatures | Complementary | Retain separate root `npm audit --json` proof only; no scheduled workflow or signature-check expansion. |
| Lifecycle-script allowlisting | Explicitly outside | Preserve existing vetting and `--ignore-scripts`; do not duplicate pi-mono shrinkwrap machinery. |
| Pi self-update age-zero argument | Explicit external boundary | Document and regression-observe it; do not claim pij controls upstream self-update. |

## Scope result

No implementation surface expands. The existing implementation grant remains limited to the Seq 197 paths, with PR #14’s `justfile`, `harness/scripts/packages.ts`, and `docs/how/build.md` still read-only until separately released. The next permitted action is corrected cold plan validation, then a request for an updated implementation release.
