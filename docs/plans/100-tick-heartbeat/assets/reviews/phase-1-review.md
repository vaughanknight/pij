# Phase 1 review — dlg-0002

**Verdict: APPROVE_WITH_NOTES**

No correctness defect was found in the granted Phase 1 boundary. The daemon change
has exactly the three allowed logical hunks (import, constructor parameter property,
and tick loop); `git diff --check` is clean, no existing import is reordered, and
the protected regions at `daemon.ts:354` and `daemon.ts:639-648` are untouched.

## Adjudications

> **ANNOTATION, added 2026-08-08 — this review is left verbatim as dispatched.**
>
> Two adjudications below rest on a premise that was **later falsified**: that a lost or missed
> stamp is *"repaired on the next tick"* (§1) and *"regenerated on the next 600 ms tick"* (§2).
> There is no such guarantee — `runDaemon()` only registers a `setInterval` (`daemon.ts:1186-1192`),
> so a stopped or crashed daemon has no subsequent callback, and a delayed callback is not bounded
> to 600 ms.
>
> **Both conclusions still stand, on a different argument.** The fixed-temp adjudication holds on
> single-writer ownership; the no-`fsync` adjudication holds because **a missing stamp reads
> `unverified`** (`core/receipts.ts:31-33`), not because regeneration is guaranteed.
>
> **Annotated, not rewritten.** This is a dispatched review record, and its `APPROVE_WITH_NOTES`
> verdict makes it *especially* worth preserving that the review endorsed the wrong rationale — a
> later reader needs to see what was actually approved and on what basis. The rule is **artifact
> role, not authorship**: correct a live rationale; annotate a dispatched record, whoever wrote it.


1. **Fixed temporary filename — no finding.** `FsTickHeartbeatStore.write()` at
   `core/daemon/tick-heartbeat.ts:115` has one production caller: `Daemon.tick()`
   (`daemon.ts:303`). `runDaemon()` acquires `daemon.lock` exclusively with
   `writeFileSync(..., { flag: "wx" })` before constructing the daemon
   (`daemon.ts:1143-1169`), and clears the tick timer before releasing that lock
   (`daemon.ts:1208-1218`). Thus two supported daemon instances cannot write this
   file concurrently. A caller that bypasses that contract could make two fixed
   temporary names collide, but that is outside this store's actual production
   ownership; its effect is also a transient best-effort telemetry miss, repaired
   on the next tick. Do not import the registry's multi-writer durability
   requirement into this single-writer path.

2. **No `fsync` is deliberate and correct.** `renameSync()` preserves
   all-or-nothing reader visibility; omitting the physical durability barrier
   accepts only power-loss loss of a stamp which is regenerated on the next
   600 ms tick. Adding the registry's `fsync(file) + fsync(dir)` contract here
   would reintroduce the cost this fix removes.

3. **The steady-state fixture is sound.** Its two warm-up ticks isolate the
   pre-existing `RuntimeAxisTracker.drive` and `observeActivity` convergence
   writes before AC-02 measures the third tick. On the old loop the third tick
   still has one write per owned descriptor, while the new loop has zero registry
   writes. A future unrelated non-convergent tick writer would make this test
   fail loudly rather than conceal the heartbeat regression.

4. **Dim-0 mutation rerun passed.** I ran M1 with mandatory
   `--expect "AC-01"` and observed the expected five-test kill set. I reran the
   same mutant with `--expect "AC-02"` and received the expected gate failure:
   five tests failed, but none was AC-02. I also reran M3 as a merge-not-replace
   mutant with mandatory `--expect "replaces the file wholesale"`; it killed that
   exact test by retaining `pij-gone`. The owned-set-filter mutant with
   `--expect "AC-03b"` killed AC-03b exactly.

5. **Structural blind spots.** AC-02 and AC-07 are the removal pair that
   survives M1: neither can prove a replacement was persisted. AC-10 is
   intentionally compile-time-only and provides no runtime evidence. AC-01 and
   AC-03 prove the daemon invokes its injected port exactly once, but alone are
   also blind to a broken concrete port after the call is made; AC-03b plus the
   real-store round-trip tests supply that missing positive evidence. AC-07b is
   not blind to a no-op replacement because its `existsSync()` assertion fails.
   Together, AC-01/03/03b, AC-07b, the retargeted wedged-daemon test, and the
   store tests make the Phase 1 replacement observable from more than a spy.

6. **Intermediate-state release note.** Phase 1 must not be deployed by itself:
   it intentionally removes descriptor `lastTickAt` before Phase 2's reader
   overlay, so current receipt readers would report daemon-owned targets stale or
   unverified. That is an acknowledged sequencing constraint rather than a Phase
   1 implementation defect; land or deploy it only with the Phase 2 overlay.

## Independent evidence

- `npx vitest run .pi/extensions/pij/core/daemon/tick-heartbeat.test.ts .pi/extensions/pij/daemon.test.ts` — 81 passed, 2 skipped.
- `harness boot` — typecheck and test stages passed.
- `just typecheck` passed; `just lint` completed with the repository's existing
  nine warnings and one schema-version information diagnostic, none in this diff.
