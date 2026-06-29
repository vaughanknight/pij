# Validation — pij-telegram-bridge-plan
**Validated**: 2026-06-29 · **By**: /validate-v2 (auto-run by the plan verb) · **Verdict**: ✅ VALIDATED WITH FIXES

- **Target**: `docs/plans/026-pij-telegram-bridge/pij-telegram-bridge-plan.md`
- **Proof**: all 8 cited code anchors verified against source — `router.ts:37` (`inbox→observe`), `loop.ts:136` (`!paneId→waiting`), `daemon.ts:69/91` (daemon skips pi-harness descriptors in its drain loop), `channel.ts` (`deliver`+`watch`), `index.ts:271` (pi receiver watches its own inbox, "SOLE consumer", tagged AC-08), `cli.ts:867` (verb intercept), `adopt --id` (fixed id), `selectTransport` in `core/harness/types.ts:20`. The self-drain-via-`harness:"pi"` mechanism is real.
- **Thesis**: advanced — purpose (phone-side seam into the control plane) is served; the plan reuses pij's existing file transport rather than inventing IPC; target proof = actual proof.
- **Consumers**: the plan's own next-phase `tasks`/`implement` stages; STANDALONE otherwise (no external consumer of these files).

## Findings (1 critic, adaptive) — 5 MEDIUM, all underspecification; all folded in

| # | Sev | Finding | Resolution (folded into plan) |
|---|-----|---------|-------------------------------|
| 1 | MEDIUM | Run model (foreground vs daemonized) implicit | Phase 3 **Run model** line: foreground; operator backgrounds it; no self-daemonize |
| 2 | MEDIUM | Lockfile "validate" semantics + stale-lock recovery undefined | Task 3.4: on start check PID — dead→auto-clean & continue, alive→refuse with `pij telegram stop` hint; mirrors daemon stale-lock reclaim |
| 3 | MEDIUM | Phase 3 test approach unspecified (Testing Strategy named only P1–P2) | Testing Strategy **Phase 3 (I/O) test approach** line added |
| 4 | MEDIUM | `/tail` with no sticky target undefined | Task 3.3: no target → same guidance reply as 2.2 |
| 5 | MEDIUM | "most-recently-active" tie-break metric undefined | Defined as `descriptor.lastEventAt` newest-first (fallback `startedAt`) in Task 1.2, AC-04, Finding 06 — uses data pij already tracks (cleaner than per-session event-log scan) |

**No CRITICAL/HIGH.** Mechanism, phase sequencing, and AC coverage are sound. Gates G1–G7 unaffected (precision adds, not gate failures) — **Status: READY** holds. Plan is implementation-ready.
