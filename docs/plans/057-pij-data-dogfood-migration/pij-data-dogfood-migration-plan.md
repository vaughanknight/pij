# pij data dogfood migration — plan 057

**Status**: ❌ **CANCELLED — Jordan's ruling 2026-07-18: "we are not going to do migrations, agents can just create fresh themselves."** No importer, no equivalence harness, no cutover; the prose government stands as historical record and new governance is created natively in the platform store. The P1 workshop gate dissolves. What survives of s057: the machine-wide deploy-from-worktree + fleet dogfood with rapid fixes (deploy sequence unchanged, gated on s056). *(Plan body below kept for the record; was FINAL-accepted by o-prime pre-cancellation.)*
**Ordinal**: 057 · **Branch**: `s057/pij-data-dogfood-migration` · **Base**: `main@3b33879`
**Depends on**: s054 (platform store — `pij project`/`pij spine`, `buildSpineEvent`, render). Converges through o-prime.
**Origin**: Jordan's cutover ruling ("merge over our pij data to the new way to dogfood it"); WS-3/R4 cutover authorized. o-prime allocation Seq (057).

## Business Specification

### Summary
Migrate pij's **live governance data** — the prose government spine, the `prime-flow.json`
portfolio, and the live `~/.pij` registry — into the deterministic platform store s054
shipped, so the store is dogfooded on real data. The prose government stays the
**authoritative writer** until the migrated JSON store is *proven equivalent*; this stream
builds the migration + the equivalence proof + a cutover-ready posture and **stops before
the authoritative-writer flip** (that flip is a separate Jordan ruling).

### The real data (surveyed 2026-07-18, read-only — a MOVING source)
**The prose spine is written live through the entire dogfood** (Seq 481 at plan
acceptance, ~15 events that day alone). Survey numbers below are scale
indicators, never pinned constants: every extractor, ledger, and sensor run keys
to the **current prose at run time**.
- `government/spine.md` — **191 timestamped governance events** (`**Event HH:MMZ — TITLE**: body`), current Seq 195. Dense narrative rulings: stream transitions, baton grants, teardowns, priority calls, defect ledgering.
- `government/prime-flow.json` — **14 nodes** (`kind: prime-flow`, E309-legacy), each node a stream/plan in the portfolio (wi-036…) with label + nav status.
- `~/.pij/*.json` — **1394 live descriptors** (the messaging registry) + the platform store's own `spine/events.ndjson` (already live from s054).

### Goals
- ✅ Every load-bearing governance fact in the authoritative prose resolves to a platform record (Project / SpineEvent / Assignment).
- ✅ The migrated store **invents nothing** the prose doesn't support (soundness).
- ✅ A **dual-run divergence sensor** proves equivalence continuously, on real data, and is the artifact that makes an eventual cutover a *proof* rather than a leap.
- ✅ Everything runs against a **staging home**; live authoritative data is read, never mutated.

### Non-Goals / HARD STOPS
- ❌ **The authoritative-writer flip.** Prose government stays authoritative; this stream stops at "migrated store + proven equivalence + cutover-ready posture." The flip is a separate Jordan ruling.
- ❌ **Erasing or striking `government/**`.** Read-only this stream. A tombstone header (prose → JSON pointer) is a *post-cutover* act, out of scope.
- ❌ **Mutating `prime-flow.json`** — stays byte-frozen (blob `9b7d5b5`, as through all of s054).
- ❌ **Writing the live authoritative `~/.pij` store** during build/review — staging home only. **This is not a global aspiration but a mechanical gate (F1, AC-09): the importer/sensor MUST assert `PIJ_HOME` resolves to an explicit staging path `!= ~/.pij` and ABORT otherwise — `resolvePijHome({})` defaults to the LIVE store and an empty env var silently falls back to it, so "staging" that relies on remembering to set a var is a hard-stop leak.** Every phase that runs the importer/sensor re-states this.
- ❌ Inventing spine-event *kinds* — OR the actor/date/Seq policies (below) — for governance without a human ruling (see P1 workshop).

### Acceptance Criteria (draft — P1 workshop refines AC-01/02)
- **AC-01** Fact-set model: the discrete governance fact taxonomy (stream, ruling, baton grant, transition, supersession, assignment) is ruled and documented, with each fact's platform record + spine-event-kind mapping. *(workshop output)*
- **AC-02** Spine-event-kind vocabulary for governance is human-ruled and pinned. *(workshop output)*
- **AC-03** Importer translates prose + prime-flow + registry → platform records into a staging home; pure mapper + a CLI verb; re-runnable, deterministic.
- **AC-04** Completeness: every fact extracted from the authoritative prose resolves to a migrated record (0 misses = green).
- **AC-05** Soundness: every fact in the migrated store is prose-supported (0 fabrications = green). **An actor recorded with `asserted` provenance under the P1-ruled placeholder/provenance policy is NOT a fabrication** — fabrication means an actor the prose neither states nor the policy derives. *(F3)*
- **AC-06** Render round-trip: `pij spine render` of the migrated store fact-diffs clean against the prose spine — **at exactly the P1-pinned granularity**: `ts` compares per the ruled date-reconstruction algorithm (prose carries only `HH:MMZ`, no date), and ordering compares on the **governance Seq stored as its own field/reference — never the platform's append-allocated `seq`**. *(F4)*
- **AC-07** Dual-run equivalence sensor: a runnable check reporting divergence between authoritative prose and migrated store; ships with a proving-window protocol.
- **AC-08** Cutover checklist exists (R3-gated, listed-not-executed): the flip steps + the equivalence bar that must hold, ending at a Jordan ruling.
- **AC-09** Staging-home gate is **mechanical**: importer + sensor assert the resolved home is an explicit staging path `!= ~/.pij` and ABORT otherwise; a test proves the abort fires (see Non-Goals — `resolvePijHome({})` defaults LIVE). *(F1)*
- **AC-10** Residue coverage: **every prose Event paragraph in the authoritative spine AT RUN TIME is accounted for** (191 at survey — live and growing) — mapped to ≥1 extracted fact OR explicitly classified `narrative-residue` with a reason; 0 unaccounted = green. The ledger re-enumerates the current prose on every run — never a pinned snapshot — and the divergence sensor (AC-07) treats a NEW prose paragraph as a new-fact-to-map, never as divergence. This is the anti-symmetric-blindness check: completeness/soundness/round-trip all project through the SAME ruled extractor, so a fact class the taxonomy omits is invisible to all three — the residue ledger is the only check that sees the raw paragraphs. *(F2)*
- **AC-11** Registry equivalence: every live descriptor maps to its platform record(s) (completeness) and every imported record traces back to a descriptor (soundness); the 11 known pane+pid collisions surface as N honest flagged records, never reconciled. Registry is JSON→JSON, so this is mechanical — but it is proven, not assumed. *(F5)*

