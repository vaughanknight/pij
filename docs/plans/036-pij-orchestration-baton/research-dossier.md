# Research Dossier: pij orchestration baton — the P-07 baton primitive

**Generated**: 2026-07-11T08:55:00Z
**Query**: "i think 07 here is a good opportunity to dogfood. we can set up an orchestrator and have it work through adding baton. i think it should be pij orchestration baton though, so we can add more orchestration primitives later."
**Effort**: Standard
**Tools**: Standard
**Evidence**: 9 current sources · 6 historical sources

## Answer

- The repo already contains every mechanical ingredient the primitive needs: an atomic no-replace lease publish (`FsRegistry.claim` temp+fsync+`linkSync`), a pure lock-decision module with injected liveness (`core/daemon/lock.ts`), a delivery-receipt vocabulary (`queued|delivered|unverified`), and a daemon tick loop that already pushes lifecycle transitions to creators.
- The **watch verb family (plans 033/034) is the end-to-end template** for adding `pij orchestration baton <verb>`: bin-level verb intercept → pure core module → fs sidecar store adapter → daemon manager component → store-targeted tests with fakes.
- Namespace is ruled (`pij orchestration baton <verb>`, ruling #2 in `original-ask.md`) — the bin's `main()` gains one `if (top === "orchestration")` intercept, mirroring `agent`/`watch`.
- Run-01 field evidence (vendored interview) reshapes requirements: the queue is a **dependency DAG with granter discretion, never FIFO**; the one deterministic rule worth shipping first is **stale-SHA re-pin enforcement at grant/apply**; automate bookkeeping/liveness/push/measurement, never reclaim/breach/ordering judgment; scope leases **per-registry (machine) with a repo field**.
- The book (`government/baton-book.md`) is retained as the human evidence layer: the primitive emits machine lines; the keeper (a seat, never the daemon) owns the book file — single-writer discipline.
- Recursion hazard is real and doubles as the dogfood: implementing the primitive requires edits under `.pi/extensions/pij/**`, which require the **daemon-restart baton** (C6) from the o-prime — this run will exercise the convention it mechanizes.

## Evidence

| ID | Finding | Evidence | Planning implication | Confidence |
|----|---------|----------|----------------------|------------|
| F-01 | Bin CLI dispatches verb families by top-token intercept (`spawn`/`adopt`/`watch`/`daemon`/`agent`…) before the core parser; each family = `run<Verb>` + parse + pure dispatch | `.pi/extensions/pij/cli.ts:1752-1853` | `orchestration` slots in as one more intercept + `runOrchestrationVerb`; core parser untouched | High |
| F-02 | Atomic no-replace publish exists: temp file `wx` + full write + fsync + `linkSync` (no-replace hard link), cleanup on failure | `.pi/extensions/pij/adapters/fs-registry.ts:329-350` | The lease acquire is this exact pattern on a per-baton path — atomic file-create leases from the design sketch are already house idiom | High |
| F-03 | Pure decision + injected liveness probe is the tested pattern for lock semantics (`acquire/refuse/reclaim`, stale-holder detection) | `.pi/extensions/pij/core/daemon/lock.ts:20-62` | The baton lease decision module mirrors this shape (pure, injected `isAlive`, tagged-union outcome); tests target it directly | High |
| F-04 | Receipt vocabulary `queued|delivered|unverified` with `initialReceipt`/`markDelivered`/`correlateDeliveredAt` already models push-delivery verification | `.pi/extensions/pij/core/receipts.ts:22-84` | "Delivery-verified pushed grants" (interview §9 magic wand) rides the existing receipt path — no new transport | High |
| F-05 | Daemon tick loop (`driveSession`, `observeActivity`) already sweeps liveness and pushes stalled/dead transitions to creators once per transition | `.pi/extensions/pij/core/daemon/loop.ts:111-330`, `docs/how/pij.md#fail-loud-model-layer` | Holder-liveness alerts are a new sweep hook in the same loop; alert-never-auto-reclaim = push a notice, never mutate the lease | High |
| F-06 | Watch family (plan 033/034) is the newest complete verb-family addition: CLI verbs + `WatchStorePort` + `FsWatchStore` sidecar + `PeerWatchManager` daemon component | `.pi/extensions/pij/cli.ts:1791-1798`, `adapters/watch-store.ts:20-51`, `core/daemon/watch.ts:22-39` | Copy this file/test topology for `core/orchestration/` + `adapters/` + daemon wiring | High |
| F-07 | Ports are narrow interfaces (`RegistryPort`, `EventLogPort`, `DeliveryPort`, `ProcessPort`…); side effects injected via constructor (P3); tagged-union returns (P4); tests target stores not wiring (P8) | `.pi/extensions/pij/core/ports.ts:17-141`, `AGENTS.md` P1–P10 | A `BatonStorePort` (or similar) keeps core pi-free and testable with `adapters/fakes.ts` | High |
| F-08 | `SessionDescriptor` changes are additive/migration-safe only; legacy descriptors must always load | `.pi/extensions/pij/core/types.ts:77-124` (comment class) | If a lease references holder sessions, never extend the descriptor non-additively; prefer a separate lease record under `PIJ_HOME` | High |
| F-09 | Daemon runs `tsx` off source with no hot-reload — every extension edit is invisible until restart, and restart interrupts every live peer machine-wide | `/pij` skill § C6; `government/spine.md` SW-2 | Implementation phases need the daemon-restart baton from the o-prime; batch edits to minimize restarts | High |

## Historical Evidence

| ID | Prior friction / decision | Source | Applicability now | Implication |
|----|---------------------------|--------|-------------------|-------------|
| H-01 | R9.7: primitive = registry-backed lease, one holder, pushed grants, queue, reclaim, holder liveness; book RETAINED as evidence layer; convention held 8+ cycles so no urgency-driven shortcuts | `docs/plans/035-o-prime-routing-skill/requirements-spine.md#R9.7` | Direct | The requirements seed; scope v1 against it |
| H-02 | Queue is a dependency DAG, never FIFO — a positional promise had to be publicly retracted; granter discretion is the feature | `research/interview-uec99o-answers.vendored.md#6` | Direct | Model the queue as requests-with-purposes; no auto-ordering |
| H-03 | Stale SHA-pinned grants (2 cases in one hour): mechanize pin-vs-HEAD compare + explicit re-pin ack at grant/apply | `research/interview-uec99o-answers.vendored.md#3` | Direct | The one deterministic enforcement rule to ship; cheap and would have caught both |
| H-04 | Reclaim/breach/ordering/mid-hold windows must stay human; safe to automate: liveness alert, bookkeeping, pushed delivery + receipts, stale-SHA detection, blocked-time measurement, "you don't hold X" advisory | `research/interview-uec99o-answers.vendored.md#5` | Direct | Draws the v1 automation boundary; alert-never-auto-reclaim confirmed by the one real reclaim (git-log judgment) |
| H-05 | E-22 / INC-004: the git index is an unserialized surface; fix was policy (pathspec-mandatory, commit-slot) not machinery — primitive's job is making lease *state* visible, not re-implementing git | `docs/plans/035-o-prime-routing-skill/vendored/encode-candidates.2026-07-11T08Z.md` E-22; `research/interview-uec99o-answers.vendored.md#4` | Direct | Model the surface as a baton kind; keep pathspec/commit-slot policy in the book/rulings layer |
| H-06 | Run-01 receipts couldn't distinguish busy-peer from wedged-daemon; INC-001 hid behind that ~20 min. Grants must carry purpose + declared return-evidence machine-readably | `research/interview-uec99o-answers.vendored.md#9` | Direct | Grant push should demand a delivered receipt (F-04) and surface non-delivery loudly; lease record carries purpose + return-evidence declaration |

## Risks and Unknowns

| Item | Evidence | Why it matters | Resolution / next evidence |
|------|----------|----------------|----------------------------|
| Daemon-restart recursion: shipping the primitive requires the baton it implements | F-09, `government/baton-book.md` | Restart interrupts every live peer incl. this stream and the o-prime | Request daemon-restart baton per phase; batch edits; the book covers us until the primitive lands |
| v1 verb scope unsettled (minimal request/return/reclaim vs sketch extras: `--pin`, `with` wrapper, windows) | H-01 vs original-ask sketch pointers | Determines phase count and CS | Settle at plan/workshop; H-02/H-03 push DAG-queue semantics + re-pin into v1 candidates |
| Book ↔ primitive write boundary: primitive must NOT own the book file (single-writer = the keeper seat) | H-04, `research/interview-uec99o-answers.vendored.md#7` | A daemon writing the book breaks the government's single-writer law | Primitive emits machine lines to its own log/registry; keeper folds/annotates the book |
| Machine-wide `PIJ_HOME` lease root vs per-repo batons (git-index) | interview §8; `~/.pij` layout (daemon.lock at root) | Per-folder-only would miss machine-wide resources (daemon, compositor-class) | v1: per-registry scope + `repo` field on each lease, per interview evidence |

## Planning Handoff

- **Preserve**: additive descriptor schema (F-08); pure-core/adapter split + P1–P10 (F-07); existing receipt vocabulary (F-04); the book as human evidence layer with keeper as its only writer; alert-never-auto-reclaim (H-04); the ruled namespace (do not re-litigate).
- **Change carefully**: `daemon.ts`/`core/daemon/loop.ts` (every edit needs a restart baton — F-09); anything touching `SessionDescriptor`.
- **Likely files/symbols**: `cli.ts` `main()` intercept + `runOrchestrationVerb`; new `core/orchestration/baton.ts` (pure lease decisions, mirroring `lock.ts`); new adapter (lease store under `PIJ_HOME`, mirroring `watch-store.ts` + `fs-registry.ts` claim pattern); daemon sweep hook in `loop.ts`; grant push via existing `DeliveryPort` + receipts; `skills/pij/references/prime/rituals/batons.md` update at ship (fenced, granted later).
- **Decisions still required**: v1 verb set (request/return/reclaim + list/show? `--pin` re-verify in or out?); lease record shape (purpose + declared return-evidence per H-06); queue representation (requests-with-purposes, granter-discretion grant); blocked-time measurement (R4.4) in v1 or later; whether `with`-wrapper ships v1.

## External Research

_Omitted — repo + vendored run-01 evidence answer all material questions._
