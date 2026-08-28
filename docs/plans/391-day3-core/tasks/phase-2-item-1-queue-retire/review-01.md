# Cold review — Phase 2 item 1 (queue retire + close sweep + drain guard + revive un-retire + PA totality + listing) — dlg-0006

**Reviewer**: cold cross-model (claude-opus-5 via copilot), seat `pij-mobile-reptile`
**Target**: `s391/item1-queue-retire` @ `6eee54b081e1650f740a760e4a8bde6f28c21758`
**Freeze verified**: `git rev-parse HEAD` = `6eee54b081e1650f740a760e4a8bde6f28c21758`, before and after every mutation.
**Base**: merge-base with `main` = `048a3e124919f6b5819b07f12f02acba17076f89` — matches the brief's `main@048a3e1`.
**Verdict**: **APPROVE** · **Highest severity**: medium · **Findings**: 8 (2 medium, 2 low, 4 info)

---

## §0 Scaffolding and limits — stated FIRST

**What I built to review this** (nothing committed; repo READ-ONLY except this file):

- Byte-exact pre-mutation copies of all four mutated sources in `/tmp/dlg0006-*.orig.ts`, used to prove every restore.
- A scratch `PIJ_HOME` (`/tmp/dlg0006-home-*`) seeded via `/tmp/dlg0006-seed.ts` with 9 messages across 3 recipients, driven through the real bin with `npx tsx .pi/extensions/pij/cli.ts` (never `npm link`, never the machine-wide `pij` binary for worktree code).
- Full suite run in background via `pij bg create`; log at `/Users/vaughanknight/.pij/pij-mobile-reptile/bg-mtbezzma-t71vjb.log`.

**The limit of each reproduction** — what I did NOT verify:

1. **No live-daemon proof.** The packet forbids touching the shared daemon. Every sweep/drain result below comes from `Daemon` composed over fake ports in `daemon.delivery.test.ts`, driven by me. I proved the *composition*, not a running daemon.
2. **The originating incident was NOT read.** `~/GitHub/pij/government/incidents/2026-08-27-cross-government-pane-misbind.md` lives in the MAIN checkout, which this seat must never enter. I verified the replay test's *shape* against the dossier's description of the incident (T003b), **not** that it faithfully reproduces the real event. The premise "recycled pane `%108` misdelivered mail" is taken on trust.
3. **No concurrency/race testing.** `retire()`/`unretire()` are wrapped in `this.tx()` and every `UPDATE` re-checks state in its `WHERE`, which is the correct shape for a compare-and-set. I did **not** drive two concurrent writers to prove it.
4. **`harness checks` and `just smoke` were not run** — the brief's gate list is vitest + tsc + biome. `just lint` was also not run; it is a known pre-existing RED baseline on this repo (observed on two unrelated branches in dlg-0001 and dlg-0004) and the brief did not list it.
5. **Windows / non-POSIX** delivery and SQLite behaviour not considered.
6. **`--older-than` was not fuzzed** — I exercised the documented units via the existing tests and the arg parser, not the full integer/overflow space.

**Items examined but NOT exhaustively proven** (so a gate I skimmed does not look like a gate I cleared): the `pij queue migrate` path is unchanged by this diff and I read it only far enough to confirm the `switch` refactor preserved its dispatch; the fs-backend branch of `runQueueRetire` I verified by its test only, not by driving an fs home.

---

## §1 Dim-0 mutation gate — 11 mutations, 9 RED, **2 surviving**

The brief mandated 5. I ran 11: the 5 mandated, 3 sub-mutations that decompose the coarse sweep mutation, 2 extra readings of an ambiguous mandate, and 1 that pins a self-fix the brief did not cover.

A GREEN stability baseline was established first: **70/70 passing** across the three target files (1.53s), so a lone RED is a signal and not a flake.

