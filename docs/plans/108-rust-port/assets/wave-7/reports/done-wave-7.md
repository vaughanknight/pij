# Wave 7 — done (u-sidecars, u-cutover-controls)

Composed at `a64c8773`. Six gate stages green, arch 9 crates 0 violations,
**360 passed** (the wave quotes PASSED, EXCLUDING IGNORED — two honest numbers for
one tree is exactly the ambiguity a receipt exists to remove).

## What shipped

**u-cutover-controls** — the three controls req-0019 required, approved in three
rounds: `PIJ_DAEMON_GENERATION=legacy` per-seat forceback returning before any
probe; `PIJ_RS_ADDR` / `_STATE_DIR` / `_BIND` with CLI > env > default, where an
explicit flag equal to the default still beats a live env; **no silent fallback** —
rs selected and unreachable fails loudly, naming addr, state dir, and the control
that unsticks the seat; malformed and whitespace-only values refused by name with
the value quoted, in Rust and TypeScript alike.

**u-sidecars** — Telegram bridge, background runner, chore runner as queue-backed
consumers over the seven frozen ports, plus the producer surface (`POST /v1/sidecar`
and six `pij-rs sidecar` verbs) which the composer owed and wrote.

## The live-fire

A real Telegram round trip: message to the operator's phone, his reply routed
through the Rust bridge into a seat. Both halves of a **pre-registered falsifier**
satisfied — the injected turn as a spine row (`telegram.binding`, then
`telegram.cursor` advancing only AFTER delivery), and the legacy bridge provably
not the receiver for that window.

The first attempt **aborted** on the composer's own defect and the coder refused to
count it: *abort-restore-report beats the proof*. The second passed.

**The channel was left down.** The Rust daemon held the operator's production
long-poll while the legacy relay was neither running nor registered — caught by the
reviewer, restored on order, and **verified independently by the composer** rather
than accepted by report: legacy-schema lock, live node pid, descriptor back.

## Findings that changed the product

- **A failed inbound delivery still confirmed the message to Telegram.** The offset
  advanced before `enqueue_turn`; `offset = update_id + 1` is not bookkeeping, it is
  the acknowledgement that DELETES the update. A failed enqueue meant the operator's
  reply was gone from Telegram, never delivered, with nothing on the spine.
  **The two-step inbox ruling, in a different transport, reintroduced by a different
  author** — a doctrine ratified in one unit does not travel to the next unless
  someone carries it.
- **The producer reported FAILED for work that landed** — the one route returning a
  bare body while seven returned the envelope, so the client refused a reply for a
  job already enqueued. Command-success-is-not-effect running backwards. It survived
  a green gate because nothing drove the shipped client against the shipped route:
  two asserted halves with no instrument between them.
- **`Lost` reached from an absence that did not mean what it was read to mean.**
  `reap()` returned `None` for three different facts — not exited, already observed,
  never ours — and consumed the status before a guard discarded the pass.
- **`kill` prose as control flow.** A POLICY branch keyed to `/bin/kill`'s English
  stderr, on exactly the zombie-only path the fix existed for. Moved to numeric
  errno: **`ESRCH` is a name, `3` is a fact.**
- **Egress**: the producer route let any machine-key holder send arbitrary text to
  an arbitrary chat with the operator's bot token. Pinned to the configured chat,
  refusal naming both values.
- **The two generations could not read each other's lock.** Rust wrote
  `startedAtMs`; legacy required `startedAt` and treated a parse failure as
  *reclaimable*, so it deleted a live lock and took a single-consumer poll —
  **both sides believing they acquired cleanly.** Now symmetric, and ratified as
  cutover doctrine.

## What the reviewers did that the gate could not

Nine disclosed **instrument errors** across the two reviews, every one caught by the
person who made it, **none reaching a verdict**:

a probe that SIGTERMed its own process group; a zombie read as a survivor; two
truncation errors (`tail -12` reporting `0 passed`, `head` exit status read as the
command's); a fake that stopped injecting when the code moved, so **a clean pass
looked exactly like the original defect**; a probe printing a symbolic errno name —
prose again, one layer up; a runner summarising a hard `--locked` failure as
`OK — 5s`; an offline run that **regenerated the lockfile in the tree it was
judging**, on the head whose finding was that the lock was missing; and a probe
whose `poll()` **reaped the zombie it was measuring**.

Three became permanent habits: *report the number AND the command*, *when a red will
not reproduce MUTATE rather than repeat*, and *surfacing a violation is not
enforcing one*.

The verdicts were also better than their gates: a fix was checked for whether it
**discriminates rather than deletes** (a planted orphan still classified `lost` with
a reason), and a mutation was required to reproduce the **original signature**, so a
witness defends the defect it was written for rather than an adjacent one.

## Composer's own defects, disclosed

The producer envelope; the `HOME` default that would have had every dev daemon seize
the production Telegram poll (caught by the first boot test refusing against the live
legacy lock); a "cheap probe" ruling that would have shipped a loop unable to
converge on a zombie-only group; dispatching two coders into one worktree and then
onto one branch; a shared build cache that served one coder artefacts compiled from
another's unpushed source; and, at the last item, implementing F10 in parallel with
the coder and breaking the build twice before discarding the work.
