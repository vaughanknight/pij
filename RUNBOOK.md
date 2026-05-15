# pij Runbook

Three commands.

## Boot

```bash
npm install
npm run self-check     # validates the harness still works end-to-end
```

If `self-check` fails, fix it before doing anything else. **The harness IS
the product.**

## New extension

```bash
npm run new -- <name>
```

Generates `.pi/extensions/<name>/{index,store,store.test,smoke}.ts +
AGENTS.md` from templates encoding patterns P1–P10.

## Iterate

```bash
cd $(pwd) && pi          # auto-loads .pi/extensions/<name>/
```

In the TUI, after edits: `/reload`. Pi has no file watcher — the reload
is manual on purpose (workshop 002).

Recommended four-terminal layout:

| Terminal | Command |
|---|---|
| A | `pi` (the TUI; type `/reload` after edits) |
| B | your editor |
| C | `npm run typecheck -- --watch` (catches type errors before /reload) |
| D | `npm run test:watch` (store unit tests) |

## Smoke

```bash
npm run smoke -- <name>     # one extension
npm run smoke               # all extensions with a smoke.ts
```

Requires `tmux` and `pi` on PATH.

## When something hurts

1. Open `docs/difficulties.md`, append a row (D-NNN).
2. If the fix is small/surgical (fits the current task scope), **encode
   it now** (template, lint rule, helper). Do not just document it.
3. Otherwise, file a `stretch:` row and link the difficulty.

## Cross-machine / cross-cwd

```bash
npm run link                # symlink .pi/extensions/* into ~/.pi/extensions/
npm run link -- --remove    # undo
```

After link, `pi` from any directory autoloads pij's extensions.

## Third-party extensions

```bash
npm run pkg                          # list state
npm run pkg add <source> [note...]   # append to .pi/packages.yaml as enabled
npm run pkg enable  <src-or-substr>  # flip to enabled, regenerate settings.json
npm run pkg disable <src-or-substr>  # flip to disabled, `pi remove`
npm run pkg sync                     # reconcile yaml → settings.json + uninstall
npm run pkg bootstrap                # sync + `pi install` every enabled entry
```

`.pi/packages.yaml` is the committable source of truth. Pi auto-installs
anything in `.pi/settings.json#packages` on next boot; `bootstrap` does the
same eagerly. MCP server configs live in `.mcp.json` at repo root (read by
`pi-mcp-adapter` if installed).

### System deps per entry

If a package needs a binary outside npm/git (e.g. pi-lean-ctx needs the
`lean-ctx` rust binary), declare it in the entry:

```yaml
- source: npm:pi-lean-ctx
  enabled: true
  requires:
    bin: lean-ctx
    install: brew tap yvgude/lean-ctx && brew install lean-ctx
```

`bootstrap` checks `<bin> --version`; if it fails, runs `install` first.

### Vetting third-party extensions (Plan 009)

```bash
npm run pkg vet <source> [--json]   # run vetter pipeline against one source
npm run pkg audit [--json]          # run pipeline across all enabled entries
```

The pipeline runs four code-vetters (`npm audit`, `lockfile-lint`,
`github-trust` via `gh api`, OpenSSF `scorecard`) plus a `minih` agent
(`agents/package-vetter/`) that applies the workshop-001 rule taxonomy
via LLM judgment. Each manifest entry gets a `vetted: { date, score,
overrides?, agentRubric? }` block; freshness TTL is 30 days.

**Skip the agent** (offline / no LLM credits): set
`PIJ_VET_SKIP_AGENT=1`. The `self-check` chain skips the agent by
default for determinism.

**`pkg add` + `pkg bootstrap` enforce the gate**:
- `pkg add <source>` installs, runs the full pipeline, refuses on
  `level: fail` without `--unsafe`, and records `vetted:` on success.
- `pkg bootstrap` refuses entries whose `vetted.date` is missing or
  older than 30 days unless `--unsafe`.

**`--unsafe` requires a non-empty reason** via interactive prompt or
`--reason "<text>"` flag. The reason is logged to stderr and stored in
`vetted.overrides`.

**Overrides are scoped to specific rules** (FX001-1). The typed shape is:

