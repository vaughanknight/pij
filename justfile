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
# `just install` is THE single command to set up pij on a fresh Unix machine
# after `git clone`. Windows uses `pwsh -File .\install-windows.ps1`, which
# performs the same six stages with directory junctions and Windows CLI shims.
# Both are idempotent — safe to re-run any time pi's state drifts.
#
# What it does:
#   1. Install repo dependencies (`npm ci`)
#   2. Install/update the official global `pi` binary from npm
#   3. Sync repo-managed global pi config:
#        .pi/APPEND_SYSTEM.md  → ~/.pi/agent/APPEND_SYSTEM.md
#        .pi/mcp.json          → ~/.pi/agent/mcp.json
#        .pi/models.json       → managed providers in ~/.pi/agent/models.json
#   4. Symlink pij's local extensions into ~/.pi/agent/extensions/
#   5. Install every vetted package from .pi/packages.yaml globally
#      via `pi install` (uses cmdBootstrap; refuses stale entries)
#   6. Run pi-doctor as a final verification
#
# After install, `pi` from ANY cwd on this machine gets the same
# extensions, MCP servers, voice-input prefs, response-mode prefs,
# portable model catalog, and global packages that pij configures.

install:
    @echo "=== 1/6 npm dependencies ==="
    just _root-lock-npm-ci
    @echo
    @echo "=== 2/6 install/update official pi binary ==="
    just pi-official-install
    @mkdir -p ~/.pi/agent
    @echo
    @echo "=== 3/6 sync global pi config ==="
    cp .pi/APPEND_SYSTEM.md ~/.pi/agent/APPEND_SYSTEM.md
    @echo "  → ~/.pi/agent/APPEND_SYSTEM.md"
    cp .pi/mcp.json ~/.pi/agent/mcp.json
    @echo "  → ~/.pi/agent/mcp.json"
    just sync-models
    @echo
    @echo "=== 4/6 install omp + link managed global surfaces ==="
    just omp-install
    just pij-skill-link-global
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
    node_modules/.bin/biome check .pi/extensions/file-watch-notify/

# tmux-driven end-to-end smoke (Driver SDK).
smoke:
    npm run smoke

# Cross-platform static + focused inbox/CLI proof used by the Windows CI lane.
windows-compat:
    npm run windows:check

# Reject user-specific absolute home paths in executable/configuration surfaces.
local-path-check:
    node_modules/.bin/tsx harness/scripts/local-path-check.ts

# Assert every `resolved` source in package-lock.json is allowlisted (npmjs
# registry or the sanctioned minih git source). The compensating control for
# npmjs-scoped host replacement — tamper-DETECTION at CI/review time. Any other
# host hard-fails.
lockfile-allowlist:
    node_modules/.bin/tsx harness/scripts/lockfile-allowlist.ts

# Run the pij CLI in-repo (no global link needed): `just pij list --here`.
# Quote message bodies normally: `just pij send pij-X "hello (world)"`.
pij *ARGS:
    node harness/scripts/pij-cli.cjs "$@"

# Manage third-party pi-extensions via .pi/packages.yaml.
pkg *ARGS:
    npm run pkg -- "$@"

# Print the production npm release-age value from the typed policy module.
_release-age-days:
    @node --input-type=module -e 'import { MIN_RELEASE_AGE_DAYS } from "./harness/scripts/release-age-policy.ts"; process.stdout.write(String(MIN_RELEASE_AGE_DAYS))'

# Run a fresh npm/Pi resolver with the governed proxy, online revalidation,
# and seven-day release-age policy.
_npm-resolution *ARGS:
    @node_modules/.bin/tsx harness/scripts/npm-resolution-run.ts "$@"

