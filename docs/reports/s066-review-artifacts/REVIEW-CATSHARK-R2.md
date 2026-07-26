# s066 session-revive — cross-model RE-REVIEW (round 2)

Reviewer: **pij-able-catshark** (Claude Opus 5). Coder: **GPT-5.6 Sol (omp)**.
Round 1: `REVIEW-CATSHARK.md` (VERDICT: FIX_REQUIRED, F1–F10).
Method: independent re-read of the working tree, live probes against the real registry
(read-only), and an independently authored 22-mutant Dim-0 re-run. The machine-wide daemon was
**not** restarted or touched.

## VERDICT: APPROVE_WITH_NOTES

The seven closures are real and I could verify each one. The classifier is now genuinely tight
and genuinely inert. What is left is not a regression of the fixes — it is one **unclosed hole
that the F5/F7 rework moved rather than sealed** (a revive that never registers leaks a live pane
with no notice, and pi/omp now hits that path by default), plus a **branch-base drift** that makes
the reviewed diff partly fictional. Neither is a reason to block; both should land before converge.

Round-1 status: **F1 closed · F2 closed (as inert) · F3 closed · F4 closed · F5 closed but see N1
· F6 closed · F8 closed · F7 NOT closed (see N1) · F9/F10 unchanged (LOW, accepted).**

### Your four "press hardest" items

| # | asked | answer |
|---|---|---|
| 1 | re-run my survivor list myself; every one must now die | **22 mutants run independently: 21 killed, 3 survived.** Every round-1 survivor and all six you named die, and both registry identity halves die *separately*. The three survivors are new and narrow (M15, M20, M22) — see §1. |
| 2 | is the inert path honest; can the classifier fire on anything but the exact modal | **Inertness confirmed by construction** (harness-less readiness can never reach the copilot branch) and the regex is genuinely tight and fail-closed. **Honesty: no** — see **N2**: at runtime *nothing* observes a stuck seat; the named line is printed before the situation exists. One pre-condition for the s069 sequel in §2. |
| 3 | s070 close-intent: double-write or descriptor race | **Neither.** Verified with the mechanism, not by inspection alone — see **N8**. One 1-tick cosmetic residue on a redundant re-close. |
| 4 | does anything leak a pane when a slow pi/omp never registers | **Yes, and silently** — and the pre-bound `sessionId` is what disables the existing no-show net. This is the one finding I'd fix before converge: **N1**. |

---

## 1. Your survivor list — re-run independently (Dim-0)

