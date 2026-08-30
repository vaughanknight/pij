# Wave 4 — shape

Written at wave-3 close, from rulings made during wave 3 rather than from a fresh
plan. Every item below exists because a wave-3 unit hit it and we deliberately did
not build it then.

## Dependency order (ratified by the prime)

```
u-spawn ──> u-uds-open ──> (socket goes live)
   │
   └──────> u-federation
u-pointer ─> u-drain
u-bounce (independent)
```

## 1. `u-spawn` — the surface that can stamp what a seat is

**Why it is first.** Three separate wave-3 units were blocked on facts that only a
spawn surface can honestly produce, and all three were struck rather than faked:

* `cross_session_inbound_accept` — the socket precondition. Stamped at spawn by
  whoever passed `--settings '{"crossSessionInbound":"accept"}'`. Landed as a
  descriptor field at schema 5, currently written by nothing.
* `from-mode` provenance — struck from u-uds because the daemon has no permission
  mode to attest and a constant would be an assertion wearing provenance's
  clothes.
* Descriptor capability stamping at bind (u-uds D14): filesystem discovery inside
  `can_deliver` is an explicit wave-3 exception, not the end state.

**The hard constraint, corroborated twice.** The daemon can NEVER truthfully
attest a permission mode: Claude derives attestation from THE SENDER'S VERIFIED
PID BEING A CLAUDE SESSION, never from a wire field — anti-permission-laundering
by design (prime's pre-port PoC; u-uds measured the same wall from the other
side, E-023). So the recipient-side spawn setting is not one option among
several. **It is the only honest open we control.**

## 2. `u-uds-open` — turn the socket on, once something can stamp

Nothing to build but the flip and its proof: an accept-stamped seat delivers, an
unstamped one still refuses. u-uds already ran the positive control by hand
(accept-configured seat, model replied `ACK-UDS-251`), so this is a test that
converts a manual measurement into a standing one.

Also here: re-verify the drop-report decoder, which ships marked UNPROVEN ON THIS
CONNECTION SHAPE. It is correct code against a channel that may exist in another
build; it has never been observed to fire.

## 2b. `u-names` — memorable seat ids

Added mid-wave, after u-spawn asked to mint seat ids from hex (D14) and I ruled
against it. **Memorable names are a product surface**: every message in this fleet
addresses seats by name, and a roster of `pij-a3f9c21b0e77` would be a visible
regression in the thing pij is for.

It is a separate unit rather than a corner of u-spawn because the TS generator is
not a wordlist lookup — it is a curated corpus plus a seeded generator whose
properties were tuned against measurement (strided probing for reachability, an
avalanche mix because FNV-1a's low bits are biased on the seed shapes pij actually
produces, resume-safe determinism). Porting that inside a launcher packet is how
you get a subtly wrong port that passes its own tests. Golden vectors from the TS
implementation are the proof.

Until it lands, `/v1/spawn` requires an explicit `--id`.

## 3. `u-federation` — the peer half that u-daemon-http deliberately did not build

Carved out at that unit's ack (D6) so a wave-3 route could not grow a
half-implemented network. Owns: a `BTreeMap<String, PeerEndpoint>` and one
`reqwest::Client`; peer-alias resolution and the uniqueness/collision rules;
registry and event fan-in across machines; remote-send retry; the long-lived
workers. `post_to_peer` already exists as a one-request primitive.

The federated cursor is a per-machine map; frames are `{machine, cursor, event}`;
`Event.seq` stays `#[serde(skip)]`.

## 4. `u-pointer` + `u-drain` — the rung that is not a transport

u-uds proved these cannot live in `crates/transport`: there is one
`Arc<dyn Transport>` and `can_deliver(false)` means ENQUEUE, so nothing in a
transport crate can "select the pointer". Owns: the composer-idle guard, the
single pointer line, settle/release, the drain/retry worker, and
attempt-preserving wake.

**Carry the standing ruling in (Jordan, 2026-08-27).** Two gates were both called
"the tmux guard" and only one was pty-era. Seat-`Working` is agent state and is
now the transport's judgement. **A HUMAN TYPING is pane-signals and it STANDS** —
socket is transport, tmux is politeness. A socket frame queues at the inbox rather
than splicing into what someone is typing, so the residual reason is rudeness, not
corruption, and it is Jordan's to lift.

**There is still no typed-body rung.** If a body can use neither the socket nor a
pointer, the row stays queued and is retried.

## 5. `u-bounce` — req-0018, `pij daemon bounce`

Adopted from lynx's daemon bounce as a real verb; Rust side owned by
daemon-lifecycle. Refuse if `HEAD != origin/main`, build, drain-restart, health-verify
via the auth-401 tell, print the version.

**Drain-restart means shutdown finishes in-flight work only and never dequeues
after the signal.** Verify the existing runner already satisfies this; if it does
not, that is the first thing to add.

## Boot invariant (already enforced, keep it enforced)

**Bind or reserve the port BEFORE any mutating boot step.** Checked during wave 3
at the prime's instruction and we were violating it: `build_services` ran before
the bind, and opening the store runs migrations, so a second daemon migrated the
schema and only then discovered it had lost the port race. Migrations are one-way —
**the loser mutated the winner's world**, and no test of either daemon alone would
ever see it.

## Pointer for s105's re-entry (mechanical, not remembered)

`pij-fatal-woodpecker` closed before the u-uds measurement reached it. When s105
revives, its re-entry runs through the ruling docs, so: **the erratum against
s105's §4.1 — negative acknowledgement does not arrive on the authenticated
connection in a daemon's shape — lives at `docs/plans/108-rust-port/assets/experiences.md`,
E-023.** Their document still asserts the fork's mechanism without that
correction.
