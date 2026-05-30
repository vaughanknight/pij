# pij — agent-facing harness recipes.
#
# `just` is the canonical interface for agents. `npm run …` exists for
# direct script invocation and IDE integration, but the composite gates
# (self-check, vet, snapshots) live here so there is exactly one place
# to encode them. If you find yourself running multi-step npm chains by
# hand, the chain belongs in this file.
#
# See AGENTS.md § Self-improvement loop — encode, don't document.

# Default recipe: list available recipes.
default:
    @just --list

# --- bootstrap ---
#
# `just install` is THE single command to set up pij on a fresh machine
# after `git clone`. Idempotent — safe to re-run any time pi's state
# drifts (after pi self-update, after switching machines, etc.).
#
# What it does:
#   1. Install repo dependencies (`npm ci`)
#   2. Verify the global `pi` binary is present (fail loudly if not)
#   3. Sync user-personal prefs to the pi global agent dir:
#        .pi/APPEND_SYSTEM.md  → ~/.pi/agent/APPEND_SYSTEM.md
#        .pi/mcp.json          → ~/.pi/agent/mcp.json
#   4. Symlink pij's local extensions into ~/.pi/agent/extensions/
#   5. Install every vetted package from .pi/packages.yaml globally
#      via `pi install` (uses cmdBootstrap; refuses stale entries)
#   6. Run pi-doctor as a final verification
#
# After install, `pi` from ANY cwd on this machine gets the same
# extensions, MCP servers, voice-input prefs, response-mode prefs,
# and global packages that pij configures.

install:
    @echo "=== 1/6 npm dependencies ==="
    npm ci
    @echo
    @echo "=== 2/6 verify pi binary ==="
    @command -v pi >/dev/null 2>&1 || { echo "❌ pi not found. Install: npm install -g @earendil-works/pi-coding-agent"; exit 1; }
    @pi --version | head -1
    @mkdir -p ~/.pi/agent
    @echo
    @echo "=== 3/6 sync global pi prefs ==="
    cp .pi/APPEND_SYSTEM.md ~/.pi/agent/APPEND_SYSTEM.md
    @echo "  → ~/.pi/agent/APPEND_SYSTEM.md"
    cp .pi/mcp.json ~/.pi/agent/mcp.json
    @echo "  → ~/.pi/agent/mcp.json"
    @echo
    @echo "=== 4/6 link pij extensions globally ==="
    just link
    @echo
    @echo "=== 5/6 install vetted packages globally ==="
    just pkg bootstrap
    @echo
    @echo "=== 6/6 pi-doctor ==="
    just pi-doctor
    @echo
    @echo "✓ install complete. pi is set up on this machine."

# --- atomic checks (thin wrappers over npm scripts) ---

typecheck:
    npm run typecheck

lint:
    npm run lint

# Auto-fix formatting + import order via Biome.
format:
    npm run format

test:
    npm run test

# tmux-driven end-to-end smoke (Driver SDK).
smoke:
    npm run smoke

# Manage third-party pi-extensions via .pi/packages.yaml.
pkg *ARGS:
    npm run pkg -- {{ARGS}}

# --- composite gates ---

# Pre-merge / pre-release gate. Agents MUST run this before reporting a
# task complete — never run npm directly to compose these steps.
self-check:
    just typecheck
    just lint
    just test
    just smoke
    PIJ_VET_SKIP_AGENT=1 just pkg audit
    just snapshots-check

# Refresh package-vetter __snapshots__/ via live minih agent runs.
# Opt-in: gated on PIJ_VET_SKIP_AGENT != "1". Not part of self-check.
snapshots-refresh:
    npm run snapshots:refresh

# Soft alarm — warns when briefing.md SHA drifts from snapshot _meta.json.
# Exits 0 always; informational. Wired into self-check.
snapshots-check:
    npm run snapshots:check

# Opt-in live regression for the package-vetter adapter.
# Requires a real Copilot session + spends API tokens.
vet-live:
    PIJ_VET_LIVE=1 npx vitest run agent.live

# --- ergonomics ---

# Scaffold a new T2 extension. Never hand-roll the boilerplate.
new NAME:
    npm run new -- {{NAME}}

# Symlink .pi/extensions/* into ~/.pi/agent/extensions/ for autoload.
link:
    npm run link

unlink:
    npm run link -- --remove

# --- pi fork source control ---

# Sync the local ../pi-fork checkout from official upstream, then push the
# fast-forwarded main branch to the jakkaj fork. Refuses divergent history.
pi-fork-sync-upstream:
    @set -eu; \
      repo="../pi-fork"; \
      test -d "$repo/.git" || { echo "❌ $repo is not a git checkout"; exit 1; }; \
      git -C "$repo" remote get-url origin | grep -q 'jakkaj/pi-mono' || { echo "❌ origin is not jakkaj/pi-mono"; exit 1; }; \
      git -C "$repo" remote get-url upstream >/dev/null 2>&1 || git -C "$repo" remote add upstream git@github.com:earendil-works/pi.git; \
      git -C "$repo" remote set-url upstream git@github.com:earendil-works/pi.git; \
      echo "=== fetch fork + upstream ==="; \
      git -C "$repo" fetch origin; \
      git -C "$repo" fetch upstream; \
      echo "=== fast-forward local main to upstream/main ==="; \
      git -C "$repo" checkout main; \
      git -C "$repo" merge --ff-only upstream/main; \
      echo "=== push fork origin/main ==="; \
      git -C "$repo" push origin main

