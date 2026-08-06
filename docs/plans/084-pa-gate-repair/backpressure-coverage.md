# Backpressure Coverage — PA Capability Gate Repair

**Plan**: [pa-gate-repair-plan.md](./pa-gate-repair-plan.md)
**Basis (plan SHA-256)**: `6096d5b53389…` (re-surveyed 3rd time — see Basis history)
**Basis history**: `dd966be8…` (original) → `b3a3b7d8…` (Key Finding 09: `effectiveParent` vs raw `parentId`, raised by the Phase-1 coder) → `6096d5b5…` (**AC-06b added**: a live command-line proof, after the o-prime observed that a bin-shaped *test* is still a test on a two-seam gate; then its baton dependency removed once the CLI was shown to evaluate the refusal per invocation).
**Generated**: 2026-08-05
**Certainty**: Partial

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)
> Selection, not enforcement: nothing here executes at phase end — the proof lines
> below are what the plan's owner folds into each criterion's "done when".

## Existing Sensors (inventory)

Discovered by filesystem probe across the repo root and `.pi/extensions/*`, then
corroborated against `.harness/engineering-harness.md` § Deterministic signal inventory.

| Sensor | Paved command | Dimension | Found in |
|--------|---------------|-----------|----------|
| vitest unit/core suite | `just test` | behaviour | root (`vitest`); specs colocated `.pi/extensions/pij/**/*.test.ts` |
| targeted extension suite | `npx vitest run .pi/extensions/pij` | behaviour | paved in `.pi/extensions/pij/AGENTS.md` § Acceptance/gates |
| typecheck | `just typecheck` | maintainability | root (`tsc --noEmit`, `noUncheckedIndexedAccess` on) |
| lint | `just lint` | maintainability | root (biome, errors **and** warnings) |
| boot probe | `harness boot` | behaviour | `.harness/extensions/boot/` — sequences typecheck + test |
| composite signal inventory | `harness checks` | behaviour + maintainability | `.harness/extensions/checks/` — runs **all** sensors, per-sensor verdict; `--quick` skips smoke |
| local-path portability | `just local-path-check` | maintainability | root |
| tmux driver smoke | `just smoke` | behaviour | `harness/driver/`, `harness/scripts/smoke.ts` |
| package vetting | `npm run pkg audit` | architecture-fitness | `harness/scripts/vetters/` |

**Signature probes run** (recursive, root + `.pi/extensions/*` + `harness/`):
`**/vitest.*.config.*` ✓ · `**/*.test.ts` ✓ (colocated, Pattern P8) · `**/*.spec.*` ✗ ·
`**/playwright.config.*` ✗ · `**/cypress.config.*` ✗ · `.dependency-cruiser.*` ✗ ·
`codeql/` ✗ · `**/*.schema.json` ✗ (no schema sensor for the watchdog sidecar).

