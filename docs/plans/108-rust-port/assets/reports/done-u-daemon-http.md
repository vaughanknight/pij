# Done report — u-daemon-http (wave 3)

**Coder**: `pij-apparent-barracuda` · **PM**: `pij-revolutionary-lungfish` · 2026-08-30

## Result

Implemented the authenticated daemon HTTP protocol primitives under
`crates/daemon/src/http/**`:

- `GET /health`: versioned envelope with health, build, offline state, and machine alias.
- `POST /v1/register`: corroborates process identity, refuses a second seat on the same
  `(pid, proc_start)`, applies the shared admission decision, then writes the descriptor.
- `POST /v1/send`: accepts only resolved local `Destination` objects, performs exactly one
  durable enqueue using `delivery_kind`, and returns an honest `Queued` receipt.
- `GET /v1/seats`: one registry list.
- `GET /v1/events`: live NDJSON after Hello; `since=N` joins replay to live; frames are
  `{machine,cursor,event}` and `Event.seq` remains absent.
- Whole-router local-plus-peer bearer-key ring; no route exemption list.
- One-request/one-response peer POST primitive with no discovery or retry.
- Pure loopback/LAN exposure classifier and exact boot-banner text.

The old single `http.rs` is now the T2-style `http/` module. The runtime synthetic unknown
probe was removed: it could not carry an honest store-assigned cursor. The first-light and
unit regressions publish a real unknown-kind event through `EventBus` and assert its assigned
frame is forwarded unchanged.

## Toolchain and disk

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
/dev/disk3s5  1.8Ti  1.6Ti  209Gi available  89%
```

`CARGO_TARGET_DIR=/tmp/pij-w3-http-target` and `CARGO_INCREMENTAL=0` were used throughout.

## Verification

Targeted daemon suite after restoration:

```text
cargo test --locked -p pij-daemon
44 passed; 0 failed
```

Canonical gate, run from committed code at `50242303`; `git status --short` emitted zero
lines immediately afterward:

```text
cargo run --locked -p pij-testkit --bin pij-gate

pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

The route regressions enumerate all five endpoints from the same endpoint table used to
construct the router. They cover both accepted credential classes, registration evidence and
collision refusal, the exact-one-enqueue property, remote refusal, one registry list, local
replay/live cursor semantics, unknown kinds, frame shape, peer forwarding, and both exposure
classes.

## Mutation evidence

### Whole-router authentication

Mutation: exempt `/health` inside the middleware.

```text
cargo test --locked -p pij-daemon --lib \
  http::tests::auth_ring_covers_every_declared_route_and_accepts_peer_keys -- --exact

assertion `left == right` failed: /health must inherit whole-router auth
  left: 200
 right: 401
FAILED: 0 passed; 1 failed
```

The exemption was removed; the targeted test and full gate returned green.

### Unknown-kind forwarding

Mutation: replace the live stream's `EventFilter::all()` with
`EventFilter::kinds(wire::KNOWN_EVENT_KINDS)`.

```text
cargo test --locked -p pij-daemon --lib \
  http::tests::events_are_live_by_default_and_frame_unknown_kinds_with_a_cursor -- --exact

unknown kind must be forwarded, not filtered: Elapsed(())
FAILED: 0 passed; 1 failed
```

The closed filter was removed; the targeted test and full gate returned green.

## Composition recipe

The public entry point carries the same recipe in its rustdoc. At compose:

```rust
use crate::http::{HttpConfig, PeerEndpoint, boot_banner, router_with_config};

println!("{}", boot_banner(&addr));
let http_config = HttpConfig {
    local_key: token,
    peer_keys: config.peer_keys,
    machine_alias: config.machine_alias,
};
let router = router_with_config(services, http_config);
```

Lifecycle owns the hostname-defaulted `machine_alias`. Config owns persistent peer keys; the
inbound ring is the per-boot local key plus those peer keys. Removing a peer key from the ring
is how an operator revokes a machine.

Wave 4's `u-federation` worker owns a `BTreeMap<String, PeerEndpoint>` and one
`reqwest::Client`; after resolving a machine alias it calls `post_to_peer` once. Discovery,
registry/event fan-in, retry, and long-lived workers are deliberately absent here.

## Shared-merge files

Touched:

- `crates/daemon/Cargo.toml` — promoted existing `reqwest` from dev-only to production.
- `crates/testkit/arch-allowlist.toml` — corresponding reviewed `reqwest` production edge and rationale.

Derived files: no `Cargo.lock` byte change was required because `reqwest` was already locked.
No architecture metadata fixture changed; the gate reports zero drift.

## Ack findings and rulings

Five packet/contract defects were found before their affected code was written:

1. The original fence combined HTTP primitives with federation workers and fan-in.
2. `delivery:<seat>` collides for local and remote instances of the same seat.
3. The documented string destination did not deserialize into the landed `Destination` object,
   and `in_reply_to` was required elsewhere but absent from `SendRequest`.
4. Registration would have trusted self-reported bind evidence and recreated the #19 alias defect.
5. The synthetic unknown probe could only lie about its cursor or make a read route write.

All five were ruled by the PM and landed in `WIRE-CONTRACT.md` before the corresponding tests
froze.

## Assumptions

1. **The origin side does not route; the destination side always enqueues locally.** A non-local
   destination is refused in wave 3 with an error naming `u-federation` wave 4. This prevents a
   local inbox from claiming a remote job under the seat-only `delivery_kind`.
2. **The payload is a claim, the daemon corroborates.** Registration derives `bound` from the
   observed process start and the registry collision check; it never accepts a caller's answer.
3. Same-id registration updates bind evidence while preserving descriptor fields not present in
   `Registration`; a different id on the same process is refused and never written.
4. `since` absent means live-only. `since=N` means replay after `N`, then live, for this machine.
   Federation extends the scalar into a per-machine map; it does not reinterpret local cursors.
5. Unknown event kinds are ordinary open strings. No synthetic runtime event is needed or emitted.
6. Local keys remain per-boot. Peer keys are persistent per machine pair and manually bootstrapped;
   there is no TLS layer of our own.
7. `HttpConfig::local` preserves the pre-compose boot call and labels it `local`; the PM replaces it
   with lifecycle/config values at composition.
8. The peer primitive forwards one authenticated JSON request and decodes one versioned envelope.
   It intentionally has no retry semantics.
9. `harness boot` remains red on the pre-existing TypeScript readiness path (typecheck exit 2, with
   the compiler detail omitted from its envelope). The canonical Rust completion proof is
   `pij-gate`, which is green above; the missing harness diagnostic was captured as `DL-001`.
