# Plan — s100 tick-heartbeat: one heartbeat write per tick, not 132

**Issue** pij#180 (Fix A) · **stream** s100 · **branch** `s100/tick-heartbeat` · **base** `a2a50e2`
**Dossier**: `assets/research-dossier.md` (all measurements + citations)

## Problem

`daemon.ts:288-293` writes `lastTickAt` to every daemon-owned descriptor every 600ms. Verified:
**132 writes per tick**, each an `FsRegistry.publish()` of ~5 fsync-barriered atomic writes.
At the conservative measured cost (4.86 ms/write) that is **~3.2 s per tick**; s098 measures
~12 s under fleet load. `lastTickAt` is rebuilt on a subsequent tick **if one runs**, and is otherwise absent — which readers degrade to `unverified`.

## Solution

One heartbeat file per tick + an overlay in `FsRegistry.read()`/`list()`. **132 writes → 1.**
Readers are untouched and unaware; the send-receipt surface provably cannot move.

## Scope

**In**: `daemon.ts:286-293` · `adapters/fs-registry.ts` · new `core/daemon/tick-heartbeat.ts` (+tests)
**Out**: `daemon.ts:354` (s097) · `daemon.ts:639-648` (s095) · `core/archive.ts` (ruled) ·
#181 Fix B · Fix C · `core/cli.ts` / `cli.ts` (avoided by design — s093/s094 hold regions there)

**Declared inherent, not creep**: the reader path is part of this fix. `cli.ts:3398` decides the
**send receipt** from `daemonTickStale`, and `daemonTickStatus(undefined)` is `stale: true`, so a
fix that only stops writing would report `unverified` for all 132 seats. Same shape as #118's
mkdir necessarily touching the import block. This sentence goes in the PR body verbatim.

## Acceptance criteria

Each criterion carries **one claim and one load-bearing assertion**, per s094's correction:
`expect()` throws, so a multi-assertion test's pre-fix red proves only the first assertion that
fired. Where a criterion needs setup assertions, the load-bearing one is named explicitly and the
remainder is covered by mutation, never by the red alone.

| AC | kind | claim | load-bearing assertion |
|---|---|---|---|
| AC-01 | **behavioural** | the tick performs **one** heartbeat persist regardless of owned-set size | `heartbeat.write` call count `=== 1` after one tick with 5 owned descriptors |
| AC-02 | **behavioural** | the tick performs **zero** `registry.write` calls for the heartbeat | `registry.write` call count `=== 0` after one tick with 5 owned descriptors |
| AC-03 | **behavioural** | the persisted count is independent of the owned-set size | `heartbeat.write` count `=== 1` with **50** owned descriptors (same as with 5) |
| AC-04 | **preserved-property** | a descriptor read via `read()` still carries `lastTickAt` | `read(id).lastTickAt === tickAt` — **must pass before AND after** |
| AC-05 | **preserved-property** | the send receipt for a freshly-ticked claude/copilot target is **not** `unverified` | `state === "queued"` — **must pass before AND after**; this is R1 |
| AC-06 | **preserved-property** | the heartbeat file is invisible to `list()` | `list().length` unchanged with the file present — **see correction below: this cannot fail pre-fix** |
| AC-07 | **behavioural** | descriptors on disk no longer accrue `lastTickAt` from the tick | raw `JSON.parse(readFileSync(descriptorPath)).lastTickAt === undefined` after a tick |
| AC-08 | **behavioural** | archive ageing no longer uses `lastTickAt` (ruling (a)) | a dissolved record with `lastEventAt` 60h old and `lastTickAt` 1h old classifies `archivable` |
| AC-09 | **mutation-only** | the overlay does not mask a stopped daemon | overlay stamp older than the threshold ⇒ `daemonTickStale === true` — **no pre-fix red exists; proved by mutant M4** |
| AC-10 | **new-API** | `core/daemon/tick-heartbeat.ts` exports the pure store | compile-time; cannot fail first — declared exception |
| AC-11 | **preserved-property** | the write law is unaffected | existing write-law suite green before and after |
| AC-12 | **behavioural** | an overlaid stamp is **never persisted** by a read-modify-write | after `read()` → mutate an unrelated field → `write()`, the **raw** on-disk descriptor has `lastTickAt === undefined` |
| AC-13 | **behavioural** | a reincarnated id does not inherit a stale stamp | seed a fresh map entry, `dissolve` + `revive` with **no** intervening tick ⇒ `daemonTickStale === true` |

