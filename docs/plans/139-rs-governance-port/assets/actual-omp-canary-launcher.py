#!/usr/bin/env python3
"""Owned fixture launcher. Credentials stay in child memory, never argv or files."""
import json
import os
from pathlib import Path
import sqlite3
import sys

root = Path(__file__).resolve().parent
config = json.loads((root / "runtime.json").read_text())
mode = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ("daemon", "client") else "omp"
if not config.get("tmux") or not config.get("parent_pane"):
    raise SystemExit("private tmux identity has not been observed")
home = root / "home"
environment = {
    "PATH": config["path"],
    "HOME": str(home),
    "CLAUDE_CONFIG_DIR": str(home / ".claude"),
    "XDG_CONFIG_HOME": str(home / ".config"),
    "XDG_DATA_HOME": str(home / ".local/share"),
    "XDG_CACHE_HOME": str(home / ".cache"),
    "PI_CONFIG_DIR": str(home / ".omp"),
    "PI_CODING_AGENT_DIR": str(home / ".omp/agent"),
    "PIJ_HOME": str(home / ".pij"),
    "PIJ_RS_STATE_DIR": str(root / "state"),
    "PIJ_RS_ADDR": config["address"],
    "PIJ_RS_BIND": config["address"],
    "PIJ_DAEMON_GENERATION": "rs",
    "TMUX": config["tmux"],
    "TMUX_PANE": config["parent_pane"],
    "TMUX_TMPDIR": "/tmp",
    "SHELL": "/bin/sh",
    "TERM": "xterm-256color",
    "LC_ALL": "C",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
}
if mode == "omp":
    actual_tmux = os.environ.get("TMUX", "")
    actual_pane = os.environ.get("TMUX_PANE", "")
    if actual_tmux.split(",", 1)[0] != config["socket"] or not actual_pane.startswith("%"):
        raise SystemExit("refusing OMP launch outside the owned private tmux socket")
    environment["TMUX"] = actual_tmux
    environment["TMUX_PANE"] = actual_pane
    for name in ("PIJ_SESSION_ID", "PIJ_PARENT_ID", "PIJ_SPAWN_ID"):
        if os.environ.get(name):
            environment[name] = os.environ[name]
    if config.get("parent_seat"):
        environment["PIJ_PARENT_ID"] = config["parent_seat"]

if mode == "client":
    os.chdir(root / "work")
    executable = config["pij_binary"]
    arguments = [executable, "--json", "--state-dir", str(root / "state"),
                 "--addr", config["address"], *sys.argv[2:]]
    os.execve(executable, arguments, environment)

# Read only the existing active Copilot credential. Do not call a token exporter
# that may update the global credential store, and never print this row/value.
with sqlite3.connect(Path(config["auth_db"]).as_uri() + "?mode=ro", uri=True) as database:
    row = database.execute(
        "SELECT data FROM auth_credentials WHERE provider = ? "
        "AND credential_type = 'oauth' AND disabled_cause IS NULL ORDER BY id LIMIT 1",
        ("github-copilot",),
    ).fetchone()
if row is None:
    raise SystemExit("no active Copilot credential available for private fixture")
credential = json.loads(row[0])
access = credential.get("access")
if not isinstance(access, str) or not access:
    raise SystemExit("active Copilot credential has no usable access token")
api_key = {"token": access}
for name in ("enterpriseUrl", "apiEndpoint"):
    if isinstance(credential.get(name), str) and credential[name]:
        api_key[name] = credential[name]
environment["COPILOT_GITHUB_TOKEN"] = json.dumps(api_key, separators=(",", ":"))

os.chdir(root / "work")
if mode == "daemon":
    executable = config["pij_binary"]
    arguments = [executable, "--state-dir", str(root / "state"), "daemon", "--bind", config["address"]]
else:
    executable = config["omp_binary"]
    prefix = f'{config["pij_binary"]} --json --state-dir {root / "state"} --addr {config["address"]}'
    prompt = (
        "You are an owned, isolated pij governance canary. Your only task is one genuine nonce acknowledgement. "
        "The explicit pij extension registers your actual OMP session at boot; do not adopt or fabricate identity. "
        "Reply READY briefly and remain available for the next injected pij message. Never set semantic HOLD. "
        "When a pij message tells you to read a nonce packet, read that exact private file, compute SHA256 of its exact bytes, "
        "then use the bash tool to execute the supplied ack arguments with this absolute private CLI prefix: " + prefix + ". "
        "Do not run bare pij/pij-rs or any daemon/lifecycle command. Never access port7461, global state, credentials, "
        "other projects, network tools, or unrequested files. All writes/tools stay in " + str(root) + ". "
        "After successful ack, print CANARY_ACKED plus the actual dispatch id and stop using tools. "
        "Do not invent a nonce, digest, receipt, session id, model or completion."
    )
    arguments = [executable, *sys.argv[1:], "--no-extensions", "--extension", config["extension"],
                 "--no-skills", "--no-rules", "--no-lsp", "--no-title", "--no-pty",
                 "--tools", "bash,read", "--session-dir", str(root / "sessions"),
                 "--cwd", str(root / "work"), "--max-time", "15m", "--auto-approve", prompt]
os.execve(executable, arguments, environment)