# Root lock replay must work before node_modules exists. Strip inherited npm
# policy keys case-insensitively, then retain only the governed authority,
# lock-host replacement, and
# online settings while the CLI argument clears age for this frozen operation.
_root-lock-npm-ci:
    @set -eu; \
      eval "$(env | sed -n 's/=.*//p' | awk '{ lower=tolower($0); if (lower=="npm_config_registry" || lower=="npm_config_replace_registry_host" || lower=="npm_config_prefer_online" || lower=="npm_config_min_release_age" || lower=="npm_config_before") print "unset " $0 }')"; \
      npm_config_registry="https://packagefeedproxy.microsoft.io/npm/" \
      npm_config_replace_registry_host="npmjs" \
      npm_config_prefer_online="true" \
      npm ci --min-release-age=null

# Prove locked install, fresh-resolution refusal, and audit visibility separately.
release-age-probe:
    @node_modules/.bin/tsx harness/scripts/release-age-probe.ts

# Replace repo-managed provider objects in the global pi model registry while
# preserving machine-local and otherwise unmanaged providers.
sync-models *ARGS:
    node_modules/.bin/tsx harness/scripts/sync-models.ts "$@"

# List the GitHub Copilot models your account is actually entitled to.
# Auto-selects the correct API host from the token's proxy-ep claim
# (enterprise vs individual), so it works where pi's models.json host 421s.
#   just copilot-models            # all entitled model ids
#   just copilot-models mai        # filter ids containing "mai"
#   just copilot-models --json     # raw JSON
copilot-models *ARGS:
    @python3 harness/scripts/copilot-models.py "$@"

# --- composite gates ---

# Pre-merge / pre-release gate. Agents MUST run this before reporting a
# task complete — never run npm directly to compose these steps.
self-check:
    just local-path-check
    just lockfile-allowlist
    just typecheck
    just lint
    just test
    just windows-compat
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
    PIJ_VET_LIVE=1 node_modules/.bin/vitest run agent.live

# Opt-in live regression for the agent-runtime harness adapters (AC-07).
# Drives one real `claude` and one real `codex` one-shot through the injected
# IAgentAdapter → runAgent path, asserting each yields a valid system envelope.
# Requires `claude`+`codex` on PATH and spends API tokens; NOT part of self-check.
# MINIH_NO_AUTO_HARVEST=1 keeps the run from writing a retro into this repo.
agent-live:
    PIJ_AGENT_LIVE=1 MINIH_NO_AUTO_HARVEST=1 node_modules/.bin/vitest run adapters.live

# --- ergonomics ---

# Scaffold a new T2 extension. Never hand-roll the boilerplate.
new NAME:
    npm run new -- {{NAME}}

# Symlink .pi/extensions/* into ~/.pi/agent/extensions/ for autoload.
link:
    npm run link

unlink:
    npm run link -- --remove

# Report where the machine's live pij currently resolves — CLI bin, extension,
# skill store, and daemon. The quick answer to "am I on main or the worktree?".
where:
    @echo "pij CLI bin → $(realpath "$(command -v pij)" 2>/dev/null || echo '(not on PATH)')"
    @echo "extension   → $(readlink ~/.pi/agent/extensions/pij 2>/dev/null || echo '(unlinked)')"
    @echo "skill store → $(readlink ~/.agents/skills/pij 2>/dev/null || echo '(unlinked)')"
    @printf 'daemon      → '; pij daemon status

# Structural gates for the /pij router skill (plan 030): registry↔module parity,
# sibling-blindness, line budgets, CLI-verb coverage, duplicated-prose scope.
pij-skill-check:
    bash harness/scripts/pij-skill-check.sh

# Symlink skills/pij/ into .pi/skills/ so pi auto-discovers it (Finding 02:
# pi only scans .pi/skills/, not the bare top-level skills/ dir).
pij-skill-link:
    mkdir -p .pi/skills
    ln -sf "$(realpath skills/pij)" .pi/skills/pij
    @echo "✓ .pi/skills/pij → $(realpath skills/pij)"

