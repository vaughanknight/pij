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
- R5 item 3, TRIGGER EVIDENCE (ermine, n=2 contrast, causality open): aliased seat carries
  __omp_worker_daemon_broker/__omp_worker_lsp_mux/rust-analyzer descendants (alias minted
  16:22:27, broker started 16:07:00); clean control same PM/folder cohort has NO
  __omp_worker_* descendants and one identity. Infrastructure-worker creation now the
  stronger trigger candidate over user-visible subagent delegation. Falsifier protocol
  (ermine's, banked verbatim in assets/reports/19-falsifier-protocol.md): disposable seat,
  snapshot attachment group, trigger LSP diagnostics, concurrent process+registry capture,
  PASS only if new identity appears post-worker-creation on same pid/pane/spawnId;
  negative control without the worker feature. Never on a live coder; close no alias.
- R5 item 3 CAUSALLY CLOSED (2026-08-28, controlled): prime's two-arm falsifier — Arm A
  (LSP diagnostics, no subagent) minted nothing; Arm B (one read-only logical subagent)
  minted alias pij-fragile-magpie on the probe's pid within seconds, no new OS process.
  Worker-process hypothesis formally withdrawn by its author. Report:
  assets/reports/19-falsifier-run.md.
- PROCESS RULE, waves 1-4 (review round 1, 2026-08-28): A RULING NEEDS A LANDING CHECK —
  twice a same-day ruling was recorded but the code/test kept asserting the opposite
  (watchdog eligibility vs services.dd; thinking Option<Vec> vs the absent==empty ruling).
  From wave 1: every ruling names the artifact it must change; the ruler (or PA) verifies
  the diff landed before the ruling is cited as in-force. A recorded-but-unlanded ruling
  is a green that lies at the doctrine layer.
- R1/AUTH CORRECTION (review round 1, highest severity): publish-BEFORE-bind is WRONG —
  it let a doomed second daemon overwrite a healthy daemon's credential, and
  OpenOptions::mode() applies only on CREATE so restart-into-existing-0644 republished
  world-readable. Ruled shape: stage key -> BIND -> atomic rename (ordering property
  survives; bind only opens the socket). NOTE: fs3's auth.rs publishes before bind and
  likely carries the same second-daemon clobber — relayed upstream to lynx.
- WAVE 1-4 BANKED LESSON (review rounds 1-2, 2026-08-28): "every finding was a promise that
  held for the cases I checked" — the recurring gap is coverage-shaped, so structural
  closures beat local fixes: (a) regression suites ENUMERATE the surface they guard (every
  public db op) so additions are covered-or-red; (b) THE GATE MUST NOT MUTATE THE TREE IT
  JUDGES — cargo silently updating a stale Cargo.lock made every local build green on a
  tree nobody else could compile; gate gained a --locked metadata stage; (c) receipts over
  documented steps (ac-0001 = clean archive + --locked build/test + worktree-clean-after);
  (d) resolve judged paths at RUNTIME (env!(CARGO_MANIFEST_DIR) is compile-time — a gate
  binary judged a deleted temp tree from anywhere; silent form = green for a checkout
  nobody is looking at).
- WAVE-1 FIELD NOTES (2026-08-29): machine-wide #19 census — four pre-existing pid groups
  carry multi-descriptors (11456x4, 14495x6, 18285x5, 39459x2) while all four wave-1 coder
  pids scan clean; reconciliation backlog is real and quantified. And a receipt-vs-code
  instance INSIDE the fleet: PM's seam commit said #[serde(skip)] while code had
  skip_serializing_if — cursor would have hit the R7 wire the moment it was Some; coder
  gurgeh read merged code against the ruling rather than trusting the commit message; fixed
  ae78332b with wire-absence now ASSERTED (tailed vs fresh event byte-identical). The
  wave-0 lesson (verify the artifact, not the report) is reproducing in coders unprompted.
- WAVE-2 PRECEDENTS (PM rulings, 2026-08-29, ratified by prime): (a) STALENESS AXIS — a card
  is stale on the clock alone (>10min default, configured never const); parking suspends
  NUDGING only; u-report freshness must NOT consult semantic_state, u-watchdog eligibility
  MUST (parity with TS; first-principles would have silently broken it). (b) models() on an
  unavailable catalog returns an ERROR, never an empty Vec — empty CLAIMS no models (the
  absent-vs-empty collapse, again). (c) R5 item 16: state+note spans Registry then Spine
  with NO atomic path across the frozen ports — partial failure is REPORTED (state landed,
  note did not), never faked atomic; visible limitation for wave-3 surface design.
  (d) Parity-first on names: anomaly kind stays delivered-unacked-stale per live TS; the
  packet's shorter spelling was a packet defect, recorded as a decision not left as a
  discovery. (e) A branch a ruling mandates must be TESTABLE the day it lands — u-report's
  partial-failure path got a scripted-failure fake capability the same day (the
  exercises-the-path-not-the-property shape, caught at ack).
- WAVE-2 COMPOSE NOTES (2026-08-29, 2132d73f): (a) fixture-manifest trap — sha+bytecount
  matched the manifest because the AUTHOR hashed what the author wrote; only reading CONTENT
  against the ANSWER field caught 16 blank rows (pane taller than content); corroborating an
  artifact with your own hash is N=1. Non-blank assertion added. (b) frozen-Queue cross-seat
  claim (inbox could claim another seat's job): ruled the boring fix — kind=delivery:<seat>,
  one formatter, no trait widening. (c) NotDeliverable's text promised 'queued, not lost'
  unconditionally = false receipt for the tombstoned case; new variant granted rather than
  weakening the one honest error. (d) FIVE harness adapters + registry over a parameterised
  pi/omp composite: a composite kind() has no truthful value; pi and omp differ in artifacts
  and anchors. (e) LIVE TS EVIDENCE for R5 item 8 / PRD req-0008: receipt
  1787963637387-000001-89164 reported DELIVERED for a body that never injected into the
  recipient's turn (recipient was u-delivery itself, mid-build) — the delivered-is-suspect
  inversion reproduced on a pij receipt, recorded in the unit's assumptions.

## R3-AMEND-3 — Transport::can_deliver carries the message (2026-08-30, vicuna ruling)

**ACCEPTED**: `Transport::can_deliver(&SeatDescriptor)` widens to
`can_deliver(&SeatDescriptor, &Msg)`. PM escalation (lungfish), recommendation ACCEPT, taken.

**The evidence that forced it** (s105 first-party, verified on-machine): a remote-control
command (`/compact`, `/new`) MUST take the pty path even when the seat has a healthy socket —
Claude renders a socket-delivered `/compact` as plain TEXT instead of executing it. The correct
transport therefore depends on the MESSAGE, not only the seat.

**Why in the seam and not a carve-out**: an out-of-band rule a reader cannot see from the
trait is exactly the rule that rots (three waves of house evidence; twin of
computed-but-unconsulted). The refusal fallback (routing-policy carve-out + trait doc note)
was workable, not good.

**Why now is cheap**: one fake impl + one consumer, both in-tree, both the PM's to migrate at
compose; u-uds has NOT dispatched. After u-uds ships against the old shape this becomes a wire
rename. Timing is the whole argument — the same amendment post-dispatch would likely be REFUSED.

**Ratified alongside (PM's own calls, endorsed)**: rung-4 typed-body path does NOT exist in
u-uds (last body-loss path upstream; R4 removes its reason to exist); codex stays on the
pointer path for wave 3 (fork's app-server design has zero live proof — no inheriting design
without evidence mid-wave); /v1/send accepts LOCAL destinations only this wave (origin side
does not route; destination side always enqueues locally — req-0017 routing lands with
federation, not before).

## Cross-government compare (2026-08-30, lynx's sol-fast reviewer — Jordan's courtesy exercise)

Report: flowspace3 scratch/arch-compare-pij.md (62 file:line cites, independently rechecked).
Convergent on 9 majors; our three declared divergences all judged PRINCIPLED.
- **STALE-NOTE CORRECTION**: our row-53 framing ("fs3 publishes key before bind") is now
  historical — fs3 main adopted stage->bind->publish->serve; key ordering is IDENTICAL.
- **DRIFT accepted as wave-3 fix**: build_services opens the same SQLite store three times
  (daemon lib.rs:129,135,141) — one Pool<Sqlite> feeds all three constructors; saves up to
  12 connections + repeated open/migration. Owner: compose (lungfish), wave 3.
- **Two SUPERIOR-ADOPT flowing back to fs3**: our raw unknown-event-byte preservation, and
  our hardened arch gate (required 'why', runtime workspace resolution, --locked metadata).
- **Standing item**: promote the architecture map from plan-108 assets to a repo front door
  before the plan closes.

## R3-AMEND-4 — new_window carries an optional command (2026-08-30, vicuna ruling)

**ACCEPTED**: `TmuxPort::new_window(session, name, cwd)` widens to carry an OPTIONAL command —
executable + discrete argv, no shell string. `None` preserves today's empty-window behaviour.
Still seven ports; additive in meaning.

**The load-bearing reason** (beyond "tmux takes the command at window creation, so no ordering
under the old signature can launch inside a window"): the descriptor stamp must derive from THE
ACTUAL ARGV EMITTED, not the request that asked for it — `cross_session_inbound_accept:
Some(true)` only if the accept pair really went on the command line. Assembling argv where the
launch seam cannot see it makes the stamp an assumption, the exact defect the field prevents.

**Rejected alternatives, ratified as rejections**: launch-then-adopt (window exists before its
process; seat registered against a pane that may never get one); shell string (quoting as
attack+bug surface in a launcher carrying user-supplied model ids/paths); ninth crate
(contradicts the ratified eight).

**PM rulings in the same ack, endorsed**: plan builder lives pure in pij-harnesses; POST
/v1/spawn stores only AFTER an observed launch (store-first = false live row; store-after-
unobserved = delivered-without-observation in costume); from-mode STRUCK from the unit (no
destination field exists and the UDS ruling forbids inventing one).

**Precedent note**: second seam change accepted at an ACK with zero implementations built
against the new shape ([[seam-change-window]] holding twice in one plan).

## Wave-4 federation ratifications (2026-08-30, vicuna)

**R4-AMEND-1 — Queue::retry(job_id, delay), ACCEPTED**: atomic in the store — row returns to
pending with attempt count incremented, one transaction. No eighth port. The argument that
carried it: Queue is the ONE WRITER of attempt accounting; ack-then-enqueue has a crash gap
that LOSES the message, enqueue-then-ack violates live dedupe, and ratifying once serves both
u-federation (failed remote send) and u-pointer (re-announce) instead of two units inventing
two mechanisms for one problem.

**R7-AMEND-1 — Msg.from_machine: Option<String> + wire field, ACCEPTED**: None = local,
symmetric with Destination.machine. Additive on the frozen v1 wire; u-extension consumers must
TOLERATE the new optional field (unknown-field tolerance is already our shipped posture —
raw unknown-event-byte preservation). Without it a forwarded message arrives with no way to
address the origin machine, and a same-named seat trips the self-address refusal.

**Scope cut ratified**: wave 4 federation = REMOTE SEND ONLY. Registry fan-in / roster / event
streaming deferred — five defects were one fact from five angles (no machine field on
SeatDescriptor, /v1/seats can't express two alices, scalar events cursor, POST-only peer
client, second-seq spine loops), every one a wire change; the deferred half gets a packet
written from knowledge, not assumption. NOTE FOR PRD: req-0017's registry-visibility half moves
past wave 4; row stays unchecked until it lands.

## Wave-4 second-round ratifications (2026-08-30, vicuna — ruled together on lungfish's escalation)

**R4-AMEND-1 CONFIRMED, now corroborated**: u-pointer found the identical Queue hole
independently from the other end (lease expiry terminal; enqueue-before-ack dedupes against
the running row; ack-before-enqueue loses the body). Two units, one missing capability —
`retry(job_id, delay)` stands as ratified. NOTE: independent discovery by two units working
the same tree is real corroboration (different probes, same subject) — unlike two readers of
one projection.

**R4-AMEND-2 — Job.attempt column, ACCEPTED; migrations unfreeze for EXACTLY ONE migration.**
The honesty catch is the record-worthy part: "one writer for attempt accounting" had been
quoted into three packets as a property of our tree while being a property of NOTHING — an
anti-goal inherited from reading the fork, repeated as if built. (House pattern: verify
presence claims like absence claims.) The retry amendment is where it becomes real; attempt is
born WITH its one writer rather than retrofitted across two.

**R3-AMEND-5 — separate TmuxPort::submit(pane, text), ACCEPTED** over a submit flag on
send_keys: "type without sending" must stay expressible as its own verb — the composer guard
and the human-typing politeness gate depend on that distinction being REAL in the seam, not a
boolean a caller can forget. send_keys stays literal-only.

**PM scope call endorsed**: u-pointer narrowed to the pure ladder table + pointer rendering;
drain worker and pty rung wait on the seams. Half a unit that is honest over a worker that
fakes a retry.

**Wave observation, banked**: every wave-4 unit touching delivery found the remaining gaps in
the QUEUE, not the transport — waves 1-3 built around the queue and never asked it to do
anything hard. Carry into the deferred-federation packet: budget queue work FIRST.

## R3-AMEND-6 — TmuxPort gains the pane tap (2026-08-30, vicuna ruling)

**ACCEPTED**: `TmuxPort` widens to carry attach/drain pane-tap plus cursor facts, with
implementers and fakes. The disqualifying fact for every alternative: poll-to-poll diffs on a
RENDERED capture cannot truthfully identify a keystroke or an Enter — they miss type-then-Enter
between polls and conflate TUI redraws with human input. A politeness gate answering from a
sensor that cannot tell is the gate's own defect wearing a coat.

**Why in the port, not a concrete API beside it**: the port is where fakes live; a sensor
outside the trait stops being injectable and every decision-table test above it becomes an
integration test. Tmux IO belongs to the tmux crate BY CONTRACT, not by convention.

**PM rulings taken without escalation, ENDORSED**:
- `record_unknown(pane)`: clear -> unknown -> blocked is a testable transition; without it,
  stale permission survives an inability to see.
- The nonblank->blank transition is named for what it OBSERVES (composer cleared), never
  claimed as an Enter — cancel and clear are indistinguishable ([[report-is-not-evidence]]
  applied at the keystroke level).
- The TS 60-second first-sight release is NOT ported: age cannot distinguish a parked draft
  from a paused human; a stale nonblank stays blocked, and no threshold is invented to make a
  rung reachable.

## R4-AMEND-3 — atomic delivery dedupe in the Queue (2026-08-30, vicuna ruling)

**ACCEPTED**: two delivery-specific Queue methods, no eighth port —
`enqueue_delivery` (ledger-check + enqueue-or-collapse, ONE transaction, returns queued id OR
the stored `Delivered{origin}`) and `ack_delivery` (validate claim + record
(recipient,msg_id,origin) + prune to capacity + ack, ONE transaction). Generic enqueue/ack
stay for non-delivery work. **Schema 8 APPROVED** — the second sanctioned migration; the
wave-4 "exactly one" bound is amended by this ruling, not eroded silently.

**The proof pattern**: check-then-enqueue loses (ack commits between, frees the dedupe key,
second row); record-after-ack loses inversely (delivered, crash, ledger never learns, retry
redelivers). Same theorem as Queue::retry — delivery invariants are transactions or they are
prose.

**Origin replay (coder's insight, singled out)**: a suppressed duplicate answers with the
STORED `Delivered{origin}` — `Queued` would claim a row that does not exist; non-ok makes
federation refuse or retry a message that WAS delivered. Honesty preserved with zero new
vocabulary: the receipt says what was observed, when it was observed.

**PM policy endorsed**: per-recipient bound, oldest-first eviction (a global count lets one hot
recipient erase everyone's protection), residual window NAMED (evicted id + no live row =
redelivery) — config, not constant. Event suppressed with the row so "seen once" is true of
message.pushed too.

**D9 rider (E-030 one level up)**: drain survives errors only because COMPOSITION catches
drain_once before TickLoop sees it, and no test exercises that production wrapper — CLOSE THIS
WAVE: the loop rule applies to the wrapper actually shipped, not the loop the test constructs.

## R4-AMEND-4 — note_delivered closes the transport-direct dedupe hole (2026-08-30, vicuna)

**ACCEPTED**: one Queue method, `note_delivered(recipient, msg_id, origin) ->
Result<Option<DeliveryOrigin>>` — atomic check-and-claim in the ledger's one owner. Direct
route calls it BEFORE injecting; `Some` = suppress + replay recorded origin, `None` = the
caller now owns the right to deliver. Both rejected alternatives ratified as rejections:
queue-routing every local send kills the mid-turn socket delivery wave 4's inversion exists
for; separate record/read reintroduces the check-then-act race the amendment family removed.
Third instance of the same theorem: delivery invariants are transactions or they are prose.

**RIDER (vicuna, binding)**: claim-before-inject has the INVERSE window — claim lands, inject
fails or the process dies, and a later retry is suppressed into a replayed
`Delivered{origin}` for a message that never arrived: a LOST message wearing our most
confident receipt, which violates the honesty doctrine harder than a duplicate ever could.
Required: (a) a SYNCHRONOUS inject failure compensates in the same call path — the claim is
deleted so the retry can deliver; (b) the residual window (hard crash between claim and
inject) is NAMED in doc + test the way the eviction window was, not discovered later; (c) the
witness test runs the failure path, not only the happy path (E-030 rule applies to this fix
too).

**PM self-diagnosis elevated to COMMON rule**: three of four fixes landed in one half — the
path the FINDING described, not the path the DEFECT lives on. Rule: every fix names the path
it executes on, and the reviewer verifies the fixed branch is REACHABLE through the shipped
pipeline (E-027's unreachable-cursor branch is the type specimen; the peer now refuses an
impossible cursor by name and the worker treats that refusal as Reset).

## Wave-6 inbox ruling — two-step claim/ack over HTTP (2026-08-31, vicuna)

**ACCEPTED**: `GET /v1/inbox` claims and records nothing; `POST /v1/inbox/ack` records
`ReaderRead` for the ids the client actually received; an expired delivery claim RETRIES via
the existing `Queue::retry` instead of failing terminally (the piece that makes two-step
honest). The defect this kills: in-process inbox acked ReaderRead BEFORE returning — over
HTTP the ack commits before axum writes a byte, so a disconnect loses the body while the
ledger says the recipient READ it: the strongest word in the vocabulary minted with no
observation. Residual NAMED: duplicate read (read, died pre-ack, redelivered) —
duplicate-over-lost-with-a-lie, ruled for the third time, now doctrine.

**Riders**: (1) the ack row records WHICH bearer key acked, so machine-granularity attestation
is auditable, not silent; (2) seat-level auth is backlog with trigger "two mutually untrusting
seats share one machine key"; req-0007 gains one sentence: the key authenticates a MACHINE —
ReaderRead over HTTP is attestable to machine granularity only. PM's R4 page-bound carve-out
endorsed. Rejections ratified: ack-after-response-bytes (axum cannot attest landing),
request-issued ReaderRead (claim-without-observation), peek-without-claim (new port method +
duplicate reads).

## R3-AMEND-7 — Spine::latest_matching (2026-08-31, vicuna ruling)

**ACCEPTED**: `latest_matching(&SeatId, kinds: &[&str]) -> Result<Option<Event>>`, kinds
non-empty, seat scope MANDATORY, highest-seq match or None; `EventBus::history` DELETED in the
same change — clean cutover, no parallel API. The defect it removes: the ENTIRE unbounded
spine scanned into a Vec on EVERY successful inbox claim to answer a one-row question,
discarding a seat predicate the store already accepts — the cost of reading your mail grew
with the total history of the machine.

**Doctrine pairing (banked)**: this is the attestation ruling's bounded-ledger trap arriving
from the opposite direction — there, durable audit was headed onto a structure that EVICTS;
here, a one-row question was answered by scanning a structure that GROWS. One root cause both
times: not asking what the read actually needs.

**The instrument is the ratified part**: a CountingSpine testkit double that records
latest_matching calls and FAILS on tail from this path — one bounded call, zero scans,
asserted at the service boundary; SQL LIMIT 1 proven separately against real SQLite. A cost
claim without an instrument is a comment; this is a defended contract.

## Ports amendments 8 & 9 (2026-08-31, vicuna ruling — ratified together as one correction twice)

**AMEND-8 — consent across a restart (F2), ACCEPTED**: `TmuxPort::pane_tap_sink(pane) ->
Option<PathBuf>`, and `detach_pane_tap` accepts process-local tracking OR a matching durable
`@pij-tap-sink` marker as ownership proof. Not a relaxation of E-033 (pipe existence != 
ownership) — it is E-033 used for the case it was invented for: after a crash the
process-local set is empty BY DEFINITION, which is precisely when consent is least defended.
The observer sources retirement from the WORLD (real panes, minus live non-tombstoned
registry panes, detach every marked unwanted pane), not from a set a restart empties.

**AMEND-9 — unforgeable attestation (F3), ACCEPTED**: `Queue::ack_delivery` returns
`DeliveryAck { recipient, msg_id, origin }` (was `Result<()>`); SqliteQueue reads serial_key
inside the same write transaction, so the recipient is authority-owned and exists only after
commit. HTTP publishes AFTER success, seats the event from `ack.recipient`, ignores the body
for attribution. Closes: attestation event published BEFORE the ledger write, seat taken FROM
THE REQUEST BODY — any machine key could mint spine rows asserting reads by any seat.

**Recorded with its embarrassment intact, at the PM's own insistence**: attestation was ruled
onto the spine because the ledger evicts — durable storage chosen for a FORGEABLE assertion,
without checking the claim being relocated was true. E-034 on the very surface built to
prove reader-reads. The shared correction: replace inference with an asked question — ask the
WORLD what it owns; ask the AUTHORITY who read.

**Merge discipline ratified**: stream branch merges composed head rather than cherry-picking —
true ancestry, one author.
