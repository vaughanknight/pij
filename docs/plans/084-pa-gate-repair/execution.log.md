# Execution log — plan 084

Worker log. Single-writer: `pij-yucky-mosquito` (coder), under stream orchestrator
`pij-respectable-starfish` (s091). Appended as work lands, not reconstructed afterwards.

---

## Phase 1 — Make the gate visible

**Started** 2026-08-05T16:02Z · **Branch** `s091/pa-gate-repair` · **Parent SHA** `efcc889`

### 1.1 — Failing tests first

Added to `core/cli.test.ts`, inside the existing `describe("dispatch tail / state / path")`
block. Watched red before writing a line of implementation.

The three tabled fixtures, plus three I added and why:

| test | why |
|---|---|
| stamped seat (`orchestrationRole: "pa"`, `parentId: "pij-boss"`) | tabled |
| rooted seat (`parentId: null`) | tabled — the null-is-present case |
| legacy descriptor (neither field) | tabled — the migration case |
| **`spawnedBy` set, `parentId` absent → `parent === spawnedBy`** | **added on the orchestrator's ruling; the regression guard for the trap below** |
| explicit `parentId` overrides `spawnedBy`, incl. `--root`'s explicit `null` | added — proves the fallback does not silently undo an explicit root |
| `prime: true` → role reads `"prime"` | added — `projectOrchestrationRole` is a *total* projection; the raw field reports a prime as unstamped |

Assertions use `Object.keys(j)` / `toHaveProperty(k, null)` rather than a bare value check,
because the defect under repair is **absent vs null**, not the value.

**Red verdict, for the right reason** — key absent, no crash:

```
AssertionError: expected [ 'id', 'lifecycle', 'state', …(18) ] to include 'parent'
AssertionError: expected [ 'id', 'lifecycle', 'state', …(18) ] to include 'orchestrationRole'
AssertionError: expected { id: 'w3', …(19) } to have property "orchestrationRole" with value 'prime'
```

### Ruling taken mid-phase — the parent key is `parent`, carrying `effectiveParent(d)`

I raised this as a blocking ambiguity before implementing 1.2 rather than guessing.

AC-01 named the key `parentId`. But `core/cli.ts:2531` carries a load-bearing D-041 comment:
`list` and `node show` deliberately project `effectiveParent(d)` under the key `parent`,
and a raw `parentId` "would disagree with `node show` for every spawned-but-never-linked seat
and buy back the class it was added to remove".

Raw `parentId` and `effectiveParent` diverge in exactly one case: `parentId` absent and
`spawnedBy` set — **a PA spawned by its prime and never explicitly linked**. A projection
(or a Phase-2 target predicate) keyed on the raw field would report that PA as parentless
and refuse it permission over its real parent: issue #95 rebuilt inside #95's own fix.

`pij-respectable-starfish` ruled: **one key, named `parent`, carrying `effectiveParent(d)`,
always present, `null` when none.** AC-01 amended; recorded as Key Finding 09. I added the
divergence fixture as instructed.

Note the ruling also lands us on the repo's existing names: `list --json` already emits
`orchestrationRole: projectOrchestrationRole(d)` (`cli.ts:2499`) and `parent: effectiveParent(d)`
(`cli.ts:2534`). `pij state` was the outlier, not the innovator.

### 1.2 — JSON projection

`core/cli.ts`, `case "state"`. Two keys added to the `--json` object, both **unconditionally
present**:

```ts
orchestrationRole: projectOrchestrationRole(d),
parent: effectiveParent(d),
```

Additive only — no key renamed, none removed. `JSON.stringify` drops `undefined`, which is
precisely why neither is written as a bare optional field read.

### 1.3 — Text output

Role and parent render as independent segments (`  ·  role: pa`, `  ·  parent: pij-boss`),
each silent when it has nothing to say. Deliberately **not** one combined line: a stamped seat
with no parent must still show its role, and suppressing both on one absence is how a gated
seat reads as ungated. Follows the existing `modelLine`/`effortLine` pattern and sits ahead of
them, so identity precedes configuration.

### 1.4 / 1.5 — The refusal names its keying field

