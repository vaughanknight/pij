# Validation — memorable-pij-session-ids-plan.md

- **Validated**: 2026-07-11T12:42:22Z
- **Target**: `docs/plans/040-memorable-pij-session-ids/memorable-pij-session-ids-plan.md` · sha256 `a3e274f9f224b29568808d4967d5cbad836c2c7e4807fa9d32b62350f9137af0`
- **Contract sources**: `original-ask.md`, `research-dossier.md`, `rulings.md`, Plan 038 Phase 2 execution/review, Plan 039 rulings/checkpoint/execution log, current pij identity/spawn/registry/package contracts
- **Checks**: unified-plan structure; 16/16 AC coverage; 9/9 task and manifest resolution; TDD order; prior-finding closure; current s038 source seam; post-s039 package/PoC state; migration and consumer review; independent readiness critique; `git diff --check`; `harness checks`
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: The `READY` plan now reaches implementation proof: every new identity path shares one collision-safe primary-id contract, legacy identities remain stable, and both shared seams are explicitly sequenced.
- **Consumers**: SATISFIED — Pi lifecycle, spawn, agent spawn, adopt, registry/filesystem, CLI/Telegram/message/telemetry, s038 prime metadata, and the post-s039 package seam are covered.

## Findings
| Severity | Finding | Evidence | Status |
|---|---|---|---|
| HIGH | Spawner death must never auto-reclaim a descriptor-free reservation because the launched child may already hold the id. | AC-10 `:135-138`; risk response `:161`; crash-window RED tests T003/T004 `:291-292`; retention implementation T006/T007 `:294-295`. | CLOSED — spawner death alone cannot reclaim; only known failure, successful promotion, or explicit recovery changes ownership. |
| HIGH | `pij adopt --id` must not mint a caller-chosen new primary id. | Ruling §7; Non-Goal `:49-50`; AC-16 `:152-154`; parser/integration coverage T004 and reattachment-only wiring T007 `:292,295`. | CLOSED — existing descriptor/reservation reattachment only; unknown id is `E-NOID`; native conflict is `E-AMBIG`. |
| HIGH | The plan assumed the package and PoC files still existed after s039, leaving no governed dependency re-add before T005 could turn RED tests green. | Current `package.json`/lock contain no `unique-names-generator`; PoC source/test/script/recipe are absent; s040 ruling §6 requires a post-s039 fence; repaired T001/T005 `:289,293`. | FIXED — the plan now requests the package fence first, re-adds the exact dependency with production code in T005, keeps PoC-only surfaces absent, and gates audit against the 26/0-critical baseline. |

## Repairs

- Reposted package/PoC work from stale retain/delete language to post-s039 re-add/create/verify-absence language.
- Added the explicit s040 package-manifest/git-index fence before T005 without changing the nine-task phase.
- Corrected AC-13/14, Domain Manifest, coverage, risk, and audit-baseline references, then reran the targeted structural and completion checks.
