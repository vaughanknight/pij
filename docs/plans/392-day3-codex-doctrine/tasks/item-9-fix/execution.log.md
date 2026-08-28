# Item 9 fix execution log — semantic restorations

**Delegation**: `dlg-0010`
**Worker**: `pij-gunboat-diplomat`
**Implementation commit**: `346c19fb622e3d0292331bc74cee5dcfe7bde899`

## Restorations

- F1: selected profiles are read back and confirmed before the fleet is created; the human
  confirmation then gates roster persistence and pair start.
- F2: the plan roster is again named as the durable configuration truth when flow-pair
  override flags are not persisted.
- F3: only push-not-poll is attributed to C7; outage-first remains an inline mandate.
- F4: restored `Size your text; do not discover the cap by hitting it.` without adding a
  line, so `node.md` remains 150/150.
- F5: untouched as required; the checker repair remains a separate harness ticket.

## Gates

- `just pij-skill-check`: all green, 0 `✗`.
- `prime/orchestrator.md`: 114/120.
- `routes/node.md`: 150/150.
- `just typecheck`: passed.