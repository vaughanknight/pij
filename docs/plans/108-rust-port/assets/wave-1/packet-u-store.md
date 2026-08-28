# Coder packet — u-store finish (wave 1)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast-1m --effort high`
(the 1M selector: this unit reads TS store shapes while writing migrations)
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w1-store` · branch `s108/w1-store`
**Common contract (read first)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-1/COMMON.md`
**PM**: `pij-revolutionary-lungfish` · **Tier**: store integration against a real
database, plus the shared contract suites

## Mission

Take the wave-0 store skeleton to the **full** `Registry` + `Spine` contract. Wave
0 proved the mold — migrations, boot self-migration, directional skew refusal,
one atomic write path. You make it a store the rest of the port can rely on.

## Scope — the only paths you write

* `crates/store/src/{registry,spine,migrate}.rs` — **not** `queue.rs` (another
  coder owns it this wave).
* `crates/store/migrations/**` — new files only. **Never edit a migration that
  exists**; sqlx checksums them and an edited migration is a corrupt store on
  every machine that already ran it.
* `crates/store/src/lib.rs` — `pub mod` lines only.
* `crates/store/tests/store_*.rs` — your tests (`queue.rs` is not yours).
* `crates/testkit/src/contract.rs` — extend the shared suites (contracts are
  extensible; fakes are frozen).
* `crates/testkit/arch-allowlist.toml` — your reviewed row(s).

## What to build

1. **Every `Registry` and `Spine` promise, enumerated.** The suites in
   `pij_testkit::contract` are the definition; extend them until they cover the
   whole surface, then make SQLite pass them. The `FakeRegistry` must keep passing
   the same suite — if the fake and SQL disagree, exactly one is wrong and the
   suite says which.
2. **Crash-mid-write** (services.dd names it): prove that an interrupted write
   leaves the store readable and consistent — no half-row, no spine event whose
   registry row never landed. Wave 0 fixed the non-atomic `put`/`tombstone`; your
   job is the test that would have caught it, and any remaining path like it.
3. **Single-writer at the store level**, stated and proven rather than assumed:
   concurrent writers must serialise, and the losing writer must get a *clear*
   outcome, never a corrupt read. `BEGIN IMMEDIATE` — COMMON §1.
4. **Absent ≠ null in every read.** A row that does not exist, a column that is
   NULL, and a column holding an empty string are three different facts. The
   TS `E-NOREG` collapse is the incident this rule exists for.
5. **Baselines** (services.dd: "registry, spine, baselines"): if you conclude
   baselines belong to a later unit, say so in your ack with a reason — do not
   silently drop a word from your own contract.

## Done bar

* Gate six stages green.
* Contract suites cover the enumerated surface, run against **both** the fake and
  SQLite.
* Crash-mid-write test, concurrency test, and the absent/null/empty distinction
  each asserted.
* Mutation evidence on at least: the atomicity rollback, and one absent-vs-null
  read. Break it, watch the named test fail, restore, transcript in the report.
* No edited migration; new ones only, with `user_version` bumped and the skew
  rules still proven in both directions.

## Watch for

* `require_current_schema` is called by **every** public operation (wave-0 review
  finding 5). Anything you add is another public operation.
* `user_version` is a *cache* of sqlx's `_sqlx_migrations` ledger, reconciled at
  boot. Do not treat it as the source of truth.
* Wave 0's per-operation `PRAGMA` cost is deliberate. If you want it cheaper, the
  answer is a cached generation counter invalidated on migration — never dropping
  the check. That is a contract change: ask first.
