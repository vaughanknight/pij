# Wave 6 — done (draft; closes on the two outstanding fixes + review)

Units: `u-inbox`, `u-uds-open`, `u-bounce`. Composed on `s108/rust-port`,
334 tests, six-stage gate green (toolchain, lock, fmt, clippy, test, arch).

## What shipped

- **Two-step inbox.** `GET /v1/inbox` claims and records NOTHING; `POST
  /v1/inbox/ack` records `ReaderRead` for client-named ids. Expired `delivery:*`
  claims RETRY; federation and pointer keep terminal failure. Residual is a
  duplicate read, and **duplicate over lost-with-a-lie** is doctrine (ruled three
  times across this plan).
- **Attestation on the SPINE** (`delivery.inbox-ack`), not the ledger row — the
  ledger is bounded and evicted, so audit stored there vanishes exactly when an
  auditor arrives. Identifier is `local` or a peer alias, never a raw key.
- **UDS open path** with the politeness gate on the LIVE `arrive` path, the
  `@pij-tap-sink` ownership marker, and the quiet-pane policy.
- **`pij daemon bounce`**, which refuses stream branches by design.
- **Pointer parking**: `pointer_announce_limit` default 3, seat-level durable
  budget replayed from spine facts, an explanatory final pointer, one visible
  parked event, unpark on a successful READ only.

## The dogfood exit proof

Two real Claude seats spawned BY pij-rs against a dev store, one accepting and one
refusing. Proven live, not in a test: a false `proc_start` refused while naming the
observed value; the stamp surviving registration; **socket arrival on a quiet pane**,
where the seat replied `ACK-QUIET` to an instruction that existed only inside the
message body; an unstamped control holding mail; and **killed-client claim expiry
retrying rather than failing** — attempt 64, zero rows terminally failed.

Four defects were found by that dogfood and fixed here: the politeness gate absent
from the live path, the observer erasing its own `NonBlank`, the tap self-closing on
re-attach, and pipe existence mistaken for ownership.

## The witness

One dogfood pane was a real agent, and it produced five findings, four of which no
instrument in this system could see:

1. audited the ledger and found a `reader-read` for a body it never received (E-034);
2. found the fork's still-open **G25** in our tree by counting its own turns (E-035);
3. corrected the parking ruling by naming the audience we got wrong — the operator
   can read the spine, **the recipient can look at nothing**, so a stream of pointers
   that simply stops is indistinguishable from a dead daemon;
4. caught the parked event reporting `announcements: 3` to a seat that lived
   **eighteen** — *"the policy's count, not the seat's"*;
5. produced E-036 **by asking to stop being observed**.

## E-035 and E-036, the two confessions

**E-035 — we fixed their cause and never used the fix.** The fork's G25 is
unbounded pointer re-announcement. We built the real durable attempt counter that
makes a cap possible, and then never consulted anything in the announce decision,
which read cadence and nothing else. The instrument was built to enable the policy
and the policy was never written. Closed here, and **observed closed** on the live
instance: three announcements, then `delivery.pointer-parked`.

**E-036 — a consent revocation that existed as a ROW but not as an ACT.** Tombstoning
a seat left its tap running; a hand detach was beaten twice by the daemon
re-attaching. E-034's defect with the polarity flipped — one asserted a read that
never reached a human, one asserted a release that never reached the pipe, both
records internally perfect. **The ownership-marker fix made the wrong behaviour more
durable**: hardening propagates to whatever the code does, including the parts that
are wrong.

## Outstanding

- [ ] tombstone detaches (transition, not filter) — `u-uds-open`
- [ ] parked count window counts announcements since the last unpark
- [ ] wave-6 review to APPROVE