# Link the current built ../pi-fork CLI as global `pi` and record the
# exact commit in .pi/pi-fork-build.txt (gitignored). No network, no git pull.
pi-fork-link:
    @set -eu; \
      repo="../pi-fork"; \
      log_file=".pi/pi-fork-build.txt"; \
      test -d "$repo/.git" || { echo "❌ $repo is not a git checkout"; exit 1; }; \
      commit="$(git -C "$repo" rev-parse HEAD)"; \
      short="$(git -C "$repo" rev-parse --short HEAD)"; \
      repo_abs="$(cd "$repo" && pwd)"; \
      cli="$repo_abs/packages/coding-agent/dist/cli.js"; \
      test -x "$cli" || { echo "❌ built cli missing or not executable: $cli"; echo "Run: just pi-fork-build"; exit 1; }; \
      global_bin="$(npm prefix -g)/bin"; \
      mkdir -p "$global_bin"; \
      ln -sfn "$cli" "$global_bin/pi"; \
      mkdir -p .pi; \
      { \
        echo "commit=$commit"; \
        echo "built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"; \
        echo "repo=$repo_abs"; \
        echo "cli=$cli"; \
        echo "global_pi=$global_bin/pi"; \
      } > "$log_file"; \
      echo "✓ linked pi fork $short"; \
      echo "  linked: $global_bin/pi -> $cli"; \
      echo "  logged: $log_file"

# Build the current ../pi-fork checkout and link it globally. Deliberately
# does not pull/fetch; use `just pi-fork-sync-upstream` explicitly for that.
pi-fork-build:
    @set -eu; \
      repo="../pi-fork"; \
      test -d "$repo/.git" || { echo "❌ $repo is not a git checkout"; exit 1; }; \
      short="$(git -C "$repo" rev-parse --short HEAD)"; \
      repo_abs="$(cd "$repo" && pwd)"; \
      echo "=== install pi fork dependencies ==="; \
      cd "$repo_abs" && npm install --ignore-scripts; \
      echo; \
      echo "=== build pi fork $short ==="; \
      npm run build; \
      cd - >/dev/null; \
      just pi-fork-link

# --- pi binary control ---
#
# `just update-pi` is the canonical way to refresh pi runtime state from
# this repo. It does not fetch, pull, build, or otherwise touch git history.
# Source sync/build are explicit: `just pi-fork-sync-upstream` and
# `just pi-fork-build`.

# Re-link the already-built ../pi-fork CLI as global `pi`, update installed
# pi packages, then re-link pij extensions and run pi-doctor. No git pull.
update-pi:
    @echo "=== current pi ===" && pi --version | head -1 || true
    just pi-fork-link
    @echo
    @echo "=== linked pi ===" && pi --version | head -1
    @echo
    @echo "=== updating pi packages ==="
    pi update
    @echo
    just link
    just pi-doctor

# Full end-to-end refresh from OUR fork, upstream included. This is the
# "do it all" recipe: pull upstream into ../pi-fork, build it, link the
# built CLI as global `pi`, update pi packages, re-link pij extensions,
# and audit. Use this when you want to be fully current on the fork.
#
# Order matters:
#   1. pi-fork-sync-upstream — ff-merge upstream/main into fork main + push
#      (the ONLY git-touching step; refuses divergent history)
#   2. pi-fork-build         — npm install + npm run build + link the CLI
#   3. update-pi             — re-link CLI, `pi update` packages, link pij
#                              extensions, pi-doctor
update-pi-full:
    @echo "######## 1/3 sync fork from upstream ########"
    just pi-fork-sync-upstream
    @echo
    @echo "######## 2/3 build + link fork ########"
    just pi-fork-build
    @echo
    @echo "######## 3/3 update packages + extensions + audit ########"
    just update-pi
    @echo
    @echo "✓ update-pi-full complete — running our fork, fully current."

# Audit pi's globally-visible state. Read-only.
# Prints: binary version, extension symlinks, manifest packages,
# MCP servers, and flags anything that looks wrong.
pi-doctor:
    @echo "=== pi binary ===" && which pi && pi --version | head -1
    @echo
    @echo "=== ~/.pi/agent/extensions/ (pij symlinks should be here) ==="
    @ls -la ~/.pi/agent/extensions/ 2>/dev/null || echo "  (missing — run: just link)"
    @echo
    @echo "=== ~/.pi/agent/settings.json packages[] ==="
    @python3 -c 'import json; s=json.load(open("/Users/jordanknight/.pi/agent/settings.json")); [print(f"  - {p}") for p in s.get("packages", [])]'
    @echo
    @echo "=== ~/.pi/agent/mcp.json servers ==="
    @if [ -f ~/.pi/agent/mcp.json ]; then \
      python3 -c "import json,sys; s=json.load(open(sys.argv[1])); m=s.get('mcpServers',{}); [print(f'  - {k}: {v.get(\"command\",\"\")} {\" \".join(v.get(\"args\",[]))}'.rstrip()) for k,v in m.items()]; (not m) and print('  (no mcpServers defined)')" ~/.pi/agent/mcp.json; \
    else echo "  (no ~/.pi/agent/mcp.json)"; fi
