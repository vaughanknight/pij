#!/usr/bin/env bash
# worktree-push-audit — what is stranded, across EVERY worktree, not just this one.
#
# The defect this exists for: reporting push state from the checkout you happen to
# be standing in reads a PLACE where the honest question is a STATE AT A PLACE —
# each worktree's branch against its own upstream. It is correct in the
# single-worktree case and wrong in the one we actually run, which is why it stays
# silent. Found four times in four subsystems on 2026-07-28; twice by people who
# had just written the rule down.
#
# NO UPSTREAM is treated as a DISTINCT case, never folded into "clean". A branch
# with no upstream compares against nothing and every naive check reports zero —
# which is exactly how six s073 commits stayed invisible for a whole session.
# It then resolves against origin/<branch> to separate two very different states:
#   PUSHED, UNTRACKED  — the commits exist on the remote; only the tracking config is missing
#   LOCAL ONLY         — the commits exist on this disk and nowhere else
set -uo pipefail

repo="${1:-$(git rev-parse --show-toplevel 2>/dev/null)}"
[ -n "$repo" ] || { echo "not in a git repo (pass a path)" >&2; exit 1; }

git -C "$repo" fetch --quiet origin 2>/dev/null || true   # best-effort; stale remote refs still beat none
found=0

while read -r wt; do
  [ -n "$wt" ] || continue
  branch=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null) || continue
  [ "$branch" = "HEAD" ] && continue                       # detached: nothing to strand a branch on

  if upstream=$(git -C "$wt" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null); then
    ahead=$(git -C "$wt" rev-list --count "$upstream..$branch" 2>/dev/null || echo 0)
    [ "${ahead:-0}" -gt 0 ] && { printf 'UNPUSHED           %-36s %3s ahead of %s\n' "$branch" "$ahead" "$upstream"; found=1; }
    continue
  fi

  # No upstream. Never report this as clean — decide which of the two it is.
  if git -C "$wt" rev-parse --verify --quiet "origin/$branch" >/dev/null 2>&1; then
    ahead=$(git -C "$wt" rev-list --count "origin/$branch..$branch" 2>/dev/null || echo 0)
    if [ "${ahead:-0}" -gt 0 ]; then
      printf 'LOCAL ONLY         %-36s %3s beyond origin/%s (untracked)\n' "$branch" "$ahead" "$branch"; found=1
    else
      printf 'PUSHED, UNTRACKED  %-36s     on origin, no tracking config\n' "$branch"; found=1
    fi
  else
    base=$(git -C "$wt" rev-parse --verify --quiet origin/main >/dev/null 2>&1 && echo origin/main || echo main)
    ahead=$(git -C "$wt" rev-list --count "$base..$branch" 2>/dev/null || echo 0)
    if [ "${ahead:-0}" -gt 0 ]; then
      printf 'LOCAL ONLY         %-36s %3s commits, NO REMOTE BRANCH AT ALL\n' "$branch" "$ahead"; found=1
    fi
  fi
done < <(git -C "$repo" worktree list --porcelain | sed -n 's/^worktree //p')

[ "$found" = 0 ] && echo "nothing stranded — every worktree branch is on its remote"
exit 0
