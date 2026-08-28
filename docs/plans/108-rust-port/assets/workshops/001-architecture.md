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
- R3-AMEND-2 (D9, 2026-08-28): port traits are ASYNC via async-trait (proc-macro, no runtime) —
  forced by R1 (sqlx has no sync API; sync traits would block_on inside adapters and deadlock on
  tokio workers). Core remains tokio-free; core tests use a hand-rolled executor. async-trait is
  one allowlist row citing this amendment. Alternative (sync + rusqlite) rejected: reverses R1.
- R5-EVIDENCE (2026-08-28, ermine): fresh verified #19 recurrence — one OMP seat
  (pij-driving-nigel, lynx's fleet) running four internal scouts minted FIVE active
  descriptors sharing pid 18285 / pane %287 / one spawnId, five native session ids
  (aliases useless-eel, private-spoonbill, adjacent-wolf, cheerful-unaha). Mechanism +
  required fix source-grounded at pij#19 issuecomment-5447883985. Port consequence for
  R5 item 3: registration requires BIND EVIDENCE and subagent scoping, and the store
  needs descriptor-only reconciliation (merge/tombstone aliases by (pid,proc_start,
  spawnId) equivalence) — TS has none; no alias cleanup is safe there.
- CORPUS FINDINGS (tk-ddf1, 2026-08-28): (1) u-models corrected — TS output encodes
  no-levels as [] OR key-absent, NEVER null (null is OMP-upstream only); corpus pins both
  encodings + fails on a third. (2) `pij models --json` is TIME-VARYING (599 rows at 05:05
  -> 125 at 05:15; openrouter 479 -> 5, same machine/cwd/config) — confirms Q4 (goldens run
  against COMMITTED bytes only) and raises CANDIDATE defect row 12: catalog can shrink
  drastically without an error surface — partial upstream fetch may be reporting as success.
  UNVERIFIED as a defect; needs a TS-side look before it enters R5 proper.
- R1-CORRECTION (tk-d4c3, 2026-08-28): "migration 0001 sets WAL" is UNIMPLEMENTABLE as
  written — PRAGMA journal_mode is a no-op inside the transaction sqlx wraps every
  migration in. Ruled form: WAL is set ON THE CONNECTION at open; a test reads
  journal_mode back OFF DISK and asserts 'wal'. Also: user_version is a CACHE of the
  authoritative _sqlx_migrations ledger, reconciled at boot — never a second truth
  (second-boot no-op left the cache stale and refused a healthy store; caught by test).
- R4-TRAP, WAVE-PACKET LINE (tk-f8ff, 2026-08-28 — REQUIRED in every wave 1-4 coder packet
  touching sqlx): sqlx transactions default to BEGIN DEFERRED; two deferred writers
  upgrading read->write deadlock and SQLite returns SQLITE_BUSY IMMEDIATELY, bypassing the
  busy handler — the 5s busy_timeout is inert for exactly this case. Any write transaction
  uses BEGIN IMMEDIATE (pool.begin_with). The symptom LIES ('database is locked' reads as
  'SQLite cannot do concurrency' and invites serialization or useless retry loops).
  Proven: contention test failed on deferred, green on immediate; mutation transcript
  assets/reports/queue-mutation.md (BEGIN IMMEDIATE reverted -> deadlock reproduced).
- R7 — EVENT SCHEMA (D-ruling, tk-d162, 2026-08-28): v1 KEEPS ITS OWN SHAPE
  {v,at,kind,seat,payload}. The TS spine line {seq,timestamp,type,data} is a MIGRATION
  INPUT, never a wire contract: pij-rs never emits TS field names. TS->v1 mapping lives in
  exactly two readers — the cutover importer (phase 2) and the wave-3 parity/migration
  reader — and nowhere else. Rationale: req-0002 parity binds CLI computed payloads, not
  internal line formats; continuity-by-field-names would freeze the TS shape into the new
  system permanently for one cutover's convenience. Corpus split (malformed/rs/** vs
  malformed/ts/**, MANIFEST-tagged) is the ruled fixture layout.
- R5 items 13-14 (lungfish registry findings, 2026-08-28, 2 observations each): (13) a pi
  seat has NO route to attach its pane — `pij adopt` refuses --harness pi, so pi/omp
  descriptor rows carry pane:null while whoami knows the pane; (14) descriptor model:null
  while spawn argv AND the pane footer both know the model. One class: the registry row
  lacks facts another surface already holds — pij-rs registration/bind contract must
  carry pane + model as first-class bind evidence (u-store/u-harness).
- R5 item 15 (ermine recurrence + lynx DL-044, fleet 008, 2026-08-28): OMP relative `edit`
  resolves against the FIXED SESSION ROOT after a shell cd, while absolute `write` lands in
  the intended worktree — the cross-tree silent-write class, now seen from the OTHER tool
  face. Three-way split holds: (a) upstream OMP fix (refuse/retarget relative edit when
  task root != session root) — NOT ours to ship (no-foreign-PRs rule; report only);
  (b) pij-rs: spawn gains explicit --cwd + PLACEMENT VERIFICATION (u-harness bind evidence
  carries the resolved cwd; canary asserts it); (c) doctrine already held: absolute paths
  in every packet. Instrument note: capture the actual spawn-invocation cwd before calling
  a misroute a spawn defect — pij spawn inherits process cwd BY DESIGN today.
- R5 item 3 SHARPENED (ermine, verified recurrence 2026-08-28 06:22Z): #19 alias minting is
  MID-SESSION (~21 min after canonical: yielding-sparrow 06:01 -> alias coloured-xoxarle
  06:22; same pid/pane/spawnId/cwd/parent, DISTINCT native session ids, and the window
  field DIVERGED @251 vs @258 with live pane at @258). Two port consequences: (1) a canary
  proof EXPIRES over the seat lifetime — containment must be continuous, so pij-rs
  registration dedup runs on every registration event, never only at spawn; (2) descriptor
  equivalence-merge keys on (pid, proc_start, spawnId) but must tolerate divergent
  secondary fields (window) — the freshest live-verified value wins, the rest is history.