`core/orchestration/pa-capability.ts`. `paRefusal`'s signature is **unchanged** (Key Finding 05
— it has 4 consumers, one of which, `whoami`, has no target concept). Only the message builder
changed.

Added `PA_ROLE_FIELD = "orchestrationRole" satisfies keyof SessionDescriptor` — the `satisfies`
makes the compiler the enforcer, so a field rename breaks the build instead of leaving the
refusal naming a field that no longer exists.

New text:

```
'watchdog' is not available to a PA — refused by role 'pa' (field: orchestrationRole):
it changes supervision policy for a seat. Run 'pij whoami --json' to see your role and
capabilities, or 'pij state <id> --json' to read orchestrationRole and parent on any seat.
```

The second read path is the point of the phase: the refusal now points at the projection that
1.2 made exist, so the seat can check the field itself instead of needing a human.

Four tests, incl. one asserting **every** `refuse` entry in the table carries role + field —
a message builder proven on one verb is not proven on the family.

### 1.6 — Gate

See the done report for verbatim verdicts.

### Observations captured

`DL-003` (difficulty) — the D-041 / raw-`parentId` trap above.
`WIN-001` (win) — **superseded, headline was wrong.**
`WIN-002` (win) — the correction, measured rather than asserted: `toBeNull`,
`toMatchObject({k:null})` and `toHaveProperty(k,null)` all *correctly* fail on an absent key.
Only `toBeFalsy()` and `?? null` normalisation silently pass. So the exposure is **consumer**-side
(`j.k == null` cannot tell "predates the field" from "genuinely null"), not test-side — and for
a capability gate the fabricated answer is the permissive one.

---

## Phase 2 — Make the gate target-scoped

**Started** 2026-08-05T20:38+10:00 · **Parent SHA** `efcc889` (Phase 1 still uncommitted in-tree)

### 2.1 / 2.2 — `pa-target.ts`, the pure predicate

**TDD slip, self-corrected and recorded.** I wrote the implementation before the test.
Caught it immediately, moved the file aside, wrote `pa-target.test.ts`, watched it fail for
the right reason (`Failed to resolve import "./pa-target.js"` — the module genuinely did not
exist), then restored. Recording it because a log that only contains the tidy version is not
evidence of anything.

The predicate takes the **caller's own** descriptor plus a target id and returns a tagged
union. It is pure — no ports, no DI, no registry — which is what lets the handler own the
check while the gate stays a zero-read table lookup.

**Polarities differ on purpose**, and this is the whole design:

| question | posture | why |
|---|---|---|
| who is the caller? | fails **open** | refusing an unidentifiable caller breaks every unregistered context (tests, tooling, first run) to constrain a seat that is always registered by construction |
| what is the target? | fails **closed** | an unresolvable target is a question we cannot answer, and answering "permitted" to an unanswerable permission question is how a boundary becomes decorative |

**Mutation proof (trap 2).** Replaced `effectiveParent(caller)` with `caller.parentId ?? null`:

```
× ALLOWS a PA its prime SPAWNED but never explicitly linked
  Tests  1 failed | 7 passed (8)
```

Exactly one test red — the guard — and nothing else. Restored: 8 passed.

### 2.3 — The `conditional` arm

```ts
export type PaCapability =
	| { readonly kind: "allow" }
	| { readonly kind: "conditional"; readonly why: string }
	| { readonly kind: "refuse"; readonly why: string };
```

