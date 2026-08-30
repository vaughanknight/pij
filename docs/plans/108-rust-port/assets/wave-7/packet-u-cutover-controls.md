# Coder packet — u-cutover-controls (req-0019, Jordan ruled 2026-08-31)

**Spawn form**: omp, github-copilot/gpt-5.6-sol-fast-1m, --effort high, own window.
**Worktree/branch**: /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port · s108/rust-port (SHARED — see write fence).
**COMMON**: ../wave-4/COMMON.md applies. Requirement source: docs/plans/prd/base-prd.dd.json req-0019 (read the row verbatim).

## Mission — the three cutover controls
1. **Extension cutover**: the in-process pij extension (.pi/extensions/pij/** in THIS worktree — never the canonical checkout, it is the live machine surface) targets the pij-rs daemon BY DEFAULT, speaking the v1 wire (WIRE-CONTRACT.md, wave 3).
2. **Env forceback**: a single env var (name it PIJ_DAEMON_GENERATION, values rs|legacy, default rs) forces a seat back to the legacy TS daemon — per-seat, no rebuild. Resolution order: explicit env wins, else rs.
3. **Addr/port + state dir via CLI AND env**: pij-rs client verbs and the extension both honor PIJ_RS_ADDR (env) and --addr (CLI, exists); daemon honors --bind + env equivalent; PIJ_RS_STATE_DIR already exists — verify and document all three in one table in the report. An env var set but malformed is a LOUD error naming the var and value, never a silent fallback (resolved-path error rule).

## Proof
Both-hosts matrix rerun with the cutover default: same extension build in plain pi AND omp against a THROWAWAY pij-rs dev instance (fresh PIJ_RS_STATE_DIR + port) — registers, receives a pushed turn, replies; then set the forceback var and prove the SAME seat lands on the legacy TS daemon (registration visible in TS registry). One committed transcript per host per generation. Never touch the production daemon or store.

## Write fence
Yours: .pi/extensions/pij/** (worktree copy), crates/cli config/env resolution, crates/daemon config env parsing (additive), your tests, docs/plans/108-rust-port/assets/wave-7/reports/done-u-cutover-controls.md.
NOT yours: crates/tmux/**, crates/store/**, sidecars coder's paths. Pathspec staging only.

## Done
Gate green, report with the control table + transcripts as files, then pij send to pij-revolutionary-lungfish and pij-dominant-vicuna.
