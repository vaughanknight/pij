# Original ask — Copilot GPT-5.6 effort levels

## Human rulings

> next thing is copilot is not advertising the correct efffort levelts for sol, terra, luna.

> sol, terra luna all have none, low, medium, high, xhigh, max

> nwo on to the effort levels issue

## Current observed bug

`pij models --json` currently advertises these Copilot entries:

```text
gpt-5.6-sol   minimal, xhigh, max
gpt-5.6-terra minimal, xhigh, max
gpt-5.6-luna  minimal, xhigh, max
```

The required model-specific set for all three is:

```text
none, low, medium, high, xhigh, max
```

`minimal` is not supported for this trio.

## Known mechanism

- `core/models/registry.ts` reads verified Copilot entries from Pi's
  `~/.pi/agent/models.json` `github-copilot` provider.
- `levelsFromThinkingMap()` currently trusts that map.
- verified Copilot seed entries deduplicate over `copilotSnapshot()`.
- Copilot CLI's generic `--effort` help advertises
  `none,minimal,low,medium,high,xhigh,max`, but Jordan's ruling defines the
  narrower model-specific trio set.

## Bound outcome

- Correct human/JSON model advertisement.
- Correct effort validation for Copilot Sol/Terra/Luna.
- Preserve source-derived levels for all other Pi/Copilot providers/models.
- Preserve Codex's distinct curated table.
- Add mutation-resistant tests for all three ids and unsupported `minimal`.
- Cold validate the plan and stop at `WAITING_FOR_BUILD_CONFIG`.
