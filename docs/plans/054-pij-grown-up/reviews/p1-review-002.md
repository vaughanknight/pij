VERDICT: FINDINGS (4)

## HIGH — stale-lock recovery can evict a live holder and recreate duplicate sequences

**Evidence:** `.pi/extensions/pij/adapters/spine-store.ts:46-51`, `.pi/extensions/pij/adapters/spine-store.ts:258-318`

The lock is classified only by mtime, and the stale observation is not tied atomically to the file later renamed. A concrete handoff race remains: writer B observes an old stale lock; that holder releases and writer A creates a fresh lock; B's `renameSync` then moves A's live lock. While the lock path is absent, writer C acquires it. B re-stats the moved file, sees that it is fresh, and `renameSync(moved, lockFile)` replaces C's lock on POSIX. A and C are now both inside allocate-plus-write and can mint the same `lastSeq() + 1`, recreating the original exclusive-cursor loss. Independently, any legitimate critical section exceeding 10 seconds is stealable because owner PID/token liveness is never checked. Runtime probes confirmed that an aged lock carrying the current live PID is stolen and that the restore rename replaces an occupied destination.

**Smallest fix:** remove automatic stale stealing until it can be made ownership-safe (timeout with the existing manual-removal diagnostic is safer), or use a real owner-liveness/lease primitive that cannot move a live lock. Add a deterministic stale-observation/fresh-reacquire three-writer test and a live holder exceeding the stale horizon.

## HIGH — recovery replays in-flight intents before their state write commits

**Evidence:** `.pi/extensions/pij/core/platform/ports.ts:37-59`, `.pi/extensions/pij/core/platform/journal.ts:33-47`, `.pi/extensions/pij/core/cli.ts:1498-1519`, `.pi/extensions/pij/core/cli.ts:1577-1598`

`PendingOp` has no intent/committed phase, yet an op becomes globally replayable immediately after `record`, before `projectStore.create/update`. Another process starting any write verb can therefore append and clear that still-running operation. If the original state write then fails, the append-only spine permanently claims a change that never happened. An adversarial re-entrant probe reproduced this without a crash or corrupt file: process A recorded `project-set alpha -> pij-never-landed`; process B replayed it while A was inside `update`; A's update returned `E-NOREG`; the project stayed unchanged but spine seq 1 was the false `project-set` event.

**Smallest fix:** make journal entries phase-aware and replay only committed operations. The state publish must durably carry the operation identity (or be atomically coupled to the committed marker) so recovery can distinguish "state landed" from an abandoned intent across the state-write/mark-committed crash window.

## HIGH — ignored replay failures let later state events overtake their causal predecessors

**Evidence:** `.pi/extensions/pij/core/platform/journal.ts:30-48`, `.pi/extensions/pij/adapters/op-journal.ts:34-47`, `.pi/extensions/pij/adapters/op-journal.ts:63-77`, `.pi/extensions/pij/core/cli.ts:1498-1515`, `.pi/extensions/pij/core/cli.ts:1577-1593`, `.pi/extensions/pij/core/cli.ts:1619-1637`

Every write verb discards `{ remaining }` from `replayPendingOps` and proceeds. A first set A→B can commit state while its append fails; a second set B→C can fail replay but append its own event; later recovery appends A→B after B→C. The reproduced spine was seq 1 `B→C`, seq 2 `A→B`, while current state was C, so seq order no longer forms the promised prev→next audit chain. Multiple pending operations can also be shuffled because fs journal ids are random UUIDs sorted lexically rather than by durable operation order.

**Smallest fix:** do not start a new platform write while any predecessor remains unreplayed; return an honest recovery error before mutating state. Persist a causal journal order (or serialize per project) and replay in that order before accepting later writes.

## MED — canonical project snapshots erase additive fields that the store preserves

**Evidence:** `.pi/extensions/pij/core/platform/types.ts:3-8`, `.pi/extensions/pij/core/platform/types.ts:176-232`, `.pi/extensions/pij/core/platform/project.ts:46-61`, `.pi/extensions/pij/core/platform/project.ts:110-130`

The public guards deliberately tolerate unknown fields, and `setProject` preserves them through `{ ...project }`, but `canonicalProjectJson` rebuilds only today's declared fields. A project read from disk with a future top-level field or nested `created` field is therefore persisted with that data intact while the event's `prev` and `next` silently omit it. A probe with `futureField` and `created.futureStamp` produced exactly that mismatch, so an older binary breaks the additive-schema audit chain even though the projection round-trips safely.

**Smallest fix:** canonicalize the complete own JSON record: emit known fields in contract order, then unknown own fields in stable sorted order, including nested records. Alternatively, record a structured changed-field delta that does not claim to be the full persisted before/after snapshot.

## Resolution notes

Original findings F4, F5, F6, and F7 are resolved. F3 is resolved for the currently declared v1 project fields, subject to the additive-field gap above. F1 and F2 are not root-cause complete because their replacement lock/journal machinery introduces the three HIGH failures above. The no-op `project set` ruling is sound: identical `prev`/`next` accurately records an attributed write intent and satisfies AC-03 without pretending a value changed.