| # | Mutation | Target file | Result |
|---|---|---|---|
| **M1** | `retire()` skips the receipt write | sqlite-queue + daemon.delivery | **RED** — 5 tests |
| **M2** | Sweep predicate loosened to bare `dissolved` | daemon.delivery | **RED** — 1 |
| **M2a** | ONLY the `revivePendingAt` guard removed | daemon.delivery | **RED** — 1 |
| **M2b** | ONLY the `closeIntent === undefined` guard removed | daemon.delivery | **GREEN — SURVIVING MUTANT** |
| **M2c** | ONLY the `terminal?.disposition !== "requested"` guard removed | daemon.delivery | **GREEN — SURVIVING MUTANT** |
| **M3** | `unretire` reason filter (receipt subquery) removed | sqlite-queue | **RED** — `{requeued: 3}` vs `{requeued: 2}` |
| **M4** | Drain guard (T009b) removed, sweep kept | daemon.delivery | **RED** — 1, and *only* the guard test |
| **M5a** | `"queue retire"` entry removed from `PA_VERB_CLASSIFICATION` | pa-capability | **RED** — 2 |
| **M5b** | `case "retire":` removed from the `cli.ts` queue switch | pa-capability | **RED** — anti-vacuity floor |
| **M5c** | `paCapabilityVerb` reverted to chore-only (restores the bypass) | pa-capability | **RED** — 2 |
| **M6** | `applyAsOverride()` moved back below the PA gate | cli.integration | **RED** — exit 1 vs 2 |

Every mutation was reverted from the `.orig.ts` copy and verified two ways: `cmp` against the pre-mutation copy and `git diff --exit-code`. After all 11, the three target files re-run **70/70 GREEN** and HEAD is unmoved.

### Why the extra mutations were necessary

**M2 was too coarse to prove what the brief claims.** It deletes four guards at once, and the negative test asserts inside a `for` loop over four fixtures — vitest throws on the first failure, so a single RED tells you *some* guard matters, not that *each* does. Decomposing it (M2a/b/c) is what surfaced the two surviving mutants in §2.

**M4's value is in what stayed GREEN.** With the drain guard removed the incident-replay test still passed — the sweep alone prevents it — while the guard-only test went RED with `expected [ { pane: '%108', … } ] to deeply equal []`. That is the incident itself: mail injected into a recycled pane. The two halves are genuinely independent, which is exactly what aim 3 asked for. The guard test earns this by driving `deliverPass()` directly rather than `tick()`, so the sweep never runs, and by asserting the rows are still `queued` — proof the sweep did not silently do the work.

**M5 as written does not exist.** See F-3. M5c is the one that matters: it restores the real bypass, and notably the *scrape* test stays GREEN under it (because `paCapabilityVerb("queue","retire")` degrades to `"queue"`, which **is** classified). The scrape test alone does not protect the gate; the routing and refusal tests do.

**M6 covers a self-fix the brief did not mandate.** The orchestrator asked for the `--as` hunk to be reviewed with the same rigour, so it needed a mutation, not a reading.

---

## §2 The two surviving mutants (F-2) — why they survive, and whether it matters

Removing **either** the `closeIntent` guard **or** the `terminal.disposition` guard leaves the entire suite green.

The cause is fixture masking, and it is visible in the dossier's own T003 negative list:

| Fixture | `lifecycle` | `closeIntent` | `terminal.disposition` | Skipped by |
|---|---|---|---|---|
| `pij-pane-gone` | dissolved | **absent** | **absent** | `closeIntent` **and** `terminal` — either alone suffices |
| `pij-closing` | active | present | absent | the `lifecycle` guard |
| `pij-live` | active | absent | absent | the `lifecycle` guard |
| `pij-revive-pending` | dissolved | present | requested | `revivePendingAt` (pins M2a) |

No fixture isolates `closeIntent` from `terminal`, so neither can be individually killed. This is inherited from the task spec's three-negative design, **not** a coder deviation.

**Does the shipped code have a defect? No.** Both are one-directional safety interlocks: removing either can only ever cause the sweep to retire **more**, never something different. Per `AGENTS.md`'s policy-vs-brake test, they are brakes, and the shipped code is on the conservative side. That is why this is a test-gap finding rather than a blocking defect.

**Is the guarded state reachable? For `terminal`, yes.** All three production writers of `disposition:"requested"` (`daemon.ts:586`, `cli.ts:3820`, `core/session.ts:500`) write `closeIntent` and `terminal` in the *same* registry write, so "dissolved + requested + no closeIntent" is unreachable and the `closeIntent` guard is defence-in-depth. But the converse is reachable: `daemon.ts:579` persists `closeIntent` *alone* before pane teardown, so a seat can end up dissolved with `closeIntent` and a `terminal.disposition` of `unrequested-by-pij` (close requested, seat died unexpectedly first). Removing the `terminal` guard would retire that seat's revivable mail. It is load-bearing and unpinned.

---

## §3 Aim points

