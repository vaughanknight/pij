# Coder packet — u-spawn (wave 4)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w4-spawn` · branch `s108/w4-spawn`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-4/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The surface that launches a seat and **stamps what it is**. Wave 4 begins here
because three separate things are blocked on facts only a spawn surface can
honestly produce — and all three were struck from wave 3 rather than faked.

## Why this unit is first, stated as the constraint it is

`SeatDescriptor.cross_session_inbound_accept` exists (schema 5) and **nothing
writes it**. Until something does, `UdsTransport` refuses every seat and the
socket transport is inert. That is not an oversight to tidy up; it is the honest
state, and this unit is what changes it.

**The daemon can NEVER truthfully attest a permission mode.** Claude derives
attestation from THE SENDER'S VERIFIED PID BEING A CLAUDE SESSION, never from a
wire field — anti-permission-laundering by design, measured first-party from one
side (u-uds, E-023) and corroborated independently by the prime's pre-port PoC
from the other. **So the recipient-side spawn setting is not one option among
several; it is the only honest open we control.** Do not look for a cleverer one.

## Scope

* A new `spawn` module — propose the crate at your ack; `pij-harnesses` and a new
  `crates/spawn` are both defensible and I will rule.
* `pij-rs spawn` as a CLI verb, and the daemon-side route it needs.
* Your tests, fixtures, allow-list rows, derived files.
* **Not** `crates/daemon/src/lib.rs` — ship the composition recipe.

## What to build

### 1. Launch, and stamp what you launched

The descriptor a spawn produces must carry, truthfully:

* `cross_session_inbound_accept` — `Some(true)` when and only when the seat was
  actually launched with `--settings '{"crossSessionInbound":"accept"}'`. Not a
  default, not an assumption, not "we usually pass it". If the flag did not go on
  the command line, the field is `Some(false)` — and if you cannot tell, it is
  `None`, which reads as closed.
* `spawn_id`, `model`, `provider`, `effort` — these fields exist and are populated
  today by the registration claim. Say in your ack whether spawn should stamp them
  directly instead; a fact the launcher KNOWS travelling as a self-declaration by
  the launched process is a weaker chain than it needs to be.

**`from-mode` is STRUCK from this unit** (u-spawn D7). It has no destination
field in `SeatDescriptor`, `Registration`, or any wire type, and the u-uds ruling
forbids inventing an assertion — so "populate what is true" had nowhere to put it.
A leftover from the wave-3 packet, where it belonged to a unit that no longer
exists.

### 2. The pi-in-a-worktree trap is REAL and it kills silently

`pij spawn --harness pi` **dies at boot in ~3s, silently, when invoked from a
linked worktree**: machine-global extension links collide with the worktree's
project-local extensions, and a pi peer that dies pre-boot never registers, so
nothing reports the death (observation DL-003, s055; the whole of wave 3 was
dispatched from the main checkout because of it).

Your unit does not have to FIX that. It must not pretend it does not exist:
detect the condition, or refuse with a named error that says what to do. **A spawn
that returns success for a process that will be dead in three seconds is the
delivered-without-observation defect in a different costume.**

### 3. Do not absorb the ladder

You launch and stamp. You do not route, deliver, or decide reachability. If a
requirement in this packet seems to need `Transport`, say so at the ack — that is
a fence error and I want to hear it before you build across it.

## Done bar

* Gate six stages green (COMMON § 2), including the new lock-vs-tree check.
* **A stamped seat is proven END TO END**: spawn with the accept setting, and the
  descriptor that lands in the registry carries `Some(true)`; spawn without it and
  the descriptor carries `Some(false)`. Both rows, not one.
* **The stamp is not inferred.** A mutation that always stamps `Some(true)` must
  fail a test by name.
* The worktree-death condition is detected or refused by name, with the refusal
  proven.
* Mutation transcripts, composition recipe, assumptions, receipt committed and
  pushed **before** the done message (COMMON § 5).

## Watch for

* Wave 3 landed `Registration.supersedes` for `/new` and `/fork` — one process,
  new seat id. If spawn can produce that shape, it uses the same rule: a claim may
  only supersede itself.
* Boot invariant (COMMON § 8) applies to anything you start.
* `pij list` must be able to SHOW what you stamped. A fact only the transport can
  read is the hidden-parallel-state shape we rejected when this field was
  allocated.
