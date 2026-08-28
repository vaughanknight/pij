# Cold-read verdict — packet C (sections 33, 35, E3, E5, 99)

**Reviewer**: `pij-only-oramen` (copilot / Claude Opus 5), cold — no prior context on s391.
**Candidate**: branch `s391/handover-v0.2.0-c` @ `68b6fc8` (pushed).
**Frame read**: `docs/handover/v0.2.0/{README,TEMPLATE,00-live-system,01-shipped-map}.md` @ `origin/main`.
**Code read at**: `d120c53` (the tag). `origin/main` was `358595d` when I read it (= remote `main`); I did not fetch.

---

## Scaffolding and the limit of this pass (stated before findings)

- I read every section with `git show 68b6fc8:docs/handover/v0.2.0/<file>` into a scratch dir outside the repo. **I created no worktree and wrote no file in this repo except this verdict.**
- The only build tool I executed is `node_modules/.bin/biome check <one file>` (read-only, no `--write`) to test section 35's lint claim.
- Live reads only: `gh api` / `gh pr view` (current GitHub state, **not** as-of-`d120c53`), and `pij spine events --since`. I did not touch the daemon or write to `~/.pij`.
- **I did NOT run** `npx vitest`, `just typecheck`, `just pij-skill-check`, `harness checks`, or `run-proofs.ts --smoke`. Therefore **every "test goes RED" / "mutant reds" claim in all five sections is UNVERIFIED by me**, as is 33 §7's classification of the four `harness checks` reds, 33 §4's merge-product gate numbers, and 35's "pwsh is preinstalled on ubuntu runners" question. Those are gaps in this pass, not clean results.
- Line refs were checked against `d120c53`. Where a section pins lines to a different sha (33 → `58c9cf1`), I confirmed the blob is byte-identical at both (`run-proofs.ts` = `c08cbe4` at each), so drift is real, not ref-choice.

**Severity key** (packet): `major` = a rebuilder would build the wrong thing or be blocked · `low` = imprecision · `info` = noted, no action needed.

---

## Verdict summary

