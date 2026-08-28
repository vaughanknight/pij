# O-prime rulings log (pij-relative-panther → pij-falling-outside)

Durable record of rulings as they land (iron rule 1). No acks owed unless stated.

## 2026-08-28 — on the 29b deps-fold scope notes
1. **29b-rest rescope CONFIRMED** — a behavioural assertion on the notifier wiring inside the **booted** `runDaemon`, NOT "a boot test" (one already exists; `daemon.bootstrap.test.ts` calls runDaemon 6×, 7 tests execute the wiring, assert nothing). Scope for 29b-rest.
2. **W3 rides the log-sink fold in item 24's PR** — add the assertion (bad `pijHome` → capture silently drops the bridge log; reviewer measured 99→58 bytes, evidence TRUE→FALSE) **there**, as a fold on the log-sink work, before the item-24 PR ships. → tracked in `reports/item-24-pr-assembly.md`.
3. **12-FX (mine, AFTER item 30)** — `pij-skill-check.test.ts` flaky 1/5 under full-suite parallelism. E22 discipline: **keep the failing run's log; fix the isolation, never retry into green.** Fix = isolate/serialize that test, not re-run.
4. **pwsh ENOENT is environmental** — `harness/scripts/release-age-policy.test.ts` (spawnSync pwsh). **Mark it skipped-with-reason** (it currently FAILS when pwsh absent, not skipped). Small harness-hygiene task; not blocking; sequence with the tail.

Also affirmed: holding the 29b-T001 PR for the W1+W2 hardening + oracle re-run is correct.

## 2026-08-28 — PR #30 merged + item-24 base
- **PR #30 (item 29b-T001) MERGED → main ae7356b** (o-prime verified at merge product: 4121/0, tsc 0, skill-check 0, +6 tests). Item 29b-T001 DONE.
- **Restart #6 now gated on item 24 alone.**
- **Item-24 PR bases on ae7356b.** B1/B2/W3 fold affirmed (report-once + production-path sensor + W3), then re-review, then PR.

## 2026-08-28 — HUMAN RULING (Vaughan, verbatim "Yes"), relayed by o-prime
**Item 30 must land BEFORE the release tag.** Now a pre-tag item (was tail).
Dispatch sequencing for this stream:
- Dispatch item 30 to the coder **the MOMENT the item-24 PR is OPEN** — do NOT wait for item-24's merge.
- Base item-30's branch on **item-24's PR head**; rebase onto main after item 24 merges.
- If item-30's PR opens within ~1 h of item-24's merge, ONE restart (#6) carries both.

## 2026-08-28 — PR #32 merged; restart-6 sequencing
- **PR #32 (item 24) MERGED → main f3016b3** (o-prime verified at merge product 716c244: 4148/0, tsc 0, skill-check 0, +20 tests). Item 24 DONE.
- **Rebase item 30 onto f3016b3 now**; item-30's PR is the LAST thing before the restart-6 baton (o-prime holds the ≤1 h ask for it).
- **Order after item 30**: 12-FX (skill-check flake isolation, mine), then HOLD 24b for the post-restart measurement (residual>0 trigger).
