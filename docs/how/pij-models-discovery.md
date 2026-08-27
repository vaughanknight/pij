# How `pij models` discovers models

`pij models` (and the `--model` validation on `pij spawn` / `pij agent`) prints a
**curated, best-effort registry**, not an entitlement probe. The GitHub Copilot
service exposes an authenticated `/models` endpoint, wrapped by `just copilot-models`,
but neither the Copilot CLI nor Codex CLI provides a local model-list subcommand.
`pij models` therefore composes static + config sources in
[`.pi/extensions/pij/core/models/registry.ts`](../../.pi/extensions/pij/core/models/registry.ts)
(`loadModels()` is the one impure composition root).

## Where each provider's rows come from

| Provider | Source of truth | Notes |
|---|---|---|
| **pi** (`sakana`, etc.) | runtime `~/.pi/agent/models.json` `providers.*.models[]` + `modelOverrides`; portable providers are authored in repo `.pi/models.json` and installed by `just sync-models` | `verified: true`; carries `reasoning` + `thinkingLevelMap` → effort levels |
| **omp** | OMP's built-in catalog + metadata-only overrides in repo `.omp/models.yml`, installed as `~/.omp/agent/models.yml` by `just link` | keeps OMP's built-in Copilot OAuth/plan transport while making entitlement-backed ids selectable with accurate context metadata |
| **copilot** | the Pi runtime file's `github-copilot` section (`copilotSeedFromPi`) **+** a best-effort `copilotSnapshot()` fallback for newer ids not yet in that file | snapshot entries remain `verified: false`; curated capability data can still be known independently |
| **codex** | the **default model in `~/.codex/config.toml`** (`codexConfigModels`) **+** a static `codexSnapshot()` fallback | codex has NO `--effort` flag and no list API; levels are a **curated** table (`gpt-5*` → `minimal…xhigh`, `o*` → `…high`) |
| **claude** | `claudeAliases()` — hardcoded best-effort list | `verified: false` |

`loadModels()` merges them and dedups: claude aliases drop if their id already came
from pi/copilot; the codex **config default wins** over the codex snapshot; the
copilot snapshot is deduped so a **verified pi entry always beats an unverified alias**.
The raw `github-copilot` row and its `provider: "copilot"` seed clone are intentionally
both retained: `pij models --harness copilot` shows both existing projections, while
`--harness pi` shows all provider rows because Pi proxies every provider.

### Portable catalog ownership

Pij owns the portable `github-copilot`, `sakana`, and `openrouter` provider objects in
`.pi/models.json`. `just install`, `just update-pi`, and the focused
`just sync-models` recipe replace those three provider objects in the runtime file
while preserving every unmanaged provider already on that machine (for example a
LAN-specific `local` provider). The source contains no resolved credentials: Sakana
keeps only its command reference to the private `~/.pi/agent/auth.json`.

Use `just sync-models --target <temporary-path>` for fixture or diagnostic proof. Tests
must never target the real home file, and normal operation uses the default target.

OMP's `.omp/models.yml` intentionally uses only `modelOverrides` under
`github-copilot`. A full custom provider would require independent credentials and
would replace the built-in subscription transport. `just link` links this repository
file directly, so updates take effect on the next OMP process without copying secrets.

### GPT-5.6 Copilot effort correction

Pi's live `thinkingLevelMap` is incomplete for the exact Copilot ids
`gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`. pij narrowly corrects those
three rows under provider `github-copilot` to the supported order
`none, low, medium, high, xhigh, max`. The same levels flow to the Copilot seed
clones and fallback aliases. Fallback aliases stay `verified: false`: that flag
means the id was not confirmed by a live registry, not that its curated effort
capabilities are unknown.

Pi-family spawn performs provider binding after validation and before any tmux
mutation. A provider-qualified model passes through unchanged. A bare model id
available from `github-copilot` plus other providers deterministically becomes
`github-copilot/<id>` and emits a notice. Any other multi-provider collision is
rejected with `E-AMBIGUOUS` and the qualified choices. CLI spawn and the
model-facing `pij_spawn` tool share this resolver.

