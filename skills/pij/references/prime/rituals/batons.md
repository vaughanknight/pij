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
