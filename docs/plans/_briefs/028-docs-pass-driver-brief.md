# the-flow DRIVER brief — full documentation pass (plan 028)

You are the **planning driver** in a 3-agent fleet. Orchestrator = pij-5lztp8 (Claude).
A separate **coder** (copilot opus max) will WRITE the docs; a **reviewer** (copilot
gpt-5.5) will review. **Your job: drive `/the-flow` to PLAN this pass — explore the
repo, then produce the plan + phase tasks. Do NOT write the docs yourself.**

## The goal
A full documentation pass so a fresh agent can **cold-start this repo on a different
machine**. Two top-level deliverables (the coder will implement them from your tasks):

1. **`AGENTS_README.md`** at repo root — the cold-start front door for agents. Covers:
   - how to **build** the repo,
   - how to **update pi** (and what pi is),
   - how to **work on pij** + **our workflow** (the-flow + flow-pair + control-plane peers),
   - any other cold-start essentials.
   - **It SIGN-POSTS to articles in `docs/how/` — it is an INDEX, not a content dump.**
     Each section is a short blurb + a link to the relevant `docs/how/<x>.md`.
   - **MUST include this fact** (recently confirmed, easy to get wrong): non-Claude agents
     (copilot, codex) read their skills from **`~/.agents/skills/`** (installed via
     `npx skills`; manifest `~/.agents/.skill-lock.json`). Claude's own skills live at
     `~/.claude/skills/`. A cold-starting agent needs this to find the-flow/flow-pair/pij skills.

2. **`README.md`** (update) — the **vibe / thesis** of this repo. It is **BOTH**:
   - a **pi-extensions** project (extensions under `.pi/extensions/`, e.g. pij), AND
   - a **cross-agent worker** system (pij control-plane daemon, flow-pair orchestration,
     the Telegram bridge — agents driving agents across claude/copilot/codex/pi).
   Capture that "it's both + more" thesis. Discover and name whatever else defines the repo.

## What already exists (USE IT — signpost, don't duplicate)
`docs/how/` already has: `pij.md`, `flow-pair.md`, `pij-telegram.md`, `agent-workbench.md`,
`agent-feedback.md`, `ralph-loop.md`, `session-sql.md`, `image-see.md`, `pi-peacock.md`,
`file-watch-notify.md`. Your plan should decide which NEW `docs/how/` articles are needed
(likely: build, update-pi, cold-start/quickstart, the-flow+flow-pair workflow) and which
existing ones AGENTS_README links to.

## Your deliverable (planning only)
Run `/the-flow` for plan ordinal **028** (slug e.g. `028-docs-cold-start`):
- explore the repo enough to ground the plan (read README, package.json/justfile, .pi/extensions,
  docs/how, AGENTS.md if any, the daemon/flow-pair/telegram code at a survey level),
- produce the **plan doc** (business spec + impl plan) and **phase tasks** for the doc pass,
- phase it sensibly (e.g. P1 docs/how new articles + AGENTS_README index; P2 README thesis — your call),
- each task must name exact target files + what each doc must contain + which docs/how links AGENTS_README carries.
- **Do NOT write the docs.** Stop at tasks.

## Report back to pij-5lztp8
When the plan + tasks exist, send:
`pij send pij-5lztp8 "PLAN READY: <plan-path> | tasks: <tasks-dir> | phases: <N> | notes: <...>"`
(If pij send can't resolve self: prefix `PIJ_SESSION_ID=pij-1bdkqiq pij send …`.)
Forbidden to touch: other plans' the-flow.json, .flow-pair/, and any code outside docs.