Harness (mine, not the coder's): `.harness/temp/brief/mutate-catshark-r2.py` plus
`.harness/temp/brief/mutate-catshark-r2b.py` (the two re-runs), and the F2 probes at
`.harness/temp/brief/probe-catshark-r2.test.ts`. Each patch asserts the pattern occurs exactly once
and always restores the file from `.bak`. 24 runs total (22 mutants; M15 first reported
PATTERN-MISS on an ambiguous anchor and was re-run with a unique one, M20 was re-run against the
full suite). Baseline before mutating: **12 files / 685 passed / 2 skipped, green**.

| # | mutation | site | result |
|---|---|---|---|
| M1 | live-prior refusal → `if (false)` | `revive.ts:201` | RED |
| M2 | eligibility gate's proven-dead clause → `false` | `revive.ts:210` | RED |
| M3 | drop the `harness === "copilot"` guard on the modal | `interstitial.ts:64` | RED |
| M4 | test the whole pane instead of the last 1 600 chars | `interstitial.ts:65` | RED |
| M5 | swap the anchored regex for round-1's loose one | `interstitial.ts:38` | RED |
| M6 | phonehome drops the `pending`/`undefined` lifecycle gate | `core/cli.ts:2358` | RED |
| M7 | `exactlyOne` stops raising E-AMBIG | `revive.ts:79` | RED |
| M8 | `revive()` identity guard — **harness half only** | `fs-registry.ts:178` | RED |
| M9 | `revive()` identity guard — **native-id half only** | `fs-registry.ts:179` | RED |
| M10 | restore the `pid === existing.pid` resurrection bypass in `write()` | `fs-registry.ts:152` | RED |
| M11 | drop the expectation rollback on pane-launch failure | `cli.ts:1489` | RED |
| M12 | drop `killPane` on tombstone-replacement failure | `cli.ts:1506` | RED |
| M13 | drop the expectation rollback on tombstone-replacement failure | `cli.ts:1507` | RED |
| M14 | drop the pane rollback when `new-window` titling fails | `tmux.ts:93` | RED |
| **M15** | drop the pane rollback when **`split-window`** titling fails | `tmux.ts:148` | **GREEN — SURVIVED** |
| M16 | drop the pre-bound `sessionId` on the expectation | `cli.ts:1455` | RED |
| M17 | drop the s070 expectation close-intent write | `cli.ts:2609` | RED |
| M18 | make the pi/omp reframe conditional on `PIJ_ANNOUNCE_TO` again (re-open F4) | `session.ts:314` | RED |
| M19 | drop reviver routing on the revived descriptor (re-open F3) | `revive.ts:298` | RED |
| **M20** | daemon passes `revived = false` to `buildInitInjection` | `loop.ts:312` | **GREEN — SURVIVED** (re-run against all 12 files / 685 tests: still green) |
| M21 | `plannedHarnessSessionId` → `undefined` | `revive.ts:304` | RED |
| **M22** | stop persisting `runtimeBin` at pi boot | `session.ts:228` | **GREEN — SURVIVED** |

**21 killed / 3 survived.** Every round-1 survivor and every mutant you named now dies —
including both `revive()` identity halves *independently* (M8, M9, not one test covering the pair),
the resurrection bypass (M10), and all three `runRevive` rollback paths separately (M11–M13). Three
new gaps, all narrow, none blocking:

- **M15** — the tmux title rollback is covered for `new-window` (M14) but **not for
  `split-window`**, which is the default side-stack path and therefore the one that actually runs.
  Same fix shape as M14's test, different branch.
- **M20** — the revived-reframe *wiring* is uncovered. `buildInitInjection`'s `revived` parameter
  has its own unit tests, but nothing asserts that `driveSession` passes it, so the daemon could
  silently inject the ordinary init text into a revived claude/copilot/codex seat and the suite
  would stay green. This is the fail-loud contract item ("must not continue the old work"), so it
  deserves one assertion in `loop.test.ts`.
- **M22** — `runtimeBin` persistence at boot is uncovered. The *revival* half is well tested (the
  integration test seeds `runtimeBin` and asserts the argv), but nothing proves it is ever written
  in the first place. That matters more than it looks: the live registry has **7 of 1 705**
  pi-family descriptors carrying `runtimeBin`, and **none of the 84 seats started today** do
  (expected — the machine runs canonical main, which lacks the field). So on day one the legacy
  exact-one-store inference is the path for essentially the whole existing fleet, and if
  persistence silently broke, nothing would look wrong — revive would just stay on the legacy path
  forever. (Inference itself is sound today: I re-confirmed 766 Pi / 61 OMP uuidv7 session files
  with no cross-store collisions.)

Non-vacuity: I read the new tests rather than trusting the count. `cli.integration.test.ts` drives
the **real CLI** over a sandbox `HOME` with a scripted fake tmux and asserts on argv text, the
tmux command log, expectation-store contents and registry state — not truthiness. The fault
injection is real (`FAKE_TMUX_FAIL`, and `FAKE_TMUX_DELETE_DESCRIPTOR`, which deletes the
descriptor *from inside the tmux call* to force the tombstone-replacement failure). The
`refuses revival while the prior process incarnation is still alive` case uses `process.pid`, so
the liveness half is a real syscall, not a stub.

One over-claim in a test name: `reports the interim Copilot session-in-use action instead of
waiting silently` asserts only the string `pij revive` prints. It does not prove anything about
runtime behaviour — see N2.

## 2. F2 — safety-critical: is the inert path honest, and can the classifier mis-fire?

### Inertness: CONFIRMED, by construction

- `loop.ts:275` calls `classifyInterstitial(pane, harness)` — but only inside
  `if (readiness === "interstitial")` (`loop.ts:274`).
- `readiness.ts:75` calls `classifyInterstitial(paneText)` **harness-less**, and the modal branch
  now requires `harness === "copilot"` (`interstitial.ts:64`).
- The captured modal matches no generic pattern: not `Do you trust`, not `Sign in`, not
  `Update available!`, and — the one I specifically checked for, because it would have pressed
  **Esc** and thereby selected `2. Go back` — not `Enter to confirm`. Its footer reads
  `↑/↓ to navigate · enter to select · esc to cancel`.

So the harness-less classifier returns `none`, readiness never becomes `interstitial`, and the
copilot branch is never reached. **No key can be pressed.** Round 1's second F2 half (the modal
text overriding the busy footer and trapping pending claude/codex at needs-human before init
injection) is closed by the same change.

