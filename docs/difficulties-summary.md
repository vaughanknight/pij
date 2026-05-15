# Difficulties — summary

Derived view of `docs/difficulties.md`.
Last regenerated: 2026-05-15

## By severity

| Severity | Count |
|----------|------:|
| medium | 13 |
| low | 12 |
| high | 3 |

## By status

| Status | Count |
|--------|------:|
| encoded | 12 |
| open | 8 |
| mitigated | 8 |

## High-severity entries (still open)

_None — all high-severity items resolved or mitigated._

## Recurring themes

- Minih companion coordination remains sensitive to schema drift and failure handling, as shown by D-017 and D-025.
- Workshop/reference material repeatedly lagged the live pi APIs or template rules, as shown by D-010, D-011, and D-018.
- Fresh-clone and empty-repo paths need explicit guards rather than relying on local residue, as shown by D-012 and D-013.
- Smoke and driver flows are brittle around readiness, process boundaries, and reload timing, as shown by D-014, D-024, and D-028.
- Planning and agent skills need stronger preflight and evidence checks before emitting tasks or review requests, as shown by D-021, D-026, and D-027.
