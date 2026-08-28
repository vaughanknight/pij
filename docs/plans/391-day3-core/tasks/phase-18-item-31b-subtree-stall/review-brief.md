# Review brief — Phase 18 / item 31b (subtree-aware legacy stall sensor)
**Reviewer**: cold cross-model (claude-opus-5 via copilot) · **Repo**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` (READ-ONLY; restore mutations byte-identical; never touch the live daemon) · **Frozen SHA**: `<filled at dispatch>`.
**Plan**: § Phase 18 (AC-35) · **Dossier**: `tasks.md` · **Coder log**: `execution.log.md`.
**Verdict law**: any open major/high → FIX_REQUIRED. Write `review-01.md` here; reply verdict + pointer only (C10).
**Dim-0 required**: (1) drop the clause → working-child case RED; (2) drop the child freshness guard → stale-child case RED; (3) make the helper read `listTerminal()` → an archive-read sensor RED (or prove by grep there is none); (4) revert item 31's AC-29 threshold → its tests still RED (this change must not de-sensor it).
**Look hard at**: one level only, documented; `spawnedBy` fallback matches item 16's candidate order; the log line is one per suppression episode, not per tick (task #34 class); no extra registry read per tick; docs.