### Precision: much tighter, and fail-closed in the right direction

`COPILOT_SESSION_IN_USE_RE` (`interstitial.ts:38`) now requires four line-anchored matches with
bounded gaps — the title line, the exact explanatory sentence on one line, `1. Resume anyway`,
`2. Go back (Esc)` — over the last 1 600 characters only. My round-1 reproductions no longer
fire. Every shape mismatch I tried (box-drawn borders other than `│`, the sentence wrapped
across two lines in a narrow pane, re-worded prose, a lookalike modal with a destructive option
1) returns `none` — i.e. it fails closed into "no automation", which is the correct direction.

### One pre-condition for the s069 sequel (not a defect today)

The 1 600-char tail is a *proxy* for "the modal is on screen", not a check that it is. A
**verbatim paste** of the modal followed by less than ~1.4 KB of later output still matches — and
a copilot peer reviewing `interstitial.ts`, printing `interstitial.test.ts`, or quoting a handoff
note produces exactly that. **Reproduced (PROBE-2): a verbatim paste followed by ordinary agent
output and a live busy footer returns `{action:"answer", keys:["1","Enter"]}`.**

Harmless today (inert). The moment the proposed post-s069 patch calls
`classifyInterstitial(pane, harness)` **before** `classifyReadiness(pane)`, it becomes one real
keypress into a live composer mid-turn. Before that lands, add a second condition that the pane is
not interactive (harness-less readiness ∉ {ready, busy} — PROBE-2's pane reads `busy`, so that
single check would have refused it), or anchor the option-2 line to the end of the capture rather
than to a byte window.

Probe details (`interstitial.ts` + `readiness.ts`, pure functions, no side effects):

| probe | input | result |
|---|---|---|
| PROBE-1 | the exact modal, harness-less | `{action:"none"}`, `classifyReadiness` → **`booting`** ⇒ inert confirmed, and this is N2's silent loop |
| PROBE-2 | verbatim modal pasted in agent output above a live composer + `◎ Working (esc interrupt)`, harness `copilot` | **`{action:"answer", keys:["1","Enter"]}`** — while `classifyReadiness` reads `busy` |
| PROBE-3 | modal + N lines of later output | still `answer` at 18 / 90 / 360 / 720 / **1 080** trailing chars; `none` at 1 800 ⇒ the window tolerates ~60 lines of newer output |
| PROBE-4 | box-drawn (`│ … │`) variant | `answer` ⇒ correctly robust to the real modal's borders |
| PROBE-5 | explanatory sentence wrapped across two lines (narrow pane) | `none` ⇒ fails closed, as designed |

### Honesty: this is the one place I'd push back — N2 below

## 3. Findings

### N1 — MED (CONFIRMED, deterministic). The pre-bound `sessionId` opts every revive out of the one no-show net pij has. F7 is not closed; the F5 rework moved the hole rather than sealing it.

`cli.ts:1447-1463` (pre-bound expectation) · `death-reconciler.ts:159` · `death-reconciler.ts:92`

`sessionId` on an expectation is pij's marker for **"a registered seat already accounts for this
spawn"** — `createSpawnExpectation` never sets it (`spawn-expectation.ts:56`); only
`bindSpawnExpectation` does, after the seat registers. `reconcileDeaths` therefore **skips** any
expectation carrying it (`death-reconciler.ts:159`), which is what lets the 5-minute expectation
TTL (`DEFAULT_SPAWN_EXPECTATION_TTL_MS`) act as the no-show net for an ordinary spawn: pane alive
but never registered ⇒ deadline ⇒ `expectation-expired` ⇒ named notice.

`runRevive` writes `sessionId` **before the pane launches** (`cli.ts:1455`, written at `cli.ts:1463`). That disables the net
for every revive. STAGE2 reads this as making an interrupted launch "self-describing for
reconciliation"; it does the opposite. The descriptor loop cannot cover the gap either — it skips
`lifecycle === "dissolved"` (`death-reconciler.ts:92`) and is fed `registry.list()`
(`daemon.ts:512`), which filters dissolved out.

