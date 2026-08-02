#!/usr/bin/env python3
"""Scan every live tmux pane for Claude Code sessions where JORDAN talked about a topic.

    tmux-claude-topic-scan.py [pattern] [--deep] [--context N] [--json]

Default pattern is 'tmux' (case-insensitive regex).

Join path, exact rather than guessed:
    tmux pane  --(pane_pid)-->  pij seat  --(harnessSessionId)-->  ~/.claude*/projects/<slug>/<sid>.jsonl

`pij list --json` stores the PANE's shell pid, which is exactly tmux's #{pane_pid},
so the pane->seat join is an identity, not a heuristic. Panes with no pij seat fall
back to the project-dir slug and are reported SEPARATELY, never silently merged.

Only turns Jordan actually typed are counted: isMeta/isSidechain turns, tool results,
local-command echo, and `[pij from ...]` peer relay traffic are all excluded. Use
--all-turns to count everything a session saw instead.

Every section prints its denominator. An empty result always says what was searched.
"""
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

ROOTS = [os.path.expanduser("~/.claude"), os.path.expanduser("~/.claude-alt")]
CLAUDE_RE = re.compile(r"(^|/)claude(\s|$)")
# wrappers that are machinery, not Jordan typing
STRIP_RE = re.compile(
    r"<(system-reminder|local-command-stdout|local-command-caveat|command-message|command-name)>.*?</\1>",
    re.S,
)
RELAY_RE = re.compile(r"^\s*\[pij (from|watchdog)\b")


def sh(cmd):
    """Run a command; return stdout, or None if it failed. Never silently empty."""
    try:
        p = subprocess.run(cmd, capture_output=True, text=True)
    except FileNotFoundError:
        return None
    return p.stdout if p.returncode == 0 else None


# ---------------------------------------------------------------- tmux panes
def panes():
    """One row per PHYSICAL pane. A window linked into grouped sessions is listed by
    `list-panes -a` once per session; #{pane_id} is the identity, so dedupe on it and
    keep every name it answers to."""
    fmt = ("#{pane_id}\t#{pane_pid}\t#{session_name}:#{window_index}.#{pane_index}"
           "\t#{pane_current_path}")
    out = sh(["tmux", "list-panes", "-a", "-F", fmt])
    if out is None:
        sys.exit("FATAL: tmux not running or `list-panes` failed — nothing was scanned.")
    rows, seen = [], {}
    for line in out.splitlines():
        pane_id, pid, target, path = line.split("\t", 3)
        if pane_id in seen:
            seen[pane_id]["targets"].append(target)
            continue
        seen[pane_id] = {"id": pane_id, "pid": int(pid), "targets": [target], "path": path}
        rows.append(seen[pane_id])
    return rows


# ------------------------------------------------------- claude process tree
def claude_pids_by_pane(pane_pids):
    """Return {pane_pid: [(pid, cmd), ...]} for claude processes under each pane."""
    out = sh(["ps", "-axo", "pid=,ppid=,command="])
    if out is None:
        sys.exit("FATAL: `ps` failed — process tree unknown, so no pane could be classified.")
    kids, cmds = defaultdict(list), {}
    for line in out.splitlines():
        parts = line.split(None, 2)
        if len(parts) < 3:
            continue
        pid, ppid, cmd = int(parts[0]), int(parts[1]), parts[2]
        kids[ppid].append(pid)
        cmds[pid] = cmd
    found = {}
    for root in pane_pids:
        stack, hits = list(kids.get(root, [])), []
        while stack:
            pid = stack.pop()
            if CLAUDE_RE.search(cmds.get(pid, "")):
                hits.append((pid, cmds[pid]))
            stack.extend(kids.get(pid, []))
        if hits:
            found[root] = hits
    return found


# --------------------------------------------------------------- pij mapping
def pij_map():
    """{pane_pid: (seat_id, session_id|None)} — empty dict if pij is unavailable."""
    seats = sh(["pij", "list", "--json"])
    sess = sh(["pij", "sessions", "--json"])
    if seats is None:
        return {}, "pij list unavailable — every pane falls back to directory matching"
    sid_by_seat = {}
    if sess is not None:
        for s in json.loads(sess):
            if s.get("harness") == "claude" and s.get("harnessSessionId"):
                sid_by_seat[s["pijId"]] = s["harnessSessionId"]
    out = {}
    for s in json.loads(seats):
        if s.get("pid"):
            out[s["pid"]] = (s["id"], sid_by_seat.get(s["id"]))
    note = None if sess is not None else "pij sessions unavailable — no exact transcript ids"
    return out, note


# -------------------------------------------------------------- transcripts
def slug(path):
    return path.replace("/", "-")


def index_transcripts():
    """{session_id: path} and {slug: [paths]} across every claude config root."""
    by_sid, by_slug = {}, defaultdict(list)
    for root in ROOTS:
        pdir = os.path.join(root, "projects")
        if not os.path.isdir(pdir):
            continue
        for proj in os.scandir(pdir):
            if not proj.is_dir():
                continue
            for f in os.scandir(proj.path):
                if f.name.endswith(".jsonl"):
                    by_sid[f.name[:-6]] = f.path
                    by_slug[proj.name].append(f.path)
    return by_sid, by_slug


