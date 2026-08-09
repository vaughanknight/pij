# Batons — serialize exclusive resources

The baton primitive is live: `pij orchestration baton <verb>` — a registry-backed
lease (one holder, enforced by an atomic lease file under `PIJ_HOME/orchestration/`)
with pushed notices, a purpose-carrying queue, pin re-verify, blocked-time
measurement, and a machine log. The **book remains the evidence layer on top**: the
keeper's hand-written rows carry purposes, terms, annotations, and hazard warnings a
machine line cannot; the primitive's log is the mechanical truth of who held what,
when. One o-prime writes the book; everyone, including the o-prime, obeys it — and
no code path ever writes the book.

Start from [`../templates/baton-book.md`](../templates/baton-book.md). A baton is
anything that breaks under two concurrent users or when histories converge: shared
build locks, ports/services/daemons, global package/config/cache/runtime state,
rate-limited external APIs/accounts, shared fixtures or generated artifacts,
same-branch/shared-checkout work, moving-branch handoffs, rebase, landing, merge,
or git/index use during a ruled shared-tree fallback.

Isolation removes edit-time serialization, not convergence-time serialization.
Routine reads, edits, hermetic tests/builds, commits, and sole-owner branch pushes
inside a verified stream-owned worktree/branch are notification-only: **do not
request a baton**. Two isolated branches editing the same path record overlap now
and synchronize when reconciling. A downstream pinned to an immutable producer SHA
needs no baton until repinning; consuming a moving branch needs a handoff baton. A
unique-branch push is notify-only unless CI/external quota is shared; merge to a
shared target is always serialized.

## Lifecycle (ritual step → primitive verb)

1. **Define** the resource once: `pij orchestration baton define <name> --resource
   <text> [--probe <cmd>] [--repo <path>]`.
2. **Request** with purpose (and optionally `--pin <sha>`, `--evidence <declared
   return evidence>`): `… request <name> --purpose <text>`. The creator is notified
   by push; the queue holds requests-with-purposes, never positions — a queue
   number is not a promise.
3. **Verify free** with the resource probe and holder liveness. After restart,
   never trust any table alone — probe.
4. **Grant** by request id: `… grant <name> --to <request-id>`. Grants are PUSHED
   with delivery receipts; a stale or unverifiable pin demands an explicit
   `--repin` ack (a firm guide with a self-serve exit — never a keeper gate). The
   keeper then annotates the book row around the machine line.
5. **Use** only for the recorded purpose. Long holds may contain negotiated,
   explicitly recorded sibling windows (windows stay a book-layer convention — the
   primitive has no sub-leases in v1).
6. **Return** with evidence: `… return <name> --evidence <text>` — frees the lease,
   logs, and pushes the notice. Verification of the evidence stays HUMAN: the
   keeper reads it against the declaration before closing the book row.
7. **Reclaim is always explicit**: a dead/stalled holder produces exactly ONE pushed
   alert to the granter and the lease stays held — `… reclaim <name> --evidence
   <text>` records the judgment. The daemon never auto-reclaims; evidence, not
   silence, decides.

`… list` / `… show <name> [--json]` expose holder, queue, purposes, and
blocked-time (request→grant) — the measured R4.4 signal that feeds worktree-split
suggestions to the human.

## Hard paths (unchanged doctrine — the primitive records them, never decides them)

Worked examples of the reclaim and breach records: [`../exemplars/grant-log.md`](../exemplars/grant-log.md).

- **Self-grant**: the keeper requests, verifies, logs, uses, and returns like
  anyone else — the primitive gives self-grants the exact same path, no keeper
  shortcut. The first real self-grant made the book law instead of decor.
- **Silent holder**: the alert tells you the holder is gone; whether the purpose
  completed is a human read of the evidence (a dead holder's commit may exist).
- **Stale pins**: mechanized — grant compares pin vs current HEAD and demands
  `--repin`; an unverifiable HEAD demands it too.
- **Queued posture**: for a shared-tree fallback, pre-stage the whole batch in
  scratch and land it inside the granted window. For timing/external batons,
  prepare every non-contending input while waiting.
- **Writing docs while another seat holds fallback git-index**: unstaged-only edits,
  disclosed to the holder — a bare `git add -A` during a sibling's window once
  swept 24 of its staged files into a stranger's commit (INC-004's class; it keeps
  recurring, which is why the index is a named baton surface).
- **Restart**: audit book + `… list` before new grants; reconcile dead holders into
  explicit reclaims.
- **Breach**: stop competing use, tell the holder, record it, then fix the paved
  path that invited it. Honor system means the record is the enforcement.
- **Contention**: `show --json` blocked-time is the datum. Worktrees are already
  the construction default; persistent timing/runtime contention informs a new
  sensor, resource split, or human sequencing ruling.

Fences are sensors — they inform and record merge risk, never block. Batons
are interlocks — one holder, justified only by a real hazard: shared mutable
state or convergence. Neither is an edit-time permission gate for isolated
branch work.

**HOW YOU WILL KNOW YOU HAVE GOT THIS WRONG** (added 2026-08-04 at
`pij-massive-meadowlark`'s request, from its own audit — the rule above was
correct and *did not reach it*, because a rule tells you what a fence IS and not
what your own behaviour looks like when you have broken it):

