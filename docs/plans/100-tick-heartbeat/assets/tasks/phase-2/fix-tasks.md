# Fix packet — dlg-0003 review, P1 + two evidence gaps

**Review**: `docs/plans/100-tick-heartbeat/assets/reviews/phase-2-review.md` — read it first.
**Verdict**: `REQUEST_CHANGES`. One P1, two evidence gaps. Everything else was cleared.
**Base**: Phase 2 is committed at `81ac018`; fix on top.

## Why the P1 is real, and why it was NOT real one phase ago

In Phase 1 I raised the fixed `.tmp` filename as a possible defect. The reviewer **correctly
dismissed it** with a single-writer proof: `runDaemon` takes `daemon.lock` with `flag: "wx"`
(`daemon.ts:1143`) and the disposer clears the tick timer before releasing it (`:1211-1218`), so
only one daemon can write that file.

**Phase 2 changed the premise.** `forgetTick()` is now called from lifecycle operations, and those
run in **CLI and seat processes**, not under the daemon lock. Verified at source:

```
cli.ts:1700          registry.unarchive(seatId)
cli.ts:3250          reg.dissolve(plan.value.id)
core/session.ts:526  ports.registry.dissolve(id)
core/session.ts:635  ports.registry.dissolve(this.self)
```

So the adjudication was right when made and is void now. **Still-correct and still-applicable are
different claims** — the same shape as a rebase invalidating a fail-first proof, applied to a
review verdict.

## T1 — Fix the lost update (the P1)

`FsTickHeartbeatStore.forget()` (`core/daemon/tick-heartbeat.ts:177-192`) is an unsynchronised
read-modify-write. Two concurrent prunes of `{a, b}` can both read, then persist `{b}` and `{a}`;
the last rename **restores the other departed id**. That breaks AC-13 in the window before the next
tick: a fast reincarnation of the retained id reads a stale overlay and is treated as fresh.

Second collision mode: the fixed `tick-heartbeat.json.tmp` staging path (`:149-158`). Two processes
can move or unlink each other's staging file, and the failure is swallowed as best-effort telemetry.

**Requirements — meet both:**

1. **A collision-safe staging path.** The repo's own `writeTextAtomic` uses
   `${path}.tmp-${process.pid}-${randomUUID()}` (`adapters/atomic-file.ts:106`) for exactly this.
2. **No lost update between concurrent forgets of DIFFERENT ids.** The reviewer's note is
   important: *PID/UUID staging alone is insufficient without preserving both removals.* A unique
   temp path fixes the staging collision and does **nothing** for the lost update.

**Choose the mechanism yourself and justify it with evidence** — you have overridden my guesses
twice with measurements and both times you were right. Options, not instructions:

- Re-read immediately before the rename and retry on a bounded loop (cheap; narrows but does not
  close the window — say so if you pick it).
- **Per-id tombstones**: a forget creates its own file keyed by id, and the overlay ignores any id
  holding one; the daemon's next wholesale rebuild clears them. Collision-free **by construction**
  because no two ids share a file — the same single-writer principle the fleet ledger just adopted.
  More machinery; genuinely race-free.
- Anything else you can defend.

**Constraint that must survive whatever you pick**: this is best-effort telemetry. It must never
throw into a caller, never block the send path, and never fsync.

## T2 — A deterministic concurrent-prune test

Two **different** ids pruned concurrently; both must stay gone. Deterministic — no sleeps, no
timing luck. Inject or interleave the read/write so the interleaving is forced rather than hoped
for. If you cannot make it deterministic, say so explicitly rather than shipping a flaky test; a
test that passes by timing is worse than none, because it will be read as coverage.

## T3 — Close the two evidence gaps the reviewer measured

Its own mutants found two prune sites that **no criterion observes**:

| mutant | result |
|---|---|
| remove only the `revive()` prune | **no kill** — the fixture's earlier `dissolve()` prune masks it |
| remove only the `unarchive()` prune | **no kill** — nothing observes restoration's prune |

These are **evidence gaps, not dead code** — `unarchive()` is the documented restore operation
(`core/ports.ts:87-98`) and `revive()` calls it before its own transition
(`fs-registry.ts:306-336`).

Add focused criteria that **seed a stamp AFTER the preceding lifecycle transition** so each site is
observed independently. This is the aggregate-vs-site problem: AC-13 proves the prune mechanism
works *in aggregate* while being blind to any individual site — the same shape as a removal
criterion proving absence but not replacement.

## T4 — Re-run the full mutant set, `--expect` mandatory

Including the reviewer's four. Record the **observed** kill sets. The two "no kill" rows above must
become kills once T3 lands — **that is the proof T3 worked**, and it is stronger than the tests
passing.

## T5 — Gates

`just typecheck` · `just lint` · targeted vitest. All of them, not first-fail.

**On full-suite failures**: this repo has a measured intermittent population
(`git-repository`, `worktree`, `chores/drive`, `flow-pair/observe` — the ENOTEMPTY-in-teardown
shape). Before attributing any red to this change, in ascending cost: **grep the failing file for a
symbol you touched, including one symbol you know IS in that file as a control** (a zero-hit grep
and a broken grep are the same observable); then run it **in isolation**; then look for **disjoint
victim sets** across two runs of identical bytes, which logically excludes determinism. Do not
conclude from a single run in **either** direction.

## Ownership — unchanged

**Yours**: `adapters/fs-registry.ts`, `adapters/fs-registry.overlay.test.ts`,
`core/daemon/tick-heartbeat.ts` / `.test.ts`, the execution log.
**Forbidden**: `daemon.ts` and `daemon.test.ts` (Phase 1, committed), `core/cli.ts`, `cli.ts`,
`core/archive.ts`, `core/watchdog.ts`, `core/anomalies.ts`, `docs/how/fleet/`, the flow-state files.

## Report back

Standard JSON. Put the mechanism you chose for T1 and **why** in `notes`, plus whether T2 is
genuinely deterministic.