# Link skills/pij MACHINE-WIDE from the canonical checkout. The shared
# link-global guard refuses linked worktrees before this recipe can remove the
# existing target, preventing a development checkout from hijacking every seat.
pij-skill-link-global:
    #!/bin/sh
    set -eu
    npm run link -- --check-only
    source="$(realpath skills/pij)"
    target="$HOME/.agents/skills/pij"
    mkdir -p "$(dirname "$target")"
    rm -rf "$target"
    ln -sfn "$source" "$target"
    echo "✓ $target → $source (symlink, drift-proof)"

# Backwards-compatible alias; global skill installation is link-only.
pij-skill-install:
    just pij-skill-link-global

# Install the official OMP binary (GitHub releases, via https://omp.sh/install).
# Downloads the installer to a file and runs it, rather than `curl … | sh`: in a
# pipe the shell's exit status wins, so a failed download silently feeds an empty
# script to a shell that exits 0 and the caller believes it installed something.
_omp-binary-install *REF:
    #!/bin/sh
    set -eu
    tmp=$(mktemp)
    backup=""
    prev=$(command -v omp 2>/dev/null || true)
    if [ -n "$prev" ]; then
        backup=$(mktemp)
        cp "$prev" "$backup"
    fi
    trap 'rm -f "$tmp" "$backup"' EXIT
    if ! curl -fsSL --connect-timeout 10 --max-time 300 https://omp.sh/install -o "$tmp"; then
        echo "!! could not download the omp installer from https://omp.sh/install" >&2
        exit 1
    fi
    if [ -n "${1:-}" ]; then
        sh "$tmp" --binary --ref "$1"
    else
        sh "$tmp" --binary
    fi
    # A failed smoke check means we just replaced a working omp with one that does
    # not run. Put the old one back rather than leaving the machine without omp.
    if just _omp-smoke-check; then
        exit 0
    fi
    # Observed on macOS 25.x: the upstream installer rewrites the binary in place
    # (`curl -o "$INSTALL_DIR/omp"`), and a signed Mach-O rewritten over a vnode the
    # kernel has already validated gets SIGKILLed on launch — rc 137, no output, even
    # though the file is byte-complete, correctly signed and notarized. Re-materialising
    # it at a fresh inode (copy + atomic rename) clears the stale validation.
    now=$(command -v omp 2>/dev/null || true)
    if [ -n "$now" ]; then
        echo "= omp did not launch; re-materialising it at a fresh inode" >&2
        cp "$now" "$now.reinstall"
        chmod +x "$now.reinstall"
        mv "$now.reinstall" "$now"
        if just _omp-smoke-check; then
            exit 0
        fi
    fi
    if [ -n "$prev" ] && [ -n "$backup" ]; then
        echo "= rolling back to the previous omp binary at $prev" >&2
        cp "$backup" "$prev.rollback"
        chmod +x "$prev.rollback"
        mv "$prev.rollback" "$prev"
        echo "= rolled back: $(omp --version 2>/dev/null | head -1 || echo '(still not running)')" >&2
    fi
    exit 1

# A downloaded omp is not an installed omp. A byte-complete, correctly signed and
# notarized binary can still be SIGKILLed on launch (see _omp-binary-install), and a
# version delta alone would report that as a successful update. `--version` is the
# cheapest proof it actually runs.
_omp-smoke-check:
    #!/bin/sh
    set -eu
    if ! v=$(omp --version 2>/dev/null | head -1) || [ -z "$v" ]; then
        echo "!! the installed omp does not run — 'omp --version' produced no version." >&2
        echo "   The download itself may be fine; check 'codesign -v' and the file size" >&2
        echo "   against the release asset before assuming a network or registry fault." >&2
        echo "   Recover by pinning a release known to run here, e.g.:" >&2
        echo "     just _omp-binary-install v17.1.2" >&2
        exit 1
    fi
    echo "= omp runs: $v"

