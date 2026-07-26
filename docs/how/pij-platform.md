# pij platform — the on-disk public contract

The pij platform's records are files, and the files are the API (WS-4): a UI,
a dashboard, or another tool reads them directly — no daemon RPC, no private
schema. This doc is the contract (AC-12): every public record, field by field,
plus the derivation rules for everything a consumer must compute rather than
read. A UI author should be able to build list / tree / node-card views from
this doc alone. Verbs that write these records: `docs/how/pij.md` (CLI) and
the pij skill's node route. Migration posture vs the prose governance spine:
`docs/how/pij-governance-migration.md`.

All paths are under `$PIJ_HOME` (default `~/.pij`).

## File layout

| Path | What | Public? |
|---|---|---|
| `<id>.json` | one session descriptor per node (registry) | **yes** — the node card's base record |
| `<id>/` | per-session data dir; `events.ndjson` inside is the **delivery transport** | no — internal (excluded from this contract by ruling) |
| `projects/<slug>/project.json` | one Project record | **yes** |
| `assignments/<assignmentId>.json` | one Assignment record | **yes** |
| `spine/events.ndjson` | THE machine-wide spine event log (one JSON object per line) | **yes** — append-only |
| `spine/spine.md` | markdown render of the log — regenerate with `pij spine render` | yes (read-only view; never hand-edit) |
| `spine/events.lock`, `spine/write.lock`, `spine/ops/`, `spine/event-once-*.json` | append lock, platform write lock, op journal, idempotence markers | no — internal, never parse |

Law: platform records live in **subdirectories**. Any new top-level
`<name>.json` would be read as a session descriptor (phantom-peer hazard), so
no consumer should ever write one.

## Records

Every record is schema-versioned (`schema_version: 1`). Additive evolution
only: readers must tolerate unknown fields; absent optionals are ABSENT keys,
never `null` (JSON `null` is never "absent" — one exception noted below).

### Project — `projects/<slug>/project.json`

| Field | Type | Notes |
|---|---|---|
| `schema_version` | `1` | |
| `slug` | string | kebab slug of the description; `-2`/`-3` collision suffix |
| `description` | string | |
| `repo?` | string | repo anchor |
| `planPath?` | string | set via `pij project set --plan` |
| `primeId?` | string | owning prime seat, via `pij project set --prime` |
| `created` | `{actor, ts}` | attribution; `ts` ISO-8601 |

A project's task list is a **join, not a field**: the assignments carrying its
`projectSlug`. Nothing duplicates that list.

### Assignment — `assignments/<assignmentId>.json`

| Field | Type | Notes |
|---|---|---|
| `schema_version` | `1` | |
| `id` | string | `asg-<adjective-noun>`; the implicit general assignment is the fixed id `asg-general-<nodeId>`, materialized on first task/state write |
| `nodeId` | string | the pij session id |
| `projectSlug?` | string | joins the assignment to a project |
| `task` | string | |
| `states` | number[] | spine `seq` refs — the assignment's state history is IN the spine, this is the index |
| `opened` | `{actor, ts}` | |
| `closed?` | `{actor, ts, reason}` | `reason ∈ done\|cancelled\|failed\|superseded` (closed union) |

### SpineEvent — one line of `spine/events.ndjson`

| Field | Type | Notes |
|---|---|---|
| `schema_version` | `1` | |
| `seq` | number | allocated by the log at append (cross-process atomic); strictly increasing |
| `ts` | string | ISO-8601 |
| `actor` | string | who wrote it — every write is attributed |
| `actorProvenance?` | `"resolved"\|"asserted"` | resolved self vs `--actor` assertion |
| `kind` | string | **open vocabulary** (WS-5): external writers may mint kinds; consumers must tolerate unknown kinds |
| `refs` | string[] | structured `type:value` refs (`node:<id>`, `parent:<id>`, `assignment:<id>`, `state:<word>`, …); always present (may be empty) |
| `peer?` | string | exact-match query key (`pij spine events --peer`) |
| `project?` | string | exact-match query key |
| `repo?` | string | |
| `prev?` / `next?` | string | the transition the event records (payload depends on kind) |
| `verifiedBy?` | string | on verification events |

