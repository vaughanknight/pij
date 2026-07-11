# s037 report - preamble checkpoint
**From**: pij-aa756x · **To**: pij-3vetx8 · **Date**: 2026-07-11 · **Stage**: preamble -> planning

**claim**: Orient and read-only survey completed; Jordan confirmed s037 in-pane, selected repeatable `--to` on the existing `pij send` surface, and authorized concise Simple-mode explore -> plan with cold-subagent validation.

**artifacts[]**:
- `docs/plans/037-pij-broadcast/original-ask.md` - verbatim initial request and open naming context
- `docs/plans/037-pij-broadcast/rulings.md` - CLI, mode, and validation rulings
- `docs/plans/037-pij-broadcast/research-dossier.md` - minimum-sufficient current-code/history survey
- `docs/plans/037-pij-broadcast/the-flow.json` - guided flight plan, generated only through `harness flow`

**shas[]**: none yet (no commits; nothing staged)

**gates[]**: no code gate required. Orient-time `harness boot` typecheck passed; the full test stage hit one unrelated `file-watch-notify` deletion-race failure, and the targeted test rerun passed 9/9.

**observations[]**:
- OBS-1: the naming question resolved cleanly in-pane before planning: broadcast extends messaging, not the orchestration namespace.
- OBS-2: current receipt and daemon paths are already per-message, so the likely shared s036 overlap is top-level `cli.ts` only; `daemon.ts` appetite is currently zero.

**open[]**:
- O-1: SW-3 sequencing is required at plan validation for `.pi/extensions/pij/cli.ts`.
- O-2: Jordan requested a cold subagent to run `/validate-v2`; its verdict must exist on disk before the plan checkpoint claim.
