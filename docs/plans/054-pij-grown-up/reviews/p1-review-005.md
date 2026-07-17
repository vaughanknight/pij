VERDICT: FINDINGS (1)

## HIGH — a successful journal clear is not durably established, so resurrected entries can forge history or wedge valid successors

**Evidence:** `.pi/extensions/pij/core/platform/ports.ts:80-88`, `.pi/extensions/pij/adapters/op-journal.ts:93-112`, `.pi/extensions/pij/adapters/atomic-file.ts:60-83`, `.pi/extensions/pij/core/platform/journal.ts:103-123`, `.pi/extensions/pij/core/platform/journal.ts:142-166`

`OpJournalPort.clear` promises that an entry is absent **with the removal durably synced**, but `FsOpJournal.clear` calls the void, fail-soft `fsyncDirBestEffort` and returns `ok` even when the directory sync failed or is unsupported. Its own comment acknowledges that the removed entry may resurrect after power loss and claims recovery is idempotent. It is not idempotent once a later write has legitimately advanced the projection.

Two real-fs probes reproduced both unsafe branches by restoring the exact pre-clear journal bytes after a successor landed:

- An A→B **intent** whose update aborted was cleared; a later genuine A→B write by another actor landed; the old intent was then resurrected. Recovery returned `ok({replayed:1})`, appended a second A→B event attributed to the aborted writer *after* the winner's event, and cleared the record. The spine actors became `winning-writer, aborted-writer`. The `state === next` intent branch therefore blesses an operation whose state write never landed.
- A fully landed A→B committed op was cleared; a later B→C write landed; the old committed record was then resurrected. Its once-record existed and state was genuinely C, but recovery returned E-NOREG and retained the entry forever. This is the packet's new false-block: the state-only committed gate cannot distinguish lost project publication from a legitimately moved-on projection after a lost clear.

The direct J1 probes are fixed: state=prev/once and missing-create/once now block and retain the journal. The direct J2 probe is also fixed, and every production `clear()` Result is consumed (recovery plus all create/set success and abort paths). The remaining defect is below that plumbing: the fs adapter can report a successful durable clear without durable evidence.

**Smallest safe fix:** do not return `ok` from `clear` unless removal durability is established. Make directory-sync failure observable and retain/recreate the safety record so no successor can run, or add durable completion/state-side operation identity that lets recovery distinguish a resurrected resolved op from a live crash record. Reverting to once-only clearing is unsafe because it reopens J1's state-loss forge.

## Corroboration matrix

| Journal shape | Persisted state | Once-record | Current outcome | Assessment |
|---|---|---:|---|---|
| committed coupled | `next` | no | append fresh, clear | sound |
| committed coupled | `next` | yes | return existing, clear | sound |
| committed coupled | `prev`/missing/other | no | block, retain | sound |
| committed coupled | `prev`/missing | yes | block, retain | sound for J1's state-loss image |
| committed coupled | genuine successor (`other`) after resurrected clear | yes | block, retain | false-block |
| committed uncoupled | any | no | block, retain | sound; no production writer journals this shape |
| committed uncoupled | any | yes | return existing, clear | sound |
| set intent | `prev` | either | discard, clear | sound while the entry is current |
| set intent | `next` | either | replay, clear | unsound for a resurrected cleared abort |
| set intent | missing/other | either | block, retain | safe but can wedge after resurrection |
| create intent | exact `next` | either | replay, clear | same resurrection ambiguity |
| create intent | missing/different record | either | discard, clear | sound under the no-delete project-store contract |

## Whole-of-P1 status

J1 and J2's dispatched traces are closed, and the fence is clean: five production/test files plus the execution log, no new files, no port signature change. Whole-of-P1 approval is still unavailable: 17 of 18 prior findings are root-cause complete; review-003 M3's required **durably synced** removal remains open in the power-loss resurrection form above.

Mandated gates: targeted platform/adapters/CLI suite 722 passed, 1 skipped; `just typecheck` passed.
