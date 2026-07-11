# Plan 037 — original ask
**Recorded**: 2026-07-11 by pij-3vetx8 (o-prime) · source: Jordan, in the o-prime's pane

Verbatim-close: "i want the ability to send the same message to multiple pij agents at the same time like a broadcast."

**Bound context**:
1. Work item = one-to-many send: the same message delivered to N named pij peers "at the same time" (fan-out semantics, receipts story to be designed — per-recipient receipts exist post-plan-032/035, incl. delivery-health).
2. **Open naming question (plan-time, needs Jordan)**: the `pij orchestration <primitive>` namespace is ruled (036 rulings #2) for orchestration primitives — does broadcast live there (`pij orchestration broadcast`), or is it a messaging-surface extension (`pij send --to a,b,c` / `pij broadcast`)? Do not assume; ask at clarify.
3. Known seam: s036 (baton primitive) holds additive-only fences on `.pi/extensions/pij/cli.ts` + `daemon.ts` — overlap is an o-prime sequencing matter (spine SW-3), settled per-file at this plan's validation.
4. Prior art pointers: pij-messaging domain (`docs/domains/pij-messaging/domain.md` — send/receipts contracts), plan 032 (honest receipts), plan 035 T014 (tick-staleness on receipts), plan 034 (watch collate window — an existing fan-IN pattern), FX001/FX002 send-path invariants.
