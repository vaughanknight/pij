#!/usr/bin/env bash
# prime-up — resolve THIS folder's pij prime and print the command that brings it back.
#
# Interim workaround for pij task #37: `pij revive --print` builds the transcript path
# from homedir() alone, so a prime hand-started via `cc-alt`
# (CLAUDE_CONFIG_DIR=$HOME/.claude-alt) reports E-NOREG for an artifact that is present.
# This searches BOTH claude roots. Delete this script when #37 ships.
#
#   prime-up            # print the command
#   prime-up --run      # print it, then exec it in THIS pane
set -uo pipefail

folder="$(pwd -P)"

# Read the DESCRIPTORS, not `pij list --json` / `pij node show --json`: neither
# projects `harnessSessionId`, the one field revivability depends on. The registry
# is axis truth; a projection that omits the field cannot answer this question.
read -r id native harness < <(
  python3 - "$folder" "$HOME/.pij" <<'PY'
import glob, json, os, sys
folder, pij_home = os.path.realpath(sys.argv[1]), sys.argv[2]
best = None
for path in glob.glob(f"{pij_home}/*.json") + glob.glob(f"{pij_home}/archive/*.json"):
    try:
        d = json.load(open(path))
    except Exception:
        continue
    if d.get("prime") is not True:
        continue
    if os.path.realpath(d.get("folder", "/nonexistent")) != folder:
        continue
    # Most recently active wins if a folder somehow carries more than one prime.
    if best is None or (d.get("lastEventAt") or "") > (best.get("lastEventAt") or ""):
        best = d
if best is None:
    sys.exit(1)
print(best["id"], best.get("harnessSessionId") or "-", best.get("harness") or "-")
PY
) || { echo "no prime recorded for $folder — try: pij list --prime --json" >&2; exit 1; }

if [ "$harness" != "claude" ]; then
  echo "$id is $harness, not claude — use: pij revive $id --print" >&2
  exit 1
fi

# The whole point: search EVERY claude root, not just the default one.
slug="${folder//\//-}"
transcript=""
for root in "$HOME/.claude" "$HOME/.claude-alt"; do
  cand="$root/projects/$slug/$native.jsonl"
  [ -r "$cand" ] && { transcript="$cand"; config_dir="$root"; break; }
done

if [ -z "$transcript" ]; then
  echo "$id: no transcript for $native under $HOME/.claude or $HOME/.claude-alt" >&2
  echo "(that IS an honest absence — both roots searched)" >&2
  exit 1
fi

# ONLY set CLAUDE_CONFIG_DIR for a NON-default root. Setting it to ~/.claude is NOT
# a no-op: unset, claude reads $HOME/.claude.json (210KB of projects/MCP/history);
# set, it reads <dir>/.claude.json — which does not exist under ~/.claude, so claude
# creates an empty stub and starts with NO PROFILE. Measured: a 431-byte file appeared
# at ~/.claude/.claude.json the first time this script ran. The config root and the
# transcript root are not the same knob, and conflating them silently guts the session.
if [ "$config_dir" = "$HOME/.claude" ]; then
  env_prefix=""
else
  env_prefix="CLAUDE_CONFIG_DIR=\"$config_dir\" "
fi

cmd="pij revive $id --attach \"\$TMUX_PANE\" && ${env_prefix}PIJ_SESSION_ID=$id claude --dangerously-skip-permissions --resume $native"

# -L follows the link. Without it a transcript reached through a #37 workaround
# symlink reports 0B — the size of the link, not the artifact — which reads as
# "empty transcript" on the one tool whose job is to tell you the artifact is there.
size=$(du -hL "$transcript" 2>/dev/null | cut -f1 | tr -d ' ')
via=""
[ -L "$transcript" ] && via=" (via a #37 symlink → $(readlink "$transcript"))"
echo "# $id — transcript ${size:-?} in ${config_dir/#$HOME/~}$via"
# --print just looks. Anything else RUNS IT, here, in this pane. That is the point.
if [ "${1:-}" = "--print" ]; then
  echo "$cmd"
  exit 0
fi

[ -n "${TMUX_PANE:-}" ] || {
  echo "$cmd"
  echo "not in a tmux pane — open one where the prime should live, then run me there." >&2
  exit 1
}

# The one guard worth keeping in a tool this blunt. `pij revive` records the REVIVER
# as the new seat's parent (cli.ts:1638, `parentId: reviverId`), so running this from
# inside another pij seat quietly makes the o-prime that seat's child — and if the
# reviver is a worker, the hierarchy is inverted. Costs one flag to refuse; costs a
# governance tangle to allow.
if [ -n "${PIJ_SESSION_ID:-}" ] && [ "${PIJ_SESSION_ID}" != "$id" ]; then
  echo "REFUSING: this pane is pij seat '$PIJ_SESSION_ID'." >&2
  echo "Reviving from here would parent $id to it. Use a plain shell pane." >&2
  echo "(Meant it? --print, then paste it yourself.)" >&2
  exit 1
fi

echo "--- bringing $id up here (pane $TMUX_PANE) ---"
eval "$cmd"
