# Execution log — plan 094, PA capability surface

Stream `s094` · branch `s094/capability-surface`.

---

## Phase 1 — Widen the gate to the harm test

### Pre-fix RED gate (plan § Pre-fix RED gate) — MANDATORY, run before implementation

Every BEHAVIOURAL criterion's test was written first and run against the **unfixed**
tree. Twelve behavioural tests, twelve failures, **every one a clean assertion
failure** — no `TypeError`, no crash, no error-shaped pass. The refusal text in each
message is the pre-fix behaviour being asserted against, which is what makes these
failures evidence rather than noise.

**Environment note (harness friction, not a finding about the change):** the worktree
had no `node_modules`. `npm ci` fails in this repo's `.npmrc` configuration —
`--min-release-age cannot be provided when using --before` during git-dep preparation.
Resolved the way the sibling worktrees do it (`s095-liveness-fields`): symlink
`node_modules` at the canonical checkout. `.gitignore:77` already anticipates this.

#### `pa-capability.test.ts` — 5 failed, 29 passed

Tasks 1.1 (AC-01, AC-02) and 1.11 (AC-08).

```
 FAIL  > PERMITS the widened verb 'spine-append' — it records, and is reversible
AssertionError: expected 'it writes directly to the spine' to be null
- Expected:  null
+ Received:  "it writes directly to the spine"
 ❯ pa-capability.test.ts:167:34

 FAIL  > PERMITS the widened verb 'chore add' — it records, and is reversible
 FAIL  > PERMITS the widened verb 'chore update' — it records, and is reversible
 FAIL  > PERMITS the widened verb 'chore remove' — it records, and is reversible
AssertionError: expected 'it edits the durable duty roster; a P…' to be null
- Expected:  null
+ Received:  "it edits the durable duty roster; a PA may run/list/ack chores"
 ❯ pa-capability.test.ts:167:34

 FAIL  > a conditional verb still STATES its condition, so a PA can read the rule
AssertionError: expected 'a PA may only \'watch\' or \'unwatch\…' to contain 'list'
Expected: "list"
Received: "a PA may only 'watch' or 'unwatch', and only ITSELF or its own parent — every
           other watchdog action changes supervision policy for a seat, and every
           other target belongs to someone else"
 ❯ pa-capability.test.ts:273:23

 Test Files  1 failed (1)
      Tests  5 failed | 29 passed (34)
```