```yaml
vetted:
  date: 2026-05-15T16:25:00Z
  score: 98
  overrides:
    rules:
      - github-trust:no-license     # enumerate which Finding.rule slugs are auto-downgraded
    reason: no-LICENSE on upstream; install-only use
```

During `pkg audit`, a `warn` is downgraded to `ok` only when **every**
warn finding's `rule` appears in `overrides.rules`. A new unrelated
`warn` (e.g. a fresh `npm-audit:high` CVE) keeps its severity and the
exit code remains 2. Legacy free-text `overrides: "<reason>"` parses
fail-safe (accepts no rules; prints a one-line deprecation warning).
`fail` is never auto-downgraded by override.

**Audit refresh writes back to YAML** (FX001-3). When an entry's RAW
`verdict.level` is `ok` (not `effective === "ok"` via override),
`pkg audit` advances `vetted.date`/`score`/`agentRubric` in-place
(comments preserved). Override entries are NOT refreshed — they must
age out so the user re-confirms acceptance.

**Snapshot evidence** (FX001-4). `agents/package-vetter/__snapshots__/`
carries committed Verdicts for the 7-file positive corpus + 4 manifest
packages (3 runs each + median). Regenerate via:

```bash
npm run snapshots:refresh             # all 19 runs (~20+ min)
npm run snapshots:refresh -- --corpus-only
npm run snapshots:refresh -- --pkg-only
```

`npm run snapshots:check` (chained into `self-check`) warns when
`briefing.md` SHA has changed since snapshots were generated.

**Known limitation**: pi's session-start auto-install reads
`.pi/settings.json#packages[]` directly and bypasses `pkg bootstrap` —
the gate only bites at install-by-pij time, not when pi auto-installs
something the user added by hand-editing settings.json.

### New-machine recipe

```bash
git clone <pij-url> && cd pij
npm install
npm run pkg bootstrap   # install every third-party extension (gated on vetted: freshness)
npm run link            # symlink pij's own extensions into ~/.pi/extensions/
```

Everything pij knows about (own extensions + curated third-party + MCP
servers in `.mcp.json`) is now restored. If any entry's `vetted.date`
is stale, `bootstrap` refuses with an explicit message — re-run
`npm run pkg audit` to refresh, then bootstrap.

## Where things are

| What | Where |
|---|---|
| Extensions | `.pi/extensions/<name>/` |
| Skills/prompts/themes | `.pi/<kind>/` (future) |
| Templates | `harness/templates/extension/` |
| Generator | `harness/scripts/new-extension.ts` |
| Driver SDK (typed smoke) | `harness/driver/` |
| Smoke runner (adapter) | `harness/scripts/smoke.ts` |
| Link script | `harness/scripts/link-global.ts` |
| Package manifest script | `harness/scripts/packages.ts` |
| Vetters (Plan 009) | `harness/scripts/vetters/` |
| Vetter agent pack | `agents/package-vetter/` |
| Test utils | `harness/test-utils.ts` |
| Validator agent pack | `agents/extension-validator/` |
| Workshops | `docs/plans/001-pi-extensions/workshops/` |
| Difficulty ledger | `docs/difficulties.md` |
| Velocity log | `docs/velocity.md` |
| BIO contract | `docs/project-rules/harness.md` |
| Pi ecosystem survey | `docs/plans/005-pi-ecosystem-survey/` |

## Custom / unlisted pi models

Pi's `/model` selector only accepts models from its built-in registry —
typing an arbitrary id (e.g. a new GitHub Copilot model not yet in pi's
generated list) shows "No matching models". Workaround: add the model
to `~/.pi/agent/models.json`. Pi reloads this file every time `/model`
opens, no restart needed. See [D-020](./docs/difficulties.md) for the
underlying cause.

### GitHub Copilot Claude template

For unknown `claude-*` models served through Copilot:

