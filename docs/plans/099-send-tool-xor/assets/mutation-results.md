# s099 — mutation gate results

Ranks pre-registered in `criteria.md` **before implementation existed**. Tool
`~/.pij/shared/mutate.mjs`, `--expect` on every run. Spec
`.pi/extensions/pij/index.send-schema.test.ts` — in-process, verified against the tool's own
five subprocess markers; the one-hop WARN on `adapters/git-repository.ts` is noted and resolved
below.

Post-fix suite green before mutating: `Tests 8 passed (8)`.

**Survivor sets are pre-registered, not only targets** — a mutant that kills everything has
isolated nothing. Each rank below records what it spared as well as what it killed.

## Rank 1 — remove the structural constraint · GATE PASSES

`oneOf:` → `unusedOneOf:` (the keyword lands but is not the enforced one).

```
Failing tests under mutation:
  - C1: the schema carries a structural exclusivity constraint
  - C2: {to, message, command} is NOT schema-valid
  - C3: {to} alone is NOT schema-valid
✓ GATE PASSES — "C2: {to, message, command} is NOT schema-valid" failed under mutation
```

All three behavioural criteria perceive the constraint. It is **load-bearing, not decorative** —
which was the open question after the spike, because a keyword can serialise correctly and be
ignored by the validator.

## Rank 3 — first attempt · GATE PASSED AND PROVED NOTHING

Pre-registered as: *"make the constraint accept `{to}` while still rejecting
`{to, message, command}` — proves C3 is independent of C2."*

Mutant `oneOf: [` → `oneOf: [ {},`. Result:

```
Failing tests: C2, C3, C4, C5     ✓ GATE PASSES (C3 was among them)
```

**The gate passed and the mutant was worthless.** Adding an empty alternative makes *every*
payload match two branches, so `oneOf` fails for all of them — C4 and C5 died too. It does not
separate C3 from C2; it invalidates everything at once.

This is **green-that-lies mechanism 4 — the mutation kills for the wrong reason** — occurring in
my own pre-registered rank, and the exit code could not see it. `--expect` asks *did the named
test fail*; it cannot ask *did it fail for the reason I claimed*. **Caught only by reading which
tests failed rather than the verdict.**

Recorded rather than replaced, per the amend-in-place rule: a mutant that was wrong is more
useful with its correction attached.

## Rank 3 — corrected · GATE PASSES, AND DISCRIMINATES

Mutant: replace both alternatives with `{ not: { allOf: [ {required:["message"]},
{required:["command"]} ] } }` — forbids *both together* while permitting *neither*.

```
Failing tests under mutation:
  - C3: {to} alone is NOT schema-valid
✓ GATE PASSES — C3 failed under mutation
```

**C3 fails alone.** C1, C2, C4, C5 and the CONTROL all stay green. C3 is not riding C2's
assertion — two criteria that always failed together would be one criterion.

## Rank 2 — RUN. GATE PASSES, AND ISOLATES CLEANLY

C6 was carried with no test. Before striking it as "covered elsewhere" I checked: the guard at
`index.ts:101` has **no test anywhere in the repo**, despite being the sole enforcement of the
rule for the entire of pij#166. Striking it would have been false, so it was tested instead —
C6a (`{to}`) and C6b (`{to, message, command}`), split one-claim-one-observable.

Mutant: `if (message.length > 0 === (command !== undefined)) {` → `if (false) {`.

```
Failing tests under mutation:
  - C6a [preserved]: execute() rejects {to} at runtime
  - C6b [preserved]: execute() rejects {to, message, command} at runtime
✓ GATE PASSES — C6a failed under mutation
```

**Kills exactly its target pair and spares C1–C5 and the CONTROL.** That is the survivor set
pre-registration asks for — the discipline my first rank-3 attempt failed.

**A finding independent of this stream**: the runtime XOR guard cited throughout #166 as "the
rule is enforced at runtime" had **zero coverage** until now. Every argument in that issue rested
on a guard nothing tested.

## Warn resolution, recorded next to the results

`classifySpec` warns one hop out on `adapters/git-repository.ts` (2 markers). Resolved: that
module shells out to `git`, an external binary that cannot load a TypeBox schema module, and
every named red test above constructs and validates the schema in-process. Results stand. The
marker in `index.ts` is ignored by the tool's third tier — it is the `--file` target, and a
subject shelling out says nothing about whether the spec does.

## C1 — OBSERVED-BLOCKED, blocker named

Everything above observes the **registration boundary**. None of it proves the model is shown the
constraint — the exact surface pij#166 proved insufficient.

**C1 is therefore NOT discharged, and is not being discharged here.** Recording it at the
registration boundary would assert that the registered schema equals the rendered one, which is
precisely the equivalence this issue disproves.

**Disposition: OBSERVED-BLOCKED.** Two attempts to stand up a live pi seat in this worktree died:

| pane | outcome |
|---|---|
| `%242` | wedged on the fresh-worktree `Trust project folder?` modal; died immediately after the modal was cleared |
| `%243` | trust already granted, reached `.pi` bootstrap, died while cloning an extension repo |

Cause is **task #17**, open since 2026-07-25 and without evidence until today; both instances are
now attached to it. That task reproduces two weeks later in a different worktree, and instance 4
shows the trust modal is **not** the whole cause — it never saw the modal and still died.

**This is a stronger result than an unobserved pass.** It is an observation that the observation
cannot be made, with a named, reproducible, pre-existing cause.

**Unblock**: a human runs `pi` once to completion in the worktree, then the spawn succeeds and
C1 can be observed. Until then the honest ceiling of this stream is: *the constraint is present,
load-bearing, and independent at the registration boundary; whether it reaches the model is
unmeasured.*
