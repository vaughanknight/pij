# Prime experience survey — report

**Seat**: pij-reasonable-dove (o-prime, /Users/jordanknight/pi-hacking/pij)
**Date**: 2026-07-20
**Basis**: lived experience governing the "feature round" (3 streams: Detection
Integrity, State-v2, Identity Integrity), the omp-launcher landing, and the
overnight fleet watch. Candid — friction and failure foregrounded.

---

## 1. Genesis

My seat did NOT bootstrap the government — it inherited it via a **human-ordered
prime rotation** (Jordan typed the rotation; the outgoing `pij-primary-carp`
finished its in-flight work, informed the fleet, froze a handover pack, then
retired its marker). The government (spine, baton book, prime-flow) already
existed as files; I became "its current, replaceable operator."

**What was manual/fragile:**
- The **writer-line transfer** was a hand ritual: byte-exact SHA verification of
  the handover pack + spine seq before flipping `Writer:` lines in three files.
  Correct, but entirely convention — nothing enforces "one writer," it's honored.
- **Re-seating identity** after compaction is the fragile part. A fresh seat is
  always un-registered; the first move must be `pij adopt "$TMUX_PANE"` because an
  exported `PIJ_SESSION_ID` does not survive per-call shells but the pane binding
  does. This is a booby-trap: get it wrong and `phonehome`/`whoami` return
  `E-AMBIG`, and a stale descriptor of your OWN prior seat can wedge delivery for
  EVERYONE (INC-001 class). I hit descriptor-collision pings repeatedly.
- **Government drift on restart** is real and unguarded: dead baton holders, stale
  roster rows, orphaned peers in `pij list`. The boot sequence says "audit for
  restart drift" but the audit is manual eyeballing, not a verb.

## 2. Team formation — what I did vs kickoff.md

kickoff prescribes canary(3 legs) → brief-by-pointer → roster → adopt → orient →
preamble → work. In practice for the feature round I did NOT spawn fresh streams
per the full ritual — I **re-seated existing orchestrators** (cattle for Stream 3)
and briefed them by pointer. The steps that earned their cost:

- **Canary (3-leg, recorded at pass time)** — earns it every time. It's the only
  thing that catches a peer that booted in the wrong worktree / with no
  node_modules / on the wrong SHA. I caught a coder's worktree missing
  node_modules ONLY because its test run failed the canary; without it I'd have
  briefed a peer that couldn't build. **Keep, automate, never skip.**
- **Brief-by-pointer** — earns it. Persist packet to disk, send a path. The
  invariant (never inline a body) is load-bearing: it survives compaction and is
  re-readable by a replacement.

**Ceremony I shortcut or wish were one command:**
- **Worktree + branch + ordinal reservation** is 5+ manual steps (git worktree
  add, symlink node_modules because worktrees boot without deps, record ordinal in
  spine, record fence, record base SHA). This is THE candidate for a single verb.
  I symlinked `node_modules` by hand more than once; it's pure toil.
- **Roster sync on every event** — correct but relentless. "The row updates first,
  prose notes second" is right, but I'm hand-editing a markdown table. This should
  be a data write (see Q6).
- **Tree-push to all live streams on every roster change** — I skip this under load
  and it bites: streams go stale on who else exists.

## 3. Roles in practice

**Actually run:** o-prime (me), stream orchestrators (cattle), coders (jellyfish,
hyena, others), cross-model reviewers (spawned per-phase, cross-provider preferred),
a Telegram operator-channel seat (pij-telegram) as a pure I/O relay to Jordan's
phone, and background/non-tmux agents (fd-free, no pij descriptor) for probes.

**Invented, not in doctrine:**
- **The operator-channel seat** (pij-telegram) — a seat whose only job is to be a
  message bus to the human's phone. Doctrine treats "human channel" as abstract; in
  practice it's a named seat with swipe-reply routing. Worth naming as a role.
- **Background/non-tmux probe agents** — spawned specifically because they consume
  no file descriptors and leave no tmux descriptor, to work around the fd ceiling.
  This is a role born of a constraint (see Q8).
- **The research/PM seat** (rhinoceros, running this very survey) — a
  human-preambled peer that is neither coder nor reviewer nor orchestrator.

**Doctrine roles I never needed this round:** a formal baton-holder handover chain —
because the round was worktree-isolated per stream, batons almost never triggered
(isolation removed edit-time serialization; convergence was at merge, handled as
recorded merge-risk not a live baton).

## 4. Human preamble → work handoff

The flow: Jordan pre-ambles a peer directly in its pane, the peer then contacts me.
This survey seat (rhinoceros) is exactly that. **In practice it mostly works**, but
the failure mode is specific and I've hit it hard:

