# FLOW-PAIR IMPLEMENT PACKET — plan 028, Phase 2 (DOCS) — coder

You (copilot opus max) already built Phase 1 (the 4 `docs/how/` articles + `AGENTS_README.md`).
Phase 2 is the **README reframe**. Implement all of Phase 2 in one run.

## Read first
- Plan: `docs/plans/028-docs-cold-start/docs-cold-start-plan.md` (Phase 2 table + AC-06/07/08)
- P2 tasks: `docs/plans/028-docs-cold-start/tasks/phase-2-readme-thesis/tasks.md`
- The current `README.md` (read it fully before editing).

## What to do (tasks 2.1→2.3) — a REFRAME, not an append
1. **2.1** — Reframe the README **opening** to the dual thesis: pij is BOTH a **pi-extensions project** (`.pi/extensions/*`, e.g. pij) AND a **cross-agent worker system** (control-plane daemon + flow-pair + telegram — agents driving agents across claude/copilot/codex/pi) — **and more**. Keep "the harness is the product" but **subordinate** it under the dual thesis. Do NOT just append a section at the bottom — change the top framing.
2. **2.2** — Add an **agent front-door pointer** near the top linking `AGENTS_README.md`; keep the existing feature sections (pij, session-sql, todo, minih-workbench, pi-peacock, flow-pair, telegram) as accurate blurbs+links; add a one-line cross-link to `docs/how/workflow.md`. Do NOT remove accurate content.
3. **2.3** — Verify: every relative link in README resolves (incl. the new `AGENTS_README.md` + `docs/how/workflow.md`); the opening clearly frames "both + more"; no pre-existing link broken; confirm NO non-doc file changed.

## ALLOWED paths (only this)
`README.md`.

## FORBIDDEN
Everything else — the Phase 1 files (done, don't re-touch), any code / `justfile` / `.harness/` / `.pi/`, `the-flow.json` / `the-flow.md`, `.flow-pair/`.

## Gates before reporting
- Every README relative link resolves.
- Opening frames the dual thesis (not an appended section).
- `git status` shows only `README.md` newly modified (plus the already-done P1 files).

## Report to pij-5lztp8
```
pij send pij-5lztp8 '{"delegationId":"028-p2-readme","outcome":"COMPLETE|BLOCKED","summary":"…","filesChanged":["README.md"],"linkCheck":"all resolve","notes":"reframe at top, not append"}'
```
(If `pij send` can't resolve self: prefix `PIJ_SESSION_ID=pij-d2ge1 pij send …`.)
