# Wave-1 first light — registry round-trip + event fan-out on the composed tree

**PM**: `pij-revolutionary-lungfish` · 2026-08-29 · composed from
`s108/w1-{liveness,tmux,store,events}`

The wave-1 cadence defines first light as "one real registry round-trip + one
event fan-out on the composed tree". Not an exit code — a transcript, produced by
`crates/daemon/tests/first_light_wave1.rs`, which narrates each step and asserts
every claim it prints. The narration is the deliverable; the assertions are what
stop the narration from being fiction.

```
=== wave-1 first light =========================================
store            /var/folders/mv/9mcvlzg504b158ctlswmgwph0000gn/T/pij-test-15845-1787960567954597000-0.sqlite
adapters         registry/spine/queue/liveness REAL · tmux fake (a real
                 tmux here would tap the operator's live fleet)
offline          false (a real store is not offline)

--- 1. registry round-trip -------------------------------------
put              seq=Seq(1)
get              pij-first-light · harness=omp · parent=Some(SeatId("pij-revolutionary-lungfish")) · semantic=Some(Ready)
list(harness=omp) 1 row(s)
tombstone        reason=Some("first light complete") at=Some(2)

--- 2. event fan-out -------------------------------------------
publish #1       seq=Seq(3) (durable leg: appended to the spine)
spine tail       3 event(s); kinds=["seat.put", "seat.tombstone", "report"]
cursor           Seq(3) — a subscriber resumes from here
publish #2       seq=Seq(4) to 2 live subscribers
subscriber a     kind=receipt seq=Some(Seq(4))
subscriber b     kind=receipt seq=Some(Seq(4))
replay(> Seq(3))   1 event(s) — the exactly-once join between what a
                 subscriber missed and what it now receives

=== first light complete ======================================
```

Read in order that is: the composed `Services` builds with four real adapters;
SQLite accepts and returns a seat unchanged; a tombstone's REASON is readable
through the port (u-store D3, previously provable only against the fake); a
publish lands durably on the spine and every tailed event carries the cursor
(the wave-1 seam); two subscribers attached at that cursor both receive the next
event, identically, with nothing dropped; and a replay from the cursor returns
exactly the event published after it — the exactly-once join between what a
subscriber missed and what it now receives.

`tmux` stays fake here deliberately: a real `TmuxPort` in first light would tap
the operator's live fleet, which is a standing rule this wave was built under.

## What first light caught

The first run failed. Subscribers created with `since: None` were handed
`seat.put` from the beginning of the spine instead of the event just published.

That is **not a defect** — `subscribe`'s doc says "`None` replays from the start",
which is correct for a cursor that has seen nothing. It is a **default worth
naming**, and first light is where it surfaced: a consumer that attaches with
`None` on a long-lived spine replays the entire history. For a UI stream that is
unbounded work at attach time. The join a running fleet actually wants is
`Some(cursor)`, which is what the transcript now demonstrates and what any
wave-2+ consumer should copy.

Flagged to the reviewer as a scaling question about the default, not as a bug: the
behaviour matches its documentation, and the documentation is reachable.

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

`cargo test --workspace`: **122 passed, 0 failed** (wave 0 closed at 86). Two of
the four `not_yet` refusals are deleted — `liveness` and `tmux` are wired; the
remaining two belong to waves 2 and 3 and still refuse by name.
