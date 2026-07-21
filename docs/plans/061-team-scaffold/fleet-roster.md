# s061 fleet roster — durable build-config truth

**Ruling (Jordan, 2026-07-20, verbatim)**: "copilot gpt 5.6 sol coder, terra reviwer please." · Scope: **this-stream** (standing default for s061 phases unless re-ruled per-phase; NOT fleet policy — mastodon downgrade lesson).

| Role | Harness | Model | Effort | Seat id | Canary | Status |
|------|---------|-------|--------|---------|--------|--------|
| Coder | copilot | gpt-5.6-sol | xhigh | pij-shy-justine (%2018) | PASS 2026-07-20 (nonce 7391-kestrel; model/effort/cwd/branch all match; reply arrived as pij message — compliance OK under explicit demand; boot-ack non-compliance logged DL-001) | dispatched dlg-0001 |
| Reviewer | copilot | gpt-5.6-terra | xhigh | pij-atomic-troblum (%2030) | PASS 2026-07-20 (nonce 4482-heron; model self-report + branch + cwd match; head=8627aa0 base as expected pre-commit; effort self-report "default" — xhigh pin held at spawn/state, in-context honoring unverifiable, caveat only; 2 clean turns = no-400) | dispatched rev-0001 |

Cross-model at review: satisfied (sol ≠ terra). Placement: splits in PM's window (pij-ancient-rhinoceros, window `pm`), inheriting worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s061-team-scaffold` via spawn cwd. Seat ids + canary records filled at spawn time, before any dispatch.

Resolved 2026-07-20 (dove, verified live): omp READY for core seats (`pij spawn --harness pi --bin omp`); caveats — no focus save/fork, `--effort` honoring unverified. Ruling applied: proven copilot stack for P1; omp as deliberate experimental seat later (dove offers effort-canary first). Facts: `.harness/temp/omp/omp-control-plane-facts.md` (canonical repo).