The log is **append-only**: later writes never mutate or delete earlier lines;
duplicate/replayed appends are idempotent (once-markers). Filters are exact
string equality; `--since N` is exclusive (`seq > N`).

Kinds pij itself emits (external kinds may appear beside them):

| kind | writer | prev/next carry |
|---|---|---|
| `project-created` / `project-set` | verbs | canonical project JSON |
| `task-set` / `state-set` / `state-verified` | verbs | canonical assignment JSON (`states[]` excluded); semantic transition rides `state:<word>` refs |
| `system-state` | **daemon only** (`actor: daemon`) | WS-6 SystemState words |
| `node-linked` | `pij link` | prev = old **effective** parent, next = new parent; a `--root` link OMITS `next` (never null) and refs `[node:<child>]` only |

### Session descriptor — node-truth block (`<id>.json`)

Descriptors predate the platform; the plan-054 additions are one additive
block (all optional ⇒ every legacy descriptor still loads — AC-11). Public
fields a card/list needs, beyond the long-standing basics (`id`, `role`,
`folder`, `paneId`, `harness`, `boundModel`, `effort`, `prime?`, `parentId?`,
`spawnedBy?`):

| Field | Type | Owner / meaning |
|---|---|---|
| `currentAssignment?` | string | UI denorm — the assignment id the node points at |
| `currentTask?` | string | denormalized task text |
| `semanticState?` | SemanticState | denorm of the current assignment's latest declared state — **externally owned** (the daemon never clobbers it) |
| `systemState?` | SystemState | mechanical verdict — **daemon-computed only**; no other writer |
| `windowId?` | string | tmux window (`@N`); `tmux select-window -t <windowId>` opens the node's terminal |
| `contextMax?` | number | models-registry join via `boundModel` (see derivation rules) |
| `contextCurrent?` | `{value: number\|"unknown", asOf, provenance}` | latest gauge reading — real or honest-unknown, never an estimate |

## Ruled vocabularies (byte-exact — never extend, rename, or reorder)

- **SemanticState** (agent-declared, per assignment): `blocked question hold
  waiting ready failed cancelled done`
- **SystemState** (pij-computed only; honest `unknown` over any guess):
  `starting working idle stalled stopped dead unknown`

## UI derivation rules (what you compute, not read)

**Badge (worst-first, AC-05).** One badge per node: the worst of the node's
`systemState` plus the latest declared semantic state of **every OPEN
assignment**; no candidates at all → `unknown`. Severity order, worst first
(covers both vocabularies exactly once):

```
dead failed stalled blocked question hold stopped unknown
waiting starting working ready cancelled done idle
```

**Effective parent.** `parentId` when the key is present — including the
explicit `parentId: null` root marker (the one sanctioned `null`, meaning "a
ruled root", distinct from the key being absent) — else `spawnedBy`, else
none. `spawnedBy` is immutable spawn provenance; `parentId` is the living
tree edge (`pij link` re-parents it, audited as `node-linked`).

**Unadopted (adoption axis).** `prime !== true && effectiveParent === null`.
Tree nodes carry it present-when-true (`"unadopted": true`); list rows carry
it as an always-present boolean. Prime seats are legal roots, never flagged.

**Three independent axes.** Adoption (above) ≠ structural (`problem ∈
orphan|filtered-parent|cycle` — an orphan HAS a parent pointer whose target
vanished) ≠ runtime (`systemState`). Never merge them in a view.

**Done is a claim (AC-06).** An assignment whose latest declared state is
`done` with no later `state-verified` event in its chain renders
**unverified**; verification adds `verifiedBy` and flips it.

**Context gauges (AC-09).** `contextMax` comes from the models-registry join
on `boundModel` — **the sole source, by ruling (P4 T006c)**: the codex
rollout's self-reported `model_context_window` is deliberately unwired (a
self-reported max needs its own trust story, and precedence over the registry
would need a ruling that has not been made). `contextCurrent.value` is a real
token count or the literal `"unknown"`; `provenance` names the source
attempted (`pi-events`, `claude-transcript`, `codex-rollout`,
`copilot-none`). Absent source ⇒ `unknown`, never a guess.

