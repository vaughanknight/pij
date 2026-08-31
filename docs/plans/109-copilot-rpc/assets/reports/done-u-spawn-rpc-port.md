# u-spawn-rpc-port — delivery receipt

**Branch:** `s109/u-spawn-rpc-port`  
**Mechanism commit:** `3cbd2820`  
**Scope:** descriptor amendment and spawn/revive lifecycle only. No Copilot transport code landed. The TypeScript runtime is untouched.

## Migration story — load-bearing

**Every pre-existing Copilot seat is permanently a pointer seat until respawn.** The fleet does not upgrade itself, and restarting the daemon does not add this capability. Migration 0009 adds a nullable column; every existing row therefore reads `rpc_port_intent: None`. Only a later spawn or spawn-over-tombstone revive can emit `--ui-server --port N` and stamp a value.

## What landed

- `SeatDescriptor.rpc_port_intent: Option<u16>` names exactly what the writer knows: spawn emitted Copilot's `--ui-server --port N`. It does **not** claim that Copilot bound the port, that a listener remains, or that the current process owns it.
- Rust allocates the port by binding `127.0.0.1:0`, reading the assigned port, then releasing the reservation before Copilot starts. The bind-to-launch TOCTOU is acknowledged rather than hidden; **NEVER BOUND** remains distinct from a dead/recycled listener.
- `build_spawn_plan` emits the two flags only for Copilot and derives the descriptor stamp back from the exact argv. Port zero and a port supplied to another harness refuse.
- `POST /v1/spawn` keeps live-id refusal unchanged. A tombstoned id is now the shipped revive transition: it gets a fresh allocation, launches a fresh pre-bind descriptor with `proc: None`, and overwrites the old row.
- Same-id re-registration clears `rpc_port_intent`; a registration with no fresh allocation cannot inherit a prior incarnation's endpoint intent.
- The same-process `supersedes` branch clears the predecessor's port before persisting its tombstone. The successor inherits neither port nor process possession.
- `SqliteRegistry::tombstone` clears the column in the same SQL act that writes terminal truth. **There is currently no shipped production caller of `Registry::tombstone`; this test proves the adapter branch, not a reachable teardown flow.** Reachable terminal handling is the registration supersedes branch and spawn-over-tombstone transition above.
- Schema 9 persists the column in the INSERT columns, bind list, and `ON CONFLICT DO UPDATE SET`. The dedicated real-SQLite witness changes A to B before reading, because the shared registry contract writes equal values and cannot detect a frozen upsert column (F0-8).
- `launch_seat(&AppState, SpawnRequest, ExistingSeatPolicy, command_name)` is the single private launch transition for the separately-owned `/v1/revive` surface. Allocation, argv-derived stamping, fresh pre-bind construction, rollback, and persistence remain here; the route must call it with `ExistingSeatPolicy { allow_absent: false }` and must never stamp independently.
- `pij-rs register --supersedes <id>` now exposes the already-shipped daemon branch so its transition can be driven through the shipped CLI.

## Intent versus possession

Carry intent, never possession. `harness`, folder, model, effort, parent, and inbound-setting intent survive a revive. `rpc_port_intent` and `proc` do not.

The live-process rule is a **read-time obligation owned by unit 2**. Unit 1 ships no `can_deliver`-adjacent helper. A future consumer must refuse this port unless the descriptor also carries a currently live process identity.

The absence model is therefore four-way:

1. `rpc_port_intent: None`: never launched with the flags; permanent pointer seat until respawn.
2. Intent present but Copilot never bound: retry is pointless.
3. Listener absent after a previously live seat died or the port was recycled: transient-or-stale.
4. Listener live but session absent: defect, not a routing outcome.

## Transition proof

`shipped_spawn_revive_and_registration_transitions_replace_rpc_port_intent` drives the shipped binary and authenticated router against a real `SqliteRegistry`:

1. Spawn Copilot; observe port A in both fake-tmux argv and the persisted descriptor.
2. Prove a second spawn over the live id still refuses and launches nothing.
3. Tombstone and observe the field absent.
4. Bind A with an unrelated listener, spawn the tombstoned id, observe different port B.
5. Read the descriptor again and observe B, proving no later pass re-stamped A.
6. Re-register the same id twice and observe `None` after both passes.
7. Drive `pij-rs register --supersedes` and observe the predecessor tombstoned with `None`; the successor also has `None`.

The field is observed after every act. No assertion treats execution of a branch as evidence that persistence happened.

## Falsifier evidence

Pre-registration and all seven demonstrated red mutations are committed in `spawn-rpc-port-falsifiers.md`:

- argv/stamp mismatch;
- revive that clears but does not freshly re-stamp;
- same-id registration inheritance;
- supersedes predecessor inheritance;
- omitted SQLite upsert assignment;
- omitted tombstone clear;
- permissive/invented constructor default.

Each mutation produced the predicted behavioral red before the restored build's green counted. One instrument error is disclosed there: an unqualified `--exact` filter ran zero tests and was discarded before evidence was recorded.

## Verification

All Rust commands explicitly unset `CARGO_TARGET_DIR`, set `CARGO_INCREMENTAL=0`, and used this worktree's default `target/`.

- `cargo test --locked -p pij-harnesses copilot_rpc_stamp_is_derived_only_from_the_exact_emitted_argv` — 1 passed.
- `cargo test --locked -p pij-store --test store_integration rpc_port_intent_updates_to_a_different_value_and_tombstone_clears_it` — 1 passed.
- `cargo test --locked -p pij-cli --test spawn shipped_spawn_revive_and_registration_transitions_replace_rpc_port_intent` — 1 passed.
- `cargo test --locked -p pij-core -p pij-harnesses -p pij-store -p pij-daemon -p pij-cli` — 294 passed across 36 suites; 3 ignored; no warnings.
- `PATH="$HOME/.cargo/bin:$PATH" cargo run --locked -p pij-testkit --bin pij-gate` — all six stages green: toolchain 1.98.0, lock, fmt, clippy, test, architecture (9 crates, 0 violations).

Instrument correction: the first gate invocation resolved Cargo to `/opt/homebrew/bin/cargo` and correctly failed only the toolchain stage (`rustc 1.95.0` versus pin `1.98.0`); lock, fmt, clippy, test, and architecture were already green. The required PATH from the reviewer packet selected the rustup toolchain and the complete rerun passed.

`harness checks` remains unavailable in this linked worktree as disclosed by the plan-108 reviewer packet: it returned 8 failures. The visible sensor details were `local-paths` exit 127, `typecheck` exit 2, `lint` exit 127, and `test` exit 127; the command output truncated the remaining details. This is a known proof-surface limitation, not presented as a green gate. The Rust `pij-gate` above is the ruled worktree gate and passed in full.

## Composer-owned derived files

- `Cargo.lock`: no change required and not committed.
- Architecture fixtures: no change required and not committed.
- `0009_copilot_rpc_port_intent.sql` is the source migration required by schema 9, not a generated fixture.
