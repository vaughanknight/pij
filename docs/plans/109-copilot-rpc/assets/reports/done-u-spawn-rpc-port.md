# u-spawn-rpc-port — delivery receipt

**Branch:** `s109/u-spawn-rpc-port`  
**Mechanism commits:** `3cbd2820` (initial), `70f13700` (round-1 fixes), `95d86a91` (narrowed-refusal contract test)  
**Scope:** descriptor amendment and spawn/revive lifecycle only. No Copilot transport code landed. The TypeScript runtime is untouched.

## Migration story — load-bearing

**Every pre-existing Copilot seat is permanently a pointer seat until respawn.** The fleet does not upgrade itself, and restarting the daemon does not add this capability. Migration 0009 adds a nullable column; every existing row therefore reads `rpc_port_intent: None`. Only a later spawn or spawn-over-tombstone revive can emit `--ui-server --port N` and stamp a value.

## What landed

- `SeatDescriptor.rpc_port_intent: Option<u16>` names exactly what the writer knows: spawn emitted Copilot's `--ui-server --port N`. It does **not** claim that Copilot bound the port, that a listener remains, or that the current process owns it.
- Rust allocates the port by binding `127.0.0.1:0`, reading the assigned port, then releasing the reservation before Copilot starts. The bind-to-launch TOCTOU is acknowledged rather than hidden; **NEVER BOUND** remains distinct from a dead/recycled listener.
- `build_spawn_plan` emits the two flags only for Copilot and derives the descriptor stamp back from the exact argv. Port zero and a port supplied to another harness refuse.
- `POST /v1/spawn` keeps live-id refusal unchanged. A tombstoned id is now the shipped revive transition: it gets a fresh allocation, launches a fresh pre-bind descriptor with `proc: None`, and overwrites the old row.
- Registration preserves the fresh port only while binding a pre-bind descriptor whose non-empty `spawn_id` exactly matches the claim. Register-again without that match clears it; M7 (never match) and M6 (always match) prove both opposing arms.
- The same-process `supersedes` branch clears the predecessor's port before persisting its tombstone. Descriptor reconciliation likewise updates the verified survivor's port and clears the retired alias.
- `SqliteRegistry::tombstone` clears the column in the same SQL act that writes terminal truth. **There is currently no shipped production caller of `Registry::tombstone`; this test proves the adapter branch, not a reachable teardown flow.** Reachable terminal handling is the registration supersedes branch and spawn-over-tombstone transition above.
- Before spawn-over-tombstone replaces the live row, `seat.revive-postmortem` durably preserves the displaced reason, role, semantic state, and tombstone timestamp in the spine. The publisher re-reads registry truth at publication time, so moving it after overwrite fails rather than relocating an empty claim.
- The allocator excludes intents stamped on every live registry seat and explicitly excludes the displaced row's old value. Unrelated tombstoned rows do not reserve their old ports. Unit 2 still owns endpoint/session identity verification after connect.
- Schema 9 constrains the column to NULL or `1..=65535`, and the read path rejects corrupt values rather than narrowing `i64` into a forged present `u16`. INSERT, bind, and `ON CONFLICT DO UPDATE SET` all carry the column. The dedicated real-SQLite witness changes A to B before reading because the shared registry contract writes equal values and cannot detect a frozen upsert column (F0-8).
- `launch_seat(&AppState, SpawnRequest, ExistingSeatPolicy, command_name)` is the single private launch transition for the separately-owned `/v1/revive` surface. Allocation, argv-derived stamping, fresh pre-bind construction, rollback, and persistence remain here; the route must call it with `ExistingSeatPolicy { allow_absent: false }` and must never stamp independently.
- `pij-rs register --supersedes <id>` now exposes the already-shipped daemon branch so its transition can be driven through the shipped CLI.

## Intent versus possession

Carry intent, never possession. `harness`, folder, model, effort, parent, and inbound-setting intent survive a revive. The prior incarnation's `rpc_port_intent` and `proc` do not: revive allocates a new port and starts pre-bind. That fresh intent then survives only the matching first bind; an unmatched later registration clears it.

The live-process rule is a **read-time obligation owned by unit 2**. Unit 1 ships no `can_deliver`-adjacent helper. A future consumer must refuse this port unless the descriptor also carries a currently live process identity.

