# pij — agent-facing harness recipes.
#
# `just` is the canonical interface for agents. `npm run …` exists for
# direct script invocation and IDE integration, but the composite gates
# (self-check, vet, snapshots) live here so there is exactly one place
# to encode them. If you find yourself running multi-step npm chains by
# hand, the chain belongs in this file.
#
# See AGENTS.md § Self-improvement loop — encode, don't document.

# Forward variadic recipe args verbatim via "$@" (preserves quoting,
# spaces, and shell metacharacters like () so `just pij send <id> "a (b)"`
# works). Without this, {{ARGS}} re-splits and the shell chokes on ().
set positional-arguments

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
#   2. Install/update the official global `pi` binary from npm
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
    @echo "=== 2/6 install/update official pi binary ==="
    just pi-official-install
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
    @echo "--- link the pij CLI bin (bare \`pij\` on PATH) ---"
    npm link
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

# Run vitest. Optionally scope to file(s)/pattern: `just test path/to/x.test.ts`.
test *ARGS:
    npm run test -- "$@"

# Focused gate for the file-watch-notify extension. Use after touching its
# wiring/tools/tests/docs before running the full self-check.
check-file-watch-notify:
    just typecheck
    just test .pi/extensions/file-watch-notify
    npx biome check .pi/extensions/file-watch-notify/

# tmux-driven end-to-end smoke (Driver SDK).
smoke:
    npm run smoke

# Run the pij CLI in-repo (no global link needed): `just pij list --here`.
# Quote message bodies normally: `just pij send pij-X "hello (world)"`.
pij *ARGS:
    npx tsx .pi/extensions/pij/cli.ts "$@"

# Manage third-party pi-extensions via .pi/packages.yaml.
pkg *ARGS:
    npm run pkg -- "$@"

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

# Install/update official Pi from npm. If this machine still has pij's old
# local ../pi-fork symlink as the global `pi`, remove that symlink first so
# npm can own the executable again. Refuses to clobber unknown real files.
pi-official-install:
    @set -eu; \
      package="@earendil-works/pi-coding-agent@latest"; \
      global_bin_dir="$(npm prefix -g)/bin"; \
      global_pi="$global_bin_dir/pi"; \
      if [ -L "$global_pi" ]; then \
        target="$(readlink "$global_pi")"; \
        case "$target" in \
          */pi-fork/packages/coding-agent/dist/cli.js) \
            echo "removing old local-fork pi symlink: $global_pi -> $target"; \
            rm "$global_pi"; \
            ;; \
        esac; \
      elif [ -e "$global_pi" ]; then \
        echo "ℹ existing non-symlink pi at $global_pi; npm will update it if package-owned"; \
      fi; \
      npm install -g --ignore-scripts "$package"; \
      pi --version | head -1

# --- pi fork source control (optional Pi core development only) ---

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
# this repo. Pi itself comes from the official npm package; pij contributes
# global prefs, MCP config, local extension symlinks, and vetted extension
# packages from this checkout.
#
# Important: use `pi update --extensions` after the npm install. Bare
# `pi update` also self-updates pi, which can fight with the explicit npm
# install step above.

# Install/update official Pi globally, sync pij prefs, globally link pij's
# local extensions, ensure vetted packages are installed, update extension
# packages, then run pi-doctor.
update-pi:
    @echo "=== current pi ===" && pi --version | head -1 || true
    @echo
    @echo "=== install/update official pi binary ==="
    just pi-official-install
    @mkdir -p ~/.pi/agent
    @echo
    @echo "=== sync global pi prefs from pij ==="
    cp .pi/APPEND_SYSTEM.md ~/.pi/agent/APPEND_SYSTEM.md
    @echo "  → ~/.pi/agent/APPEND_SYSTEM.md"
    cp .pi/mcp.json ~/.pi/agent/mcp.json
    @echo "  → ~/.pi/agent/mcp.json"
    @echo
    @echo "=== link pij extensions globally ==="
    just link
    @echo "--- link the pij CLI bin (bare \`pij\` on PATH) ---"
    npm link
    @echo
    @echo "=== ensure vetted pi packages are installed globally ==="
    just pkg bootstrap
    @echo
    @echo "=== update pi extension packages only ==="
    pi update --extensions
    @echo
    just pi-doctor

# Backwards-compatible alias for the previous "build our fork" one-command
# flow. The canonical flow now uses official Pi from npm plus pij's globally
# linked extensions/config.
pi-full-update:
    just update-pi

# Backwards-compatible alias for the old recipe name.
update-pi-full:
    just update-pi

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
