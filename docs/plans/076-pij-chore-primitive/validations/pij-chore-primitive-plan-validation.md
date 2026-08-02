# Validation — pij-chore-primitive-plan.md

**Round**: 1
**Date**: 2026-08-02
**Basis validated**: `ba3d0da97ddf7185e59de9e8eec1cba8c59f0f40674342f3c04b1f65c3c4de89`
**Runner**: independent subagent (`/validate-v2`), read-only
**Verdict**: ❌ **NEEDS ATTENTION** — 0 critical, 3 high, 4 medium
**Disposition**: all 7 findings folded into the plan; ACs grew 16 → 20, tasks 17 (T004/T010/T011/T012 rewritten)

## Findings and resolution

| # | Sev | Claim | Resolution |
|---|-----|-------|------------|
| 1 | HIGH | The generic `--help` filter (`cli.ts:4079-4084`) sits **after** the `E-NOREG` guard, so a verb registered before the guard never reaches it. AC-13 would have failed as written | **Re-verified independently**: `pij agent --help` prints `E-ARG: unknown subverb '--help'`. Key Finding 06 upgraded to High and rewritten; T011 + AC-13 now require `runChoreVerb` to handle `--help`/`-h`/`help`/empty-args itself, modelled on `runOrchestrationVerb` (`cli.ts:3382-3386`) |
| 2 | HIGH | `remove` shipped in the surface with zero ACs and no rule for its key's baseline — remove→re-add would inherit a stale baseline and suppress the first real delta, recreating the delta-blindness the plan claims to fix | AC-19 (purge baseline + pending + counter on remove) and AC-20 (removal recorded before the row disappears — the brief's borrows #2/#3) added; state machine updated; T010/T012 extended |
| 3 | HIGH | `--full-every N` needs a durable per-chore counter with no home in the plan; unit coverage alone would pass while the shipped CLI (fresh process per `run`) never fires it | `runsSinceFull` added to `ChoreState`, the Storage table and T004; `--dry` explicitly does not advance it; AC-10 reworded to **separate invocations** and assigned to T012 |
| 4 | MED | `add` had no AC — no default scope, no re-add rule; silent overwrite orphans a baseline | AC-17 (seat default; `E-EXISTS` on re-add, mutates nothing) + AC-18 (`list --verbose` round-trips every field) added |
| 5 | MED | The one string ordered "exact" appeared in four different forms across the plan | Normalised to `NO CHANGE — <N> chores probed, <M> moved` at all sites; AC-11 given a literal (`NOT-PROBEABLE <scope>:<roster>: malformed roster`) |
| 6 | MED | Only the no-change report was specified, so Goal 5's denominator was unverifiable exactly when something moved | `CHANGES — <N> chores probed, <M> moved` header + unchanged list specified in the state-machine block; AC-02 extended to assert it |
| 7 | MED | Two wrong citations: `FsRegistry.list()` pointed at a comment; and "shadowing drops a chore" contradicted `pack.ts` | **Re-verified independently**: `pack.ts:1-7` states shadowed packs are "kept but marked `shadowed` — never dropped". Finding 03 repointed to `adapters/fs-registry.ts:137-151`; Finding 01 restated — discovery already unions; the hazard is carrying the `!shadowed` **lookup** filter (`agents/cli-verbs.ts:116-119`), which is a cheaper and lower-risk change than re-writing the merge |
| 8 | MED | G7 claimed the Domain Manifest covered every file in the task table, but no `.test.ts` rows were present | 5 test-file rows added; G7 note updated |

## Verified clean (raises confidence)

- `PIJ_HOME` (`cli.ts:228`) and `PIJ_SESSION_ID` are real — the test-isolation strategy and seat-identity assumption hold.
- `writeJsonAtomic` (`adapters/atomic-file.ts:123`) and `FsWatchdogStore.pathFor`/`write`/degrade-to-`undefined` (`watchdog-store.ts:72-86`) exist as T007 describes.
- Key Finding 04's citation `core/registry-write.ts:1-45` is exact — all five lost-update incidents fall in range.
- The phantom-peer trap is real (`fs-registry.ts:137-151` reads any top-level `.json` with a string `id`), so AC-12's subdir mitigation is sound.
- All three target domains are active rows in `docs/domains/registry.md`; no new domains.
- `just typecheck` and `just self-check` both exist, so the Done-When lines are executable.
- `.pij/` is **not** gitignored — the repo-scoped roster at `<repoRoot>/.pij/chores.json` can genuinely be checked in.
- `.pi/extensions/pij/core/chores/` does not exist yet — no collision with the planned module paths.
- Forward-compatibility: **STANDALONE** — nothing outside this plan consumes the surface; the only external reference is the upstream brief.

## Thesis note (carried forward)

The validator's summary judgement was that the plan's *correctness core* (per-seat baselines,
run-never-advances, union merge, NOT-PROBEABLE) was well specified and well guarded, but that
three of five verbs — `add`, `remove`, and the `--full-every` half of `run` — had **no
falsifiable acceptance surface**. That gap is what findings 2, 3 and 4 closed, and it is the
thing a reviewer should re-check first: every verb in the shipped surface now has at least one
AC that can fail.
