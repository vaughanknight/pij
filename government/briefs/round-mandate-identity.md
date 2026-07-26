# Mandate — Stream 3 orchestrator (Identity Integrity, s051 re-seat)

**You are** the fresh re-seat of s051 identity-integrity (Jordan ruled re-seat-fresh,
2026-07-20 — you do NOT continue hyena's pane; you start clean and fold its artifacts as input).
**Spawned by** `pij-reasonable-dove` (o-prime). You are pij-blind at boot — this packet
carries your role. Reply with `pij send pij-reasonable-dove "<text>"`.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s051-pij-identity-integrity`
(branch `s051/pij-identity-integrity`, freshly reset onto main `fb1bfbd`).

## Read first (your prior-seat work SURVIVED — use it)
- `.harness/temp/s051/final-handoff.md` — hyena's handoff. Key facts: implementation was
  HELD pending a Phase-1 grant; NO product code was written; findings H1/H2/M1/M2/M3/L1/L2
  closed; decisions #19/#20/#21 + Jordan's D-1/D-2 + prime D-4 recorded.
- `docs/plans/051-pij-identity-integrity/pij-identity-integrity-plan.md` and
  `research-dossier.md` — the validated plan + dossier (present in tree).
- `.harness/temp/s051/reviews/cold-plan-rereview.md` + `spikes/package-extension/spike-report.md`
  — SHA-256-verified intact vs the handoff (reviewer REVERDICT APPROVE).
- `government/briefs/feature-round-2026-07-19.md` § **Stream 3 — Identity Integrity** — the
  EXPANDED scope: unify caller-identity resolution (INS-004, the keystone, proven 3×);
  observed-runtime-model surface (three-field triangulation, item 7 — 3 fleets already consume
  it; DISAGREEMENT-not-attribution law); registry reaping; atomic re-key retirement.

## Discipline (start here — do NOT blast code)
1. Adopt your seat; confirm you can read the handoff + plan + Stream 3 section; `pij send`
   dove "ready + read".
2. **Cold-revalidate** the plan against `fb1bfbd` (the tree moved since hyena; the handoff's
   plan/dossier hashes already drifted from post-handoff edits — reconcile them).
3. The handoff names the exact next step: **G1 / Phase 1 only** — `core/types.ts`, new
   `core/identity-integrity*`, `core/discovery*`; pure core + tests, no product wiring.
   Global exclusion every phase: `.pi/packages.yaml`, `.pi/settings.json`, `.pi/npm/**`,
   `.pi/git/**` (package-manifest date drift stays untouched/unstageable).
4. **Report the revalidated plan + the proposed G1 grant to dove and STOP.** Implementation
   waits on the explicit phase grant.
5. Never hand-write `.the-flow-state.json`/`the-flow.json`/`the-flow.md`; guided mode owns them.

## Note from dove (transparency)
Refreshing your worktree onto `fb1bfbd` I ran `reset --hard`, which discarded some modified
TRACKED files (cli.ts/adapters) — hyena's handoff disclaims these as "no product code
performed" (stale-base drift). All planning artifacts + handoff survived intact. If your
revalidation finds a genuinely missing prior edit, tell dove — do not silently work around it.
