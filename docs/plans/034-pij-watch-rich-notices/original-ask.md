# Original ask — pij-watch-rich-notices
**Captured**: 2026-07-09  ·  **By**: /the-flow

> conceivably in a git repo, file watch could tell it which lines were changed,
> and even what the diff was yeah? could have options on it - just the
> notifiaction (+ if it was creted, modified, delted, and the lines that were
> changed) and an advanced diff mode that pops a diff in...
>
> [and earlier] does file watch respect gitignore? … if in a git repo,
> conceivable [it should].
>
> [thesis args] on what our new updtes will have. changed line number ranges,
> diff option.
>
> [flow args] prepare a new flow for this work please. run explore, consider
> workshops.

## Established this session (design steer, not yet planned)
- Enriches the plan-033 `pij watch` peer-notice path; 033 already distinguishes
  created/modified/deleted, so the NEW parts are: changed-line ranges, diff
  content, per-subscription modes, and `.gitignore` honoring.
- **Diff approach decided in discussion**: use a **self-snapshot baseline**
  (diff new content vs the content we last *notified* about), NOT `git diff` vs
  HEAD — the latter is cumulative and re-dumps the whole diff each notice, which
  is exactly what we want to avoid. Self-snapshot is naturally incremental.
- **Large diffs honor pointer-delivery**: over a size threshold, persist the diff
  to disk and deliver a short path pointer, not the inline body (token frugality).
- The watcher today snapshots existence+mtime only (no content) — line/diff
  data needs a content snapshot it doesn't yet keep (memory cap + binary skip).

Full seed brief (ground truth, key files, 8 design questions):
`scratchpad/PLAN-ASK-rich-watch-notices.md` (session scratch).