**Pre-fix expectations, stated now so the recorded red can be checked against them.** The rule is
**one criterion, one claim, one observable that changes** — each criterion asserts *the claim*,
never the setup that makes the claim reachable (s099's correction: splitting alone can promote a
precondition to evidence, which feels like a fix and leaves the defect intact with better
formatting).

- AC-01/AC-03 fail pre-fix on *"heartbeat.write is not a function / never called"* — the store does
  not exist. That makes them **new-API-shaped in evidence**, the AC-08/09 trap from s092.
  **Mitigation**: AC-02 is the behavioural twin that fires on the *old* code path
  (`registry.write` count `=== 132`, not `0`) and needs no new API to fail. **AC-02 is the criterion
  that proves the fix; AC-01/AC-03 describe the replacement.**
- AC-07 fails pre-fix on the descriptor carrying a stamp. Single observable, fires on its own.
- **AC-02's pre-fix count is the FIXTURE size, not 132.** With a five-owned-descriptor fixture the
  pre-fix loop performs **five** `registry.write` calls, not 132. The 132 is the production working
  set, not the test's. Recording "132" as the expected red would have been a number copied from the
  dossier into a place it does not belong — caught in validation.
- AC-08 fails pre-fix because `archiveAgeAnchorMs` picks the recent `lastTickAt`. Single observable.
- AC-04/AC-05/AC-11 **must pass pre-fix** — guards, never evidence of the fix.

**Two of my own criteria were mislabelled, found by applying s099's correction to this table
before writing any code:**

- **AC-06 was labelled behavioural and cannot fail pre-fix.** The property it asserts — that a
  non-descriptor JSON file in `pijHome` is ignored — belongs to *existing* code
  (`readFile` admits a record only when `typeof parsed?.id === "string"`, `fs-registry.ts:1132`),
  not to this change. Pre-fix the assertion passes for the same reason it passes post-fix.
  It is a **guard on my file shape**, which is worth having, and it is **not evidence of the fix**.
- **AC-09 has no pre-fix form at all.** Pre-fix there is no overlay, so "the overlay does not mask a
  stopped daemon" is vacuous rather than false. A red is unavailable *in principle*, so it is
  proved by mutant **M4** or not at all.

