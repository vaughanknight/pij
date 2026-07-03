# pij agents — declarative agent packs, across harnesses

`pij agent` runs **[minih](https://github.com/AI-Substrate/minih) agent packs** —
small, declarative, file-based agents (a `prompt.md`, optional JSON schemas,
optional `instructions.md`) — behind pij-authored harness adapters. One flat verb
family discovers, runs, and authors packs, and drives them through **claude**,
**codex**, or **copilot** with a uniform `--json` envelope so another agent can
script them.

> **Where this sits:** pij *embeds minih as a library* (pinned tag
> `github:AI-Substrate/minih#minih-v0.2.4`). The pack format is minih's — pij never
> forks it. A pack authored here runs unchanged under stock `minih`, and vice
> versa. pij adds discovery, the harness adapters, the inline/ephemeral UX, and the
> `pij agent` CLI. The runtime lives in `.pi/extensions/pij/core/agents/`.

---

## Quick start

```bash
pij agent list                       # merged inventory: ./agents · ~/.pij/agents · built-ins
pij agents                           # alias for `pij agent list`
pij agent run flowspace-search -p query="daemon stall watchdog"   # run a named pack
pij agent run --prompt "List the 3 riskiest TODOs in this repo"   # inline, zero setup
pij agent run flowspace-search -p query=... --json | jq .report.summary   # scriptable
pij agent new my-tool                # scaffold ./agents/my-tool
pij agent show flowspace-search      # defaults, schemas, files
pij agent check my-tool              # validate frontmatter + schemas
pij agent eject flowspace-search     # copy a built-in into ./agents to customise
```

Exit codes follow the fs2 convention: **0** success · **1** user/agent error (bad
input, run failed, validation failed) · **2** system error (a harness CLI is
missing).

---

## Authoring a pack

A pack is a directory containing at minimum a `prompt.md` with **non-empty
frontmatter `description`** (minih silently skips packs without one):

```
my-tool/
  prompt.md            # frontmatter (below) + the system prompt body
  input-schema.json    # optional — JSON Schema for -p params (AJV, fail-fast)
  output-schema.json   # optional — JSON Schema for the agent's structured output
  instructions.md      # optional — appended to the prompt (operating instructions)
```

`prompt.md` frontmatter (all optional except `description`):

```yaml
---
description: One line on what this agent does. REQUIRED, non-empty.
tags: [search, code]
model: claude-sonnet-4-6           # default model (override with --model)
reasoning: low                     # default effort (override with --effort)
permissions:                       # minih permission policy (see below)
  preset: read-only
  overrides:
    shell: allow
---
```

`pij agent new <slug>` scaffolds this for you — it delegates to `minih init` when
the `minih` binary is on PATH (byte-compatible), otherwise writes pij's bundled
template. Either way the output runs unchanged under both pij and stock minih.
`pij agent check <slug>` validates the frontmatter + that the schemas parse.

### The pij-only `harness` hint

You may add a `harness: claude|codex|copilot` line to frontmatter. pij reads it to
pick an adapter; minih ignores it (no format fork). If absent, pij **derives** the
harness from the pack's `model` via the pi models registry (provider → harness),
falling back to `?` in `list` and to claude at run time.

---

## Overrides — warn, never block

Every instantiation-time flag overrides the pack's frontmatter with the precedence
**flag > frontmatter > unset**:

| Flag | Overrides | On an unknown value |
|------|-----------|---------------------|
| `--model <m>` | `model` | warns + proceeds (plan-025 posture) |
| `--effort <lvl>` | `reasoning` | warns + proceeds; codex `minimal`/`xhigh` are clamped by the adapter |
| `--harness <h>` | derived harness | must have an adapter (`claude·codex·copilot`), else `E-NOADAPTER` |
| `--permissions <preset>` | `permissions.preset` | minih preset name |
| `--timeout <s>` / `--cwd <dir>` | `timeout` / run cwd | plain |
| `-p key=value` | — | JSON-coerced (`20`→number, `true`→bool); repeatable |

Unknown model/effort **warn and proceed** — the warning prints on stderr and the
run continues. This mirrors `pij spawn`'s posture; the registry only warns when it
can *positively* confirm the value is unsupported.

---

## The determinism gradient — recorded · ephemeral · inline

minih always roots its `runs/<ts>/` ledger at the **pack directory**. pij exposes
three points on a gradient from "fully recorded" to "leaves nothing":

| Mode | Invocation | On-disk artifact | Use when |
|------|------------|------------------|----------|
| **Recorded** (default) | `pij agent run <slug>` | `runs/<ts>/output/report.json` under the pack | you want the audit trail (the source of truth) |
| **Ephemeral** | `pij agent run <slug> --ephemeral` | nothing — a temp copy runs then is deleted | one-off runs of a named pack, no ledger churn |
| **Inline** | `pij agent run --prompt "…"` | nothing — a synthesized temp pack | zero-setup throwaway questions |

Ephemeral and inline runs set `MINIH_NO_AUTO_HARVEST=1`, run under
`~/.pij/tmp/agents/…`, and delete the tree on completion (success *or* failure).
Stale temp trees (from a crash) are swept at the **start of every `pij agent run`**
(inline-only users may never start the daemon) and on daemon start.

`--json` on any run emits the machine envelope on **stdout only** (progress stays on
stderr):

```json
{
  "run": { "slug": "…", "status": "completed", "model": "…", "harness": "claude",
           "effort": "low", "runDir": "…|null", "validated": true },
  "report": { "summary": "…", "magicWand": "…", "…": "…" }
}
```

`runDir` is `null` for ephemeral/inline runs (nothing recorded) and the recorded
run folder otherwise.

---

## Harness adapters

pij ships three `IAgentAdapter`s (in `core/agents/adapters/`):

- **claude** — `claude -p … --output-format json` (one-shot headless). When a pack
  declares `permissions`, the adapter enables a scoped, read-only-safe toolset
  (`Bash,Read,Grep,Glob,WebFetch,WebSearch`) so the agent can shell out (e.g. run
  `fs2`) without gaining Write/Edit.
- **codex** — `codex exec --json` (one-shot). Effort is clamped to codex's range
  (`minimal`/`xhigh` warn, never block).
- **copilot** — a lazy wrapper around minih's `SdkCopilotAdapter`. The
  `@github/copilot-sdk` peer is optional and imported only at use; when absent the
  run fails with `E-HARNESSBIN` naming the package + install command.

A missing claude/codex CLI fails fast with `E-HARNESSBIN` (exit 2) **before** any
LLM session. An unknown `--harness` fails with `E-NOADAPTER` (exit 1).

> **Test seam:** set `PIJ_AGENT_FAKE=1` to route every run through a deterministic
> fake adapter (a canned envelope). No real CLI, no tokens — used by
> `scratch/agent-json-consume.sh` and CI to exercise the full CLI → runtime →
> envelope path hermetically.

---

## Built-ins + eject

Built-in packs ship read-only inside the pij package (`builtin-agents/`) as a third,
lowest-precedence discovery source. Because minih roots `runs/` at the pack dir —
which for a built-in is the installed package — **un-ejected built-ins always run
the ephemeral temp-copy path** (never writing into the package). To get recorded
runs, `pij agent eject <slug>` copies the pack into `./agents/<slug>`, where it then
**shadows** the built-in and records normally.

### `flowspace-search` (shipped)

Answers a natural-language query against this repo's **fs2 code graph**
(`model: claude-sonnet-4-6`, `reasoning: low`, `permissions: read-only + shell`):

```bash
pij agent run flowspace-search -p query="where is the daemon stall watchdog" -p limit=5
```

Its adapter subprocess runs in minih's isolated run dir, so the pack reads
`$PIJ_AGENT_CWD` (which pij sets to the repo root) and `cd`s there before running
`fs2 search`. If the graph is missing, the instructions tell the agent to have you
run `fs2 scan` first — it never fabricates an answer.

---

## Errors (workshop 002 § Errors)

| Code | Exit | Cause |
|------|------|-------|
| `E-NOAGENT` | 1 | slug not found in any source |
| `E-BADINPUT` | 1 | input failed `input-schema.json` (AJV, **before** any LLM session) |
| `E-NOADAPTER` | 1 | `--harness` beyond the `claude·codex·copilot` set |
| `E-HARNESSBIN` | 2 | the adapter's backing CLI (or copilot SDK) is missing |
| `E-PERMISSION` | 1 | minih `terminalReason: permission-denied` — surfaced loudly |
| `E-RUNFAILED` | 1 | the run failed / stalled / hit max-turns |

Error lines print on stderr; the exit code carries the machine signal.

---

## Companion / coordination — configuration only, zero pij code (AC-11)

pij's runtime is one-shot, but a **coordination-enabled** minih pack (a long-running
"companion" that reviews commits live and exchanges inbox messages) is supportable
today **with no pij code changes** — it is pure configuration. Two documented paths:

