# Pointer — rs corpse census (evidence lives in chainglass)

A census of **pij-rs** seat liveness, produced 2026-09-02/03 by chainglass seats
while evaluating chainglass's migration off the legacy pij CLI. It is a
chainglass-side finding **about rs behaviour**, so it is cited here: the decision
it supports is a pij decision, and the evidence is not reachable from this repo.

| | |
|---|---|
| repo | `/Users/jordanknight/substrate/chainglass-093-pij-rs-reader` |
| branch | `093-pij-rs-reader` — **unmerged**, not on chainglass `main` |
| file | `docs/plans/093-pij-rs-reader/assets/findings/rs-corpse-census.md` |
| commit | `eb4a87fbd` (was `db78f49f8` at first read; appended since) |

Authored by `pij-lonely-antelope`; reproduced independently by
`pij-binding-magpie` and `pij-minor-unicorn`; population question raised by
`pij-boa`.

## Why a pointer and not a copy

The census is versioned with the chainglass work that motivated it and is still
being appended to. Copying it here would fork a live document. Cite the
coordinates above, and re-read at the commit — the numbers below are a snapshot,
not the record.

## What it establishes (snapshot, verified from this repo 2026-09-03)

Measured against the live daemon (`127.0.0.1:7461`, daemon pid 53550):

- `/v1/seats` returns **839** seats; **93** carry `tombstoned_at`; of the 744
  same-machine paned untombstoned rows, **716 have a dead pane** and all 716
  report `state: idle`. A corpse and a quiet live seat have an **identical field
  set**.
- The field *values* still discriminate: **713/716** corpses carry
  `proc{pid, proc_start}` and **711** of those have a pid that is gone — so
  ~99.3% are derivable as dead from the payload. `proc_start` is load-bearing;
  a bare pid recycles at boot.
- **Residue where derivation is ambiguous: 5 rows** — 3 corpses carry no `proc`
  at all, and 2 dead-pane rows carry a pid that *is* alive (recycled). This is
  where two independent consumer implementations diverge and each look correct.

## The two questions this was routed to support

**(a) Should `/v1/seats` carry liveness?** Note the sizing correction: this is
**not** "surface a field pij already has". `pij list --json` does expose
`liveness` and `terminal.evidence`, but over a *different population* —
`/v1/seats` 839 rows vs `pij list --json` 437, with **2 ids in common**
(`pij-dominant-vicuna`, `pij-forward-worm`). Exposing the existing field would
light up 2 rows in 839. The real ask is "compute the liveness we already know how
to compute, **for the seats `/v1/seats` actually serves**". The algorithm is
proven; the projection it runs on is the wrong one.

**(b) Is reaping/retention planned?** Unchanged and separable from (a).

## The argument against "just derive it, it's ten lines"

pij models **three** liveness states — measured here `dead 406 / active 24 /
stale 7`. A consumer deriving from `pid + proc_start` yields **two**, and cannot
represent `stale` **at all, for any row, ever**: the rs seat row carries no event
timestamp of any kind (key union: `cross_session_inbound_accept, effort, folder,
generation, harness, id, machine, model, pane, parent, proc, provider, relay,
role, rpc_port_intent, semantic_state, session, spawn_id, state,
tombstone_reason, tombstoned_at`). There is no input from which to compute it.
Categorical, not drift — and a deriving consumer folds the stale rows into
"alive", confidently wrong in the same direction as the original defect.

## Method note worth keeping

Three seats reproduced the count with three different scripts and agreed to the
row — and all three shared one wrong reading (field *set* identical, therefore
"nothing to branch on"). The agreement confirmed the measurement and was
structurally blind to the interpretation, because a reproduction re-runs the
question along with the method. Both corrections in this thread came from a seat
declining to hand-wave a caveat, not from another reproduction.
