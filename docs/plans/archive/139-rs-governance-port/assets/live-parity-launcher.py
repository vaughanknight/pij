#!/usr/bin/env python3
"""Owned live parity fixture: no inherited identity, credentials, or global config."""
import json
import os
from pathlib import Path
import sys

root = Path(__file__).resolve().parent
config = json.loads((root / "runtime.json").read_text())
environment = {
    "PATH": str(root / "bin") + ":" + config["path"],
    "HOME": str(root / "home"),
    "CLAUDE_CONFIG_DIR": str(root / "home/.claude"),
    "XDG_CONFIG_HOME": str(root / "home/.config"),
    "XDG_DATA_HOME": str(root / "home/.local/share"),
    "XDG_CACHE_HOME": str(root / "home/.cache"),
    "PI_CONFIG_DIR": str(root / "home/.omp"),
    "PI_CODING_AGENT_DIR": str(root / "home/.omp/agent"),
    "PIJ_HOME": str(root / "home/.pij"),
    "PIJ_RS_STATE_DIR": str(root / "state"),
    "PIJ_RS_ADDR": config["address"],
    "PIJ_RS_BIND": config["address"],
    "PIJ_DAEMON_GENERATION": "rs",
    "TMUX_TMPDIR": "/tmp", "SHELL": "/bin/sh", "TERM": "xterm-256color",
    "LC_ALL": "C", "NODE_NO_WARNINGS": "1",
    "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": "/dev/null",
}
for key in ("TMUX", "TMUX_PANE", "PIJ_SESSION_ID"):
    if config.get(key):
        environment[key] = config[key]
mode = sys.argv[1]
if mode == "tmux-server":
    executable = config["tmux_binary"]
    arguments = [executable, "-L", config["socket_label"], "-f", "/dev/null", "-D"]
elif mode == "tmux":
    executable = config["tmux_binary"]
    arguments = [executable, "-L", config["socket_label"], *sys.argv[2:]]
elif mode == "daemon":
    if not config.get("TMUX"):
        raise SystemExit("private tmux has not been observed")
    executable = str(root / "bin/pij-rs")
    arguments = [executable, "--state-dir", str(root / "state"), "daemon", "--bind", config["address"]]
elif mode == "native":
    executable = str(root / "bin/pij-rs")
    arguments = [executable, "--json", "--state-dir", str(root / "state"), "--addr", config["address"], *sys.argv[2:]]
elif mode == "shim":
    executable = config["node_binary"]
    arguments = [executable, "--import", config["tsx_loader"], config["shim_source"], *sys.argv[2:], "--json"]
else:
    raise SystemExit("unknown private fixture mode")
os.chdir(root / "work")
os.execve(executable, arguments, environment)