Note that the four widened-verb failures are **four separate reported failures**, not
one aborted loop (task 1.2's `it.each` conversion applied to the new tests too). Under
the old loop shape the first would have hidden the other three.

#### `core/cli.test.ts -t watchdog` — 6 failed, 36 passed

Tasks 1.3 (AC-03), 1.5 (AC-04), 1.6 (AC-04b).

```
 FAIL  > ALLOWS a PA `watchdog list` — the surface it finds its OWN subscriptions on
AssertionError: watchdog list must be permitted for a PA: E-OWN: 'watchdog list' is not
available to a PA — refused by role 'pa' (field: orchestrationRole): a PA may only
'watch' or 'unwatch', and only ITSELF or its own parent …
: expected 2 to be +0 // Object.is equality
 ❯ core/cli.test.ts:8071

 FAIL  > ALLOWS a PA to unwatch a THIRD-PARTY target, removing only its own row
AssertionError: a PA must be able to resign from a stranger: E-OWN: 'watchdog unwatch'
is not available to a PA — refused by role 'pa' (field: orchestrationRole):
'pij-stranger' is neither you nor your parent — a PA may act only on ITSELF ('pij-pa')
or its own parent ('pij-parent') …
: expected 2 to be +0
 ❯ core/cli.test.ts:8200:82

 FAIL  > resigning from a stranger carrying an expired EXPLICIT deadline writes ONCE
        and changes ONLY the PA's row
 FAIL  > resigning from a stranger carrying a LEGACY exemption writes ONCE and changes
        ONLY the PA's row
AssertionError: a PA must be able to resign: E-OWN: 'watchdog unwatch' is not available
to a PA … : expected 2 to be +0
 ❯ core/cli.test.ts:8216:67

 FAIL  > resigning from a stranger it does NOT watch (an expired EXPLICIT deadline)
        writes NOTHING at all
 FAIL  > resigning from a stranger it does NOT watch (a LEGACY exemption) writes
        NOTHING at all
AssertionError: a no-op resignation must still succeed: E-OWN: 'watchdog unwatch' is
not available to a PA … : expected 2 to be +0
 ❯ core/cli.test.ts:8239:78

 Test Files  1 failed (1)
      Tests  6 failed | 36 passed | 389 skipped (431)
```

**The two absent-subscription cases assert `exitCode === 0` first, deliberately.**
Without that they would have *passed* pre-fix — a refused command writes nothing and
leaves the sidecar byte-identical, so "no write" and "unchanged sidecar" are both
already true when the PA is simply refused. They would have been preserved properties
wearing a behavioural label, which the plan's gate exists to catch.

#### `cli.integration.test.ts -t "PA capability gate"` — 1 failed, 5 passed

Task 1.12 (AC-02 at the bin seam).

```
 FAIL  > lets a PA `chore add` THROUGH THE REAL BIN — the raw-argv subverb mapping
AssertionError: bin refused a permitted chore add: E-OWN: 'chore add' is not available
to a PA — refused by role 'pa' (field: orchestrationRole): it edits the durable duty
roster; a PA may run/list/ack chores. …
: expected 2 to be +0
 ❯ cli.integration.test.ts:3250:74

 Test Files  1 failed (1)
      Tests  1 failed | 5 passed | 87 skipped (93)
```

The five passing tests in that block are the PRESERVED-PROPERTY set at the bin seam
(watch/unwatch own parent, stranger refused, policy action refused, `close` refused,
`whoami` conditional). They are expected green here and are proven under mutation.

#### PRESERVED-PROPERTY criteria — green pre-fix, as designed

AC-04c (task 1.4), AC-05 and AC-06 (task 1.7) all passed on the unfixed tree. That is
what a preserved property is: it is never evidence of the fix, and it earns its keep
under its mutation row (12, 5, 14 respectively). AC-07's six refusals (task 1.2) also
passed — the conversion from a `for` loop to `it.each` changed the reporting shape,
not the verdict.

**No behavioural criterion passed pre-fix.** Nothing had to be rewritten or discarded.

---

### Implementation (tasks 1.8–1.12)

| Task | Change |
|---|---|
| 1.8 | `spine-append` and `chore add`/`update`/`remove` → `ALLOW` in `PA_VERB_CLASSIFICATION`, each with the harm-test rationale recorded at the row (attribution + append-only for the spine; the `removals` record for the chore mutators). |
| 1.9 | `paWatchdogRefusal` now returns a three-valued `PaWatchdogDecision` (`allow` · `self-resign` · `refuse`), and the handler gained a self-resign branch placed **before** the reconcile-and-persist preamble. It removes only the caller's own watcher row and **writes nothing** when that row is absent. |
| 1.10 | The action split: `list` → allow, `unwatch` → self-resign (any target), `watch` → target-checked, everything else refused. Both checks sit **ahead** of target resolution, and the `--for` refusal stays first. |
| 1.11 | `PA_WATCHDOG_CONDITION` rewritten per-action, still one named constant beside the table (P5). All three surfaces read it: the table, the handler's refusal, `pij whoami`. |
| 1.12 | Bin-seam coverage for `chore add` in `cli.integration.test.ts` (positive) with the existing `close` refusal as the gate-fires control. |

One supporting refactor: the `pij watchdog <action> <id>` result line moved into
`renderWatchdogResult`. The self-resign path returns early, so without it two exits
would render the same receipt by hand — the standard way two renderings of one sidecar
start disagreeing.

### Mutation results (task 1.13) — 22 mutations, all evidence-bearing

Run with **`node ~/.pij/shared/mutate.mjs`** (the fleet default, relayed mid-stream),
which applies the mutation as an **in-memory vite transform**: the tree is never
written, so restore is inherent and residue is impossible. Its exit codes are the
contract — `0` = the mutation made tests fail (**gate passes**), `1` = everything
stayed green (**not evidence**), `2` = **target not found** (a drifted `--find` throws
instead of passing silently green, which is the failure mode the tool exists to remove).

Every row below is `exit=0` with an **`AssertionError`** — none failed to build, so
none proves the compiler instead of the test. Each row also records the *whole file's*
tally, so the green-neighbour claim is not a hand-picked test but every other test in
the file.

Exit-2 behaviour was verified directly rather than assumed:

```
$ node ~/.pij/shared/mutate.mjs --file /core/orchestration/pa-capability.ts \
    --find '"spine-append": REFUSE_THAT_NO_LONGER_EXISTS,' ...
exit=2
✗ TARGET NOT FOUND … A green run here would be meaningless.
```

#### The planned table (1–15)

| # | `--find` | exit | Tally | Test that went red |
|---|---|---|---|---|
| 1 | `"spine-append": ALLOW,` | 0 | 1 failed / 33 passed | `PERMITS the widened verb 'spine-append'` |
| 2 | `"chore add": ALLOW,` | 0 | 1 failed / 33 passed | `PERMITS the widened verb 'chore add'` |
| 3 | `if (cmd.action === "list") return allow;` | 0 | 1 failed / 430 passed | `ALLOWS a PA \`watchdog list\`` |
| 4 | `if (cmd.action === "unwatch") return { kind: "self-resign" };` | 0 | 5 failed / 426 passed | 1.5 + all four 1.6 cases |
| 5 | `const decision = paTargetDecision(descriptor, cmd.id);` | 0 | 3 failed / 428 passed | `REFUSES a PA watching a stranger` (+2 lineage tests) |
| 6 | `close: LINEAGE,` | 0 | 2 failed / 32 passed | `refuses the lineage/seat-control verb 'close'` |
| 7 | `spawn: LINEAGE,` | 0 | 1 failed / 33 passed | `… verb 'spawn'` |
| 8 | `"task-close": OBLIGATION,` | 0 | 1 failed / 33 passed | `… verb 'task-close'` |
| 9 | `attest: TESTIMONY,` | 0 | 1 failed / 33 passed | `… verb 'attest'` |
| 10 | `"state-verify": TESTIMONY,` | 0 | 1 failed / 33 passed | `… verb 'state-verify'` |
| 11 | `orchestration: GRANT,` | 0 | 1 failed / 33 passed | `… verb 'orchestration'` |
| 12 | `if (cmd.action === "list") return allow;` → `\|\| status` | 0 | 1 failed / 430 passed | `REFUSES the policy action 'watchdog status'` |
| 13 | `if (paRefused.kind === "self-resign") {` → preamble injected above it | 0 | 4 failed / 427 passed | **all four** 1.6 cases |
| 14 | `if (cmd.forSeat !== undefined) {` → `if (false) {` | 0 | 3 failed / 428 passed | the three `--for` refusal tests |
| 15 | whoami render drops `— ${entry.why}` | 0 | 1 failed / 430 passed | `whoami TEXT states the condition` |

Mutation 6 turns **two** tests red: the `close` row plus `names the verb, the reason,
and how to read your own capability`, which samples `close` by name. Recorded rather
than tidied — it is the honest blast radius.

#### 2b — the bin seam, and a REAL LIMITATION OF THE IN-MEMORY TOOL

`cli.integration.test.ts` drives the real bin as a **subprocess** (`execFileSync`). An
in-memory vite transform only affects modules loaded inside the vitest process, so the
subprocess reads the **unmutated** file from disk. Running mutation 2b through the tool
returned **exit 0 — a false pass**: the log shows `✓ lets a PA \`chore add\` THROUGH THE
REAL BIN` alongside an unrelated flake (`expected 143 to be +0`, a SIGTERM timing
failure in a different describe) which the tool counted as the red.

**The tool cannot gate subprocess-driving tests, and it fails permissively when asked
to.** Reported upstream. Mutation 2b was therefore run **on disk**, with the three
conditions evidenced explicitly:

```
# (1) the target actually changed
$ git diff .../pa-capability.ts | grep '"chore add"'
-	"chore add": refuse("it edits the durable duty roster; a PA may run/list/ack chores"),
+	"chore add": refuse("m2b on-disk"),

# (2) the red is an AssertionError, not a build failure
 FAIL  cli.integration.test.ts > … > lets a PA `chore add` THROUGH THE REAL BIN
 AssertionError: bin refused a permitted chore add: …
      Tests  1 failed | 92 skipped (93)

# (3) restored, byte-identical
$ diff /tmp/s094/cap-pristine.ts .../pa-capability.ts && echo CLEAN
CLEAN
```

This is the mutation the prime named as the real proof of task 1.12: `close` shows the
bin gate *fires*, but it has no subverb and so cannot prove the raw-argv
`paCapabilityVerb(top, argv[3])` **mapping**. Flipping `chore add` and watching the bin
test go red is what proves the mapping is live.

#### Adversarial mutations — spent on the NEWEST, LEAST-EXAMINED tests

Per the fleet heuristic: a vacuous test is invisible to reading by construction, so the
gate is worth more on 1.6 (written under pressure to close a CRITICAL finding) and 1.12
(newest, its control changed mid-flight) than on the headline rows above.

| # | Mutation | exit | Tally | Red |
|---|---|---|---|---|
| A1 | self-resign removes **every** watcher, not just its own | 0 | 5 failed / 426 passed | 1.5 + three 1.6 cases |
| A2 | self-resign writes even when there is nothing to remove | 0 | 2 failed / 429 passed | both 1.6 **absent** cases |
| A3 | resignation **drops the pause/exempt fields** it must preserve | 0 | 2 failed / 429 passed | both 1.6 **present** cases |
| A4 | **cross-file**: `reconcileWatchdogExemption` returns its input unchanged | 0 | 2 failed / 429 passed | the fixture guards only — see the correction below |
| A5 | **cross-file**: `paCapabilityVerb` collapses every subverb to the family token | 0 | 2 failed / 32 passed | both subverb-routing tests |
| A6 | **cross-file**, re-run after adding the liveness layer | 0 | 4 failed / 429 passed | both **fixture liveness** + both fixture guard tests |
| B1 | **on-disk**: `chore add` permitted but made a **no-op** (`writeRoster` skipped) | — | 1 failed | 1.12 — `expected '…' to contain 'sweep-inbox'` |

**A3 is the one that vindicates the shape of task 1.6.** Dropping the pause/exempt
fields is precisely the damage the CRITICAL finding describes, and it lands in fields a
`watchers`-scoped assertion never reads. The whole-sidecar comparison catches it; the
obvious test would not have.

**A4 — CORRECTED READING. This was an EQUIVALENT/UNREACHABLE MUTANT, not demonstrated
vacuity, and the first version of this log said otherwise.** Making reconciliation a
no-op turned only the fixture guards red; all four isolation cases stayed green. The
initial reading — "that is the vacuity mode exactly" — was **wrong**. Post-fix the
self-resign path **skips reconciliation by construction**: that is precisely the fix. So
`reconcileWatchdogExemption` is *unreachable* from those four cases, their staying green
is correct and expected, and a **red** there would have meant the fix did not work.

The distinction matters because the tool cannot draw it: `exit 1` (and, as here, a green
neighbour under `exit 0`) has two causes it cannot tell apart — tests that genuinely
cannot perceive the change, and a mutant that changed no observable behaviour. Acting on
the first when the truth is the second means rewriting a correct test to chase a
phantom, and the natural "fix" is to weaken an assertion until something moves. Nothing
here was weakened: the four cases are unchanged and two tests were **added** beside them.

**The fixture-liveness proof is MUTATION 13, which is the reachable mutant.** With the
self-resign branch moved back *after* the preamble, all four cases went red
(`expected [...] to have a length of 1 but got 2`). Had the fixture been inert, the
preamble would have written nothing and 13 would have left them green. Liveness is
therefore established — by 13.

**And note what the pre-fix RED run does NOT establish.** All four cases failed pre-fix,
but on their **first** assertion, `exitCode === 0`: the command was refused at the gate,
so execution never reached the preamble. That failure proves the *permission* half of
the criterion and says nothing about the fixture. A pre-fix red is not automatically
evidence for every assertion in the test that produced it — only for the one that
fired.

**B1** shows 1.12 is not a bare exit-code check: making `chore add` permitted-but-inert
fails it on the `chore list` read-back. `core/chores/cli-verbs.ts` is outside this
packet's allowed set, so the mutation was transient and its restore evidenced by `diff`
plus `git status` (the file is absent from the modified list).

#### The fixture-liveness layer, added in response to A4

#### The fixture-liveness layer — kept, on narrower grounds than it was added

It was added in response to the misread of A4. The misread is corrected above, so the
justification is restated honestly rather than left to stand on a claim that turned out
to be wrong.

The isolation tests now prove their own fixture is live **before** proving the path
leaves it alone, by calling `reconcileWatchdogExemption(fixture, T)` directly and
asserting a **changed** sidecar at the same injected `now` the dispatch tests use.
A6 re-ran the cross-file mutation afterwards and turned **all four** of the liveness and
guard tests red, so the new assertions are non-vacuous in their own right.

**It is kept because fixture liveness is a real precondition that mutation 13 proves
only for today's tree.** If a later edit moved `T`, changed
`DEFAULT_WATCHDOG_EXEMPT_TTL_MS`, or reshaped the fixtures so the exemptions were no
longer expired, the four isolation cases would silently become unfalsifiable and nothing
in the suite would say so — mutation 13 is not run on every commit. The assertion is;
it converts a precondition that currently holds by inspection into one that holds by
construction. That is a smaller claim than the one originally made for it, and it is the
true one.

### Gates

```
just typecheck   → clean
just lint        → 0 errors · 9 warnings · 1 info  (byte-identical to the `main` baseline)
just test        → 210 files passed, 4 skipped · 4071 tests passed, 19 skipped, 0 failed
```

One intermediate full run showed a single failure in
**`adapters/git-repository.test.ts` — `ENOTEMPTY, Directory not empty`** from an
`afterEach` tmpdir cleanup. It is a pre-existing flake unrelated to this change: the file
contains **zero** references to the gate, the watchdog or chores; it passes in isolation;
and the final full run above is clean. The nine warnings and one info are pre-existing on
`main`, verified by running `biome check .` in the canonical checkout for comparison.

---

## Phase 2 — Exhaustive verbs map, the two lists removed

### Pre-fix RED gate (tasks 2.1–2.4) — run before implementation

Command: `npx vitest run .pi/extensions/pij/core/cli.test.ts -t "AC-1"` against the
tree with Phase 1 committed and **no** Phase 2 implementation.

**Result: 5 failed · 22 passed · 411 skipped. Five clean `AssertionError`s, zero
crashes, zero passing pre-fix.**

**WHICH ASSERTION FIRED — recorded per test, not merely "it was red."** This is the
fleet bar my own Phase 1 A4 finding produced: a pre-fix red is evidence only for the
assertion that FIRED, not for every assertion in the test that produced it. Four of the
five below fired on their **guard**, which proves the field is absent and says nothing
about the comparison beneath it. That is stated here rather than left to be assumed —
the comparisons are proven instead by mutations 15–18 and A1–A3, which run post-fix
where the guard passes and the comparison is reached.

| Test | Assertion that fired | Line | What that red proves — and what it does not |
|---|---|---|---|
| 2.1 PA total map | `expect(parsed).toHaveProperty("verbs")` | :7854 | Field absent. **Not** that the key set or the three-valuedness is checked. Proven by 15 / A1. |
| 2.2 lists gone (`pa`) | `expect(parsed).not.toHaveProperty("refusedVerbs")` | :7883 | The list was present with 21 entries. Whole claim of the test. |
| 2.2 lists gone (`pm`) | `expect(parsed).not.toHaveProperty("refusedVerbs")` | :7883 | Present as `[]` — the defect in its purest form: an empty list a consumer reads as "nothing is refused". |
| 2.3 non-PA totality | `expect(parsed).toHaveProperty("verbs")` | :7896 | Field absent. **Not** that totality or uniformity is checked. Proven by 17 / A3. |
| 2.4 schema marker | `expect(parsed).toHaveProperty("capabilitySchema")` | :7916 | Field absent. **Not** that the value is pinned to 2. Proven by 18. |

Verbatim (abridged to the failure blocks; full output in the run above):

```
FAIL  core/cli.test.ts > s078 … > whoami --json carries a TOTAL three-valued verbs map for a PA (2.1, AC-10)
AssertionError: expected { id: 'pij-assistant-seat', …(7) } to have property "verbs"
 ❯ .pi/extensions/pij/core/cli.test.ts:7854:18
    7854|   expect(parsed).toHaveProperty("verbs");

FAIL  core/cli.test.ts > s078 … > drops refusedVerbs and conditionalVerbs entirely for a pa seat (2.2, AC-11)
AssertionError: expected { id: 'pij-assistant-seat', …(7) } to not have property "refusedVerbs"
- Expected: undefined
+ Received: [ "adopt", "agent", "agents", "attest", "canary", "close", "daemon",
              "dispatch-packet", "fence-set", "link", "orchestration", "project-create",
              "project-set", "revive", "spawn", "state-verify", "stream-close",
              "stream-create", "task-close", "task-set", "telegram" ]
 ❯ .pi/extensions/pij/core/cli.test.ts:7883:22

FAIL  core/cli.test.ts > s078 … > drops refusedVerbs and conditionalVerbs entirely for a pm seat (2.2, AC-11)
AssertionError: expected { id: 'pij-assistant-seat', …(7) } to not have property "refusedVerbs"
- Expected: undefined
+ Received: []
 ❯ .pi/extensions/pij/core/cli.test.ts:7883:22

FAIL  core/cli.test.ts > s078 … > a non-PA's map is EQUALLY TOTAL and uniformly allow (2.3, AC-13)
AssertionError: expected { id: 'pij-assistant-seat', …(7) } to have property "verbs"
 ❯ .pi/extensions/pij/core/cli.test.ts:7896:18

FAIL  core/cli.test.ts > s078 … > the payload carries an explicit schema marker (2.4, AC-12)
AssertionError: expected { id: 'pij-assistant-seat', …(7) } to have property "capabilitySchema"
 ❯ .pi/extensions/pij/core/cli.test.ts:7916:18

 Test Files  1 failed (1)
      Tests  5 failed | 22 passed | 411 skipped (438)
```

The `pm` row is worth keeping in view: pre-fix the payload said `refusedVerbs: []`, which
is **exactly** the shape this stream exists to remove. A consumer cannot distinguish
"nothing is refused for this role" from "this build has no gate" from "the producer never
heard of the verb you asked about."

### Implementation (tasks 2.5–2.8)

| Task | File | Change |
|---|---|---|
| 2.5 | `core/cli.ts` (whoami case) | `refusedVerbs`/`conditionalVerbs` removed from the JSON payload; replaced by `capabilitySchema: 2` and a total `verbs` map, sorted, one entry per key in `PA_VERB_CLASSIFICATION`, valued `allow`/`conditional`/`refuse` for a PA and uniformly `allow` for every other role. The local computed for the **text** surface was renamed `refusedForText` so the repo-wide sweep reads true. Human text output is unchanged. |
| 2.6 | `core/cli.test.ts` | Three existing tests re-pointed at the map. Every assertion came out **stronger or equivalent**: `refusedVerbs.toContain("close")` → `verbs.close === "refuse"`; `refusedVerbs.not.toContain("list")` → `verbs.list === "allow"` (the negation was satisfiable by a payload that had never heard of `list`); the `conditionalVerbs.toContain(x)` + `refusedVerbs.not.toContain(x)` pair → the single `verbs[x] === "conditional"`. The old no-overlap loop was **deleted, not weakened**: overlap is unrepresentable in a map, and it existed only because there were two lists. |
| 2.6 | `cli.integration.test.ts` | Bin-seam whoami test re-pointed, and **strengthened**: it now also asserts `capabilitySchema` and full key-set totality, so a bin build emitting a partial map is caught at the subprocess seam rather than only in-process. |
| 2.7 | `cli.inbox.integration.test.ts` | Pin kept as `toEqual`, **not** downgraded. The map is destructured out; scalars keep the strict `toEqual` (now including `capabilitySchema: 2`), and the map is asserted by key-set equality against the imported `PA_VERB_CLASSIFICATION` plus a positive value assertion. Two hunks only — one import, one expectation object. Nothing at or after `:219`. |
| 2.8 | `docs/how/pij-watchdog.md`, `government/briefs/pa-standup-recipe.md`, `government/briefs/pa-missing-anaconda-2026-07-31.md` | The two-bucket story corrected. The briefs are **standing instructions to live PA seats**: the anaconda brief told a PA to "expect a non-empty `refusedVerbs`", which would now read as a broken gate. Both now instruct reading `verbs.<verb>` directly and explicitly warn against defaulting a missing field. |

**Why removal rather than a derived view.** An additive schema change is silent to a
stale consumer; only a removal is loud. #134 *added* `conditionalVerbs` and left
`refusedVerbs` present and still correct — a probe written 2026-08-01 testing
`'watchdog' in refusedVerbs` kept parsing, kept succeeding, and kept returning a
confident falsehood, because *completeness* is not expressible in the payload. Keeping
the lists beside the map would have shipped a fix for additive-silence **by being
additive**.

**The residual, stated and not papered over.** Removal is loud only for a consumer that
**indexes directly**. One doing `d.get('refusedVerbs', [])` now gets `[]` and concludes
*"nothing is refused"* — silent **and** permissive, the worst direction. No payload shape
fixes this. Removal is still strictly better (before, both the defaulted and the direct
reader were wrong; after, only the defaulted one is), and `capabilitySchema` gives a
careful consumer a deliberate way to detect the change. The code comment says exactly
this and claims nothing more.

### Mutation results (task 2.10)

**All mutations run ON DISK** except A4. Per the fleet census, all three specs involved
(`core/cli.test.ts`, `cli.integration.test.ts`, `cli.inbox.integration.test.ts`) drive the
real bin via `execFileSync`, so the in-memory vite transform cannot reach them — the
false-pass this log records at 2b in Phase 1. `pa-capability.test.ts` is transitively
clean and is the one spec mutated in memory.

Each on-disk row was run through a harness that makes the conditions **structural**:
(0) the named test must PASS on the clean tree first and must actually **run**;
(1) the file must differ from a pre-mutation byte snapshot;
(2) the failure must be an `AssertionError` and **the named test must be among the
failures**; (3) the file must be byte-identical to the snapshot afterwards.

> **Two harness bugs found while building it, both of the "silently green" family.**
> **(a) `vitest -t` is a REGEX, not a substring.** Every one of my test names contains
> `(2.1, AC-10)`, and the unescaped parens matched **nothing** — vitest reported `438
> skipped`, and a gate that asks only *"did anything fail?"* reads *zero tests ran* as
> **green**. **(b) ANSI colour codes sit BETWEEN `Tests` and the count**
> (`Tests \e[22m \e[1m\e[32m1 passed`), so the plain-text pattern that was supposed to
> catch (a) never matched either. Both are the same class as the flake vector the fleet
> named: **a gate that cannot distinguish "nothing ran" from "nothing broke".** The
> harness now escapes the name and strips escapes before asserting anything about output.

| # | Mutation | Target file | Named test expected red | Result | Failure kind | Neighbour |
|---|---|---|---|---|---|---|
| 15 | Drop `close` from the emitted map (`.filter(([verb]) => verb !== "close")`) | `core/cli.ts` | 2.1 PA total map | **RED** — `expected [ …(60) ] to deeply equal [ …(61) ]` | AssertionError | 2.2 green |
| 15b | Same mutant, gated on the 2.7 pin | `core/cli.ts` | 2.7 (`runs whoami through process.execPath…`) | **RED** — same shape, at the BIN seam | AssertionError | — |
| 16 | Re-add `refusedVerbs` beside the map | `core/cli.ts` | 2.2 lists gone (`pa`) | **RED** — `to not have property "refusedVerbs"` | AssertionError | 2.1 green |
| 17 | Emit the map only when `role === "pa"` | `core/cli.ts` | 2.3 non-PA totality | **RED** — `to have property "verbs"` | AssertionError | 2.1 green |
| 18 | Bump the schema marker to `3` | `core/cli.ts` | 2.4 schema marker | **RED** — `expected 3 to be 2` | AssertionError | 2.1 green |

#### Adversarial budget — spent on 2.7, the newest and smallest change in a shared file

2.7 fits the vacuity profile exactly: written last, three lines, under a one-hunk
constraint, in a file another stream owns. A vacuous test is invisible to reading by
construction, so it was attacked rather than re-read. **Each of its three assertions was
mutated independently**, because a pin that passes as a whole can still have one dead
half.

| # | Mutation | Which half of the pin it attacks | Result |
|---|---|---|---|
| A1 | **Add** a bogus key to the emitted map | key-set equality, in the ADDITION direction — mutation 15 only proved removal | **RED** — `expected [ …(62) ] to deeply equal [ …(61) ]` |
| A2 | Drop `capabilitySchema` from the payload | the `toEqual` on the scalars | **RED** — `expected { …(5) } to deeply equal { …(6) }` |
| A3 | Emit real `capability.kind` for a non-PA | the positive value assertion | **RED** — `expected [ 'conditional', 'refuse', 'allow' ] to deeply equal [ 'allow' ]` |
| A4 | **Cross-file**: delete `whoami: ALLOW` from `PA_VERB_CLASSIFICATION` | the *table→reality* half of the chain 2.1/2.7 rely on | **RED** in `pa-capability.test.ts` — `classifies every verb the CORE parser can produce` |
| A5 | Same cross-file deletion, gated on the 2.7 pin | whether the pin can see a table that SHRINKS | **GREEN — correct, see below** |

#### A5 stayed green, and that is an EQUIVALENT MUTANT, not vacuity

This is the Phase 1 A4 lesson reproducing in a new place, so it is recorded rather than
"fixed". Exit-green under mutation has two causes the run cannot distinguish: the test
cannot perceive the change (vacuity), or **the change is not observable from that test**
(equivalent/unreachable mutant). A5 is the second. The pin compares the payload's key set
against `PA_VERB_CLASSIFICATION`, and the payload is **generated from that same table**,
so deleting a row moves **both sides identically**. There is nothing to perceive. That is
the pin *tracking* the table — the precise property the import was chosen for.

**Do not "fix" this by inlining the 63 keys.** A literal would have caught A5, but it is
exhaustive **by transcription**: it pins today's verbs, invites a future author to
downgrade it when it becomes noisy, and — being hand-maintained — drifts from the table
silently. The chain is closed by two independent proofs instead:

- **payload → table** — proven here by 15, 15b, A1, A2, A3.
- **table → reality** — proven by A4, in a different file, by the scrapes in
  `pa-capability.test.ts` that read `core/cli.ts`, the bin, and `core/chores/cli-verbs.ts`.

**The honest residual**: the 2.7 pin **alone** cannot detect a verb disappearing from the
table. A4 shows that gap is covered — but by a different test, in a different file, which
a future author deleting the scrape would not connect to this pin.

### Repository-wide sweep (task 2.8, AC-16)

`rg --hidden -n 'refusedVerbs|conditionalVerbs' --glob '!node_modules' .`

Every remaining hit is deliberate. **No live instruction and no product code refers to
the removed fields.**

| Location | Kind | Verdict |
|---|---|---|
| `core/cli.ts` ×5, `core/cli.test.ts` ×8, `cli.integration.test.ts` ×2, `cli.inbox.integration.test.ts` ×1 | **comments only** — every hit names the removed fields to explain *why* they are gone | Keep. Zero code references remain. |
| `docs/how/pij-watchdog.md` ×2, `government/briefs/pa-missing-anaconda-2026-07-31.md` ×1 | corrected text that names the old fields to say they are **gone** | Keep — that is the correction. |
| `docs/plans/084-pa-gate-repair/**` (the-flow.json, the-flow.md, evidence, execution.log) | historical record of the flight that ADDED `conditionalVerbs` | Keep as written. |
| `docs/plans/094-capability-surface/**` (plan, dossier, this log) | the plan and its evidence | Keep as written. |

### Gates (Phase 2)

```
just typecheck   → clean
just lint        → 0 errors · 9 warnings · 1 info  (byte-identical to the `main` baseline)
just test        → 210 files passed, 4 skipped · 4076 tests passed, 19 skipped, 0 failed
```

`just lint` initially reported 2 formatting errors, both in files I had just edited
(`core/cli.test.ts`, `cli.integration.test.ts`). `biome check --write` was run **on those
two paths only**, never repo-wide: an autofix sweeping `cli.inbox.integration.test.ts`
would rewrite a neighbouring stream's lines as "formatting", which is the kind of boundary
violation that gets committed unnoticed. The shared file's diff was inspected after
linting and is exactly two hunks — the import at `:20` and the expectation object — with
nothing at or after `:219`.

### Task 2.11 (fix packet s094-F1) — the scrape's dependency, recorded where the scrape is

Added after `bcd0649`: the reviewer found the plan and the code disagreed, because task
2.11 was added to the plan after that commit. The gap is real and was named in my Phase 2
report as the honest residual of choosing the import over a 63-key literal.

**The gap.** The exhaustiveness pin in `cli.inbox.integration.test.ts` compares the
payload's key set against `PA_VERB_CLASSIFICATION`, and the payload is **generated from
that same table** — so deleting a row moves both sides identically and the pin stays
green. It is blind to table **shrinkage** by construction. Adversarial mutation **A5**
proved this (correctly green — an equivalent mutant), and **A4**, the same deletion,
turned the scrape in `pa-capability.test.ts` red. The scrapes are therefore the **only**
table→reality proof in the repository, and nothing else can be: every other consumer of
the table reads the table.

**The risk being closed** is not a code defect but a plausible future edit: an author
removing the scrapes as redundant, reasoning that the pin already checks exhaustiveness.
That deletes the half that watches the world, keeps the half that only watches itself, and
leaves a green suite. The comment now sits at the scrape functions, states that they are
the only such proof, names the pin that depends on them, and says plainly what deleting
them costs.

**No mutation is recorded for this task, deliberately.** The change is a comment; it has
no behavioural criterion, and inventing one would be theatre. Its value is that it is
read at the moment someone considers deleting the scrape, which no test can assert.
Re-ran the gates instead to confirm the comment broke nothing.

```
just typecheck   → clean
just lint        → 0 errors · 9 warnings · 1 info  (main baseline)
just test        → 210 files passed, 4 skipped · 4076 tests passed, 19 skipped, 0 failed
```

---

## POST-REBASE RE-PROOF — 2026-08-08, after rebase onto `origin/main`

**Kept separate from the authoring-time proof above, deliberately.** The fail-first
evidence in the sections above was established against the **pre-rebase** tree and nothing
re-runs it. *Still-present* and *still-load-bearing* are different claims, and only the
first survives a rebase for free.

**What moved.** `main` advanced 6 commits. The change that matters is **inside**
`paBinRefusal` in the bin: `const home = process.env.PIJ_HOME ?? join(homedir(), ".pij")`
became `resolvePijHome()` — the home resolution that every bin-seam criterion in this
stream depends on, since a PA's descriptor must be *found* before the gate can key on its
role. A refactor there that failed to resolve would leave the gate **fail-open**, and the
suite would stay green because a permitted verb is exactly what an absent gate produces.

**Why the green suite was not sufficient evidence.** The `close` control passing is
positive evidence that the gate fires *at all* — a refusal test cannot pass unless the
gate acts. It says nothing about whether the gate is consulted **per subverb**, which is
the property `chore add` rests on. Only a mutation can distinguish those.

### Rows re-proven, all ON DISK, all `--expect` enforced by reading the output

| # | Mutation | Named test expected red | Result | Failure kind | Neighbour |
|---|---|---|---|---|---|
| **2b** | `"chore add": ALLOW` → `refuse(...)` in `pa-capability.ts` | `lets a PA` `chore add` `THROUGH THE REAL BIN` | **RED** | AssertionError | `still refuses a FLATLY refused verb at the bin seam` — green |
| **14** | `if (cmd.forSeat !== undefined)` → `if (false)` | `refuses --for to a PA through the bin` | **RED** — `expected +0 not to be +0` | AssertionError | `lets a PA watch and unwatch its own parent THROUGH THE REAL BIN` — green |
| **15b** | Drop `close` from the emitted `verbs` map | `runs whoami through process.execPath and the tsx entrypoint without tmux` | **RED** — `[ …(60) ] to deeply equal [ …(61) ]` | AssertionError | — |

All three: target verified changed against a byte snapshot, failure verified to be an
`AssertionError` rather than a build error, tree verified byte-identical afterwards, and
the named test verified to have **run and passed** on the clean tree first.

**2b's red is stronger than a bare red, and this is the part that answers the rebase
question.** The failure message carried the mutant's **own refusal text** all the way out
through the real bin:

```
AssertionError: bin refused a permitted chore add: E-OWN: 'chore add' is not available
to a PA — refused by role 'pa' (field: orchestrationRole): POST-REBASE RE-PROOF:
reverted to the pre-plan-094 classification. Run 'pij whoami --json' …
```

A string invented for this mutation, read out of the table by the bin, in a subprocess,
after `resolvePijHome()` resolved the sandbox home and found the PA descriptor. That is
not "something went red" — it is the **whole path** demonstrated end to end: home
resolution → descriptor lookup → role projection → `paCapabilityVerb(top, argv[3])`
subverb mapping → table consultation → refusal render. The bin-seam criteria have not
merely survived the rebase; they are proven load-bearing on the rebased tree.

**14 is the weaker red of the three, and it is recorded as such.** `expected +0 not to be
+0` is a bare exit-code assertion — it proves the command was refused, not *why*. It is
adequate here only because its green neighbour (`watch`/`unwatch` on its own parent
through the same bin) rules out the trivially-refusing gate.

### Gates on the rebased tree

```
just typecheck   → clean
just lint        → 0 errors · 9 warnings · 1 info  (main baseline; 470 files, up from 469)
just test        → 211 files passed, 4 skipped · 4107 tests passed, 19 skipped, 0 failed
```

Counts rose (4076 → 4107 tests, 210 → 211 files) because `main` brought siblings' tests
in. `git status --short` is clean.
