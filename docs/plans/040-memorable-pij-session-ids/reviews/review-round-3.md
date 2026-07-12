# s040 review round 3 - F001-F004 acceptance
**Reviewer**: `pij-16d2xlz`
**Prior round**: F001-F003 APPROVE; F004 reopened verdict to FIX_REQUIRED
**Patch**: `docs/plans/040-memorable-pij-session-ids/reviews/review-input-round3.patch`
**SHA-256**: `5e17053e023457184a86605dc36f39c6fe0f442ed5dafe949b512c3709ecc877`

## Required verdict scope

Re-review the complete patch and explicitly dispose F001-F004.

### F004 acceptance contract

- `COPILOT_AGENT_SESSION_ID` is the only implicit Copilot current-session signal.
- UUID must match session-state metadata.
- Global newest-mtime, process argv, and `inuse.<pid>.lock` cannot bind.
- Env absent/invalid with no explicit `--session-id` never reuses a global session;
  adoption remains pending/actionable.
- Pending Copilot phonehome binds through `COPILOT_AGENT_SESSION_ID`.
- The old descriptor, pane, durable tuple, and bytes remain untouched.
- Explicit `--session-id` still wins.

## Orchestrator proof

- `just typecheck`: PASS.
- F004 scoped Biome: no F004-hunk issue; one unrelated pre-existing warning in
  `core/cli.ts` model filtering is outside the narrow addendum.
- Copilot/binding/core CLI/real CLI suites: 117/117 PASS.
- Flow-pair suite: 148/148 PASS.
- Formatted prime timeout from `40528df` preserved; real CLI suite now has 29 tests.
- `git diff --check`: PASS.
- Live reproduction and read-only interview:
  `reviews/finding-adopt-new-session.md`.

## Reviewer proof

- Run a reviewer-owned mutation for the env-first/no-global-fallback guard.
- Re-run the synchronized allocation race evidence from round 2 or verify it remains
  unchanged and covered.
- Validate the full frozen patch in isolation.
- Update `reviews/review.phase-1.md` with final verdict and all round-3 evidence.
- Do not edit product code.