- **The preamble is invisible to me until the peer discloses it.** I have no
  durable read of what Jordan told a peer in-pane unless the peer persists it. When
  it works, the peer writes the verbatim ruling to its plan folder
  (`original-ask.md §Follow-up rulings`) and sends me the pointer — then I can
  verify on disk. When it DOESN'T, the ruling lives only in a pane scrollback and
  is lost on compaction. **This is the single biggest lossy seam.**
- **pij-blindness at boot**: spawned peers boot not knowing their pij id or who
  spawned them. I've learned to bake id + spawner + reply-form into every packet,
  but that's compensating for a gap — the peer should KNOW its lineage at boot.
- **The read-as-completed camouflage (INS-006)**: a peer says "I'll do X" and the
  stated intention gets read (by me, relaying up) as "X done," especially when
  adjacent real completions camouflage it. This is a handoff-integrity failure —
  receipt discipline (a claim without its artifact re-opens the report) is the only
  guard and it's a discipline, not a mechanism.

## 5. Scaffold verb design — `pij team scaffold --plan <manifest>`

**MUST do (safe to automate — deterministic, verifiable):**
- Create worktree + branch from an approved base SHA, **and boot it healthy**
  (the node_modules symlink/install that every worktree needs — automate the thing
  I do by hand every time).
- Reserve + tombstone ordinals atomically (no recycling dissolved ordinals).
- Spawn seats with lineage baked in: each seat boots knowing its pij id, its
  spawner, its stream, its reply-form, its worktree/branch/base. Kill pij-blindness.
- Persist the brief to disk and hand each seat its pointer.
- **Run the canary and REFUSE to proceed on fail** — record pass at pass time.
  Never brief an un-canaried seat; the manifest must make this non-optional.
- Write the roster rows as data before the seats do work (persist-before-mutate).

**MUST leave to judgment (never automate):**
- **Which work becomes a stream at all** — humans name features; the prime never
  invents portfolio items. A scaffold verb must consume a human-authored manifest,
  never generate work.
- **The human preamble / mandate content** — the "what you're actually here to do,"
  including the verbatim ruling. Automation can create the seat; it cannot author
  the intent. That must arrive from a human or the prime.
- **Fence/convergence reconciliation strategy** — how two branches will merge is a
  judgment about the work, not a template field.
- **Grant gating between phases** — whether G3's verdict lets G4 start is a verify
  step, not a scheduler tick.

**Never trust to automation, full stop:**
- **Destructive resets against a worktree with uncommitted WIP.** I learned this the
  hard way this round: a `git reset --hard` on a stream worktree discarded tracked
  WIP that was never recoverable from dangling blobs (it was never staged). A
  scaffold/teardown verb must stash+backup before ANY reset and must NEVER hard-
  delete; tombstone and preserve recoverably. This is now a hard rule for me.