```json
{
  "providers": {
    "github-copilot": {
      "models": [
        {
          "id": "claude-opus-4.7-1m-internal",
          "name": "Claude Opus 4.7 1M Internal",
          "api": "anthropic-messages",
          "baseUrl": "https://api.individual.githubcopilot.com",
          "headers": {
            "User-Agent": "GitHubCopilotChat/0.35.0",
            "Editor-Version": "vscode/1.107.0",
            "Editor-Plugin-Version": "copilot-chat/0.35.0",
            "Copilot-Integration-Id": "vscode-chat"
          },
          "reasoning": true,
          "thinkingLevelMap": { "xhigh": "xhigh" },
          "input": ["text", "image"],
          "contextWindow": 1000000,
          "maxTokens": 64000
        }
      ]
    }
  }
}
```

Then verify and use:

```bash
pi --list-models claude-opus-4.7-1m-internal
pi --model github-copilot/claude-opus-4.7-1m-internal
```

### Per-family api routing

The `api` field **must** match the model family — Copilot routes Claude
through `anthropic-messages` but newer GPTs through `openai-responses`
and older ones through `openai-completions`. If pi errors with weird
streaming or auth failures, the api field is the first thing to check.

| Family | `api` |
|---|---|
| Copilot Claude | `anthropic-messages` |
| Copilot GPT-5+ | `openai-responses` |
| Copilot GPT-4.x / Gemini / Grok | `openai-completions` |

### One-shot CLI override (no file)

If you just want one session with an unlisted model, skip the file and
pass it on startup:

```bash
pi --model github-copilot/<exact-id> --thinking high
```

This works because pi's CLI resolver clones the provider's default
model shape as a fallback. Caveat: the fallback only matches the
family of the provider's default (currently GPT-ish for Copilot), so
for unknown Claude/Gemini/Grok the `models.json` route is safer.

## Authoring help

- **How extensions reach pi** → workshop 001
- **Edit-reload-test loop** → workshop 002
- **Canonical extension shape (P1–P10)** → workshop 003
- **The harness itself** → workshop 004

## How to start a Ralph Loop

`ralph-loop` is Plan 008's autonomous-iteration extension implementing
Geoffrey Huntley's [Ralph Loop](https://ghuntley.com/ralph/) pattern.

Quick path:

1. Write a plan file with `- [ ]` tasks:
   ```markdown
   - [ ] Write the README
   - [ ] Add a test
   - [ ] Run typecheck
   ```
2. Inside `pi`: `/ralph start ./PLAN.md`
3. Status pill shows `ralph-loop: iter N/M`.
4. Loop stops on `<promise>COMPLETE</promise>` sigil, plan-exhaustion,
   `STOP` line, iteration cap (default 10), USD/wallclock cap, spinning
   (3× same task), or `/ralph stop`.

Full reference (plan-file grammar, StopReason taxonomy, troubleshooting,
prompt customisation): **[`docs/how/ralph-loop.md`](docs/how/ralph-loop.md)**.

Key caveats in v1:
- No real-SDK auto-wire — set `PIJ_RALPH_FAKE_RUNNER=1` for the smoke /
  deterministic mode. Tracked as a follow-up in `docs/difficulties.md` D-005.
- AC-05 (`/compact` durability) verified for the replay path; real `/compact`
  pressure-test deferred to a gated smoke (D-005).

## Companion mode (minih)

Every plan-6 implementation (including the one that produced ralph-loop)
runs alongside a `code-review-companion` minih agent that reviews each
commit live, fires findings asynchronously, and writes a farewell envelope.

**One-time setup**: `minih agent install code-review-companion` (from the
minih repo). Plus the D-025 workaround file at
`agents/code-review-companion/state/inside-state.schema.json` (already in
the repo).

Quick path:

```bash
export GH_TOKEN=$(gh auth token)
minih run code-review-companion &
sleep 12
RUN_ID=$(minih status code-review-companion 2>/dev/null \
  | jq -r '.data | select(.verdict == "active") | .runId')
minih outside inbox send code-review-companion --run "$RUN_ID" --type briefing \
  --subject "<plan-name>" --body "<plan + hazards + protocol>"
```

Then ping at each commit boundary with `--type task --subject 'review-request: <id> <sha>'`.
Fire-and-forget; reply only on findings.

Full reference (BIO contract, lifecycle diagram, still-needed protocol,
farewell envelope shape, D-025 workaround details, layering vs
engineering harness): **[`docs/project-rules/agent-harness.md`](docs/project-rules/agent-harness.md)**.

