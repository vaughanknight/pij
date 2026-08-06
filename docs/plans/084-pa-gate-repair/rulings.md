# s091 / #95 — human rulings (verbatim as they land)

Single-writer: `pij-respectable-starfish` (stream orchestrator, s091).
Recorded the moment each ruling lands, per orient-global iron rule "the human
outranks every channel".

## R-01 — 2026-08-05, Jordan — `addedAt` is preserved on re-bind, on EVERY path

**Asked**: should watchdog subscriptions keep their original creation date on
every change — matching what `pij watch` already does — or only on the new
`--for` command?

**Ruled**: *"original"* — keep the original creation date.

**Reading taken**: preserve `addedAt` on **every** re-bind path, not only
`--for`. A `--for`-only fix would leave the PA-self-serve path (fix 1) still
destroying its own `addedAt`, which is the same self-defeating shape #95 exists
to remove.

**Supporting evidence found at source before the ruling** (this is what reframed
the question):

- `core/watch-subscription.ts:75` — `addWatch` re-subscribes by replacing the
  settings and keeping the prior timestamp:
  `out[index] = { ...sub, addedAt: out[index]?.addedAt ?? nowIso }`
- `core/cli.ts:2325` — the watchdog watcher path appends a **fresh**
  `addedAt: new Date(now).toISOString()` on every re-bind.

So the repo already settled this rule for peer file-watch subscriptions; the
watchdog watcher path is the single diverging path. This makes R-01 a
**consistency fix, not a scope widening** — and it is the behaviour last night's
operator edit performed by hand.

**Relationship to #96**: #96 reports the `addedAt` rewrite. The s091 brief says
"read, do not necessarily fix". R-01 makes the fix in-scope for s091.
New subscriptions still stamp `addedAt` at creation; only re-binds preserve.

## R-02 — 2026-08-05, Jordan — the PA may UNSUBSCRIBE from its parent too

**Asked**: your ruling lets a PA subscribe to watch its own boss, but the
matching unsubscribe command is blocked by the same gate — should the PA also be
allowed to unsubscribe from its own boss, or only to subscribe?

**Ruled**: *"yes"* — the PA may unsubscribe as well.

**Reading taken**: the allowance is scoped by **target**, not by action. A `pa`
may run `watchdog watch` AND `watchdog unwatch` when the target is its own
parent (and itself); every other target stays refused, and every other verb in
the `watchdog` family stays refused unless separately ruled.

**Why it matters**: #95 names the stale-subscription case explicitly — "the
refusal covers `watchdog unwatch` too, so it cannot even remove a stale
subscription". A subscribe-only allowance would leave a PA able to create a
subscription it can never remove.

**Implementation note for the coder packet**: `watch` and `unwatch` share ONE
branch at `core/cli.ts:2316` (`cmd.action === "watch" || cmd.action === "unwatch"`),
so both actions arrive at the same seam. The gate must NOT be widened to the
whole `watchdog` family — PR #71's law (exhaustive `switch` over
`OrchestrationRole` with `const _exhaustive: never`) means a widening buys one
role and re-arms the trap. Scope the allowance on the resolved target id.

## R-03 — 2026-08-05, Jordan — #99 and #102 are IN SCOPE for s091

**Asked**: two other complaints report the same kind of problem — a PA blocked
from acknowledging a brief addressed to it (#99), and blocked from editing its
own chore list or writing down a finding it made (#102) — but they are separate
switches with separate reasons and will not be fixed automatically by this work.
Take them on in this stream, or leave them for another?

**Ruled**: *"yes bring them in"*.

**Reading taken**: s091 now covers #95 (three fixes) + #99 + #102. This is a
deliberate scope expansion authorised by the human, and it OVERRIDES the s091
brief's default ("if they do not fall out, leave them"). The human outranks the
brief; the o-prime `pij-wee-albatross` is notified by pointer, not asked.

**Open design nuance to resolve in planning, NOT to re-litigate**: #95's own
comment thread drew a distinction the ruling did not address —

- `ack-dispatch` (#99) was judged *genuinely self-defeating*: the refusal reason
  is "acknowledging a brief is the assignee's own act" and the PA **is** the
  assignee, so the stated reason is the argument for allowing it.
- `chore add/update/remove` and `spine-append` (#102) were judged *coherent
  rationale, real friction* — single-writer discipline is deliberate — with the
  suggested remedy being to acknowledge the limit in the standup recipe rather
  than to change the gate.

Therefore the stream will bring a CONCRETE proposal per verb back to Jordan
rather than assume "bring them in" means "allow all of them". Same target-scoped
principle as R-02 is the likely shape: allow where the PA is the subject of the
record, refuse where it writes about another seat.