- **Reaping/teardown of seats** without an age gate + recoverability (Jordan's
  explicit ruling this round: reap only >2wk old, always resumable, never destroy
  the descriptor's dataDir).

## 6. Data-driven era (plan 054) — what's still prose that should be data

A LOT. Today my highest-friction governance is **markdown-table editing**:
- **The roster** (who exists, what state, what fence) is a prose table in spine.md I
  hand-edit on every event. It should be node data — it partially is now (node
  status is "the source of concurrent truth") but the human-readable spine still
  duplicates it, and **duplicate resolvers diverge** (INS-004 — I lived this: two
  representations of the same truth drift).
- **The pending-decisions table** — should be queryable data with owner/asked/
  answered/blocked-nodes as fields, not a markdown grid. Scaffolding could surface
  "what's blocking on a human answer" as a query.
- **The baton book** — holder/resource/grant as data would let the platform detect a
  dead holder automatically instead of my manual restart-drift audit.
- **Fences** (expected touch-set per stream) — data would let the platform flag real
  convergence (two fences overlapping on a shared mutable resource) instead of me
  eyeballing it.
- Plan 054's finding stands: the runtime substrate is ALREADY atomic file-per-record
  JSON; the **governance prose spine is the outlier**. Scaffolding should write
  governance as node data and RENDER the prose, not the reverse.

## 7. Resume & replacement — "a read from disk"?

**Mostly true, with sharp exceptions.** The spine + baton book + prime-flow + briefs
+ reports DO let a replacement re-derive the operation. What was missing when I
re-seated / compacted:

- **In-pane human preambles** not yet persisted (Q4) — the biggest gap.
- **My own identity binding** — a replacement is un-registered and must re-adopt via
  pane; the prior seat's descriptor can wedge everyone until purged. "Read from disk"
  doesn't cover "re-establish who you are on the control plane."
- **Live ephemeral fleet state** — twin-descriptor re-key storms (daemon restart
  mints a new native session id for a pane → registers as a NEW session → ghosts on
  one pid). This is invisible on disk; a replacement has to diagnose it live. Two of
  my orchestrator's twins (cougar/mink) are ghost+live on one pid right now.
- **The "why" behind a held decision** — the spine records the ruling; it doesn't
  always record the reasoning that would let a replacement re-litigate it safely.

## 8. Top 3 frictions (ranked) + highest-leverage wish

1. **Identity/descriptor fragility on restart & compaction.** Re-adopt-by-pane, stale
   descriptors wedging delivery, twin re-key storms (new native id per pane on daemon
   restart → ghost twins on one pid). This is the #1 tax on every seat transition.
2. **Governance-as-hand-edited-prose.** Roster/pending/baton/fence tables I edit by
   hand on every event, with duplicate representations that diverge (INS-004). Pure
   toil + a correctness hazard.
3. **Lossy human-preamble seam + read-as-completed camouflage (INS-006).** Intent
   told to a peer in-pane can vanish on compaction; stated intentions get relayed
   upward as completions. Both are integrity failures guarded only by discipline.

**Single highest-leverage wish:** a **deterministic seat lifecycle primitive** — one
verb that spawns/adopts a seat with lineage baked in (id + spawner + stream + reply-
form + worktree/base), boots the worktree healthy, runs+records the canary, writes
the roster row as DATA, and on teardown stashes+preserves (never hard-deletes, age-
gated). That one primitive would kill frictions #1 and #2 and half of #3, and it's
exactly the `pij team scaffold` shape Jordan is reaching for.

---

## Tier-down (orchestrators/children)

Dispatched Q2/Q4/Q5/Q8 to **pij-screeching-cattle** (Stream 3 orchestrator, idle,
delivered) and **pij-nutritious-jellyfish** (Stream 3 coder, queued — mid-turn on the
G3 review). Answers to be folded in below as they return, attributed by seat id.
Both reachable; if either doesn't reply before Jordan needs the synthesis, their
persisted posture is: cattle drives Stream 3 under degrade-and-declare review;
jellyfish just returned a green C2 canary at G3 (booted in the s051 worktree, was
briefed by pointer, canary-verified before proceeding).

### pij-screeching-cattle (Stream 3 orchestrator) — verbatim-sourced
_(reply arrived stamped as its `pij-willing-mink` twin alias — itself a live datapoint
for the re-key twin problem: transport stamped a twin id for the same pane.)_

- **Q2 (formation):** The exact-base/worktree check, real canary, brief pointer,
  fence write, and phase grants all earned their cost — they caught **a stale handoff
  plus a torn reset that would otherwise have been mistaken for clean main.** Repeating
  status/SHA inventories felt ceremonial *until that reset proved why they matter.*
  Wish: one command that creates+records worktree+roster+brief, verifies HEAD/branch/
  model-first-inference, and delivers the pointer **only after all pass.**
- **Q4 (handoff):** Pointer+preamble was usable, but the handoff was **historically
  stale** — it said "no product implementation" while later G1–G7 remnants survived and
  tracked companions were gone. Nothing was lost at transport level; **truth was lost in
  artifact chronology / reset state**, costing a cold forensic revalidation. Had id/
  mandate quickly, but a **daemon restart re-keyed this same pane into 3 active
  memorable/native ids — identity became less trustworthy than the brief.**
- **Q5 (scaffold verb):** MUST — pin exact base/branch/worktree; spawn from canonical
  main then use absolute worktree paths; persist roster before delivery; encode
  allowed+forbidden paths; prove C2 with real inference/model truth; detect delivery
  mode; **fail atomically before task dispatch.** NEVER automate — phase grants,
  architecture/human rulings, destructive cleanup/reset, live-alias close/reaping,
  merge/convergence, or **interpretation of ambiguous identity evidence.**
- **Q8 (frictions, ranked):** (1) stale/torn artifacts after reset; (2) reviewer
  acquisition under provider/quota/fd constraints (pre-bind deaths, 0-token agents,
  600s one-shot timeout); (3) restart re-key twins making sender/self identity
  unstable. Highest-leverage wish: **transactional `pij team scaffold`** making exact-
  base worktree+brief+roster+C2+delivery one recoverable operation, **with restart-safe
  physical attachment identity.**

**Prime note on cattle's answer:** it independently and forcefully converges with my own
#1/#2 frictions and my scaffold-verb shape — from the coalface. Two points it adds that
I under-weighted: (a) **"fail atomically before task dispatch"** — the scaffold verb must
be transactional, not best-effort; a half-scaffolded team is worse than none. (b)
**"restart-safe physical attachment identity"** — the re-key twin problem is not just my
diagnosis; the seat living it names it as a top-3 friction, and its own reply arriving
under a twin alias is the bug demonstrating itself. This should be treated as a
blocking prerequisite for any scaffold primitive, not a follow-up.

_[PENDING: pij-nutritious-jellyfish (coder) — queued mid-turn on the G3 review; will
fold if it returns before synthesis, else its persisted posture stands as noted above.]_
