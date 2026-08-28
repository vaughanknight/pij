# Handover packet A — items 34, 31b, 19 (docs-only, first PR)

**Ruling (Vaughan, verbatim, 2026-08-28)**: "ensure Jordan's agent has all the outstanding items. Plenty of deep detail on each piece so it can rebuild it commit and push as it can look at our repo for the code also as the spec". v0.2.0 = tag `d120c53`.

**Do**: branch `s391/handover-v0.2.0-a` from `origin/main` (852c593 or newer). For each item, copy `docs/handover/v0.2.0/TEMPLATE.md` to `docs/handover/v0.2.0/<NN>-<slug>.md` and fill EVERY section (delete nothing). NN = the item number (`34-queue-hygiene.md`, `31b-subtree-stall.md`, `19-pointer-park.md`).

**Sources (all on disk in this worktree)**: plan `docs/plans/391-day3-core/391-day3-core-plan.md` (Phase 17 / 18 / 8 blocks + ACs), dossiers `docs/plans/391-day3-core/tasks/phase-17-item-34-queue-hygiene/`, `phase-18-item-31b-subtree-stall/`, `phase-8-item-19-pointer-park/` (tasks.md, packet-addendum.md, review-brief.md), rulings `docs/plans/391-day3-core/rulings.md` (grep the item number), the spine (`pij spine` / `~/.pij/spine`), the live queue (`sqlite3 ~/.pij/queue/pij.sqlite` READ ONLY) and sidecars (`~/.pij/<seat>/watchdog.json` READ ONLY) for item 34's evidence.

**Depth standard**: a competent stranger with this repo and issue #311 rebuilds it, commits and pushes. Every claim carries a pointer: PR number, spine seq, log path, queue row seq, `file:line` AT TAG d120c53 (re-grep every line number against `git show d120c53:<file>` — the dossiers' numbers may be stale). Section 4 names each mutant `MUT-…` with the hunk it patches and the test that reds. Section 3 names the production call site AND the factory/adapter. Section 6 cites the README's E-rules by number with the incident in one line.

**Fence**: `docs/handover/v0.2.0/{34,31b,19}-*.md` only. Do not touch README.md (the o-prime indexes), TEMPLATE.md, or any code. One commit per file (pathspec). Report per schema via `--body-file` with the three paths; no push (I push + PR). C10.
