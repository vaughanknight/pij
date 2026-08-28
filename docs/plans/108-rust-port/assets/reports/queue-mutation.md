# tk-f8ff — queue primitive: mutation evidence (R4)

**Seat**: pij-revolutionary-lungfish (PM) · 2026-08-28 ·
**Toolchain**: rustc 1.98.0 (88d9e12ae) / cargo 1.98.0 (797e8a9bc) · Avail 200Gi

`cargo-mutants` is not installed and the prime ruled manual mutation acceptable
for wave 0 (Q5). Manual here means the same discipline by hand: **break the rule,
watch a NAMED test die, restore, watch it pass.** A test that survives its own
mutant asserts nothing, and the two vacuous passes fs3 caught this way (mining
note 7) are the reason this is a gate rather than a nicety.

Four mutants, one per invariant the queue actually promises. All four were killed.

## Mutant 1 — the dedupe index stops being partial

Dropping `WHERE state IN ('pending','running')` makes a dedupe key unique for the
life of the database: the same work can never be scheduled again after it
completes. This is the plausible bug — the index still exists, still says UNIQUE,
and the happy path still passes.

```
=== MUTATION 1 — drop the partial predicate: dedupe becomes FOREVER, not per-burst ===
--- index before
CREATE UNIQUE INDEX jobs_dedupe_live
    ON jobs (dedupe_key)
    WHERE state IN ('pending', 'running');

--- index after (mutated)
CREATE UNIQUE INDEX jobs_dedupe_live
    ON jobs (dedupe_key);


test a_failed_job_keeps_its_reason_and_frees_its_entity ... FAILED
test claim_respects_the_kind_filter_and_an_empty_filter_claims_nothing ... ok
test acking_a_job_nobody_is_running_is_reported_not_swallowed ... ok
test the_sqlite_queue_honours_the_same_contract_the_fake_does ... ok
test an_acked_key_is_free_again_so_dedupe_is_per_burst_not_forever ... FAILED
test one_entity_is_worked_by_one_worker_at_a_time ... ok
test n_rapid_submits_collapse_to_one_row ... ok
test parallel_claimers_partition_the_work_with_no_double_claim ... ok
test result: FAILED. 6 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.24s
exit=101

=== restore, re-run ===
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.04s
```

Killed by `an_acked_key_is_free_again_so_dedupe_is_per_burst_not_forever` and
`a_failed_job_keeps_its_reason_and_frees_its_entity` — the two tests that exist
precisely because "collapse duplicates" and "poison the key for ever" look
identical until something finishes.

## Mutants 2–4

```
=== MUTATION 2 — remove the dedupe conflict clause: every submit creates a row ===
test the_sqlite_queue_honours_the_same_contract_the_fake_does ... FAILED
test n_rapid_submits_collapse_to_one_row ... FAILED
test acking_a_job_nobody_is_running_is_reported_not_swallowed ... ok
test an_acked_key_is_free_again_so_dedupe_is_per_burst_not_forever ... FAILED
test claim_respects_the_kind_filter_and_an_empty_filter_claims_nothing ... ok
test a_failed_job_keeps_its_reason_and_frees_its_entity ... ok
test one_entity_is_worked_by_one_worker_at_a_time ... ok
test parallel_claimers_partition_the_work_with_no_double_claim ... ok
test result: FAILED. 5 passed; 3 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.06s

=== MUTATION 3 — claim without the serial-key exclusion: two workers on one entity ===
test acking_a_job_nobody_is_running_is_reported_not_swallowed ... ok
test claim_respects_the_kind_filter_and_an_empty_filter_claims_nothing ... ok
test a_failed_job_keeps_its_reason_and_frees_its_entity ... ok
test an_acked_key_is_free_again_so_dedupe_is_per_burst_not_forever ... ok
test one_entity_is_worked_by_one_worker_at_a_time ... FAILED
test the_sqlite_queue_honours_the_same_contract_the_fake_does ... FAILED
test n_rapid_submits_collapse_to_one_row ... ok
test parallel_claimers_partition_the_work_with_no_double_claim ... ok
test result: FAILED. 6 passed; 2 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.05s

=== MUTATION 4 — BEGIN IMMEDIATE reverted to the default deferred transaction ===
claim: Adapter { adapter: "store/queue", message: "error returned from database: (code: 5) database is locked" }
claim: Adapter { adapter: "store/queue", message: "error returned from database: (code: 517) database is locked" }
test a_failed_job_keeps_its_reason_and_frees_its_entity ... ok
test acking_a_job_nobody_is_running_is_reported_not_swallowed ... ok
test an_acked_key_is_free_again_so_dedupe_is_per_burst_not_forever ... ok
test claim_respects_the_kind_filter_and_an_empty_filter_claims_nothing ... ok
test n_rapid_submits_collapse_to_one_row ... ok
test one_entity_is_worked_by_one_worker_at_a_time ... ok
test parallel_claimers_partition_the_work_with_no_double_claim ... FAILED
test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s
test the_sqlite_queue_honours_the_same_contract_the_fake_does ... ok
worker panicked: JoinError::Panic(Id(110), "claim: Adapter { adapter: \"store/queue\", message: \"error returned from database: (code: 5) database is locked\" }", ...)

=== restore, re-run ===
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.20s
```

* **Mutant 2 — no `ON CONFLICT DO NOTHING`**: every submit inserts, so N rapid
  submits become N units of work. Killed by `n_rapid_submits_collapse_to_one_row`,
  the acked-key test, and the SHARED contract suite — which matters: the contract
  the fake passes caught a defect in the SQL implementation, which is the whole
  argument for writing the suite once.
* **Mutant 3 — claim without the serial-key exclusion**: two workers take two jobs
  for the same entity at once. Killed by
  `one_entity_is_worked_by_one_worker_at_a_time` and the contract suite.
* **Mutant 4 — `BEGIN IMMEDIATE` reverted to the default deferred transaction**:
  killed by the contention test with `(code: 5) database is locked`.

## What mutant 4 documents (found the hard way, before it was a mutant)

The contention test failed on first run with `database is locked` while every
retry knob was already correct — sqlx defaults `busy_timeout` to 5s. The reason
the timeout bought nothing: a **deferred** transaction takes a READ lock and
upgrades on its first write, and when two of them try to upgrade at once SQLite
returns `SQLITE_BUSY` **immediately without invoking the busy handler**, because
no amount of waiting can resolve a deadlock in which both parties hold read locks.
`BEGIN IMMEDIATE` takes the write lock up front, so the second writer waits and
the timeout finally means something.

Worth stating plainly because the symptom lies: it presents as "SQLite does not
handle concurrency", which invites the wrong fix (serialise everything, or add a
retry loop that also cannot help). The comment on `SqliteQueue::begin_write`
carries this so a wave-1 coder does not rediscover it.

## Verdict

| invariant | mutant | killed by |
|---|---|---|
| dedupe is per-burst, not for ever | partial predicate dropped | acked-key-is-free, failed-job-frees-entity |
| N submits collapse to one row | conflict clause removed | n-rapid-submits, contract suite |
| one running job per entity | serial-key exclusion removed | one-entity-one-worker, contract suite |
| concurrent claims do not deadlock | BEGIN IMMEDIATE reverted | parallel-claimers (set equality) |

Restored tree: `cargo test -p pij-store --test queue` → 8 passed, 0 failed.