For the **pi/omp path this is the ordinary path, not a race**: it deliberately writes no descriptor
(correct — that is the F5 fix), so a launch that never self-registers (corrupt or huge transcript,
resume error, wrong runtime, model rejection) leaves:

- a live tmux pane running `pi --session …` / `omp --resume=…`;
- the descriptor still `dissolved` ⇒ absent from `pij list`, undriven, unwatched;
- the expectation skipped forever, deadline never assessed;
- **no notice to anyone**, while `pij revive` already exited **0** printing "started revival".

There is no orphan-pane reaper in the daemon (`killPane` exists only as a port declaration,
`loop.ts:66`). For claude/copilot/codex the same state is reachable in the window between the pane
launch and `registry.revive()` — round 1's F7, unchanged.

Removing the destructive 15 s kill was right; the missing half is the notice. Cheapest fix: do not
set `sessionId` pre-launch (carry the target id in a distinct field, or set `sessionId` only when
the seat registers), so the existing deadline path fires. One change covers both the pi/omp steady
state and the claude/copilot interrupt window.

### N2 — MED. The inert copilot path is honest only at invocation time. At runtime nothing observes it, ever.

`cli.ts:1512` (`operatorAction`) · `loop.ts:303` · `watchdog-manager.ts:89`

`pij revive` prints a named `needs-human` line telling the operator to press 1 then Enter. Good —
but it is printed **unconditionally for every copilot revive**, before any modal exists, and
nothing detects the modal afterwards. I traced all three mechanisms that could:

- **daemon drive**: harness-less readiness → `none` → `booting` → `loop.ts:303` returns
  `{kind:"boot"}` every tick, forever. No needs-human notice, no init injection, no bind, no fail.
- **death reconciliation**: descriptor is `pending` with a live pane and live pid ⇒ nothing observed.
- **watchdog**: `eligible()` excludes `lifecycle === "pending"` (`watchdog-manager.ts:89`) ⇒ a
  revived seat is not watched until it binds, which it never will.

So a revived copilot seat sitting at the modal waits **silently and indefinitely**, and N1 removes
the last backstop (the expectation deadline). The operator's only signal is a line printed before
the situation arose. "Inert" should mean *surfaced and untouched*, not *invisible*.

Zero-risk fix with machinery that already exists: put the exact modal shape in
`NEEDS_HUMAN_PATTERNS` (harness-less). Readiness then reads `interstitial`, `loop.ts:289` fires the
named `🙋 <id> needs a human: session-in-use` notice to the reviver (F3 already routes it), and
**nothing is pressed**. The copilot `answer` upgrade stays gated behind s069 exactly as ruled.

### N3 — MED (merge hazard). The branch base is 6 commits behind main, including s069 itself, so `git diff main` presents drift as this stream's work.

`HEAD = b77ae93` · `main = 5619fbf`

```
5619fbf s069: fix the typing step-on — gate delivery on composer CONTENT at the send boundary (#48)
5c8cd69 feat(models): refresh Copilot models and enforce context tier (#45)
b7d4ab1 docs(pij): define the standard team window layout (#46)
f26924f fix(pij): surface Claude Opus 5 for the claude harness (#44)
9b944a0 chore(pij): mandate tmux seat naming + close two .gitignore gaps (#43)
0759c14 s068: make `just update-omp` work on npmjs-blocked machines, and fail loud (#42)
```

`git log main..HEAD` is empty — the branch is purely behind. Consequences:

1. The packet's review command `git --no-pager diff main` shows **s069's typing guard as a
   deletion**: `SendOutcome` loses `"held"` (`ports.ts:22`) and `loop.ts` loses all three
   `=== "held"` guards. Those hunks are not the coder's edits; I nearly filed them as a
   regression. Anyone re-reviewing from this diff should be told.
2. The "inert until s069 lands" rationale is **stale — s069 is already merged on main**. The F2
   seam is unblocked; keeping the modal unclassified is now a choice, not a sequencing constraint
   (which is why I argue N2 rather than accepting the inertness as forced).
