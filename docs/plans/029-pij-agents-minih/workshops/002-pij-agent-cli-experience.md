# Workshop: pij agent CLI experience

**Type**: CLI Flow
**Plan**: 029-pij-agents-minih
**Spec**: none yet — business source is `../research-dossier.md`; integration seams per `001-minih-reuse.md`
**Created**: 2026-07-03T07:40:00+10:00
**Status**: Draft

**Value Thesis**: The verb grammar, flag set, and output contract are the entire user-visible surface of this feature. Settling them here means the plan phases build one coherent surface instead of accreting flags per phase, and reviewers can check each phase against a written contract.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready (3 open questions marked)

**Selected Value Axes**:
- **Operator Usability**: command shapes are shown as real invocations with real output, matching pij's existing verb style.
- **Agent Readiness**: `--json` envelopes + exit codes let another agent drive `pij agent run` without parsing prose.
- **Implementation Readiness**: flag→behaviour tables map directly onto `parseArgs`-style handlers and the D1/D2 seams from workshop 001.
- **User Experience**: error cases are specified with the same loud, actionable `E-*` style pij already uses.

**Related Documents**:
- `001-minih-reuse.md` — D1 (library dep), D2 (adapters), D3 (ephemeral/inline), D4 (verb delegation) are authoritative inputs here
- `../research-dossier.md` — F-11 (verb intercept slot), F-13/F-14 (override rails), F-16 (fs2 surface for the built-in)

**Domain Context**: pij CLI control plane (`.pi/extensions/pij/cli.ts` intercepts + `core/cli.ts` pure parser); models registry; minih pack format (external contract — never forked).

---

## Purpose

Specify the complete `pij agent` command surface — grammar, discovery, overrides, inline/ephemeral UX, output contract, and errors — so implementation phases code against a fixed CLI contract.

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Contract Ready** with no additional context. They should be able to:

- Type every `pij agent` command variant correctly from the Quick Reference alone.
- Predict the exit code and output shape of any run (human and `--json`).
- Know where an agent will be discovered from and which duplicate wins.
- Know exactly which flags override which pack defaults, and what happens on an invalid value.

## Key Questions Addressed

- What is the verb grammar (`agent` vs `agents`, subverb set)?
- Where do agents come from and what wins on slug collision?
- How does a zero-setup inline run look and what does it leave on disk (nothing)?
- How do harness/model/effort overrides interact with pack frontmatter defaults?
- What do success, failure, and validation-failure look like to a human and to a calling agent?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Contract Ready | Phases implement subverbs against this contract; no UX invention mid-build |
| Primary Value Axis | Operator Usability | This is a daily-driver surface for Jordan + agents |
| Supporting Value Axes | Agent Readiness, Implementation Readiness | Other pij sessions and skills (flow-pair) will shell this verb |
| Downstream Loop Improved | Implementation + review | Each phase's AC can cite a section of this doc |

## Command Summary

| Command | Purpose |
|---------|---------|
| `pij agent list [--json]` | Merged agent inventory across all sources, with provenance |
| `pij agent run <slug> [-p k=v…] [overrides] [--json]` | Run a named agent pack |
| `pij agent run --prompt "<text>" [overrides] [--json]` | Inline agent: zero setup, nothing recorded |
| `pij agent show <slug>` | Pack details: defaults, schemas, source, description |
| `pij agent new <slug>` | Scaffold a minih-compatible pack in `./agents/<slug>/` |
| `pij agent check <slug>` | Validate a pack (schemas parse, frontmatter sane) via minih's exported validators |

