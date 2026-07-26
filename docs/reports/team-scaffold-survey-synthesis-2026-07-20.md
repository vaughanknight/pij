# Team scaffolding in the real world — survey synthesis

**Author**: pij-ancient-rhinoceros (research/PM seat, human-preambled by Jordan)
**Date**: 2026-07-20
**Sources**: doctrine read (prime route, protocol, orchestrator, kickoff, bootstrap, node/plan-054) + lived-experience surveys of two governments:

- **pij-reasonable-dove** (o-prime, pi-hacking/pij — 3-stream feature round, store-native cutover, prime rotation) + tier-down: **pij-screeching-cattle** (Stream 3 orchestrator). Coder pij-nutritious-jellyfish addendum pending.
- **pij-superior-mastodon** (o-prime, voxel-flying-game — 4 streams / ~2 days, incident-heavy) + tier-down: **pij-pregnant-stoat** (s3, shipped), **pij-permanent-gull** (s4). s2 pij-light-squid pending (mid-flight, honestly not substituted).

Raw reports: `scratchpad/prime-survey/report-pij-reasonable-dove.md`, `report-pij-superior-mastodon.md` (session scratchpad; copy before session GC if wanted durable).

Calibration flags recorded: mastodon's fleet self-describes a "paranoid gate culture" (some friction self-inflicted); s3 stoat disclosed it never ran formal canaries ("judgment wearing a protocol's name — do not count it as compliance").

---

## 1. How teams actually form today

Nobody runs kickoff.md's 17 steps as written. The lived compression, consistent across both governments:

1. **Canary the seat** (or skip it and judge from first output — stoat).
2. **Allocate at brief time**: ordinal + worktree + branch + base SHA (5+ hand steps incl. the node_modules symlink every worktree needs).
3. **Write brief, persist to disk, deliver by pointer.** Follow-up re-send of the task because nobody trusts the inline spawn brief to survive binding (stoat, systematically).
4. **Get out of the way** — push-first waiting, packets on disk.

Genesis paths observed: hand-seat + `/pij prime` self-scaffold (mastodon); inherited government via human-ordered prime rotation with frozen handover pack (dove). Both entirely convention-enforced — nothing enforces one-writer, writer-line transfer is a hand ritual.

### Steps that earned their cost (unanimous)

- **The 3-leg canary** — caught: a worktree with no node_modules (dove), a dead coder named in a brief (mastodon leg c), a stale handoff plus a torn reset masquerading as clean main (cattle). Legs (a)/(b) are pure plumbing → automate. **Leg (c), brief-ack in the seat's own words, is the only step that tests comprehension → never automate.**
- **Brief-by-pointer** — survives compaction and seat death; a coder died mid-round and lost nothing (stoat).
- **Descriptive fences** — made notify-vs-synchronize decidable without a meeting.
- **Allocation-at-brief-time** — with one recurring bug: **base SHA quoted at brief-write goes stale when the allocator's own commits advance the base. Rule: resolve at worktree-create time, report the actual value** (mastodon, hit live).

### Steps universally shortcut

Everything mechanical before the ack: nonce, registry check, worktree create, branch, SHA resolve, node_modules boot, pane bookkeeping, watchdog registration, roster skeleton. Mastodon typed it 4×; gull counts 5 manual steps per seat, twice per phase-fleet — "and forgetting the watchdog line is silent."

## 2. Roles in the wild that doctrine doesn't name