| § | Could a competent stranger rebuild it, commit and push, without asking? | Blocking gap |
|---|---|---|
| 33 | **NO** | F-33-1 — the three `smoke-red*.log` files the section makes its evidence and its failure oracle are not on the branch, not on main, untracked |
| 35 | **NO** (by design + one real defect) | Blocked on OQ-1 (owner's account) — stated honestly, legitimate. Independently: **F-35-1**, `ci.yml` has two jobs, not one |
| E3 | **NO** | F-E3-2 / F-E3-3 — the ruled record shape is not type-representable and the required PASS text conflicts with the existing renderer; neither is named |
| E5 | **NO** (decisive) | F-E5-1 / F-E5-2 — both `--json` literals are attributed to the wrong commands, and the field inventories are swapped |
| 99 | **NO** for 3 of 15 rows; **YES** for the other 12 | F-99-1 — three grep anchors return zero hits in the file named |

---

## § 33 — watchdog smoke proof — **NO**

### F-33-1 (major) — the named evidence is not on the branch, and the section says it is

§1 cites `…/phase-16-item-33-watchdog-smoke-proof/evidence/{smoke-red.log,smoke-red-2.log,smoke-red-3.log,run-proofs-partial.patch,STATE-OF-PLAY.md}` and asserts "evidence on the branch". §5 makes it the failure oracle: "Failure looks like the three `smoke-red*.log` files."

`git ls-tree -r 5e982ea` lists **only** `evidence/STATE-OF-PLAY.md` and `evidence/run-proofs-partial.patch`. `git log --stat 5e982ea` = "2 files changed". The three logs are absent from `5e982ea`, from `origin/main`, and from every branch; `git ls-files --error-unmatch` on `smoke-red.log` → *"did not match any file(s) known to git"*. They exist only untracked in this worktree.

Three things make this worse than a stray path:
- the commit's own subject is `docs(item 33): evidence for handover — partial patch, **three red logs**, state of play`;
- the on-branch `STATE-OF-PLAY.md` repeats it: *"This folder: the partial patch … and the three red logs that proved each drift on clean main"*;
- `rulings.md:123` made them named evidence with a stated reason — *"Evidence: `run-proofs-partial.patch` + `smoke-red{,-2,-3}.log` (third log renamed — **a log name is a claim**)"*.

A stranger cloning the branch gets a section, a state-of-play doc and a commit message that all promise three files that are not there, and no way to see the failure signature §5 tells them to expect. Fix is one `git add`.

### F-33-2 (low) — 3 of 8 `run-proofs.ts` line refs are wrong; one badly

`run-proofs.ts` is byte-identical at `58c9cf1` and `d120c53`, so these are checkable exactly.

| cited | claimed content | actual at that line | real location |
|---|---|---|---|
| `:322/:330/:369/:375/:411` | unawaited `daemon.tick()` | `daemon.tick();` ×5 | ✅ **all exact** |
| `:304` | `new FsChannel(home)` (drift 2) | `lifecycle: "bound",` | the smoke block's channel is **`:1172`** |
| `:1217` | first-turn `pij report state done` assertion | `daemon.tick();` | **`:1209`** |
| `:1241` | `requireCli(home, [… "--command","compact"])` | `assertThat(target !== null, …)` | **`:1236`** |

`:304` is the one that matters: the smoke scenario is `:1169-1250`, so `:304` points into a *different* proof block 868 lines away. A rebuilder chasing drift 2 lands on the wrong scenario. (The assertion *texts* quoted in §1 are all correct — `"smoke first fire was not queued"` `:1204`, `"smoke compact pause failed"` `:1239`, `"smoke done report command missing"` `:1209`.)

### F-33-3 (low) — `core/watchdog.ts:419`

Cited as "the nudge body text (`pij report state done`)". `:419` is a comment line; the string is at **`:422`**.

### F-33-4 (low) — `harness/scripts/smoke.ts (:33)`

Cited as the line that "runs `…/run-proofs.ts --smoke`". `:33` is the string literal `"run-proofs.ts",` inside the `WATCHDOG_PROOF` path constant (`:27-34`); the invocation is **`:313`**, inside `runWatchdogSmoke()` (`:312`).

### F-33-5 (low) — the merge-product gate log is machine-local

§4 states the gate result as "(branch had 172 / 4160 / 0)". The branch carries no such log; `STATE-OF-PLAY.md` says it is `docs/plans/391-day3-core/kept-logs/vitest-phase16.log.txt` **"on the coder's machine"**. The *number* is independently corroborated by the frame doc (`00-live-system.md`: "Test suite at the tag: 172 files / 4160 tests / 0 failed"), so the claim is not unsupported — but README step 3 ("logs kept under the item's plan folder before the worktree is torn down") and §6's own E22 are not satisfied for the gate that matters most.

### Verified accurate in § 33 (checked, clean)

`adapters/channel-factory.ts:138` = `export function openChannel(` — **exact**; `DEFAULT_BACKEND = "sqlite"` with the *Amendment 4* comment at `:38-44` — exact; retro `.harness/records/retro/2026-07-29/005.md` does describe this sensor (DL-001, "the watchdog smoke sensor runs only run-proofs.ts --smoke"); `rulings.md` rows DL-018 (`:117/:120/:121/:122/:123`) and DL-020 (`:154`) match the section's narrative and quoted ruling **verbatim**; `logs/smoke-runner-final-rebased-2.log` contains exactly `watchdog-smoke: green` + `baseline-red[pwsh]:` + `baseline-red[OSC]:` on separate lines; `sensor-mutation-red-final.log` contains `"reason": "smoke first fire was not queued"`; `5e982ea` is `785550b` + exactly one evidence commit; 13 `logs/run-*.log` are present as claimed.

---

## § 35 — GitHub Actions has never run — **NO** (blocked on the owner by design; plus one defect)

The item is, by construction, not completable without Vaughan (§7 OQ-1: account-side Actions/billing). That is a **legitimate** template §7 answer, not a defect — I record the NO so the row is not misread as a clean YES. The one real defect:

### F-35-1 (major) — `ci.yml` has TWO jobs; the section says one, and the edit plan covers only one

§3: "`.github/workflows/ci.yml` — **one job** `check`, matrix `node: [22, 24]`, steps: …". At `d120c53` the file declares:

- `check` (ubuntu-latest, matrix 22/24) — every step §3 lists, **exactly as listed**, in order;
- **`windows-compat`** (windows-latest): `git config core.autocrlf false`, checkout, setup-node 24, `npm ci --min-release-age=null`, **`npm run windows:check`** (= `tsx harness/scripts/windows-compat.ts`).

§4's enable plan — (a) add `workflow_dispatch`, (b) name baseline reds in `check`, (c) keep `npm test` hard — never mentions `windows-compat`, which starts running the moment Actions is enabled. §6 itself names "windows-compat mirror of the same lint" as a current local red, so the job is known; the file description simply omits it. A rebuilder ships an incomplete change and gets an unexplained second red job on the first run.

### F-35-2 (low) — "32-FX (PR #33)"

§6 attributes the parallel-load red to "32-FX (PR #33)". Per `01-shipped-map.md`, **#33 is item 32 itself** (`fix(daemon): launch as Node's direct child …`); the FX PR in that family is **#29** (`day-3 15-FX`). The PR number is right for item 32; the `-FX` label conflates two things.

### F-35-3 (low) — "PRs #2–#34"

§1 says "PRs #2–#34 merged by the o-prime"; `01-shipped-map.md` lists **#1–#34**. (`00-live-system.md` says "all 34 PRs".)

### Verified accurate in § 35 (checked live, clean — this section's evidence is the strongest in the batch)

| claim | probe | result |
|---|---|---|
| workflow id 317915369, `state: active`, created 2026-07-22T04:57Z | `gh api …/actions/workflows` | ✅ exact (`2026-07-22T04:57:14Z`, path `.github/workflows/ci.yml`, sole workflow) |
| zero runs ever | `gh api …/workflows/317915369/runs` | ✅ `total_count: 0` |
| `gh run list --limit 50` → 0 rows | rerun | ✅ empty |
| no check suite on `d120c53` | `gh api …/commits/d120c53/check-suites` | ✅ `total_count: 0` |
| `actions/permissions` enabled/all | `gh api` | ✅ `{"enabled":true,"allowed_actions":"all"}` |
| `default_workflow_permissions: read` | `gh api` | ✅ exact |
| public, not fork, not archived, `main` unprotected, 0 rulesets | `gh api` | ✅ all five |
| standing rule at spine 24514 | `pij spine events` | ✅ `ruling` by `pij-relative-panther`, 2026-08-27T09:36:46Z, refs `ci-not-a-gate-today:repo-has-zero-actions-runs-ever(workflow-active, actions-enabled)`, `merge-on:local-gates+cold-review+live-proof` |
| last `ci.yml` change `9e2bd72 "…(#157)"` | `git log -- .github/workflows/ci.yml` | ✅ exact |
| `npm test` runs the whole include incl. `harness/scripts/*.test.ts`, **236 files** | `vitest.config.ts` include + `ls-tree` count | ✅ **exactly 236** |
| `npm run lint` RED on `producers/osc-7337-producer.ts` | **ran** `biome check` on that file | ✅ **3 errors** |

`pushed_at` has advanced (05:19:56Z → 05:33:06Z) — a moving value, correctly probe-stamped in the section; not a finding.

---

## § E3 — canary context abort — **NO**

### F-E3-1 (major) — §3 sends the rebuilder to the wrong file, twice

- *"PASS-line renderer (grep `canary PASS target=` in `core/cli.ts`)"* — that string has **zero hits in `core/cli.ts`**. It is `core/canary.ts:207`, in `renderCanaryPass()` (`:195`).
- *"`CanaryRecord["contextWindow"]` type … — add `"no-catalog"`"*, listed under the `core/canary.ts` bullet. The type is in **`core/platform/types.ts:139-161`**.

Both edits §2 requires live in files §3 never names.

### F-E3-2 (major) — the ruled record shape does not type-check, and the section doesn't say so

§2 rules the record as `{ expected: null, expectedLabel: null, observedLabel: …, source: "no-catalog", check: "unverified" }`. At `platform/types.ts:148-161` the declaration is:

```ts
readonly contextWindow?: {
    readonly expected: number;          // required, non-nullable
    readonly expectedLabel: string;     // required, non-nullable
    readonly observedLabel: string;
    readonly source: "pane-footer" | "unobservable";
    readonly check: "matched" | "unverified";
};
```

§3 instructs only "add `"no-catalog"`" to the `source` union. Two *other* required fields must also be widened to nullable. A stranger's first `just typecheck` fails with no guidance.

### F-E3-3 (major) — the required PASS text conflicts with the existing renderer; no change is specified

§2, §4 and §5 all require stdout `canary PASS … context=unverified(no-catalog)`. `renderCanaryPass` (`canary.ts:202-206`) already branches:

```ts
const context = record.contextWindow
    ? record.contextWindow.check === "unverified"
        ? ` contextTier=unverified (catalog: ${record.contextWindow.expectedLabel}; this harness publishes no context marker — not verified, not contradicted)`
        : ` context=${record.contextWindow.observedLabel} check=matched source=${record.contextWindow.source}`
    : "";
```

The `unverified` branch **cannot** emit `context=unverified(no-catalog)` — and under F-E3-2's `expectedLabel: null` it would render `catalog: null`. §3 describes this renderer as printing `context=<label> check=<check> source=<source>`, which is true only of the *matched* branch. The acceptance test in §4 is therefore unsatisfiable without a renderer change the item never names — and §6 flags `just pij-skill-check` as load-bearing on exactly this string.

### F-E3-4 (low) — E-rule citation does not resolve (packet check 2)

§6 cites **"E26 (provenance)"**. The handover `README.md` § *Rules that earned their place* contains no E26 (it has E22/E29/E34/E35/E36/E37/E38/E40/E42/E43/E45/E47). E26 appears only inside the encode brief's E33 row. Every *other* E-rule cited across this batch (E45×5, E22×2, E34×2, E35, E40) does resolve in the README.

### F-E3-5 (info) — §3 presents a paraphrase as code

`` `expectedContextWindow = contextMaxFor(descriptor.boundModel, deps.models)` ``; the code at `:4409-4411` is `const contextModel = descriptor.boundModel; … contextMaxFor(contextModel, deps.models ?? [])`. Faithful, but backticked as if quoted.

### Verified accurate in § E3 (checked, clean)

Line refs are otherwise **unusually good**: `cli.ts:4352-4358` = `failCanary` returning `exitCode: 3` — exact; `:4407-4418` = the context pre-check, first and last line exact; `:4360` = `FinalizeCanaryInput`; `:4421` = the `evaluateCanary({` call; `:4433-4445` contains the spine event with `"canary:pass"` at `:4441`; `:4477` = `case "canary": {`. `canary.ts:10` = `CANARY_CONTEXT_ERROR` — exact; `:129-160` is the context branch; `:151-156` the contradiction refusal. `core/cli.test.ts` does pin the refusal — `it("distinguishes a missing catalog window from an unobservable pane footer")` at `:7582`, asserting the exact `E-CANARY-CONTEXT: … has no catalog context window …` string with `exitCode: 3` at `:7601-7607` (cited range `7576-7610` covers it). `canary.test.ts:200-280` is inside a 287-line file and covers `evaluateCanary`. Spine **23930** and **23932** exist verbatim (`finding` / `finding` with ref `corrects:23930`), and `government/canaries/s391.md:6-7` corroborates the story. §1's explicit reconciliation — *"an earlier build aborted before dispatch with exit 0 — the row's wording; the finalize-leg refusal is the surviving defect at the tag"* — is **correct and well-flagged**: at `d120c53` the refusal is post-nonce with exit 3, exactly as described.

---

## § E5 — `state`/`list --json` — **NO** (decisive)

### F-E5-1 (major) — both `--json` literals are attributed to the wrong command

| §3 says | actually at `d120c53` |
|---|---|
| `state --json` literal at `:~2905-2960` | **`list --json`** — inside `case "list": {` (`:2861`); literal `:2900-2963`, first field `id: d.id` |
| `list --json` literal at `:~5885-5930` | **`pij node show`** — inside `case "node-show": {` (`:5869`); `const card = {` at `:5890` |
| `case "state"` `:~3676` → the literal at `:~2905` | impossible: `:2905` is 771 lines *earlier*, inside another case. The real `state --json` literal is **`:3694-3747`** |

Both "two hand-maintained object literals" the item exists to unify are misidentified. A stranger edits `list` and `node show` and never touches `state`.

### F-E5-2 (major) — the field inventories are swapped, which inverts §1's own defects

Authoritative sets at `d120c53` (extracted at exact indent depth from the exact ranges):

- **`state --json`** (`:3694-3747`, 21 keys): `activity boundModel cwd daemonLastTickAt daemonTickAgeMs daemonTickStale degraded degradedReason effort failureReason harness id lastEventAt lifecycle liveness orchestrationRole parent pid state terminal watchdog`
- **`list --json`** (`:2900-2963`, 30 keys): `activity bindHealth boundModel boundProvider currentAssignment currentTask dataDir effort failureReason folder id lastEventAt liveness oldPrime orchestrationRole parent pid planId prime semanticState state stateNote statusAt statusNext statusPrev statusSeq statusWrittenBy terminal unadopted watchdog`

§1's list-under-"state" is **exactly the real `list --json` minus {id, folder, parent, unadopted}**; §1's list-under-"list" is **exactly the `node show` card**. Consequences:

| §1 claim | truth at `d120c53` |
|---|---|
| "`state --json` … **no `id`**, `harness`, `lifecycle`, `parent`" | **false** — all four present; `id` is its *first* field |
| "`list --json` … **no** `dataDir`, `boundProvider`, `failureReason`, `bindHealth`, `terminal`, `watchdog`, `prime`, `oldPrime`" | **false** — all eight present |
| "(Part of E5 has since moved: `statusAt` is on both at the tag)" | **false** — `state` has no `statusAt`; `list` does. The original encode row is **still exactly true** |
| "`paneId` is on `list` but not `state`" | **false** — on **neither**; only `node show`. The encode row's "NEITHER carries the pane id" **still holds** |
| "a PA parsed `list --json` for `failureReason` (only in `state`)" | **inverted** — `failureReason` is on **both** |

Independent corroboration that the real `state --json` is the one I measured: `government/canaries/s391.md:7` records identity "from registry (`pij state --json`): harness=claude … parent=… cwd=…" — three fields §1 says `state --json` does not have. `00-live-system.md`'s restart step 2 likewise filters `pij list --json` on `orchestrationRole` and `liveness`, both real `list` fields.

**Net effect**: the section retires two defects that are still open (`statusAt`, `paneId`) and invents two that are not (`state` missing `id`; `list` missing `failureReason`).

### F-E5-3 (major) — MUT-E5b is not a mutant

*"give `list` its own literal again lacking `failureReason` → the list test RED"* — `list --json` **already emits** `failureReason` at the tag. As written the mutant restores a state that is indistinguishable from today for that key. (MUT-E5a's `paneId` is sound in form — neither surface emits it — but §1's premise for it is wrong.)

### F-E5-4 (low) — `docs/how/pij.md` has no field table to update

§3: "`docs/how/pij.md` — documents both `--json` shapes (update the field table)." There is no field table, and no occurrence of `statusAt`, `paneId`, `dataDir` or `bindHealth` anywhere in the file. The only mention is `:684-689`: `pij state pij-worker --json   # boundModel, failureReason fields`. The doc must be **written**, not updated.

### F-E5-5 (low) — §7's open question would silently reverse a recorded in-code ruling

§7/MUT-E5c ask `parent` vs `parentId`. Both surfaces already emit `parent: effectiveParent(d)`, and `cli.ts:2952-2961` carries an explicit rationale: *"Deliberately `effectiveParent`, the SAME notion and the SAME key name `node show` projects — a raw `parentId` here would disagree with `node show` for every spawned-but-never-linked seat and buy back the class it was added to remove."* The section does not mention this; a rebuilder answering "emit both" may reintroduce the class the comment says was removed. (The descriptor field name is confirmed: `core/types.ts:184` `readonly parentId?: SessionId | null`.)

### F-E5-6 (low) — machine-dependent verification (packet check 3)

§5 runs `pij state pij-relative-panther --json` — a specific live seat on this fleet. Use `$(pij whoami)` or a placeholder.

### Verified accurate in § E5

The encode row is quoted faithfully from `government/briefs/encode-candidates-2026-08-27.md:11`. `case "list"` `:2861` and `case "state"` `:3676` are **exact** (only the literals paired with them are wrong). `cli.integration.test.ts` exists and is the right harness precedent. **The design in §2 is sound and I would keep it verbatim**: one `descriptorJson(d, extras)`, additive-only, and a field-set-equality test driven through the real CLI over a sandbox `PIJ_HOME` rather than a unit of the helper (correctly invoking E34). Only §1/§3's inventory of *what is where* is wrong.

---

## § 99 — carried lows — **NO** for 3 rows of 15; **YES** for the other 12

### F-99-1 (major) — three grep anchors return zero hits in the file named, at `d120c53`

| row | anchor as written | hits | where it actually is |
|---|---|---|---|
| 15 G-1/G-2 | `cli.ts` grep `interleaveReviveMarkerForTest` | 0 in `core/cli.ts` | **`.pi/extensions/pij/cli.ts:271, 2502, 2628`** |
| 15 G-4 | `cli.ts` revive/un-retire path, grep `requeue` | **0 in *either* `cli.ts`** (case-insensitive) | only `adapters/sqlite-queue.ts`, its test, `cli.integration.test.ts` — **no resolvable anchor for the CLI warning; this row is not actionable as written** |
| 16 H-1 | `daemon.test.ts` fixture, grep `noticeRegistryView` | 0 in `daemon.test.ts` | it is a *production* helper (`core/binding.ts:302`). The sensor is **`daemon.test.ts:1751`**, `it("adds no archive scan for lifecycle notice routing on the 600ms tick")` |

Compounding it: the repo has **both** `.pi/extensions/pij/cli.ts` and `.pi/extensions/pij/core/cli.ts`, and the table's bare `cli.ts` means the *first* in rows 15 G-1/G-2 but the *second* in row 32 P-4 (`bgNotifyArgv`, 2 hits in `core/cli.ts`). Same token, two files, no disambiguation.

### F-99-2 (low) — "the review files were never merged" is no longer true

§1: *"the review files were never merged; they live in the s391 worktree and are quoted here with the finding ids."* They are on `origin/main` now: PR #36 merged **2026-08-28T05:30:04Z**, 36 seconds after `68b6fc8` was authored (05:29:28Z) — and they were already on the pushed `s391/plan-folder-v0.2.0` before that, which the packet names as an acceptable pointer target. I resolved **all 15 finding ids** in those files (G-1…G-7 in `phase-6-item-15…/review-01.md`; H-1/H-3/H-6/F-4 in `phase-7-item-16…`; P-2/M-1 in `phase-13-item-31…`; P-4/W-3/W-5 in `phase-15-item-32…`). The sentence tells a stranger the sources are unreachable when they are one `git show` away — the only machine-dependency claim in the batch that resolves *in the reader's favour*, but it is still wrong and should be flipped to a pointer.

### Verified accurate in § 99 — 12 rows, several exactly

- **15 G-3** — `adapters/spine-store.ts:273-279`: `reclaimIfDead(this.lockFile, "events.lock", …)` → `reclaims.push(…)` → `if (Date.now() >= deadline) return err("E-NOREG", …)`, returning **before** the receipt append. The row's description is precise, including "fails safe (the lock is gone); the audit line is lost". PR #27 = item 15, confirmed against `01-shipped-map.md`.
- **15 G-1/G-2 (substance)** — `PIJ_TEST_HOLD_LOCKS_ON_START` guard at `daemon.ts:1950` with no scratch-dir check ✅ (only the `cli.ts` half of the anchor is wrong, F-99-1).
- **15 G-6** — "three `FsRegistry` construction sites": `index.ts` ×2 + `telegram/index.ts` ×1 = **exactly 3** ✅.
- **15 G-7** — `fs-registry.ts:251`, the "locks are never stolen … remove the file manually" throw sits **inside** the `if (reclaimed !== null)` branch, i.e. immediately after reclaiming and deleting that file ✅ exact.
- **16 H-1 (substance)** — matches `review-01.md:714`: "the new archive sensor covers the death-sweep site but not `lifecycleNoticeRecipient`" ✅.
- **16 H-6** — "503 ms @ 4000 dead seats": `review-01.md:611` reads `N=4000 candidates=4000 -> 503.2 ms` ✅ exact.
- **16 H-3 / 16 F-4** — `recipientCandidate` (3 hits, `core/binding.ts`), `reportBindRefusal` + `flaggedHuman` (2 / 3 hits, `core/daemon/loop.ts`) ✅ all resolve.
- **31 P-2** — `watchdog-manager.ts:663` `const livenessWindowMs = Math.min(cfg.intervalMs, STALE_AFTER_MS);` with `STALE_AFTER_MS = 60_000` (`core/state.ts:22`) ✅, and **"undocumented" is true**: `docs/how/pij-watchdog.md:277-280` documents a *different* mechanism — the legacy descriptor-based `gone quiet (stalled)` **detector**, threshold `max(60 seconds, intervalMs)` — the opposite direction from this **clear** window. Nicely precise row.
- **32 P-4** — `bgNotifyArgv` present in `core/cli.ts` ✅.
- **32 W-3** — `daemon.test.ts:2916` `expect(probe.exit.signal === "SIGHUP" ? 129 : probe.exit.code).toBe(129);` ✅ the "tautology on the exercised path" characterisation is exact.
- **32 W-5** — `daemon.test.ts:2718` `signal: "SIGHUP" | "SIGTERM"` while `it.each` passes `"SIGINT"` at `:2896` ✅ exact.
- **DL-020** — `daemon.ts` `import.meta.url ===` guard present ✅; matches `rulings.md:154` verbatim.

---

## Cross-check 5 — frame docs (`00-live-system.md`, `01-shipped-map.md`)

No substantive contradiction. Two alignments worth recording, two small mismatches (already filed):

- 33 §4's `172 / 4160 / 0` **agrees** with `00-live-system.md` ("Test suite at the tag: 172 files / 4160 tests / 0 failed") — so F-33-5 is a missing-artifact problem, not an unsupported number.
- 35 **agrees** with `00-live-system.md` ("GitHub Actions has never run in this repository (0 runs ever); all 34 PRs were gated locally (item 35 in this handover)").
- Mismatches: F-35-3 ("#2–#34" vs #1–#34) and F-35-2 ("32-FX (PR #33)" vs `01-shipped-map.md`'s "#33 … day-3 item 32").
- E5's §1 field claims **contradict** `government/canaries/s391.md:7` and `00-live-system.md`'s restart step 2, both of which use fields E5 says the surfaces lack — see F-E5-2.

---

## What I did NOT adequately examine

Stated so a gate I did not open cannot be mistaken for one I found clean:

1. **Every mutant and every "test goes RED" claim** — MUT-33a/b/c/d, MUT-35a (declared none), MUT-E3a/b/c, MUT-E5a/b/c, and 99 §4's G-1/G-2, H-1, W-5 mutants. I ran no test.
2. **33 §7's four `harness checks` reds** — I did not run `harness checks`, so I cannot classify them as pre-existing on clean main.
3. **33's proof behaviour** — I did not run `run-proofs.ts --smoke`; I read the branch's logs rather than reproducing them, so "green" and "red" are the coder's claims corroborated by committed log bytes, not by my execution.
4. **35's runner facts** — whether `pwsh` is preinstalled on `ubuntu-latest`, and whether `npm test` passes on a CI runner, are untested. Only the *repo-side* facts are verified.
5. **35 §7 OQ-1** — account/billing state is invisible to me (same 404-without-billing-scope limitation the section reports).
6. **E5's `assignments[]` sub-shape and `node show`'s full contract** — I extracted the card's top-level keys only; the nested `assignments[]` object keys (`id task projectSlug open state verified verifiedBy stateSeq`) were read but not cross-checked against §4's requirement.
7. **99's H-6 performance claim in situ** — I verified the number is in the review file, not that it still reproduces at `d120c53`.
8. **`git diff bf1827c..785550b`** — I did not read the item-33 diff hunk-by-hunk, so §4's "Diff every assertion against base: none deleted" is unverified by me. (Given my stored practice: a declaration-list diff would not have been enough here anyway — assertions deleted from a *surviving* test need a line diff.)

---

## Recommendation

Five sections, five NOs — but they are not equal. Ranked by what a fix costs:

1. **E5** — needs a re-survey before it is usable; §1 and §3 must be rewritten against the real `:3694-3747` and `:2900-2963` literals. The *design* in §2 survives intact.
2. **E3** — three named additions: the renderer file + branch, the two non-nullable fields, and the `platform/types.ts` location.
3. **35** — add `windows-compat` to §3 and to the §4 plan. Everything else in this section is exact and it is the best-evidenced of the five.
4. **33** — commit the three `smoke-red*.log` files (and ideally the vitest gate log); correct four line refs.
5. **99** — repair three anchors, disambiguate `cli.ts` vs `core/cli.ts` throughout the table, and flip §1's "never merged" to a pointer. The other twelve rows are accurate, several exactly so.

**This pass is CLOSED.** This report is terminal: I ran no mutation after writing it, and no further pass is open on my side.

---

# Re-read

**Scope**: fixes only, `68b6fc8..bb637f7` (parent chain `68b6fc8 → bcaf79d → bb637f7`), plus the item-33 evidence commit `29c329f` and PR #40. `origin/main` was `b564ae2` when I read it.

`bcaf79d` also adds four **new** sections (25, 26, 27, 28). **They are outside batch C and I did not review them** — a stranger must not read this file as covering them.

Same scaffolding as the first pass: `git show` only, no worktree, no tests run, no tracked file touched but this one. Where the fold claimed a finding closed, I re-ran my **original probe** rather than reading the fix's assertion.

## Fix verdict

| § | Fixes correct? | New findings introduced |
|---|---|---|
| 33 | **YES** — F-33-1…F-33-5 all closed | **RR-33-1** (low) — new pointer `evidence/runs/` does not exist |
| 35 | **YES** — F-35-1…F-35-3 all closed | none |
| E3 | **YES** — F-E3-1…F-E3-5 all closed | **RR-E3-1** (low) — new renderer branch has an ordering trap the text implies but does not state |
| E5 | **YES** — F-E5-1…F-E5-6 all closed, field sets now byte-match my own extraction | **RR-E5-1** (major) — the ruled UNION omits two keys `node show` emits today · **RR-E5-2** (low) — card range off by 2 |
| 99 | **YES** on the anchors — **but see the correction below: one of my three original claims was wrong, and the fix inherited the error** | **RR-99-1** (low) — "no other anchor resolves" is false |

---

## ⚠ Correction to my own first pass (F-99-1, row `15 G-4`)

**I was wrong, and the fold over-corrected on my bad input. This is my error, not the author's.**

I reported: *"`requeue` — 0 hits in EITHER `cli.ts` (case-insensitive) … no resolvable anchor for the CLI warning; this row is not actionable as written."*

That was an artifact of my own probe. I ran `git grep -ni requeue -- .pi/extensions/pij | head -10`; git grep emits path-sorted, so `head -10` cut the list off inside `cli.integration.test.ts`, **before** `.pi/extensions/pij/cli.ts`. Re-run untruncated:

```
.pi/extensions/pij/cli.ts:36        ← thirty-six hits
.pi/extensions/pij/adapters/sqlite-queue.ts:6
.pi/extensions/pij/cli.integration.test.ts:16
…
```

The original anchor **did** resolve, in the bin `cli.ts` — the same file as the G-1/G-2 anchor. The real defect in that row was only the `cli.ts` / `core/cli.ts` **ambiguity**, which is now closed. Precisely the trap this repo's own AGENTS.md names: *"a probe's default scope gets reported as a property of the repo."* I hit it with `head` instead of `--hidden`.

### RR-99-1 (low) — consequence: the new G-4 text overstates the gap

The rewritten row says the stderr line must be re-derived from the review because *"no other anchor resolves"*. Two anchors do resolve:

- `grep requeue` in `.pi/extensions/pij/cli.ts` → 36 hits, including the warning itself;
- the item 15 review's own G-4 (`review-01.md:554`) supplies a **precise, still-working** grep string — *"The CLI revive-requeue non-fatal change (`cli.ts:2255-2259`) has no test — `grep "was requeued but its spine note failed"` finds only the production line"* — which at `d120c53` resolves to exactly one line:

```
.pi/extensions/pij/cli.ts:2277:  `warning: dispatch ${previous.id} was requeued but its spine note failed (${noted.code}: ${noted.message})\n`,
```

Suggested row text: cite `.pi/extensions/pij/cli.ts:2277` (the bin) with grep `"was requeued but its spine note failed"`. The new refs the fold added — `unretireDispatch` import `:194`, `requeueClosedRecipientMail` `:2226` — are both **exact**, so the row is now actionable either way; only the "no anchor resolves" sentence is wrong.

**Free upgrade while in this row**: the same review pins G-6's three sites exactly, and all three are still exact at `d120c53` — `index.ts:110`, `index.ts:261`, `telegram/index.ts:313`. The table still says "grep `new FsRegistry(`".

---

## § 33 — fixes **YES**

Original probes re-run:

- **F-33-1 CLOSED, and the evidence is byte-faithful — not retyped.** `29c329f` adds `evidence/{smoke-red.log.txt, smoke-red-2.log.txt, smoke-red-3.log.txt, vitest-phase16.log.txt}`. I `cmp`'d each `.txt` against the untracked original `.log` in this worktree: **all three BYTE-IDENTICAL**. `5e982ea` is an ancestor of `29c329f`. The same four blobs are on `origin/main` under `kept-logs/` (PR #40, merged 05:53:04Z) — I compared blob SHAs, **identical on both**, so the section's two pointers agree.
- **F-33-5 CLOSED as a bonus** — `evidence/vitest-phase16.log.txt` (625 lines) is now committed and reads `Test Files 172 passed | 2 skipped (174)` / `Tests 4160 passed | 15 skipped (4175)`. The "172 / 4160 / 0" shorthand is now backed by an artifact. (Info: the shorthand does not convey the 2 skipped files / 15 skipped tests; `00-live-system.md` uses the same shorthand, so this is consistent, not a defect.)
- **The gitignore explanation checks out** — `.gitignore:35-36` is exactly `logs` / `*.log`, so the original omission was mechanical, not careless. (The 37 files under `logs/` predate it as force-adds; once tracked, the ignore no longer applies. Both facts are true at once.)
- **F-33-2 CLOSED** — `:1172` (smoke scenario's `new FsChannel`), `:1236` (`requireCli … "--command","compact"`), `:1239` (the assertion), `:1209` (`pij report state done`), scenario span `:1169-1250` — every one matches my own extraction exactly, and "byte-identical at 58c9cf1 and d120c53" is now stated in-line.
- **F-33-3 CLOSED** — `core/watchdog.ts:422` ✅.
- **F-33-4 CLOSED** — `WATCHDOG_PROOF` `:27-34`, invocation `:313` inside `runWatchdogSmoke()` `:312` ✅ all three exact.
- §4's new "37 tracked files" is **exact** (37 files under `logs/`, of which 13 are `run-*.log`).

### RR-33-1 (low) — new broken pointer, and it contradicts §4 two paragraphs later

§1 now reads *"plus the 13 proof runs under `evidence/runs/`"*. There is **no `evidence/runs/` directory** at `29c329f` (`ls-tree` on the whole commit returns nothing for it); `evidence/` holds exactly 6 files. §4 gives the correct location in the same section: `…/phase-16-item-33-watchdog-smoke-proof/logs/run-*.log`. Delete the `evidence/runs/` clause or repoint it at `logs/`.

## § 35 — fixes **YES**, no new findings

- **F-35-1 CLOSED, and the new claim is exact.** "TWO jobs" + `windows-compat` (`:62-72`) — I checked `ci.yml` at `d120c53`: `:62` is `windows-compat:` and `:72` is the final `- run: npm run windows:check`. Exact.
- The load-bearing new assertion in §4(d) — that `windows-compat` "will be red for the same OSC finding … `harness/scripts/windows-compat.ts` mirrors the lint" — **verified in code**: `harness/scripts/windows-compat.ts:11` contains `{ name: "lint", npmArgs: ["run", "lint"] }`. So the job does run `npm run lint`, which I already proved red (3 biome errors). The claim holds.
- **F-35-2 CLOSED** — "The 32-FX round of PR #33 (item 32)" now agrees with `01-shipped-map.md`.
- **F-35-3 CLOSED** — "#1–#34".

The section's blocking dependency on OQ-1 (owner's account) is unchanged and remains legitimate.

## § E3 — fixes **YES**

- **F-E3-1 CLOSED (both halves).** The stale "grep `canary PASS target=` in `core/cli.ts`" bullet is **deleted**. The renderer is now `core/canary.ts` `renderCanaryPass` `:195-207` — I checked: `:195` is the function declaration, `:207` the return template, `:208` the close. Exact. The type is now `core/platform/types.ts:139-161` — `:139` is `export interface CanaryRecord`, `:148-161` the `contextWindow` block. Exact, and the quoted shape is verbatim.
- **F-E3-2 CLOSED, and it goes further than my finding** — "three widenings, not one; `just typecheck` fails until all three land (and every reader of `expectedLabel` … must handle `null`)". That downstream-reader clause is a real addition.
- **F-E3-3 CLOSED** — the two existing branches are quoted **verbatim** against `canary.ts:203-205`, and a third is specified with an explicit "never print `catalog: null`".
- **F-E3-4 CLOSED** — E26 is a genuine row in the encode brief (`encode-candidates-2026-08-27.md:32`, the receipt-provenance ruling), and the README rule now quoted exists at `README.md:21`. Both pointers resolve; my objection was that E26 was not a *README* rule, and the wording now says so correctly.
- **F-E3-5 CLOSED** — the paraphrase is now marked `(:4409-4411, paraphrased)`.

### RR-E3-1 (low) — the third branch must be ordered FIRST, and the text only implies it

The ruled record carries `check: "unverified"` (§2). The existing ternary tests `record.contextWindow.check === "unverified"` **first**. A third branch keyed on `source === "no-catalog"` appended *after* it is unreachable — the no-catalog record would fall into the existing arm and render `contextTier=unverified (catalog: null)`. The parenthetical "(and never print `catalog: null`)" names that exact outcome, so the trap is signposted, and §4's stdout assertion would catch it on the first run — hence **low, not blocking**. One clause ("ahead of the `check === "unverified"` arm") would remove the guesswork.

## § E5 — fixes **YES** on all six; **one new major**

The rewrite is right where it counts. Re-running my original extraction against `d120c53`:

- `state --json`, `case "state"` `:3676`, literal `:3694-3747`, **21 keys** — the section's list is **set-identical** to mine.
- `list --json`, `case "list"` `:2861`, literal `:2900-2963`, **30 keys** — **set-identical** to mine.
- Both negative lists check out: `state` genuinely lacks all 17 keys named; `list` genuinely lacks all 9 named.
- **F-E5-1 / F-E5-2 CLOSED**, including the two claims I called inverted: the section now states "the original E5 row is still exactly true at the tag: `state` lacks `statusAt`; `list` lacks `harness`; NEITHER carries the pane id" — which is what I measured. The `failureReason` incident is replaced with a true one (`statusAt`), supported by the encode row itself.
- **F-E5-3 CLOSED** — MUT-E5b now targets `harness`/`cwd`/`lifecycle` (keys `list` genuinely lacks); MUT-E5a is explicitly marked "RED on base by construction", which is honest rather than hidden.
- **F-E5-4 CLOSED** — "has NO field table today (only `:684-689` …); write one" matches my finding line-for-line.
- **F-E5-5 CLOSED, well** — `:2952-2961` is correct (the rationale comment runs `:2949-2960`, `parent: effectiveParent(d)` is `:2961`), and **`D-041` is a real repo-wide id**, cited at `core/cli.ts:2954`, `core/cli.ts:3723`, `core/cli.test.ts:1937`, `core/discovery.ts:18`, `core/orchestration/role.integration.test.ts:299`. §7 is now "None" on a ruled basis rather than an open invitation to reverse it.
- **F-E5-6 CLOSED** — `$(pij whoami)`.

### RR-E5-1 (major) — the ruled UNION drops two keys `node show` emits today

§2 rules: *"Every descriptor field any surface exposes today (union of the three sets above …) is exposed by all (additive — **no key removed**)."* §4 then enumerates the UNION the tests must assert. The `node show` card at `:5890-5932` emits:

```
5895    spawnedBy: d.spawnedBy ?? null,
5896    systemState: d.systemState ?? null,
```

**Neither `spawnedBy` nor `systemState` appears in §4's UNION, nor in §4's declared `node show` extras ("`assignments[]`").** §1's node-show bullet also under-enumerates ("plus `harness`, `assignments[]`, `contextMax`"). A rebuilder implementing §4 literally ships a shared projection that **drops two keys from a live surface** — the exact class this item exists to abolish, and a direct violation of §2 stated one section earlier. Add both to the UNION.

### RR-E5-2 (low) — card range off by two

Cited `:5890-5930` (twice). The card literal is `:5890-5932`: `:5930` is `pid: d.pid,`, `:5931` is `cwd: d.folder,`, `:5932` is the closing `};`. As written the range excludes `cwd` — a key §4's UNION does require.

## § 99 — fixes **YES** on the anchors (with my correction above)

- **The `cli.ts` ambiguity is closed properly** — §1 now names both files up front and every affected row says which.
- `15 G-1/G-2` → `daemon.ts:1950` ✅ exact; `.pi/extensions/pij/cli.ts:271, 2502, 2628` ✅ all three exact.
- `16 H-1` → `daemon.test.ts:1751` with the verbatim title `it("adds no archive scan for lifecycle notice routing on the 600ms tick")` ✅ exact, and the production helper correctly separated to `core/binding.ts:302`. **This was my strongest of the three original claims and it is now the best-anchored row in the table.** (Re-verified untruncated: `noticeRegistryView` is still 0 hits in `daemon.test.ts`.)
- `32 P-4` → `core/cli.ts` (the core), 2 hits ✅.
- **F-99-2 CLOSED** — "on `main` since PR #36 (the whole plan folder)". Confirmed: all 15 finding ids resolve in those files on `origin/main`.
- `15 G-4` → see **RR-99-1** and my correction. Actionable now; one sentence overstates.
- The 11 rows I verified clean in the first pass are untouched and remain accurate.

---

## Limits of this re-read (unchanged from pass 1, restated so nothing reads as proven)

I ran **no tests** in either pass. Every mutant in all five sections — MUT-33a…d, MUT-E3a/b/c, MUT-E5a…d, and 99 §4's — is still **unverified by me**. I did not run `harness checks`, `just typecheck`, `just pij-skill-check`, `run-proofs.ts --smoke`, or `npx vitest`; the only build tool executed across both passes is `biome check` on one file. I did not verify `29c329f`'s `vitest-phase16.log.txt` by re-running the suite — I verified the artifact exists, is committed, and reads 172/4160/0. Sections **25, 26, 27, 28** (added in `bcaf79d`) were **not reviewed at all**.

**Recommendation**: **RR-E5-1** is the only one worth another turn before this ships — it is a two-key omission that a literal implementation would bake in. RR-33-1, RR-E3-1, RR-E5-2 and RR-99-1 are one-line edits.

**This re-read is CLOSED.** Terminal: no mutation run after writing it, no pass open on my side.
