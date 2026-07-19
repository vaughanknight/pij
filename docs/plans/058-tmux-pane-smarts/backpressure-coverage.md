# Backpressure Coverage — tmux Pane Smarts

**Plan**: [tmux-pane-smarts-plan.md](./tmux-pane-smarts-plan.md)
**Basis (plan SHA-256)**: ee14a0885649286b68cd5e517fa4eb791cc2286544b9e7c88c85ce55c3081b5e
**Generated**: 2026-07-19
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores.
> Selection, not enforcement: the proof lines below are what the plan's owner folds into each criterion's "done when".

## Existing Sensors (inventory)

| Sensor | Paved command | Dimension | Found in |
|--------|---------------|-----------|----------|
| unit/integration tests (vitest) | `npm test` (`vitest run`) | behaviour | root; `.pi/extensions/pij/*.test.ts` incl. `daemon.test.ts`, `acceptance-sweep.test.ts` |
| typecheck | `npm run typecheck` (`tsc --noEmit`) | maintainability | root |
| lint | `npm run lint` (`biome check .`) | maintainability | root |
| smoke | `npm run smoke` (`tsx harness/scripts/smoke.ts`) | behaviour | `harness/` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail |
|--------------------------|-------|----------------|--------|------|-------------|
| AC-01 busy bit from byte-density (per harness) | 1 | EXTEND→RUN: add `pane-signals.test.ts` busy/idle fixture cases; then `npm test` | EXTEND | computational | — |
| AC-02 typing sets hold; send queued | 1 | EXTEND→RUN: add key-tracker + SendBuffer hold cases; then `npm test` | EXTEND | computational | — |
| AC-03 release on Enter / 60s idle; FIFO flush | 1 | EXTEND→RUN: add release-trigger + flush-order cases; then `npm test` | EXTEND | computational | — |
| AC-04 connect/disconnect (id-diff, pane_dead) | 1 | EXTEND→RUN: add connect-diff cases (added id surfaces, dead retires); then `npm test` | EXTEND | computational | — |
| AC-05 no screen-scrape/keylogger (stream-only) | 1 | EXTEND→RUN: assert parsers consume only stream bytes / no capture-pane in busy path; then `npm test` + `npm run lint` | EXTEND | computational | partial design-intent — the assert proves no capture-pane import in the busy path |
| Live end-to-end (spawn peer, type→queue, Enter→flush, kill→retire) | 1 | EXTEND→RUN: extend `npm run smoke` with a pane-signal path, OR a scripted live smoke | EXTEND | inferential | real-tmux behaviour; a scripted smoke narrows but does not fully eliminate the eyeball |

## Proof Plan (selected)

### Phase 1: Implementation
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-01 | EXTEND→RUN | add busy/idle fixture cases to `pane-signals.test.ts`; then `npm test` |
| AC-02/03 | EXTEND→RUN | add key/Enter + SendBuffer hold/flush cases; then `npm test` |
| AC-04 | EXTEND→RUN | add connect-diff cases; then `npm test` |
| AC-05 | EXTEND→RUN | assert stream-only busy path (no `capture-pane`); then `npm test` + `npm run lint` |
| Live E2E | EXTEND→RUN | extend `npm run smoke` with the pane-signal path |
| whole build | RUN | `npm run typecheck` green (no type regressions in the daemon) |

## Certainty: Partial

Counts (behaviour/architecture rows): 0 RUN · 5 EXTEND · 0 BUILD · 0 ABSENT
Recommended next move (per-task lookup, advisory): **propose the extension(s) first** — every criterion lands in the existing vitest suite; no new sensor infrastructure.

Rationale: all six behaviour rows are `EXTEND→RUN` into the already-present vitest suite (which already tests the daemon) — the cheapest rung, a proven home. Nothing is `BUILDABLE` or `ABSENT`; the only residual inference is real-tmux live behaviour, which a scripted smoke shrinks.

## Closing Verdict

Here's how we'll know this build is actually done. Almost everything this plan promises is machine-checkable, and — good news — the checks already have a home: this repo has a real test suite that **already tests the pij daemon** (`npm test`), plus typecheck and lint. So we don't need to build any new checking machinery; we just teach the existing suite about the three new signals.

One thing I already did, automatically: I wrote the exact "done-when" commands into this coverage file — for each promise (busy detection, the don't-step-on-a-human queue, connect/disconnect), the command whose green output proves it. When those pass, those promises are kept — no judgement calls, and whoever picks this up later sees them even after this conversation is gone.

One thing I'd like your OK on: fold these proof lines into the plan's tasks (they already essentially are — each task's "done when" is a `npm test` case), and extend the `smoke` script with one live pane-signal path. Why the live smoke: the unit tests prove the *parsers* against real captured bytes, but "a real human typing into a real pane gets their message held" is behaviour only a live run fully confirms — a scripted smoke shrinks that eyeball, it doesn't need new infrastructure. And fix-the-checker-first: if `npm test` is green but the daemon still steps on a human, the *test* is wrong — we fix the test, then the code, so that gap can never slip through again.

**In summary:** `npm test` + `npm run typecheck` + `npm run lint` will prove every deterministic promise of this build (busy bit, typing-hold + queue, connect/disconnect), all by extending the existing suite. The only human-judgement residue is confirming the live end-to-end feel of the typing-hold on a real pane — which a one-path `smoke` extension largely covers. The approval I'm asking for: add that `smoke` path (small, in-plan). Nothing here is blocked either way.