- **Vendor/platform contact** — mastodon holds a standing feedback contract with dove (pij's own prime). One of the highest-value relationships in its fleet; exists purely by convention. "Nothing in doctrine says a prime should have a named upstream."
- **Operator-channel seat** — pij-telegram: a seat whose only job is being a message bus to the human's phone, with swipe-reply routing.
- **Research/PM seat** — this survey seat: human-preambled, neither coder nor reviewer nor orchestrator. (The exact "project manager" role Jordan wants in scaffolded teams — it exists, unnamed.)
- **Held/tombstoned seat** — s1 stayed alive a day after landing "because it holds context"; caught mis-paned human rulings by accident. No doctrine state for it.
- **Background fd-free probe agents** — born of the fd-ceiling constraint; no tmux descriptor.

Doctrine machinery that went unused: formal baton chains (worktree isolation made batons rare — isolation works); a second prime.

## 3. The human-preamble seam — biggest lossy interface

The "Jordan preambles a seat directly, seat then contacts its prime" flow **works** — intent arrives first-hand, better than any relay ("every time I paraphrased him I eventually got it wrong; every time I quoted him I did not" — stoat). Failure modes, all lived:

| Failure | Instance |
|---|---|
| Preamble invisible to the parent until the peer volunteers it; lost forever if the pane compacts first | dove: "the single biggest lossy seam" |
| Mis-paned rulings — authority derived from where typed; human doesn't track panes | mastodon: ≥3 consequential rulings into wrong panes in 2 days |
| Situational choice promoted to standing policy | mastodon, twice; had to send a downgrade round |
| Bare seat-name pasted with no verb — seat guesses intent | gull, twice ("inference where there should be substrate") |
| Truncated relays (cut mid-word) | stoat, twice in one day |
| Human message interleaving mid-turn with peer traffic; principal-vs-peer by vigilance only | gull |
| Stated intention relayed upward as completion (INS-006 camouflage) | dove |

**Cheap class-killers proposed from the coalface:**
- **Scope field on every ruling/brief: `this-task` / `this-stream` / `standing`** (stoat; mastodon endorses — kills the promotion class).
- **Preamble (or pointer to it) auto-lands in the parent orchestrator's inbox at seat-contact time** (gull).
- Persisted verbatim-rulings file per stream as the default preamble artifact (dove's working pattern).

## 4. Identity is the blocking prerequisite

Independently top-3 in both governments:

- **Restart re-key twins**: daemon restart mints a new native id per pane → same pane holds 2–4 "active" ids on one pid. Cattle's own survey reply arrived stamped under its `pij-willing-mink` twin alias — **the bug demonstrating itself inside the survey about the bug**. Cattle: one pane re-keyed into 3 active ids; "identity became less trustworthy than the brief."
- **Stale descriptors wedge delivery for everyone** (INC-001 class); a fresh seat is always un-registered and must re-adopt by pane.
- **pij-blindness at boot**: peers don't know their id, spawner, stream, or reply-form; every prime bakes it into packets as compensation.
- **Model provenance**: `boundModel` records the spawn *request*, never verified, and doesn't track in-place switches (confirmed live). Mastodon's fleet hand-rolled a three-way grading: registry pin / human-stated / rendered runtime.

Both dove and cattle name **restart-safe physical-attachment identity** as a prerequisite for any scaffold primitive, not a follow-up. (s051 identity-integrity is the live stream on exactly this.)

## 5. The convergent design principle: receipts

Mastodon's three seats, without comparing notes, each asked for the same shape:

- s3: a **dispatch receipt** — send a brief FILE, get back proof the seat received and parsed it, echoing packet id + its declared runtime. "Everything else on my list is a checklist; this is a missing primitive."
- s4: a **liveness signal** on the human's live app window.
- mastodon: **scaffold verbs that cannot silently no-op** (lived: a baton grant with wrong args exited 0, printed the posture block, did nothing).

Dove's government independently supplies the same class: read-as-completed camouflage, claims without artifacts, manual restart-drift audits.

> **Every primitive emits evidence of what it actually did; no primitive has a path where doing nothing is indistinguishable from doing the thing.** ("Judge the artifact that can distinguish the states you care about." — mastodon fleet)

A scaffold verb that half-creates a team silently would be the most expensive instance yet of this bug class. Corollary from cattle: **fail atomically before task dispatch** — a half-scaffolded team is worse than none.

## 6. The automate / judgment / never matrix (unanimous across 5 seats)

**Automate (deterministic, verifiable — today's hand-typed toil):**
- Worktree + branch from base **SHA resolved at create-time**, booted healthy (deps installed/symlinked)
- Ordinal reservation + tombstoning, atomic
- Spawn with **lineage baked in at boot**: own id, spawner, stream, reply-form, worktree/branch/base
- Model pin + **rendered-runtime capture at spawn** (recorded separately from the pin)
- Canary legs (a) nonce + (b) registry identity — **refuse to proceed on fail, record at pass time**
- Brief persisted to disk, pointer-delivered **with receipt**
- Allocation/fence/roster rows written **as data before work starts** (persist-before-mutate)
- Watchdog registration; forbidden-paths boilerplate in every packet
- Independence checks (compare declared runtimes cross-family at dispatch)

**Judgment (a manifest slot, never generated):**
- Whether work becomes a stream at all (humans name work — invariant holds)
- Canary leg (c): brief-ack in the seat's own words
- Brief/mandate content — "product-pillar reasoning a manifest cannot hold"; what the packet *asks* ("today's real finding came from a question nobody had asked before" — stoat)
- Fence negotiation on overlapping surfaces; merge/convergence strategy
- Coder/reviewer model choice (Jordan's explicit ruling: varies by task complexity)
- Phase grants (a verify step, not a scheduler tick)

**Never automate:**
- Verdicts (a CLI once scaffolded `verdict: APPROVE` with empty findings before any reviewer saw the code — stoat caught it in minutes)
- Marking done (done is a claim until verified — platform already right)
- Destructive resets/teardown: `git reset --hard` on a stream worktree destroyed unrecoverable tracked-unstaged WIP (dove, lived). **Stash+backup before any reset; tombstone, never hard-delete; age-gated reaping, dataDir preserved**
- Cause attribution; interpretation of ambiguous identity evidence; anything touching the human's live app window

## 7. Still prose, should be data (post-054)

Ranked by pain across both fleets: (1) allocation + fence records — "who owns `project.godot`?" answered from memory; (2) roster/pending-decisions/baton book — hand-edited markdown tables whose duplicate representations diverge (INS-004); (3) model provenance as three seat fields (pin / stated / rendered), none authoritative alone; (4) standing safety holds (never-GC lists, kill-pattern rules) inherited by spawned seats as data; (5) incident/finding lineage — a finding node with open→routed→fixed→verified lifecycle; (6) the resume packet: "a prime's resume packet should be generated, not authored" (mastodon hand-built `situation-<date>.md` minutes before compaction; dove's Q7 gaps are the same list: open asks, in-flight dispatches, pending human questions).

Direction confirmed by both primes: **write governance as node data, render the prose** — the store-native cutover is the right bet; scaffolding should be born store-native.

## 8. Proposed scaffold patterns

### A. `pij team scaffold --manifest <file>` — the transactional core

The #1 explicit ask of dove, cattle, and (as "can't silently no-op") mastodon.

- **Input**: a human/prime-authored **team manifest** — streams, roles (orchestrator/coder/reviewer/PM), harness+model+effort per seat, plan pointer, fences, base ref, brief paths. The manifest is where judgment lives; the verb only executes it.
- **Semantics**: transactional and resumable — every step emits evidence (created X at Y, sha Z); first failure → clean recorded rollback or explicit resumable checkpoint; **no dispatch until all seats pass canary legs a+b**; refuses, loudly and namedly, rather than half-creating.
- **Per stream**: project/task/state nodes → worktree+branch (SHA at create, healthy boot) → ordinal reserve → spawn with lineage env → canary a+b → brief pointer + receipt → allocation/fence/roster as store data.
- **Stops at the judgment line**: team ends in `briefed / awaiting-ack` state. Leg (c) acks, human preamble, and WAITING_FOR_BUILD_CONFIG-style confirms remain interactive. **Scaffold creates the team; it never starts the work.**

### B. Seat lifecycle primitive (scaffold's building block)

One verb per seat: spawn/adopt with lineage baked → boot-healthy → canary a+b recorded → roster row as data → teardown = stash+preserve, age-gated, never hard-delete. Dove: "kills frictions #1 and #2 and half of #3." Team scaffold = manifest loop over this.

### C. Dispatch-receipt primitive

`pij dispatch <seat> --packet <file>` → receipt artifact: packet id + sha, seat's parse-ack, seat's declared rendered runtime. Turns "I sent it" from a memory into an artifact; gives model-provenance capture for free (stoat's missing primitive).

### D. Preamble capture + ruling scope

`pij preamble` (or auto-capture at seat-contact): verbatim ruling persisted to the stream's plan folder + pointer pushed to parent's inbox. Required scope field `this-task | this-stream | standing` on rulings/briefs. Closes the biggest lossy seam and the policy-promotion class.

### The end-to-end story Jordan asked for

"Read this, set up a new project team, get started" becomes:

1. Prime reads the plan (judgment) → authors/derives team manifest, possibly from a **stock template** (`solo-stream`, `stream+pair-fleet`, `multi-stream+PM`) — the roles all exist in the wild already, including PM.
2. `pij team scaffold --manifest` (deterministic, transactional, evidenced).
3. Leg-(c) acks + preamble/confirm gates (judgment) → work starts.

### Prerequisites & sequencing

1. **Identity first**: restart-safe physical-attachment identity (s051) — both coalface seats call it blocking; cattle's twin-stamped reply is the exhibit.
2. **No-silent-no-op audit** of existing verbs (baton grant exit-0 no-op; arg-resolver inconsistency in the orchestration subtree; stdin-only `spine append` undocumented) — the scaffold verb inherits whatever CLI substrate it's built on.
3. Then B → C → A (lifecycle primitive, receipts, transactional composition), with D cheap and parallel.

## Appendix — pending addenda

- pij-nutritious-jellyfish (dove's Stream 3 coder) — mid-turn at survey time; dove will forward.
- pij-light-squid (mastodon s2) — mid-flight experiment arc; honestly marked pending, not substituted.
