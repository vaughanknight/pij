#!/usr/bin/env python3
"""List the GitHub Copilot models your account is actually entitled to.

Reads the Copilot bearer token from ~/.pi/agent/auth.json, auto-selects the
correct API host from the token's `proxy-ep` claim (individual vs enterprise),
calls GET /models, and prints the entitled model ids.

Usage:
    just copilot-models            # list every entitled model id
    just copilot-models mai        # filter ids containing "mai" (case-insensitive)
    just copilot-models --json     # raw JSON passthrough
"""

import json
import os
import sys
import urllib.error
import urllib.request

AUTH_PATH = os.path.expanduser("~/.pi/agent/auth.json")
EDITOR_HEADERS = {
    "Copilot-Integration-Id": "vscode-chat",
    "Editor-Version": "vscode/1.107.0",
    "Editor-Plugin-Version": "copilot-chat/0.35.0",
    "User-Agent": "GitHubCopilotChat/0.35.0",
}


def load_token() -> str:
    try:
        auth = json.load(open(AUTH_PATH))
    except FileNotFoundError:
        sys.exit(f"❌ no auth file at {AUTH_PATH} — sign in to Copilot in pi first")
    token = auth.get("github-copilot", {}).get("access")
    if not token:
        sys.exit("❌ no github-copilot.access token in auth.json")
    return token


def host_for(token: str) -> str:
    """Pick the API host from the token's proxy-ep claim.

    Enterprise tokens 421 (Misdirected) against api.individual.githubcopilot.com,
    and vice-versa, so derive the host instead of hardcoding it.
    """
    proxy = ""
    for seg in token.split(";"):
        if seg.startswith("proxy-ep="):
            proxy = seg.split("=", 1)[1]
            break
    if "enterprise" in proxy:
        return "api.enterprise.githubcopilot.com"
    if "individual" in proxy:
        return "api.individual.githubcopilot.com"
    # Generic host works for most tokens as a fallback.
    return "api.githubcopilot.com"


def fetch_models(token: str) -> dict:
    host = host_for(token)
    req = urllib.request.Request(
        f"https://{host}/models",
        headers={"Authorization": f"Bearer {token}", **EDITOR_HEADERS},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()
    except urllib.error.HTTPError as exc:
        sys.exit(f"❌ HTTP {exc.code} from {host}/models: {exc.read().decode()[:200]}")
    return {"host": host, "payload": json.loads(body)}


def main() -> None:
    args = sys.argv[1:]
    as_json = "--json" in args
    filters = [a.lower() for a in args if not a.startswith("--")]

    token = load_token()
    result = fetch_models(token)
    payload = result["payload"]

    if as_json:
        print(json.dumps(payload, indent=2))
        return

    ids = sorted({m.get("id", "?") for m in payload.get("data", [])})
    if filters:
        ids = [i for i in ids if any(f in i.lower() for f in filters)]

    print(f"host: {result['host']}")
    print(f"{len(ids)} model id(s):")
    for i in ids:
        print(f"  {i}")
    if not ids:
        print("  (no matches)")


if __name__ == "__main__":
    main()