## Reading the output

- **`*`** after a row = `verified: false` → a **best-effort alias**, not confirmed by
  a live registry. **Canary it** on first real use (footer shows the model + the boot
  turn completes with no `API error (400)`).
- **`—`** in the levels column = no effort-level data (can't validate `--effort`;
  it's passed through, warn-don't-block).
- **Provider in `pij list`** = the provider resolved before launch and persisted
  independently from `boundModel`. `null` is reserved for legacy, default-model,
  or otherwise genuinely unknown bindings.

## Key consequence: discovery ≠ usability

Because both CLIs accept a **freeform `--model`**, a model absent from `pij models`
can still be **spawned**:

```bash
pij spawn --harness codex   --model gpt-5.6-terra   # works even if not listed
pij spawn --harness copilot --model gpt-5.6-sol
pij spawn --harness pi --bin omp --model gpt-5.6-sol # binds github-copilot
```

pij remains **warn-don't-block** for unknown model ids and unsupported effort
levels. Provider ambiguity is different: guessing can silently bind credentials
to the wrong backend, so non-Copilot ambiguity fails before launch. Canary the
footer, first turn, and `pij list` provider before trusting a peer.

### Canary validates the effective context tier

`pij canary <peer> --expect-model <provider/model>` does not stop at model
identity. It joins the requested selector to the catalog `contextWindow`, reads
the harness's own pane footer (`1.0M context`, `145k/1.1M`, etc.), and records
the matched label and `pane-footer` provenance in `CanaryRecord`. The canary
returns `E-CANARY-CONTEXT` when the footer reports the wrong tier (for example,
`400K` for a 1M catalog model) or exposes no effective-window evidence. It never
substitutes catalog metadata for an unobservable runtime value.

Copilot spawns with a pinned model include `--context long_context` unless the
registry marks the model `longContext:false` through the curated deny-set (for
example, `gemini-3.6-flash`, which rejects the flag with HTTP 400). The canary
context join may then report the model's smaller tier; that is expected.

### Gemini 3.6 Flash upstream instability

gemini-3.6-flash on GitHub Copilot CLI 1.0.81-14 is unstable upstream: HTTP 400
'invalid request body' on every request path (-p and interactive) observed
2026-08-27 ~16:0xZ, while a -p one-shot succeeded 2026-08-27 ~07:33Z — treat
as unavailable until a fresh probe passes; pick gpt-5.6-terra or gpt-5.6-sol.
The failure is instrumented by the eight-row isolation matrix; the earlier pass
was relayed by the o-prime and was not instrumented in that run.

The catalog records both observations in `ModelEntry.copilotInstability`; it does
not claim an interactive-only limitation. `pij spawn` prints the measured warning
but continues, preserving warn-don't-block behavior. The separate item 6
`longContext:false` argv gate remains in force, because the isolated matrix does
not invalidate the known `--context long_context` rejection.

The complete eight-row Flash/Sol isolation matrix and verbatim request errors are
in
[`isolation.md`](../plans/391-day3-core/tasks/phase-2c-item-6b-flash-ui-server/isolation.md).

## To make a new model *appear* in `pij models`

- **copilot** → add portable entries to repo `.pi/models.json` under `github-copilot`,
  run `just sync-models`, and canary the result; use `copilotSnapshot()` in `registry.ts`
  only for a pij-owned fallback alias that must exist without the runtime catalog.
- **codex** → set it as the `~/.codex/config.toml` default, **or** add it to
  `codexSnapshot()` in `registry.ts`.
- No rebuild/daemon-restart needed — `pij models` re-execs `tsx` fresh each call.

> **Worked example (2026-07-10):** the `gpt-5.6-{sol,terra,luna}` trio was served by
> both clients but invisible to `pij models` (codex only knew the config-default `sol`;
> copilot's pi seed stopped at `gpt-5.5`). Fix: expand `codexSnapshot()` + add
> `copilotSnapshot()` — both now list all three as `*` aliases. pij subsequently
> added the narrow Copilot effort correction above when Pi advertised incomplete
> maps for the trio.
