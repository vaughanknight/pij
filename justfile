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

# --- pi binary control ---
#
# `just update-pi` is the canonical way to update pi from this repo.
# Pi update has historically moved discovery paths (e.g. global
# extensions dir relocated under ~/.pi/agent/extensions/). This recipe
# updates pi AND re-applies pij's harness state so a silent path move
# doesn't strand our extensions, MCP config, or global packages.

# Update pi to the latest published version, then re-apply harness state.
update-pi:
    @echo "=== current pi ===" && pi --version | head -1
    npm install -g @earendil-works/pi-coding-agent@latest
    @echo "=== updated pi ===" && pi --version | head -1
    just link
    just pi-doctor

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