| # | Aim | Verdict |
|---|---|---|
| 1 | Terminality | **PASS.** `TERMINAL = {acked, retired}`; `OPEN_STATES` correctly includes `parked`. Every mutator carries a SQL-level `WHERE … state NOT IN ('acked','retired')` **in addition to** the read-side check, so terminality survives a TOCTOU. `claim` needed no change — it already filters `state='queued'` in both its SELECT (`:366`) and its UPDATE (`:375`). `claimUnread` returns `already-read` for retired, with an honest comment explaining why that arm was chosen over a new one. |
| 2 | Sweep predicate | **PASS with F-2.** Fires only on the full conjunction; enumerates via `queue.openRecipients()` (a `DISTINCT to_id` over open deliveries) rather than `registry.list()`, which is the point — dissolved seats are invisible to `list()`. `sqliteOf()` makes dual work identically, and the test is `it.each(["sqlite","dual"])`. |
| 3 | Incident replay + independent drain guard | **PASS.** Both halves independently proven — see M4 in §1. Replay runs ≥4 ticks with `now` advanced past every lease and asserts `sent` stays `[]`. |
| 4 | Revive un-retire (R-5 guards) | **PASS.** Only reason `recipient-closed` requeues (M3 RED proves it: the operator row would have come back). `requeued` receipt carries revive evidence including pane. Exactly-once delivery is counted, then a third tick asserts no further sends. `unretire` also resets `attempt=0`, so previously-parked mail gets a genuine new window. |
| 5 | PA totality | **PASS.** `queue retire` = refuse, `queue migrate` = allow, bare `pij queue` still allow, `queue --json` stays on the family key. Anti-vacuity floor `>= 2` present and effective (M5b). Scrape reads the real `switch` in `cli.ts` — the coder converted the if/else to a switch specifically so the scrape has something to read, which is the right direction. |
| 6 | Listing ergonomics (AC-15) | **PASS with F-7.** Latest-200 default, `showing N of M` footer, `--all`, `--since`, `--tail`, `--json {rows,total,shown}`. `runQueue` now uses `process.exitCode = 0; return` instead of `process.exit(0)`, so it is drain-safe. My Phase-1a **F-1 was actioned** — the one-line non-vacuity comment is present above the 812-row test. Also fixes a real pre-existing bug: positional detection now excludes values that follow `--to/--since/--last/--tail`, so `pij queue --tail 3` no longer treats `3` as a recipient id. |
| 7 | Scope | **PASS.** 13 files; `core/types.ts`, `core/revive.ts`, `skills/**`, `government/**` all untouched (verified by `git diff --name-only main...HEAD`). No new `SessionDescriptor` field — `revivePendingAt` already exists at `core/types.ts:307`. |
| 8 | Docs | **PASS with F-4.** `docs/how/pij.md` queue section added; domain source row + `Delivery state machine` concept added. |

---

## §4 Gates re-run independently

| Gate | Result |
|---|---|
| `npx vitest run .pi/extensions/pij/` | **171 files passed, 2 skipped (173); 3952 tests passed, 15 skipped (3967); exit 0.** Consistent with the coder's claim, and +17 vs the 3935 I measured myself on dlg-0004. |
| `npx tsc --noEmit` | exit 0 |
| `npx biome check` on all 9 changed source files | exit 0, "Checked 9 files, no fixes applied" |

---

## §5 Findings

**F-1 (medium) — an unfiltered `queue retire` silently retires every recipient's mail, with no undo.**
`pij queue retire --reason "oops-typo"` with no `--to/--from/--older-than/--state` retires everything. Driven through the real bin against a seeded scratch home: **`{"retired":9,"matched":9}` across 3 recipients, exit 0, no confirmation.** Because `retired` is terminal and `unretire` is **never exposed as a CLI verb** (the only call site is `requeueClosedRecipientMail`, hardcoded to reason `recipient-closed`), an operator-retired sweep cannot be reversed through any operator surface.
The sharp form: *this very change gave the harmless READ verb a 200-row safety default while leaving the destructive verb unbounded.* Mitigations do exist — `--reason` is mandatory, `--dry-run` works, and PAs are refused — but all are advisory.
**Recommend**: require at least one selector, or an explicit `--all-recipients`, before a no-filter retire proceeds.

**F-2 (medium, test-gap) — the `closeIntent` and `terminal.disposition` sweep guards are each individually unpinned.** Full analysis in §2. The shipped code is correct and conservative; the gap is that a future refactor could delete either guard and ship green, and the `terminal` one is load-bearing for a reachable state.
**Recommend**: two more fixtures — (a) dissolved + `closeIntent` + `disposition:"unrequested-by-pij"`, (b) dissolved + `terminal.requested` + no `closeIntent`.

