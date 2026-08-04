# delegate — hand ONE bounded task to ONE peer

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: get a single, bounded unit of work done by one colleague peer and take back the
result — **no review cycle, no verdict, no fleet**. One packet out, one done-report back,
teardown. If the work needs an independent cross-model reviewer and a fix loop, that's a
different, heavier job (a reviewed coder+reviewer fleet) — not this route. If you only want
to stand up or chat with a peer with no work product, that's the raw colleague seam. This
route is the thin **"one task → one peer → one result"** path between the two.

**Preconditions**: mode detected once (§ C1 — control-plane mode also needs the one-time
self-adopt so the peer's reply can reach you); a `pij daemon` (auto-starts on first spawn).

## The single invariant that makes delegation safe: pointer + bounds

A delegation packet is **data written to disk first, then a pointer sent** — never a giant
inline body. Every packet states, at minimum:

1. **Mission** — the one task, in a sentence or two.
2. **Repo root** — the absolute path the peer works in.
3. **Allowed paths** — the *only* files/dirs the peer may create or modify.
4. **Forbidden paths** — enumerate at least `.the-flow-state.json`, `the-flow.json`,
   `the-flow.md`, and any ledger dir; the peer must never read or write them.
5. **Done-report shape** — what to send back (summary + files changed + gate results) and
   the id to send it to (you). Both the packet pointer message and the done-report follow
   § C10 (wire discipline): first line = outcome/next action; delta + ids, no restatement.

Persist the packet (e.g. under a `scratch/` or task dir), then send the **path pointer**
(§ C1 verb). Long context always travels as a file + pointer, never inline.

## Flow

```bash
# 1. acquire — provided-or-spawn ONE peer (§ C1 transport, § C5 placement)
pij spawn --harness <h> --model <m>      # discover ids with `pij models` (§ C4)
#    canary-verify the footer + no-400 before trusting it (§ C2) — provided peers too

# 2. deliver — write the packet to disk, send the POINTER (never the body)
pij send <id> "Packet at: <rel-path> — read it fully, then implement + report."

# 3. collect — the daemon PUSHES the done-report back as an injected turn (§ C7);
#    do NOT poll or nudge. Do independent work while the peer runs.

# 4. teardown — close ONLY a peer you spawned (ownership-aware, § C1 verb)
pij close <id>
```

- **One task, one run** — the packet authorizes the whole bounded task; the peer finishes it
  and reports once. It is not a multi-round review conversation.
- **Compact between tasks, reuse the peer (§ C3)** — for a *second* bounded task on the same
  peer, compact and re-deliver rather than close-and-respawn a healthy session.
- **No verdict, no Dim-0 gate** — delegation trusts the peer's done-report. If you need an
  independent cross-model reviewer proving the work non-vacuous, use the reviewed-fleet job.

## Done-report

The peer replies with its own report (typical shape):

```json
{ "outcome": "COMPLETE | PARTIAL | BLOCKED",
  "summary": "what was done + current state",
  "filesChanged": ["path/…"],
  "gatesClean": true,
  "notes": "blockers / decisions / questions" }
```

On `COMPLETE`: verify the gate results it claims (re-run the project's checks yourself when the
work is load-bearing — **you still own the outcome**), then teardown. On `PARTIAL`/`BLOCKED`:
read `notes`, then either re-delegate a narrowed packet or take it over.

## Failure modes

| Symptom | Move |
|---|---|
| Ready but 400 on first message | wrong model id — close, re-spawn with a `pij models` id (§ C2/C4) |
| No done-report for a long time | trust the push (§ C7); only spot-check with `pij tail <id>` if the transport is known-broken |
| `pij close` refuses | you don't own that peer — leave it (only `--force` on the owner's explicit ask) |
