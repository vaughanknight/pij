# Validation — pij-real-trees-plan.md

- **Validated**: 2026-07-13T07:49:46+10:00
- **Target**: `docs/plans/046-pij-real-trees/pij-real-trees-plan.md` @ `c89c91b454018e9710b2e43ad6f37b507012a5c1e8fd0d16793f6e5828283d8f`
- **Contract sources**: `original-ask.md`; `research-dossier.md`; `government/briefs/s046-brief.md`; current `SessionDescriptor`, close, spawn, session, binding, daemon-merge, CLI, and prime source contracts
- **Checks**: required unified-plan headings and G1-G7 rows; 12 task rows; 15 AC rows; domain/file manifest scan; source verification of descriptor/ownership/merge/reattachment seams; one cold compatibility critic; targeted recheck of all retained findings
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: The plan specifies an implementation-ready durable session graph while preserving teardown ownership, legacy descriptors, lifecycle axes, repository worktree grouping, and current prime consumers; deterministic checks and cold source-backed review support that contract.
- **Consumers**: 5/5 satisfied — `pij-messaging`, `pij-control-plane`, `pij-orchestration`, `pij-skill`, and `extension-authoring-harness` have explicit compatible tasks and proof.

## Findings
| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | An absent optional `parentId` could not durably represent `--root` or suppress the legacy `spawnedBy` fallback. | `core/daemon/loop.ts:147-179`; plan AC-04/AC-14 | Resolved: tri-state `parentId?: SessionId \| null`; `null` is a latest-disk-authoritative explicit root. |
| MEDIUM | Cycle refusal could diverge from rendering if it ignored effective fallback edges. | Plan T002 / AC-04 / AC-10 | Resolved: one `effectiveParent` function drives validation and projection. |
| MEDIUM | Repository-key reattachment policy was inconsistent between preservation and recomputation. | `core/binding.ts:193-220`; plan T005-T006 | Resolved: registration and reattachment recompute and pass a fresh `gitCommonDir`; binding tests prove refresh. |

## Repairs

- Replaced optional-only parent semantics with explicit id/null/undefined tri-state.
- Bound cycle validation and rendering to the same effective graph.
- Made repository identity refresh at registration/reattachment explicit in manifest, tasks, risks, and acceptance criteria.