**F-3 (low) — the brief's mandated M5 target does not exist.** The brief says *"Delete the `case "retire":` mapping in `paCapabilityVerb`"*, but `paCapabilityVerb` is a two-line if/return with no `case` statements. I executed all three defensible readings (M5a/M5b/M5c) rather than pick one. Worth correcting in the brief template, and worth recording that **M5a — the reading closest to the mandate — does not kill the mutation that actually restores the bypass** (M5c leaves the scrape test green).

**F-4 (low) — `docs/how/pij.md` documents a 3-condition sweep predicate; the code has 4.** The doc names `lifecycle:"dissolved"`, `closeIntent`, and `terminal.disposition:"requested"`, but omits `revivePendingAt === undefined` — precisely the guard the coder added as a self-fix to stop mail being re-retired during the pi/omp boot window. A reader implementing against this doc would reintroduce the bug that was just fixed.

**F-5 (info) — `pij queue` is absent from the top-level `USAGE`.** Zero matches on both `main` and HEAD, so it is pre-existing and not a regression. Noting it because this change adds a *destructive* subverb that is undiscoverable from `pij --help`; only `QUEUE_RETIRE_USAGE` (printed on error) documents the grammar.

**F-6 (info) — pre-existing mangled doc-comment on `summary()`.** `sqlite-queue.ts` has `/** Read-only snapshot for \`pij queue\`	/** Read-only snapshot for \`pij queue\`: …` — a duplicated opener with an embedded tab, present on `main` (so not introduced here). The coder edited the immediately adjacent signature line; a free cleanup was left on the table.

**F-7 (info) — `--tail` silently overrides `--all`.** `const limit = tail ?? (argv.includes("--all") ? undefined : 200)`, so `pij queue --all --tail 3` returns 3 rows with no diagnostic. Defensible precedence; a note or an `E-ARG` would be kinder.

**F-8 (info) — an existing s072 fixture's disposition was changed, and it is safe.** The self-adopt revive fixture moved from `disposition:"unrequested-by-pij"` / `evidence:"pid-missing"` to `"requested"` / `"pane-missing"` plus a new `closeIntent`, so the revive path would have retired mail to requeue. I checked this is not a coverage loss: `core/revive.ts` contains no `disposition` branching, and `unrequested-by-pij` retains broad coverage in `death-reconciler.test.ts`, `loop.test.ts`, `anomalies.test.ts`, `anomaly-sweep.test.ts`, `state.test.ts`, and `cli.integration.test.ts:1634`.

### Verified positives worth recording

- **The `--as` self-fix closes a bypass without opening a worse one.** The obvious hazard in moving `applyAsOverride()` above the gate is impersonation — if the gate resolved the caller from `PIJ_SENDER`, `--as` would let a PA masquerade as a non-PA seat and defeat the gate entirely. It does not: `paBinRefusal` (`cli.ts:898`) resolves identity through `resolveAmbientSelf` (`:1060-1079`), which uses `resolveAmbientIdentity()` + `registry.resolveIdentity()` and **never reads `PIJ_SENDER`**. (`ensureCurrentRegistration` at `:1099` does read it, but that is the inbox path, not the gate.) `--as` has exactly one consumer in the codebase, so the blast radius of moving it is confined.
- **Every read path structurally excludes `retired`** — `listUnread` (`:270`), `listQueued` (`:287`), `claim` (`:366`,`:375`) — so no surface can resurface retired mail as deliverable.
- **`summary()` has no default limit**, so the dual-write fs mirror in `runQueueRetire` diffs the complete row set and cannot silently miss rows beyond a cap.
- **Persist-before-mutate (P9) is respected in the revive path**: `revivePendingAt` is written to the registry *before* `requeueClosedRecipientMail` runs, so the sweep cannot re-retire mail in the window between them.

---

## §6 Rubric dimensions

