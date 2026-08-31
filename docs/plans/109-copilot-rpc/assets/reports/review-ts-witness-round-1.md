# Review round 1 — u-ts-witness (plan 109)

**Head:** `s109/ts-witness` = `d552564f` "test(pij): align witnesses with daemon
cutover". Reviewed 2026-08-31T03:5x–04:0xZ in my own detached worktree
`pij-worktrees/s109-rev-ts` (`npm ci`, exit 0). Coder's worktree untouched.

Falsifiers pre-registered at `4ddaabe4` **with contamination disclosed**: the
dispatch summarised the receipt's claims at me before I could register anything, so
I aimed the falsifiers at those claims rather than pretend they had not reached me.

---

## VERDICT: REFUSE — on T1, which is one line, and contrary to an explicit packet ruling.

Everything else on the contract passes, and several parts pass unusually well. The
receipt is honest, the causal claim is **demonstrated rather than asserted**, and I
reproduced it independently.

---

## T1 — MEDIUM. The packet ruled *"assert on the payload"*; the diff asserts on nothing.

The packet (`a0068d1e`, written **before** the run) ruled:

> `cli-learning.test.ts` asserts stdout is exactly empty and receives npm's
> `min-release-age` warning. **Assert on the payload, not on the absence of noise**
> — an assertion that fails when an unrelated tool prints a warning is measuring
> the environment.

The diagnosis is right: `runCli` is `spawnSync("npx", ["tsx", …])`
(`cli-learning.test.ts:15`), so npx noise on stderr is environmental and asserting
`stderr === ""` measures the environment.

**But the remedy was to re-point the assertion at the payload, and the diff removes
it.** `git show d552564f -- skills/flow-pair/test/cli-learning.test.ts` is a single
deletion and nothing added:

```
-		expect(r.stderr).toBe("");
```

### Why this is above trivial

The file's stderr contract was a **pair**, and the diff kept one half:

| line (parent) | assertion | after |
|---|---|---|
| `:106` | `expect(r.stderr).toBe("")` — silent on success | **deleted** |
| `:172` | `expect(r.stderr).toMatch(/cluster/)` — names the problem on failure | kept, now `:171` |

The surviving line proves stderr **is** a checked contract in this file — and it
proves the ruled remedy was already in use **eleven lines away in the same
`describe`**. `toMatch` tolerates npx noise by construction, which is exactly why
the error-path test never failed. The payload-shaped assertion the packet asked for
did not have to be invented; it had to be copied.

**What the test can no longer notice:** anything on stderr on the success path — an
`npm ERR!`, a stack trace, the CLI printing a real error while still exiting 0 and
printing the right stdout. The `status`, `stdout` and file-list assertions all
survive, which is why this is MEDIUM and not high.

**Credit where it is due:** the receipt says so plainly — *"removed the assertion
that subprocess stderr is exactly empty"* (`:28`), with the surviving assertions
enumerated. No euphemism, no "relaxed", no "tolerated". This is a finding about the
remedy, not about candour.

**One line closes it**, e.g. `expect(r.stderr).not.toMatch(/ERR!|Error:/)`, or the
`toMatch` shape already in the file.

## T2 — MEDIUM, RAISED FOR A RULING RATHER THAN AS A BLOCKER. One bug, three files, fixed in one.

`observe.test.ts` gained the retry in all three teardowns. The identical unretried
call remains in the two files the receipt fences out as still-red:

```
.pi/extensions/pij/adapters/git-repository.test.ts:32
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
.pi/extensions/pij/core/chores/drive.test.ts:79
	rmSync(root, { recursive: true, force: true });
```

Same call, same options, same failure mode, same one-line fix — and the receipt
(`:37`) names those two files as the ENOTEMPTY teardowns keeping the gate red.

**On whether the fence covers them:** the packet's *Out of scope* is *"Rust,
`crates/**`, the plan documents, and anything on another seat's branch"*. These two
files are none of those. They are simply not in the two-file *Also in scope* list.
So this is a genuine gap between "not enumerated" and "excluded", and it is the
PM's to rule, not mine to demand. **I am not blocking on it.**

I checked the obvious over-reach: the repo has **170** unretried `rmSync` call
sites in test files, so "fix them all" is not the ask. The two that are *currently
red for this exact reason* are the ones that matter for the release.

## T3 — LOW, informational. Two different runs, two different numbers.

Receipt `:34`: *"5 files, 42 tests passed"*, over `index.test.ts`,
`daemon-http.test.ts`, `rust-runtime.test.ts`, `cli-learning.test.ts`,
`observe.test.ts`.

Mine, over the **three changed files**, unfiltered, redirected to a file, exit code
from the runner:

```
npx vitest run .pi/extensions/pij/index.test.ts \
  skills/flow-pair/test/observe.test.ts \
  skills/flow-pair/test/cli-learning.test.ts
EXIT=0
 Test Files  3 passed (3)
      Tests  33 passed (33)
```

Not a contradiction — a different selection. Recorded with both commands so the
numbers can be joined rather than compared, which is the habit this plan bought
after a `| head` turned a SIGPIPE into a red that did not exist.

---

## The causal claim: DEMONSTRATED, and I reproduced it independently

This is the receipt's central claim and the licence for every expectation change in
the diff, so I ran the discriminator myself rather than accept the trace.

**Arm A** — the parent's unmodified test file, environment as production leaves it:

```
Test Files  1 failed (1)
     Tests  10 failed | 1 passed (11)
```

**Arm B** — the same unmodified file, with only `PIJ_DAEMON_GENERATION=legacy`:

