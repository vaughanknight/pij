VERDICT: FINDINGS (5)

## HIGH — a committed marker is replayed even when the state write did not survive

**Evidence:** `.pi/extensions/pij/core/platform/journal.ts:61-80`, `.pi/extensions/pij/core/platform/journal.ts:100-108`, `.pi/extensions/pij/adapters/atomic-file.ts:60-67`, `.pi/extensions/pij/adapters/atomic-file.ts:85-100`, `.pi/extensions/pij/core/platform/ports.ts:69-73`

`resolveOp` treats `phase === "committed"` as unconditional authority and calls `appendOnce` without consulting persisted state. That forges history in the packet's marker-written/state-lost crash image: an fs-adapter probe created project A, durably recorded and marked an A→B set committed without applying B, then invoked a normal `spine append`. The command exited 0, recovery appended the false A→B event at seq 2 and cleared the journal, while the project still held A. This is reachable wherever durable ordering is not actually established; `fsyncDirBestEffort` explicitly swallows directory-fsync failure and documents degraded power-loss durability.

The stated reason for ignoring state — a later legitimate write may have moved it on — does not disprove the defect. The write lock and recovery gate forbid a later platform write while this op is pending. The valid moved-on case is instead “event already appended, clear lost”, which is distinguishable because the once-file already exists.

**Smallest fix:** recovery must distinguish an existing keyed event from a new append before trusting a committed marker whose current canonical state is not `next`. Return the existing event and clear if the once-file exists; otherwise block rather than append. Alternatively make the state publish and committed transition provably durable-ordered on every supported platform. Pin committed-marker + old/missing state with no once-file.

## HIGH — corrupt, unreadable, or future-version journal entries are silently bypassed

**Evidence:** `.pi/extensions/pij/adapters/op-journal.ts:96-118`, `.pi/extensions/pij/adapters/op-journal.ts:121-145`, `.pi/extensions/pij/core/platform/ports.ts:77-79`

`pending()` silently skips every `.json` entry that `readOp` cannot read or validate, so recovery cannot block on an unknown predecessor. A real CLI probe planted malformed bytes at a UUID-shaped `spine/ops/*.json` path and then ran `project create Beta`; it exited 0, created Beta, and left the unreadable op in place. If that entry is the surviving journal for committed state whose append failed, the successor has now overtaken an unaudited predecessor — the exact G3 failure the redesign is meant to prevent.

Atomic publication reduces the chance that this implementation creates a torn final file, but it does not make unreadable, damaged, or newer-schema safety records equivalent to absence. An exclusive journal directory can ignore non-op filenames; it cannot safely ignore an op-shaped file.

**Smallest fix:** make journal enumeration return a `Result` (or an explicit corrupt-entry sentinel) and fail recovery before mutation on any unreadable/invalid op-shaped JSON, naming the path. Add a real-fs verb probe with a malformed UUID entry.

## MED — failed journal clears are reported as success and create a delayed machine-wide wedge

**Evidence:** `.pi/extensions/pij/core/platform/ports.ts:74-79`, `.pi/extensions/pij/core/platform/journal.ts:50-58`, `.pi/extensions/pij/adapters/op-journal.ts:87-94`, `.pi/extensions/pij/core/cli.ts:1563`, `.pi/extensions/pij/core/cli.ts:1641`

`clear` is a best-effort `void`, and recovery increments success after calling it without proving the predecessor left the journal. A probe seeded an abandoned set intent (the record→state crash window), injected one failed clear during recovery, and ran a successor set. The successor exited 0 while the old intent remained. Because the successor changed the project, the next platform write then blocked on that old op as “neither prev nor next”. The documented residual is therefore not loud at the cleanup failure: a successful command silently plants a global `write.lock`-guarded outage for the following command.

**Smallest fix:** make `clear(opId)` return `Result<void>`, durably sync the removal, and stop recovery/the current verb unless the entry is confirmed absent. Add the exact abandoned-intent → failed recovery clear → successor-success probe.

## MED — complete-own-record canonicalization still drops valid `__proto__` fields

**Evidence:** `.pi/extensions/pij/core/platform/project.ts:61-90`, `.pi/extensions/pij/core/platform/project.ts:102-109`

Both canonicalization helpers build plain `{}` objects and assign unknown keys with `out[key] = value`. For a JSON-parsed own key named `__proto__`, that invokes the legacy prototype setter instead of creating an own property. A probe with top-level and `created.__proto__` additive fields showed both present in `Object.keys(input)` but absent from `canonicalProjectJson` and from `setProject` event `prev`/`next`, while the project spread/store path preserves them.

**Smallest fix:** build canonical records with `Object.create(null)` or define unknown keys with `Object.defineProperty`; pin top-level, nested `created`, and unknown nested-object `__proto__` cases.

## MED — `FakePlatformWriteLock` is not a contract twin of the fs lock

**Evidence:** `.pi/extensions/pij/adapters/platform-write-lock.ts:71-127`, `.pi/extensions/pij/adapters/fakes.ts:758-780`, `.pi/extensions/pij/adapters/platform-stores.contract.test.ts:411-498`

The fs lock is non-reentrant: a nested acquisition timed out E-NOREG and the nested operation did not run. The fake simply invokes the callback, so the same probe returned nested `ok(ok("nested-ran"))` with two acquisitions. The shared contract suite covers the new journal surface but omits `PlatformWriteLockPort`. Downstream P2 daemon/CLI tests can therefore admit the same re-entrant interleaving that production serialization is intended to forbid.

**Smallest fix:** give the fake held-state semantics (and shared backing when instances model one machine home), add the lock to the fs↔fake contract suite, and pin nested acquisition plus release-after-throw parity.

## Resolution and ruling assessment

G1's stale-steal defect is root-cause dead: both lock implementations now never steal and fail with bounded manual-removal diagnostics. The ordinary abandoned-intent phantom and B→C-before-A→B traces are closed by the write lock, phase adjudication, and recovery gate; the HIGH findings above are the remaining marker/corruption paths around that gate. G4 works for ordinary additive fields but is incomplete for a valid hostile JSON key.

The lease/owner-liveness decline is sound. Superseding best-effort replay with a blocking recovery gate is sound. Machine-wide serialization is sound for P1's CLI writers and is the safer P2 daemon posture provided every platform writer shares the lock; the current fake parity gap must be closed so that invariant is testable.

Mandated gates: targeted platform/adapters/CLI suite 689 passed, 1 skipped; `just typecheck` passed.