**The unaware-reader problem this design invites** (o-prime, and s097's finding one layer up): the
overlay's stated virtue is that every reader keeps working *unaware*. An unaware reader cannot
notice the overlay stopped applying — which is precisely how a seam ends up present-but-unproven.
**AC-05 is that proof and must exercise the real receipt path**, not a stub: it passes pre-fix (the
descriptor carries the stamp), passes post-fix (the overlay supplies it), and **goes red the moment
the overlay stops applying**. It is the only criterion that observes the overlay from outside.

### AC-07 ↔ AC-05 are a PAIR. Neither may be dropped without the other.

A **fifth criterion sub-class**, found by the coder when M1 failed to kill AC-07:

> **A removal criterion cannot distinguish "replaced correctly" from "removed and nothing put
> back."**

AC-07 asserts the descriptor no longer carries `lastTickAt`. It is genuinely behavioural, it
honestly fails pre-fix — and it is **structurally blind to a broken replacement**, because the
field stays absent whether the new mechanism works or is a no-op. It **survives** the mutant that
guts the replacement, **and it is right to survive it**: absence is exactly what it asserts. The
defect is never in the criterion; it is in treating a removal criterion as *sufficient*.

**Every removal criterion needs a positive partner naming where the behaviour now lives.** Here
that partner is **AC-05**, the send receipt — and the two arguments for promoting it converge:

| | AC-07 (removal) | AC-05 (positive partner) |
|---|---|---|
| asserts | the old mechanism is **gone** | the behaviour still **works**, from outside |
| kills | a fix that never removed the writes | a fix that removed them and put nothing back |
| blind to | a broken replacement | a replacement that also left the old writes in place |

Drop AC-05 and AC-07 certifies a system that deleted a feature. Drop AC-07 and AC-05 passes on the
unfixed tree. **Neither is evidence of this change on its own.**

## Phases

### Phase 1 — the pure store, and the daemon writing one file
Two halves of one delegation packet, because the store is untestable-in-place until something
uses it and the daemon change is meaningless without it.

**Store** (`core/daemon/tick-heartbeat.ts`): build/serialise/parse the wrapped
`{v, tickAt, sessions}` map; prune by construction (rebuild from the current owned set each
tick); tolerate missing/corrupt/wrong-version input by returning an empty map — a daemon must
not die because a telemetry file is malformed. Tests target the store (P8).

**Daemon**: replace the `:288-293` loop with a single injected `heartbeat.write(...)` (P3 —
injected, never reached for). Requires the granted import (`:13-82`) and constructor
(`:190-199`) regions.

Covers **AC-01, AC-02, AC-03, AC-07, AC-10**. Mutant **M1**.
**Gate**: record the pre-fix red for AC-02 with the *actual* assertion text, and confirm the
assertion that fired is the write-count one — not a setup assertion.

### Phase 2 — the overlay, the scrub, and the ruled behaviour change
`read()`/`list()` overlay `lastTickAt` from the heartbeat map; the durable-write **scrub** that
stops any read-modify-write caller persisting it back (§ *The write-back defect*); prune on the
lifecycle paths so a reincarnated id cannot inherit a stale stamp.

Covers **AC-04, AC-05, AC-06, AC-08, AC-09, AC-11, AC-12, AC-13**. Mutants **M2, M3, M4, M5**.
Document the access-path divergence at **both** ends — the overlay site *and* the `readFile`
path — per o-prime's condition. Write the PR-body paragraph naming the three records, the ~20h,
and the removed axis, and file the deferred issue for the archive axis (OQ-1).

## The write-back defect, and the scrub that closes it

**Independent validation returned NOT SOUND on the first draft. The design-breaking finding:**

`FsRegistry.publish()` obtains `existing` from `this.read()` (`fs-registry.ts:204`), and real
callers spread a read result straight into a write. The load-bearing example is on the **send hot
path**, in a **CLI process**:

```ts
// core/cli.ts:2179 — stampSenderActivity, runs on every pij send
const latest = deps.registry.read(self);
deps.registry.write({ ...latest, lastEventAt: new Date(nowMs).toISOString() });
```

Under a naive overlay `latest` carries the synthetic `lastTickAt`, and the spread **persists it**.
Consequences, in ascending order of seriousness:

1. Descriptors accrue `lastTickAt` again — the removed writes come back.
2. They come back **in CLI processes on every send**, moving fsync cost onto the most latency-
   sensitive path in the system. The fix would have *relocated* the cost, not removed it.
3. **AC-07 would still have passed**, because it samples immediately after a tick, when no
   read-modify-write has run. A criterion agreeing with reality without being able to disagree —
   on the plan whose own §"pre-fix expectations" warns about exactly that.

**Remediation — scrub at the durable-write boundary, inside the file I own.** The overlay is
applied on read; the descriptor is stripped of `lastTickAt` immediately before it is persisted
(`writeAtomic` for the descriptor, and `syncIdentitySnapshot`). One choke point, provably covering
**every** caller regardless of what it spread, with no change to any caller's code.

*Rejected*: making the overlay non-enumerable so spread and `JSON.stringify` drop it. It works for
persistence but silently removes `lastTickAt` from every JSON output surface, trading a write defect
for a display defect. The scrub keeps the value visible everywhere it should be and absent only
where it must be.

**AC-12 is this defect's criterion** and it is behavioural: pre-fix the on-disk descriptor legitimately
carries a stamp, so the assertion fails; post-fix it must be absent after a full read-modify-write
cycle. **It must run against the real `FsRegistry`, never `FakeRegistry`** (`adapters/fakes.ts:164-190`
has no overlay, so the fake would pass the test in a world where production fails it).

`just typecheck` · `just lint` · targeted vitest (daemon, fs-registry, tick-heartbeat, receipts,
cli) · `harness checks` (full, incl. smoke) before PR.

## Mutation gate

Run against the **newest, least-examined** test, not the headline one (s093). Always pass
`--expect "<test name>"` — without it the tool only knows *something* went red, which is how an
unrelated flake once supplied the red a gate counted (s094).

**`adapters/fs-registry.test.ts` is on the refusal list — verified, not taken on trust.** It trips
two of the tool's five markers (`child_process` at `:1`, `execPath` at `:79`). I regenerated the
census with the tool's own predicate and got **14 files**, matching the corrected fleet list
exactly:

```
$ grep -rln 'execFileSync\|spawnSync\|execSync\|execPath\|child_process' \
    --include=*.test.ts .pi/extensions/pij/ | wc -l
14
```

**But the marker is earned by an isolated multi-process race harness** — `spawn(process.execPath, …)`
driving real child processes to test concurrent-write races, 3 uses across 39 tests
(`fs-registry.test.ts:70-90`). This is s094's *mixed file* precisely: the tool's guard is
per-**file**, the actual defect is per-**test**, and every overlay test I intend to write runs
**in-process**, where the transform reaches fine.

**So I sidestep the refusal by construction rather than paying the fallback**: the overlay tests go
in a **new, subprocess-free spec** — `adapters/fs-registry.overlay.test.ts`. Precedent for a second
spec per module is established (`daemon.test.ts` + `daemon.bootstrap.test.ts`,
`cli.test.ts` + `cli.integration.test.ts`). This keeps **every** mutant on the fast tool, and —
the property that actually matters — **keeps M2/M4 re-runnable by the reviewer without write
access**, which is the whole reason an independent mutation gate is practical.

*General form, worth more than this instance*: when a tool refuses **per-file** for a defect that is
**per-test**, the cheap move is to put the new tests where the marker is not, rather than to accept
a slower manual gate for the life of the change.

**Fallback retained but not planned for**: if any mutant must run against the original spec, mutate
**on disk** → prove it landed with a **non-empty `git diff`** → require an **`AssertionError`, not a
build error** → restore and verify **byte-identical**.

| mutant | target spec | tool | **OBSERVED** kill set |
|---|---|---|---|
| M1 heartbeat write made a no-op | `daemon.test.ts` | `mutate.mjs --expect` | AC-01, AC-03, AC-03b, AC-07b, + the retargeted wedged-daemon guard — **five, not "AC-01 only"** |
| M2 overlay returns the descriptor unchanged | `fs-registry.overlay.test.ts` | `mutate.mjs --expect` | AC-04, AC-04c, AC-05, AC-05b, AC-09 — **superset of the predicted AC-04/AC-05** |
| M3 prune removed **from the lifecycle paths** | `fs-registry.overlay.test.ts` | `mutate.mjs --expect` | AC-13, AC-13b, AC-13c, AC-13d |
| M4 overlay stamps `now` instead of the persisted value | `fs-registry.overlay.test.ts` | `mutate.mjs --expect` | AC-04, AC-04c, AC-05, AC-09 |
| M5 **scrub removed** | `fs-registry.overlay.test.ts` | `mutate.mjs --expect` | AC-12, AC-12b, AC-12c |
| M6 overlay leaks into `readFile` *(coder-added)* | `fs-registry.overlay.test.ts` | `mutate.mjs --expect` | AC-08, AC-04c, AC-04d |

**Negatives proved mechanically, not read off a list** (`--expect` naming a criterion that must
*not* appear in the kill set → `GATE FAILS`, exit 1):

- **M1 does not kill AC-02** — a no-op write still leaves `registry.write` at zero. Predicted, then
  proved.
- **M3 does not kill AC-06** — `list()` filters the wrapper regardless of pruning.
- **M2 does not kill AC-08** — and this is the **second independent instance** of the removal
  sub-class: AC-08 asserts archive ageing no longer uses the tick axis, which stays true whether
  the overlay works perfectly or is completely dead. Its positive partner is AC-04/AC-05, exactly
  as AC-07's is. **A sub-class confirmed on two independent criteria is a rule; observed once it is
  a coincidence.**

**Three false pairings in the original table, all corrected from observation:**

1. *M1 kills AC-01 only* — it kills **five**. The error was **under-claiming**, which is exactly as
   unchecked as over-claiming; the failure is not optimism, it is **unverified specificity**.
2. *M3 kills AC-06* — it kills neither AC-06 nor anything in that spec; its real target is AC-13.
3. *M3 prune removed **from the store**, target `tick-heartbeat.test.ts`, must kill AC-13* —
   **unsatisfiable by any single run.** AC-13 is a **registry lifecycle** criterion living in the
   overlay spec; the store spec cannot contain it. One label had been attached to two different
   mutants with different failure modes. Pruning by rebuild alone still leaves the reincarnation
   window open for one full tick — which *is* AC-13 — so the corrected wording is not a rewording.

**One prediction refuted in letter, surviving in substance**: the plan said AC-09 is proved "by M4
or not at all". M2 kills it too — but **degenerately** (no overlay at all ⇒ `daemonLastTickAt` null
⇒ stale for the wrong reason). Only M4 tests **masking**, which is AC-09's actual claim. The
sentence needed the word *masking*.

