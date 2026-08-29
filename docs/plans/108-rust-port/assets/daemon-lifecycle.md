# Daemon lifecycle and upgrade contract

Status: wave 3 implements local identity resolution, periodic scheduling, the existing OS bind guard, HTTP connection drain, and per-boot key rotation. Supervision, process handoff, worker orchestration, and peer-aware routing drain remain explicitly unimplemented.

## Identity

Each daemon resolves one `MachineIdentity` before serving:

1. A non-empty configured `machine_alias` wins without consulting the host.
2. An absent value resolves through the operating-system hostname API.
3. An empty, unreadable, or non-Unicode result refuses boot with an actionable error.
4. The boot banner and authenticated `/health` response expose the same alias and build string. The event-stream Hello continues to expose that build string.

The local alias makes address locality decidable; it does not validate federation topology. At composition, the HTTP peer map must reject duplicate peer aliases and any peer alias equal to the local alias. An unqualified seat remains local. Peer discovery is not implied: v1 bootstrap is manual bearer-key configuration.

## Tick lifecycle

`TickLoop::start(interval, action)` owns timing and cancellation but not workload policy. The interval is a dedicated configured value; it is not the watchdog staleness threshold or queue lease.

- The first tick runs after one complete interval, never immediately at boot.
- Ticks do not overlap.
- A late tick uses Tokio's `Delay` missed-tick behavior; it does not burst to catch up.
- An action error terminates the scheduler and is returned by `shutdown`.
- Shutdown prevents future ticks and drains the action already accepted.
- A zero interval refuses before task creation rather than panicking inside Tokio.

The injected action may fan out to workers at composition, but lifecycle must not gain one dependency per tick consumer.

## Boot state machine

The composed boot order remains:

1. Build services and resolve local identity.
2. Stage a fresh 0600 bearer key under a unique attempt path.
3. Bind the configured listener. An address-in-use refusal is the single-instance guard and names the likely running daemon.
4. Atomically publish the staged key only after successful bind.
5. Construct authenticated HTTP state with services and identity.
6. Start HTTP serving and the injected tick loop.
7. Print listener, LAN/loopback exposure, key path, offline state, machine alias, and build identity.

A failed bind never changes the live daemon's key. No lock file exists to become stale.

## Graceful stop and restart

The current implementation is a stop-and-start restart:

1. Enter draining state and stop accepting new application work. HTTP admission state is **not implemented in wave 3**; until it exists, the listener may accept requests until its shutdown signal.
2. Signal Axum graceful shutdown. Accepted connections may finish; new connections stop at listener shutdown.
3. Signal the tick loop. A tick already executing finishes; no later tick begins.
4. Await owned worker tasks. A worker join set and queue-consumer ownership are **not implemented in wave 3**.
5. Exit. The supervisor starts the new binary, which binds and publishes a new per-boot key.

There is no zero-downtime socket handoff, inherited listener, dual-process admission lease, or automatic rollback in wave 3. The OS bind remains exclusive, so the old process must release the listener before the replacement binds. A supervisor should treat a replacement bind failure as restart failure and restart the previous binary; it must not claim an in-place upgrade succeeded.

## Observable client behavior

- Before draining admission exists, a request races only with listener shutdown: it either reaches the old daemon and completes under its contract, or connection establishment fails and the client retries against the replacement.
- A client holding the old per-boot bearer key receives authentication failure after restart and must reread `daemon.key` for a local daemon or use the manually configured peer key for a remote daemon.
- Event consumers reconnect with their last acknowledged cursor. A live-only subscriber accepts the documented gap. Reconnecting with no cursor would replay the entire spine and is not a restart strategy.
- Queue rows already persisted survive restart. In-memory work not represented by a durable row may be dropped; composition must not describe it as queued.
- Registry visibility and remote routing during peer restart are **not implemented in wave 3**. The peer should be reported unreachable, not absent, once the HTTP federation layer owns that distinction.

## Upgrade safety boundary

Safe to drain now:

- Axum connections accepted before graceful shutdown completes.
- One in-progress injected tick.
- Durable queue, registry, and spine state because they live in SQLite rather than the process.

Not yet implemented and therefore not claimed:

- Rejecting new mutating requests with a typed `draining` response and retry hint.
- Tracking and joining all queue consumers and sidecars.
- Peer notification or routing withdrawal before listener shutdown.
- Socket activation or listener transfer for zero-downtime replacement.
- Schema compatibility negotiation across rolling peer upgrades.
- Automatic binary rollback.

The upgrade path becomes complete only when those owners compose into this sequence; adding ad hoc sleeps or a second lock would hide missing ownership rather than create a drain contract.
