#!/bin/zsh
# Live stream dashboard for a pij team window's PM pane.
#
# The team layout (skills/pij/references/00-routing.md § C5) reserves the left
# half for the PM. When the PM is a central orchestrator driving several streams
# it cannot sit in every window, and an empty shell there wastes half the screen.
# This fills the slot with the operator view: who is on the team, what the branch
# has changed, and where CI is — refreshed in place.
#
# Usage: stream-dash.sh <stream-id> [worktree-path]
#   e.g. stream-dash.sh s069 /Users/jordanknight/pi-hacking/pij-worktrees/s069-typing-guard

set -u
STREAM="${1:?usage: stream-dash.sh <stream-id> [worktree]}"
WT="${2:-$PWD}"
INTERVAL="${DASH_INTERVAL:-20}"

while true; do
	clear
	print -P "%B%F{cyan}── ${STREAM} ──%f%b  $(date '+%H:%M:%S')"
	print ""

	print -P "%B%F{yellow}SEATS%f%b"
	# Peers whose cwd is this worktree — the team, whatever it is called today.
	for id in $(python3 -c "
import json,glob,os,sys
wt=sys.argv[1]
for f in sorted(glob.glob(os.path.expanduser('~/.pij/pij-*.json'))):
    try: d=json.load(open(f))
    except Exception: continue
    if d.get('folder')==wt and d.get('lifecycle')!='dissolved':
        print(os.path.basename(f)[:-5])
" "$WT" 2>/dev/null); do
		line=$(pij state "$id" 2>/dev/null | head -1 | sed 's/.*: //')
		print "  ${id}  ${line:-(no state)}"
	done
	print ""

	print -P "%B%F{yellow}BRANCH%f%b"
	git -C "$WT" --no-pager diff --stat main 2>/dev/null | tail -6 | sed 's/^/  /'
	print ""

	print -P "%B%F{yellow}PR / CI%f%b"
	br=$(git -C "$WT" branch --show-current 2>/dev/null)
	pr=$(gh pr list --head "$br" --json number,state --jq '.[] | "#\(.number) \(.state)"' 2>/dev/null | head -1)
	if [[ -n "$pr" ]]; then
		print "  ${pr}"
		gh pr checks "${pr%% *}" 2>/dev/null | head -3 | sed 's/^/  /'
	else
		print "  (no PR yet — branch ${br})"
	fi

	sleep "$INTERVAL"
done