Both new specs are mine and **stay subprocess-free deliberately** so they remain fast-mutable.
`daemon.test.ts` is not on the refusal list — confirmed.

**The two guards cover different vectors and neither covers the other**: *green-before-mutating*
kills a **pre-existing** red; **`--expect`** kills a **concurrent flake**. "The suite was green when
I started" does not handle flakes. Under a gate that asks only *"did anything go red"*, a flake is
indistinguishable from a kill, so any spec with an intermittent test silently satisfies every
mutation run against it forever. `--expect` is not precision — **it is what makes the gate
falsifiable.**

## Rebase rule (s099)

`daemon.ts` has taken three streams this run. Before convergence, **re-run every behavioural
criterion on the rebased tree** — still-present and still-load-bearing are different claims, and
only the first survives a rebase for free.

## Risks

Carried from dossier §9: R1 receipt surface (AC-05), R2 file mistaken for a descriptor (AC-06),
R3 overlay masking a dead daemon (AC-09), R4 departed ids lose the frozen stamp (stated, bounded),
R5 pre-fix proof invalidated by sibling rebase (s099 rule above).

## Gates


## Scope amendment (validation finding 1)

Injection cannot be implemented inside `daemon.ts:286-293` alone: it needs an **import** and a
**constructor dependency** (`daemon.ts:13-82` imports, `:190-199` constructor). Declared here for
the same reason and on the same basis as #118's mkdir necessarily touching the import block —
**inherent to the fix, not a widening of it**. Both regions are far from `:354` (s097) and
`:639-648` (s095); nothing is reordered.

