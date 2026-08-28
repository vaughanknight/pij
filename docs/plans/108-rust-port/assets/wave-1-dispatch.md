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
## Reviewer: RULED by Jordan 2026-08-29 — z-ai/glm-5.3-flash via openrouter.
Cross-provider from the sol-fast coders (wave 1's first same-family-risk wave); spawn
form: `pij spawn --harness pi --bin omp --model openrouter/z-ai/glm-5.3-flash --effort high`
(confirm exact selector against live `pij models --harness omp --json` before dispatch —
openrouter ids sometimes carry a date/version suffix). One reviewer, after composition.
## Spawn form (Jordan 2026-08-28, correcting an observed copilot-CLI reviewer spawn)
Every coder/reviewer seat: OMP harness — `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast-1m --effort high` (400K units use selector `github-copilot/gpt-5.6-sol-fast`). NEVER the copilot CLI harness. Packets carry this line verbatim.

## Cadence
PM (lungfish, retained) dispatches all four with numbered-ack gate; composes in dependency
order (liveness -> tmux -> store -> queue/events); merges main immediately if it moves;
first-light per wave = one real registry round-trip + one event fan-out on the composed tree.
## Pre-dispatch checklist (prime-owned)
- [ ] wave-0 done report + wasp APPROVE on file
- [ ] settings model rows re-minted against live pij models (PORT-NOTES TODO 1)
- [ ] Jordan: reviewer call (above)
- [ ] Jordan: go on 4-coder spend