3. Real conflict surface at converge: main and s066 both touch `core/daemon/loop.ts`
   (main +104 / s066 +1), `core/spawn.ts` (main ±45), `core/ports.ts`, `core/types.ts`,
   `core/cli.ts`, `cli.ts`, plus `cli.integration.test.ts`, `core/cli.test.ts`,
   `core/spawn.test.ts`, `loop.test.ts`, `index.test.ts`. Rebase onto main and re-run the gates
   before converge; the post-s069 F2 patch must be written against **main's** `loop.ts`, not this
   one.

### N4 — LOW-MED. The documented three-tier eligibility collapses to a single liveness probe; the named fail-loud error is unreachable from the CLI.

`revive.ts:207` · `cli.ts:1370`

`priorAttachmentAlive` is computed as `Boolean(...)` — never `undefined`. So from `pij revive`
the guard `input.priorAttachmentAlive !== false` (`revive.ts:210`) is always false and the
lifecycle/terminal branch can never fire. Effective policy is *"revive anything whose pane and
pid are not demonstrably live"*, which is looser than STAGE2's "deliberate dissolves, latched
terminal observations, or a prior attachment proven dead". The direction is safe (refuse-if-live)
and it is what makes F1's real fleet revivable, so I am not asking for it to be tightened — but
the error string is production-dead code (only M2/unit tests reach it), and the honest way to say
what shipped is "refuses a live prior attachment", not "requires terminal evidence".

Two edge notes, both narrow and both in the safe direction: a tmux pane id recycled after a tmux
server restart yields a false refusal; a live seat on another tmux socket whose descriptor already
carries a stale terminal latch could pass both probes.

### N5 — LOW. Root-shell pi/omp revive orphans its expectation file and keeps the old `spawnId`.

`session.ts:259-295`

`spawnId` persistence and `bindSpawnExpectation` both live **inside** the `if (announceTo)` branch.
A revive launched from a plain shell (no reviver id ⇒ `PIJ_ANNOUNCE_TO=""`) takes the `else`
branch, so: the revived descriptor keeps the **original** `spawnId`, the `revive-<ts>-<pid>.json`
expectation is never bound, never removed, and never reconciled (N1) — and a later `pij close`
writes its close intent to the *old* expectation instead. Disk litter plus a wrong-record write.

### N6 — LOW. `revivePendingAt` is asymmetric and never cleared.

`revive.ts:305` · `fs-registry.ts:173` · `loop.ts:312`

Only `buildRevivedDescriptor` sets it, i.e. only claude/copilot/codex. pi/omp revived descriptors
never carry it (`runRevive` writes no descriptor for them, and `session.ts` does not set it), so
the registry holds **no record that a pi/omp seat is pending canary**. Nothing ever clears it for
the harnesses that do get it, so it stays true after golden recall passes. Combined with F9 from
round 1: `PENDING CANARY` is still stdout-only prose, and there is still no mechanism by which an
amnesiac seat *reports* FAILED — the canary remains operator-driven. Fine as an interim, but the
packet's wording ("a booted-but-amnesiac seat reports FAILED") overstates what exists. Re-verified
that the reframe leaks no recall answer (`revive.ts:4`, and `revive.test.ts` asserts
`not.toMatch(/seed|golden|answer/i)`).

### N7 — LOW. `registry.revive()`'s guard is self-authorizing, and a mismatch now crashes a pi boot.

`fs-registry.ts:171-175` · `session.ts:337`

`explicitRevive = descriptor.revivePendingAt !== undefined && descriptor.pid !== existing.pid`
lets a caller replace a **live, non-terminal** descriptor by setting a field it controls. The real
gate is `runRevive`'s liveness probe, so this is safe in practice, but the doc comment
("Replace a dissolved tombstone", `ports.ts:32`) is stronger than the check. Separately,
`session.ts` turns a `revive()` failure into `throw new Error("pij revive error: …")`, so a
registry identity disagreement becomes a pi **boot crash** rather than a named refusal. I measured
reachability against the live registry: of 964 dissolved descriptors, **0** lack the `harness`
field and 12 lack a native id, so the `undefined !== "pi"` mismatch that would trip it is not
reachable today. Worth a named error instead of a throw when you next touch it.

### N8 — LOW. s070 close-intent handover: no double-write, no descriptor race. One narrow clobber remains.

`cli.ts:2602-2609`