`just typecheck` · `just lint` · targeted vitest (daemon, fs-registry, fs-registry.overlay,
tick-heartbeat, receipts, cli) · `harness checks` (full, incl. smoke) before PR.

## Ship constraint — Phase 1 and Phase 2 land in ONE PR or neither

Between the two phases, `lastTickAt` is absent from descriptors and the overlay does not yet
exist, so **every daemon-owned receipt reads `unverified`**. Phase 1 alone *is* "the perf work
broke messaging" to anyone reading that commit in isolation. Found by the Phase 1 reviewer as
item 6; held independently by o-prime as a merge-order constraint — a split PR will be refused.

General shape: **a change can be unsafe to land in halves**, and the reason belongs in the PR
body, because a future reader meets the first commit alone.

## Applying "what would still be true if the replacement were a no-op?" to Phase 2

o-prime's generalisation of the removal-pair rule, run against this phase's own table **before**
implementation. Result: **four of the seven criteria pass against a completely inert overlay.**

| AC | if the overlay were a no-op | verdict |
|---|---|---|
| AC-04 | `undefined !== tickAt` → **FAILS** | sees the overlay |
| AC-05 | receipt → `unverified` → **FAILS** | sees the overlay, **from outside** |
| AC-06 | `list().length` unchanged → **passes** | blind (correctly labelled a guard) |
| AC-08 | still archivable — `sweepArchivable` uses `readFile` → **passes** | blind; it tests Phase 1's *removal*, not the overlay |
| AC-09 | `undefined` → `stale: true` → **passes** | blind — which is exactly why it is mutation-only |
| AC-12 | nothing synthetic to persist → **passes** | blind to the overlay, sharp on a broken **scrub** |
| AC-13 | `undefined` → `stale: true` → **passes** | blind to the overlay, sharp on a broken **prune** |

**So AC-04 and AC-05 carry the entire overlay between them, and AC-05 is the only one that sees
it from outside.** Everything else in the table is testing a different mechanism. That is not a
defect — AC-12 and AC-13 are correctly aimed at the scrub and the prune — but it means a table of
seven green ticks contains **two** that could ever have detected an inert overlay, and a reader
counting ticks would conclude otherwise.
