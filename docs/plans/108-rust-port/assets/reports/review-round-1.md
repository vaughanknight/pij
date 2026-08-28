# Review round 1 — findings, fixes, evidence

**Reviewer**: `pij-right-wasp` (copilot/gpt-5.6-sol, high, read-only) · verdict
**CHANGES**, 6 blocking + 1 should-fix, 2026-08-28
**PM**: `pij-revolutionary-lungfish` · **All seven accepted; none refuted.**

Every finding was correct, and two of them were defects my own tests asserted the
opposite of. That is the review earning its cost: a cross-model reader with the
settled guide in hand found contradictions that fifty passing tests did not.

## Verdict per finding

| # | severity | finding | disposition |
|---|---|---|---|
| 1 | blocking | key published 0644 over an existing file; a failed boot overwrote the live daemon's key | fixed |
| 2 | blocking | `HarnessPort::busy` missing; `thinking` modelled as `Option<Vec>` against the corrected guide | fixed |
| 3 | blocking | composition root wired 2 of 7 ports while `offline` was computed from 7 | fixed |
| 4 | blocking | watchdog eligibility contradicted the settled guide, and a test locked it in | fixed |
| 5 | blocking | `require_current_schema` called by nothing | fixed |
| 6 | blocking | registry event + row were separate autocommits; a refused tombstone left a phantom event | fixed |
| 7 | should-fix | allow-list check one-directional: unused permissions never reported | fixed |

## 1 — key publication (`crates/daemon/src/auth.rs`)

Two distinct bugs behind one line. `OpenOptions::mode()` applies **only to a file
it creates**, so opening an existing 0644 `daemon.key` with `.mode(0o600)` kept
0644. And publishing before the bind meant a second daemon that then lost the port
race had already replaced a healthy daemon's credential.

Fixed by splitting publication into two types: `stage_key` writes to a unique
`daemon.key.staging.<pid>` with `create_new(true)` (which refuses to reuse a file
rather than adopting its mode), and `StagedKey::publish` renames it into place
**after** a successful bind. `StagedKey` has a `Drop` that removes an unpublished
staging file, so a failed boot leaves nothing behind. The ordering property still
holds: `bind` only opens the listen socket; no request is answered until
`axum::serve`, which runs after publication.

```
=== finding 1a: boot over a pre-existing 0644 key ===
before: -rw-r--r--   after: -rw-------

$ ./target/debug/pij-rs ping --addr 127.0.0.1:7463 --state-dir /tmp/pij-rs-fl3
pij ping: ok — healthy

=== finding 1b: a failed second boot must not touch the live key ===
live key: 18f381b2f5210b1f…
$ ./target/debug/pij-rs daemon --bind 127.0.0.1:7463 --state-dir /tmp/pij-rs-fl3   # same port
pij-rs: daemon: could not bind 127.0.0.1:7463 (Address already in use (os error 48)) — another daemon may already hold it
exit=1
key after failed boot: 18f381b2f5210b1f… · unchanged: YES
$ ping again (the live daemon must still authenticate)
pij ping: ok — healthy
state dir contents: daemon.key
```

Regressions: `a_pre_existing_lax_key_file_is_replaced_not_reused`,
`a_failed_boot_cannot_brick_the_running_daemon` (asserts the live key byte-for-byte
unchanged, the live daemon still authenticating, and no staging litter).

## 2 — frozen seam drift (`crates/core/src/{ports,model}.rs`)

`busy(pane) -> bool` is in the settled `HarnessPort` (services.dd.md:45) and I had
simply dropped it. Restored, with a scriptable `FakeHarness::script_busy` and a
test.

`thinking` was `Option<Vec<String>>` with a doc comment claiming absent and empty
are different facts — the exact opposite of the correction *I* filed and the prime
ruled the same day. It is now `thinking_levels: Vec<String>`, empty means no
levels, and the comment records why three upstream encodings collapse to one.