### A. The copilot adapter path

pij's copilot adapter *is* minih's `SdkCopilotAdapter`, which already implements the
coordination lifecycle (inside/outside lanes, farewell envelope). A pack opts in
purely through frontmatter — no new machinery:

```yaml
---
description: Reviews each commit and fires findings asynchronously.
model: claude-sonnet-4-6
coordination:
  enabled: true            # ← the only switch; minih's SdkCopilotAdapter honours it
permissions:
  preset: read-only
---
```

Run it through the copilot harness (requires `@github/copilot-sdk` + `GH_TOKEN`):

```bash
pij agent run my-companion --harness copilot
```

Everything the companion needs — the lanes, the ack chain, the farewell — is
provided by the embedded minih SDK adapter. pij changes nothing to support it.

### B. The minih-binary path

When the `minih` binary is on PATH, drive the companion directly — pij discovers and
lists it, but the coordination loop runs under minih itself (see
[`RUNBOOK.md` § Companion mode](../../RUNBOOK.md)):

```bash
export GH_TOKEN=$(gh auth token)
minih run code-review-companion &
RUN_ID=$(minih status code-review-companion | jq -r '.data | select(.verdict=="active") | .runId')
minih outside inbox send code-review-companion --run "$RUN_ID" \
  --type briefing --subject "<plan>" --body "<plan + hazards + protocol>"
```

Both paths are **configuration + existing binaries only**. The upstream wishlist
item (a first-class session-resident `pij agent companion` verb) is a pointer, not a
promise — it would be new machinery and is explicitly out of scope here.

---

## See also

- `RUNBOOK.md` § Companion mode — the operational companion recipe.
- `AGENTS_README.md` § Agents — the one-line quick start.
- `docs/plans/029-pij-agents-minih/` — the plan, workshops (001 minih reuse, 002 the
  CLI contract), and the phase execution logs.
