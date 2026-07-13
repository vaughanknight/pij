# Rulings — compact before redispatch

## R1 — Preamble accepted; planning authorized

**Source**: Jordan, relayed by o-prime `pij-primary-carp` on 2026-07-12.

> Jordan's direct `spin one` authorizes Builder explore/plan under the planning-only fence. Proceed through cold plan validation, then STOP at `WAITING_FOR_BUILD_CONFIG`.

**Effect**:

- Builder explore and unified planning are authorized.
- Product and skill files remain read-only.
- Cold validation must judge the frozen plan.
- Implementation, task dispatch, and fleet creation remain unauthorized.
- Live government authority is `/Users/jordanknight/pi-hacking/pij/government/`.

## R2 — Compact at completion, not just-in-time

**Source**: Jordan, direct in-pane ruling on 2026-07-12.

> Check the live `skills/pij/SKILL.md` and where it tells folks to compact. Compaction should start immediately after the peer finishes, not just-in-time before redispatch; it takes a while, so get it on the stove early.

**Effect**:

- The target is `/Users/jordanknight/pi-hacking/pij/skills/pij/SKILL.md` and the route/reference text it dispatches to.
- The primary enforcement seam is peer-completion/report handling.
- Compaction starts before report review, next-packet preparation, reviewer acquisition, or sanity checking.
- Redispatch may verify the earlier compact completed, but must not defer starting compaction until dispatch.
- Product and skill files remain read-only during planning.

## R3 — Compare historical skill versions

**Source**: Jordan, direct in-pane ruling on 2026-07-12.

> Historical versions of the skill did a better job at this.

**Effect**:

- Research must inspect git history for `skills/pij/SKILL.md` and its compact-discipline route/reference text.
- The dossier must identify the strongest prior completion-time wording or structure, when it changed, and whether restoring that shape is smaller than adding product mechanics.
- Historical quality is a hypothesis to verify from diffs, not an assumed conclusion.

## R4 — One-shot auto-dissolve exception

**Source**: o-prime `pij-primary-carp`, relaying the lifecycle ruling at Spine Seq 76 on 2026-07-12.

> Record the completion-time compact attempt plus `E-DEAD` as expected one-shot lifecycle evidence: C3 applies to reusable/live peers; auto-dissolved `--once` peers have no context left to compact.

**Effect**:

- Completion-first compact remains mandatory for reusable/live coder, reviewer, validator, and colleague peers.
- `pij agent spawn --once` auto-closes when its report lands; an immediate compact attempt may therefore return `E-DEAD`.
- That `E-DEAD` is expected evidence of no remaining context, not a compaction failure.
- Cold compact-order acceptance uses resident/reusable peers; one-shot evidence verifies the exception separately.

## R5 — Completion compact is fire-and-forget

**Source**: Jordan, relayed by o-prime `pij-primary-carp` at Spine Seq 128 on 2026-07-13.

> On reusable peer completion, send compact immediately without `--wait`, then continue report/review/fix work; never block on compact latency. The one-shot `E-DEAD` exception remains.

**Effect**:

- Completion compact remains the first action for reusable/live peers.
- Use `pij send <id> --command compact` without `--wait`.
- Do not wait for `executed:true`, receipt delivery, or compact completion before reading the report or continuing review/fix preparation.
- Receipt and failure signals are observe-only diagnostics, not redispatch gates.
- Structural and cold acceptance must fail if the skill teaches waiting on compact latency.
