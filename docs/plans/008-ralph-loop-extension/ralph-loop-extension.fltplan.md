# Flight Plan — Ralph Loop pi extension

**Status**: Workshops complete (4/4) — awaiting `/plan-3-v2-architect`
**Plan dir**: `docs/plans/008-ralph-loop-extension/`
**Spec**: `ralph-loop-extension-spec.md`
**Research**: `research-dossier.md` (516 lines) + `external-research/ralph-loop-provenance.md` (371 lines, 27+ verified citations)
**Complexity**: CS-3 (medium) — P=6, confidence 0.75

---

## One-paragraph mission

Add a `ralph-loop` pi extension to pij that drives Geoffrey Huntley's canonical *Ralph Loop* pattern — fresh-context iterations against a plan/PRD file, terminated by `<promise>COMPLETE</promise>` or explicit stop conditions — using only pi's existing extension API and pij's existing harness, in a way that produces measurable harness-improvement output (encoded difficulty fixes, template gifts, or Driver SDK helpers) in addition to the extension itself.

## Headline outcome

The first pi extension in pij that runs **autonomously for multiple iterations**, with event-sourced history that survives `/reload`, `/resume`, `/fork`, and **`/compact`** (the D-005 verification this build was designed to deliver).

## Status

| Stage | State |
|-------|-------|
| Research dossier | ✅ Complete |
| External research | ✅ Complete (Ralph Loop facts verified against ghuntley.com + snarktank/ralph + Anthropic plugin) |
| Spec | ✅ Drafted |
| Clarify | ✅ Complete (8/8 questions; Q1=Simple, Q5=domain-extract-first, Q6=Shape C, Q8=minih harness) |
| Workshops (4/4) | ✅ Complete (stop-conditions / SDK lifecycle / plan format / compact-survival) |
| Architect (plan-3) | ⏳ Next |
| Implement (plan-6) | — |
| Code review (plan-7) | — |

## Key references

- `research-dossier.md` — pi-extension authoring path (verified), three inner-loop shapes (A in-session / B subprocess / C SDK), domain candidate `agentic-loops`.
- `external-research/ralph-loop-provenance.md` — community attribution, canonical stop sigil, snarktank defaults, failure modes, design implications §10.
- `docs/difficulties.md` D-005 — *the* load-bearing risk; this build is the chosen re-test.
- `RUNBOOK.md` § "Custom / unlisted pi models" — model selection is **out of scope** for this feature.

## Critical risks (full detail in spec)

1. **D-005**: `customType` may not survive `/compact`. Surfaced honestly; no in-extension workaround in v1.
2. **Stop conditions are the product**, not a corner case. Workshop candidate.
3. **Shape A shares context with the user's pi session**; long runs may bloat. Mitigation: inter-iteration `/compact` or tool-result-only iteration pattern.

## Next steps

Run **/plan-3-v2-architect** against `ralph-loop-extension-spec.md`. Workshops 001–004 are the design contract; architect translates them to phases + tasks.