**Grammar decisions**: canonical noun is **`agent`** (matches pij's singular verb style: `spawn`, `close`, `daemon`); **`pij agents` is accepted as an alias for `pij agent list`** (the original ask used both spellings — honour muscle memory, keep one canonical form). Registered as one `argv[2]` intercept (`agent`, alias `agents`) dispatching subverbs — the `telegram` pattern (dossier F-11) — and added to the bin's `USAGE` block (discoverability rule).

---

## `pij agent list`

```
$ pij agent list

AGENT              SOURCE     HARNESS   MODEL              DESCRIPTION
flowspace-search   built-in   claude    claude-sonnet-4-6  Search this repo's fs2 code graph
code-review        project    copilot   gpt-5.5            Review a diff against conventions
package-vetter     project    copilot   gpt-5.5            Vet a pi package for install safety
retro-digest       user       claude    claude-sonnet-5    Summarise docs/retros into themes

4 agents · sources: 2 project (./agents) · 1 user (~/.pij/agents) · 1 built-in (pij)
```

- **Sources & precedence (highest first)**: `./agents` (project) → `~/.pij/agents` (user) → built-in (shipped inside the pij package, read-only). A slug collision keeps the highest-precedence pack and lists the shadowed one dimmed with `(shadowed)`.
- **Detection**: a directory is an agent iff it contains `prompt.md` (the minih minimum — agent.json is optional metadata, per dossier F-05/F-18).
- **HARNESS column** is *derived*: pack frontmatter `model` → pij models registry → provider → `PROVIDER_HARNESS_MAP` (F-14); unknown model → `?` (warn-not-block).
- `--json`: array of `{slug, source, dir, description, tags, model, reasoning, harness, shadowed}`.

### Built-in distribution (decision)

| Option | Description | Decision |
|--------|-------------|----------|
| Materialise built-ins into `~/.pij/agents` on first run | User-editable copies | **Rejected** — upgrade drift; edits silently diverge from shipped versions |
| Serve built-ins from the pij package dir as a read-only third source; `pij agent eject <slug>` copies one into `./agents/` for customisation | Upgrade-safe; explicit customisation step; eject preserves minih compatibility | **Selected** |

## `pij agent run <slug>`

```
$ pij agent run flowspace-search -p query="daemon stall watchdog" --effort low

▸ flowspace-search (built-in) · harness claude · model claude-opus-4-8 · effort low
▸ input validated (input-schema.json)
▸ running… (stream on stderr; --quiet to silence)

✔ done in 41s · validated ✓

  Found 6 nodes for "daemon stall watchdog". Top: core/daemon.ts:294
  buildStalledNotice — latched stall notice, fires once per session.

  report: agents … runs/2026-07-03T…/output/report.json
```

- Named-pack runs **record by default** (minih `runs/<ts>/` is the artifact source of truth — H-03); `--ephemeral` opts out (temp-copy synthesis per workshop 001 D3, nothing left on disk).
- Human output = the report envelope's `summary` (+ artifact paths); the retrospective is recorded, not printed (visible via `--json` or the report file).
- `--json`: the full report envelope `{summary, …agent fields…, retrospective}` wrapped as `{run: {slug, status, model, harness, effort, runDir|null, validated}, report}` on stdout; progress stays on stderr.

### Override flags (instantiation-time, per the original ask)

| Flag | Overrides | Validation |
|------|-----------|------------|
| `--model <m>` | pack frontmatter `model` | pij models registry; unknown → **warn + proceed** (plan 025 posture) |
| `--effort <lvl>` | pack `reasoning` | per-model `levels` (F-14); codex `minimal` handled by adapter clamp (workshop 001 D2) |
| `--harness <h>` | derived harness | must have an adapter (`claude·codex·copilot` v1); no adapter → `E-NOADAPTER` |
| `--permissions <preset>` | pack `permissions` | minih presets (`restricted·read-only·trusted·yolo`); passes through as `permissionsOverride` |
| `--timeout <s>` / `--cwd <dir>` | pack `timeout` / run cwd | plain |

**Precedence** (mirrors both minih's and pij spawn's rule — F-08, F-13): flag > pack frontmatter > nothing (harness/adapter default). Unset emits nothing.

## `pij agent run --prompt` (inline / zero setup)

```
$ pij agent run --prompt "List the 3 riskiest TODOs in this repo, one line each" --json
```

- No slug: pij synthesises a temp pack (prompt.md only) under `~/.pij/tmp/agents/<run-id>/`, runs it **always-ephemeral** (`MINIH_NO_AUTO_HARVEST=1`, temp tree deleted after; crash-sweep on daemon start), prints the result, records **nothing** in the repo or `~/.pij/agents`.
- Output-schema optional: `--output-schema <file>` attaches one for validated structured output; otherwise the minih system envelope (`summary` + retrospective) is the only contract and the human output is `summary`.
- Overrides above all apply; default harness/model for inline runs = pij's configured default (same default `pij spawn` uses).
- Piped input: `echo "…" | pij agent run --prompt -` reads the prompt from stdin (matches the `-p` file-less ethos; **OPEN** Q2).

## `pij agent show` / `new` / `check`

```
$ pij agent show flowspace-search
flowspace-search  (built-in, read-only — `pij agent eject flowspace-search` to customise)
  description : Search this repo's fs2 code graph
  model       : claude-sonnet-4-6 (harness: claude)   reasoning: low   permissions: read-only + shell:allow
  <!-- model updated 2026-07-03: built-ins default to the smallest reliable model (Jordan's directive, plan § Clarifications) — earlier drafts showed claude-opus-4-8 -->

  input       : query (string, required) · limit (int, default 20)
  output      : summary + results[] + retrospective (output-schema.json)
  files       : prompt.md · input-schema.json · output-schema.json · instructions.md
```

- `new`: delegates to `minih init` when the binary is on PATH, else pij's bundled template (workshop 001 D4) — both produce the identical pack shape.
- `check`: minih's exported `validateInput`/`validateOutput`/system validators + frontmatter parse; exit 1 with per-error lines on failure.

## Error Codes

| Code | Message shape | Cause |
|------|---------------|-------|
| `E-NOAGENT` | `E-NOAGENT: no agent 'x' in ./agents, ~/.pij/agents, or built-ins — pij agent list` | slug not found in any source |
| `E-BADINPUT` | `E-BADINPUT: input failed input-schema.json — <ajv errors, one per line>` | AJV fail-fast, before any LLM session (F-06); exit 1 |
| `E-NOADAPTER` | `E-NOADAPTER: harness 'x' has no agent adapter (have: claude, codex, copilot)` | `--harness` beyond v1 set |
| `E-HARNESSBIN` | `E-HARNESSBIN: claude CLI not found on PATH — needed by this agent's harness` | adapter's backing CLI missing |
| `E-PERMISSION` | `E-PERMISSION: run denied (<kind> blocked by preset '<p>') — re-run with --permissions trusted` | minih `terminalReason: permission-denied` surfaced loudly (dossier risk: a real recorded run died silently this way) |
| `E-RUNFAILED` | `E-RUNFAILED: agent finished failed (<terminalReason>) — report: <path>` | run failed / stalled / max-turns |

**Exit codes**: `0` success (validated) · `1` user/agent error (bad input, run failed, validation failed) · `2` system error — the fs2 convention, already familiar in this ecosystem.

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | Flag set + output shape invented per phase | One contract; phases cite sections |
| Agent execution | Callers would parse prose output | `--json` envelope + exit codes specified |
| Review | "Should this warn or block?" per PR | Warn-don't-block posture written once (plan-025 lineage) |

## Open Questions

### Q1: Does `pij agent run` need a `--wait`/async mode (fire and check later), or is v1 strictly synchronous?

**OPEN** — synchronous fits one-shot agents; the execution-model workshop (recommended next) owns the async/companion question. Default: synchronous v1.

### Q2: stdin prompt (`--prompt -`) in v1 or defer?

**OPEN** — trivial if `--prompt` exists; include unless it complicates the parser.

### Q3: Should `pij agent list` also surface minih-registry installables (not-yet-installed packs)?

**RESOLVED**: no — list shows what can run *now*; installation stays `minih agent install` (workshop 001 D4).

## Validation / Acceptance

This workshop reaches its target proof level when:

- Every subverb's happy path and error path can be implemented without a UX decision being invented mid-phase.
- A calling agent can be pointed at this doc and correctly script `pij agent run --json` including exit-code handling.
- The plan's phase ACs cite these sections (grammar, precedence, envelope, errors) rather than restating them.
