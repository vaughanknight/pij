# P1 review packet 004 — fix-cycle-3 re-review (cycle 4)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Reviewer**: cold copilot `gpt-5.6-sol` @ xhigh — you authored reviews 001/002/003; compacted — re-derive from artifacts.

## Who you are
Cold re-reviewer. Report ONLY via `pij send pij-civilian-takin`. Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` · branch `s054/pij-grown-up`. Read-only except your ONE output file; never write the canonical repo.

## Target
Range `5285706..59321de` — H1 `2e6a661` (marker corroboration: state==next OR durable once-record, else BLOCK; new `SpineLogPort.hasOnce`), H2 `2c538e9` (corrupt journal wedges recovery: `pending(): Result`, E-NOREG naming path), M3 `9474935` (`clear(): Result`, confirmed-absent; recovery counts resolution only after confirmed clear), M4 `09489bb` (`Object.create(null)` canonical records), M5 `15efb90` (fake write-lock held-state twin + contract-suite coverage). Diff: `git -C <worktree> diff 5285706..59321de`.

## Authorities
Plan §P1 + WS-1..6 · YOUR reviews 001/002/003 · fix-packet-003.md · execution log H/M entries (claims, not truth).

## Dimensions
1. **Resolution attack**: re-run your cycle-3 probes against the new code — marker-written/state-lost (no once-file) forge; malformed UUID journal entry + create; abandoned-intent → failed-clear → successor; `__proto__` top-level/nested; nested/second-handle lock acquisition. Root-cause dead?
2. **New-surface check** (small this cycle, by design): `hasOnce` port semantics both impls; `pending()`/`clear()` Result plumbing at every call site (any swallowed error?); fake lock fork()/shared-backing semantics vs one-machine reality; H1's in-file disproof of cycle-2's "replay unconditionally" rationale — is the corroboration logic itself sound across ALL crash windows (state-lost, once-lost, both-lost)?
3. **Coder ruling to adjudicate**: verb-side clears tolerated (entries stay adjudicable; test 2301 as pin) — sound scope, or a gap?
4. **Regression + fence**: conventions, contract parity, `git -C <worktree> diff --name-only 5285706..59321de` (NO new files claimed; port changes hasOnce + pending/clear Result).
5. Severity CRITICAL|HIGH|MED; findings survive your own disprove attempt; cite code, runnable probes preferred.

## Gates
`npx vitest run .pi/extensions/pij/core/platform .pi/extensions/pij/adapters .pi/extensions/pij/core/cli.test.ts` · `just typecheck`. Baseline flake outside scope: release-age-policy.

## Output
1. ONE file `docs/plans/054-pij-grown-up/reviews/p1-review-004.md`: verdict first (`VERDICT: APPROVE` | `VERDICT: FINDINGS (<n>)`); APPROVE requires per-finding confirmation each cycle-3 defect is root-cause dead + a one-paragraph whole-of-P1 attestation (all 16 resolved findings across cycles 1–3).
2. Then: `pij send pij-civilian-takin "P1 REVIEW-4 <APPROVE|FINDINGS n> · docs/plans/054-pij-grown-up/reviews/p1-review-004.md · <one-liner>"`

## Forbidden
Everything except reading + your one output file — no code edits, no the-flow files, no `government/**`, no other docs writes, no commit/push/PR, no canonical-repo writes, no daemon/tmux mutation.