### Risks
- **Prose is richer than any fact-set.** Mitigation: equivalence is defined as *fact-set projection*, not prose≡JSON; the fact-set is human-ruled (P1), so "equivalent" means what Jordan says it means.
- **Attribution gaps.** Historical spine events predate the attribution envelope; some carry `operator`/prime, some are ambiguous. Mitigation: importer records provenance honestly (`asserted` vs `resolved`), never fabricates an actor.
- **1394 descriptors include the collision class** (11 known pane+pid collisions). Mitigation: migration surfaces them as data, never reconciles them (that's s051/dedup territory) — a duplicate seat becomes N honest records, flagged.

## Implementation Plan

### Domain Manifest
- `pij-orchestration` (platform store consumer: importer + fact extractors) · `pij-control-plane` (CLI verb) · no NEW domain. Governance-doc semantics are **read-only inputs**, not a domain this stream owns.

### Key Findings
1. **The fact-set is the contract, and it's human-ruled.** A spine.md event paragraph carries far more than any record; deciding its load-bearing fields + kind is a WS-1/WS-6-class ruling (P1 workshop, Jordan-driven).
2. **Equivalence is bidirectional projection, not identity.** Completeness (prose→store, no loss) + soundness (store→prose, no fabrication) + render round-trip; the dual-run sensor is the durable deliverable.
3. **prime-flow.json is E309-legacy and frozen.** It's a *read input* (portfolio → Projects), never rewritten. Its own JSON→platform migration is part of the fact-set, not a schema edit.
4. **s054's store is the target as-shipped.** `buildSpineEvent` (attributed, seq-inside-port), append-only spine, `canonicalProjectJson`, `pij spine render`. Migration is additive; no s054 contract change expected (if one is needed → port-first, escalate).

### Phases
| Phase | Title | Objective | Depends |
|---|---|---|---|
| 1 | Fact model + mapping (**workshop-first**) | Rule the governance-fact taxonomy + spine-event-kind vocabulary; extractors that enumerate the authoritative fact-set | none |
| 2 | Importer | Pure prose/prime-flow/registry → platform-record mapper + CLI verb writing a **staging** home | 1 |
| 3 | Equivalence harness | Completeness + soundness + render round-trip checks; the **dual-run divergence sensor** | 1, 2 |
| 4 | Dual-run posture + cutover checklist | Dual-run protocol doc; cutover checklist (listed-not-executed); STOP at cutover-ready | 1–3 |

**P1 opens with a Jordan-driven workshop** ruling FOUR things (all contract territory — no coder dispatch until ruled):
1. The `government/spine.md` **fact taxonomy** (AC-01).
2. The **spine-event-kind vocabulary** for governance (AC-02).
3. The **placeholder-actor + provenance policy** — the historical events (191 at survey) predate the attribution envelope, yet `actor` is mandatory on every SpineEvent; the policy names the placeholder form and when `asserted` vs `resolved` provenance applies (feeds AC-05). *(F3)*
4. The **date-reconstruction algorithm** (prose timestamps are `HH:MMZ` only) + the **governance-Seq storage mapping** (its own field/ref — platform `seq` is append-allocated and can never carry it), pinning AC-06's comparison granularity. *(F4)*

### The equivalence-proof design (the backbone)
1. **Completeness** — extract the load-bearing fact-set from the authoritative prose (streams, ordinals, statuses, prime assignments, baton grants, rulings, supersessions); assert each resolves to a migrated record. Paired with the **residue ledger** (AC-10): every raw prose paragraph is either fact-mapped or classified residue-with-reason, so extractor blind spots surface instead of passing green.
2. **Soundness** — extract the fact-set from the migrated store; assert each is prose-supported (no fabrication).
3. **Render round-trip** — `pij spine render` the store → md; fact-level diff vs the prose spine (formats differ by design).
4. **Dual-run window** — both stores live, prose authoritative, the sensor reports divergence on a cadence; cutover ruled only after zero divergence across a proving window **and** a Jordan ruling.

### Cutover posture (P4, not executed here)
Prose authoritative → dual-run (sensor green) → **[separate Jordan ruling]** → flip authoritative writer → tombstone prose (points at JSON). Only the first two are in this stream.
