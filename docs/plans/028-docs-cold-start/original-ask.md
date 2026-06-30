# Original ask — docs-cold-start
**Captured**: 2026-07-01  ·  **By**: /the-flow (planning driver pij-1bdkqiq, fleet orchestrator pij-5lztp8)

> Full documentation pass so a fresh agent can cold-start this repo on a different machine.
> Two top-level deliverables (a separate coder implements them from these tasks):
>
> 1. `AGENTS_README.md` at repo root — the cold-start front door for agents. Covers how to
>    build the repo, how to update pi (and what pi is), how to work on pij + our workflow
>    (the-flow + flow-pair + control-plane peers), and other cold-start essentials. It
>    SIGN-POSTS to articles in `docs/how/` — it is an INDEX, not a content dump. MUST include
>    the fact that non-Claude agents (copilot, codex) read skills from `~/.agents/skills/`
>    (installed via `npx skills`; manifest `~/.agents/.skill-lock.json`), while Claude's own
>    skills live at `~/.claude/skills/`.
> 2. `README.md` (update) — the vibe/thesis of this repo. It is BOTH a pi-extensions project
>    (extensions under `.pi/extensions/`, e.g. pij) AND a cross-agent worker system (pij
>    control-plane daemon, flow-pair orchestration, the Telegram bridge — agents driving
>    agents across claude/copilot/codex/pi). Capture that "it's both + more" thesis.
>
> Planning only: explore the repo, produce the plan doc + phase tasks, name exact target
> files + required contents + which docs/how links AGENTS_README carries. Do NOT write the docs.
