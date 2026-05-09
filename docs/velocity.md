# Velocity log

Wall-clock per phase. **Goal: each successive extension is faster than the
last.** If it isn't, the harness has a leak.

Compounding is judged against the v1 build wall-clock baseline captured
below — **not** against any fixed minute target. Earlier "<6 min", "<30
min" thresholds were unmeasured intuition (see spec § Clarifications
session 2026-05-09b); they have been replaced with measurement-anchored
hypotheses.

| Phase | Date | Duration | Output | Notes |
|-------|------|----------|--------|-------|
| 0 — fs2 multi-graph wiring | 2026-05-09 | ~5 min | `pi-mono` graph queryable from pij | one-time |
| 1 — research (8 parallel agents + synthesis) | 2026-05-09 | ~60 min | dossier + 8 findings + 2 external | one-time |
| 2 — workshops 001+002 | 2026-05-09 | ~30 min | distribution + dev-loop refs | |
| 3 — workshop 003 (T1 → T2) | 2026-05-09 | ~50 min | `scratch` design + P1–P10 | |
| 4 — workshop 004 (harness charter) | 2026-05-09 | ~50 min | full harness scaffolds + 1244-line design doc | |
| 4b — spec + plan + clarify + validate (002-pij-harness) | 2026-05-09 | ~90 min | clarified spec, lean plan, flight plan, validation record | meta — harness-of-the-harness |
| 5 — build the harness (Phase 1–6 of 002-pij-harness) | 2026-05-09 | TBD (in flight) | working `npm run new`, smoke, ledgers, CI | **v1 baseline — measure during build** |
| 6 — extension #2 (TBD — likely `scratch`) | TBD | TBD | working `/scratch` (or chosen first ext) | **velocity hypothesis test** — see below |

## Hypothesis (measurement-anchored)

After the harness ships (end of phase 5 above), **extension #2's
wall-clock from `npm run new -- <name>` to a successful `/<name>`
command registering in pi is materially shorter than v1's equivalent
path** (the same chain measured during phase 5).

- **Provisional target**: extension #2 ≤ 50% of the v1 equivalent path.
- **Falsifiable**: if extension #2 is not faster than v1's baseline
  (whatever that turns out to be), file a `D-NNN` explaining where the
  time went and **encode the fix** before extension #3.
- **Specific minute target**: TBD — set when the v1 baseline is known.

## Measurement protocol

For extension #2 (and any future velocity test):

- **Start**: timestamp when `npm run new -- <name>` is invoked.
- **End**: timestamp when the user (or the smoke runner) confirms
  `/<name>` registers in pi (a real toast, not just the command being
  typed).
- **What's included**: scaffold + any code edits + `npm run typecheck`
  clean + `npm test` green + `/<name>` registers in pi.
- **What's excluded**: time the implementor spent reading docs (that's a
  separate measurement of "onboarding cost", logged elsewhere).
- **Where it lands**: a new row in this table with the actual numbers
  and any difficulties encountered.

## Compounding evidence (filled retroactively)

| Comparison | v1 baseline | extension #2 | Δ | Verdict |
|------------|-------------|--------------|---|---------|
| `npm run new` → command-registered | TBD | TBD | TBD | TBD |

If "Δ" is positive (extension #2 faster), the harness is compounding.
If negative, the harness has a leak — find it, encode the fix.