`paRefusal`'s **signature is unchanged** (Key Finding 05 — four consumers, one with no target
concept). It now switches with `const _exhaustive: never`, so a fourth arm breaks the **build**
rather than falling through to a permissive runtime default (PR #71's law).

`conditional` returns `null` from `paRefusal` — not refused *at the table*. Both seams consult
that one predicate, so a single table edit opens both seams at once; the handler then decides.

### 2.4 — Totality scrape, mutation-proven

Deleted `daemon: refuse(...)` from the table:

```
FAIL  classifies every verb the BIN handles before core parse
AssertionError: expected [ 'daemon' ] to deeply equal []
```

Restored. **Side finding**: the deletion also reddened my own Phase-1 message test, which had
hardcoded `daemon` as its sample. A hardcoded verb turns any future reclassification into a
confusing second failure beside the real one, so I changed it to derive a refused verb from
the table.

### 2.5 / 2.6 — Handler enforcement and the narrowness proof

The red state here was worth the whole exercise. After 2.3 opened the gate and before the
handler existed, the tests read:

```
✓ ALLOWS a PA to watch its own prime          ← already passing
× REFUSES a PA watching a stranger            ← the gate is WIDE OPEN
× REFUSES every non-watch/unwatch action
× REFUSES the machine-wide and roster actions
```

That is the widening this phase could have shipped, visible on one screen, and it is why the
narrowness tests are written first rather than after.

`paWatchdogRefusal` sits **first in `case "watchdog"`**, ahead of the store-availability check
— whether a PA may act must not depend on whether a store happens to be wired, or a missing
store masks the refusal with an `E-ARG`. Two independent narrowings:

- **action** — only `watch`/`unwatch`. `disable-all`/`enable-all`/`list` are checked here too
  even though they branch *before* any per-seat id is resolved; a check placed after target
  resolution would silently permit the machine-wide ones, the widest hole in the set.
- **target** — only self or `effectiveParent`.

### 2.7 — The bin-shaped test, and TRAP 1 made visible

`resolveAmbientSelf` (bin) does **not** read `PIJ_SESSION_ID` — it needs
`harness` + `harnessSessionId` + a matching `paneId`. A bin-shaped test that sets only the env
var leaves the bin seam **failing open** and proves nothing about it. Two red runs to find that.

Then I injected the exact defect the plan warns about — the bin seam refusing conditional verbs
while core allowed them, i.e. *a fix that landed only in `paGate`* — and measured both suites:

| suite | verdict |
|---|---|
| `core/cli.test.ts` PA watchdog tests | **11 passed** — the fix "looks complete" |
| `cli.integration.test.ts` bin-shaped | **RED** |

Key Finding 02 reproduced and caught by exactly one test. Unit-level green is *structurally
incapable* of detecting it. Restored; 5 passed.

### 2.8 — `ack-dispatch`

**No new enforcement was needed.** The plan pointed at `core/platform/dispatch.ts:100`, but the
CLI handler at `core/cli.ts:4186` already refuses `self.value !== previous.to` with `E-OWN`,
for every role. Reclassifying the verb to `conditional` was the entire change; the recipient
check was already there and already correct.

Mutation-proven anyway — reverted the entry to `refuse` and the allowance test went red
(`expected 2 to be +0`), confirming the test is not vacuous.

### 2.10 — `whoami`

A third list, deliberately not folded into either existing one. Folding conditional verbs into
`refusedVerbs` lies in the **restrictive** direction — a PA reads "watchdog: refused", concludes
it cannot supervise its own prime, and escalates to a human: the exact loop `#95` describes.
Omitting them lies in the **permissive** direction, and the PA discovers the boundary by
attempting. The text surface states the *condition*, not just the verb name.

### Fence stop — and the pin that caught me

`cli.inbox.integration.test.ts:207` pins `whoami --json` with `toEqual`, and its comment says
`toEqual` is kept deliberately "so a future addition to this surface has to be noticed here".
My additive `conditionalVerbs` key broke it with a one-line diff.

That file was **outside my Phase-2 allowed paths**, so I stopped and asked rather than edit it.
The orchestrator widened the fence for the one line, verified the claim at source first, and
made the point worth recording here:

> Every other defect on this stream — `#95`, `#129`, the expander dropping the chore field —
> was something **absent** reading as something **empty** and reporting nothing wrong. This one
> was somebody encoding "notice me", and it worked, on us, correctly, weeks later.

It is the strongest argument in the repo for pinning a projected contract with `toEqual` rather
than `toMatchObject`. The pin was **not** weakened; one line was added.

### Observations captured

`DL-007` — the two seams resolve the caller differently and it is undocumented; a bin-shaped
test that sets only `PIJ_SESSION_ID` silently tests one seam.
`DL-008` — there were **zero** dispatch-level tests for the `watchdog` verb before this phase.
`WIN-003` — the TRAP-1 mutation is repeatable; any future PA capability change should be
validated with it.
`WIN-005` — the `toEqual` pin, above.

### Not done

**2.9 is GATED** on the `#102` human ruling and was not started — no policy guessed for a
capability boundary. **2.13** (live CLI proof) is the orchestrator's.

### Post-review correctness fix — "parent", never "prime"

Found by the orchestrator's o-prime reviewing the **live transcript I produced**, which is the
argument for running the live proof at all: the defect was invisible in every test and obvious
in one real refusal.

The message said `'X' is neither you nor your parent — a PA may act only on ITSELF ('a') or its
own prime ('b')`. Two words for one relationship — and the second is **factually false**. I
verified it at source rather than taking it on report:

```
$ just pij state pij-respectable-starfish --json
id     = pij-respectable-starfish
role   = pm
parent = pij-continuing-ermine
```

The seat my refusal called "its own prime" is role `pm`. `prime` is a **separate stored flag**
(`SessionDescriptor.prime`); this gate keys on `effectiveParent`, and **a PA's parent need not
be a prime.** So the boundary asserted something untrue in the very artefact offered as
evidence that it worked.

Fixed in both refusal strings and the file header, plus the same conflation I had left in two
`pa-capability.ts` comments and three `pa-target.test.ts` names/comments. `PA_WATCHDOG_CONDITION`
already said "parent" and was correct.

**Encoded, not just corrected** — a regression pin asserts no refusal string contains the word
"prime" in any of the three refusal paths. The fixture id `pij-prime` had to be renamed to
`pij-boss` first, or the substring assertion would have been defeated by the id itself. Mutation
check: reinstating "its own prime" reddens exactly that test
(`expected '...' not to contain 'prime'`), and nothing else. Restored, 9 passed.

Everything the review said to keep was kept: both permitted ids still named as literal strings,
`(field: orchestrationRole)` intact, length unchanged.

**Gate**: full suite `3396 passed | 15 skipped (3411)`, zero failures.
`harness checks --quick` failed once on Biome formatting (the id rename shortened a wrapped
line), fixed with `just format`, re-ran **7/7 pass**.

### Review-2 fixes — both MEDIUM findings closed

#### Finding 2 — every runtime parent fixture was a PRIME

The behavioural twin of KF-10. KF-10 was the refusal *wording* calling a `pm` "its own prime";
this was the same wrong model left **unpinned in behaviour**. `paTargetDecision` never receives
the target's descriptor, so the string pin structurally cannot catch it — only a runtime fixture
can.

Fixed by making the parent a **`pm` by default** in both the handler fixture and the bin-shaped
sandbox, plus a new test asserting `watch`/`unwatch` succeed against a parent of **every** role
(`pm`, `prime`, `worker`, unstamped) while a stranger stays refused in each case.

**Mutation proof, and the first attempt was wrong — recorded because the correction is the
point.** My first mutation refused any non-prime target, which also caught `watch ITSELF` (a PA
is not a prime), so the old fixtures showed 2 failures and I nearly reported that the old suite
would have caught this. It would not have. I narrowed the mutation to the **parent branch only**
— the actual regression class — and re-measured:

| code | fixtures | result |
|---|---|---|
| parent-must-be-prime | **old** (prime parents) | **11 passed, 1 failed** — and the only failure was the NEW test. The pre-existing 11 were all green. |
| parent-must-be-prime | **new** (pm parents) | **4 failed** |
| restored | new | all green |

So the pre-review suite was **completely blind** to it, exactly as the reviewer said. Overclaiming
here would have been easy and wrong.

#### Finding 1 — the totality scrape missed nested `chore` subverbs

**Cheap, so fixed rather than narrowing AC-12.** `dispatchChore`'s `switch` in
`core/chores/cli-verbs.ts` is scrapeable, so the vocabulary can be read from source rather than
hand-listed.

- `paCapabilityVerb` now maps **every** chore subverb to its own key (flags still resolve to the
  family verb, so `pij chore --json` is unchanged).
- `chore run`/`list`/`ack` added as explicit `ALLOW` entries — each subverb is now a stated
  decision rather than an inheritance.
- New scrape test asserts every subverb has a table entry, **with a guard on the scrape itself**
  (`length >= 6`) so a regex that silently matched nothing could not make the test vacuous.

Mutation proof: adding `case "purge":` to `dispatchChore` and nothing else →
`AssertionError: expected [ 'purge' ] to deeply equal []`. Restored.

**Precision about what this fixes**: it makes an unclassified subverb fail the **build**. It does
not auto-refuse at runtime — unknown verbs are still permitted by deliberate policy. AC-12's
claim is about the build-time property, and that property now genuinely holds for this family.

**Gate**: full suite `3399 passed | 15 skipped (3414)`, zero failures.
`harness checks --quick` **7/7 pass** (after one `just format` for line re-wrapping).

---

## Phase 3 — Add the repair path

### 3.1–3.2 `addedAt` preserved on every re-bind

The bug was an **ordering** bug: the handler filtered the prior entry out *before* building the
new record, so the original stamp was already gone by the time it could have been reused. The
fix captures `prior` **before** the filter and reuses `prior?.addedAt`, copying the in-repo
precedent at `core/watch-subscription.ts:75` (read-only to me — copied, not modified).

R-01 (Jordan, verbatim *"original"*) applies to **every** path, so this sits on the shared
`watch`/`unwatch` branch rather than only on `--for`.

**Fixture non-vacuity, asserted inline rather than assumed** — the orchestrator's challenge,
answered before it was checked. A `fixture guard` test asserts the seeded `ORIGINAL_ISO` differs
from the stamp the handler would write, and that the `--for` watcher is neither the caller nor
the target. Had those coincided, every test in the block would have passed while proving nothing.

### 3.3 A re-bind stays observable

Key Finding 04: `addedAt` is read by nothing, so once a re-bind stops moving it, the only
evidence a re-bind happened would vanish. The command now reports
`re-bound (original addedAt preserved)` and `--json` carries `watcherRebound`.

**Scope note**: the plan says "log/spine line". A spine event needs a new `SPINE_KIND_*` in
`core/platform/types.ts`, which is **outside my fence**, so I made the re-bind observable in the
command's own output instead — in-fence, and assertable, which is what "observable" has to mean
for a proof. Flagged for the orchestrator rather than silently chosen.

### 3.4–3.6 `--for`, and the two-sided Key Finding 03

One concept — the **effective watcher id** (`--for` value, else self) — fixes both sides:
the duplicate (`watch --for X` left X's own entry unfiltered) and the orphan
(`unwatch --for X` removed the caller's entry, so a `--for`-created subscription was
un-removable by its owner).

**AC-10 — and a vacuous test of my own, caught by mutation.** My first "a PA is refused `--for`"
test gave the PA no parent, so `paTargetDecision` refused it on **target** grounds and the
`--for` rule was never exercised: right verdict, wrong reason. Mutation 3 reddened only **1 of
2** AC-10 tests, which is how it surfaced. Fixed by giving the PA `parentId === TARGET` so
Phase 2 would *allow* the call, isolating `--for` as the only possible refuser, plus a **control**
asserting the same call without the flag succeeds. Mutation 3 now reddens both.

> **General rule worth keeping**: an authorisation test must be constructed so that every *other*
> guard would permit the call. Otherwise it proves the wrong guard.

### Fence stop #2 — the usage line, and a pattern worth naming

`core/usage-flags.test.ts` failed: *"pij watchdog accepts --for but its usage line never names
it"*. The flag set is in `core/cli.ts` (in fence); the usage text is at `cli.ts:332` — the bin,
**not** in the Phase-3 list. Stopped and asked; fence widened for that one line.

I did **not** take the sanctioned one-line exit of adding `for` to the test's `tolerated` list.
That is the `toMatchObject` move the orchestrator had already refused once. The substance
matters more than the process: **a prime cannot use a recovery path it cannot discover** —
shipping the fix for an invisibility defect as an undocumented flag would reproduce the shape of
the bug inside the cure.

What the stop surfaced is bigger than the fix. `usage-flags.test.ts` is a **legitimate** escape
hatch, and it is legitimate because it is **scoped** (`:46` — only drift predating s078),
**loud** (`"NAMED rather than tolerated in silence"`), and **self-pinning** (`:80` — a flag that
gets documented must *leave* the list). The hatch cannot accumulate. That is the counter-example
to every destructive shortcut this stream kept finding, where the obvious fix silences a working
mechanism.

### Mutation proofs — all three named up front, run at BOTH layers

| # | mutation | result |
|---|---|---|
| 1 | `addedAt` restamped on re-bind | **5 red** (4 unit + 1 bin); `STAMPS addedAt on a genuinely new subscription` stayed **green**, as required |
| 2 | filter re-keyed to the caller | **3 red** — the duplicate side, the orphan side, and the bin-shaped repair test |
| 3 | PA allowed `--for` | **3 red** — both AC-10 unit tests (after the vacuity fix) + the bin-shaped one |

All restored; `grep` confirms no mutation residue.

### Observations captured

`WIN-007` — the vacuous AC-10 test and the general rule it produced.
`WIN-008` — the three properties of a legitimate escape hatch.

### Review-3 fixes — three MEDIUM closed, one ruled out of scope

#### Fix 1 — the parser hole

`--for` was validated **after** the action-specific early returns, so `interval`, `exempt`,
`list`, `disable-all` and `enable-all` silently ignored it **and executed**. A mistyped `--for`
still changed a timeout or tripped the machine-wide kill switch, while the caller believed the
call was scoped to one seat.

Validation is now the **first** thing in the case, above every early return.

The test that missed it listed four actions and omitted exactly the five that returned early —
**the hole and the test's blind spot were the same shape**, which is why it stayed green. It now
enumerates all nine watcher-less actions and asserts each one **did not write**: a flag that is
"rejected" while the action still runs is not rejected, and the write assertion is the one that
would have caught the kill-switch case.

**Mutation**: move the validation back down → `watchdog exempt --for must be rejected: expected
+0 not to be +0` — exit 0, i.e. it executed.

#### Fix 2 — my AC-10 self test was vacuous for its unique claim

The test is named *"REFUSES a PA `--for` EVEN when it names itself"* and passed `"pij-pa-self"`
while `CALLER` was `"pij-boss"`. **The names-itself case was never exercised.** Three lines below
its own warning about "right verdict, wrong reason", it committed another instance of exactly
that.

Now passes `CALLER`, keeps the unflagged control, and asserts the third-party case separately.

**Mutation**: permit `forSeat === self.value` → the fixed test reddens. **And the old version
was proven blind**: restoring `"pij-pa-self"` with the same mutation in place left it **green**.

#### Fix 3 — documented for the test, not for the human

`--for` reached the one-line usage at `cli.ts:332` because `usage-flags.test.ts` pinned it, and
never reached `WATCHDOG_USAGE` — the block `pij watchdog --help` prints, which is where a prime
actually looks. **We documented the recovery path in the string a test reads and not the one a
human reads**: this plan's own defect wearing a patch.

Both usage lines now carry `[--for <seat>]`, and the help gained a section explaining what the
flag *does* — a flag name teaches syntax, not whether it is the thing you need.

**Pinned at the PATH, not the flag.** A flag-level pin protects one flag; pinning
`pij watchdog --help` protects every future flag on that surface, so the coverage boundary stops
being narrower than the work boundary. Plus a **recursive guard**: an assertion on a token only
that block contains, so if `--help` ever stopped printing the watchdog block the other
assertions could not pass against whatever came back instead.

**Mutation**: strip `--for` from both help lines → the pin reddens.

#### Finding 4 — unlocked read-modify-write on the sidecar: OUT OF SCOPE, agreed

Pre-existing, and this stream changed *what* is written, not the concurrency shape. A correct fix
is an interprocess lock or a store-level atomic-update API — a different change that deserves its
own proof rather than being bolted on before a commit. Recorded as a known limit.

**Gate**: full suite `3419 passed | 15 skipped (3434)`, zero failures.
