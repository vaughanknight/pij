# P1 fix packet 002 — resolve cycle-2 findings (fix cycle 2)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Coder**: pij-general-llama (compacted — re-ground from this packet + cited files, not memory)

## Context
Your fix cycle 1 resolved F4–F7 and F3-for-v1-fields; the no-op-set ruling was adjudicated SOUND. But the reviewer **reproduced with runtime probes** three HIGH defects in the F1/F2 replacement machinery. Read the verdict in full first: `docs/plans/054-pij-grown-up/reviews/p1-review-002.md` (evidence, reproduced failure traces, smallest fixes).

## Standing contract
Everything in `fix-packet-001.md` still binds: worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` (canonical repo write-forbidden), fence, gates, TDD red-first, execution-log appends, no push/PR, checkpoint form via `pij send pij-civilian-takin`.

## The findings (G1..G4) + scope guardrails
- **G1 (HIGH — lock stale-steal race)**: mtime-only staleness + non-atomic steal can evict a LIVE holder (three-writer handoff race reproduced; also any >10s critical section is stealable). Preferred route: **remove automatic stale-stealing** — a stuck lock times out with the existing manual-removal diagnostic (fail loudly, never steal). Take the lease/owner-liveness route only if you can make it provably unable to move a live lock; log the rationale either way. Required tests: the reviewer's three-writer stale-observation/fresh-reacquire scenario + a live holder exceeding the stale horizon.
- **G2+G3 (HIGH — journal phantom replay + causal reordering)**: treat as ONE coherent journal-lifecycle redesign, not two patches. Requirements: (a) journal entries are **phase-aware** — an op is replayable ONLY after its state write committed (durable committed marker; recovery must distinguish "state landed" from abandoned intent across the crash window); (b) replay happens in **durable causal order** (fs journal ids sorted lexically over random UUIDs is NOT an order — persist a real one, or serialize per project); (c) a write verb must NOT proceed while a predecessor op remains unreplayable — return an honest recovery error before mutating state. Reviewer's reproduced traces (phantom `project-set` at seq 1; B→C before A→B) become regression tests.
- **G4 (MED — canonical snapshots drop additive fields)**: `canonicalProjectJson` must canonicalize the complete OWN record — known fields in contract order, then unknown own fields in stable sorted order, nested records included — so prev/next never silently omit data the store preserves. Probe case (`futureField`, `created.futureStamp`) becomes a test.

## Non-negotiables
- Root cause, not symptom — cycle 3 will re-attack with the same probes.
- If a fix forces a port-contract change (`ports.ts`), change the port FIRST, alone, then fan out (house pattern from F1/F2).
- Gates before checkpoint: `just typecheck` · fenced `npx vitest run .pi/extensions/pij/core/platform .pi/extensions/pij/adapters .pi/extensions/pij/core/cli.test.ts` · full `npx vitest run` (release-age-policy flake stays out of scope).

## Checkpoint
`pij send pij-civilian-takin "P1 FIX CYCLE 2 COMPLETE · commits <shas> · G1..G4 status · gates: <results> · <rationale notes>"`