**Precedent mined (§1c)**: `core/watch-subscription.ts` — the sibling subscription
feature that already preserves `addedAt` — is covered by its own colocated
`watch-subscription.test.ts`. That file is the direct template for the `addedAt`
proofs below, and its existence is why every gap here is an *extension* rather than
a build.

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail (required if ABSENT) |
|--------------------------|-------|----------------|--------|------|----------------------------------|
| AC-01 `pij state --json` carries `orchestrationRole` + **`parent`** (= `effectiveParent`), always present | 1 | EXTEND→RUN: add projection-shape cases to `core/cli.test.ts`; then `just test` | EXTEND | computational | — |
| **AC-06b the allowance is demonstrated at the LIVE COMMAND LINE** — a `pa` REFUSED for a non-parent target and ALLOWED for its own parent | 2 | RUN: `just pij watchdog watch <target>` — orchestrator-run against a seat stamped `pa`; **`just pij`, never bare `pij`** (bare resolves to the main checkout and would prove the wrong tree) | **EXISTS** | computational | — |
| **AC-01b spawned-but-never-linked seat resolves its parent via `spawnedBy`** (the Key Finding 09 regression guard) | 1, 2 | EXTEND→RUN: 4th fixture in `core/cli.test.ts` + 6th case in `pa-target.test.ts`; then `just test` | EXTEND | computational | — |
| AC-02 text output shows role/parent | 1 | EXTEND→RUN: add a text-render case to `core/cli.test.ts`; then `just test` | EXTEND | computational | — |
| AC-03 refusal names role **and** field | 1 | EXTEND→RUN: extend `pa-capability.test.ts:129` message assertion; then `just test` | EXTEND | computational | — |
| AC-04 PA may watch/unwatch its parent | 2 | EXTEND→RUN: new `pa-target.test.ts` + handler cases in `core/cli.test.ts`; then `just test` | EXTEND | computational | — |
| **AC-05 every other target/action still refused** (the narrowness proof) | 2 | EXTEND→RUN: per-action refuse cases (pause/resume/exempt/reset/interval/disable-all/enable-all × non-parent target); then `just test` | EXTEND | computational | — |
| **AC-06 allowance enforced at BOTH seams** (Key Finding 02) | 2 | EXTEND→RUN: add a bin-shaped gate case to `.pi/extensions/pij/cli.integration.test.ts`; then `just test` | EXTEND | computational | — |
| AC-07 `--for` registers the named seat | 3 | EXTEND→RUN: handler cases in `core/cli.test.ts`; then `just test` | EXTEND | computational | — |
| AC-08 `unwatch --for` removes the right entry | 3 | EXTEND→RUN: as AC-07; then `just test` | EXTEND | computational | — |
| **AC-09 `addedAt` preserved on every re-bind** | 3 | EXTEND→RUN: re-bind cases mirroring `watch-subscription.test.ts`; then `just test` | EXTEND | computational | — |
| AC-10 `--for` refused for a PA caller | 3 | EXTEND→RUN: as AC-07; then `just test` | EXTEND | computational | — |
| AC-11 recipient PA may ack; non-recipient refused | 2 | EXTEND→RUN: dispatch handler cases; then `just test` | EXTEND | computational | — |
| **AC-12 `PA_VERB_CLASSIFICATION` stays total** | 2 | RUN: `just test` — the two-file scrape at `pa-capability.test.ts:14-35` already fails the build on any unclassified verb | **EXISTS** | computational | — |
| AC-13 `whoami` distinguishes conditional from refused | 2 | EXTEND→RUN: `core/cli.test.ts` whoami case; then `just test` | EXTEND | computational | — |
| **AC-14 no new registry read in the gate hot path** | 2 | RUN: `just test` — `core/cli.test.ts:5136` already asserts `reads === 0` | **EXISTS** | computational | — |
| Regression: type surface holds under `noUncheckedIndexedAccess` | 1–3 | RUN: `just typecheck` | EXISTS | computational | — |
| Regression: whole signal inventory before ship | 3 | RUN: `harness checks` | EXISTS | computational | — |
| Is the *refusal wording* actually intelligible to a gated seat? | 1 | — | ABSENT | human-judgement | globbed `**/*.spec.*`, `**/playwright.config.*`, `**/cypress.config.*`, `**/*.schema.json` under root + `.pi/extensions/*` + `harness/` — no match; no snapshot/wording sensor exists. Legitimately a human read. |

## Proof Plan (selected)

### Phase 1: Make the gate visible
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-01, AC-02 | EXTEND→RUN | add `pij state` projection + text cases to `core/cli.test.ts`; then `just test` |
| **AC-01b** | EXTEND→RUN | **the spawned-but-never-linked fixture — asserts `parent === spawnedBy`; the single most load-bearing test in Phase 1**; then `just test` |
| AC-03 | EXTEND→RUN | extend the message assertion in `pa-capability.test.ts`; then `just test` |
| type surface | RUN | `just typecheck` |
| phase gate | RUN | `harness checks --quick` |

### Phase 2: Make the gate target-scoped
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-04, AC-01b | EXTEND→RUN | new `pa-target.test.ts` (self/parent allow; arbitrary, null-parent, unknown-target **refuse**; **spawned-but-never-linked ALLOW via `effectiveParent`**); then `just test` |
| AC-05 | EXTEND→RUN | per-action refuse cases across every non-watch/unwatch `watchdog` action; then `just test` |
| **AC-06** | EXTEND→RUN | **bin-shaped case in `cli.integration.test.ts`** — the one proof that catches Key Finding 02; then `just test` |
| AC-11 | EXTEND→RUN | dispatch recipient/non-recipient cases; then `just test` |
| AC-12 | RUN | `just test` (existing scrape — verify by mutation: delete one table entry, expect red) |
| AC-13 | EXTEND→RUN | whoami capability-projection case; then `just test` |
| AC-14 | RUN | `just test` (existing `core/cli.test.ts:5136`) |
| **AC-06b** | RUN | **`just pij` live transcripts — a real refusal and a real allow; the stage does not close without them** |
| phase gate | RUN | `harness checks --quick` |

