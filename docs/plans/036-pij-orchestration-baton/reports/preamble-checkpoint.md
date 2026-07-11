# s036 report — preamble checkpoint
**From**: pij-1khprxk · **To**: pij-3vetx8 · **Date**: 2026-07-11 · **Stage**: preamble → entering planning

**claim**: Orient + read-only survey complete; Jordan confirmed the assignment in-pane (ruling #6) and directed: fresh flight plan, spine in, explore done. No mutations occurred before his directive except ruling-#5-mandated interview artifacts (all inside my fence).

**artifacts[]**:
- `docs/plans/036-pij-orchestration-baton/rulings.md` — rulings #5 (uec99o interview waiver) + #6 (work authorized)
- `docs/plans/036-pij-orchestration-baton/research/interview-uec99o-questions.md` — interview packet sent
- `docs/plans/036-pij-orchestration-baton/research/interview-uec99o-answers.vendored.md` — nine answers, verbatim-vendored (severance rule honored)
- `docs/plans/036-pij-orchestration-baton/research/PROVENANCE.md` — sha256 + consent chain + spot-check record

**shas[]**: vendored answers sha256 `ad9cf5d7750dfb8e8d970b689ad54f38cb045e9b3e8a1581fd484899e8e9dde0` (cmp-clean vs source at vendor time)

**gates[]**: none run yet (no code). Cheap gate for later phases noted from local orient: `npx vitest run .pi/extensions/pij/` + `just pij-skill-check`; full `harness checks`.

**observations[]** (dogfood, prime-route):
- OBS-1: canary doctrine asks effort "verified mechanically — ps your process args"; a claude-harness peer spawned without an explicit `--effort` flag has NOTHING in its args to verify — self-verification can only honestly report "default". The footer probe (yours) is the working mechanism; the canary template could say so to avoid a false-confidence self-report.
- OBS-2: the severance/vendor+sha256 rule arrived AFTER I had already vendored (and nearly prepended a provenance header, which would have broken verbatim-ness). Suggest the adoption brief carry the severance rule up front when a cross-repo interview/artifact is foreseeable.
- OBS-3: interview-by-pointer worked cleanly end-to-end (packet out, answers back, receipts spot-verified); consent chain closed by your vouch without me needing to know the mechanism — good separation.

**open[]**:
- O-1: v1 verb scope (minimal lease vs full sketch) — will be settled in planning; uec99o evidence pushes DAG-queue + stale-SHA re-pin up the list.
- O-2: fence-vs-manifest diff + code-fence grant expected at plan validation (SW-1 armed on your side).