| # | Dimension | Verdict |
|---|---|---|
| 0 | **Test quality (mandatory)** | **Strong, with one gap.** 9 of 11 mutations killed. Anti-vacuity floors present and effective; the drain-guard test is deliberately constructed to exclude the sweep; dual/sqlite driven via `it.each`. Docked for F-2's two surviving mutants. |
| 1 | Scope | Clean — no forbidden path touched, no descriptor field added. |
| 2 | Contract | Sound. Tagged-union/`Result` style preserved; `retire`/`unretire` return counts rather than throwing; the one `throw` (empty reason) is an internal invariant already guarded at the CLI. |
| 3 | Plan-alignment | Matches T001–T014 and the quoted rulings (R-5 guards, PA REFUSE, `parked` open-but-stuck, dual via `sqliteOf`). |
| 4 | ACs | AC-03/04/05/05b/05c/06/15 all evidenced. |
| 5 | Tests (doc/config) | Docs updated in both required places; F-4 is an accuracy gap, not an absence. |
| 6 | Domain-currency | `pij-messaging` gains both the source row and the `Delivery state machine` concept; the ASCII state diagram at the top of `sqlite-queue.ts` was updated to include `retired`/`unretire` rather than left stale. |
| 7 | Progress log | `execution.log.md` is honest — it records the RED/GREEN split, the 16 intended failures, and lists all four "logic review fixes" including the two self-fixes rather than quietly folding them in. |
| 8 | Regression | 3952 pass / 0 fail. `process.exit` removal in `runQueue` is drain-safe and consistent with the Phase-1a class fix. |
| 9 | Prompt-follow | Followed. Deviations (the `switch` refactor to feed the scrape) are justified and self-reported. |
| 10 | Learning | High. My Phase-1a F-1 was actioned verbatim; the PA totality mechanism was extended rather than special-cased; the coder found and fixed two real bugs during self-review. |

---

## §7 Verdict

**APPROVE.**

Neither medium finding is a defect in the shipped behaviour. **F-2** concerns brakes: removing either guard makes the sweep retire *more*, so the code as written is on the conservative side, and the gap is that a future edit could remove them and ship green. **F-1** is a hardening request against operator error on a verb that is already PA-refused, requires an explicit reason, and offers `--dry-run` — but it is the one item I would want addressed before this verb is in an operator's muscle memory, because it is destructive, machine-wide by default, and has no exposed undo.

The core claims all hold under mutation: terminality is enforced at the SQL level and not merely on read; the sweep and the drain guard are genuinely independent; only `recipient-closed` mail un-retires; and the PA gate resists the `--as` bypass the coder found in their own work.

**Final state**: HEAD `6eee54b081e1650f740a760e4a8bde6f28c21758` unmoved, tracked tree clean (`git diff --exit-code` passes), untracked delta vs the 15-line pre-review baseline = this file only. All 11 mutations restored byte-identical; target tests re-verified 70/70 GREEN afterwards.

---

## Re-review FX-01

**Scope**: scoped re-review of fix commit `42120dbff773091bf1f6b21a92e5f5a74dd3b523` (parent = the reviewed `6eee54b`, base `048a3e1`), against the five confirmations named in the re-review dispatch. Fix packet: `fix-01.md`. This section is **appended**; nothing above it was altered.

**Verdict: APPROVE.** All five confirmations hold. Highest severity of new findings: **low**. One new finding (**F-9**) is the *next rung of the same masking mechanism* that produced F-2 — it is not a failure of FX-01, which delivered exactly the two fixtures its packet scoped.

### §R0 Scaffolding, and the limits of this pass

Stated first, so a gate I did not examine never reads like a gate I found clean.

**Scaffolding used** — a scratch `PIJ_HOME` seeded with 9 deliveries across 3 recipients (`/tmp/dlg0006-seed.ts`, reused from the original pass) driven through the **real bin** (`npx tsx .pi/extensions/pij/cli.ts`, `PIJ_QUEUE_BACKEND=sqlite`), never the live daemon and never `~/.pij`. Homes: `/tmp/fx01-home-B1BQ`, `/tmp/fx01-home2-*`. Pre-mutation copies for restore proofs: `/tmp/fx01-daemon.orig.ts`, `/tmp/fx01-cli.orig.ts`. My own full-suite log: `/tmp/fx01-vitest.log`; the M2d′ mutant suite log: `/tmp/fx01-m2d-mutant.log`.

**What I did NOT check, and why:**

