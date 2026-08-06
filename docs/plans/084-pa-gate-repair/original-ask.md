# Original ask — pa-gate-repair
**Captured**: 2026-08-05  ·  **By**: /builder

> have it run /builder flow on the isses please. builder is much updated now with dynamic documents.

Delivered via the s091 stream brief (`government/briefs/s091-pa-gate-repair.md`),
dispatch `dispatch-8c91a1e8-3e4d-4ebd-b8e7-63da08681e52`.

## The issues

`AI-Substrate/pij` — **#95** (primary, three folded fixes), plus **#99** and
**#102** pulled in by ruling R-03.

## Human rulings that shape this work

Verbatim + readings in [`rulings.md`](./rulings.md). Summary:

| id | ruling | effect |
|---|---|---|
| R-01 | *"original"* | `addedAt` preserved on **every** re-bind path, not just `--for` |
| R-02 | *"yes"* | the PA allowance covers `watchdog unwatch` as well as `watch` — scoped by **target**, not by action |
| R-03 | *"yes bring them in"* | **#99** and **#102** are in scope for this plan |

Earlier ruling, recorded on `#95` itself (2026-08-05, before this stream existed):
implement **both** the PA-self-serve fix and the prime-acts-on-behalf `--for`
fix, and **fold** the `pij state` projection fix into the same issue.

## Scope boundaries (from the brief — still binding)

Not a redesign of the PA role. Not the sub-floor capture population (`#96` —
measurement, not code). Not the chrome-detection work in `#98`. PR `#71` already
made the watchdog eligibility gate total; follow that pattern rather than
widening it.
