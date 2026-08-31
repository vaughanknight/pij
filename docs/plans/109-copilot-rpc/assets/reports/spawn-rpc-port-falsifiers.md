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
