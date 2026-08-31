# u-spawn-rpc-port falsifiers

Pre-registered before product code. The field name under test is `rpc_port_intent`: it records only that spawn emitted `--ui-server --port N`; it does not claim that Copilot bound or owns the listener.

## F1 — shipped spawn couples argv and descriptor

**Path:** shipped `pij-rs spawn` binary → authenticated `POST /v1/spawn` → `spawn_seat` → `build_spawn_plan` → `TmuxPort::{new_window}` → `SqliteRegistry::put` → shipped `pij-rs list`.

Spawn one Copilot seat and one non-Copilot control. The Copilot tmux argv must contain the exact adjacent pairs `--ui-server` and `--port N`, and its persisted descriptor must carry `rpc_port_intent: N`. The control must emit neither flag and must persist `None`. The port assertion compares descriptor content with observed launch argv rather than accepting either independently.

**Red mutation:** suppress the `--ui-server`/`--port` argv while leaving the stamp, or suppress the stamp while leaving argv. The witness must fail on the mismatch.

## F2 — shipped spawn-over-tombstone replaces the prior port

**Path:** shipped `pij-rs spawn` binary → authenticated `POST /v1/spawn` → tombstoned-id branch → fresh Rust loopback allocation → `TmuxPort::{new_window}` → `SqliteRegistry::put` → shipped `pij-rs list`.

Spawn a Copilot seat and observe old port A. Tombstone the row, then spawn the same id through the shipped binary and observe a different port B. List once more and require B again, proving no later pass re-stamps A. A live-id control must still refuse without launching.

**Red mutation:** preserve or restore A in the tombstoned-id spawn branch while leaving tombstone clearing intact. The transition must expose A after revive and fail; a sweep-only clear cannot satisfy it.

## F3 — shipped re-registration clears the prior incarnation

**Path:** shipped `pij-rs spawn` binary → real `SqliteRegistry` → shipped `pij-rs register` binary on the same seat id → `register` handler → `SqliteRegistry::put` → shipped `pij-rs list`.

Observe the spawn-time non-null value. Re-register the same id without a fresh port and observe `rpc_port_intent: None`; re-register once more and observe `None` again. It rejects a sweep-only clear because no sweep runs, and the second pass rejects later re-stamping of the stale value.

**Red mutation:** remove the explicit clear from the same-id registration path while retaining tombstone clearing. The old value must remain visible and fail the witness.

## F4 — shipped supersedes transition clears the predecessor

**Path:** shipped `pij-rs register --supersedes` binary → `register` handler’s same-process supersedes branch → `SqliteRegistry::put` predecessor → `SqliteRegistry::put` successor → `Registry::get` observation.

Seed one bound Copilot predecessor carrying `rpc_port_intent`, then register its same-process successor through the shipped CLI. The predecessor must be tombstoned and its port intent must be absent when read afterwards; the successor must not inherit it.

**Red mutation:** omit the clear in the supersedes branch. The tombstoned predecessor must retain the stale value and fail the witness.

## F5 — real SQLite upsert changes the value

**Path:** `SqliteRegistry::put` existing-row update → SQLite `ON CONFLICT DO UPDATE SET` → `SqliteRegistry::get`.

Write one descriptor with port A, write the same id with different port B, then read B through `Registry::get`. This dedicated real-adapter witness is required because `registry_contract` writes identical values and `FakeRegistry` cannot express an omitted SQL update assignment.

**Red mutation:** remove only `rpc_port_intent=excluded.rpc_port_intent` from the update list. The read must return A and fail.

## F6 — registry tombstone clears, without overstating reachability

**Path:** direct `SqliteRegistry::tombstone` → SQLite update → `SqliteRegistry::get`.

Write a port-stamped descriptor, tombstone it, then observe both the tombstone and `rpc_port_intent: None`. No shipped production caller currently invokes `Registry::tombstone`; this witness proves the port implementation, not a reachable teardown flow. The receipt must preserve that limitation.

**Red mutation:** remove only the SQL tombstone assignment that clears `rpc_port_intent`. The observed descriptor must retain the value and fail.

## F7 — absent capability stays absent

**Path:** `SeatDescriptor::new` and shipped non-Copilot `pij-rs spawn` → descriptor serialization/persistence → shipped `pij-rs list`.

A new descriptor and a non-Copilot spawn both carry `rpc_port_intent: None`; legacy rows gain a nullable column through schema migration 9. No helper in this unit interprets the field as deliverability. Unit 2 owns the read-time live-process requirement.

**Red mutation:** make the constructor or non-Copilot spawn invent a port. The absence assertions must fail.

## F8 — matching first bind preserves only the fresh incarnation

**Path:** shipped `pij-rs spawn` over a tombstoned id → descriptor with fresh `spawn_id` and `rpc_port_intent` → shipped `pij-rs register --spawn-id <matching>` → `register` handler → real `SqliteRegistry::put` → response and `Registry::get` observation; then shipped registration with no matching `spawn_id` over the same id.

The revived seat's first registration carrying the exact fresh launch `spawn_id` must preserve port B while adding its live process identity. A later registration with no matching launch id must clear B, and another read must prove old port A never reappears. Matching is explicit and non-empty: two absent ids do not authorize preservation.

**Red baseline:** the current unconditional registration reset must erase B on the matching first bind. The shipped transition witness must fail by observing `None` where B is required.

**Future mutation:** make every registration preserve the port. The unmatched second arm must retain B and fail.

## F9 — corrupt persisted ports refuse instead of narrowing

**Path:** real SQLite `seats.rpc_port_intent` → `SqliteRegistry::get` → `row_to_descriptor`.

