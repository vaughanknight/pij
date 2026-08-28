# Cold-read packet C — handover sections 33, 35, E3, E5, 99 (branch s391/handover-v0.2.0-c @ 68b6fc8)

**The one question** (Vaughan's standard): could a competent stranger with this repository and AI-Substrate/pij#311 rebuild the item from this section alone, commit and push — without asking anyone? For each section answer YES / NO with the specific gap.

**Checks per section** (write findings as F-<section>-<n>, severity major = a rebuilder would build the wrong thing or be blocked; low = imprecision):
1. Every pointer resolves: file paths on `origin/main` OR on branch `s391/plan-folder-v0.2.0` (PR #36, merging first); `file:line` refs against `git show d120c53:<file>` (line drift = finding); PR numbers/spine seqs/queue seqs exist (`gh pr view N`, `pij spine --since`, `sqlite3 ~/.pij/queue/pij.sqlite` READ ONLY).
2. Section 3 names the production call site AND the adapter/factory; section 4's mutants name the hunk and the test that reds; section 6 cites README E-rules that exist in `docs/handover/v0.2.0/README.md`.
3. Nothing depends on this machine (no scratchpad/temp paths, no "on the coder's machine" unless the artifact is also on the branch).
4. Claims vs code: spot-check three factual claims per section against `d120c53` (e.g. E5's field lists, E3's `failCanary` exit code, 35's API facts via `gh api`, 33's drift lines, 99's file/line for each row).
5. The o-prime's frame docs `00-live-system.md` / `01-shipped-map.md` on main: no contradiction with these sections.

**Verdict**: `docs/plans/391-day3-core/handover/review-C-verdict.md` in the s391 worktree (you may write ONLY that file there) — per section YES/NO + findings; reply verdict + pointer only (C10). Read-only otherwise; never touch the live daemon or `~/.pij`.