def human_text(rec):
    """Text Jordan typed in this record, or '' if the turn isn't his."""
    if rec.get("type") != "user" or rec.get("isMeta") or rec.get("isSidechain"):
        return ""
    # /compact summaries arrive as user turns but are CLAUDE-authored — counting them
    # reports Claude's own prose back as "Jordan talked about this".
    if rec.get("isCompactSummary") or rec.get("isVisibleInTranscriptOnly"):
        return ""
    if rec.get("userType") not in (None, "external"):
        return ""
    content = rec.get("message", {}).get("content")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        text = " ".join(
            b.get("text", "") for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    else:
        return ""
    text = STRIP_RE.sub(" ", text)
    return "" if RELAY_RE.search(text) else text


def scan(path, rx, all_turns, limit):
    """Return (n_matching_turns, n_turns_examined, [excerpts])."""
    hits, examined, excerpts = 0, 0, []
    # Cheap substring prefilter, but ONLY when the pattern is a single literal word.
    # Deriving a needle from an alternation (foo|bar) would silently drop every `bar`
    # match — a false clean, which is worse than a slow scan.
    lit = re.fullmatch(r"(?:\\b)?([A-Za-z0-9_-]+)(?:\\b)?", rx.pattern)
    needle = lit.group(1).lower() if lit else None
    try:
        fh = open(path, errors="replace")
    except OSError as e:
        return -1, 0, [f"UNREADABLE: {e}"]
    with fh:
        for line in fh:
            if needle and needle not in line.lower():
                continue  # cheap prefilter; json parse only on candidate lines
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            text = line if all_turns else human_text(rec)
            if not text:
                continue
            examined += 1
            if not rx.search(text):
                continue
            hits += 1
            if len(excerpts) < limit:
                flat = " ".join(text.split())
                m = rx.search(flat)
                a, b = max(0, m.start() - 60), min(len(flat), m.end() + 90)
                excerpts.append(f"{rec.get('timestamp','?')[:16]}  …{flat[a:b]}…")
    return hits, examined, excerpts


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    deep = "--deep" in sys.argv
    all_turns = "--all-turns" in sys.argv
    as_json = "--json" in sys.argv
    limit = 3
    for a in sys.argv[1:]:
        if a.startswith("--context="):
            limit = int(a.split("=")[1])
    rx = re.compile(args[0] if args else r"\btmux\b", re.I)

    all_panes = panes()
    claude = claude_pids_by_pane([p["pid"] for p in all_panes])
    seat_by_pid, pij_note = pij_map()
    by_sid, by_slug = index_transcripts()

    results, unmapped, no_transcript = [], 0, 0
    for p in all_panes:
        if p["pid"] not in claude:
            continue
        seat, sid = seat_by_pid.get(p["pid"], (None, None))
        files, how = [], None
        if sid and sid in by_sid:
            files, how = [by_sid[sid]], "exact (pane→seat→session)"
        if deep or not files:
            sib = by_slug.get(slug(p["path"]), [])
            if sib:
                files = sorted(set(files) | set(sib), key=os.path.getmtime, reverse=True)
                how = how + " + dir" if how else "directory match (no seat/session id)"
        if not files:
            no_transcript += 1
            continue
        if not sid:
            unmapped += 1
        total, examined, ex = 0, 0, []
        for f in files:
            h, e, x = scan(f, rx, all_turns, max(0, limit - len(ex)))
            if h > 0:
                total += h
            examined += e
            ex.extend(x)
        if total > 0:
            results.append({
                "pane": " = ".join(p["targets"]), "pane_id": p["id"],
                "seat": seat, "cwd": p["path"], "exact": bool(sid),
                "hits": total, "turns_examined": examined,
                "files": len(files), "how": how, "excerpts": ex,
            })

    if as_json:
        print(json.dumps({
            "pattern": rx.pattern, "panes": len(all_panes),
            "claude_panes": len(claude), "results": results,
        }, indent=2))
        return

    print(f"pattern /{rx.pattern}/  ·  {'ALL turns' if all_turns else 'turns Jordan typed'}"
          f"  ·  {'deep (all transcripts per dir)' if deep else 'live session transcript only'}")
    print(f"scanned {len(all_panes)} tmux panes → {len(claude)} running Claude Code"
          f" → {len(results)} mention it")
    if pij_note:
        print(f"  ! {pij_note}")
    if unmapped:
        print(f"  ! {unmapped} pane(s) had no pij session id — matched by directory, may be another pane's transcript")
    if no_transcript:
        print(f"  ! {no_transcript} claude pane(s) had NO transcript found — not searched, not clean")
    if not results:
        print("\nNo matches. That is a real negative over the population above, not an empty run.")
        return
    print()
    for r in sorted(results, key=lambda r: (r["exact"], r["hits"]), reverse=True):
        scope = "this pane" if r["exact"] else "THIS DIRECTORY, not just this pane"
        print(f"── {r['pane']}  {r['pane_id']}   {r['seat'] or '(no pij seat)'}"
              f"   {r['hits']} turn(s) in {scope}")
        print(f"   {r['cwd']}")
        print(f"   {r['how']} · {r['files']} transcript(s) · {r['turns_examined']} candidate turns read")
        for e in r["excerpts"]:
            print(f"     {e}")
        print()


if __name__ == "__main__":
    main()
