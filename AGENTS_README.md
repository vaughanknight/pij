# AGENTS_README — cold-start front door

The fastest path for a fresh agent (on any machine) to clone pij, build it,
update pi, and understand how we work. This file is an **index**: each section is
a short blurb + links into the depth articles under [`docs/how/`](docs/how/) —
the depth lives there, not here.

> **What pij is:** both a **pi-extensions project** (the `.pi/extensions/*`
> product surfaces) **and** a **cross-agent worker system** (agents driving
> agents across pi / claude / copilot / codex) — and more.
>
> **Where the rules + ops live:** [`AGENTS.md`](AGENTS.md) is the agent **rules**
> (P1–P10, security protocol, self-improvement loop); [`RUNBOOK.md`](RUNBOOK.md)
> is the operational **runbook**; [`README.md`](README.md) frames the **thesis**.
> This file is the index, not a substitute for those.

---

## Cold start

Clone, run the single bootstrap command, verify. This is the only fresh-machine
path:

```bash
git clone <pij-repo> && cd pij
just install            # the 6-step fresh-machine bootstrap (idempotent)
```

Then verify:

```bash
just pi-doctor          # read-only audit of pi's global state
just self-check         # or: harness boot  (fast typecheck + test)
```

→ Depth: [`docs/how/build.md`](docs/how/build.md).

## Build & test

The recipe surface (`just` with no args lists everything), the composite gate
`just self-check` (typecheck → lint → test → smoke → pkg audit → snapshots), and
the engineering harness (`harness boot` / `harness checks` / `harness doctor`).
The `harness` CLI is an ambient global tool; `.harness/` is committed substrate
it reads.

→ [`docs/how/build.md`](docs/how/build.md) ·
[`.harness/engineering-harness.md`](.harness/engineering-harness.md)

## What is pi / updating pi

`pi` is the official npm binary `@earendil-works/pi-coding-agent`. pij installs
the upstream binary and **syncs global state** onto `~/.pi/agent/` (prefs,
`mcp.json`, extension symlinks, vetted packages). Refresh it with
`just update-pi`; audit it with `just pi-doctor`. Edit the source files in
`.pi/` and re-run — never hand-edit `~/.pi/agent/*`.

→ [`docs/how/update-pi.md`](docs/how/update-pi.md)

## How we work (workflow)

We plan with the **the-flow** SDD pipeline (explore → plan → tasks → implement →
review → ship; artifacts under `docs/plans/<ord>-<slug>/`), delegate bounded work
with **flow-pair** (an orchestrator / worker / reviewer wrapper + a prompt-
learning ledger), and drive peer sessions through the **control plane** (the
`pij` daemon switchboard; `spawn` / `send` / `list` / `tail`; transport seam =
pi in-process inbox, claude/copilot/codex via tmux send-keys).

→ [`docs/how/workflow.md`](docs/how/workflow.md) ·
[`docs/how/flow-pair.md`](docs/how/flow-pair.md) ·
[`docs/how/pij.md`](docs/how/pij.md)

## Skills

> **Copilot** (and codex, pi) read skills from **`~/.agents/skills/`** (installed
> via `npx skills`; manifest `~/.agents/.skill-lock.json`). **Claude** reads from
> **`~/.claude/skills/`**, which **symlinks into** that same `~/.agents/skills/`
> store — one physical store, both agents see it.

Install via the `justfile` (it wraps `npx skills` — never call `npx skills` by
hand for a cold start):

```bash
just flow-pair-install     # flow-pair → EVERY agent (`-a '*'`): Claude (~/.claude/skills)
                           #   AND Copilot/codex/pi (~/.agents/skills), in one pass
just install-flow-skills   # the-flow + eng-harness-flow, pi-scoped, global
just flow-pair-link        # (in-repo dogfood) symlink flow-pair into .pi/skills/
```

`flow-pair-install` fans out to Claude **and** Copilot at once (it populates
`~/.agents/skills/` and the per-agent symlink bridge into `~/.claude/skills/`);
you do **not** install per-agent. For cold start the skills that matter are
`the-flow`, `flow-pair`, and `eng-harness-flow`.

→ [`docs/how/skills.md`](docs/how/skills.md)

## The extensions (the pi-extensions half)

The `.pi/extensions/*` product surfaces — the things pij ships as pi extensions:

- [`docs/how/pij.md`](docs/how/pij.md) — peer pi-session messaging + observe.
- [`docs/how/session-sql.md`](docs/how/session-sql.md) — per-session SQL store.
- [`docs/how/todo.md`](docs/how/todo.md) — the todo extension.
- [`docs/how/agent-workbench.md`](docs/how/agent-workbench.md) — the minih
  agent workbench.
- [`docs/how/pi-peacock.md`](docs/how/pi-peacock.md) — per-session window tint.
- [`docs/how/file-watch-notify.md`](docs/how/file-watch-notify.md) — file-watch
  notifications.
- [`docs/how/image-see.md`](docs/how/image-see.md) — image viewing.
- [`docs/how/ralph-loop.md`](docs/how/ralph-loop.md) — the ralph loop.
- `skill-runner` — runs skills inside a session (no dedicated article yet).

## Cross-agent worker system (the other half)

The control plane, delegation, and remote driving across harnesses:

- [`docs/how/pij.md`](docs/how/pij.md) — the messaging + control-plane CLI.
- [`docs/how/flow-pair.md`](docs/how/flow-pair.md) — orchestrator / worker /
  reviewer delegation.
- [`docs/how/pij-telegram.md`](docs/how/pij-telegram.md) — drive your pi
  sessions from Telegram.

## Feedback / self-improvement

Every session contributes back: retros + magic-wand wishes + difficulties flow
into the harness so the next agent doesn't hit the same friction.

→ [`docs/how/agent-feedback.md`](docs/how/agent-feedback.md)

## Rules & runbook

- [`AGENTS.md`](AGENTS.md) — the agent **rules** (read before changing code).
- [`RUNBOOK.md`](RUNBOOK.md) — the operational **runbook**.
- [`README.md`](README.md) — the project **thesis**.
