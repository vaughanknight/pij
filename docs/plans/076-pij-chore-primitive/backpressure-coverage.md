# Backpressure Coverage — `pij chore` (first-class change detector + duty roster)

**Plan**: [pij-chore-primitive-plan.md](./pij-chore-primitive-plan.md)
**Basis (plan SHA-256)**: `ba3d0da97ddf7185e59de9e8eec1cba8c59f0f40674342f3c04b1f65c3c4de89`
**Generated**: 2026-08-02
**Certainty**: Partial

> **Re-selected against the latest plan.** The first survey ran against basis
> `d0e02d2e…9411e8`. The plan's owner then folded this survey's own two recommendations
> into it (T015/T016 + AC-15/AC-16) and nothing else, which changed the basis to the hash
> above. Re-selection against the new bytes yields the **same** Proof Plan and the same
> Partial rating — the two rows stay `EXTEND` because scheduling a sensor is not building
> it; they become `RUN` once T015/T016 land.

> Advisory only. Never blocks, never gates, no scores. (Advisory backpressure survey.)
> Selection, not enforcement: nothing here executes at phase end — the proof lines
> below are what the plan's owner folds into each criterion's "done when".

## Existing Sensors (inventory)

| Sensor | Paved command | Dimension | Found in |
|--------|---------------|-----------|----------|
| vitest unit/integration suite | `just test <path>` | behaviour | root (`vitest.config.ts`) |
| readiness proof (typecheck + tests) | `harness boot` | behaviour | `.harness/extensions/boot/` |
| full deterministic gate (all sensors, one pass) | `harness checks` | behaviour + maintainability | `.harness/extensions/checks/` |
| repo gate | `just self-check` | behaviour + maintainability | root `justfile` |
| typecheck | `just typecheck` | maintainability | root |
| lint / format | `just lint` | maintainability | root (Biome) |
| import-boundary static scan | `just test .pi/extensions/pij/core/agents/boundary.test.ts` | architecture-fitness | `core/agents/`, `core/platform/` |
| tmux end-to-end smoke | `just smoke` | behaviour | `harness/driver/` |
| absolute-home-path rejection | `just local-path-check` | maintainability | root |
| Windows/cross-platform lane | `just windows-compat` | behaviour | root |
| CI PR gate | `.github/workflows/ci.yml` | behaviour + maintainability | `.github/workflows/` |

## Coverage Matrix

