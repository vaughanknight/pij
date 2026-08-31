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

## Review round 1 — nine findings, none refuted

The reviewer (`glm-5.3-flash`, briefed with `assets/REVIEWER.md`) raised nine, all
accepted, with **F2 raised above the reviewer's own severity** to the most serious
item in the wave.

- **F2 — a tombstoned seat's tap survives a daemon restart.** The in-process
  retirement shipped this afternoon had no restart arm: tombstone, kill the daemon
  before the next sweep, and the pane is in neither `wanted` (tombstoned) nor
  `tracked_panes()` (new process), so a released human's terminal keeps piping into
  a growing sink for ever. **Marker adoption gave live seats a restart story and the
  tombstone arm inherited the durability without the discrimination.**
- **F3 — the attestation event was forgeable.** Published before the ledger write,
  carrying no outcome, with the seat taken **from the request body**. Any
  machine-graded key could mint spine rows asserting reads by any seat. The PM ruled
  attestation onto the spine because the ledger evicts, and never checked the claim
  being relocated was true: **durable storage for a forgeable assertion**, E-034 on
  the surface built to prove reader-reads.
- **F1 — the gate can fail correct code.** `drain_until_quiet` bounds settling at
  80x25ms; the reviewer reproduced a red under a cold gate's compile load and
  characterised it (5/5 isolated, 3/3 at 8-way, 1/1 at 16-way) rather than re-running
  until green. The gate is the ruled definition of done, so a gate that can fail
  correct code **makes every future green an assertion rather than a proof**.
- **F6 is a violation of P9**, this repo's own written pattern: the pointer is typed
  into the pane before the spine records it, so a failing spine re-types the line
  every pass — including the explanatory "parked" line, the pointer built to stop
  shouting becoming the shouting.
- F4 lock recovery, F5 policy riding a lossy broadcast whose lag counter nothing
  reads, F7 park overwriting a concurrent unpark, F8 the placement enforced by prose
  rather than a red test.
- **F9 was found independently by the PM and the reviewer within the same hour.**

## Three ports amendments, all ratified

`ports.rs` had been frozen at seven traits since wave 3. This wave took three:

- **R3-AMEND-7 `Spine::latest_matching`** — mandatory seat scope, `kinds` non-empty,
  `EventBus::history` deleted in the same change. The unpark check was reading the
  ENTIRE spine on every inbox claim to call `.last()`. **The bounded-ledger trap from
  the opposite direction**: attestation gave eviction to a question needing
  durability; this gave a full scan to a question needing one row. Shared root —
  not asking what the read actually needs. Ratified with the `CountingSpine`
  instrument as part of the ratification, because **a cost claim without an
  instrument is a comment**.
- **AMEND-8 `TmuxPort::pane_tap_sink`** + marker-as-ownership for detach. Not a
  relaxation of E-033 but **E-033 finally used for the case it was invented for**:
  after a crash the marker is the only surviving ownership evidence, and that is
  exactly when consent is least defended. Retirement sourced from the WORLD, which
  is transition-not-filter extended across restarts.
- **AMEND-9 `Queue::ack_delivery -> DeliveryAck`** — authority-owned recipient read
  inside the commit transaction, so attribution cannot be taken from the body.

The pair banked as doctrine: **ask the WORLD what it owns; ask the AUTHORITY who
read.**

## Verdict — APPROVE at 593a3e9d, four rounds, fifteen findings

Round 1 nine, round 2 three, round 3 three, round 4 zero. **None refuted.** The
reviewer scoped its verdict explicitly to the wave-6 surface — u-inbox,
u-uds-open, u-bounce, and the three ratified amendments — because wave 7 composed
into the same head after its round 3, and a verdict whose edges nobody can locate
is worth less than a narrow one.

Two of round 3's findings were **fixes landed in one half** (E-031, twice in one
wave), and the third was a loop nobody ran.

### The blocking finding, and why it needed two proofs

Round 2 found the marker-only detach path comparing no identity: it followed
whatever string the unauthenticated `@pij-tap-sink` pane option held and unlinked
that path. Proven live with a decoy pane owned by nobody — **the daemon deleted a
file it never created, on a pane it never tapped.** Security finding, not a
correctness one.

The PM fixed the OBSERVER and declared it closed. Round 3 probed **one layer
down** and found the adapter primitive still open: same idea, different caller.
`git grep tap_root` at every pushed commit proved the fix existed only in an
unpushed tree while a coder's gate compiled it out of a shared build cache —
which is how the wave also learned that **a location-keyed shared cache is a
channel where one coder's unpushed future fails another coder's gate** (E-037's
fast fix, withdrawn; sccache named as the real one).

Closed at both layers, each with its own witness, and the mutation fails **on the
FILE, not on a boolean**.

### The proof standard this wave established

- **Both halves, same procedure, discarded runs disclosed**: DELETED before,
  SURVIVES after — a destructive defect proven by the destruction failing to
  happen. Two intermediate runs were thrown out for instrument contamination and
  named in the receipt anyway, because *a test whose instrument state is not
  pinned reports the environment, not the change*.
- **Stress-run anything whose subject is a physical effect**, and report the
  recurrence index. `tmux` reported a successful detach while the pipe was still
  up: recurred at run 10 of 20, invisible in nine consecutive greens.
- **Report your own red.** The reviewer reproduced a gate failure on correct code
  and characterised it (5/5 isolated, 3/3 at 8-way) rather than re-running until
  green.

### The day's trilogy, and its coda

**Pipe EXISTENCE. Tombstone ROW. Detach RETURN.** Three layers, one mistake:
taking the nearest available signal as evidence of the thing actually cared
about. The coda is the PM's: a clean sweep across 71 foreign panes reported as
proof of discrimination, when **none of them carried a marker and the
discriminator never ran** — a null result published as a positive, retracted, and
mirrored by the prime, who had upgraded it.
