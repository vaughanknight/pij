# u-revive-verb falsifiers — pre-registered

**PRE-REGISTERED 2026-08-31 before any product-code edit on
`s109/u-revive-verb`.** The unit-1 RPC-port field is named below by role: the
port recorded because spawn emitted `--ui-server --port N`. Its spelling is not
part of these falsifiers.

Every product witness below runs the shipped binary against the authenticated
Axum router and a real `SqliteRegistry`. A handler/helper-only test cannot satisfy
one. Test output must be unfiltered; cargo's own exit code is the verdict.

## RF1 — the explicit verb is the path

Path: `pij-rs revive <id>` → `DaemonClient::revive` → `POST /v1/revive` → the
shared launch transition.

Falsifier: the CLI is absent, posts to `/v1/spawn`, calls a helper directly, or
`/v1/revive` is absent from the authenticated endpoint inventory. The witness
must fail by a non-success envelope or missing route, not by silence.

Red demonstration: before implementation, invoke the shipped binary with
`revive`; Clap must reject the unknown subcommand. After the test exists, mutate
the client path away from `/v1/revive`; the same shipped-surface test must fail.

## RF2 — only a tombstone may cross the boundary

Path: the shipped verb against two persisted rows, one live and one tombstoned.

Falsifier: a live id launches, mutates, or receives a generic collision message.
The refusal must name the id, state that it is live, and state that revive accepts
only tombstoned ids. The fake tmux call count must remain zero. A missing id must
be a distinct refusal that names the requested id and says no row exists.

Red demonstration: delete/invert the tombstone precondition. The live-row witness
must observe a launch or wrong refusal and fail by content.

## RF3 — replacement, not another stamp

Path: seed a tombstoned row with old port `OLD`; run the shipped verb; read the
row back through `Registry::get`.

Falsifier: the observed port is absent, zero, or equal to `OLD`. Success requires
a nonzero fresh Rust allocation and `new != OLD`; merely observing `Some(new)` is
insufficient.

Red demonstration: mutate the shared launch transition to copy the predecessor's
port. The assertion must report `OLD == new`.

## RF4 — the old value stays unreachable

Path: after RF3's successful revive, run a later shipped registration/pass that
carries no fresh port intent, then read through `Registry::get` again.

Falsifier: the old value reappears on the later read. The first observation after
revive and the later observation are both required; settling only after a sweep
fails the first assertion.

Red demonstration: remove the registration-time reset or move it to a later
sweep. The first post-registration observation must report the stale value and
fail before any wait/retry.

## RF5 — the real upsert changes a value

Path: RF3 uses a real `SqliteRegistry`: the seed writes `OLD`, revive writes a
different value to the same id, and `Registry::get` reads it back.

Falsifier: the test uses `FakeRegistry`, inserts only once, or never compares two
different values. Those shapes cannot detect an omitted `excluded.<port>` clause.

Red demonstration: remove only the port assignment from `ON CONFLICT DO UPDATE
SET`, leaving INSERT and binds intact. RF3 must read `OLD` and fail.

## RF6 — prior launch intent is derived, stale incarnation state is not copied

Path: seed a tombstoned descriptor with its durable harness, folder, model,
effort, parent and inbound-intent fields; invoke only `revive <id>` plus placement.

Falsifier: the caller must restate spawn configuration, the launched command does
not use the persisted durable fields, or the old RPC-port field is copied into the
new descriptor. The narrow revive request carries no port and no harness.

Red demonstration: change one derived field to a caller/default value and assert
the fake tmux launch record and resulting descriptor disagree with the seed.

## RF7 — one transition, one launch

Path: one shipped revive request through the shared launch critical section.

Falsifier: duplicated route logic launches twice, writes a descriptor without an
observed launch, or bypasses unit 1's spawn-over-tombstone transition. The fake
tmux call count must be exactly one and the returned descriptor must equal the
persisted descriptor.

Red demonstration: duplicate the launch call or return a hand-built response.
The call-count/equality assertions must fail by content.

## Boundaries this unit does not claim

- The port stamp records launch **intent**, never listener possession.
- Live-proc validation is unit 2's read-time obligation. This unit ships no
  `can_deliver`-adjacent reader.
- Unit 1 owns the RPC-port field, migration, allocator, upsert, tombstone clear,
  and registration-time reset. RF3–RF5 are integration witnesses after that
  mechanism composes with this verb; this unit does not duplicate those writes.
- The current Rust product has no production caller of `Registry::tombstone`.
  A green direct call to that method is not evidence of a shipped tombstone path.