**spine.md.** A render, not a log: byte-stable for an unchanged log,
regenerated by `pij spine render`, unknown kinds and additive fields rendered
honestly. Never hand-edit; never parse it back — parse `events.ndjson`.

## Anomaly queries (derived safety — guidance, never jail)

Anyone may write anything; safety is derived. `pij anomalies --json` returns:

```
{ kind, nodeId, assignmentId?, detail, evidence: number[] }   // evidence = spine seqs
```

| kind | fires when |
|---|---|
| `axis-disagreement` | semantic-active assignment + system `idle` beyond the threshold (default 4h) — the lost-dispatch shape |
| `unverified-done` | latest declared `done` with no later verification |
| `foreign-hold-clear` | a `hold` cleared by a different actor than its issuer |

The daemon pushes a parent alert **once per transition** (latch) and never
acts on an anomaly itself.

## Consistency notes (what a reader may observe)

- **Coupled writes** (project/task/state verbs): journal-FIRST under the
  machine-wide platform write lock — the audit event is journaled as intent
  before state commits, appended after, recovered on the next platform write
  if a crash intervenes. Committed state without its audit event does not
  survive.
- **Uncoupled events** (`system-state`, `node-linked`): the DESCRIPTOR is the
  truth, the event is telemetry/history. Descriptor truth is written first
  and never waits on the spine; a failed append is surfaced to the writer
  (`spineSeq: null` + warning), never forged.
- Known benign window (P3, documented no-fix): `pij link` writes the
  descriptor outside the platform write lock (registry writes have their own
  atomic-replace), so a reader can observe a new parent moments before its
  `node-linked` event lands. Uncoupled doctrine makes this honest: tree truth
  is the descriptor.
- All record writes are atomic replaces — readers never see half a JSON file.
  NDJSON readers must skip torn/corrupt lines (every pij parser does).

## Path stability — what an external reader may bind to (ruling, 2026-07-26)

The contract above is a **schema** contract. It was silent on **paths**, and an
external reader needs both. Ruled here after the chainglass UI workstream hit the
gap.

**Public and stable — bind to the file.**

- `~/.pij/spine/` — the append-only spine. Append-only, schema-versioned per line,
  open-vocabulary by design, and the highest-volume thing any consumer polls.
  A cursor over this file is a supported access pattern. It will not move or change
  format without notice to known consumers.

**NOT stable — read through the CLI.**

- Individual record paths, including `~/.pij/<id>.json`. The two-tier registry
  (s071) *renames records between `~/.pij/` and `~/.pij/archive/`* — `renameSync`
  in `adapters/fs-registry.ts` — on a 48h terminal TTL. 1,988 of ~2,184 seats
  currently live in `archive/`. A watcher bound to a record path will see it
  vanish and must not read that as deletion. Schema was preserved across that
  change; **location was not**, and nothing in this document promised it would be.
- Directory scans of `~/.pij/`. Atomic replace is implemented as write-temp +
  rename, so `<id>.json.tmp-<pid>-<uuid>` files appear transiently and can be left
  behind by a crash (there is one on this host today). Any consumer listing that
  directory must filter them; the CLI already does.

**What atomic replace does and does not buy a reader.** It does rule out torn
reads — a reader never sees half a JSON file, exactly as stated above. It does
**not** make a record self-consistent with the rest of the store at that instant:
cross-file ordering skew is real (the `pij link` window above is one documented
case) and is surface-independent. The per-field merge law is a **writer** hazard —
read-modify-write from outside loses concurrent daemon updates — and a read-only
consumer cannot enter that class.

**Consequence for polling.** A CLI invocation costs ~0.42–0.48s wall clock
(measured, two independent observers, 2026-07-26). At a 1–2s cursor cadence that
is a 25–50% duty cycle of process spawning on a shared host. Reading the spine
file directly is <0.01s. Cursor cadence therefore belongs on the file; derived
views (`tree`, `node show`, `anomalies`) belong on the CLI at slow cadence,
because re-implementing pij's derivation logic outside pij is the failure this
document exists to prevent.