Checked as asked. `requestClose` is a pure field add (`spawn-expectation.ts:81`) and the store's
`write` is a whole-file atomic replace with no merge, so the risk shape is a stale read-modify-write,
not a double write. It is blocked: `reconcileDeaths` skips any expectation whose `spawnId` belongs
to a **live** descriptor (`death-reconciler.ts:160`), and the descriptor is still live throughout
`runClose`'s read→write window, so the daemon cannot be writing that expectation concurrently.
Ordering is right (descriptor intent → expectation intent → `kill`), and re-running `pij close`
re-reads fresh, so no field is dropped. Coverage is real: the integration test writes an
expectation, runs the actual `pij close`, and asserts the intent on **both** records.

Residue: `pij close` on an **already dissolved** seat is no longer protected by the live-descriptor
skip, so a terminal latch the daemon writes to that expectation in the same tick can be
overwritten, producing a duplicate `⚠️ has exited` notice on the next sweep. One tick wide, needs a
redundant close, cosmetic.

### N9 — LOW (unchanged). Reframe text is duplicated and already diverging.

`revive.ts:4` vs `harness/claude.ts:141` — same meaning, different punctuation. One constant.

## 4. Live probes (read-only, real registry, worktree build)

The `pij` on `$PATH` is canonical main and has no `revive` verb, so probes ran
`npx tsx …/s066-session-revive/.pi/extensions/pij/cli.ts`. Each target was chosen so that **no**
outcome could mutate anything (missing native artifact ⇒ every path exits before tmux).

| probe | target | result |
|---|---|---|
| F1 closed | `pij-102egj6` — terminal-latched, `lifecycle ≠ dissolved` (round 1: `E-ARG … is live`) | `E-NOREG: pi-family session '019f5111-…' is absent from both Pi and OMP stores` — eligible now, still fail-loud |
| live refusal | `pij-able-beaver` — live pane `%2098` (`pane_dead=0`) | `E-ARG: session 'pij-able-beaver' still has a live prior attachment; close it before reviving` |
| unknown id | `pij-nope-nope` | `E-NOID: no session with that pij id` |

Fleet census (`~/.pij`, 2 026 descriptors): **771** sessions are terminal-latched, non-dissolved,
revivable-shaped with an existing cwd — round 1's blocked population, now accepted. F1 is closed
on the real registry, not just in tests.

No path I could find presents a fresh empty agent as revived: `--resume`/`--session` are all
existing-only forms (`revive.test.ts` asserts `not.toContain("--session-id")` and
`not.toContain("--fork-session")`), and a missing artifact exits before tmux.

## 5. What to do with this

Blocking nothing. In priority order:

1. **N1** — stop pre-setting `sessionId` on the pre-launch expectation (one line) so a revive that
   never registers expires into the existing named notice instead of leaking an invisible pane.
   This is the only item I would want in before converge; it is the packet's own bar ("a revive
   that half-succeeds is worse than one that fails").
2. **N3** — rebase onto `main` (6 commits, incl. s069) and re-run the gates. Anyone re-reviewing
   from `git diff main` must be told that the `"held"`/typing-guard hunks are drift, not this
   stream.
3. **N2** — add the modal to `NEEDS_HUMAN_PATTERNS` so the inert path is *surfaced* rather than
   invisible. Keeps the copilot auto-answer gated exactly as ruled.
4. **M15 / M20 / M22** — three assertions.
5. N4–N7, N9 — wording and hardening; safe to defer.

Add the PROBE-2 non-interactive condition to the s069 sequel before the seam goes live.

## 6. Hygiene

- Every mutant restored from `.bak`; `git status --porcelain .pi/extensions/pij` matches the
  session-start set exactly; no `.bak` and no probe test left in the tree; `tmux.ts` verified back
  to 3 `kill-pane` sites. Post-mutation suite re-run green (12 files / 685 passed / 2 skipped).
  One intermediate confirmation run showed `1 failed | 684 passed`; it did not reproduce on an
  immediate re-run of the identical set (685 passed) and the tree was verifiably unmutated, so I
  am recording it as flake, not as a finding. Worth knowing the focused suite is not 100% stable.
- The machine-wide daemon was not started, stopped, or restarted. No live seat was spawned; every
  live probe was chosen so no outcome could mutate state.
