# Plan 092 — The daemon creates its own `PIJ_HOME` before the lock write (pij#118)

**Status**: READY · **Mode**: Simple · **Complexity**: CS 2
**Stream**: `install-blocker` · **Branch**: `s092/install-blocker` · **Issue**: [pij#118](https://github.com/AI-Substrate/pij/issues/118)
**Research**: 📚 Incorporates findings from [`assets/research-dossier.md`](./assets/research-dossier.md)

---

## Business Specification

### The problem

`pij daemon start` cannot work on a machine where `~/.pij` has never existed. The daemon writes
`daemon.lock` with `flag: "wx"` into a directory that nothing has created, throws `ENOENT`, and
dies — while the CLI has already printed a success line and the tmux window that would have shown
the error is gone. The operator sees a success message, then `not running`, then a pane id that no
longer resolves. Nothing anywhere names a missing directory.

The defect is **first-run-only**. Once anything has created `~/.pij`, it never reproduces. Every
developer machine that currently works is immune, which is exactly why it survived: it is a failure
that is invisible from the inside, visible only to a new machine, a fresh clone, a CI runner, or a
new teammate.

### Why it matters

The pij control plane is unusable on a fresh install, and the failure is silent rather than loud.
Blast radius is every future first-run; severity to every current user is zero. That asymmetry is
the point — no amount of use by existing users will ever surface it.

### Who it affects

| Affected | Today | After |
|---|---|---|
| A new machine / fresh clone / CI runner | `daemon start` reports success; daemon dies instantly; no log survives | Daemon creates its home and comes up |
| An existing install (`~/.pij` populated) | Works | **Unchanged** — `recursive: true` is idempotent |
| A `PIJ_HOME`-overridden install | Works if the dir exists; dies if it does not | Works either way; the override is still honoured |

### Scope

**In scope**:

1. **Defect 1 of pij#118** — the daemon cannot create its own home. (Phase 1)
2. **Defect 2 of pij#118** — `ensureDaemonRunning()` reports success for a daemon it *launched*
   rather than one it *verified*. (Phase 2) — **scope extension ruled in by the prime**, on the
   grounds that a fix which makes the daemon start but keeps lying when it does not has fixed half
   the defect. The fresh-install experience is not "the daemon fails to start"; it is
   *"⚙ started one … it will drive control-plane sessions to bound"* followed by nothing ever
   binding — the user is told the mechanism is running **by the code that just failed to run it**.
3. **pij#169** — the `PIJ_HOME` resolution sweep: **seven** inlined `??` sites against one
   canonical `resolvePijHome()`. (Phase 3)

**Out of scope**: [pij#170](https://github.com/AI-Substrate/pij/issues/170) — `pij daemon start`
outside tmux returns a `⚠️` note that recommends the very command that just failed, and exits 0.
Filed, not fixed, at the prime's direction.

### The pattern this defect belongs to (prime's observation, 2026-08-08)

Defect 2 is the **third instance found today** of one shape:

| Issue | Reports success for… |
|---|---|
| pij#165 | a seat it *spawned*, which never bound |
| pij#161 | a seat the watchdog *initialised* as `responsive`, which was dead |
| pij#118 (defect 2) | a daemon it *launched*, which crashed on boot |

**Every one reports success for something it LAUNCHED rather than something it VERIFIED.** That
makes "report a verified state, not a launched one" the design principle for Phase 2 — and, per the
prime, worth more than the `mkdir` itself.

### Acceptance criteria

**Each criterion is labelled with its kind** (fleet practice adopted 2026-08-08, from stream s095
via the prime). Only a **behavioural** criterion can be evidence of a fix, and only if it has been
*run* against pre-fix code and *watched* to fail:

- **B — behavioural**: must FAIL on pre-fix code, and fail as a failure, not as a crash.
- **N — new-API**: cannot fail first (it would not compile). A declared compile-time exception,
  and **never** evidence that the behaviour is right.
- **P — preserved-property**: must pass BEFORE and AFTER. A regression guard, **never** evidence
  of the fix.
- **X — process**: not a test at all (a diff check, a gate run).

| id | Kind | Criterion | Evidence that closes it |
|---|---|---|---|
| AC-01 | **B** | `runDaemon()` boots against a `PIJ_HOME` that does not exist, creating it | ✅ **Watched fail**: `ENOENT … daemon.lock` pre-fix, execution log Task 2 (case A) |
| AC-02 | **X** | The new test **fails without the fix** | ✅ Recorded run, verbatim, in `assets/execution.log.md` |
| AC-03 | **P** | The existing-install path is unchanged | Case D passes before **and** after — correctly, and therefore **not** evidence of the fix |
| AC-04 | **B** | The `PIJ_HOME` **environment** override is honoured | ✅ **Watched fail**: `ENOENT` pre-fix, execution log Task 2 (case B) |
| AC-05 | **X** | No file outside this stream's ownership is touched, except the fleet ledger | `git diff --name-only` vs the merge base |
| AC-06 | **X** | `harness checks` passes | Per-sensor verdict, exit 0 |
| AC-07 | **P** (phase 1) → **B** (phase 3) | Daemon and CLI **agree** where the lock is under empty `PIJ_HOME` | Phase 1: case C passes before and after (guard). Phase 3: the rewritten case must fail against pre-sweep code, since the resolved value changes |
| AC-08 | ⚠️ **claimed B, evidenced N** | `pij daemon start` reports a **verified** daemon, never a launched one | **INSUFFICIENT — see the gap below** |
| AC-09 | ⚠️ **claimed B, evidenced N** | When the daemon does not come up, the operator is shown the pane's last output | **INSUFFICIENT — see the gap below** |
| AC-10 | **B** | All **seven** `PIJ_HOME` sites resolve through `resolvePijHome()` | ✅ **Watched fail**: the enumeration returned `7` before, `0` after |

#### ⚠️ The gap this labelling exposed — AC-08 / AC-09

All five Phase-2 tests target the **new pure** `daemonStartOutcome()`. **No test touches
`ensureDaemonRunning()`** — verified: `rg -n --hidden 'ensureDaemonRunning' --glob '*.test.ts' .pi/`
returns nothing. So the tests prove a helper that the untested code *happens to call*: delete the
poll loop and restore the old unconditional success line, and **every test stays green**.

That is a check that agrees with reality without being able to disagree — the exact shape of
pij#142 — committed on the phase whose entire subject is *not reporting success you have not
verified*. Writing the criterion did not make it true.

**Remediation (Phase 4)**: make `ensureDaemonRunning()` take injected dependencies
(`readStatus` / `sleep` / `capturePane` / `newWindow`) per the repo's own P3 inject-side-effects
pattern, so the reporting decision is testable, and pin the property **"an unverified outcome never
renders as a success note"**. Only then is AC-08 behavioural and mutation-provable.
| AC-04 | The `PIJ_HOME` **environment** override is honoured (no hardcoded `~/.pij`) | A test case that sets `process.env.PIJ_HOME` to a non-existent path and calls `runDaemon()` with **no** `pijHome` option, then restores it |
| AC-05 | No file outside this stream's ownership is touched, except the fleet ledger | `git diff --name-only` against the merge base lists only owned paths plus `docs/how/fleet/ledger.md` — an append-only shared surface every stream was explicitly instructed to add to (onboarding §6) |
| AC-06 | `harness checks` passes | Per-sensor verdict, exit 0 |
| AC-07 | An **empty** `PIJ_HOME` leaves the daemon and the CLI **agreeing** about where the lock is | Phase 1: both cwd-relative (unchanged). Phase 3: both `~/.pij`. The invariant is **agreement between writer and reader**, not the particular value — see below |

> **AC-07 is the crux of "all seven or none".** Under `PIJ_HOME=""` today, `daemon.ts:1094` and
> `cli.ts:235` *agree* — both cwd-relative — so the CLI reads the registry where the daemon writes
> it. Fixing the daemon alone would make the daemon write `~/.pij` while the CLI still reads `./`:
> **a live daemon the CLI cannot see.** A partial fix does not reduce the disagreement, it
> *relocates* it onto a pair that currently agrees. Phase 1 therefore preserves today's behaviour
> exactly, and Phase 3 changes all seven sites together or none.
| AC-08 | `pij daemon start` reports a **verified** daemon, never a launched one | A test drives the boot-outcome decision through a status sequence that never reaches `running` and asserts the note is a failure note, not `⚙ started one …` |
| AC-09 | When the daemon does not come up, the operator is shown the pane's last output | The failure note carries captured pane text; asserted in the same test |
| AC-10 | All **seven** `PIJ_HOME` sites resolve through `resolvePijHome()` (pij#169) | `rg -n --hidden 'PIJ_HOME \?\?' .pi/extensions/pij/` returns nothing; a test asserts every surface agrees for set / unset / **empty** |

**Prerequisite, stated rather than assumed**: `pij daemon start` only launches a daemon from
*inside an existing tmux session* — outside tmux it returns a warning and starts nothing
(`.pi/extensions/pij/cli.ts:1137-1140`). That is pre-existing and out of scope; AC-01…AC-07 are
about the daemon process, which this stream owns.

### Standing decisions (no modal question was asked — pij orchestration invariant 9)

| Question | Decision | Why |
|---|---|---|
| Workflow mode | **Simple** — one phase | A one-line production change plus one test |
| Testing strategy | **Real filesystem, real `runDaemon()`**, vitest, temp dir | The defect is a filesystem precondition; anything that abstracts the filesystem cannot see it |
| Mock usage | **None** | A mocked `fs` would pre-satisfy the missing precondition — precisely the blindness that let this bug live (dossier F-08) |
| Documentation | **Code comment at the fix site + this plan + ledger rows** | No user-facing behaviour change to document; the comment carries the *why*, which is not inferable from the line |

---

## Implementation Plan

### The fix, and why it is not the one the issue proposed

The issue proposes `mkdirSync(pijHome, { recursive: true })`. **That would ship a regression**,
found by the independent validation pass and then verified by running it:

| `PIJ_HOME` | `join(home, "daemon.lock")` | `mkdirSync(pijHome)` | `mkdirSync(dirname(lockPath))` |
|---|---|---|---|
| `""` (set but empty) | `"daemon.lock"` — **relative to cwd**, and today this *works* | `ENOENT` → **daemon dies** ❌ | `"."` → ok, behaviour unchanged ✅ |
| `/fresh/path` | `/fresh/path/daemon.lock` | creates ✅ | creates ✅ |
| existing home | unchanged | idempotent ✅ | idempotent ✅ |

So the fix is:

```ts
mkdirSync(dirname(lockPath), { recursive: true });
```

It needs no conditional, it says exactly what it means — *create the directory the lock lives in* —
and it cannot regress the empty-`PIJ_HOME` case. (Verified: `dirname("daemon.lock") === "."` and
`mkdirSync(".", { recursive: true })` succeeds.)

**Note on the empty-`PIJ_HOME` case itself**: an empty value putting the machine-wide daemon lock
in whatever directory you happened to be standing in is incoherent, and `daemon.ts:1094` (`??`)
disagrees with the canonical resolver `resolvePijHome()` (`core/agents/paths.ts:12-19`), which
treats empty as unset. **Not fixed here** — `cli.ts:235` uses the same `??` form, so "fixing" only
the daemon would make the two disagree about where the lock is, which is worse than the present
consistent oddity. Reported to the prime as an adjacent finding.

### Design decision — inline `mkdirSync`, not a new shared helper

The dossier (F-06) noted that `core/agents/paths.ts` already declares itself *"the one place that
computes"* `PIJ_HOME`, while `daemon.ts:1094` inlines its own resolution — so an `ensurePijHome()`
helper beside `resolvePijHome()` is the tempting "encode, don't document" move.

**Rejected for this change**, on three grounds:

1. **Blast radius.** The charter's hard constraint is that the existing-install path must be
   provably unchanged. A one-line insertion before an untouched acquire loop is trivially
   reviewable; a resolver refactor is not.
2. **It would have exactly one caller.** Every other `PIJ_HOME` writer already creates its own
   directory (dossier F-05); a shared "ensure" helper would encode a convention that only the
   daemon is missing.
3. **Wave risk.** Six streams are converging. A helper in `core/` widens this stream's file
   footprint for no behavioural gain.

Recorded here rather than silently — if the resolver is ever consolidated, this is the note that
says the option was seen and declined, not missed.

### Phase 1 — Create `PIJ_HOME` before lock acquisition, proven by a fresh-home regression test

**Files owned and touched**

| File | Change |
|---|---|
| `.pi/extensions/pij/daemon.ts` | add `mkdirSync` to the `node:fs` import and `dirname` to the `node:path` import; create `dirname(lockPath)` before the acquire loop |
| `.pi/extensions/pij/daemon.bootstrap.test.ts` | **new file** — the fresh-home regression test |
| `docs/plans/092-install-blocker/**` | this plan, its dossier, its execution log |
| `docs/how/fleet/ledger.md` | append-only fleet feedback (explicitly granted to every stream) |

A **new** test file rather than an edit to `daemon.test.ts`: this stream's test surface then cannot
collide with another stream's edits, and the file name states what it covers.

**Tasks**

| # | Task | Acceptance | AC |
|---|---|---|---|
| 1 | Write `daemon.bootstrap.test.ts` **first**: call `runDaemon({ pijHome, tickMs, deliveryMs, log })` against a path that does not exist; assert non-existence before, `daemon.lock` after; `stop?.()` in a `finally` | Test compiles and runs | AC-01 |
| 2 | Run it against **unpatched** `daemon.ts` and capture the failure verbatim | `ENOENT … daemon.lock` recorded in `assets/execution.log.md` | **AC-02** |
| 3 | Add `mkdirSync(dirname(lockPath), { recursive: true })` before the acquire loop, with a comment naming the first-run condition and why it is invisible | Test now passes | AC-01 |
| 4 | Add case: **env-driven** `PIJ_HOME` (set to a non-existent path, no `pijHome` option, restored after) | Green — proves env resolution, not just the injected argument | AC-04 |
| 5 | Add case: **empty** `PIJ_HOME` still yields a cwd-relative lock (run in a temp cwd; restore) | Green — proves the regression the naive fix would have caused is absent | AC-07 |
| 6 | Add case: an **existing, populated** home still acquires normally | Green — direct evidence of idempotence, rather than inferring it from the suite | AC-03 |
| 7 | Run the full existing daemon suite | Green, no new failures (baseline: 99 passed, 4 skipped) | AC-03 |
| 8 | Verify no unowned file was touched | `git diff --name-only` lists only the table above | AC-05 |
| 9 | `harness checks` | Exit 0, per-sensor verdict | AC-06 |
| 10 | Append fleet ledger rows (F-100, F-101, S-100, S-101) | Present in `docs/how/fleet/ledger.md` | — |

**Test seam** (already exists — nothing needs adding to production code for testability):
`runDaemon()` accepts `pijHome`, `tickMs`, `deliveryMs`, `log` and returns a `stop()` disposer
(`daemon.ts:1082-1092`, `:1196-1210`).

**Test hazards, and how each is handled**

| Hazard | Handling |
|---|---|
| `mkdtempSync` **creates** the dir, so the standard fixture pre-satisfies the bug | Use a **nested child** of the temp dir that is never created; assert `existsSync(home) === false` first — the assertion is what makes the test a test |
| Real timers leak and make the suite flaky | Explicit `tickMs`/`deliveryMs` of `60_000` (not an overflow-prone huge value — `setInterval` clamps above 2^31-1); `stop?.()` in `finally`, assigned so a throwing `runDaemon` still cleans up |
| Ambient `PIJ_TELEGRAM_ENV` could point the bridge at a real config and start a long-poll whose disposer does not stop the bot (`telegram/index.ts:82-85`, `:243-247`) | Delete and restore `PIJ_TELEGRAM_ENV` (and `PIJ_HOME`) around every case — the test must not depend on the runner's environment |
| Real `DaemonTmux` | Constructed but only exercised on tick; no tick fires within the test |

**Validation** — this plan was reviewed by an independent agent before implementation; findings and
dispositions in [`assets/plan-validation.md`](./assets/plan-validation.md). It found the
empty-`PIJ_HOME` regression above, which the original fix shape would have shipped.

**Do not change**: the `wx` exclusive-acquire loop, its `EEXIST` live-refuse / dead-reclaim
semantics, or the `if (code !== "EEXIST") throw e` guard. The guard is correct — widening it would
swallow real faults. The fix removes the *cause* of the `ENOENT`, never its report.

### Phase 2 — `pij daemon start` reports a **verified** daemon, not a launched one (pij#118 defect 2)

**The principle**: a created tmux window is evidence that tmux made a window, and nothing else.
`ensureDaemonRunning()` returns its success note the moment `tmux.newWindow()` succeeds
(`cli.ts:1153-1160`), so *every* crash-on-boot — not just the `ENOENT` of Phase 1 — is reported as
a successful start.

**Files owned and touched**

| File | Change |
|---|---|
| `.pi/extensions/pij/core/daemon/lifecycle.ts` | new **pure** decision function (below) + its export |
| `.pi/extensions/pij/core/daemon/lifecycle.test.ts` | cases for the new function |
| `.pi/extensions/pij/cli.ts` | `ensureDaemonRunning()` only — poll, then report what was verified |

**Design — keep the decision pure, keep the loop thin** (repo pattern P3/P8: logic in `core/`,
tested there; the bin owns I/O):

```ts
// core/daemon/lifecycle.ts
export type DaemonStartOutcome =
  | { readonly kind: "verified"; readonly pid: number }
  | { readonly kind: "unverified" };

/** Decide from a polled status whether a just-launched daemon is actually up.
 *  A created window is not a running daemon (pij#118 defect 2). */
export function daemonStartOutcome(status: DaemonStatus): DaemonStartOutcome;
```

`ensureDaemonRunning()` then, after a successful `newWindow`:

1. poll `readDaemonStatus()` on a short bounded budget (a small fixed number of attempts with a
   short sleep — total well under a second in the happy path, since the daemon writes its lock
   before anything else);
2. `verified` → report the note **with the verified pid**;
3. `unverified` → report a **failure** note carrying the pane's last output, captured via
   `capturePane(paneId, {}, runner)` from `adapters/tmux-keys.ts` (a standalone function — no
   daemon adapter needed).

**Tasks**

| # | Task | Acceptance | AC |
|---|---|---|---|
| 1 | Add `daemonStartOutcome()` to `lifecycle.ts` with tests covering `running` / `stale` / `absent` | Pure, no I/O | AC-08 |
| 2 | Rework `ensureDaemonRunning()` to poll and branch on the outcome | Happy path still returns a `⚙` note, now carrying the verified pid | AC-08 |
| 3 | On `unverified`, capture the pane and include its tail in the note | The operator sees the real cause instead of a success line | AC-09 |
| 4 | Keep the not-in-tmux and `newWindow` failure branches exactly as they are | Untouched in the diff (#170 covers the first; not this stream's fix) | — |

**Do not change**: `needsAutoStart`, `daemonStatus`, `planStop`, the `DAEMON_WINDOW_NAME`
convention, or the double-start guard (`daemonWindows().length > 0`). Only the post-`newWindow`
reporting path changes.

**Bounded-wait caution**: the budget must be short enough that `pij send` does not feel stalled, and
the `unverified` note must say the daemon *may still be coming up* rather than asserting it is dead
— reporting a verified state is the goal; over-claiming failure would repeat the original sin in
the opposite direction.

### Phase 3 — one `PIJ_HOME` resolver, all seven sites (pij#169)

`core/agents/paths.ts:1-6` states it is *"the one place that computes"* `PIJ_HOME`, and names the
three files it was written to replace — **all three still inline it**. The de-duplication landed as
an addition and never propagated.

| # | Site | Note |
|---|---|---|
| 1 | `.pi/extensions/pij/daemon.ts:1094` | named in the `paths.ts` header |
| 2 | `.pi/extensions/pij/cli.ts:235` | named in the `paths.ts` header |
| 3 | `.pi/extensions/pij/cli.ts:551` | |
| 4 | `.pi/extensions/pij/index.ts:48` | named in the `paths.ts` header — **missed in the original ruling; found by this stream** |
| 5 | `.pi/extensions/pij/core/daemon/watch.ts:67` | |
| 6 | `.pi/extensions/pij/adapters/focus-store.ts:53` | |
| 7 | `.pi/extensions/pij/telegram/index.ts:79` | |

**Tasks**

| # | Task | Acceptance | AC |
|---|---|---|---|
| 1 | Replace every site with `resolvePijHome()`, preserving each call site's own `opts ?? …` precedence where it has one (`daemon.ts`, `watch.ts`, `focus-store.ts`) | Behaviour identical for set and unset `PIJ_HOME` | AC-10 |
| 2 | Add a test asserting all seven surfaces agree for set / unset / **empty** | Empty now resolves to `~/.pij` **everywhere**, consistently | AC-07, AC-10 |
| 3 | Update the Phase-1 empty-`PIJ_HOME` case to the post-sweep expectation, keeping the **agreement** assertion | Green | AC-07 |
| 4 | `rg -n --hidden 'PIJ_HOME \?\?' .pi/extensions/pij/` returns nothing | The duplicate set is actually gone, not merely reduced | AC-10 |
| 5 | Amend the `paths.ts` header so it no longer describes a de-duplication that had not happened | Comment matches reality | — |

**Why the whole sweep or nothing** — see the AC-07 note above. This phase is the reason Phase 1's
fix shape is `dirname(lockPath)`: that shape is correct **both before and after** the sweep, so the
two changes can land, revert, or be reviewed independently without either breaking the other.

### Phase 4 — make the *reporting decision* testable, not the helper it delegates to

**Why**: Phase 2's five tests all target the new pure `daemonStartOutcome()`; **zero** touch
`ensureDaemonRunning()`. Delete the poll loop and restore the old unconditional success line, and
every test stays green. Found independently twice — by this orchestrator's AC audit and by the
cross-model review (`assets/reviews/phase-1-3-review.md`, verdict `FIX_REQUIRED`, one **high**
finding).

**The property is the actual deliverable of pij#118 defect 2; the `mkdir` is the smaller half**:

> **An unverified outcome never renders as a success note.**

**Files**: `core/daemon/lifecycle.ts`, `core/daemon/lifecycle.test.ts`, `cli.ts`
(`ensureDaemonRunning()` + its constants only). **Not** `daemon.ts` — it is the composition root and
two other streams hold declared regions in it.

**Design** — repo patterns P3 (inject side effects) and P8 (test the logic, not the wiring). Move
the poll loop **and both note strings** into `core/daemon/lifecycle.ts` as
`reportDaemonStart(ctx, probe)`, where `probe` injects `status()`, `sleep()`, `capturePane()` and
optional `budgetMs`/`pollMs`. `ensureDaemonRunning()` keeps only the wiring. The measured constants
(2500/50) stay as defaults.

**Tasks**: see [`assets/tasks/phase-4/tasks.md`](./assets/tasks/phase-4/tasks.md).

**The bar for this phase**: task 8 is the point of it — replace `reportDaemonStart`'s body with an
unconditional success note (the pre-fix behaviour), and a test **must** go red. If simulating the
old bug does not turn a test red, this phase has failed regardless of how many tests are green.

### Gate matrix

| Gate | Verdict | Basis |
|---|---|---|
| G1 Clarifications resolved | ✅ | Ordinal + scope both ruled by the prime; seventh site reported back and accepted |
| G2 Scope bounded | ✅ | Three phases, each tied to a numbered issue; #170 explicitly excluded |
| G3 Acceptance criteria testable | ✅ | AC-01…AC-10 each name their evidence |
| G4 Research grounded | ✅ | Dossier F-01…F-10; defect and fix both reproduced by running them; all seven sites enumerated by `rg --hidden` |
| G5 Risks named | ✅ | Below |
| G6 Rollback | ✅ | Three independent commits; each revertible alone (by design — see Phase 3) |
| G7 Domains | N/A | Domain mode off |

### Risks

| Risk | Mitigation |
|---|---|
| A test that passes before *and* after (the charter's central warning) | AC-02 makes the pre-fix failure a **recorded artifact**, not a claim |
| Regressing the existing-install path | `recursive: true` is idempotent; acquire loop untouched; full suite must stay green |
| Phase 3 relocates the empty-`PIJ_HOME` disagreement instead of removing it | All seven sites in one change; AC-10's `rg` check proves the set is empty, not merely smaller |
| Phase 2's bounded wait makes `pij send` feel stalled | Short fixed budget; the daemon writes its lock first, so the happy path resolves almost immediately |
| Phase 2 over-claims failure | The `unverified` note says the daemon may still be coming up, and shows the pane output rather than asserting a cause |
| `cli.ts` is a 5k-line file two other streams touch | Only `ensureDaemonRunning()` + two resolution lines are touched; the prime confirmed no other stream owns `cli.ts` (stream 2 owns `core/cli.ts`, a different file) |
