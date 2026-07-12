# Research Dossier: pij orchestrator-routing skill

**Generated**: 2026-07-12T01:08:00Z
**Query**: "How should a prime-briefed orchestrator be routed and guided so it plans, delegates, reviews, and reports without doing fleet work itself?"
**Effort**: Deep
**Tools**: Standard repo reads · pij interviews · SHA-verified vendored evidence
**Evidence**: 6 current sources · 3 historical evidence artifacts

## Answer

1. Deterministic stream-role detection must land on a thin orchestrator module before orient; the module states the boundary and sequences `orient-global → orient-local → brief → /thesis → preamble`.
2. The route is a controlled journey: Builder exploration and focused workshops/POCs, unified plan, frozen cold validation, a visible wait for the user's fleet choice, then `/pij pair`.
3. The orchestrator's highest-risk output is packaging—not code: dependency claims, acceptance criteria, packet paths, immutable composition, review scope, manifests, windows, and commits.
4. Coder/reviewer independence is structural and aimed: separate sessions, cold acquisition, immutable packets, reviewer-formed findings, mutation/runtime proof, and stop-and-rebrief on scope change.
5. Shared-repo safety is part of orchestration: construct in a worktree/branch per stream, keep timing batons and substrate verification, land through `/builder 8 ship` and a PR, and retain staging/commit-slot choreography only as fallback.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Module-first routing prevents worker-posture drift before orient is read. | `research/vendored/s042-interview-uec99o-response.md#Follow-ups-r2` | Add a dedicated role-stating landing module and deterministic stream probe. | High |
| F-02 | Jordan's lived sequence was preamble → explore/research → focused workshops/POCs → plan → validate → explicit fleet naming → build. | `research/vendored/s042-interview-uec99o-response.md#orchestrator_answers` A1–A2 | Encode the sequence and a hard wait-for-build-config state. | High |
| F-03 | Shared-tree defects concentrated in orchestrator-authored packaging rather than reviewed production code. | `research/vendored/s042-observations-mine-r3.md#cross_file_patterns` | Use worktree-per-stream construction to remove the shared-tree packaging class; preserve proof duties and fallback safeguards. | High |
| F-04 | Orchestrator, reviewer, and coder independently converged on source-verifying claimed seams before binding another seat to them. | `research/vendored/s042-interview-uec99o-response.md#r3` and `#r4` | Require live-source seam proof and broker missing grants before dispatch. | High |
| F-05 | Same-model separate-session review caught real defects; productive independence also required an aimed, immutable review brief. | `research/vendored/s042-observations-mine-r3.md` N1–N3 | Default to separate sessions; freeze/aim review and prohibit orchestrator finding-formation before verdict. | High |
| F-06 | Static review could not clear runtime semantics: 3 of 8 new-behavior facts escaped to the execution window. | `research/vendored/s042-observations-mine-r3.md` N4 | Require execution/smoke proof for new behavior. | High |
| F-07 | One mathematically impossible acceptance bar consumed three windowed runs and two review holds. | `research/vendored/s042-observations-mine-r3.md` N7 and numbers | Validate AC satisfiability at the plan/validate seam. | High |
| F-08 | All four fleets used an orchestrator-owned tmux window with coder/reviewer splits; the o-prime window remained isolated. | `research/vendored/s042-interview-uec99o-response.md#Follow-ups-r2` F1 | Make topology mechanically checked, not advisory. | High |
| F-09 | A bare shared-index commit swept 24 sibling-staged files despite zero fileset overlap. | `research/vendored/s042-observations-mine-r3.md` numbers and corroborations | Prefer isolated worktree indexes; retain pathspec/staged-set/commit-slot discipline for shared-trunk fallback. | High |
| F-10 | Copying retro norms into packets reduced in-window fix loops from 3 to 0 and produced 585/585 first-run green. | `research/vendored/s042-observations-mine-r3.md#cross_file_patterns` | The module should explicitly feed captured lessons into later fleet packets. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | The first s042 turn misclassified the orchestrator as a work-packet peer despite an explicit spawn task. | `reports/preamble-checkpoint.md#observations` | Direct | Use as the route-regression fixture. |
| H-02 | Current `pair.md` assumes cross-model review, while Jordan repeatedly selected same-model `gpt-5.6-sol` separate sessions. | `skills/pij/references/routes/pair.md` and vendored interview A10 | Direct | Separate-session independence is mandatory; model diversity is a plan/capstone policy decision. |
| H-03 | Current flow-pair review/fix tooling cannot reliably ingest reviewer findings into fix packets. | `research/vendored/s042-observations-mine-r3.md` N12 | Direct | Plan an explicit fix or guard against empty-finding fix packets. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Actual `/thesis` invocation proof | Run-01 practiced the shape, not the named skill step. | A prose-only check can pass while agents still skip the invocation. | Workshop the enforceable skill/check contract. |
| Route/module home | `prime.md` already performs role triage; the ask calls for a dedicated orchestrator module. | A top-level row can duplicate role knowledge; a buried role module can fire too late. | Workshop route-vs-role-module placement. |
| Cross-model threshold | Evidence supports CS-4+ plan and capstone value, but same-model review also found HIGH defects. | Over-mandating cross-model fleets raises cost; underusing them loses independent challenge. | Record a default and explicit override rule in the plan. |
| Placement enforcement home | Tmux topology is proven but currently assembled from registry/canary/tmux probes. | Skill prose alone can drift or be skipped. | Decide whether to add a pij diagnostic or extend `pij-skill-check`. |
| Worktree lifecycle ownership | The current prime ritual allocates folders/windows but does not create per-stream git worktrees. | The default construction posture needs an explicit owner, path, branch, teardown, and PR landing contract. | Plan kickoff/brief/orchestrator changes; avoid inventing a second landing engine beyond Builder ship. |

## Planning Handoff

- **Preserve**: module-first role boundary; human-led preamble; actual `/thesis`; Builder ownership; cold validation; user-controlled fleet gate; separate coder/reviewer; pointer reports; tmux isolation; worktree/branch isolation; `/builder 8 ship` PR landing.
- **Change carefully**: `skills/pij/SKILL.md`, `references/routes/prime.md`, any new orchestrator role module, `references/routes/pair.md`, and `harness/scripts/pij-skill-check.sh` are live or contract-sensitive surfaces.
- **Likely files/symbols**: `skills/pij/SKILL.md`; `skills/pij/references/routes/prime.md`; new `skills/pij/references/prime/orient-orchestrator.md` or equivalent; `skills/pij/references/routes/pair.md`; `harness/scripts/pij-skill-check.sh`.
- **Decisions still required**: enforceable `/thesis` runtime evidence; cross-model threshold; flow-pair findings ingestion; topology diagnostic ownership; worktree creation/cleanup ownership.
