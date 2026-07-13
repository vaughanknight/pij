**Thesis** — A peer's completion should trigger compaction immediately, so C3 reliability no longer depends on orchestrator memory and compaction latency overlaps the orchestrator's next work.

**Now** — pij already provides reliable remote compaction and the skill already says to compact at coder/reviewer completion, but that instruction is not mechanically tied to handling the completion report.

**Toward** — The completion contract should send compact immediately as fire-and-forget, then continue report/review/fix work without waiting on compact latency or receipt delivery.

**Keep** — Preserve completion ordering, C3 ownership, pointer delivery, compatibility, and the invariant that an actively responding peer is never compacted, while explicitly replacing C3's receipt gate with fire-and-forget continuation.

> **My read:** Right should feel like compaction goes on the stove the moment a peer finishes and the orchestrator immediately keeps cooking. The compact command is dispatched, not awaited.