### Phase 3: Add the repair path
| Proves | Mode | Proof line |
|--------|------|------------|
| AC-09 | EXTEND→RUN | re-bind preservation cases mirroring `watch-subscription.test.ts`; then `just test` |
| AC-07, AC-08, AC-10 | EXTEND→RUN | `--for` handler cases incl. the pre-existing-subscription case; then `just test` |
| ship gate | RUN | `harness checks` (full — re-run once before believing a red; `cli.integration.test.ts` is load-sensitive) |

## Certainty: Partial

Counts (behaviour/architecture rows): **5 RUN · 12 EXTEND · 0 BUILD · 1 ABSENT**
Recommended next move (per-task lookup, advisory): **propose the extension(s) first — the cheapest move, landing in a proven home.**

Rationale tied to the Proof Plan modes: no criterion needs a sensor that does not
exist — every gap is a **test case added to a suite that already runs under `just
test`**, so there is no new surface, no new command to learn, and no CI wiring.
Two criteria (AC-12 totality, AC-14 read-count) are already proven by sensors
running today. The single `ABSENT` row is a wording judgement, which no command
can settle.

## Recommended Phase 0: Establish Backpressure (build or extend)

**No separate Phase 0 is needed, and that is a finding, not an omission.** The
routing trigger fires (11 `EXTEND` rows), but the plan already front-loads every
one of these extensions as its phase's **first task** under the declared TDD
strategy — so the sensor work is not deferrable ceremony, it is task 1 of each
phase. Listing it as a separate phase would duplicate it.

The extensions, ranked (extensions only — nothing needs building):

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens/exposes |
|------------------------|--------|----------------|--------------------------------------|
| extend `cli.integration.test.ts` | **AC-06** — the allowance survives the bin seam | extension: one bin-shaped invocation case | `just test` (same command, stronger) |
| extend `core/cli.test.ts` | AC-09 — `addedAt` survives a re-bind | extension: re-bind cases modelled on `watch-subscription.test.ts` | `just test` (same command, stronger) |
| extend `pa-capability.test.ts` | AC-05 — the allowance is narrow | extension: per-action refuse cases | `just test` (same command, stronger) |
| extend `core/cli.test.ts` | AC-01/AC-02 — the projection exists and is stable | extension: output-shape cases (none exist today) | `just test` (same command, stronger) |

**Gap ordering** (ordinal, not a score): ① AC-06 and AC-09 are tied to named plan
Risks (Key Findings 02 and 03) → close first; ② AC-05 (narrowness) before AC-01/02
(projection shape); ③ all are extensions, so rung ③ never applies.

## Closing Verdict

Here is how we will know this work is actually done, in plain terms.

Almost everything this plan promises can be proved by running one command the repo
already has — `just test`. That matters because a command passing is not an
opinion: nobody has to judge whether the permission fix worked, the test either
goes green or it doesn't.

**One thing I already did, automatically:** I wrote the exact how-to-prove-it lines
into this coverage file, phase by phase, and pinned them to a fingerprint of the
plan as it stands right now. If the plan changes, that fingerprint stops matching
and these proofs get re-picked against the new version — so this can't quietly go
stale.

**One thing I'd like your OK on:** none of the checks that prove the *new*
behaviour exist yet — they're all cases we need to add to test files that already
run. The most important one by a distance: a test that exercises the permission
check **the way the command line actually reaches it**. Right now every gate test
calls the check directly, which is exactly why the two-places problem went
unnoticed — a fix could look perfect in tests and still refuse at the terminal.
I'd like your OK for that test to be a required part of the second stage rather
than a nice-to-have.

And one standing rule I'd apply throughout: if the checks pass but you look at it
and say it's not actually done, **we fix the check first, then the code**. That
way the same mistake can never slip through twice.

There is one thing no command will settle: whether the new refusal message is
genuinely *understandable* to whoever reads it. That's a human read, and it should
stay one.

**In summary:** when these commands pass, every machine-checkable promise in this
plan is kept — the permission scope, the repair path, the preserved timestamp, and
the fact that the gate stays narrow. What remains for a person is a single
judgement call: whether the refusal wording actually helps the seat that hits it.
The recommended next move for this task is to add the test-case extensions first —
they're the cheapest rung and land in suites that already run — and the specific
approval I'm asking for is to treat the command-line-path test as required in
stage two, not optional.