> **A prime who answers in-worktree "may I?" questions with grants has converted a
> sensor into an interlock — and the seats will learn from the ANSWER, not the
> doc.** You were their primary source, whatever this file says.

The tells, all observed in one government in 24h:

- You adjudicate. Rulings read `GRANTED` / `REFUSED` on paths inside a seat's own
  worktree and branch. One instruction opened *"FENCE EXTENDED, exactly one path"*
  — an extension offered as permission, which the seat then *declined to spend*.
- Seats stand off. A diagnosed real defect sat **unowned and unfixed** because a
  fence stopped a worktree-isolated seat touching a file on its own branch, plus
  four ask-and-wait round trips.
- Your one defensible refusal did not need a fence. Refusing a `prepare` lifecycle
  hook is correct **because it escapes the worktree** — shared mutable state, which
  batons already serialize. *If the good refusal is justified by escape, the fence
  was never what made it right.*

**And the fence's own reading can be green and useless**: a fence verified to hold
exactly (25 paths, zero outside) while CI went red anyway, because an in-fence file
was byte-frozen by a snapshot *outside* it. **A path fence bounds writes and says
nothing about what asserts those bytes elsewhere** — so it cannot tell you the blast
radius it appears to be telling you.

**The root cause, and it is not doctrine confusion**: *"I over-invest in fences
because my status layer was unreliable. A fence PREDICTS what a seat will touch; a
card REPORTS what it did. When cards rot, the prediction becomes the only artifact —
and a prediction I enforce is an interlock by construction."* The cards were rotting
via the badge defect (`report now` never clears a `stateNote`; only `report clear`
does), which is the same generator as the companion bug: **a field whose write path
and clear path are governed by different operations, where the holder cannot tell its
own state went stale.**

> **If you find yourself enforcing a fence, check your status layer first.** Reach
> for legibility — *"tell me what you're touching and I'll record the merge risk"* —
> not permission. A touch-set is a NOTICE, not a fence.

### …AND THE SHARPER CUT — nothing expired it when its cause died

**`pij-related-koala`'s amendment, relayed by its prime against that prime's own
coarser version.** The stand-off cited above **was correct when issued**: another seat
was live and about to take that exact file, and two writers in one path is the worse
failure. So the interlock was right at issue time.

> **The defect is not that a fence existed, it is that nothing expired it when its
> cause died.** (`pij-related-koala`)

The other seat was closed, the item went unowned, and the fence stayed up **by
inertia**, because lifting it required an action nobody was prompted to take. That is
smaller and far more fixable than the doctrine question — *a doctrine argument invites
a POSITION; "nothing expired it" invites a MECHANISM.*

**It unifies four independent defects found across two governments in one day**
(unification `pij-massive-meadowlark`'s, sentence koala's):

| instance | state that outlived its cause |
|---|---|
| **badge** | the blocker cleared; nothing cleared the badge — 3 of 4 seats in one government, worst at 24h, and the pij o-prime at 22h |
| **chore companion baseline** | advanced by a run nobody read, because a companion cannot see ack state |
| **fence** | its cause died with a closed seat; nothing retired it |
| **PA exemption clause** | kept seats stood down after the reason to stand them down had passed |

*"A field whose write path and clear path are governed by different operations"*
describes the **mechanism**. Koala's names the **accountability gap** — which is the
half you can assign to someone, and the reason four unrelated subsystems produced the
same shape on the same day.

> **EVERY DURABLE CONSTRAINT MUST STATE ITS CAUSE AND ITS EXPIRY CONDITION IN THE SAME
> BREATH AS THE CONSTRAINT.** A constraint whose cause is unstated cannot be noticed to
> have expired — by anyone, including the party it binds.

This is the general form of *companions must be stateless*: statelessness removes one
class, and **the class that survives it is state whose JUSTIFICATION has died while the
state is still perfectly valid.**

**In practice**: `"stood off X BECAUSE araminta holds FU-4; EXPIRES when araminta
releases it or is closed"` — which turns a seat closing into a **visible trigger**
rather than a silent one.

**The positive control already exists in this fleet**: the interim `report state`
guidance issued fleet-wide on 2026-08-03 carried `pij#72` as its named holding defect,
*because* mastodon's *debt-not-practice* rule demanded an expiry. That constraint is
the one that did not rot — the practice existed in one place and had not reached the
other four.

And the distinction that makes it a control at all: **it held because a RULE made
carelessness impossible in that slot, not because its author was careful.** A control
that works because someone was attentive is not a control.

### THE NEGATIVE CONTROL — knowing the rule is not a control

**`pij-related-koala`, same fleet, same day, and it is the strongest evidence in this
file.** After clearing its own stale badge it disclosed that it **already held a
durable personal note on that exact defect** — *"`report now` does NOT clear a blocked
badge; run `report clear` in the same action as resuming"* — written after being caught
by it **once before**.

**It did not fire.** A seat that knew the rule, had authored the rule *for itself*, and
had already paid for the lesson once, still shipped **300 minutes of contradictory
state**.

> **Knowing the rule is not a control. The badge must expire itself, or be cleared by
> the same operation that resolves its cause.** (koala)

Put beside the positive control, the pair is decisive: **a rule-enforced expiry held; a
remembered one failed, in the same fleet, on the same day, in a seat that had already
been burned by it.** Four failures, one mechanism that worked, and one documented
failure *of diligence itself* — which is why the fix belongs in the write path and not
in anybody's memory.
