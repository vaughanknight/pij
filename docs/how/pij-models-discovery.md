# How `pij models` discovers models

`pij models` (and the `--model` validation on `pij spawn` / `pij agent`) prints a
**curated, best-effort list** — it is **not** a live probe of each harness. Neither
copilot nor codex exposes an enumerable model API (both take a **freeform
`--model <string>`**), so the list is composed from static + config sources in
[`.pi/extensions/pij/core/models/registry.ts`](../../.pi/extensions/pij/core/models/registry.ts)
(`loadModels()` is the one impure composition root).

## Where each provider's rows come from

| Provider | Source of truth | Notes |
|---|---|---|
| **pi** (`sakana`, etc.) | `~/.pi/agent/models.json` `providers.*.models[]` + `modelOverrides` | `verified: true`; carries `reasoning` + `thinkingLevelMap` → effort levels |
| **copilot** | pi's `~/.pi/agent/models.json` `github-copilot` section (`copilotSeedFromPi`) **+** a best-effort `copilotSnapshot()` fallback for newer ids not yet in that file | snapshot entries remain `verified: false`; curated capability data can still be known independently |
| **codex** | the **default model in `~/.codex/config.toml`** (`codexConfigModels`) **+** a static `codexSnapshot()` fallback | codex has NO `--effort` flag and no list API; levels are a **curated** table (`gpt-5*` → `minimal…xhigh`, `o*` → `…high`) |
| **claude** | `claudeAliases()` — hardcoded best-effort list | `verified: false` |

`loadModels()` merges them and dedups: claude aliases drop if their id already came
from pi/copilot; the codex **config default wins** over the codex snapshot; the
copilot snapshot is deduped so a **verified pi entry always beats an unverified alias**.
The raw `github-copilot` row and its `provider: "copilot"` seed clone are intentionally
both retained: `pij models --harness copilot` shows both existing projections, while
`--harness pi` shows all provider rows because Pi proxies every provider.

### GPT-5.6 Copilot effort correction

Pi's live `thinkingLevelMap` is incomplete for the exact Copilot ids
`gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`. pij narrowly corrects those
three rows under provider `github-copilot` to the supported order
`none, low, medium, high, xhigh, max`. The same levels flow to the Copilot seed
clones and fallback aliases. Fallback aliases stay `verified: false`: that flag
means the id was not confirmed by a live registry, not that its curated effort
capabilities are unknown.

No provider-prefix normalization is performed by validation. Shared validation
matches the bare registry id (for example `gpt-5.6-sol`), while Pi spawn continues
to pass a supplied provider-prefixed id through unchanged and appends effort as
`github-copilot/gpt-5.6-sol:max`.

## Reading the output

- **`*`** after a row = `verified: false` → a **best-effort alias**, not confirmed by
  a live registry. **Canary it** on first real use (footer shows the model + the boot
  turn completes with no `API error (400)`).
- **`—`** in the levels column = no effort-level data (can't validate `--effort`;
  it's passed through, warn-don't-block).

## Key consequence: discovery ≠ usability

Because both CLIs accept a **freeform `--model`**, a model absent from `pij models`
can still be **spawned**:

```bash
pij spawn --harness codex   --model gpt-5.6-terra   # works even if not listed
pij spawn --harness copilot --model gpt-5.6-sol
```

pij is **warn-don't-block** on unknown models. A bogus id spawns fine, then **400s on
first inference** (no expensive silent fallback — you get a useless-but-cheap peer that
*looks* healthy), so **always canary the footer + first turn** before trusting a peer.

## To make a new model *appear* in `pij models`

- **copilot** → add it to pi's `~/.pi/agent/models.json` `github-copilot` section (the
  proper source), **or** to `copilotSnapshot()` in `registry.ts` for a pij-owned alias.
- **codex** → set it as the `~/.codex/config.toml` default, **or** add it to
  `codexSnapshot()` in `registry.ts`.
- No rebuild/daemon-restart needed — `pij models` re-execs `tsx` fresh each call.

> **Worked example (2026-07-10):** the `gpt-5.6-{sol,terra,luna}` trio was served by
> both clients but invisible to `pij models` (codex only knew the config-default `sol`;
> copilot's pi seed stopped at `gpt-5.5`). Fix: expand `codexSnapshot()` + add
> `copilotSnapshot()` — both now list all three as `*` aliases. pij subsequently
> added the narrow Copilot effort correction above when Pi advertised incomplete
> maps for the trio.