```
Test Files  1 passed (1)
     Tests  11 passed (11)
```

Three things follow, and all three were falsifiers I registered:

- **TF6, the count.** Exactly **ten**. Re-derived at the parent, not taken from the
  receipt.
- **TF5, the causation.** Setting the ruled forceback makes all ten vanish. The
  attribution to `acb1399a`'s default-`rs` selection is **shown**, not argued —
  a two-armed discriminator where both arms produce a positive artifact.
- **TF1, "expectations unchanged".** This is the cleanest possible proof of it:
  **the parent's assertions pass verbatim, 11/11, with nothing edited and only the
  generation pinned.** The unit's change is per-suite equivalent to arm B.

## The forceback replaced a mechanism that was ALREADY DEAD — nothing was moved or lost

The old `beforeEach` wrote `daemon.lock` and its comment claimed *"its live
discriminator is the TS daemon lock"*. **That comment was stale.**
`detectDaemonGeneration` (`adapters/daemon-http.ts:77-83`) never reads
`daemon.lock`; selection is `PIJ_DAEMON_GENERATION` explicit, else `"rs"` with no
fallback (`:67-75`, *"req-0019: explicit generation wins; absence cuts over to Rust
with no fallback"*).

So the lock file selected nothing after `acb1399a`, and the swap to the env var
did **not** delete coverage of "lock ⇒ legacy" — that behaviour no longer exists.
I went looking for the moved-not-deleted gap and there is none.

## The two new tests are WITNESSES — both demonstrated red, with distinct signatures

TF10 was the requirement that a test-only unit's new tests be shown capable of
failing. Two mutations of `index.ts`, each applied alone and reverted:

| mutation | result |
|---|---|
| **N1** drop the ` · rs-v1` suffix (`index.ts:322` → `setStatus(KEY, self)`) | **RED**, 1 failed \| 12 passed — `expected 'pij-stingy-weasel' to match /^pij-[a-z]+(-[a-z]+)* · rs-v1$/` at `index.test.ts:215` |
| **N2** publish the pij status under OMP too (`:321-322`) | **RED**, 1 failed \| 12 passed — `expected true to be false` at `index.test.ts:232` |

Each mutation reddened **exactly the one new test it targets** and nothing else, so
neither is green from birth and neither defends an adjacent property.

---

## CHECKED AND NOT RAISED

- **The fence was drawn BEFORE the run.** The packet `a0068d1e` names both
  flow-pair files, names the ENOTEMPTY problem, and rules the remedy in advance.
  TF7 was my highest-suspicion falsifier — *a boundary that exactly circumscribes
  the failures it excuses* — and it is clean: the scope predates the failures.
- **The ENOTEMPTY retry is a BRAKE, not a policy.** Ask what removing it does:
  teardown fails *sooner* on a transient race and never removes more. It is
  `fs.rmSync`'s own bounded contract — `maxRetries: 3, retryDelay: 100`, so ≤300ms
  — and a **persistent** ENOTEMPTY still throws, which still fails the suite. This
  is the AGENTS.md directional test and it passes; it is the correct shape and I
  tried to fault it.
- **The negative-by-absence assertion is guarded.**
  `expect(statuses.some(s => s.key === "pij")).toBe(false)` would pass vacuously if
  `session_start` never ran — but `expect(sessionNames.at(-1)).toMatch(…)` runs
  **first** and fails on `undefined`. A positive artifact gates the negative one.
  Given this branch's own `56914a0a` (*"a negative asserted by a timeout passes
  because the timeout elapsed"*), I looked hard at this and the ordering is right.
- **The new tests state their own boundary.** *"daemon-http.test.ts owns the
  default-selection policy; this assertion owns index.ts's UI wiring after that
  policy selects Rust."* They mock `detectDaemonGeneration` and say so, rather than
  appearing to test selection. Ownership named, not assumed.
- **Default-`rs` coverage still exists** where the comment says it does:
  `daemon-http.test.ts:48` asserts the preference, `:95-105` asserts explicit
  legacy selects without probing Rust.
- **No product code in the diff.** Four paths: three test files and the receipt.
  TF12 clean.
- **The ten-failure table gives per-row authority and disposition**, which is what
  the packet demanded — assertion, old behaviour, new behaviour, authorising
  commit, and whether the test was edited or a finding filed. Ten rows for ten
  failures; none merged.
- **The receipt discloses its own controlled probe** (`:33`) — the same
  discriminator I ran, reported with its command. That it matched my independent
  run is the reason I trust the rest of the table.
- **`harness checks` is bounded, not dressed as green** (`:37`), with the red
  named and located.

## MY OWN CONDUCT

No instrument errors this round. Nine disclosed across this plan, none reaching a
verdict. Every number above is quoted with its command and its exit code, and every
mutation red with its assertion message — the habit this plan adopted after an exit
code alone was wrong three times on unit 1.

**Tree restored**: both mutations reverted with `git checkout --`;
`git status --porcelain` empty. The parent test file I copied in for the
discriminator was reverted the same way.

---

## WHAT MOVES THIS TO APPROVE

**T1 only** — restore a payload-shaped stderr assertion on the success path, the
shape already living at `cli-learning.test.ts:171`. I will re-run the three changed
files unfiltered and check the new assertion can fail by feeding it a stderr that
contains an error.

**T2 needs a ruling, not work from me**: fix the two out-of-fence files with the
same one-line retry, or state that they stay red into the release and why. Either
is fine; silence is not, because the gate is red for a reason this unit already
knows how to fix.
