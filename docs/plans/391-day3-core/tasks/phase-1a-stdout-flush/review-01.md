# review-01 — Phase 1a, item 1a (stdout flush class fix) — dlg-0004

**Verdict**: **APPROVE** · **Highest severity**: `low` · **Findings**: 6 (1 low, 5 info)
**Reviewer**: `pij-mobile-reptile` — cold cross-model (claude-opus-5 via copilot)
**Freeze**: `git rev-parse HEAD` = `6cfc12cd94104ee8e1cd4fe35aae4ff7213bc970` on `s391/item1a-stdout-flush`; merge-base with `main` = `5445c85caeb7a866b767dbd90e959a772770e1c8` ✓ (matches the brief's stated base `main@5445c85`)
**Rubric**: `skills/flow-pair/references/review-rubrics.md` · Dim-0 mandatory, executed.

---

## 0. Scaffolding, and the limits of this review (stated before the findings)

What I built to review this, and what I could **not** check. A gate I did not
examine and a gate I found clean must not look the same in this report.

**Scaffolding I created** (all outside the repo; the repo is READ-ONLY except this file):

- `/tmp/dlg0004-seed.ts` — seeds 812 SQLite queue rows into a scratch `PIJ_HOME`, so I could
  drive the **real bin** by hand rather than only through vitest.
- Scratch home `/tmp/dlg0004-home-2SBl`; logs `/tmp/dlg0004-{vitest,typecheck,biome,justlint}.txt`;
  pre-mutation copy `/tmp/dlg0004-cli.orig.ts` used for restore proofs.

**Baseline caveat — the worktree was NOT pristine when I started.** `git status --porcelain`
already carried **11** untracked orchestration doc paths (captured to
`/tmp/dlg0004-baseline-status.txt`). The brief's restore condition says "only the 7+ untracked
orchestration docs baseline"; asserting an *empty* status would have produced a false failure.
During the review a **12th** appeared —
`docs/plans/391-day3-core/tasks/phase-2b-item-1b-dispatch-retire/` — which is fleet churn from
the orchestrator, not mine. The invariant I actually held to is stronger and unambiguous:
**`git diff --exit-code` clean on tracked files, and HEAD unmoved**, both verified after every
mutation.

**Limits — what I did NOT verify:**

| # | Not checked | Why it matters |
|---|---|---|
| L-1 | **Windows / non-POSIX.** `setBlocking` semantics differ (Windows pipes are already synchronous). | The fix is reasoned-safe there, not tested. The coder's own log records `harness checks --quick` Windows-compat as red at baseline. |
| L-2 | **`harness checks` and `just smoke`** not run. | The brief's "gates to re-run" listed only vitest; I honoured it literally. Both remain ship-time gates. |
| L-3 | **The originating incident** ("709 of 812 rows", 2026-08-27) taken on trust from the code comment. | I reproduced an *equivalent* deterministic truncation (exactly 65536 bytes), not that specific incident. If the comment's numbers are wrong, nothing here would detect it. |
| L-4 | **stderr >64 KiB** never driven. | The fix covers stderr; the test pins only stdout. See F-6. |

---

## 1. Dim-0 — mutation-resistance (MANDATORY) · **PASS**

The brief mandates one mutation. I ran **two**, because the mandated one leaves half of the
brief's own aim 2 unproven (see M2).

**Stability baseline first** — a pipe race can be flaky in either direction, so a lone RED proves
nothing. I ran the target test **5× unmutated at HEAD on a quiet machine: 5/5 GREEN** (~480 ms
each). Only then did I mutate.

| # | Mutation | Method | Result | Where it went RED |
|---|---|---|---|---|
| **M1** | Revert the `setBlocking` hunk, keep the test (the brief's mandated mutation) | `git checkout main -- .pi/extensions/pij/cli.ts` — provably exact: `cli.ts`'s *only* delta from main is this hunk (9 insertions, 0 deletions), so post-mutation `git diff main -- cli.ts` is **empty** and `grep -c setBlocking` = **0**, while the test file is untouched | **RED 5/5** | `cli.integration.test.ts:3180` — `AssertionError: expected 65536 to be greater than 65536` |
| **M2** | *(beyond the brief)* Keep the fix; drop the final row — `lines.join` → `lines.slice(0, -1).join` in `runQueue` | targeted edit, reverted | **RED** | `cli.integration.test.ts:3181` — `expected '811   queued …' to contain 'pij-stdout-target-0811'` |

**M1 reads `expected 65536 to be greater than 65536` — truncation lands on the 64 KiB boundary
exactly, and did so on all five runs.** That reproduces the coder's claim ("failed at exactly
65,536 bytes") precisely, and it is deterministic rather than racy.

**Why M2 was necessary.** M1 trips the **byte-length** assertion at `:3180`, which **shadows** the
last-row assertion at `:3181` — under the mandated mutation, `:3181` is never reached. So the
brief's aim 2 ("asserts the LAST line/row is present") was, strictly, unproven by the mandated
mutation alone. M2 keeps the fix in place (so `:3180` still passes: dropping one ~110-byte row
leaves output well above 65536) and removes only the last row — reddening `:3181` **and nothing
else**. That is the actual evidence that the last-row pin is load-bearing rather than decorative.

**Restore proofs** (run after *each* mutation, three independent ways):

1. `diff /tmp/dlg0004-cli.orig.ts .pi/extensions/pij/cli.ts` → identical ✓
2. `git diff --exit-code -- .pi/extensions/pij/cli.ts` → clean ✓
3. `git rev-parse HEAD` → `6cfc12cd…` unmoved ✓

---

## 2. Was the new test vacuous? — the one real risk, resolved empirically

This deserves its own section because it nearly became a critical finding.

The new test drives the bin with **`spawnSync`**, an *eager-draining* reader. **Four lines above
it**, the pre-existing s057 test (`cli.integration.test.ts:3125-3140`) carries an explicit warning
that this exact pattern made *its own* earlier version **VACUOUS**:

> "execFileSync drains the pipe eagerly, so the child never hits the OS pipe-buffer backpressure
> … which is why the prior version of this test was VACUOUS (green while `pij … | wc -c`
> truncated live)."

…and that test therefore uses `| ( sleep 0.5; cat )` instead. On its face the new test adopts the
banned harness.

**It is nevertheless genuinely non-vacuous, and the reason is structural.** `runQueue`
(`cli.ts:604-651`) performs **one** `process.stdout.write(...)` of the whole table and then calls
`process.exit(0)` **on the very next line, in the same tick**. No reader — however eager — gets a
scheduling opportunity between the queued partial write and the hard exit, so the tail is dropped
deterministically. The s057 `tree` path is different: it is already drain-safe
(`process.exitCode` + natural return, per `cli.ts:4775-4781`), so it truncates only under
*sustained* backpressure, which is precisely what an eager reader relieves.

Confirmed from both directions:

- M1 went RED **5/5** at exactly 65536 — the harness detects the bug.
- I also drove the real bin under the codebase's **stricter** delayed-reader harness by hand:
  `pij queue | ( sleep 0.5; cat ) | wc -c` → **73158 bytes**, identical to `| cat` (73158) and to a
  file redirect (73158). The fix holds under the tougher probe too.

Conclusion: **not vacuous.** But the non-vacuity is a property of the *verb chosen*, not of the
harness — which is F-1.

---

## 3. Aim points from the brief

| # | Aim | Verdict | Evidence |
|---|---|---|---|
| 1 | ONE guarded statement at `main()` entry; **no `process.exit(` call site touched**; diff limited to `cli.ts` (tiny) + test + 2 dossiers | **PASS** | `git diff --stat main...HEAD` = exactly 4 files: `cli.ts` +9/-0, `cli.integration.test.ts` +38/-1, `execution.log.md`, `tasks.md`. `grep -c 'process\.exit('` = **137 on main, 137 on HEAD** — byte-for-byte the same call sites, so the class fix covers all 137 without touching one. |
| 2 | Test crosses the bin through a **PIPE**, produces **>65536** bytes, asserts the **LAST** line present | **PASS** | `spawnSync` default stdio is `pipe` ✓; real full size **73158 bytes** ✓; `:3181` pins `.trimEnd().split("\n").at(-1)` — and M2 proves that pin load-bearing ✓. |
| 3 | No behaviour change on TTYs/files; **no exit-code change** | **PASS** | Drove the real bin four ways — eager pipe **73158**, delayed reader **73158**, file redirect **73158 / exit 0 / last row present**, real **PTY** via `script` → **exit 0**, last row present. Exit codes: full suite (3935 tests, hundreds of bin invocations with status assertions) green, plus 137 untouched exit sites. See F-5 on the *wording* of this aim. |

**Additional hazard I probed (not required by the brief).** The genuine risk of switching stdio to
blocking is a **hang** when a reader closes early or never reads. Two surfaces checked:

- `pij queue | head -3` (reader closes after 3 lines) → **completed, exit 0, clean stderr, no
  hang** under a 20 s watchdog. The most common operator idiom is safe.
- Detached children with unread pipes: the only real `child_process` detached spawn is
  `adapters/background-launcher.ts`, which uses **`stdio: "ignore"`** — no pipe to block on. The
  twelve other `detached: true` hits in `cli.ts` are **tmux window options** (don't steal focus),
  whose children get a **TTY**, not a pipe. **No unread-pipe hang surface exists in this codebase.**

Also verified: `main()` is entrypoint-guarded (`cli.ts:4784-4788`), so importing `./cli.js` — which
`cli.integration.test.ts` does — does **not** run `main()` and does **not** mutate the test
runner's own stdio. Correct, and easy to have got wrong.

---

## 4. Gates I re-ran myself (not taken from the coder's log)

| Gate | My result | Coder's claim | Match |
|---|---|---|---|
| `npx vitest run .pi/extensions/pij/` | **171 files passed \| 2 skipped; 3935 passed \| 15 skipped; exit 0** | 171 files, 2 skipped; 3,935 passed, 15 skipped | **exact** ✓ |
| `npx tsc --noEmit -p .` | exit **0** | Passed | ✓ |
| `npx biome check` on the 2 changed files | exit **0**, "Checked 2 files… No fixes applied" | Passed | ✓ |
| `just lint` | exit **1** | "baseline remains red on unrelated files; both touched files clean" | ✓ — see F-3 |
| Target test, unmutated, 5× | **5/5 GREEN** | — | — |

---

## 5. Findings

| # | Sev | Dim | Finding |
|---|-----|-----|---------|
| **F-1** | **low** | 0 / 8 | **The regression harness is non-vacuous only incidentally.** `spawnSync` is an eager-draining reader — the pattern the adjacent s057 test documents as having made its own earlier version VACUOUS. It works here *only* because `runQueue` hard-exits in the same tick as its single write (§2). Nothing in the test says so, and nothing enforces it. Repoint AC-16's pin at a drain-safe verb (or make `queue` drain-safe — a plausible future cleanup, since the repo already prefers `process.exitCode`) and this test goes **silently green forever** while AC-16 rots. Recommend a one-line comment at the test naming the dependency, or switching to the `( sleep 0.5; cat )` harness the file already uses 4 lines above. Not a blocker: the pin is genuinely load-bearing **today**, proven 5/5. |
| **F-2** | info | 0 | Under the brief's mandated mutation only `:3180` is exercised; `:3181` is shadowed. Proven independently load-bearing here via M2. Recorded so the coverage claim is precise rather than assumed. |
| **F-3** | info | 8 | `just lint` is **red** (exit 1). **Not a regression**: zero overlap with the two changed files (`grep -c` for either filename in the output = **0**), and the offender set (`adapters/copilot-rpc.test.ts`, `core/models/match.ts`, `producers/…`, `skills/flow-pair/test/*`, …) is the *same set I observed on an unrelated branch during dlg-0001* — independent evidence of a stable repo baseline. It is still a stated ship gate and will surface again. |
| **F-4** | info | 3 | `tasks.md` § Delivers prescribes `const h = (s as any)._handle`. **`any` is banned by AGENTS.md.** The implementation correctly deviated to a narrow structural type. The deviation is right; the **dossier text should be corrected** so the spec stops recommending a banned construct to the next reader. Credit where due — the coder noticed and did the right thing. |
| **F-5** | info | 4 | Aim 3 / `tasks.md` say the guard is a "no-op on TTYs/files" via `_handle?.setBlocking`. Precisely: for **TTYs the guard does not skip** — TTY handles *do* expose `setBlocking`, so `setBlocking(true)` **is** called; it is a no-op *in effect* only because POSIX TTY writes are already blocking. The guard actually skips only file-backed stdio (no `_handle`). Behaviour is correct and I verified it on a real PTY (exit 0, full output); only the stated reasoning is loose. |
| **F-6** | info | 4 | **stderr is fixed but unpinned.** The loop covers `process.stderr`, and AC-16 says "stdout/stderr", but the test drives stdout only. No verb in this diff emits >64 KiB to stderr, so there is no live exposure — but the stderr half of the class fix is currently unguarded by any test. |

No critical, high, or medium findings.

---

## 6. Dimension verdicts

| Dim | Name | Verdict | Note |
|-----|------|---------|------|
| 0 | Test quality (mutation-resistance) | **PASS** | 2 mutations, both RED, both restored byte-identical; 5/5 GREEN stability baseline first. F-1/F-2 are durability notes, not gate failures. |
| 1 | Scope | **PASS** | 9 production lines, one seam, zero call-site churn. Textbook class fix — the alternative was editing 137 exit sites. |
| 2 | Contract | **PASS** | Guarded structural access; no public surface change; no exit-code change; entrypoint-guarded so imports are unaffected. |
| 3 | Plan-alignment | **PASS** *(F-4)* | Follows 1a.1/1a.2/1a.3 exactly; the single deviation (`any` → structural type) is an improvement the dossier should absorb. |
| 4 | Acceptance criteria | **PASS** *(F-5, F-6)* | AC-16 met for stdout through the bin; stderr half unpinned. |
| 5 | Tests (doc/config) | **N/A** | Code delegation — delegated to Dim 0 per the rubric. |
| 6 | Domain-currency | **PASS** | `pij-control-plane` only. |
| 7 | Progress log | **PASS** | `execution.log.md` is accurate and falsifiable — its headline numbers (3,935/15; 137/137; "exactly 65,536 bytes") **all reproduced independently**. Its closing brake-vs-policy note is correctly argued: removing the interlock can only permit *more* truncation, never change which bytes a verb intends to emit. |
| 8 | Regression | **PASS** *(F-3)* | Full targeted suite green; typecheck green; lint red is pre-existing with zero overlap. |
| 9 | Prompt-follow | **PASS** | Brief followed literally, including its narrower gate list. |
| 10 | Learning | **PASS** | The incident is encoded *in the code* at the seam with date and row counts — the harness-preferred form ("encode, don't document"). F-1 is the one place a further line of encoding would pay. |

---

## 7. Verdict

**APPROVE.** The fix is minimal, correctly placed at the one seam that covers all 137 exit sites,
guarded, entrypoint-safe, and free of any unread-pipe hang surface in this codebase. The
regression pin is real — proven 5/5 RED at exactly the 64 KiB boundary and re-confirmed under a
stricter delayed-reader harness than the test itself uses. Every headline number in the coder's
log reproduced independently.

The one finding worth acting on is **F-1** (a comment pinning *why* the eager-reader harness
suffices), and it is cheap. Nothing here blocks the merge.

**Recommended follow-ups (non-blocking)**: F-1 comment; F-4 dossier correction; F-6 stderr pin if
any verb ever grows a large stderr path.
