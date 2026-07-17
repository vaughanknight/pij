# P1 fix packet 004 — resolve cycle-4 findings (fix cycle 4)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Coder**: pij-general-llama (compacted — re-ground from packet + cited files)

## Context — two narrow residuals; 14/16 prior findings attested root-cause complete
Verdict `docs/plans/054-pij-grown-up/reviews/p1-review-004.md` (READ FIRST — the four-way corroboration matrix + both probe traces). No architecture changes: close the one bad matrix branch and stop swallowing four Results.

## Findings
- **J1 (HIGH — once-record must not override state mismatch)**: in `resolveCommitted`, the `state=prev/once-exists` branch currently replays + clears — it must BLOCK and retain the journal (once-file proves the event survived, not the project publish; both are separate best-effort-fsync dir entries). Keep: state=next branches as-is; once-only corroboration for uncoupled drafts (spine-append path). Do NOT attempt durable state-side version evidence in P1 — blocking is the ruled scope. Pin the reviewer's probe verbatim: journal+marked+once-published but projection at prev (set) / slug absent (create) ⇒ recovery blocks, journal retained, nothing cleared.
- **J2 (MED — verb-side clears must be honest)**: inspect all four discarded `clear()` Results in cli.ts. After landed state+event: nonzero honest result naming the cleanup error + "further writes are blocked". On abort paths: keep the primary error, append the residual-journal diagnostic. Pin: persistent-E-NOREG clear ⇒ project set exits nonzero naming cleanup failure (state+event still landed); abort path carries both errors.

## Standing contract
Packets 001–003 bind: worktree-only, fence, TDD red-first (probes verbatim), port-first if ports.ts changes, execution-log appends, no push/PR.

## Gates before checkpoint
`just typecheck` · fenced platform+adapters+cli suite · full `npx vitest run` (release-age-policy flake out of scope).

## Checkpoint
`pij send pij-civilian-takin "P1 FIX CYCLE 4 COMPLETE · commits <shas> · J1 J2 status · gates: <results>"`
