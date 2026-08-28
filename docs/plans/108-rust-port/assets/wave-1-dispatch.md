# Wave-1 dispatch package — DRAFT pending wave-0 close + Jordan's two calls
2026-08-28, pij-dominant-vicuna. Units per services.dd (SETTLED); packets get the BEGIN
IMMEDIATE line, the ruling-landing-check rule, absolute paths, fence naming shared-merge
files, and the corpus by address.

## Roster (4 coders, parallel, worktree-per-coder off s108/rust-port)
| unit | scope (one line) | tier | rationale |
|---|---|---|---|
| u-store (finish) | registry+spine to FULL contract (wave-0 skeleton -> every op, atomic writes, tombstones) | -1m | trigger (b): reads TS store shapes to write migrations |
| u-queue (finish) + u-events | queue hardening + the event bus on the spine | 400K | single-seam pair behind frozen traits; corpus-backed |
| u-tmux | TmuxPort real adapter (list/send/capture/kill/new-window/typing-gate) | 400K | single service; fixtures already captured |
| u-liveness | (pid, proc_start) verdicts + recycled detection + LivenessPort adapter | 400K | smallest unit; decision-table shaped |
## Reviewer: ONE cross-model reviewer after composition (PM composes).
OPEN CALL FOR JORDAN: gpt-5.6-sol high (lynx's ruled default; wasp went 11-for-11 findings
across two rounds on wave 0) vs cross-provider kimi-k3 (ermine's convergence caution).
Wave-0 evidence favors sol: findings were real, none refuted, no convergence observed —
but wave 0's coder was opus (cross-family by construction); wave 1's coders are sol-fast,
so the same-family risk APPLIES for the first time. Recommendation: kimi-k3 via openrouter
for wave 1, measure noise; fall back to sol if kimi under-performs.
## Cadence
PM (lungfish, retained) dispatches all four with numbered-ack gate; composes in dependency
order (liveness -> tmux -> store -> queue/events); merges main immediately if it moves;
first-light per wave = one real registry round-trip + one event fan-out on the composed tree.
## Pre-dispatch checklist (prime-owned)
- [ ] wave-0 done report + wasp APPROVE on file
- [ ] settings model rows re-minted against live pij models (PORT-NOTES TODO 1)
- [ ] Jordan: reviewer call (above)
- [ ] Jordan: go on 4-coder spend