- **No live-daemon proof.** The sweep is exercised only through the harness's in-process daemon; the packet forbids touching the running daemon. Everything I say about tick behaviour is harness-observed, not production-observed.
- **F-9's reachability is read, not raced.** I establish the `active + closeIntent + terminal.requested` window by reading both production writers and observing that each performs the terminal write and `registry.dissolve()` as **two separate registry writes**. I did **not** construct a concurrent `pij close` / daemon-tick race to observe the window empirically, nor a crash-injection between the two writes.
- **No concurrency testing at all**, same as the original pass.
- **The originating incident doc was still not read** — it lives in the main checkout this seat must never enter.
- **`harness checks`, `just smoke`, and `just lint` were not run by me.** The coder's `execution.log.md` reports the repo baseline red outside this fix (unrelated Biome diagnostics, missing `pwsh`); that matches the baseline I independently observed in the original pass, but I am relaying their claim, not confirming it.
- **`--older-than` and `--state` were not fuzzed in combination with `--all-recipients`.** I exercised each selector's presence for the guard, not their interaction with the new flag.
- Non-dry-run `--all-recipients` prints **no** per-recipient breakdown. I confirmed this is what the packet specifies rather than a bug — but it means the dry run is the operator's only view of the spread.

### §R1 Freeze

`git rev-parse HEAD` = `42120dbff773091bf1f6b21a92e5f5a74dd3b523` on `s391/item1-queue-retire`; parent `6eee54b081e1650f740a760e4a8bde6f28c21758`; `git merge-base HEAD main` = `048a3e124919f6b5819b07f12f02acba17076f89` — all three as dispatched. Tracked tree clean at start and at close; untracked baseline 19 orchestration paths, delta at close = **zero** (this file was already present from the original pass).

### §R2 The five confirmations

#### (1) F-1 closed — CONFIRMED

Driven through the real bin against the seeded home (9 queued / 3 recipients):

| Probe | Result |
|---|---|
| `queue retire --reason "oops-typo"` (the original F-1 repro) | **exit 2**, `E-ARG: choose at least one selector (--to, --from, --older-than, --state) or pass --all-recipients`, plus a usage line that also names `--all-recipients` |
| queue state after that refusal | all 9 rows still `queued` — the refusal is genuinely read-only |
| `queue retire --all-recipients --reason confirmed --dry-run` | exit 0; `pij-alpha: 3` / `pij-beta: 3` / `pij-gamma: 3` then `would retire 9/9`; JSON adds `"recipients":[{"to":…,"matched":3}×3]`; DB unchanged |
| `queue retire --all-recipients --reason confirmed` | exit 0, proceeds |

The original F-1 was that this exact invocation returned `{"retired":9,"matched":9}`, exit 0, silently. It now refuses, and the refusal itself teaches the flag — `--all-recipients` appears nowhere else in the CLI, so the E-ARG line is its only discovery surface, which is the right place for it.

**No other CLI behaviour changed** — checked rather than assumed:

- `--to pij-alpha --reason scoped` → `retired 3/3`; the selector path is untouched.
- `--reason` still takes precedence: `queue retire --all-recipients` (no reason) → `E-ARG: --reason is required`, unchanged ordering.
- `queue --tail 3` and `queue --all` alone both behave exactly as before.
- `queue --all --tail` (no value) → the **pre-existing** `E-ARG: --tail requires a value`, not the new message — flag-value validation still runs first.
- The `runQueue` refactor is behaviour-preserving: `argv.includes("--all")` was hoisted to `const all` and reused at the `limit` expression; same predicate, same call.
- Bare retire with `--json` emits the plain-text E-ARG rather than JSON — but that matches the pre-existing `--reason is required` path exactly, so it is a consistency wart inherited, not introduced.

#### (2) F-2 closed — CONFIRMED, mutants killed

Both of my surviving mutants now die, and — importantly — each dies **naming its own new fixture**, because the coder added the `` `${to} must remain queued` `` assertion message. That is what converts the loop-over-fixtures assertion from "something broke" into "this specific guard broke", and it is the reason M2b and M2c are now distinguishable at all.

#### (3) F-4 closed — CONFIRMED

`docs/how/pij.md` now reads `lifecycle:"dissolved"`, a `closeIntent`, `terminal.disposition:"requested"`, **and no `revivePendingAt`** — four conditions, matching `daemon.ts:813-817` exactly. The added rationale ("persisted before pi/omp mail is requeued, so daemon ticks during the self-adopting boot window cannot retire it again") is correct and is the *why*, not just the *what*.

#### (4) F-7 closed — CONFIRMED

`queue --all --tail 3` → exit 2 `E-ARG: --all and --tail/--last cannot be combined; choose one`. Same for `--all --last 3`. Both verified at the bin **and** by mutation (MF2, MF2b below).