The absence model is therefore four-way:

1. `rpc_port_intent: None`: never launched with the flags; permanent pointer seat until respawn.
2. Intent present but Copilot never bound: retry is pointless.
3. Listener absent after a previously live seat died or the port was recycled: transient-or-stale.
4. Listener live but session absent: defect, not a routing outcome.

## Transition proof

`shipped_spawn_revive_and_registration_transitions_replace_rpc_port_intent` drives the shipped binary and authenticated router against a real `SqliteRegistry`:

1. Spawn Copilot; observe port A in both fake-tmux argv and the persisted descriptor.
2. Prove a second spawn over the non-tombstoned id still refuses and launches nothing.
3. Tombstone and observe the field absent.
4. Bind A with an unrelated listener, spawn the tombstoned id, observe different port B.
5. Read the descriptor again and observe B, proving no later pass re-stamped A; read the real spine and observe the displaced reason, role, and semantic state.
6. Register with the matching fresh `spawn_id`; observe B preserved while `proc` becomes present.
7. Register again without a matching `spawn_id`; observe `None`, repeat the pass, and prove neither A nor B reappears.
8. Drive `pij-rs register --supersedes`; observe predecessor and successor ports absent.
9. Drive real descriptor reconciliation; observe the verified survivor port updated and the alias cleared.

The field is observed after every act. No assertion treats execution of a branch as evidence that persistence happened.

## Falsifier evidence

Pre-registration and demonstrated red mutations are committed in `spawn-rpc-port-falsifiers.md`. They cover argv/stamp coupling, fresh revive, correlated first bind, unmatched later clearing, supersedes, SQLite upsert/tombstone/range validation, descriptor reconciliation, post-mortem payload and ordering, live-seat port exclusion, and conservative absence.

The critical opposing mutations both fired:

- M7 forced the spawn-id predicate never to match: the matching first bind erased `Some(61004)` and went red.
- M6 forced it always to match: register-again retained `Some(61004)` and went red.
- M8 moved post-mortem publication after overwrite: registry truth was already live, so revive went red before it could publish a forged/empty history event.

Instrument errors are disclosed in the falsifier file: a zero-test `--exact` filter, a non-object-safe first allocator seam, and a moved-value first M8 mutation were all discarded before evidence was recorded.

## Verification

All Rust commands explicitly unset `CARGO_TARGET_DIR`, set `CARGO_INCREMENTAL=0`, and used this worktree's default `target/`.

- `cargo test --locked -p pij-cli --test spawn shipped_spawn_revive_and_registration_transitions_replace_rpc_port_intent` — 1 passed against a real registry and real spine.
- `cargo test --locked -p pij-store --test store_integration rpc_port_intent` — 3 passed, covering changed-value upsert, schema constraint, corrupt-read refusal, and tombstone clear.
- `cargo test --locked -p pij-store --test orchestration descriptor_merge_is_atomic_and_retains_both_inputs_and_mismatches` — 1 passed.
- `PATH="$HOME/.cargo/bin:$PATH" cargo run --locked -p pij-testkit --bin pij-gate` at `95d86a91` — all six stages green: toolchain 1.98.0, lock, fmt, clippy, test, architecture (9 crates, 0 violations).

Instrument correction: the first gate invocation resolved Cargo to `/opt/homebrew/bin/cargo` and correctly failed only the toolchain stage (`rustc 1.95.0` versus pin `1.98.0`); lock, fmt, clippy, test, and architecture were already green. The required PATH from the reviewer packet selected the rustup toolchain and the complete rerun passed.

`harness checks` remains unavailable in this linked worktree as disclosed by the plan-108 reviewer packet: it returned 8 failures. The visible sensor details were `local-paths` exit 127, `typecheck` exit 2, `lint` exit 127, and `test` exit 127; the command output truncated the remaining details. This is a known proof-surface limitation, not presented as a green gate. The Rust `pij-gate` above is the ruled worktree gate and passed in full.

## Composer-owned derived files

- `Cargo.lock`: no change required and not committed.
- Architecture fixtures: no change required and not committed.
- `0009_copilot_rpc_port_intent.sql` is the source migration required by schema 9, not a generated fixture.
