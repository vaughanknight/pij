# Phase 1+2 — the pure store, and the daemon writing ONE file

**Plan**: `docs/plans/100-tick-heartbeat/tick-heartbeat-plan.md` (read it first, in full)
**Dossier**: `docs/plans/100-tick-heartbeat/assets/research-dossier.md`
**Issue**: pij#180 Fix A

## What this phase must achieve

`daemon.ts:288-293` writes `lastTickAt` to every daemon-owned descriptor every tick — verified
**132 writes/tick** in production, each an `FsRegistry.publish()` of ~5 fsync-barriered atomic
writes. Replace that loop with **one** persist to a side file.

**This phase does NOT add the read overlay.** That is Phase 3. At the end of this phase
`lastTickAt` will be absent from descriptors and readers will report stale — that is expected
and is why Phase 3 exists. Do not "fix" it here, and do not touch any reader.

## Ownership — hard boundary

**You may edit ONLY:**
- `.pi/extensions/pij/core/daemon/tick-heartbeat.ts` (NEW)
- `.pi/extensions/pij/core/daemon/tick-heartbeat.test.ts` (NEW)
- `.pi/extensions/pij/daemon.ts` — **three regions only**: imports `:13-82`, constructor
  `:190-199`, tick loop `:286-293`
- `.pi/extensions/pij/daemon.test.ts`
- `docs/plans/100-tick-heartbeat/assets/execution.log.md` (append only)

**Forbidden — other streams are editing these RIGHT NOW:**
- `daemon.ts:354` (s097) and `daemon.ts:639-648` (s095) — do not touch, do not reformat,
  **do not reorder imports anywhere in the file**
- `core/cli.ts`, `cli.ts`, `core/archive.ts`, `core/watchdog.ts`, `core/anomalies.ts`
- `adapters/fs-registry.ts` — that is Phase 3, not this packet
- `.the-flow-state.json`, `the-flow.json`, `the-flow.md` — never write these
- `docs/how/fleet/ledger.md` — mine, not yours

## Tasks

### T1 — Record the pre-fix RED **before writing any implementation**
For AC-02 only. Write the test first, run it against the **unmodified** tree, and paste the
**verbatim** failure output into the execution log, including **which assertion fired**.

**AC-02**: *the tick performs zero `registry.write` calls for the heartbeat.*
Fixture: a `CountingRegistry` (see `core/orchestration/role.test.ts:35` and
`core/orchestration/prime.test.ts:20` for the established pattern) with **five** daemon-owned
descriptors (`harness: "claude"` or `"copilot"`, no `deliveryMode: "pull"`).

**The expected pre-fix red is FIVE writes, not 132.** 132 is the production working set; this
fixture has five. Do not copy the production number into the fixture expectation.

Record: the assertion text, the observed count, and confirm the assertion that fired is the
write-count one and not a setup assertion. **A pre-fix red proves only the FIRST assertion that
fired** — `expect()` throws, so anything after it never ran.

### T2 — `core/daemon/tick-heartbeat.ts`, pure store (P2: imports nothing from `@earendil-works/*`)
Exports:
- the on-disk shape `{ v: 1, tickAt: string, sessions: Record<string, string> }` — **wrapped
  deliberately**: `FsRegistry.readFile` admits a record only when `typeof parsed?.id === "string"`
  (`adapters/fs-registry.ts:1132`), so a top-level `id` must never exist or `list()` would treat
  the heartbeat file as a session descriptor
- the filename constant
- `buildHeartbeat(ids, tickAt)` — build the map from the current owned set
- `parseHeartbeat(text)` — tolerant: missing file, corrupt JSON, wrong `v`, or a non-object all
  return an empty map rather than throwing. A daemon must not die because a telemetry file is
  malformed.
- `lastTickFor(map, id)` — lookup returning `string | undefined`

**Pruning is by construction**: `buildHeartbeat` builds from the *current* owned set each tick,
so departed ids disappear. Do not implement incremental mutation.

### T3 — Tests for the store (target the store, not the wiring — P8)
Cover: round-trip; missing/corrupt/wrong-version input → empty map; a departed id is absent
after a rebuild; the built object has **no top-level `id` key** (assert it explicitly — this is
the property that keeps the file invisible to `list()`).

**Keep this spec subprocess-free** — no `execFileSync`/`spawnSync`/`execSync`/`execPath`/
`child_process`. `mutate.mjs` refuses on any spec that trips those markers, and this spec must
stay fast-mutable.

### T4 — Inject the store into the daemon (P3: inject side effects, never reach for them)
Add the port to the constructor (`daemon.ts:190-199`) and its import (`:13-82`) following the
existing dependency pattern in that constructor. A default concrete implementation may be
constructed there, exactly as the other collaborators are.

**s097 is concurrently building `daemon.wiring.test.ts`, which constructs the real `Daemon`.**
If your constructor signature change breaks it, that is a **compile-time** break and it is the
expected, healthy outcome — do not work around it and do not contact s097.

### T5 — Replace the tick loop (`daemon.ts:286-293`)
One `heartbeat.write(...)` call carrying the whole owned set. Preserve the existing
`daemonOwnsDelivery(snapshot.harness ?? "pi", snapshot.deliveryMode)` filter exactly — the owned
set is unchanged, only the persistence shape changes. Remove the per-descriptor
`registry.read`/`registry.write`.

### T6 — Criteria AC-01, AC-03, AC-07
- **AC-01** (new-API): one `heartbeat.write` per tick with 5 owned descriptors
- **AC-03** (behavioural): still exactly one with **50** owned descriptors — the persist count is
  independent of the owned-set size
- **AC-07** (behavioural): after a tick, the **raw** on-disk descriptor JSON has
  `lastTickAt === undefined`. Read the file directly; do not go through the registry.

### T7 — The mutation gate, and correct the table from what you OBSERVE
Run **M1**: make the heartbeat write a no-op. Use `node ~/.pij/shared/mutate.mjs` with
**`--expect "<exact test name>"`** — mandatory. Without it the gate only knows *something* went
red, and **a flake is indistinguishable from a kill**.

Precondition the tool enforces and you must satisfy: **the suite is green before mutating.**

**Record the OBSERVED kill set, not the intended one.** The plan claims M1 kills AC-01, and
predicts M1 does **not** kill AC-02 (a no-op write still leaves `registry.write` at zero).
Confirm or refute both, and correct the plan's table from what actually died.
*A mutation table that does not kill what it claims is the same vacuity one level up.*

### T8 — Gates
`just typecheck` · `just lint` · targeted vitest for the files you touched. Run **all** of them,
not first-fail. Report every failure, including ones you believe pre-existing — say why you
believe it and cite evidence; do not assert environment contention without proof.

### T9 — Execution log
Append to `docs/plans/100-tick-heartbeat/assets/execution.log.md`: the T1 pre-fix red verbatim,
the M1 output verbatim, the observed kill set, gate results, and any deviation from this packet
with your reasoning. **Flag deviations, never hide them** — a measured override of my guess is
welcome; a silent one is not.

## Report back

Return the standard JSON completion report (`delegationId`, `outcome`, `summary`,
`filesChanged`, `testsRun`, `testsPassed`, `gatesClean`, `notes`). Put deviations, and any
number you had to measure rather than take from the plan, in `notes`.