#### (5) Diff shape and gates — CONFIRMED

`git diff --name-only 6eee54b..42120db` = **exactly the 5 packet files** (4 source/doc + `execution.log.md`), 176 insertions / 22 deletions. No scope creep.

Gates independently re-run by me at `42120db`:

| Gate | Result |
|---|---|
| `npx vitest run .pi/extensions/pij/` | **171 files passed / 2 skipped; 3952 passed / 15 skipped; exit 0** |
| `npx tsc --noEmit -p .` | exit 0 |
| `npx biome check` on the 3 changed `.ts` files | exit 0 |
| target files re-run after every mutation restored | 116 passed / 1 skipped |

These match the coder's `execution.log.md` claims exactly, including the test **count**: 3952/3967 — identical to `6eee54b`. That is not a discrepancy; every new assertion was folded into an existing `it()` body (see F-11).

### §R3 Dim-0 — 9 mutations this pass

Baseline re-established GREEN before mutating. Each mutation applied alone, reverted before the next.

| # | Mutation | File | Result |
|---|---|---|---|
| **M2b′** | drop **only** the `closeIntent === undefined` clause → `false` | `daemon.ts` | **RED** — `pij-requested-no-intent must remain queued: expected [ 'retired' ] to deeply equal [ 'queued' ]` · **survivor KILLED** |
| **M2c′** | drop **only** the `terminal?.disposition !== "requested"` clause → `false` | `daemon.ts` | **RED** — `pij-close-unrequested must remain queued: expected [ 'retired' ] to deeply equal [ 'queued' ]` · **survivor KILLED** |
| M2a′ | drop **only** the `revivePendingAt` clause (regression check on the prior pin) | `daemon.ts` | RED — `pij-revive-pending must remain queued` · prior pin intact |
| M2d | drop the `lifecycle` clause entirely (`false ||`) | `daemon.ts` | RED ×2 — but **CONFOUNDED**: `TypeError: Cannot read properties of null (reading 'closeIntent')`. The clause doubles as the null-guard via `descriptor?.`, so the naive mutation proves only that *some* recipient has no descriptor. Discarded. |
| **M2d′** | `descriptor?.lifecycle !== "dissolved"` → `descriptor == null` — semantics dropped, **null-guard preserved** | `daemon.ts` | **GREEN — SURVIVES, suite-wide** (3952/3952) → **F-9** |
| MF1 | `if (!hasSelector && !allRecipients)` → `if (false)` | `cli.ts` | RED — `expected +0 to be 2` at `expect(unscoped.code).toBe(2)`; i.e. the exact F-1 defect returns |
| MF2 | `if (all && tailRaw !== undefined)` → `if (false && …)` | `cli.ts` | RED — `expected +0 to be 2` at the `--all --tail` arm |
| MF2b | `argv.includes("--all")` → `… && !argv.includes("--last")` — breaks **only** the `--last` arm | `cli.ts` | RED — proves the second loop arm is independently pinned, not shadowed by the first |
| MF3 | `recipientMatches` forced to `[]` | `cli.ts` | RED — `expected 'would retire 2/2 delivery(s) — reason…' to contain 'pij-x: 1'` |

MF2b deserves a note. The new F-7 assertion lives inside `for (const tailFlag of ["--tail","--last"])`, and vitest throws on the first failing arm — the exact shape that in the original pass let M2 report a false all-clear. Here I broke **only** the `--last` path and the test still went RED, so both arms are genuinely pinned. This time the loop hides nothing.

**Restore proof**: after the final mutation, `cmp` against both pre-mutation copies is byte-identical, `git diff --exit-code` passes on the whole tree, `git rev-parse HEAD` is unmoved at `42120db`, and the untracked delta against the 19-line baseline is empty. Both mutated target files re-verified GREEN afterwards.

### §R4 New findings

#### F-9 — low — the fourth guard, `lifecycle === "dissolved"`, is unpinned suite-wide

**Not a defect, and not a failure of FX-01.** The packet scoped exactly two fixtures and the coder delivered exactly those two. But the mechanism that produced F-2 — fixtures masking one another inside a single loop-over-negatives — has one rung left, and it is now the *only* remaining rung.

With the semantics-only mutation M2d′ (null-guard preserved), the **entire 3952-test suite stays green**. Walking the six fixtures explains why: every one of them is already skipped by *some other* clause, so none isolates `lifecycle`.

