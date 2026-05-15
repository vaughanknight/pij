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

### New-machine recipe

```bash
git clone <pij-url> && cd pij
npm install
npm run pkg bootstrap   # install every third-party extension from the manifest
npm run link            # symlink pij's own extensions into ~/.pi/extensions/
```

Everything pij knows about (own extensions + curated third-party + MCP
servers in `.mcp.json`) is now restored.

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
