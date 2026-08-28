# Workshop 001 — rust-port architecture rulings
**Date**: 2026-08-28 · **Ruled by**: pij-dominant-vicuna (o-prime), decisions delegated by Jordan
("you can make some of these decisions") except where marked JORDAN. Pattern: fs3 plan-001
workshop (assets/workshops/001-architecture.md there).

## R1 — State store: SQLite via sqlx  [JORDAN-leaning, ruled by prime]
sqlx with embedded migrations (`sqlx::migrate!`), `_sqlx_migrations` checksum table. Daemon
self-migrates at boot (fs3 2026-08-26 ruling: automatic, no second command). Every db-touching
command runs a fast schema check; stale = refuse loudly naming the fix (E-STORE-SCHEMA-STALE
class). Skew rule: newer binary + older schema → migrate forward; older binary + newer schema →
refuse, never limp. Migration 0001 sets WAL + user_version. Doctor = assembler of store-crate
library checks, never a second implementation.

## R2 — Crate graph: ratified as drawn  [JORDAN, verbatim "yes, ratify that"]
core (no IO/tokio) · store · tmux · harnesses · transport · daemon · cli (one binary, two
composition roots) · testkit. Allowlist test freezes this graph; every new edge = one reviewed
row with rationale.

## R3 — Ports: the six frozen; a seventh is stop-and-ask
Registry, Spine, Queue, Transport, TmuxPort, HarnessPort as drafted in services.dd.json.
"A seventh port is stop-and-ask" lives as a comment in crates/core/src/ports.rs. Post-freeze
changes are a prime ruling, recorded here.

## R4 — Queue-first daemon semantics
A handler does exactly one cheap DB statement; everything else is a job. Dedupe = partial-unique
over live (pending/running) jobs — N rapid submits collapse to one row. Serialization = per-entity
serial keys claimed one-at-a-time (SQLite: single-writer + claim transactions stand in for PG
advisory locks). Built in wave 1 BEFORE any consumer (lynx decision #3: they re-derived this
mid-flight twice; we don't).

## R5 — TS defect dispositions: ALL fix-in-port, none bug-compatible
1 pre-bind message vanishes → delivery queues pre-bind (u-delivery)
2 seat can't see own id → id in spawn banner + whoami cheap (u-cli/u-harness)
3 subagents inherit PIJ_* and register as seats (#19 aliases) → registration requires bind
  evidence, subagent-scoped (u-harness/u-store)
4 relative-path cross-tree writes → absolute paths in packets + daemon-side cwd guard (doctrine)
5 revive E-NOREG conflates registry-missing vs native-artifact-missing → distinct variants;
  native-artifact dependency snapshot/checksum or declared-unrecoverable at death-record time;
  revivability recorded per harness type at close (u-orchestration/u-store)
6 dead-pid spine locks block machine-wide writes → lock rows carry (pid, proc_start); reap
  provably-dead holders (u-store)
7 280-char report limit undocumented → documented const, error names the limit (u-report)
8 delivered-unacked anomalies accumulate forever → rows clearable/ackable (u-anomalies)
9 watchdog blind to semanticState (parked-state nudges) + 60s-class false stalls → eligibility
  consults semantic state; thresholds configured (u-watchdog)
10 stream create refuses on dirty source checkout (E-NOREG 2026-08-28, hit by this very plan) →
  worktree creation independent of source-tree dirt (u-orchestration)
Each owning unit's packet cites its row; a coder finding an 11th files it here before coding around it.

## R6 — Wave-0 additions (retro + sailfish interview, spike-weight where marked)
a rust-toolchain.toml pin (stable + rustfmt/clippy) in the mold's FIRST commit; done-receipts
  carry observed rustc/cargo versions (retro tenet 10; sailfish corroborates: "the spike lane
  never pays for toolchain archaeology")
b testkit-first, sharpened per sailfish: not just the framework — a NAMED, ADDRESSABLE fixture
  corpus with known answers INCLUDING deliberately-broken cases, before the first unit. For pij:
  captured real CLI invocations + daemon wire traffic, malformed included, addressable by path
  in every packet.
c spike/POC lane as a first-class shape [sailfish, paid all four costs]: pocs/<name>/ template
  with bare [workspace] + .gitignore + out/, root-manifest exclude, and ONE SENTENCE stating
  spikes are outside harness checks (evidence = captured output, not a green gate). Required
  spike step: "print an eyeballable table" (caught their 58-vs-22 error).
d shared wire.rs-class module owned by one stream (retro DL-005: the fence rule forced ~90-line
  duplication x4)
e fences name the shared-merge files explicitly: root Cargo.toml, crate Cargo.tomls,
  arch-allowlist (retro DL-007)
f discovery/admission as ONE shared tested component with a case table two consumers must answer
  identically — gate-enforced agreement (sailfish #3 / fs3 discovery_filter.rs pattern)

## Standing
services.dd.json interfaces move DRAFT → SETTLED under these rulings; changes henceforth are
prime rulings recorded in this file.

## Amendments (ack ruling, 2026-08-28, pij-dominant-vicuna)
- R3-AMEND-1: LivenessPort ADMITTED as the SEVENTH port (PM ack Q2 — proc_start is real IO; the
  stop-and-ask fired exactly as designed). Seven frozen; an EIGHTH is stop-and-ask.
- R6a-AMEND-1: pin is EXACT channel 1.98.0 (machine has dual toolchains: Homebrew 1.95.0 shadows
  rustup 1.98.0 on PATH, and Homebrew cargo silently IGNORES rust-toolchain.toml — PM ack Q1).
  Gate stage-1 asserts `rustc --version` == pin, fail loud. Tenet-10's hazard, caught pre-commit.
- AC interpretations: ac-0008 arch doc lives at assets/architecture.md + crates/README.md
  (fence-respecting; promotion is a follow-up); ac-0006 golden = mechanism + captured TS
  `pij models --json` fixture (TS has no ping); real CLI parity lands wave 3 (Q3/Q4).
- Evidence: manual mutation transcripts acceptable wave 0 (no cargo-mutants) (Q5). External refs
  vendored into assets/inputs/ with sha256 SOURCES.md (Q6).
