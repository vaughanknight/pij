# FLOW-PAIR IMPLEMENT PACKET — plan 028, Phase 1 (DOCS) — coder

You are the **coder** (copilot opus max). Orchestrator = pij-5lztp8. A separate
gpt-5.5 reviewer reviews after you. Implement **every task in Phase 1, in one run.**

## Read first (your spec — do not re-derive)
- Plan: `docs/plans/028-docs-cold-start/docs-cold-start-plan.md` (read it — esp. Phase 1 table + the **AGENTS_README Link Map**)
- P1 tasks: `docs/plans/028-docs-cold-start/tasks/phase-1-docs-how-and-agents-readme/tasks.md`
- Dossier (grounding): `docs/plans/028-docs-cold-start/research-dossier.md`

## What to build (all of Phase 1 — tasks 1.1→1.6)
4 NEW `docs/how/` depth articles + 1 NEW root index:
1. `docs/how/build.md` — prerequisites, `just install` bootstrap, recipe surface, `self-check` gate, harness boot/checks/doctor. Cite `justfile` lines.
2. `docs/how/update-pi.md` — what pi is (`@earendil-works/pi-coding-agent`), `just update-pi`, `~/.pi/agent/` state, `just pi-doctor`.
3. `docs/how/workflow.md` — the-flow SDD pipeline + flow-pair (orchestrator/coder/reviewer) + control-plane peers (pij daemon/spawn/send/list/tail; transport seam). LINK `docs/how/flow-pair.md` + `pij.md` for depth, don't duplicate.
4. `docs/how/skills.md` — skills model + the shared-store fact (see below), install recipes, which skills matter for cold-start.
5. `AGENTS_README.md` (root, NEW — distinct from existing `AGENTS.md`) — cold-start quickstart (clone → `just install` → verify) then an INDEX: each section a 1–3 sentence blurb + link, exactly per the plan's **AGENTS_README Link Map**. Includes the skills fact inline.
6. Verify P1: every relative link resolves; every command/path matches the `justfile`/CLI; cold-start walkthrough is followable.

## MUST-INCLUDE fact — verbatim to disk reality (AC-03), do NOT paraphrase
Non-Claude agents (copilot, codex, pi) read skills from **`~/.agents/skills/`** (installed via `npx skills`; manifest `~/.agents/.skill-lock.json`). Claude's skills live at **`~/.claude/skills/`**, which **symlinks into** the shared `~/.agents/skills/` store. (Verify on disk yourself before writing.)

## Discipline
- **Ground in the `justfile`** — it is the single source of truth. Cite line numbers; invent NO commands. If a doc and the justfile would disagree, the justfile wins.
- **READ the existing `docs/how/` articles you link** (flow-pair.md, pij.md, pij-telegram.md, …) so blurbs are accurate and you don't duplicate them.
- **AGENTS_README is an INDEX**, not a procedure dump — blurb + link per section; depth lives in the articles.

## ALLOWED paths (only these)
`docs/how/build.md`, `docs/how/update-pi.md`, `docs/how/workflow.md`, `docs/how/skills.md`, `AGENTS_README.md`.

## FORBIDDEN
`README.md` (that is Phase 2 — do NOT touch it), the existing 11 `docs/how/*.md` (signpost only, never edit — a moved-link one-liner is the only exception), any code / `justfile` / `.harness/` / `.pi/` change, `the-flow.json` / `the-flow.md` / `.the-flow-state.json`, `.flow-pair/`.

## Gates before reporting
- Every relative link you wrote resolves to a real file (check them).
- Every command/path matches the `justfile`/CLI (spot-cite).
- `git status` shows only the 5 allowed files.

## Report to pij-5lztp8
```
pij send pij-5lztp8 '{"delegationId":"028-p1-docs","outcome":"COMPLETE|BLOCKED","summary":"…","filesChanged":[…],"linkCheck":"all resolve / list broken","factCheck":"justfile-cited","notes":"…"}'
```
(If `pij send` can't resolve self: prefix `PIJ_SESSION_ID=pij-d2ge1 pij send …`.)
