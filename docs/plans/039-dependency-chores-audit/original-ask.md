# Plan 039 — original ask
**Recorded**: 2026-07-11 by pij-3vetx8 (o-prime) · source: Jordan, o-prime's pane

Verbatim: "need another one that goes through and looks at all the chores that dependabot has set up to make sure we have updated dependencies."

**Bound context**:
1. Audit the dependabot-generated chores (open dependabot PRs / alerts / config) for this repo; drive dependencies to updated state where safe.
2. Expect gh CLI use for PR/alert enumeration; npm audit / lockfile surfaces.
3. Gates: the full harness checks suite is the safety net for any bump; pkg-audit sensor already runs in checks.
4. Batons: git-index (pathspec commits per bump or batched — plan decides); push-main double-gate at ship as always.
