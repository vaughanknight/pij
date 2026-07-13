# Research Dossier: Completion-Time Peer Compaction

**Generated**: 2026-07-12T10:25:00Z
**Query**: "How does the live pij skill tell orchestrators to compact completed coder/reviewer peers, how did historical versions make completion-time compaction harder to miss, and what is the smallest durable restoration?"
**Effort**: Standard
**Tools**: Standard
**Evidence**: 7 current sources · 3 historical sources

## Answer

- The live skill contains the correct completion trigger but the pre-R5 receipt gate is now superseded: send compact immediately without `--wait`, then continue report/review/fix work.
- The regression is salience, not missing product capability. The router split reduced a dedicated completion-interrupt section to one C3 paragraph plus terse `REVIEW`/`FIX`/`APPROVE` arrows.
- The pre-port flow-pair skill explicitly made compaction the first action, explained the 30–90s overlap benefit, applied it equally to reviewers, and separated early start from redispatch-time receipt verification.
- The existing `pij-skill-check` can prevent another prose regression, but currently asserts no completion-first markers or ordering.
- The smallest supported change is skill-only: promote completion-first compaction into the always-loaded root invariants, restore a focused completion-interrupt block in the pair route, keep C3 as the shared convention owner, and mutation-prove the contract in `pij-skill-check`. No CLI or daemon change is evidenced.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | `SKILL.md` is always loaded before the direct pair route, but its global invariants contain no completion-time compact interrupt. | `/Users/jordanknight/pi-hacking/pij/skills/pij/SKILL.md:12-17,48-56` | A concise root invariant is the highest-salience place to prevent the first action from being forgotten. | High |
| F-02 | Shared C3 states the correct completion timing but its receipt-before-pointer language predates R5's fire-and-forget ruling. | `skills/pij/references/00-routing.md:52-54`; `rulings.md#r5` | C3 must own non-blocking compact dispatch explicitly: no compact `--wait`, no receipt/latency gate. | High |
| F-03 | The pair route names compaction first in the state table and pipeline, but has no dedicated completion interrupt or early-vs-late rationale. | `/Users/jordanknight/pi-hacking/pij/skills/pij/references/routes/pair.md:47-56,158-177` | Restore route-local procedure immediately beside the state machine so completion handling is executable without reconstructing C3. | High |
| F-04 | Remote compact already works without arming and exposes receipts, but R5 makes those receipts observe-only rather than flow gates. | `/Users/jordanknight/pi-hacking/pij/docs/how/pij.md:154-165,184-195`; `rulings.md#r5` | No new command or daemon state is needed; skill text must prevent `--wait` or receipt blocking. | High |
| F-05 | `pij-skill-check` already enforces exact markers and ordering for other behavioral contracts but has no compaction assertions. | `/Users/jordanknight/pi-hacking/pij/harness/scripts/pij-skill-check.sh:60-98,163-268` | Add completion-first marker/order checks and mutation fixtures before changing skill prose. | High |
| F-06 | The `pij-skill` domain owns the router, conventions, pair front door, and structural gate while excluding CLI mechanics. | `/Users/jordanknight/pi-hacking/pij/docs/domains/pij-skill/domain.md:5-22,33-38` | This is a `pij-skill` plus `extension-authoring-harness` change; product domains are consumers only. | High |
| F-07 | The triggering misses were coder build→fix and reviewer review→re-review; raw compaction already existed. | `docs/plans/044-compact-before-redispatch/original-ask.md:13-35` | Acceptance must cover both coder completion and reviewer verdict, not only between-phase reuse. | High |
| F-08 | PR #9 introduced external pull delivery where `pij inbox --wait` is required and is not a liveness poll. | `skills/pij/references/00-routing.md:26-44,68-70`; `docs/domains/pij-skill/domain.md:18-21,40-46` | Compact no-`--wait` sensors must be command/section-specific and preserve inbox waiting. | High |
| F-09 | PR #9 duplicated the delivery-owned-waiting contract into always-loaded root invariant 5 for salience. | `skills/pij/SKILL.md:48-56` | Add an independent root marker/removal mutation; C7-only protection is insufficient. | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | The pre-port skill had a dedicated `Worker context hygiene — compact EARLY, not late (reflexive)` section: first action, overlap rationale, reviewer parity, safety caveat, and receipt proof. | `2d49d7fc67bda84be07cb6dae82fe6a5cc261d25^:skills/flow-pair/SKILL.md:42-73` · sha256 `7688f60ae364aef73ed2b1e4ad39ba3d47544561087a134dc21730821e91abd9` | Partial | Restore the completion-first shape, but R5 supersedes its blocking receipt confirmation. |
| H-02 | Commit `eee2367` deliberately changed the rule from “as soon as REVIEW begins” to “the instant worker or reviewer reports done, before anything else,” explicitly to overlap 30–90s latency. | `eee23678c4254cfa7aee0c9bfe1a619c6b168681` | Direct | Completion arrival is the primary seam; R5 strengthens the overlap by removing receipt waits entirely. |
| H-03 | Commit `2d49d7f` ported flow-pair into `/pij pair`; the dedicated section disappeared while its essence was compressed into C3 and route arrows. | `2d49d7fc67bda84be07cb6dae82fe6a5cc261d25` | Direct | Treat the router port as the regression boundary and preserve progressive disclosure without sacrificing the completion interrupt. |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Structural text can pass while a fresh agent still handles the report first. | F-05; plan 042 used cold acceptance for behavioral prose. | Marker presence alone must not be called runtime proof. | Add a cold agent canary that observes tool/event order after a completion report. |
| Root, C3, and pair-route wording can drift or duplicate. | F-01–F-03; `pij-skill-check` single-owner rule. | Repetition can recreate the same progressive-disclosure regression in reverse. | Root carries the interrupt, C3 owns shared rationale/receipt convention, pair carries route-specific sequence; gate exact responsibilities. |
| s041 currently owns the live skill surfaces first. | Live government spine Seq 65 and s044 R2/R3 acknowledgement. | Planning can name overlaps but implementation cannot start until sequencing is granted. | Stop at `WAITING_FOR_BUILD_CONFIG`; o-prime adjudicates the final manifest after s041 lands. |
| FlowSpace graph is absent in the allocated worktree. | `flowspace search` returned missing `.fs2/graph.pickle`. | Semantic code search was unavailable, but exact skill paths and git history answered the question. | No confidence reduction; capture as harness friction separately. |