The lesson is sharper than the fix: **I wrote the correction, the prime ruled it,
and then my own type asserted the pre-ruling belief.** A ruling that does not
change code is a ruling that did not land.

## 3 — the composition root did not compose (`crates/daemon/src/lib.rs`)

`Services` carried `registry` and `spine`; `offline` was computed from all seven
config choices. So `transport = real` reported `offline = false` while constructing
no transport at all — a composition root lying about what it composed, in the very
file later waves copy.

All seven ports are now wired, fakes by default. The four whose real adapters land
in later waves **refuse explicitly**, naming the unit that will ship them
(`u-uds, wave 3`), so "not built yet" is a boot-time fact rather than a silent
no-op. Each `Real` arm is the exact one-line site that wave replaces.

## 4 — the watchdog table asserted the opposite of the ruling

services.dd.md: `eligible(seat) excludes waiting|hold|blocked|question`. My
`SemanticState::nudgeable` returned true for `Waiting`, and
`watchdog_eligibility_is_a_decision_table_not_a_timeout` asserted that it did. The
test passed. It was locking in the contradiction, which is the definition of a
vacuous test with extra steps.

Both corrected; the comment names the incident so the next reader knows the table
is a ruling rather than an opinion.

## 5 — a schema guard nothing called (`crates/store/`)

`require_current_schema` existed, was exported, and was invoked only by tests.
Meanwhile the module doc claimed "every db-touching command runs a fast schema
check". It is now called by every public operation of `Registry`, `Spine` and
`Queue`. Cost is one `PRAGMA user_version` per call — a cached page, no join — and
the comment records that the fix for any future profile hit is a cached generation
counter, never dropping the check.

Regression: `a_schema_that_changes_under_a_live_pool_stops_the_next_operation`
bumps `user_version` under an open pool (what another binary migrating the same
file looks like) and asserts get/put/tombstone/append all refuse.

## 6 — registry writes were not atomic (`crates/store/src/registry.rs`)

The spine event and the row were separate autocommit statements, so tombstoning an
absent seat returned `NoRegistryEntry` **after** committing an event that said it
happened. Both `put` and `tombstone` now run in one `BEGIN IMMEDIATE`
transaction, with an explicit rollback on zero affected rows.

Regressions: `a_refused_tombstone_leaves_no_trace_in_the_spine`,
`a_successful_put_writes_its_event_and_its_row_together`.

## 7 — the allow-list only checked one direction

Real edges were judged against the list; the list was never judged against
reality. A removed dependency stayed pre-approved, so re-adding it later would
pass without the reviewed line the allow-list exists to force. New
`Violation::StaleRule` reports unused permissions, and both arch fixtures were
regenerated from the live 35-edge graph (the stale 4-edge fixture the reviewer
spotted was itself an instance of the bug).

Regression: `a_permission_nobody_uses_is_reported_as_drift`. The fixtures now need
regenerating whenever the graph changes — the command is in the test file's doc
comment, and the failure is a deliberate review event, not friction.

## Gate after the fixes

```
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

Test count 69 → 84. Nothing was fixed by relaxing an assertion: every change moved
the CODE, and three assertions got stricter.

## The reviewer's own measurements, kept

Recorded because they are evidence and because one of them was an independent
mutation check of my mutation report:

* `pij-gate` all five stages PASS, arch 8 crates / 33 edges / 0 violations.
* SQL appears in production code only under `crates/store`; no tmux invocation
  anywhere.
* `pocs/_template` builds standalone and prints its table.
* Mutation spot-check: `BEGIN IMMEDIATE` → `BEGIN` made
  `parallel_claimers_partition_the_work_with_no_double_claim` fail with SQLite
  codes 5/517, restored to green. Tree left clean (`git status --short` and
  `git diff --check` both empty).
* Non-wave note, correctly not attributed to this diff: `harness checks` cannot
  run TS sensors in this worktree (`tsx/biome/vitest: command not found`).