# Explain why omp's own updater could not reach its update source. omp's updater
# fetches https://registry.npmjs.org/@oh-my-pi/pi-coding-agent/latest directly: the
# host is compiled into the binary, so it honours neither `.npmrc` nor
# NPM_CONFIG_REGISTRY. On a machine where npmjs is blocked or proxied, that fetch
# always fails — and omp still exits 0.
_omp-update-diagnose:
    #!/bin/sh
    set -eu
    if curl -fsS --connect-timeout 10 --max-time 20 -o /dev/null https://registry.npmjs.org/ 2>/dev/null; then
        echo "  · registry.npmjs.org is reachable — the cause is not a blocked registry;"
        echo "    read omp's own message above (rate limit, TLS, or a transient network fault)."
    else
        echo "  · registry.npmjs.org is NOT reachable from this machine."
        echo "    omp's updater hardcodes that host, so it ignores your configured registry"
        echo "    (npm config get registry = $(npm config get registry 2>/dev/null || echo unknown))."
        echo "    The GitHub-releases installer used below is the supported path here."
    fi

# Latest omp release tag (bare version, no leading "v") from the same GitHub
# releases feed the installer uses. Prints nothing and fails if unreachable, so
# callers can tell "already latest" apart from "cannot reach any update source".
_omp-latest-release:
    #!/bin/sh
    set -eu
    json=$(curl -fsSL --connect-timeout 10 --max-time 30 \
        https://api.github.com/repos/can1357/oh-my-pi/releases/latest 2>/dev/null) || exit 1
    printf '%s' "$json" \
        | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' \
        | head -1 \
        | sed -e 's/.*"\(.*\)"/\1/' -e 's/^v//'

# Install the official standalone OMP binary when absent, then restore pij's
# managed OMP policy: only the pij extension plus Pi's shared MCP config.
omp-install:
    #!/bin/sh
    set -eu
    if command -v omp >/dev/null 2>&1; then
        echo "= omp already installed: $(omp --version | head -1)"
    else
        just _omp-binary-install
    fi
    just link
    just omp-doctor

# Update OMP, then re-apply managed links because updates may replace home state.
#
# `omp update` is tried first — it is the upstream path and works wherever npmjs is
# reachable. But it exits 0 even when its update check fails, so its exit code
# cannot be trusted: we detect failure from its output plus the version delta, then
# fall back to the GitHub-releases installer (a different host, reachable on
# npmjs-blocked machines). If neither path moves the version, this exits non-zero
# and says which of the three cases it was. Nothing here reads or relaxes npm
# policy — no registry URL is baked in, and .npmrc is untouched.
update-omp:
    #!/bin/sh
    set -eu
    if ! command -v omp >/dev/null 2>&1; then
        echo "= omp not installed — installing"
        just _omp-binary-install
    else
        before=$(omp --version 2>/dev/null | head -1)
        echo "= current: $before"
        out=$(omp update 2>&1) || true
        printf '%s\n' "$out"
        after=$(omp --version 2>/dev/null | head -1)
        if [ "$before" != "$after" ]; then
            echo "✓ omp updated in place: $before → $after"
        elif printf '%s' "$out" | grep -qiE 'failed to check|error|socket'; then
            echo "! 'omp update' could not check for updates (it exits 0 regardless, so"
            echo "  the failure is invisible to the exit code — this is why we re-check)."
            just _omp-update-diagnose
            # Ask the fallback's own source what the latest release is, so
            # "already on the latest" is never mistaken for "the install failed".
            latest=$(just _omp-latest-release || true)
            if [ -z "$latest" ]; then
                echo "!! could not reach the GitHub releases API either — both update sources" >&2
                echo "   are unavailable, so this is a network/egress problem, not just npmjs." >&2
                exit 1
            fi
            echo "= latest release on GitHub: $latest (installed: $before)"
            if [ "omp/$latest" = "$before" ] || [ "$latest" = "$before" ]; then
                echo "= already on the latest release — nothing to install"
            else
                echo "= falling back to the GitHub-releases installer"
                just _omp-binary-install
                final=$(omp --version 2>/dev/null | head -1)
                if [ -z "$final" ] || [ "$final" = "$before" ]; then
                    echo "!! still at '$before' after installing $latest — the fallback did not take." >&2
                    exit 1
                fi
                echo "✓ omp updated via GitHub releases: $before → $final"
            fi
        else
            echo "= omp reports no update available: $after"
        fi
    fi
    just link
    just omp-doctor

omp-doctor:
    #!/bin/sh
    set -eu
    npm run link -- --check-only
    omp --version
    npm run link -- --doctor-omp

# Install the flow front-door skills GLOBALLY for pi only (machine-wide), via
# `npx skills`. Mirrors ~/github/tools `install-skills`, but scoped to pi
# (-a pi) and to just the flow skills (-s) rather than every CLI / every skill.
# Two sources:
#   • the-flow                       ← jakkaj/tools (remote)
#   • eng-harness-flow (+ its peer    ← the globally-installed
#     harnessability-assessment)        @ai-substrate/engineering-harness
#                                        skills/ dir, resolved via `npm root -g`
#                                        so no personal path is hard-coded
#                                        (requires the harness CLI installed).
# Re-run after a fresh machine or `pi update` to restore the flow skills.
install-flow-skills:
    @echo "=== the-flow ← jakkaj/tools (pi, global) ==="
    just _npm-resolution npx --yes skills@latest add jakkaj/tools -a pi -g -y -s the-flow
    @echo
    @echo "=== eng-harness-flow ← @ai-substrate/engineering-harness (pi, global) ==="
    @set -eu; \
      eh="$(npm root -g)/@ai-substrate/engineering-harness/skills"; \
      test -d "$eh" || { echo "❌ harness skills not found at $eh"; echo "   install @ai-substrate/engineering-harness globally first"; exit 1; }; \
      node_modules/.bin/tsx harness/scripts/npm-resolution-run.ts npx --yes skills@latest add "$eh" -a pi -g -y -s eng-harness-flow -s eng-harness-0-harnessability-assessment
    @echo
    @echo "✓ flow skills installed globally for pi (the-flow + eng-harness-flow)"

# Run vitest scoped to the flow-pair lib tests (explicit path bypasses vitest
# config include filter; also works with: just test skills/flow-pair/test/).
flow-pair-test *ARGS:
    node_modules/.bin/vitest run skills/flow-pair/test/ "$@"

# Mutation smoke: PROVE the flow-pair suite actually guards a behaviour. The worker
# writes its own tests, so green != good — this deliberately breaks <file> with a
# sed ERE expr, asserts tests go RED, restores byte-identical, asserts GREEN again.
# A suite that stays green under mutation is decoration. See references/review-rubrics.md
# Dimension 0. Usage:
#   just flow-pair-mutate skills/flow-pair/lib/ledger.ts 's/if \(!ev[A-Za-z]+\.ok\)/if (false)/g'
#   just flow-pair-mutate <file> '<expr>' 'npx vitest run <suite>'   # target the suite that guards <file>
flow-pair-mutate file expr *test_cmd:
    bash harness/scripts/flow-pair-mutate.sh "{{file}}" '{{expr}}' {{test_cmd}}

# Install/update official Pi from npm. If this machine still has pij's old
# local ../pi-fork symlink as the global `pi`, remove that symlink first so
# npm can own the executable again. Refuses to clobber unknown real files.
pi-official-install:
    @set -eu; \
      pij_root="$(pwd)"; \
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
      "$pij_root/node_modules/.bin/tsx" "$pij_root/harness/scripts/npm-resolution-run.ts" npm install -g --ignore-scripts "$package"; \
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
      pij_root="$(pwd)"; \
      repo="../pi-fork"; \
      test -d "$repo/.git" || { echo "❌ $repo is not a git checkout"; exit 1; }; \
      short="$(git -C "$repo" rev-parse --short HEAD)"; \
      repo_abs="$(cd "$repo" && pwd)"; \
      echo "=== install pi fork dependencies ==="; \
      cd "$repo_abs" && "$pij_root/node_modules/.bin/tsx" "$pij_root/harness/scripts/npm-resolution-run.ts" npm install --ignore-scripts; \
      echo; \
      echo "=== build pi fork $short ==="; \
      npm run build; \
      cd - >/dev/null; \
      just pi-fork-link

# --- pi binary control ---
#
# `just update-pi` is the canonical way to refresh pi runtime state from
# this repo. Pi itself comes from the official npm package; pij contributes
# global prefs, MCP config, the portable model catalog, local extension
# symlinks, and vetted extension packages from this checkout.
#
# Important: use `pi update --extensions` after the npm install. Bare
# `pi update` also self-updates pi, which can fight with the explicit npm
# install step above.

# Install/update official Pi globally, sync pij config/models, globally link
# pij's local extensions, ensure vetted packages are installed, update
# extension packages, then run pi-doctor.
update-pi:
    @echo "=== current pi ===" && pi --version | head -1 || true
    @echo
    @echo "=== install/update official pi binary ==="
    just pi-official-install
    @mkdir -p ~/.pi/agent
    @echo
    @echo "=== sync global pi config from pij ==="
    cp .pi/APPEND_SYSTEM.md ~/.pi/agent/APPEND_SYSTEM.md
    @echo "  → ~/.pi/agent/APPEND_SYSTEM.md"
    cp .pi/mcp.json ~/.pi/agent/mcp.json
    @echo "  → ~/.pi/agent/mcp.json"
    just sync-models
    @echo
    @echo "=== link managed Pi/OMP surfaces ==="
    just link
    just pij-skill-link-global
    @echo "--- link the pij CLI bin (bare \`pij\` on PATH) ---"
    npm link
    @echo
    @echo "=== ensure vetted pi packages are installed globally ==="
    just pkg bootstrap
    @echo
    @echo "=== update pi extension packages only ==="
    @just _npm-resolution pi update --extensions
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
    @global_npm_root="$(npm root -g)"; \
      pij_bin="$(command -v pij)"; \
      just _pij-bin-shape-check "$global_npm_root" "$pij_bin"
    @echo
    @echo "=== ~/.pi/agent/extensions/ (pij symlinks should be here) ==="
    @ls -la ~/.pi/agent/extensions/ 2>/dev/null || echo "  (missing — run: just link)"
    @echo
    @echo "=== ~/.pi/agent/settings.json packages[] ==="
    @python3 -c 'import json,sys; s=json.load(open(sys.argv[1])); [print(f"  - {p}") for p in s.get("packages", [])]' ~/.pi/agent/settings.json
    @echo
    @echo "=== ~/.pi/agent/mcp.json servers ==="
    @if [ -f ~/.pi/agent/mcp.json ]; then \
      python3 -c "import json,sys; s=json.load(open(sys.argv[1])); m=s.get('mcpServers',{}); [print(f'  - {k}: {v.get(\"command\",\"\")} {\" \".join(v.get(\"args\",[]))}'.rstrip()) for k,v in m.items()]; (not m) and print('  (no mcpServers defined)')" ~/.pi/agent/mcp.json; \
    else echo "  (no ~/.pi/agent/mcp.json)"; fi

_pij-bin-shape-check global_npm_root pij_bin:
    @set -eu; \
      expected="{{global_npm_root}}/pij/harness/scripts/pij-cli.cjs"; \
      test -e "{{pij_bin}}" || { \
        echo "❌ global pij bin is missing: {{pij_bin}}"; \
        echo "   run npm link from the local main checkout, or run: just update-pi"; \
        exit 1; \
      }; \
      test -f "$expected" || { \
        echo "❌ linked pij package has no wrapper at: $expected"; \
        echo "   run npm link from the local main checkout, or run: just update-pi"; \
        exit 1; \
      }; \
      actual="$(realpath "{{pij_bin}}")"; \
      expected="$(realpath "$expected")"; \
      if [ "$actual" != "$expected" ]; then \
        echo "❌ stale global pij bin: {{pij_bin}} -> $actual"; \
        echo "   expected: $expected"; \
        echo "   run npm link from the local main checkout, or run: just update-pi"; \
        exit 1; \
      fi; \
      echo "pij bin: $actual"
