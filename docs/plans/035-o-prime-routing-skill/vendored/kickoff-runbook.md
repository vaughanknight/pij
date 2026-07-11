# Kickoff runbook — "prep new orchestrator from prime"
**Writer**: the prime (pij-1bovprr) · **Purpose**: the reconstructable step-by-step of standing up a stream orchestrator, captured live during run 01 (s017, s019) so it can become a pij skill later. Jordan's ruling 2026-07-10: "we need to be able to reconstruct this process later, probably in a skill."

## Preconditions

- The prime holds the government spine + baton book (`government/spine.md`, `baton-book.md`).
- Jordan has named the work item (the prime NEVER invents features).
- `docs/how/o-prime.md` § Spawning + § Per-repo config are current.

## Steps (in order — each step's artifact named)

1. **Record the ruling** — Jordan's naming of the work item goes into spine § Rulings, verbatim where possible, dated. _Artifact: spine.md._
2. **Allocate** — scan `docs/plans/` for the next free ordinal (the spine is the reservation ledger, ordinal tools may be stale); reserve ordinal + folder + window name (`s<ord>-<slug>`) in spine § Allocation ledger. _Artifact: spine.md allocation line._
3. **Derive fences from actions** — enumerate what the plan will actually touch (source dirs, test pins, config, docs), verify the paths exist on disk (`ls`), record as a spine § fences section. Check overlap against every other stream's fences — overlap = a prime sequencing decision made NOW, recorded in the spine, before any spawn. _Artifact: spine § s<ord> fences + overlap note._
4. **Add the roster row** — stream row in the spine table (status: allocating), bump the Updated stamp. The spine syncs on EVERY event (overseer OL-010: a stale row is worse than no row). _Artifact: spine roster._
5. **Write the brief BEFORE spawning** — instantiate `briefs/stream-brief-template.md` → `government/briefs/s<ord>-brief.md`: plan folder + current flow state, the ask verbatim, fences (pointer to spine as canonical), baton + fleet + report-contract rules, the human-in-loop section, window + identity line. Fold peer-craft habits in (pointer delivery, canary-before-brief, compact-before-next-packet, mutation gates, verdict-artifact checks). _Artifact: the brief file._
6. **Spawn** — `pij spawn --harness claude --layout window`; note the returned pij-id + pane id. Rename: `tmux rename-window -t <pane> s<ord>-<slug>`. _Artifact: run record._
7. **Wait for the daemon's ready push** (never poll) — "✅ <id> is ready (bound to claude session <uuid>)" arrives as an injected turn.
8. **Canary, three legs, recorded to disk** (`government/canary-s<ord>.md` — written at pass time, not later; claim-without-artifact is the failure mode, overseer OL-009):
   a. round-trip: send a nonce challenge; the ack must arrive as an injected turn;
   b. identity, mechanical: `pij sessions` row (harness/lifecycle/parent/session-uuid) — boundModel column is empty for claude peers (known gap), so fallback-probe the tmux pane footer (`tmux capture-pane`) for the model name;
   c. input reliability: a SECOND send must also land — the brief-pointer send doubles as this leg; its ack closes the record.
9. **Deliver the brief by pointer** — `pij send <id> "<brief path> — read it and its reading list, ack with brief-ack"`. Never inline. The brief-ack closes canary leg (c).
10. **Sync the spine** — roster row → status briefed/planning, peer id filled, stamp bumped. _Artifact: spine.md._
11. **Report up** — prime→overseer pointer report (`run-01/reports/prime-NNNN.md`): claim, artifacts (spine/brief/canary paths), canary evidence, observations. _Artifact: the report._
12. **Round-one addendum**: Jordan then drives the stream directly in its pane (taught apprenticeship — he expects to prompt it directly); the prime shifts to governing (batons, spine, relaying reports) + observing the process for the skill harvest.

13. **Teardown (dissolution or completion)** — ownership-aware: notify the peer (stand-down note naming the ruling), `pij close <id>` (never just `tmux kill-window`), then **verify** `pij state <id>` returns E-NOID and the `pij sessions` row is gone. **Gotcha found live (s019)**: `pij close` reported success but the daemon's stalled-detector resurrected the descriptor from queued events minutes later — a dissolved stream then reads identical to a CRASHED one (`working·dead / stalled`). Re-run `pij close` after the event queue drains, and re-verify. Strike the spine row (don't delete — history), release the ordinal in the allocation ledger, transplant any insight the dying stream produced into the absorbing stream's brief.
14. **Structure tree in every brief** (Jordan's ruling via s017, ~13:00Z): the brief must carry the full org tree — overseer/prime/sibling streams with pij-ids + windows — so agents know who is around them. Suggested upward as a protocol addition to o-prime.md § Spawning; applied locally from s017 onward.

15. **Fence-vs-manifest diff as a deliberate step** (from the run's first fence escalation, OL-032): when a stream's plan reaches validation, diff the plan's Domain Manifest / task paths against the fences in its brief — every mismatch is either a fence amendment (escalate → prime verifies → grant recorded in spine) or a plan error. In run one the validator caught this by accident (F6, zero code at risk vs 016's mid-implementation amendments); the skill should make it a briefed, deliberate check at plan-validation time — both directions: paths outside fences AND fenced paths no task touches.

16. **Adoption (variant of steps 5–9)** — when the human (or anyone else) spawned the
    peer, the o-prime ADOPTS it instead of spawning: same canary (the peer's
    provenance is unknown to you — the canary matters MORE, and `pij sessions` will
    show no parent), then an **adoption brief** pointing at the orient stack
    (global → local → protocol → map) + "orient via the builder skill" + provisional
    assignment. Roster it as ADOPTED with its spawner noted. **Expect the human to
    run a preamble with an adopted orchestrator before work starts** — hold the
    assignment provisional until that preamble rules.

## Live deviations observed (feed the skill)

- s017: canary record initially existed only in the prime's transcript — overseer spot-check caught it (OL-009). Fix folded into step 8: write the record at pass time.
- s017: spine roster row went stale while rulings were appended (OL-010). Fix folded into step 4/10: stamp+row sync on every event, not just spawns.
- s017 kickoff happened before the slate was settled with Jordan — brief HELD post-canary. Lesson: settle the slate (step 1) before spawning, or expect held peers.
- Ordering matters: brief-before-spawn (step 5 before 6) keeps the canary→brief gap tight so the fresh peer isn't idling while the prime writes prose.