## Domain Impact

| Domain / boundary | Relationship | Contract or constraint | Evidence |
|-------------------|--------------|------------------------|----------|
| `pij-skill` | modify | Add the completion interrupt while independently preserving root invariant 5, C1/C7 pull behavior, shared C3, and pair handling. | F-01–F-03, F-06, F-08, F-09 |
| `extension-authoring-harness` | modify | Structural and mutation proof for completion-first wording and ordering. | F-05 |
| `pij-messaging` / `pij-control-plane` | consume | Existing compact command and receipt semantics; no product modification. | F-04 |
| `flow-pair` | consume | Existing packet/report/fix lifecycle; engine remains unchanged. | F-03, F-07 |

## Planning Handoff

- **Preserve**: C3 completion timing/safety, fire-and-forget/no compact `--wait`, C7 push-mode no-state-poll plus external `pij inbox --wait`, reviewer parity, and progressive disclosure.
- **Change carefully**: `skills/pij/SKILL.md`, `skills/pij/references/00-routing.md`, and `skills/pij/references/routes/pair.md` are live-deployed agent contracts; s041 has first ownership.
- **Likely files/symbols**: `skills/pij/SKILL.md`; `skills/pij/references/00-routing.md`; `skills/pij/references/routes/pair.md`; `harness/scripts/pij-skill-check.sh`; `docs/domains/pij-skill/domain.md`.
- **Decisions still required**: exact post-s041 wording across root/C3/pair and the cold-canary fixture shape; `00-routing.md` is a required implementation file because R5 replaces its receipt gate.
