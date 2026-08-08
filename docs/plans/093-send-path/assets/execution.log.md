# Execution log — plan 093 phase 1

Procedural rule from the plan's testing strategy (and from the independent
review's sharpest point): *"A mutation comment is not evidence that they went RED
without the fix."* So every guard below was written first, run against the
**unmodified** tree, and the **actual failure output** pasted here **before** any
implementation existed. Then implemented, then re-run for the GREEN line.

Worktree: `/Users/jordanknight/pi-hacking/pij-worktrees/s093-send-path` (branch `s093/send-path`).
Runner: `npx vitest run <spec> --reporter=dot`.

Note on assertion ORDER: in every refusal test the `delivery.outbox` length
assertion is deliberately the **first** assertion in the test. Vitest stops at the
first failure, so putting the exit-code check first would have hidden the only
assertion that actually distinguishes *"refused"* from *"delivered, then
complained"*. The RED output below is therefore the outbox assertion itself.

---

## RED — before implementation

### 1. `core/cli.test.ts` — the empty-payload guard (AC-01/02/03/04/07)

Command:

```
npx vitest run .pi/extensions/pij/core/cli.test.ts -t "plan 093" --reporter=dot
```

Result: **7 failed | 3 passed** (exit 1). Verbatim:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 7 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  .pi/extensions/pij/core/cli.test.ts > dispatch send > send: empty-payload guard (plan 093, pij#132) > AC-01: attachment-only to a PUSH target is refused with E-EMPTY and nothing is delivered
AssertionError: expected [ { messageId: 'fake-1', …(1) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ .pi/extensions/pij/core/cli.test.ts:808:30
    806|    // outbox grows by one here. An exit-code assertion alone would sti…
    807|    // pass for a code that delivered the message and complained afterw…
    808|    expect(d.delivery.outbox).toHaveLength(before);
       |                              ^
    809|    expect(r.exitCode).toBe(2);
    810|    expect(r.stderr).toContain("E-EMPTY");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/7]⎯

 FAIL  .pi/extensions/pij/core/cli.test.ts > dispatch send > send: empty-payload guard (plan 093, pij#132) > AC-02: an explicit empty text body is refused identically (flag shape is irrelevant)
AssertionError: expected [ { messageId: 'fake-1', …(1) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ .pi/extensions/pij/core/cli.test.ts:821:30
    819|    const r = dispatch({ verb: "send", to: "w3", text: "", wait: false,…
    820|
    821|    expect(d.delivery.outbox).toHaveLength(0);
       |                              ^
    822|    expect(r.exitCode).toBe(2);
    823|    expect(r.stderr).toContain("E-EMPTY");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/7]⎯

 FAIL  .pi/extensions/pij/core/cli.test.ts > dispatch send > send: empty-payload guard (plan 093, pij#132) > AC-02: an empty text body to a PULL target is refused too (no attachment to carry it)
AssertionError: expected [ { messageId: 'fake-1', …(1) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ .pi/extensions/pij/core/cli.test.ts:831:30
    829|    const r = dispatch({ verb: "send", to: "w3", text: "", wait: false,…
    830|
    831|    expect(d.delivery.outbox).toHaveLength(0);
       |                              ^
    832|    expect(r.exitCode).toBe(2);
    833|    expect(JSON.parse(r.stderr)).toMatchObject({ error: "E-EMPTY" });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/7]⎯

 FAIL  .pi/extensions/pij/core/cli.test.ts > dispatch send > send: empty-payload guard (plan 093, pij#132) > AC-03: the guard lives in dispatch, so a direct caller inherits it (no receipt emitted)
AssertionError: expected [ { messageId: 'fake-1', …(1) } ] to have a length of +0 but got 1

- Expected
+ Received

- 0
+ 1

 ❯ .pi/extensions/pij/core/cli.test.ts:841:30
    839|    const r = dispatch({ verb: "send", to: "w3", text: "", wait: false,…
    840|
    841|    expect(d.delivery.outbox).toHaveLength(0);
       |                              ^
    842|    expect(r.stdout).toBe("");
    843|    expect(r.follow).toBeUndefined();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/7]⎯

 FAIL  .pi/extensions/pij/core/cli.test.ts > dispatch send > send: empty-payload guard (plan 093, pij#132) > AC-04: broadcast refuses an empty text body before ANY target is delivered to
AssertionError: expected [ { messageId: 'fake-1', …(1) }, …(1) ] to have a length of +0 but got 2

- Expected
+ Received

- 0
+ 2

 ❯ .pi/extensions/pij/core/cli.test.ts:865:30
    863|    );
    864|
    865|    expect(d.delivery.outbox).toHaveLength(0);
       |                              ^
    866|    expect(r.exitCode).toBe(2);
    867|    expect(r.stderr).toContain("E-EMPTY");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/7]⎯

 FAIL  .pi/extensions/pij/core/cli.test.ts > dispatch send > send: empty-payload guard (plan 093, pij#132) > AC-04: broadcast with an empty text body is also refused at parse
AssertionError: expected { ok: true, …(1) } to match object { ok: false, code: 'E-EMPTY' }
(9 matching properties omitted from actual)

- Expected
+ Received

  {
-   "code": "E-EMPTY",
-   "ok": false,
+   "ok": true,
  }

 ❯ .pi/extensions/pij/core/cli.test.ts:871:64
    869|
    870|   it("AC-04: broadcast with an empty text body is also refused at pars…
    871|    expect(parseArgs(["send", "--to", "w3", "--to", "z9", ""])).toMatch…
       |                                                                ^
    872|     ok: false,
    873|     code: "E-EMPTY",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/7]⎯

 FAIL  .pi/extensions/pij/core/cli.test.ts > dispatch send > send: empty-payload guard (plan 093, pij#132) > AC-07: text + an unrenderable attachment delivers the text and SAYS the reference was dropped
AssertionError: expected '' to contain '/tmp/chart.png'

- Expected
+ Received

- /tmp/chart.png

 ❯ .pi/extensions/pij/core/cli.test.ts:919:25
    917|    expect(d.delivery.outbox).toHaveLength(1);
    918|    expect(d.delivery.outbox[0]?.message).toMatchObject({ body: "see th…
    919|    expect(human.stderr).toContain("/tmp/chart.png");
       |                         ^
    920|    expect(human.stderr).toContain("cannot render attachments");
    921|    // AC-13: the warning names the safe path too.

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/7]⎯


 Test Files  1 failed (1)
      Tests  7 failed | 3 passed | 417 skipped (427)
```

Read that RED literally: **the message went out**. `fake-1` is in the outbox for
every refusal case, and the broadcast case delivered to **both** targets. That is
issue #132 reproduced as a failing assertion rather than described in prose.

The **3 passed** are the regression controls (AC-05 `--command` exemption, AC-06
attachment-only to a *pull* target, AC-07 no-warning-for-a-capable-target). They
pass before the fix and must still pass after it — they are the tripwire for a
guard written as a global "refuse empty bodies", which would delete the shipped
Plan-026 telegram capability.

### 2. `body-file.integration.test.ts` — the literal body channel (AC-08/09/10/11)

Command:

```
npx vitest run .pi/extensions/pij/body-file.integration.test.ts --reporter=dot
```

Result: **5 failed** (exit 1). Verbatim:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  .pi/extensions/pij/body-file.integration.test.ts > pij send --body-file (the literal body channel) > AC-08/09: a hostile body from a file arrives byte-for-byte and is never lexed as argv
AssertionError: expected { code: 64, stdout: '', …(1) } to match object { code: +0, stderr: '' }
(1 matching property omitted from actual)

- Expected
+ Received

  {
-   "code": 0,
-   "stderr": "",
+   "code": 64,
+   "stderr": "E-ARG: unknown flag --wait 500 this line must arrive as TEXT, not as a flag value
+ backticks: `echo pwned` and substitution: $(echo pwned) and ${HOME}
+ quotes: 'single' \"double\" and a semicolon ; here
+ --json is also not a flag when it lives in the body
+ trailing spaces follow this arrow → for 'send'
+ ",
  }

 ❯ .pi/extensions/pij/body-file.integration.test.ts:138:19
    136|    });
    137|
    138|    expect(result).toMatchObject({ code: 0, stderr: "" });
       |                   ^
    139|    // Byte-for-byte. `trimEnd()` makes this RED on the trailing spaces…
    140|    // the two trailing newlines; argv re-lexing makes it RED on line 1.

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  .pi/extensions/pij/body-file.integration.test.ts > pij send --body-file (the literal body channel) > AC-09: --wait BEFORE --body-file cannot swallow the file's contents
AssertionError: expected 64 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 64

 ❯ .pi/extensions/pij/body-file.integration.test.ts:161:24
    159|    });
    160|
    161|    expect(result.code).toBe(0);
       |                        ^
    162|    expect(deliveredTo(receiver).body).toBe(HOSTILE_BODY);
    163|   },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  .pi/extensions/pij/body-file.integration.test.ts > pij send --body-file (the literal body channel) > AC-10: --body-file - reads stdin, so a heredoc is a single literal command
AssertionError: expected { code: 64, stdout: '', …(1) } to match object { code: +0, stderr: '' }
(1 matching property omitted from actual)

- Expected
+ Received

  {
-   "code": 0,
-   "stderr": "",
+   "code": 64,
+   "stderr": "E-ARG: unknown flag --wait 500 this line must arrive as TEXT, not as a flag value
+ backticks: `echo pwned` and substitution: $(echo pwned) and ${HOME}
+ quotes: 'single' \"double\" and a semicolon ; here
+ --json is also not a flag when it lives in the body
+ trailing spaces follow this arrow → for 'send'
+ ",
  }

 ❯ .pi/extensions/pij/body-file.integration.test.ts:179:19
    177|    );
    178|
    179|    expect(result).toMatchObject({ code: 0, stderr: "" });
       |                   ^
    180|    expect(deliveredTo(receiver).body).toBe(HOSTILE_BODY);
    181|   },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  .pi/extensions/pij/body-file.integration.test.ts > pij send --body-file (the literal body channel) > AC-08: --body-file combined with --command is an explicit error
AssertionError: expected 'E-ARG: pij send takes a <text> OR --c…' to contain '--body-file'

- Expected
+ Received

- --body-file
+ E-ARG: pij send takes a <text> OR --command <name>, not both
+

 ❯ .pi/extensions/pij/body-file.integration.test.ts:196:25
    194|
    195|   expect(result.code).toBe(64);
    196|   expect(result.stderr).toContain("--body-file");
       |                         ^
    197|   expect(result.stderr).toContain("--command");
    198|  });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  .pi/extensions/pij/body-file.integration.test.ts > pij send --body-file (the literal body channel) > AC-11: `pij send --help` shows the safety guidance it documents
AssertionError: expected '  pij send <id> "<text>" | <id> --bod…' to contain 'substitutes in YOUR shell'

- Expected
+ Received

- substitutes in YOUR shell
+   pij send <id> "<text>" | <id> --body-file <path|-> | --to <id> --to <id> "<text>" | <id> --command <name> [--wait]
+

 ❯ .pi/extensions/pij/body-file.integration.test.ts:211:25
    209|   // silently dropped — including the ONLY shell-safety note pij print…
    210|   expect(result.stdout).toContain("--body-file");
    211|   expect(result.stdout).toContain("substitutes in YOUR shell");
       |                         ^
    212|   // `--file` is documented distinctly from `--body-file` (they are one
    213|   // letter apart with opposite semantics — the #132 misuse).

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  1 failed (1)
      Tests  5 failed (5)
```

Three things are visible in that first stderr, and none of them were guesses:

1. **The body was lexed as argv.** `E-ARG: unknown flag --wait 500 this line must
   arrive as TEXT…` — the file's first line became a *flag name* (KF-8). The safe
   channel is not merely lossy; for a `--`-leading body it does not deliver at all.
2. **`trimEnd()` ate the trailing bytes.** The echoed body ends
   `trailing spaces follow this arrow →` — the trailing spaces and both trailing
   newlines are gone before the error was even printed (KF-7).
3. **The AC-11 failure is the whole `pij send --help` output**, and it is a single
   line: the indented continuation carrying the only shell-safety note pij ships
   was filtered out (KF-9). `--help` could not show the guidance no matter what
   the USAGE text said.

---

## GREEN — after implementation

### 1. `core/cli.test.ts` — the empty-payload guard

```
npx vitest run .pi/extensions/pij/core/cli.test.ts -t "plan 093" --reporter=dot
```

```
 Test Files  1 passed (1)
      Tests  11 passed | 417 skipped (428)
```

All 7 previously-RED cases pass, and the 3 regression controls (AC-05/06/07-capable)
still pass — the guard did not over-fire. The 11th is AC-12 (the spawn boot message),
added after the first RED run; see the note under the criterion table.

### 2. `body-file.integration.test.ts` — the literal body channel

```
npx vitest run .pi/extensions/pij/body-file.integration.test.ts --reporter=dot
```

```
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

### Per-criterion RED → GREEN

| AC | Guard | RED evidence (pre-fix) | GREEN |
|---|---|---|---|
| AC-01 | attachment-only to a push target refused | `expected [ { messageId: 'fake-1', … } ] to have a length of +0 but got 1` | pass |
| AC-02 | keys on emptiness, not flag shape (push **and** pull) | same outbox growth, both modes | pass |
| AC-03 | guard in `dispatch`, no receipt | outbox 1; `stdout` carried a full `receipt:"delivered"` payload | pass |
| AC-04 | broadcast refuses before any delivery | `to have a length of +0 but got 2` (both targets delivered) | pass |
| AC-04 | broadcast refused at parse too | `expected { ok: true } to match { ok: false, code: 'E-EMPTY' }` | pass |
| AC-05 | `--command` exempt | *control — passed before and after* | pass |
| AC-06 | attachment-only to a pull target still delivers | *control — passed before and after* | pass |
| AC-07 | warn on an unrenderable attachment | `expected '' to contain '/tmp/chart.png'` | pass |
| AC-07 | no warning for a capable target | *control — passed before and after* | pass |
| AC-08 | byte-for-byte body | body echoed back with trailing spaces/newlines already stripped | pass |
| AC-09 | body never lexed as argv | `E-ARG: unknown flag --wait 500 this line must arrive as TEXT…` | pass |
| AC-09 | `--wait` cannot swallow the body | exit `64` | pass |
| AC-08 | `--body-file` + `--command` is explicit | generic `takes a <text> OR --command` message, naming neither flag the caller used | pass |
| AC-10 | `--body-file -` (stdin) literal | same argv-lexing failure via stdin | pass |
| AC-11 | `pij send --help` shows the guidance | help output was one line; the safety note was filtered out | pass |

AC-13 (every refusal and warning names the safe path) is asserted inside the AC-01
and AC-07 cases above. AC-14 is this document.

**AC-12 — where its test lives, and why.** The natural home for an assertion about
`buildInitInjection` is `core/harness/claude.test.ts`, which is **outside this
change's allowed scope** this wave. Rather than breach the fence, the assertion was
added to `core/cli.test.ts` (in scope), importing the real function directly — the
subject under test is unchanged, only the file it is asserted from. It is listed as
a *convention deviation* here so a reviewer meets it as a decision rather than as a
misplaced test.

For the same fence reason the boot-message change is **additive**: the existing
`claude.test.ts` case pins `pij send pij-parent "<text>"`, and that string is
preserved. That is also the right behaviour — the quoted form is correct for text the
peer authors itself; what was missing was the safe form for text it *relays*.

---

## Full gates

```
just typecheck   →  tsc --noEmit, clean
just lint        →  biome check ., exit 0 (the changed files add no warnings of their own)
just test        →  Test Files  211 passed | 4 skipped (215)
                    Tests  4056 passed | 19 skipped (4075)
harness checks --quick
                 →  local-paths pass · typecheck pass · lint pass · test pass
                    windows-compat pass · smoke skipped (--quick) · pkg-audit pass
                    snapshots pass          →  status ok
```

### One finding outside this change's scope (charter: report, do not fix)

`E-EMPTY` had to be added to a **second** exhaustive exit map the plan did not name:
`ORCHESTRATION_EXIT` in `.pi/extensions/pij/core/orchestration/cli.ts:111`
(`Record<OrchestrationErrorCode, …>`, and `OrchestrationErrorCode = BatonErrorCode |
PijErrorCode`). The plan's KF-11 named only `core/cli.ts:665-678`. The typecheck gate
caught it immediately and named it precisely — which is exactly what an exhaustive map
is for — so the cost was one line, not a defect. Recorded because the edit is outside
the declared fence and a reviewer should meet it deliberately.

### Two pre-existing test flakes, verified NOT caused by this change

The first full-suite run showed two failures; both are load/concurrency artefacts, and
both were falsified as mine before being dismissed:

1. `.pi/extensions/pij/cli.integration.test.ts` — `spawn` exited **143** (SIGTERM).
   That is the integration helper's own hard `timeout: 10_000` on `execFileSync`
   firing, which `vitest.config.ts`'s `testTimeout` note does **not** cover. Passed on
   a targeted re-run and on the next full run.
2. `skills/flow-pair/test/{identity,observe}.test.ts` — `ENOTEMPTY … .git/ai` while
   removing a temp fixture repo. Each file passes alone and fails when the two run
   together.

For (2) the check that matters: **the same failure reproduces in the untouched main
checkout** (`/Users/jordanknight/pi-hacking/pij`, which contains none of this work),
so it is pre-existing cross-file interference in the flow-pair specs, not a regression
here. This change touches no file under `skills/`. The clean full run
(`211 passed`, `4056 tests`) and the green `harness checks` above are the authoritative
gate results.

---

## Wave 2 — the cross-model review fix (F1, F2)

`gpt-5.6-terra` reviewed `ead905e` and returned FIX_REQUIRED with two findings. Its
Dim-0 mutation held (mutating `targetRendersAttachments` to `return true` produced 2
failures, restored clean), so the guard was load-bearing — these are **gaps in reach**,
not defects in the mechanism.

The reviewer also made a fair procedural point: the wave-1 RED evidence below is
credible but its **chronology cannot be independently verified**, because tests,
implementation and log all landed in one commit. So this wave splits them: the failing
tests are commit **1**, the fix is commit **2**, and the ordering is a fact in
`git log` rather than a claim in this file.

### F1 — a whitespace-only body slipped the guard

The first cut tested `body === ""`, which is the *shape* of the defect rather than the
defect. `pij send peer "$(cat notes)"` against a blank or newline-only file yields
`"\n"`; a pushed peer then receives `[pij from a1] ` behind a success receipt — the
dishonest receipt this plan exists to close, reached by a completely ordinary command.

The rule that keeps the fix from becoming the bug it replaced: **the emptiness TEST
trims; the DELIVERED BODY never does.** AC-08 (byte-for-byte) still governs, so
`"  hello  "` must arrive with both pads intact. Two `F1 preserved:` cases assert
exactly that, and a third asserts AC-06 survives (whitespace body + attachment to a
PULL target still delivers — capability, not flag shape).

### F2 — no broadcast coverage for the bin's flag-valence mirror

`cli.ts:~4264` keeps its own copy of which send flags are valued, because core's tables
are module-private and the body placeholder cannot be positioned without them. It
agreed with core, and had no test. Broadcast (`--to a --to b`, no target-id positional)
is the shape that exercises it hardest and had zero real-bin coverage.

### RED — recorded against the pre-fix tree, BEFORE the fix commit

`npx vitest run .pi/extensions/pij/core/cli.test.ts -t "F1"`
→ **`Tests  6 failed | 11 passed | 420 skipped`**

Every refusal case asserts the outbox FIRST, on purpose: an exit-code assertion alone
would still pass for a build that delivered the message and complained afterwards.

```
× F1: spaces-only text to a PUSH target is refused, and nothing is delivered
    AssertionError: expected [ { messageId: 'fake-1', …(1) } ] to have a length of +0 but got 1
    ❯ core/cli.test.ts:1016  expect(d.delivery.outbox).toHaveLength(0);

× F1: a newline-only body — the `"$(cat blank-file)"` case — is refused on a PULL target
    AssertionError: expected [ { messageId: 'fake-1', …(1) } ] to have a length of +0 but got 1
    ❯ core/cli.test.ts:1026  expect(d.delivery.outbox).toHaveLength(0);

× F1: mixed whitespace (tabs, CR, newlines) is refused too
    AssertionError: expected [ { messageId: 'fake-1', …(1) } ] to have a length of +0 but got 1
    ❯ core/cli.test.ts:1039  expect(d.delivery.outbox).toHaveLength(0);

× F1: a whitespace-only body with an UNRENDERABLE attachment is refused (AC-01 extended)
    AssertionError: expected [ { messageId: 'fake-1', …(1) } ] to have a length of +0 but got 1
    ❯ core/cli.test.ts:1058  expect(d.delivery.outbox).toHaveLength(0);

× F1: broadcast refuses a whitespace-only body before ANY target is delivered to
    AssertionError: expected [ { messageId: 'fake-1', …(1) }, …(1) ] to have a length of +0 but got 2
    ❯ core/cli.test.ts:1082  expect(d.delivery.outbox).toHaveLength(0);
      (got 2 — the fan-out completed. Both peers were told something that was nothing.)

× F1: broadcast with a whitespace-only body is also refused at parse
    AssertionError: expected { ok: true, …(1) } to match object { ok: false, code: 'E-EMPTY' }
    ❯ core/cli.test.ts:1088  expect(parseArgs(["send","--to","w3","--to","z9","   "]))
```

`npx vitest run .pi/extensions/pij/body-file.integration.test.ts`
→ **`Tests  2 failed | 8 passed (10)`**

```
× F1: a whitespace-only --body-file is refused, and nothing lands in the inbox
    AssertionError: expected 1 to be +0 // Object.is equality
    ❯ body-file.integration.test.ts:248  expect(inboxCount(receiver)).toBe(0);

× F2: a whitespace-only broadcast --body-file is refused for EVERY target
    AssertionError: expected 1 to be +0 // Object.is equality
    ❯ body-file.integration.test.ts:312  expect(inboxCount(first)).toBe(0);
```

The two `--body-file` failures are the answer to "it should inherit the guard
automatically". It does inherit the *mechanism* — the bytes are attached pre-dispatch —
but inheriting a rule that tests the wrong thing inherits the hole with it. Asserted,
not reasoned about.

### The three new tests that were GREEN on arrival, and why they are still worth having

Honest accounting: not every test in the tests-first commit was red.

- `F2: a two-target broadcast --body-file delivers the hostile body byte-for-byte to
  BOTH` — passes today. It is the regression test the reviewer asked for: the mirror is
  correct *now*, and this is what will notice when it stops being.
- `F1 preserved: a padded but non-empty --body-file keeps every pad byte` — passes
  today and must keep passing; it is the guard against over-correcting F1 into a
  body-trimming bug.
- `F2: cli.ts's send flag-valence mirror agrees with core` — pins the assumption
  (`json` boolean, `to/command/file/caption/wait` valued) to core's actual parse
  behaviour, by probing which side consumes a sentinel token. **Stated gap:** it pins
  the valence of the flags send has *today*; a brand-new valued send flag still needs
  the mirror updated by hand, and no test can see that without core exporting its
  tables.

### The fix (second commit)

Three sites, one rule, no new mechanism — the guard's *reach* changed, not its shape:

| site | before | after |
| --- | --- | --- |
| `core/cli.ts:~1033` broadcast parse | `pos[0] === ""` | `(pos[0] ?? "").trim() === ""` |
| `core/cli.ts:~3013` broadcast dispatch | `(cmd.text ?? "") === ""` | `(cmd.text ?? "").trim() === ""` |
| `core/cli.ts:~3127` single-target dispatch | `body === ""` | `body.trim() === ""` |

The delivered value is untouched at every one of them: it is still
`cmd.text ?? ""`, handed to `deliver` exactly as the caller sent it.

The parse guard cannot be the only one, and this is why: when the body arrives via
`--body-file` the bytes are attached to the *parsed* command, so parse has only ever
seen a NUL-delimited placeholder. The dispatch guards are what actually cover that
route — which the two real-bin RED cases above proved, rather than assumed.

Two smaller consequences, both disclosed rather than smuggled:

- The refusal message now distinguishes `empty` from `blank (whitespace only)`. A
  caller who typed `"$(cat notes)"` *did* pass an argument, so "the message body is
  empty" reads as a lie and sends them hunting the wrong bug.
- `kindNote` reads `(cmd.text ?? "").trim() !== ""`, so an attachment with a
  whitespace-only caption body is receipted `file` rather than `text+file`. Same
  honesty rule, applied to the label. **Its assertion was added in the FIX commit, not
  the RED one** — it is a consequence found while implementing, not one of the
  reviewer's findings.

### Dim-0 — the preservation tests are load-bearing, not decorative

The obvious way to fail this fix is to over-correct it into the `trimEnd()` bug it
replaced. So the mutation run targets exactly that: trim the DELIVERED body.

```
mutation:  body: cmd.text ?? ""   →   body: (cmd.text ?? "").trim()
           (both arms of the deliver call, core/cli.ts:3151-3152)

npx vitest run core/cli.test.ts body-file.integration.test.ts
→ Tests  6 failed | 441 passed (447)

  FAIL  F1 preserved: a padded body with real content is delivered BYTE-FOR-BYTE
        AssertionError: expected 'hello' to be '  hello  \n\n'
  FAIL  F1 preserved: a padded but non-empty --body-file keeps every pad byte
        AssertionError: expected 'hello' to be '   hello   \n\n'
  FAIL  F1 preserved: AC-06 survives — whitespace body + attachment to a PULL target
        AssertionError: expected { Object (from, to, ...) } to match object { body: '  ' }
  FAIL  AC-08/09: a hostile body from a file arrives byte-for-byte …
  FAIL  AC-09: --wait BEFORE --body-file cannot swallow the file's contents
  FAIL  AC-10: --body-file - reads stdin, so a heredoc is a single literal command

restored → Tests  447 passed (447)
```

Six failures across both specs, including all three `F1 preserved:` cases. The
asymmetry between "the test trims" and "the body does not" is enforced by tests, not
by a comment asking future maintainers to be careful.

### GREEN — wave 2 gates

```
npx vitest run core/cli.test.ts body-file.integration.test.ts
                 →  Test Files  2 passed (2)
                    Tests  447 passed (447)
just typecheck   →  tsc --noEmit, clean
just lint        →  biome check ., exit 0
                    (9 warnings, all pre-existing and in files this change never
                     touches: core/models/match.ts, core/harness/badmodel.test.ts,
                     core/agents/cli-verbs.test.ts, skills/flow-pair/test/*)
just test        →  Test Files  211 passed | 4 skipped (215)
                    Tests  4070 passed | 19 skipped (4089)
harness checks --quick
                 →  status ok — local-paths · typecheck · lint · test ·
                    windows-compat · pkg-audit · snapshots all pass
                    (smoke skipped by --quick)
```

The flow-pair `ENOTEMPTY` flake recorded in wave 1 did **not** reproduce in this run.

### Fence

Every hunk in `core/cli.ts` lands inside the send parse block (`~1030`) or the send
dispatch block (`~3005-3160`). `whoami` at 980 and 2515 is untouched, no imports moved,
no reformatting. `git diff -U0` hunk headers, for a reviewer who would rather check
than trust:

```
@@ -1030   +1030,4  @@   broadcast parse guard
@@ -3005   +3008,6  @@   broadcast dispatch guard
@@ -3105,0 +3114,11 @@   guard comment (F1 rationale)
@@ -3108   +3127    @@   body.trim() === ""
@@ -3110,0 +3130,5 @@   empty vs blank message
@@ -3113,2 +3137,2 @@   why/blankKind
@@ -3134   +3158,5  @@   kindNote
```

---

## Wave 3 — the valence pin that could not fail (fix packet 2)

### The finding

Review of wave 2 passed both mutation proofs it asked for (the F1 asymmetry held
under an independent `trimEnd()` mutant; the `kindNote` assertion went RED when
`!== ""` became `=== ""`). One finding stood, and it is against my own test.

`body-file.integration.test.ts` (wave 2) pinned the bin's flag-valence mirror like
this:

```ts
const bodyOf = (argv) => {
  const parsed = parseArgs(argv);
  if (!parsed.ok || parsed.value.verb !== "send") return undefined;   // ← here
  return parsed.value.text;
};
for (const flag of ["to", "command", "file", "caption", "wait"]) {
  expect(bodyOf(["send", "tgt", `--${flag}`, SENTINEL])).not.toBe(SENTINEL);
}
```

`bodyOf` returns `undefined` for **any** parse failure, so the assertion reduces to
`undefined !== SENTINEL`. "The flag consumed the sentinel" and "the whole argv was
rejected" are the same observation, and the assertion holds in both.

Concretely: `send --to SENTINEL` is invalid **today** (broadcast needs two targets)
and would be just as invalid if `to` flipped to boolean (`--to needs a session id`).
Both paths yield `undefined`. The test pinned nothing.

The reviewer proved it rather than argued it — adding `"to"` to core's
`BOOLEAN_FLAGS` in memory left **50 passed**, including the test literally named
*"json is the ONLY boolean send flag; to/command/file/caption/wait all take a
value"*, and the gate exited 1 with `GATE FAILS`.

Worth naming plainly: that is an instrument reporting success while dropping the
evidence — the exact failure class this whole plan exists to close — inside the
test written to guard against it. Neither the author nor the orchestrator caught it
by reading. Mutation caught it.

### The fix (test-only)

Every case now **parses successfully today** and asserts **which slot the sentinel
landed in**. Flipping a flag's valence moves the sentinel to a different slot, and
an assertion that names its slot cannot survive that. The rule, stated in the
comment above the block: *never assert "not the sentinel"; assert where the
sentinel went.*

`parseSend()` replaces `bodyOf()` and **throws** on a non-`ok` parse, so a rejected
argv can never again be read as a consumed sentinel.

| flag | construction that parses today | asserted slot |
| --- | --- | --- |
| `--json` | `send tgt --json <S>` | `json === true`, `text === S` |
| `--to` | `send --to a --to b <S>` | `targets === [a, b]`, `broadcast === true`, `text === S` |
| `--command` | `send tgt --command compact` | `command === "compact"`, `text === undefined` |
| `--file` | `send tgt --file <p> --caption <S>` | `file === p` |
| `--caption` | (same construction) | `caption === S`, and `caption !== file` |
| `--wait` | `send tgt <S> --wait 500` | `waitMs === 500`, `wait === true`, `text === S` |

### Proof: the new pin is non-vacuous

Same tool the reviewer used (`node ~/.pij/shared/mutate.mjs`), in-memory transform,
no edit-restore. Green baseline first:

```
$ npx vitest run .pi/extensions/pij/body-file.integration.test.ts -t "F2: cli.ts"
 ✓ .pi/extensions/pij/body-file.integration.test.ts (14 tests | 9 skipped)
      Tests  5 passed | 9 skipped (14)
```

The mutant the old pin survived — `"to"` added to core's `BOOLEAN_FLAGS`:

```
$ node ~/.pij/shared/mutate.mjs --file /core/cli.ts \
    --find 'const BOOLEAN_FLAGS = new Set([' \
    --replace 'const BOOLEAN_FLAGS = new Set([\n\t"to",' \
    -- .pi/extensions/pij/body-file.integration.test.ts

     × --to is VALUED: both targets land in `targets`, the sentinel stays the body
 FAIL  ... > --to is VALUED: both targets land in `targets`, the sentinel stays the body
 Error: expected a successful parse, got E-ARG: too many arguments for 'send'
      Tests  1 failed | 13 passed (14)

✓ GATE PASSES — the mutation made 1 test file(s) fail.
```

Every other arm, mutated the same way (one run each), so no case is carried by its
neighbours:

| mutant | result |
| --- | --- |
| `"to"` → `BOOLEAN_FLAGS` | ✓ GATE PASSES (1 file failed) |
| `"command"` → `BOOLEAN_FLAGS` | ✓ GATE PASSES |
| `"file"` → `BOOLEAN_FLAGS` | ✓ GATE PASSES |
| `"caption"` → `BOOLEAN_FLAGS` | ✓ GATE PASSES |
| `"wait"` → `BOOLEAN_FLAGS` | ✓ GATE PASSES |
| `"json"` **removed** from `BOOLEAN_FLAGS` | ✓ GATE PASSES — `FAIL ... --json is BOOLEAN: it consumes nothing, so the sentinel becomes the body` |

Note the in-memory transform only reaches the **in-process** tests; the real-bin
cases in this file spawn a subprocess against the unmutated source, so the failures
above are the pin and nothing else.

### Still open, by agreement

Exporting core's flag tables to delete the bin mirror outright is a follow-up issue
— outside the fence, with a co-owning stream live. The residual gap the pin cannot
close is unchanged and stated in the comment: it pins the valence of the flags send
has **today**; a brand-new valued send flag still needs the mirror updated by hand.
