# Mining fs3 s001 (fs3-foundations) — what the implementer's own records say
2026-08-28, pij-dominant-vicuna. Interview impossible: PM pij-bitter-gibbon DEAD
(pid gone 2026-08-26; revive fails dead-with-artifact seats, fs3 DL-040). Sources:
.harness/records/retro/2026-08-26/{004,005}.md (005 = gibbon's OWN phase-exit
retro, 10 frictions), TENETS.md item 10, gibbon data dir (~/.pij/pij-bitter-gibbon
— events.ndjson survives).

## What bites that our plan 108 must pre-empt
1. WAVE-0 GAPS NAMED BY THE RETRO: shared-toolchain PINNING (tenet 10 — one
   installed binary, one unit upgrading it invalidates siblings invisibly; pin in
   wave 0, done-receipts carry observed version) and TESTKIT-FIRST (DL-004: skill
   mandated stub-server tests but no stub existed; every adapter re-invented a
   ~110-line recorder → promote fakes into testkit BEFORE fan-out).
2. SHARED WIRE HELPERS (DL-005): the fence "two workers never touch the same file"
   FORCED ~90-line duplication of private helpers 4 units needed → plan a
   wire.rs-class shared module owned by ONE stream from the start.
3. SHARED-MERGE FILES BEYOND lib.rs (DL-007): root Cargo.toml + crate Cargo.toml +
   arch-allowlist.toml are all one-line-each merge files — name them in every fence.
4. SCOUT-BEFORE-BRIEF (DL-008): brief assumed no migration story; tree had one; 2/5
   brief items already done → capabilities survey BEFORE writing unit briefs.
5. TIMEOUT PARITY (DL-009): connect vs connect_lazy disagreed on acquire_timeout;
   only a stopwatch caught it → assert "fails within N seconds naming the fix".
6. PLATFORM DEBTS pij ITSELF OWES THE PORT: omp duplicate self-registration hit
   3x in ONE phase (DL-001/003 — our #19); peers reply without pij skill/C10
   (DL-002 → bake skill-load into spawn task text).
7. PROCESS THAT EARNED ITS KEEP: mutation gating EVERY review cycle caught two
   vacuous test passes pre-ship; four review cycles to APPROVE; ledger reconciled
   to validate --complete 0/0/0.

## Plan-108 deltas applied
- ac-0009 candidate: toolchain pinned (rust-toolchain.toml) + done-receipts carry
  observed rustc/cargo versions. testkit-first already in goals; wire.rs + shared-
  merge-file list ride the workshop.

## Addendum — revive attempted (lynx, per Jordan), precise failure anatomy
`pij revive pij-bitter-gibbon` → E-NOREG "pi native session artifact is missing"
(normal AND --print). The pij data dir SURVIVES; the NATIVE omp session file
revive replays is GONE (died in fs3's 2026-08-26 disk-full era; likely purged).
Port contract consequences (owning units: u-orchestration + u-store):
- E-NOREG conflates "registry entry missing" with "native session artifact
  missing" — same code, DIFFERENT recoveries. Rust port: distinct error variants
  (instrument-must-separate-the-states class).
- pij survives its own artifact while depending on a foreign one it never
  snapshots/checksums. Rust port: revive's dependency on the native artifact is
  either owned (snapshot), tracked (checksum + early warning), or honestly
  declared unrecoverable at death-record time — never discovered at revive time.
- events.ndjson stands as the interview substitute: the seat's complete wire
  history in its own words at the time.

## Addendum 2 — real implementer found (lynx telemetry, 2026-08-28)
The fs3 foundations were written by ONE omp coder: pij-alternative-turtle
(github-copilot/claude-opus-5 high), flow-pair dlg-0002 under PM gibbon, reviewed by mink
rev-0001..0006. Attribution: flowspace3 scratch/reconstruct/11-plan001-attribution.md.
Interview substitute (better): turtle's COMPLETE native transcript survives —
~/.omp/agent/sessions/-substrate-flowspace-flowspace3/2026-08-26T02-08-44-234Z_01a03bd3-*.jsonl
(entire scaffold source inline + every decision in sequence); flow-pair run ledger in the main
clone's .flow-pair/runs/2026-08-26T02-07-44Z-*/.
Two port-ledger updates:
- R5 item 5 REFRAMED: revive E-NOREG for omp seats is a WRONG-PATH resolution bug — the native
  artifact EXISTS (proven for turtle) while revive reports it missing. Fix resolution FIRST;
  snapshot/checksum second. All of today's "omp seats unrecoverable" verdicts are suspect.
- NEW defect row 11: omp EVAL python FILES-dict batch writes (~60 files by turtle) are invisible
  to git-ai attribution AND write/edit surveys — an implementation modality with no attribution
  trace. Port: attribution must hook the write SINK, not the tool surface.
