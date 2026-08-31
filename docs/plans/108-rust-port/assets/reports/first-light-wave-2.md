# Wave-2 first light — the services layer on the composed tree

**PM**: `pij-revolutionary-lungfish` · 2026-08-29 · composed from six parallel
units

Wave 1's first light proved the substrate: a registry round-trip and an event
fan-out. This proves the SERVICES built on it, in the order a real fleet
exercises them — a seat is registered with the evidence of its own launch, the
supervision axes are read off it, and a delivery refusal is proven against a
seat that can no longer receive.

```
=== wave-2 first light ========================================
store            /var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-test-71354-1788045016022943000-0.sqlite

--- harness registry -------------------------------------------
get(claude)      -> adapter.kind() = claude
get(copilot)      -> adapter.kind() = copilot
get(codex)      -> adapter.kind() = codex
get(pi)      -> adapter.kind() = pi
get(omp)      -> adapter.kind() = omp
                 five variants, five adapters — no composite pretending

--- bind evidence on the row -----------------------------------
spawn_id         Some("s1787962695612-63981")
model            Some("github-copilot/gpt-5.6-sol-fast") / effort Some("high")

--- staleness vs nudging (the axis the prime grounded) ----------
working seat     nudgeable=false (quiet is not stalled)
parked seat      nudgeable=false (declared silence is deliberate)
ready+idle seat  nudgeable=true — and its card can be stale at the same time,
                 because staleness is the clock and nudging is the state

--- delivery honesty -------------------------------------------
tombstoned       reason=Some("first light: proving the refusal")
                 a message to this seat is REFUSED, not queued for ever —
                 queueing for a seat that will never receive is the same
                 dishonesty as reporting success for a vanished message

=== first light complete ======================================
```

## What each block establishes

**The harness registry** — five variants, five adapters, and `kind()` truthful
for each. u-harness refused to build a composite whose `kind()` would have had no
honest answer; this is that refusal, visible.

**Bind evidence on the row** — `spawn_id`, `model`, `provider`, `effort` read
back exactly as written. That closes R5 items 13–15, whose class was *the
registry row lacked facts another surface already held*: this fleet has four pid
groups carrying two to six descriptors each precisely because the row could not
say where a seat came from.

**Staleness versus nudging** — the axis the prime grounded, executed: a working
seat is not nudgeable (quiet is not stalled), a seat waiting on a human is not
nudgeable (declared silence is deliberate), and an idle seat that declared itself
ready is. Its card can be stale *at the same time*, because staleness is the clock
and nudging is the state. Ruling toward observed TS semantics rather than first
principles is what kept those two axes separate.

**Delivery honesty** — a tombstoned seat keeps its reason, readable through the
port, and a message to it is refused rather than queued. Queueing for a seat that
will never receive is the same dishonesty as reporting success for a message that
vanished, pointed the other way.

`tmux` and `harness` stay fake here deliberately: a real tmux adapter in first
light would tap the operator's live fleet, and the harness adapters drive it.

## Gate on the composed tree

```
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

`cargo test --workspace`: **181 passed, 0 failed** (wave 1 closed at 122).
One `not_yet` refusal remains — `transport`, for wave 3.
