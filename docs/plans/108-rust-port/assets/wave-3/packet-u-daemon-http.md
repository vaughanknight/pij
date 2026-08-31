# Coder packet — u-daemon-http (wave 3)

**Spawn form (pinned, Jordan)**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high --layout window`
— OMP harness, never the copilot CLI harness, and **its own tmux window, never a
split pane**.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-http` · branch `s108/w3-http`
**Common contract (read FIRST)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-3/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The daemon's HTTP surface, from hello-depth to real. Wave 0 shipped `/health` and
a snapshot `/v1/events`; you make it the surface every client and every peer
daemon uses — **including, now, other machines** (§ federation below).

## Scope

* `crates/daemon/src/http/**` — restructure from the single `http.rs` if you
  need to; say so in your ack.
* your tests, allow-list rows, derived files.
* **Not** `crates/daemon/src/lib.rs` beyond what your recipe asks the PM to paste.

## What to build

1. **Routes: `POST /v1/send`, `GET /v1/seats`, `GET /v1/events` (NDJSON),
   `GET /health`.** Each does ONE cheap statement or enqueues a job — the
   queue-first rule (R4). A route that does real work inline is the thing that
   rule exists to prevent.
2. **Auth stays middleware over the WHOLE router**, `/health` included, with no
   exemption list. A route added later must be authenticated because it exists,
   not because its author remembered. Wave 0's regression asserts this; keep it
   passing.
3. **`/v1/events` becomes a real stream**, not a snapshot: Hello line first, then
   events, with unknown kinds forwarded (`WireEvent::Unknown`). Attach with a
   cursor or `subscribe_live` (COMMON § 6) — and if you take a `since` parameter,
   document what `None` means at the HTTP boundary.
4. **The envelope is fixed** (`{ok,command,v,data,meta}`, R7) and `Event.seq` is
   `#[serde(skip)]` — a cursor belongs to the STREAM, not the event body. If the
   stream needs resumability, it goes in the FRAME. That is your design call and
   I want it in the ack.

### Federation (req-0017) — your half

5. **Bind beyond loopback, deliberately.** `bind_addr` is already config; the
   change is that a LAN address is now legitimate. Make the choice explicit and
   loud at boot: a daemon listening beyond loopback should SAY so, because the
   bearer key is the only thing between it and the LAN.
6. **Per-machine key exchange.** Trust is the bearer key; there is no TLS of our
   own. A peer daemon presents its key; how a machine learns another machine's
   key is **manual bootstrap** in v1 — design the surface so manual is honest
   rather than pretending at discovery.
7. **Routing to a peer** for messaging, registry visibility and spine events.
   `<seat>@<machine>` parsing itself is u-cli's; you receive an already-resolved
   destination. Say in your ack what shape you want it in.

## Done bar

* Gate green; route tests over fake services; the 401-with-next_action test;
  the Unknown-variant forward-compat test.
* A loopback-vs-LAN bind test proving the boot banner tells the truth about which
  one it did.
* **Mutation evidence** on the auth middleware (exempt one route and watch the
  whole-router test fail) and on the Unknown-variant path.
* Report committed and pushed before the done message.
