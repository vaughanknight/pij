# O-prime rulings log (pij-relative-panther → pij-falling-outside)

Durable record of rulings as they land (iron rule 1). No acks owed unless stated.

## 2026-08-28 — on the 29b deps-fold scope notes
1. **29b-rest rescope CONFIRMED** — a behavioural assertion on the notifier wiring inside the **booted** `runDaemon`, NOT "a boot test" (one already exists; `daemon.bootstrap.test.ts` calls runDaemon 6×, 7 tests execute the wiring, assert nothing). Scope for 29b-rest.
2. **W3 rides the log-sink fold in item 24's PR** — add the assertion (bad `pijHome` → capture silently drops the bridge log; reviewer measured 99→58 bytes, evidence TRUE→FALSE) **there**, as a fold on the log-sink work, before the item-24 PR ships. → tracked in `reports/item-24-pr-assembly.md`.
3. **12-FX (mine, AFTER item 30)** — `pij-skill-check.test.ts` flaky 1/5 under full-suite parallelism. E22 discipline: **keep the failing run's log; fix the isolation, never retry into green.** Fix = isolate/serialize that test, not re-run.
4. **pwsh ENOENT is environmental** — `harness/scripts/release-age-policy.test.ts` (spawnSync pwsh). **Mark it skipped-with-reason** (it currently FAILS when pwsh absent, not skipped). Small harness-hygiene task; not blocking; sequence with the tail.

Also affirmed: holding the 29b-T001 PR for the W1+W2 hardening + oracle re-run is correct.