Migration 0009 must constrain stored values to `1..=65535` or NULL. With check constraints deliberately bypassed to model an already-corrupt store, reads of `0`, `65536`, `70000`, and `-1` must return a named adapter error rather than `Some` after integer narrowing.

**Red baseline:** the current `i64 as u16` decoder returns forged present ports (`65536 → 0`, `70000 → 4464`, `-1 → 65535`) and must fail the witness.

## F10 — descriptor reconciliation updates survivor and clears alias

**Path:** real `SqliteOrchestration::reconcile_descriptors` transaction → survivor and alias SQL updates → `SqliteRegistry::get` for both rows.

Arrange on-disk survivor port X, verified survivor port Y, and alias port A. Reconcile, then observe survivor Y and alias None. This changes values on both rows so omitted SQL columns cannot pass by coincidence.

**Red baseline:** the current transaction leaves survivor X and alias A; both assertions must fail independently.

## F11 — revive preserves the displaced post-mortem in the spine

**Path:** shipped `pij-rs spawn` over a tombstoned id → shared `launch_seat` transition → daemon `EventBus`/`Spine` → descriptor overwrite.

Seed a tombstoned descriptor with reason, role, and semantic state, revive through the shipped binary, then observe an append-only event for the displaced incarnation carrying all three facts while the new live descriptor is clean.

**Red baseline:** the current revive overwrites the only row and emits no such event; event lookup must fail.

## F12 — allocator excludes ports stamped on live seats

**Path:** shipped `POST /v1/spawn` → shared `launch_seat` → injected `RpcPortAllocator` used by production composition → registry live-seat snapshot → emitted argv and persisted descriptor.

Script the allocator's first kernel candidate to equal another live seat's stamped port and its next candidate to be free. Spawn through the authenticated route and observe only the second value in argv and descriptor. A tombstoned seat's old port does not reserve the number.

**Red baseline:** the current allocator consults only the one revived descriptor and accepts the live seat's stamped candidate; the shipped path must expose that collision.

## Demonstrated red arms

All commands ran with `env -u CARGO_TARGET_DIR CARGO_INCREMENTAL=0` from the unit worktree.

| Falsifier | Deliberate mutation | Command | Observed red |
|---|---|---|---|
| F1 | SpawnPlan returned `rpc_port_intent: None` while argv still emitted the flags | `cargo test --locked -p pij-harnesses copilot_rpc_stamp_is_derived_only_from_the_exact_emitted_argv` | `left: None`, `right: Some(47781)` |
| F2 | Copilot allocation disabled only when `reviving` | `cargo test --locked -p pij-cli --test spawn shipped_spawn_revive_and_registration_transitions_replace_rpc_port_intent` | panic at `revive stamps fresh intent` |
| F3 | Same-id registration omitted its explicit clear | same shipped CLI transition test | `left: Some(52597)`, `right: None` |
| F4 | Supersedes branch omitted the predecessor clear | same shipped CLI transition test | `left: Some(60001)`, `right: None` |
| F5 | Removed only `rpc_port_intent=excluded.rpc_port_intent` from SQLite upsert | `cargo test --locked -p pij-store --test store_integration rpc_port_intent_updates_to_a_different_value_and_tombstone_clears_it` | old `Some(47781)` remained instead of `Some(51948)` |
| F6 | Removed only `rpc_port_intent = NULL` from SQLite tombstone | same real-store test | tombstone retained `Some(51948)` instead of `None` |
| F7 | Constructor invented `Some(1)` | same real-store test | closed-default assertion saw `Some(1)` instead of `None` |
| F8/M7 | Forced the spawn-id predicate never to match | shipped CLI transition test | matching first bind cleared fresh `Some(61004)` to `None` |
| F8/M6 | Forced the spawn-id predicate always to match | shipped CLI transition test | unmatched later registration retained stale `Some(61004)` instead of `None` |
| F9a | Removed the migration range constraint (pre-fix baseline) | `cargo test --locked -p pij-store --test store_integration rpc_port_intent_schema_refuses_zero_negative_and_out_of_range_values` | invalid `0` write succeeded |
| F9b | Kept narrowing decoder (pre-fix baseline) | `cargo test --locked -p pij-store --test store_integration corrupt_rpc_port_intent_is_a_named_read_error_never_a_narrowed_presence` | corrupt `0` decoded as `Some(0)` |
| F10 alias | Reconciliation omitted alias clear (pre-fix baseline) | `cargo test --locked -p pij-store --test orchestration descriptor_merge_is_atomic_and_retains_both_inputs_and_mismatches` | alias retained `Some(47781)` |
| F10 survivor | Removed only survivor `rpc_port_intent` update | same real-orchestration test | on-disk `Some(41001)` remained instead of verified `Some(51948)` |
| F11 baseline | Revive emitted no post-mortem event | shipped CLI transition test | no `seat.revive-postmortem` event existed |
| F11/M8 | Moved post-mortem publication after descriptor overwrite | shipped CLI transition test | revive failed because registry truth was live and the post-mortem was already gone |
| F12 | Passed only the revived row's old port to the scripted allocator | shipped CLI transition test | allocator returned another live seat's stamped `61001` instead of free `61003` |

Instrument corrections: the first F1 command included `-- --exact` without the module-qualified test name and ran zero tests; it was discarded. The first F12 attempt used a non-object-safe async trait and failed compilation before exercising allocation; it was discarded. The first M8 move borrowed a moved `SeatId` and likewise failed compilation; after making that mutation executable, the behavioral red above was recorded.