| Fixture | isolates which guard? |
|---|---|
| `pij-pane-gone` | none — skipped by `closeIntent` *and* `terminal` |
| `pij-closing` | none — skipped by `lifecycle` *and* `terminal` |
| `pij-live` | none — skipped by three clauses |
| `pij-requested-no-intent` *(new)* | `closeIntent` ✅ |
| `pij-close-unrequested` *(new)* | `terminal.requested` ✅ |
| `pij-revive-pending` | `revivePendingAt` ✅ |
| — *(missing)* | **`lifecycle` ❌** |

The missing shape is `active` + `closeIntent` + `terminal.disposition:"requested"` + no `revivePendingAt`. **It is reachable**, and by construction rather than by accident — persist-before-mutate splits the close into two registry writes in *both* production writers:

- `daemon.ts:582-591` — `registry.write({…, closeIntent, terminal:{disposition:"requested"}}, "close")` **then** `registry.dissolve(d.id)`.
- `core/session.ts:505-513` — the identical two-step.

Between those two writes the descriptor is exactly the un-guarded shape. A daemon tick can observe it because `core/session.ts` runs in the **CLI process**, concurrently with the daemon — and if a process dies between the two writes, the descriptor stays that way permanently. Applying the repo's own policy-vs-brake test: removing the guard makes the sweep retire *more*, never something different, so it is **a brake**, the shipped code is on the conservative side, and this is a coverage gap rather than a bug.

Two suggestions, the second cheaper than it looks:

1. Add one fixture (`active` + `closeIntent` + `terminal.requested`) to the same describe. That closes the last rung.
2. **Hoist the null-guard out of the predicate** — `if (descriptor === null) continue;` followed by four clauses that each test only one thing. Right now the first clause carries two responsibilities, which is precisely why the obvious mutation of it (M2d) returned a confounded RED and would have let a reviewer record a false all-clear. A guard that cannot be mutated cleanly cannot be tested cleanly.

#### F-10 — info — `--all-recipients` is silently ignored when a selector is present

`queue retire --to pij-alpha --all-recipients --reason x --dry-run` → `would retire 3/3`, not 9. The narrower selector silently wins over the explicitly machine-wide flag. The direction is safe (it retires *fewer*, so it is brake-shaped), but an operator who types both has stated two contradictory intents and is told nothing. Consider an `E-ARG` for the combination, mirroring the `--all`/`--tail` choose-one that FX-01 just added one function away.

#### F-11 — info — the new pins live inside tests named for other things

Every new assertion was folded into an existing `it()`, which is why the suite count is unchanged at 3952. Consequences: the `--all`/`--tail` conflict is pinned inside `it("pij queue emits all 812 rows through a piped stdout")` — an AC-16 pipe-boundary test — and the selector requirement inside `it("requires a reason, validates age syntax, and keeps dry-run read-only")`. A future regression reports under a name that does not describe it. Related and smaller: the F-1 test asserts `unscoped.out` contains each selector name, but `failQueueRetire` prints **both** the message and the usage line, so the assertion cannot tell which one satisfied it; it would stay green if the message were reduced to a bare "selector required".

### §R5 Verdict

**APPROVE** — `42120dbff773091bf1f6b21a92e5f5a74dd3b523`.

All five confirmations hold: F-1, F-2, F-4 and F-7 are closed; the diff touches exactly the five packet files; the full suite, typecheck and lint are green on my own independent runs. Both mutants I reported last pass are dead, and they now die *by name*.

The fix is well-shaped beyond its literal mandate in one respect worth recording: the added assertion message is what makes a loop-over-fixtures test diagnose rather than merely fail, and it is the reason M2b′/M2c′ produce useful REDs instead of an anonymous one. That is the generalisable lesson from F-2, and the coder encoded it rather than just satisfying it.

F-9 is the honest remainder — the same masking mechanism, one rung further, on the one guard whose negative case I can show is reachable by construction in two independent writers. It is a brake, so nothing ships broken; but it is unpinned across all 3952 tests, and the clause is currently un-mutatable without confounding it against the null-guard.

**Final state**: HEAD `42120dbff773091bf1f6b21a92e5f5a74dd3b523` unmoved; tracked tree clean (`git diff --exit-code` passes); untracked delta vs the 19-line pre-review baseline = zero. All 9 mutations restored byte-identical; both mutated target files re-verified GREEN afterwards.

**This re-review is a TERMINAL REPORT.** No mutations were run after it was written, and no pass remains open.