| Criterion / failure mode | Phase | Selected proof | Status | Tier | Probe trail (required if ABSENT) |
|--------------------------|-------|----------------|--------|------|----------------------------------|
| AC-01 `NO CHANGE — N probed, 0 moved` on a quiet roster | 1 | RUN: `just test .pi/extensions/pij/core/chores/` | EXISTS | computational | — |
| AC-02 a delta is reported **and** the baseline is not advanced | 1 | RUN: `just test .pi/extensions/pij/core/chores/reduce.test.ts` | EXISTS | computational | — |
| AC-03 an un-acked delta re-surfaces on the next run | 1 | RUN: `just test .pi/extensions/pij/core/chores/drive.test.ts` | EXISTS | computational | — |
| AC-04 `ack` then `run` reports NO CHANGE | 1 | RUN: `just test .pi/extensions/pij/core/chores/drive.test.ts` | EXISTS | computational | — |
| AC-05 failing probe → `NOT-PROBEABLE`, stays in roster + denominator | 1 | RUN: `just test .pi/extensions/pij/core/chores/reduce.test.ts` | EXISTS | computational | — |
| AC-06 scopes **union**, not shadow | 1 | RUN: `just test .pi/extensions/pij/core/chores/resolve.test.ts` | EXISTS | computational | — |
| AC-07 cross-scope name collision → `E-AMBIG`, `scope:name` resolves | 1 | RUN: `just test .pi/extensions/pij/core/chores/resolve.test.ts` | EXISTS | computational | — |
| AC-08 per-seat baseline isolation (seat A's ack ≠ seat B's view) | 1 | RUN: `just test .pi/extensions/pij/core/chores/drive.test.ts` | EXISTS | computational | — |
| AC-09 `run --dry` writes nothing | 1 | RUN: `just test .pi/extensions/pij/adapters/chore-store.test.ts` | EXISTS | computational | — |
| AC-10 `--full-every N` emits FULL on the Nth run | 1 | RUN: `just test .pi/extensions/pij/core/chores/` | EXISTS | computational | — |
| AC-11 malformed roster degrades, exit 0, other scopes intact | 1 | RUN: `just test .pi/extensions/pij/adapters/chore-store.test.ts` | EXISTS | computational | — |
| AC-12 fleet store is a subdir, never a top-level `~/.pij/*.json` | 1 | RUN: `just test .pi/extensions/pij/adapters/chore-store.test.ts` | EXISTS | computational | — |
| AC-13 `pij chore --help` exits 0 with the family USAGE lines | 1 | RUN: `just test .pi/extensions/pij/cli.integration.test.ts` | EXISTS | computational | — |
| AC-14 stable `--json` shape | 1 | RUN: `just test .pi/extensions/pij/core/chores/` | EXISTS | computational | — |
| **Architecture drift**: `core/chores/**` importing daemon/tmux/telegram, inverting the `cli → core` direction | 1 | EXTEND→RUN: add a `core/chores/boundary.test.ts` mirroring `core/agents/boundary.test.ts`, then `just test .pi/extensions/pij/core/chores/boundary.test.ts` | EXTEND | computational | — |
| **Live-fleet contamination**: a test constructing a real adapter and tapping the operator's real `~/.pij` panes | 1 | EXTEND→RUN: add a `PIJ_HOME`-is-a-temp-dir assertion to the chores suite setup, then `just test .pi/extensions/pij/core/chores/` | EXTEND | computational | — |
| No regression in the rest of pij | 1 | RUN: `harness checks` | EXISTS | computational | — |
| Whether the *chosen probe* for a real chore is a genuine superset signal | 1 | — | ABSENT | human-judgement | Globbed `**/*.schema.json`, `.dependency-cruiser.*`, `**/*.spec.*`, `**/vitest.*.config.*` across root + `.pi/extensions/*` + `harness/` — nothing can decide whether a user-authored shell probe's output is a superset of the thing it guards; it depends on the watched system, not on this code |
| Whether the report reads well enough that a cheap seat relays it correctly | 1 | — | ABSENT | inferential | Globbed for snapshot/golden-output harnesses (`snapshots-check` exists but is informational, exit-0 always); string assertions prove the format, not its legibility to a model |

## Proof Plan (selected)

### Phase 1: Implementation

| Proves | Mode | Proof line |
|--------|------|------------|
| AC-01, AC-10, AC-14 | RUN | `just test .pi/extensions/pij/core/chores/` |
| AC-02, AC-05 | RUN | `just test .pi/extensions/pij/core/chores/reduce.test.ts` |
| AC-06, AC-07 | RUN | `just test .pi/extensions/pij/core/chores/resolve.test.ts` |
| AC-03, AC-04, AC-08 | RUN | `just test .pi/extensions/pij/core/chores/drive.test.ts` |
| AC-09, AC-11, AC-12 | RUN | `just test .pi/extensions/pij/adapters/chore-store.test.ts` |
| AC-13 | RUN | `just test .pi/extensions/pij/cli.integration.test.ts` |
| architecture direction holds for the new domain surface | EXTEND→RUN | add `core/chores/boundary.test.ts` (copy `core/agents/boundary.test.ts`, retarget the dir); then `just test .pi/extensions/pij/core/chores/boundary.test.ts` |
| no test touches the operator's real `~/.pij` | EXTEND→RUN | assert `process.env.PIJ_HOME` is a temp path in the chores suite setup; then `just test .pi/extensions/pij/core/chores/` |
| whole-repo regression | RUN | `harness checks` |

## Certainty: Partial

