# Phase 2 — the overlay, the scrub, and the ruled behaviour change

**Plan**: `docs/plans/100-tick-heartbeat/tick-heartbeat-plan.md` — read § *The write-back defect,
and the scrub that closes it* in full before writing anything. It is the reason this phase exists
in the shape it does.
**Dossier**: `docs/plans/100-tick-heartbeat/assets/research-dossier.md`

## What this phase must achieve

Phase 1 removed `lastTickAt` from descriptors. Right now every reader sees `undefined`, and
`daemonTickStatus(undefined, now)` returns `daemonTickStale: true` (`core/receipts.ts:31-33`) —
which means **every send to every claude/copilot peer currently reports `unverified`**
(`cli.ts:3398`). This phase restores the reader surface **without** restoring the writes.

Three things, and the second is the one that makes or breaks the design:

1. **Overlay** — `read()`/`list()` attach `lastTickAt` from the heartbeat map.
2. **Scrub** — the overlaid value must **never** be persisted back.
3. **Prune on lifecycle** — a reincarnated id must not inherit a stale stamp.

## Ownership — hard boundary

**You may edit ONLY:**
- `.pi/extensions/pij/adapters/fs-registry.ts`
- `.pi/extensions/pij/adapters/fs-registry.overlay.test.ts` (NEW)
- `.pi/extensions/pij/core/daemon/tick-heartbeat.ts` / `.test.ts` (if the store needs a helper)
- `docs/plans/100-tick-heartbeat/assets/execution.log.md` (append only)

**Forbidden — live streams are in these files right now:**
- `daemon.ts` **entirely** in this phase (Phase 1 is done; do not revisit it)
- `core/cli.ts`, `cli.ts`, `core/archive.ts`, `core/watchdog.ts`, `core/anomalies.ts`
- `.the-flow-state.json`, `the-flow.json`, `the-flow.md`
- `docs/how/fleet/ledger.md`

**Do not "fix" any reader.** The whole point of the overlay is that no reader changes.

## Tasks

### T1 — The overlay
`read(id)` and `list()` attach `lastTickAt` from the heartbeat map when an entry exists for that
id. Read the map **once per `list()`**, not once per descriptor.

`read()` falls back to the archive by direct path (`fs-registry.ts:156-158`); decide and state in
a comment whether an archived record gets an overlay. **Recommended: no** — an archived record is
terminal and a fresh stamp on it would be a lie.

### T2 — THE SCRUB (the load-bearing task)
`FsRegistry.publish()` takes `existing` from `this.read()` (`:204`), and real callers spread a
read result straight into a write. The one that matters runs on **every `pij send`, in a CLI
process**:

```ts
// core/cli.ts:2179 — stampSenderActivity
const latest = deps.registry.read(self);
deps.registry.write({ ...latest, lastEventAt: ... });
```

Without a scrub, `latest` carries the synthetic stamp and the spread **persists it** — the writes
come back, in CLI processes, on the most latency-sensitive path in the system. **That would make
this a performance fix that relocates the cost onto the path it was measured against.**

**Strip `lastTickAt` immediately before every durable write** — the descriptor `writeAtomic` and
`syncIdentitySnapshot`. One choke point, covering every caller regardless of what it spread, with
**zero caller changes**.

Do **not** use a non-enumerable property instead: it defeats spread and `JSON.stringify` equally,
so it would silently drop `lastTickAt` from every JSON output surface — trading a write defect for
a display defect.

### T3 — Prune on the lifecycle paths
`dissolve`, `remove`, `archive`, `revive`, and any restore/reclaim path must drop the id from the
heartbeat map. `revive` deliberately strips `lastTickAt` from the old descriptor
(`core/revive.ts:661-675`) — an un-pruned map entry would **bypass a scrub the codebase already
thought it had** and certify a dead daemon healthy for up to the 30s threshold.

### T4 — Criteria
All in the NEW `fs-registry.overlay.test.ts`, against the **real `FsRegistry`** — never
`FakeRegistry`, which has no overlay (`adapters/fakes.ts:164-190`) and would pass in a world where
production fails.

| AC | kind | assertion |
|---|---|---|
| AC-04 | preserved-property | `read(id).lastTickAt === tickAt` — passes before AND after |
| AC-05 | preserved-property | the send receipt for a freshly-ticked claude/copilot target is **`queued`**, not `unverified` — **must exercise the real receipt path, not a stub** |
| AC-06 | preserved-property | `list().length` unchanged with the heartbeat file present in `pijHome` |
| AC-08 | **behavioural** | a dissolved record, `lastEventAt` 60h old, `lastTickAt` 1h old, classifies **`archivable`** |
| AC-09 | **mutation-only** | overlay stamp older than the threshold ⇒ `daemonTickStale === true`. No pre-fix form exists — proved by M4 |
| AC-12 | **behavioural** | `read()` → mutate an unrelated field → `write()` ⇒ the **raw** on-disk descriptor has `lastTickAt === undefined` |
| AC-13 | **behavioural** | seed a fresh map entry, `dissolve` + `revive` with **no** intervening tick ⇒ `daemonTickStale === true` |

**AC-05 is the load-bearing criterion of this whole design.** The overlay's stated virtue is that
readers work *unaware* — and an unaware reader cannot notice the overlay stopped applying. AC-05
is the only criterion that observes the overlay **from outside**. Through a stub it proves nothing.

### T5 — Keep the new spec subprocess-free
No `execFileSync`/`spawnSync`/`execSync`/`execPath`/`child_process` in
`fs-registry.overlay.test.ts`. The existing `fs-registry.test.ts` trips the marker in its own
source (`child_process:1`, `execPath:79`) and `mutate.mjs` refuses on it; the new spec exists
precisely so every mutant stays runnable on the fast tool — **including by the reviewer, who has
no write access to your tree**.

### T6 — Mutation gate, `--expect` mandatory, record the OBSERVED kill set
| mutant | must go red |
|---|---|
| M2 overlay returns the descriptor unchanged | AC-04, **AC-05** |
| M3 prune removed from the lifecycle paths | AC-13 |
| M4 overlay stamps `now` instead of the persisted value | **AC-09** |
| M5 **scrub removed** | **AC-12** |

Suite green before mutating. **Correct the plan's table from what actually died, not what it
predicted.** A mutation table that does not kill what it claims is the same vacuity one level up —
the plan already carries two corrections of that kind; find the third if it is there.

### T7 — Document the divergence at BOTH ends
A descriptor's shape now depends on which access path read it: via `read()`/`list()` it carries
`lastTickAt`; via `readFile` it does not. This is **load-bearing** — it is exactly what makes
`sweepArchivable` (which uses `readFile` at `:640`) age records without the tick axis, per the
ruling.

Comment it at the **overlay site** *and* at the **`readFile` path**. A divergence documented only
where it is created is invisible to everyone who meets it where it matters.

### T8 — Gates
`just typecheck` · `just lint` · targeted vitest. All of them, not first-fail. Report every
failure with evidence; never assert environment contention without proof.

### T9 — Execution log
Verbatim pre-fix reds (AC-08, AC-12, AC-13), verbatim mutation output, the observed kill set,
gate results, deviations with reasoning.

## Report back

Standard JSON completion report. Deviations and measured overrides in `notes`.
