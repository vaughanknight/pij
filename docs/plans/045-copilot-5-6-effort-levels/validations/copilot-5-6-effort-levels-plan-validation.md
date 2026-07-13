# Validation — copilot-5-6-effort-levels-plan.md

- **Validated**: 2026-07-12T22:28:06Z
- **Target**: `docs/plans/045-copilot-5-6-effort-levels/copilot-5-6-effort-levels-plan.md` · `773d44e9ad88d8eea4698c924e997766bb281d82f7e0c163f86fef5a0ca7e140`
- **Contract sources**: `government/briefs/s045-brief.md`; `docs/plans/045-copilot-5-6-effort-levels/original-ask.md`; `research-dossier.md`; current model registry/validator/CLI/spawn sources
- **Checks**: unified-plan structure script; G1–G7/AC/task/finding/path resolution; current source and live Pi/Copilot effort probes; applicable Plan 025 + `d03bac3` history; independent cold critic + snapshot-seam recheck; Pi-client scope critic + targeted recheck; `git diff --check`
- **Verdict**: VALIDATED WITH FIXES
- **Thesis / proof**: The plan is implementation-ready for the exact Copilot trio correction; source tracing proves the two registry construction seams reach every named discovery/validation consumer while preserving scope.
- **Consumers**: 7/7 satisfied — raw Pi rows, Copilot seed clones, snapshot aliases, Copilot model output, peer spawn, agent run/spawn, and the bounded Pi-client view/shared-validator contract.

## Findings

| Severity | Finding | Evidence | Status |
|---|---|---|---|
| MEDIUM | Version 1.0.0 ambiguously described a provider=`github-copilot` resolver while snapshot aliases are constructed as provider=`copilot` outside parsing | `registry.ts:72-126,197-216`; original plan Key Finding 01, Risks, T003 | Resolved in v1.0.1: one exact-id constant, provider-guarded parse path, direct `copilotEntry()` snapshot application; targeted cold recheck returned `resolved` |
| MEDIUM | Initial AC-08 overclaimed end-to-end Pi spawn validation even though canonical provider-prefixed ids do not exact-match bare registry ids inside the granted fence | `validate.ts:52`; `match.ts`; existing Pi command tests; plan v1.0.2 AC-08/T002 | Resolved: Pi-filter advertisement, shared bare-id validation, and unchanged `:<level>` translation are explicit; provider-prefix normalization is separately fenced; targeted recheck returned `resolved` |

## Repairs

- Builder revision `1.0.1` aligned Research Context, Summary, risk mitigations, Key Finding 01, T003, and final Risks with the two explicit source seams.
- Builder revision `1.0.2` incorporated Jordan's Pi-client ruling without adding a production file and bounded the provider-prefix limitation honestly.
- Spine Seq 128 added only the fire-and-forget peer-compaction coordination contract; product requirements, tasks, ACs, and implementation shape are unchanged.
- Targeted structure/source rechecks passed against the implementation-bearing content; current target SHA is `773d44e9ad88d8eea4698c924e997766bb281d82f7e0c163f86fef5a0ca7e140`.
