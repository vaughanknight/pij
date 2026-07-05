# How: skills

Skills are reusable prompt packs (`SKILL.md` + references) that agents discover
and invoke. Where they live differs by agent, and it is **easy to get wrong** —
the fact below is verified against disk reality, do not paraphrase it.

## The skills model — the shared store (verified)

> Non-Claude agents (copilot, codex, pi) read skills from **`~/.agents/skills/`**
> (installed via `npx skills`; manifest `~/.agents/.skill-lock.json`). Claude's
> skills live at **`~/.claude/skills/`**, which **symlinks into** the shared
> `~/.agents/skills/` store.

Verify it yourself:

```bash
ls ~/.agents/skills/                 # the shared store (the-flow, flow-pair, …)
head ~/.agents/.skill-lock.json      # manifest, "version": 3
ls -la ~/.claude/skills/             # entries are symlinks → ../../.agents/skills/<name>
```

So there is **one** physical store (`~/.agents/skills/`) tracked by **one**
manifest (`~/.agents/.skill-lock.json`); Claude just sees it through symlinks.
Installing a skill machine-wide updates the shared store and the per-agent
symlink bridges in one pass — you don't install a skill separately per agent.

## Install recipes

The [`justfile`](../../justfile) wraps the `npx skills` installer:

| Recipe | Scope | Source(s) | `justfile` |
|--------|-------|-----------|-----------|
| `just pij-skill-install` | **Machine-wide, every agent** (`-a '*'`) | `skills/pij` from this repo — the `/pij` router front door | `178-182` |
| `just install-flow-skills` | **pi only** (`-a pi`), global | `the-flow` ← `jakkaj/tools`; `eng-harness-flow` (+ its peer harnessability-assessment) ← `@ai-substrate/engineering-harness` | `195-206` |
| `just pij-skill-link` | in-repo dogfooding | symlinks `skills/pij` into `.pi/skills/` so pi auto-discovers it | `168-172` |

Notes:

- `just pij-skill-install` runs `npx skills@latest add "$(realpath skills)" -a
  '*' …` — it fans out to **every** detected agent (Claude Code, Copilot CLI,
  codex, pi), managing the shared `~/.agents/skills` store + the per-agent
  symlink bridges (tracked in `~/.agents/.skill-lock.json`), then swaps the store
  entry for a repo symlink so it can't drift (`justfile:178-182`).
- `just install-flow-skills` is pi-scoped and pulls the flow front-door skills:
  `the-flow` from the `jakkaj/tools` repo, and `eng-harness-flow` from the
  globally-installed `@ai-substrate/engineering-harness` package's `skills/` dir
  (resolved via `npm root -g`, so no personal path is hard-coded — it requires
  the harness CLI installed; `justfile:181-191`).
- Default install mode is **symlink** (no `--copy`), so a live skill always
  tracks its source — re-run after a fresh machine or a `pi update`.

## Which skills matter for cold start

For a fresh agent getting productive in pij, the three that matter most:

- **`the-flow`** — the SDD pipeline front door (see [`workflow.md`](workflow.md)).
- **`pij`** — the unified router front door (routes: pair · delegate · agent · peer · ops · skill);
  pairing is `/pij pair`. (The old `/flow-pair` skill was removed; saying "flow-pair" still routes here.)
- **flow-pair engine** — *not* an installed skill, but the orchestrator/worker/reviewer delegation
  **engine** (`skills/flow-pair/lib`) behind `/pij pair` (CLI, ledger, schemas, prompt-lab; see
  [`flow-pair.md`](flow-pair.md)).
- **`eng-harness-flow`** — the engineering-harness loop (boot / checks / improve;
  see [`build.md`](build.md) and
  [`.harness/engineering-harness.md`](../../.harness/engineering-harness.md)).

## See also

- [`workflow.md`](workflow.md) — how the-flow + flow-pair fit together.
- [`build.md`](build.md) — the build/gate harness the eng-harness skill drives.