Counts (behaviour/architecture rows): **14 RUN · 2 EXTEND · 0 BUILD · 0 ABSENT**
Recommended next move (per-task lookup, advisory): **propose the extension(s) first** — the cheapest move, landing in a proven home.

Every behaviour criterion in this plan already has an `EXISTS` sensor with a paved command
(`just test <path>`), which is why this is not Weak; the two architecture/safety rows are
`EXTEND` rather than `RUN`, which is what holds it at Partial rather than Strong. Both
`ABSENT` rows are genuinely human/inferential and do not drag the rating.

## Recommended Phase 0: Establish Backpressure (build or extend)

| Sensor to build/extend | Proves | Suggested form | Paved command it strengthens/exposes |
|------------------------|--------|----------------|--------------------------------------|
| extend the import-boundary static scan to `core/chores/**` | The new domain surface never imports daemon/tmux/telegram — dependency direction stays `cli → core` | extension: copy `core/agents/boundary.test.ts`, retarget the scanned directory | `just test .pi/extensions/pij/core/chores/boundary.test.ts` (same sensor family, one more directory) |
| extend the chores test setup with a `PIJ_HOME`-is-temp assertion | No chores test can read or mutate the operator's live `~/.pij` (a real-adapter construction taps every live pane and blows the timeout) | extension: a `beforeAll` guard in the suite setup | `just test .pi/extensions/pij/core/chores/` (same command, made safe) |

Both are extensions, not builds — they cost a file each and ride wiring that already runs
in `just self-check` and CI. Neither needs to precede feature code; folding them in as two
extra rows of Phase 1 is fine.

## Closing Verdict

Here is how we will know this work is actually done, in plain terms.

Almost everything this plan promises can be proven by running commands rather than by
anyone forming an opinion. The promises about *behaviour* — that a quiet roster reports no
change with a count, that a real change is reported and the stored baseline is **not** quietly
advanced, that a delta nobody acknowledged comes back next time, that acknowledging it is
the only thing that clears it, that a broken probe says so instead of vanishing from the
list, and that two seats watching the same repo keep their own memory — all of those land
on the test runner this repo already uses. When `just test` over the new chores directory
passes, those promises are kept, and no judgement call is involved.

One thing I already did, automatically: I wrote the exact per-promise commands into the
coverage artifact next to the plan, so whoever picks this up later — including after this
conversation is gone — reads how each promise gets proven rather than guessing.

One thing I'd like your OK on: teaching two checks we already run to also cover this new
code. The first is the import-boundary scan — it currently guards the agent-runtime folder
and stops it depending on the daemon or tmux; pointing the same scan at the new chores
folder keeps the dependency direction honest for free. The second is a one-line guard in
the test setup asserting the tests are pointed at a throwaway home directory, because a
test that accidentally reaches the operator's real one taps every live pane on the machine.
Both are the same commands everyone already runs, made smarter — no new surface to learn.

And if a check ever passes while a human says it is not done, the check is wrong: we fix the
check first, then the code, so that particular mistake can never slip through again.

Two things commands cannot decide, and I want to be straight about them. Whether a probe
someone registers is actually a *superset signal* — whether its output can stay identical
while the thing it guards moves — depends on the watched system, not on this code; no test
can rule that out, which is why the plan documents it as an authoring rule instead. And
whether the report reads clearly enough that a cheap seat relays it faithfully is a judgement
about legibility; the tests prove the exact strings, not that they land well.

**In summary:** the commands will prove every behavioural promise in this plan — the counted
heartbeat, the delta, the non-advancing baseline, the re-surfacing until acknowledged, the
non-vanishing broken probe, and per-seat isolation — through `just test` over the new chores
directory plus `harness checks` for whole-repo regression. What still needs human judgement
is whether a given probe is a genuine superset signal and whether the report reads well to a
cheap seat; nothing else. The recommended next move for this task is to propose the two
extensions first, and the approval I am asking for is exactly that: fold the boundary-scan
extension and the temp-home assertion into Phase 1 as two extra tasks.
