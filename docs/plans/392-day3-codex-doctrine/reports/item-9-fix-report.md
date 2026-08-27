# Item 9 fix report — orchestrator semantic restorations

## Claim

The cold-review F1-F3 blocking semantics are restored without reverting the item 9
consolidation, and F4's non-blocking node admonition is restored within the existing
150-line budget. The live skill gate remains fully green.

## SHA

- Implementation: `346c19fb622e3d0292331bc74cee5dcfe7bde899`

## Base vs new

### F1 — read-back is a precondition

Base `fa6378a`:

> Then read it back verbatim and confirm inline before fleet creation.

The faulty consolidated wording began with:

> After the human confirms the fleet, persist the choice and read it back verbatim...

New wording:

> Read the selected profile back verbatim and confirm inline. After the human confirms
> the fleet, persist it in the plan roster.

> Persist the pending choice and remain reachable; read it back verbatim and confirm
> inline before fleet creation (global invariant 9).

The read-back again gates the human's yes and creation, so a mis-transcribed model is
caught before confirmation.

### F2 — roster authority

Base authority:

> The plan roster remains the durable configuration truth.

New wording restores that exact clause after the engine limitation:

> The current flow-pair engine does not persist override flags; the plan roster remains
> the durable configuration truth.

The write mandate and conflict authority are both present again.

### F3 — accurate C7 attribution

Faulty wording:

> Push-not-poll and outage-first recovery are § C7.

New wording:

> Push-not-poll is § C7. Treat unexplained worker silence outage-first, never
> misconduct-first.

C7 owns push-not-poll only; outage-first is still a direct orchestrator mandate rather
than a false citation.

## F4 assessment

The cut node instruction was behavioral and had no citation home:

> Size your text; do not discover the cap by hitting it.

It is restored on the existing limits line without increasing line count. `node.md`
remains 150/150.

## F5

No change. The first-occurrence `human preamble` checker issue remains the separate
out-of-fence harness ticket required by the review.

## Gates

- `just pij-skill-check`: **PASS**, 0 `✗`.
- `prime/orchestrator.md`: 114/120.
- `routes/node.md`: 150/150.
- `just typecheck`: **PASS**.
