# Cold review 01 — Phase 2b (item 1b, dispatch-record retire + carried T011–T013) — dlg-0010

**Reviewer**: cold cross-model (`claude-opus-5` via copilot), seat `pij-mobile-reptile` · **Date**: 2026-08-27
**Target**: `s391/item1b-dispatch-retire` @ `ad265b1e52029f298d4f0c015d750e72e1e46d22` · **Base**: `9912bf869912d0de6604b825ce70c27fb1c589c9`
**Brief**: `review-brief.md` (this folder) · **Rubric**: `skills/flow-pair/references/review-rubrics.md`, Dim-0 mandatory
**Verdict**: **APPROVE** — 11 findings, highest `major`, none blocking.

---

## §0 Scaffolding, and the limits of this pass

Stated first, so that nothing below reads as broader than it is.

**What I actually ran.** Full `npx vitest run .pi/extensions/pij/` via `pij bg` (job `bg-mtbj3kau-b5j8x7`), `npx tsc --noEmit -p .`, `npx biome check` on the 12 changed source/test files, and 15 source mutations. I re-ran the full suite twice more (once per survivor that needed suite-wide confirmation). Every mutation was reverted and the revert verified **two independent ways**: `cmp` against a pre-mutation copy in `/tmp/d10-*.orig`, and `git diff --exit-code`.

**Things I did NOT verify — these are gaps, not clean bills:**

- **No live-daemon proof.** The packet forbids touching the running daemon. Everything about `retireForClosedRecipients` is from the test harness (`FsChannel` / `SqliteQueue` fixtures), not from a real tick against a real `~/.pij`. The o-prime live acceptance named in `tasks.md` (the five board rows disappearing) is **not** something I ran or can attest to.
- **I did not run `harness checks`, `just smoke`, or `just lint`.** The coder's execution log claims are relayed, not reproduced.
- **The `--dry-run` + `--json` combination is unexercised** by anyone, including me. The handler emits `{retired: 0, matched: N, reason, dryRun: true}`; no test reads that shape. I read it; I did not run it.
- **No concurrency, crash-injection, or partial-write testing.** `retireForClosedRecipients` writes N records in a loop with no journal; a crash midway leaves some retired and some not. I did not exercise that, and nothing in the diff addresses it.
- **F-2's cost figures are a measurement of `FsDispatchStore.list()` in isolation** against a copy of the 236 real records in `~/.pij/dispatches/`, not a profile of the live daemon. The extrapolation to a duty cycle is arithmetic, not observation.
- **F-4's consequence (canary evidence loss across a close→revive cycle)** is traced by *reading* `core/cli.ts:4377-4418`, not by executing a canary→close→revive sequence.
- **The "both a dispatch id AND `--to`" arm of the mutual-exclusion guard (F-3) I checked by inspection only.** I mutated and proved the *neither* arm; I did not separately mutate the *both* arm.

**One correction I owe the record.** After reading `daemon.delivery.test.ts` alone I formed the view that the revive un-retire hook was untested — that test hand-rolls the loop (`for (…of store.list()) unretireDispatch(…)`) instead of invoking the production function. That view was **wrong**, and mutation M8 disproved it: `cli.integration.test.ts` drives the real hook through the real bin in two revive paths. The narrower gap that *does* survive is F-5. I am recording the wrong turn because the reasoning that produced it — "the test re-implements the thing, so nothing calls the thing" — is a plausible-looking inference that a reader might otherwise trust.

---

## §1 Freeze

| Check | Value |
|---|---|
| `git rev-parse HEAD` | `ad265b1e52029f298d4f0c015d750e72e1e46d22` ✓ matches dispatch |
| `git rev-parse --abbrev-ref HEAD` | `s391/item1b-dispatch-retire` ✓ |
| `git merge-base origin/main HEAD` | `9912bf869912d0de6604b825ce70c27fb1c589c9` ✓ = declared base **and** = `HEAD^` |
| `git diff` / `git diff --cached` | empty (exit 0) at open **and** at close |
| `git status --porcelain` | 20 untracked orchestration paths at open, baselined to `/tmp/dlg0010-baseline-status.txt`; at close the only delta is this verdict file |
| Diffstat | 15 files, +898 / −48 |

**Scope** ⊆ packet allow-list: 12 files under `.pi/extensions/pij/`, `docs/how/pij.md`, and the packet's own `tasks.md` + `execution.log.md`. **No `skills/**`** (0 matches), **no `.flow-pair/**`** (0 matches). ✓

---

## §2 The seven aims

#### Aim 1 — additive platform contract, legacy round-trips byte-identical · **MET**

`DISPATCH_STATES` gains `"retired"` only (`types.ts:103`); `retirement?` is optional on `Dispatch` and `ownOptional`-guarded. The `isDispatch` retired branch is genuinely strict — it demands a well-formed `retirement`, forbids `ack`/`canary`, and *cross-checks the delivery fields against `priorState`* (`undelivered` ⇒ no `messageId`/`deliveryState`; `delivered-unacked` ⇒ both present). The converse `if (retirement !== undefined) return false;` makes retirement and non-retired states mutually exclusive. That is a tighter invariant than the AC asked for.

`retirement` is LAST in `DISPATCH_FIELD_ORDER` and **M7 proves the position is byte-pinned**.

On the byte-identity claim specifically, and precisely: it **holds**, but *not because of the test that claims it*. See F-8. It holds because `canonicalRecordLevel` skips absent-or-`undefined` known fields (`project.ts:98`), so a record with no `retirement` key produces identical bytes — and that is pinned by the **pre-existing, unmodified** byte-exact assertion over an acked (retirement-free) record at `dispatch.test.ts:82-95`, which this diff does not touch and which still passes. An unmodified literal pin surviving the change is the real evidence here.

#### Aim 2 — pure transitions · **MET**

`retireDispatch` idempotent on `acked` **and** `retired` (M6 kills the `acked` arm). `unretireDispatch` restores `priorState` only for `reason === "recipient-closed"` (M1 kills it). `acknowledgeDispatch` refuses a retired record (M5 kills it), and the refusal is placed **first**, ahead of the `undelivered` check — correct, because a retired record whose `priorState` was `undelivered` would otherwise report the misleading "has not been delivered".

#### Aim 3 — detector never fires on `retired` · **MET, but vacuously** · see **F-1**

True, and true *before this change*. `anomalies.ts:696`'s new `retired` skip is dominated by line 697 (`state !== "delivered-unacked"`). M2 survives the **full suite** with numerically identical counts. The added test cannot fail.

#### Aim 4 — verb + PA · **MET**

Core-parsed like `ack-dispatch`; `ALLOWED_FLAGS`/`MAX_POS` rows present; classified `refuse` and caught by the **exhaustive totality scrape** (M4 turns *both* the scrape and the new explicit test red). `paCapabilityVerb("dispatch-retire", …)` returns the top verb unchanged, so **both** PA seams cover it — the raw-argv bin seam at `cli.ts:4771` and the core gate. `--reason` mandatory, `--to <seat>` retires all open records for that recipient, `--dry-run` genuinely writes nothing (**M17**), `--json` shape as specified.

#### Aim 5 — sweep arm + revive · **MET**

Identical complete-close predicate to item 1 (dissolved ∧ no `revivePendingAt` ∧ `closeIntent` ∧ `terminal.requested`). Pane-gone / live-with-closeIntent / live / **live-with-terminal-requested** all untouched. The recipient set is the union of `queue?.openRecipients()` and every open dispatch's `to`, which is what gives the arm reach on non-sqlite backends — **M13 proves the union is load-bearing** (without it the `FsChannel` fixture retires nothing). Revive restores only `recipient-closed`; operator-retired stay (asserted in all three test files). **M9** proves the daemon's `"recipient-closed"` literal is pinned to the un-retire filter — those two strings are a coupled pair and both are held.

#### Aim 6 — carried items T011/T012/T013 · **MET**

- **T011** — the null-guard is hoisted to `if (descriptor === null) continue;`, and the four clauses now read off a non-null `descriptor`. **M3 confirms the lifecycle clause is independently mutable**, which is exactly what Phase 2 F-9 asked for. Note the hoist is *structurally* enforced, not merely stylistic: with the guard removed, `descriptor.lifecycle` stops compiling, so the clause cannot silently re-absorb the null check.
- **T012** — `hasSelector && allRecipients` → E-ARG "choose a selector OR --all-recipients", asserted on the **first output line**.
- **T013** — the FX-01 pins are now two separately-named `it()` blocks ("rejects `--all` combined with `--tail` or `--last`", "requires a selector or explicit `--all-recipients` confirmation"), each asserting on the E-ARG line rather than the usage blob. Suite count moved +18.

#### Aim 7 — scope · **MET** (see §1)

---

## §3 Dim-0 — 15 mutations, 10 RED, 5 survivors

The brief mandated 4. I ran 11 more. Every survivor that touches production behaviour was confirmed against the **full** suite, not just its target files.

| ID | Target | Mutation | Result |
|---|---|---|---|
| **M1** | `dispatch.ts:156` | `unretireDispatch`: drop the `reason === "recipient-closed"` filter (kept `retirement === undefined` so narrowing still compiles) | **RED** ×2 — `dispatch.test.ts` + `daemon.delivery.test.ts` |
| **M2** | `anomalies.ts:696` | delete `if (dispatch.state === "retired") continue;` | **SURVIVES full suite** — 171 files / 3970 passed / 15 skipped, identical to clean |
| **M3** | `daemon.ts:823` | drop the `descriptor.lifecycle !== "dissolved"` clause | **RED** — the T011 fixture, alone |
| **M4** | `pa-capability.ts:218` | delete the `"dispatch-retire": refuse(…)` row | **RED** ×2 — totality scrape **and** the new explicit test |
| **M5** | `dispatch.ts:96` | delete the `state === "retired"` refusal in `acknowledgeDispatch` | **RED** |
| **M6** | `dispatch.ts:136,146` | allow retiring an `acked` record (+ `priorState` ternary to keep types honest) | **RED** |
| **M7** | `dispatch.ts:21` | move `"retirement"` ahead of `"created"` in `DISPATCH_FIELD_ORDER` | **RED** — the retired-record byte pin |
| **M7b** | `dispatch.ts:21` | remove `"retirement"` from `DISPATCH_FIELD_ORDER` entirely | **SURVIVES** → F-9 |
| **M8** | `cli.ts:2227` | `requeueClosedRecipientDispatches` → immediate `return 0` | **RED** — integration, through the real bin |
| **M9** | `daemon.ts:845` | daemon reason `"recipient-closed"` → `"daemon-swept"` | **RED** |
| **M11** | `dispatch.ts:141` | drop `canary: undefined` from `retireDispatch` | **SURVIVES** → F-4 |
| **M13** | `daemon.ts:811-815` | delete the dispatch-recipient union | **RED** |
| **M14** | `cli.ts:2467, 2582` | remove **only** the two `revivePendingAt` (pi/omp) call sites | **SURVIVES full suite** — 3970/15, identical → F-5 |
| **M15** | `core/cli.ts:1173` | drop the *neither id nor `--to`* arm of the mutual-exclusion guard | **SURVIVES** — 568 tests (integration + `core/cli.test.ts`) → F-3 |
| **M17** | `core/cli.ts:4676` | `if (!cmd.dryRun)` → `if (true)` — make `--dry-run` write | **RED** |

**The survivors cluster in one place, and it is worth naming.** Four of the five (M2, M7b, M11, M15) are *guards and belt-and-braces clauses that are correct but inert or unobserved*. The production behaviour is right in every case; what is missing is any test that would notice if it stopped being right. M14 is the exception — a genuine untested production path.

**Gates, re-run by me after restore:** full vitest 171 files / **3970 passed** / 15 skipped, exit 0 (no baseline failures — base `9912bf8` is the item 9-FX skill-string restore, so the two RED tests from dlg-0009 are gone). `tsc --noEmit -p .` → **exit 0, zero diagnostics**. `biome check` on all 12 changed files → **exit 0**, "Checked 12 files… No fixes applied."

---

## §4 Findings

#### F-1 — `major` — AC-14's implementation is dead code and its test cannot fail

`anomalies.ts:696-697`:

```ts
if (dispatch.state === "retired") continue;
if (dispatch.state !== "delivered-unacked") continue;
```

`state === "retired"` implies `state !== "delivered-unacked"`, so line 696 can never be the line that continues. It is **provably dominated** by the line beneath it. There is exactly one loop over `inputs.dispatches` in the whole file (`:695`), so there is no second site where the skip could matter.

M2 deletes line 696 and the **full suite** stays green with identical counts (3970 passed / 15 skipped). The new fixture `dispatchRecord({id:"dispatch-retired", state:"retired", …})` is filtered by line 697 regardless, so `expect(found).toHaveLength(1)` holds either way.

This is not a behaviour bug — the detector genuinely never fires on retired records, which is what AC-14 wanted. It is a **truth-in-testing** problem: the phase reports a guard and a test for a property that held by construction, and a reader auditing AC-14 later will find a line and a fixture that look load-bearing and are not.

Two honest ways out, in preference order:
1. Make it real: extract the shared open-state predicate the daemon already uses inline (`state === "undelivered" || state === "delivered-unacked"`) into one exported helper and have both the sweep and the detector call it. Then a retired record's exclusion is a property of a named thing, the test pins that thing, and the mutation bites.
2. Keep the line as deliberate documentation but **say so** — a comment that it is defensive/redundant today and guards a future in which the detector grows a second arm — and drop the claim that the test proves it.

Also adjust the doc sentence noted in F-10.

#### F-2 — `major` — the sweep now reads and parses every dispatch record on **every** 600 ms tick, unconditionally, and the cost grows forever

`daemon.ts:808-809` hoists the store read above every guard:

```ts
const dispatchStore = new FsDispatchStore(this.pijHome);
const dispatches = dispatchStore.list();
```

Before this change the method's first act was `if (queue === undefined) return;`, and the sqlite path cost one `openRecipients()` query. Now `list()` runs **before any predicate**, so it runs when there are no closed seats, no open dispatches, and no sqlite queue at all. `FsDispatchStore.list()` is a `readdirSync` plus `readFileSync` + `JSON.parse` + `isDispatch` on every `*.json`, then a `.sort()`.

Measured against a copy of the **236 real records currently in `~/.pij/dispatches/`** (50 runs, warmed):

| metric | value |
|---|---|
| `list()` median | **4.20 ms** (min 3.74, max 5.69) |
| duty cycle at `TICK_MS = 600` | **0.70 %** |
| sustained file reads | **≈ 393 / second** |

At today's volume that is real but modest, and I want to be careful not to inflate it. The structural part is what makes it `major`: **retirement is terminal and nothing ever prunes a dispatch record**, so this set only grows — and the records that grow it fastest are precisely the ones this feature creates. The steady state is the daemon re-reading and re-validating N retired records ~1.67 times a second in order to find zero candidates. At 2,360 records the same arithmetic gives ~42 ms/tick (~7 %) and ~3,900 reads/s, and it also delays everything sequenced after it in `tickLocked` (pane signals, window backfill, the anomaly and baton sweeps).

Cheapest fix that keeps the new reach: compute the closed-recipient set from the registry **first**, and only touch the dispatch store if that set is non-empty. That preserves M13's union behaviour (the union only matters for recipients that pass the predicate anyway) and reduces the common case to zero file reads. A retention/pruning policy for terminal dispatch records is the longer-term answer, and is out of scope here.

#### F-3 — `minor` — bare `pij dispatch-retire --reason R` is a silent no-op if the guard ever regresses (guard correct, both arms untested)

`core/cli.ts:1173`, `if ((dispatchId === undefined) === (to === undefined))`, correctly rejects *both* "neither supplied" and "both supplied". Neither arm is exercised. M15 removes the neither-arm and 568 tests (the whole integration file plus `core/cli.test.ts`) stay green.

The failure mode if it regressed is quiet rather than destructive — `records` becomes `list().filter(r => r.to === undefined)` → `[]` → exit 0 with `retired 0/0` — but "the operator asked to retire something and got a success line describing nothing" is the same shape of defect as dlg-0006 **F-1**, which FX-01 had to fix on the sibling verb (`queue retire`). The fix landed on `queue retire` in this very diff (T012); the equivalent *test* did not land on the new verb. Two cheap cases in the existing `it()` close it.

`dispatch-retire` has **no** `core/cli.test.ts` coverage at all — every assertion about it goes through a real bin spawn. Also unexercised: `--to` repeated (`:1171`), `--to` with no value (`:1169`), `--reason` with no value (`:1177`), and the `E-NOREG` unknown-id branch.

#### F-4 — `minor` — retirement silently destroys canary evidence, and un-retire does not restore it

`retireDispatch` sets `canary: undefined` (`dispatch.ts:141`). That clearing is *required* — the `isDispatch` retired branch rejects a record carrying a canary — but it is also **lossy and irreversible**: `unretireDispatch` restores `state` and drops `retirement`, and never restores `canary`.

This is reachable. `core/cli.ts:4418` writes `{...previous, canary: evaluated.value}` onto a live dispatch record without changing its state, so `delivered-unacked` + canary is a real shape; if that seat is then deliberately closed, the daemon retires the record and the verdict is gone. A subsequent revive brings the record back **without** its canary, which additionally disarms the "already carries a different canary verdict" conflict guard at `core/cli.ts:4377` for that id.

**M11 shows nothing covers this in either direction** — no test retires a canary-bearing dispatch, so neither the loss nor the clearing is observed. Worth noting the second-order effect: if the clearing were ever removed, `FsDispatchStore.write` would return `E-ARG` ("fails the record contract") and the daemon would convert that to a throw (see F-7) — with no test to catch it first.

Minimum: one fixture retiring a canary-bearing record, and a decision recorded either way — preserve the canary through retirement (add it to the retired branch's allowances) or state that discarding it is intended.

#### F-5 — `minor` — two of the four revive un-retire call sites are unreachable by any test

`cli.ts:2467` and `:2582` — the two `revivePendingAt` branches (the pi/omp revive-pending paths) — are uncovered. **M14 removes only those two and the full suite stays green** (3970/15, identical). The two that *are* covered are the claude-revive and `--attach` paths, via `cli.integration.test.ts`.

The consequence is narrow but concrete: on a pi/omp revive that goes through the pending branch, a regression would leave dispatch records retired for a seat that is coming back, and nothing would notice. This is the same family as the pi/omp revive re-retire-at-boot issue the coder self-fixed in Phase 2, which suggests the pi/omp revive branches are a recurring blind spot rather than a one-off.

#### F-6 — `minor` — the un-retire count is computed, returned, and discarded at all four call sites

`requeueClosedRecipientDispatches` returns `number`, and not one of the four callers uses it. The `requeued` field in `pij revive --json` (`cli.ts:2498`, `:2617`) and the human line "requeued N message(s) retired at close" (`:2500`, `:2620`) are fed **only** by `requeueClosedRecipientMail`.

So an operator reviving a seat with 2 queued messages and 7 un-retired dispatch records is told `requeued: 2`. The dispatch half of the restore is invisible at the only surface that reports the restore. Either fold the count into a distinct field (`dispatchesRestored`) or say plainly in the line that it covers mail only.

#### F-7 — `info` — a dispatch write failure now aborts the rest of every tick and suppresses the liveness heartbeat

`daemon.ts:849/851` throw on a failed `retireDispatch`/`write`. `tick()` wraps `tickLocked()` in `try/**finally**` (no catch), and the timer's `.then(touchDaemonHeartbeat)` — deliberately ordered so "a wedged tick must not advertise liveness" — is skipped when the promise rejects. `retireForClosedRecipients()` is called at `daemon.ts:391`, early in `tickLocked`, so a throw there skips pane signals, window backfill, and the anomaly/baton sweeps.

I am rating this `info`, not higher, because **it matches house style**: there are already 7 `throw new Error(…)` sites inside `tickLocked` (e.g. `:670` on a failed `markRead`), and the timer does catch and log. Two things are nonetheless new. First, this throw sits earlier in the tick than the existing ones, so it forfeits more. Second, its trigger is a **persistent on-disk record plus an fs condition** — the same record is retried every 600 ms, so where a transient queue failure self-clears, this one can loop. `list()` is already failure-tolerant (it swallows and skips bad files); `write()` is the only new throw path that a corrupt or unwritable record can reach. Treating a write failure the way the queue arm treats its result — log and continue to the next record — would match the surrounding intent.

#### F-8 — `info` — the test named "preserves legacy records byte-identically" cannot detect the regression it names

`dispatch.test.ts`:

```ts
const legacyJson = canonicalDispatchJson(BASE);
const legacy = JSON.parse(legacyJson);
expect(isDispatch(legacy)).toBe(true);
expect(canonicalDispatchJson(legacy as Dispatch)).toBe(legacyJson);
```

Both sides are computed by the function under test, so this asserts **self-consistency across a round-trip**, not byte-identity with the pre-change output. Had adding `retirement` to the field order changed legacy bytes, both sides would have changed together and this would still pass.

The property does hold (Aim 1 is met) — but the thing actually protecting it is the **pre-existing** byte-exact literal at `dispatch.test.ts:82-95`, which this diff leaves untouched. Note the asymmetry within the new block itself: the *retired* record gets a byte-exact literal (and M7 proves it works), while the *legacy* record — the one the contract note in `tasks.md` calls out as the hashing risk — gets the loose form. Pinning `canonicalDispatchJson(BASE)` against a literal costs one line and makes the test's name true.

#### F-9 — `info` — `"retirement"` in `DISPATCH_FIELD_ORDER` is redundant

**M7b survives**: removing the entry changes no output. With it absent, `retirement` falls into `canonicalRecordLevel`'s sorted-unknown bucket (appended after the knowns) and is then overwritten by the explicit `canonical.retirement = …` assignment, landing in the same final position with the same value. Two mechanisms, one of them inert.

It is only inert *because* `retirement` and `canary` are mutually exclusive: `canary` is also absent from the order array, and `"canary" < "retirement"`, so if a record could ever hold both, the two mechanisms would order them differently. That invariant is enforced (`isDispatch` rejects `canary` on retired records; `retireDispatch` clears it) but nothing states the dependency. A one-line comment on the field-order array — that placement here is belt-and-braces and the real placement comes from the explicit assignment — would stop a future editor from "fixing" the order array and expecting the output to move.

#### F-10 — `info` — two small doc imprecisions in `docs/how/pij.md`

1. The new section opens "Dispatch records have a separate lifecycle …: `undelivered → delivered-unacked → acked`" — omitting `retired` from the chain in the section whose subject is retirement. The `tasks.md` mermaid diagram has it right.
2. "Retired dispatches are excluded from `delivered-unacked-stale`" reads as a consequence of this change; per F-1 it holds by construction. "Only `delivered-unacked` records are considered, so retired ones cannot appear" is both accurate and more useful.

#### F-11 — `info` — `tasks.md` names a stale base

Header says branch off `main@c8dc3778`; the actual parent is `9912bf8`. Unlike the analogous dlg-0009 finding, **`c8dc3778` genuinely is an ancestor of HEAD** (it is the item-1 merge, and `9912bf8` is the later item-9-FX merge), so this is historical drift in a header, not a pointer to a commit off the branch. Worth a one-word correction, nothing more.

---

## §5 What I liked

- **The `isDispatch` retired branch cross-checks `priorState` against the delivery fields.** Nothing in AC-11 asked for that. It means a hand-edited or half-written retired record — `priorState: "undelivered"` carrying a `messageId` — is rejected at the trust boundary rather than un-retiring later into an incoherent state. The un-retire path is only as safe as the guard that admitted the record, and this guard closes that loop.
- **The `retired`/`retirement` mutual exclusion runs in both directions.** `if (retirement !== undefined) return false;` for non-retired states is the half people forget; without it a record could carry a stale retirement block through an un-retire and back.
- **M9 and M13 together show the daemon arm was built as a unit, not bolted on.** The union of queue recipients and dispatch recipients is what gives the arm reach on fs/dual backends — the exact class of gap that finding C in dlg-0009 had to repair for the pointer path — and it was there from the start this time.
- **T011's hoist is enforced by the compiler, not by discipline.** Removing `if (descriptor === null) continue;` doesn't just weaken a test, it stops the file compiling. That is the strongest available form of "this clause stays independently mutable", and it is exactly what Phase 2's F-9 was asking for.
- **T013 did the unglamorous thing properly.** Splitting the FX-01 pins into separately-named `it()` blocks and asserting on the E-ARG line rather than the usage blob is pure legibility work with no behaviour payoff — and it is precisely what makes the next reviewer's mutation output readable. M15's result was easy to interpret *because* of it.

---

## §6 Verdict

**APPROVE** at `ad265b1e52029f298d4f0c015d750e72e1e46d22`.

All seven aims are met. The platform contract is genuinely additive and the legacy byte-identity holds. The pure transitions are correct and, apart from the gaps named above, well pinned — 10 of 15 mutations died, including every one that touches a transition rule, the PA classification, the field-order contract, the daemon's close predicate, the recipient union, and `--dry-run`'s non-destructiveness. The three carried Phase 2 items are properly closed, and T011's fix is structurally enforced rather than merely present.

Nothing here blocks. The two `major` findings are both about *honesty of coverage and cost* rather than incorrect behaviour: **F-1** ships a guard and a test for a property that already held (the code is right; the evidence is circular), and **F-2** puts an unconditional, monotonically growing filesystem scan on a 600 ms timer (measured at 0.70 % duty today, with no pruning policy to bound it). F-2 is the one I would fix before this runs for a long time on a busy machine, and the fix is small — consult the registry before touching the dispatch store.

Recommended follow-ups, in order: **F-2** (guard the store read), **F-1** (make the skip real or admit it is defensive), **F-3** and **F-5** (two cheap tests each), then the `info` items.

---

**TERMINAL REPORT.** This pass is CLOSED. No mutations, edits, or other repository changes were made after this file was written; the working tree is byte-identical to `ad265b1e` on every tracked path, verified by `cmp` against pre-mutation copies and by `git diff --exit-code`. The only untracked addition attributable to this pass is this file. If further work on dlg-0010 is wanted, it needs a new dispatch.

---

# Re-review FX-01

**Scope**: scoped re-review of fix packet `fix-01.md` (incl. the 20:20Z `core/cli.ts`
amendment) at frozen commit `43de01dd6188aed03e686b7d7b96bb8e56d15ae5` on
`s391/item1b-dispatch-retire`, one commit on top of the `ad265b1e` I reviewed above.
Reviewer: `pij-mobile-reptile` (cold cross-model). The TERMINAL banner immediately
above closes the **first** pass; it is not retracted, and nothing in it was edited.

## §0 Scaffolding, and the limits of this pass

Stated first, so that a gate I did not examine and a gate I found clean never look
the same.

**Scaffolding.** Repo READ-ONLY except this file. No commit, no `npm link`, no
contact with the live daemon or `~/GitHub/pij`. Fourteen source mutations were
applied and reverted; all six touched files verified byte-identical afterwards by
`cmp` against pre-mutation copies (`/tmp/d10fx-*.orig`) **and** by
`git diff --exit-code`. Gate ran **before** any mutation. Two benchmarks read a
**copy** of my real `~/.pij` in `/tmp/d10fx-perf` (120 descriptors, 236 dispatch
records); the live home was never written.

**Three self-corrections — I was wrong three times this pass, twice about my own
earlier findings.** I record them because each one, left unstated, would have
produced a confident and wrong review.

1. **My original F-4 was wrong.** I claimed close→revive "permanently loses canary
   evidence". It cannot: the sole canary producer (`core/cli.ts:4419`) is gated at
   `:4364` by `previous.state !== "acked" → refuse`, and `retireDispatch` early-returns
   unchanged for `acked`. A canary-bearing record is therefore never retired. FX-01.4
   fixes a defect that does not exist — see **G-1**. The coder implemented what I asked
   for; the ask was faulty.
2. **"The scan should have used `registry.list()`" — refuted by measurement.**
   `FsRegistry.list()` filters `descriptor.lifecycle !== "dissolved"`
   (`fs-registry.ts:277`), so it returns **0 of the 17** closed recipients the sweep
   needs. The hand-rolled `readdirSync` is *necessary*, not sloppy. Demoted to **G-5**
   (info) with a different point.
3. **"The closed-recipient set grows forever" — wrong.** `sweepArchivable` moves
   terminal descriptors out of `pijHome` after `ARCHIVE_AFTER_MS = 48 h`
   (`core/archive.ts:23`), swept every 60 s. The set is **bounded by a 48-hour
   window**. This materially softens **G-2**; I have not re-inflated it.

**What I did NOT check.** No live-daemon proof (packet forbids). `harness checks`,
`just smoke`, `just lint` not run by me (I ran `tsc`, `biome`, and vitest directly).
`dispatch-retire --dry-run`/`--json` shapes read, never executed. No concurrency or
crash-injection testing. The benchmarks time `list()`/prescan **in isolation** on my
home's data — they are not a live daemon profile, and my home is a heavy-orchestration
outlier, not a typical one. The `--to` happy path of the new `core/cli.test.ts` case is
an exact-shape assertion I read but did not separately mutate every field of. I did not
verify that `queue.retire`'s 17 no-op transactions are safe under concurrent daemon
writes — only that they are cheap.

## §1 Freeze

| Check | Value |
|---|---|
| HEAD | `43de01dd6188aed03e686b7d7b96bb8e56d15ae5` |
| Branch | `s391/item1b-dispatch-retire` |
| Parent | `ad265b1e5202…` — the commit reviewed above ✅ |
| `git merge-base origin/main HEAD` | `9912bf869912…` ✅ matches the brief |
| Tracked tree at open **and** close | clean; byte-identical to `43de01d` |
| Untracked baseline | 22 orchestration paths; delta at close = this file only |

**Scope (confirmation 7a) — PASS.** Diff vs `ad265b1` touches **13** files, a strict
**subset** of the packet's allowed set (15 incl. the `core/cli.ts` amendment).
`core/anomalies.test.ts` was allowed but untouched — correct, because FX-01.1 makes the
*existing* AC-14 test load-bearing rather than needing a new one (proved by MF1). No
out-of-scope file was touched.

**Gate (confirmation 7b) — PASS.** Full `npx vitest run .pi/extensions/pij/` via
`pij bg` (`bg-mtbkxei0-ocfdx4.log`): **171 files, 3975 passed, 15 skipped, 0 failed,
exit 0**, 173.8 s. That is `ad265b1`'s 3970 **+5**, matching the five new `it()` blocks
exactly — no test was deleted or silently disabled to reach green. After restoring every
mutation: `tsc --noEmit` **0 diagnostics**; `biome check` clean on all 10 changed source
files; the 4-file fast set 571/571.

## §2 The seven confirmations

| # | Asked | Verdict | Evidence |
|---|---|---|---|
| 1 | F-1 closed; one shared predicate; mutating it → AC-14 RED | ✅ **PASS** | MF1, MF-X3 |
| 2 | F-2 closed; idle tick = ZERO `list()`; closed path still retires | ✅ **PASS** *(criterion met; underlying concern only partly — **G-2**)* | MF2, MF2c, MF2d |
| 3 | F-3 guard arms tested; M15 → RED | ✅ **PASS** (both arms + reason) | MF3a/b/c |
| 4 | F-4 canary preserved + restored; M11 → RED | ✅ **PASS** *(but the fixed defect is unreachable — **G-1**)* | MF4a/b, MF-X1 |
| 5 | F-6 count in `revive --json` **and** the human line | ⚠️ **PASS on 2 of 4 call sites** — **G-4** | MF6a RED, MF6b **survives** |
| 6 | docs + dossier header | ✅ **PASS** (one wording caveat in **G-1**) | read below |
| 7 | diff ⊆ packet files; full vitest 0 fail | ✅ **PASS** | §1 |

**(1) F-1 — genuinely closed.** `isOpenDispatch` (`dispatch.ts:135`) is now the single
predicate used by the detector (`anomalies.ts:697`), the sweep arm (`daemon.ts:840`) and
the verb's `--to` selection (`core/cli.ts:4673`). The detector reads:

```ts
if (!isOpenDispatch(dispatch)) continue;   // excludes acked + retired
if (dispatch.state === "undelivered") continue;   // excludes undelivered
```

Neither line dominates the other — line 1 is the only thing excluding `retired`, line 2
the only thing excluding `undelivered`. I mutated **both** to prove it, which is the
strongest available evidence and more than the brief asked for:

- **MF1** — `isOpenDispatch` also admits `"retired"` → AC-14 RED:
  `expected [ {…}, {…} ] to have a length of 1 but got 2` in *"flags only stale
  delivered-unacked dispatches with record and age evidence"*.
- **MF-X3** — drop the `undelivered` skip → the same test RED.

The dead code and the vacuous test from my F-1 are both gone. This is a real fix, not a
re-arrangement.

**(2) F-2 — the stated criterion is met.** `retireForClosedRecipients` now derives the
closed set from the registry first and returns before constructing `FsDispatchStore`.

- **MF2** — delete `if (closedRecipients.size === 0) return;` (`daemon.ts:826`) → the new test RED:
  `expected "list" to not be called at all, but actually been called 1 times`. The
  `vi.spyOn(FsDispatchStore.prototype, "list")` count is load-bearing, not decorative.
- **MF2c** — never populate the set → **RED ×5**, including both *"retires queued,
  injected, and parked rows after a complete deliberate close"* variants and *"retires
  open dispatches on close and restores only recipient-closed records on revive"*. The
  closed-recipient path still retires mail **and** dispatches.
- **MF2d** — drop `terminal?.disposition !== "requested"` (`daemon.ts:817`) from the relocated 4-clause
  predicate → RED via the T011 fixture. The interlock survived the move intact.

See **G-2** for what the criterion does *not* establish.

**(3) F-3 — closed, and better than requested.** The guard is a single XNOR
(`core/cli.ts:1174`), so I mutated each arm independently rather than assuming the one
test covers both. All three arms RED in *"guards dispatch-retire target exclusivity and
required reason"*: **MF3a** neither-arm (the literal M15 re-run — M15 is dead),
**MF3b** both-arm, **MF3c** required-reason. My original pass mutated only the neither
arm; both are now proven.

**(4) F-4 — mechanically closed.** **MF4a** (drop the canary carry in `retireDispatch`)
and **MF4b** (drop the restore in `unretireDispatch`) are both RED. M11 is dead. The
mechanism works exactly as specified — but see **G-1** for whether it should exist.

**(5) F-6 — half proven.** Both new assertions live in **Claude-runtime** revive tests,
which exercise only the two non-pi/omp call sites. **MF6a** (drop the capture on those
two) → **RED ×3** in 11.6 s. **MF6b** (drop it on the two pi/omp sites) → **SURVIVES the
entire `cli.integration.test.ts`** (106 passed, exit 0). See **G-4**.

**(6) Docs and header — correct.** `docs/how/pij.md:144-171` now names `retired` as a
terminal state reachable from either open state, and reframes the detector exclusion
honestly ("considers only the shared open-state predicate and then only
`delivered-unacked`") instead of claiming a new behaviour. My F-10 is closed.
`tasks.md` header base is now `main@9912bf8`, matching the real merge-base — F-11
closed. One sentence overstates; see **G-1**.

## §3 Dim-0 — 14 mutations, 12 RED, 2 survivors

Gate ran to completion **before** the first mutation (vitest reads files as it goes).
Fast set = `dispatch.test.ts` + `anomalies.test.ts` + `daemon.delivery.test.ts` +
`core/cli.test.ts` = 571 tests in 6.5 s, which is what made 14 mutations affordable.

| ID | Site | Mutation | Result |
|---|---|---|---|
| MF1 | `dispatch.ts:138` | `isOpenDispatch` also admits `"retired"` | **RED** — AC-14 |
| MF-X3 | `anomalies.ts:698` | drop the `undelivered` skip | **RED** — AC-14 |
| MF2 | `daemon.ts:826` | delete `size === 0` early return | **RED** — idle-tick test |
| MF2c | `daemon.ts:821` | never populate `closedRecipients` | **RED ×5** |
| MF2d | `daemon.ts:816-817` | drop `terminal.requested` clause | **RED** — T011 |
| MF3a | `core/cli.ts:1174` | neither-arm dropped (**M15 re-run**) | **RED** |
| MF3b | `core/cli.ts:1174` | both-arm dropped | **RED** |
| MF3c | `core/cli.ts:1181` | required-`--reason` arm dropped | **RED** |
| MF4a | `dispatch.ts:153` | canary not carried into `retirement` (**M11 re-run**) | **RED** |
| MF4b | `dispatch.ts:170` | canary not restored on un-retire | **RED** |
| MF6a | `cli.ts:2494,2620` | drop `requeuedDispatches` capture, non-pi/omp | **RED ×3** |
| MF-X1 | `types.ts:622-628` | revert the `delivered-unacked` canary relaxation | **RED — and *only* the one new test**, out of 571 |
| **MF-X2** | `types.ts:589-594` | drop the new `retirement.canary` cross-field integrity check | **SURVIVES** (571) |
| **MF6b** | `cli.ts:2468,2593` | drop `requeuedDispatches` capture, pi/omp | **SURVIVES** full `cli.integration.test.ts` (106) |

Every one of the brief's four required confirmations produced a RED. The two survivors
are both *new* gaps introduced by this fix, not carried ones.

## §4 New findings

Numbered `G-n` so they cannot be confused with the first pass's `F-n`.

### G-1 · minor · FX-01.4 fixes an unreachable defect by widening a validator that was itself the thing enforcing the unreachability

**My F-4 was wrong** (§0). The proof is a four-link static chain, each link checked:

1. The only writer of `Dispatch.canary` is `core/cli.ts:4419`
   (`{ ...previous, canary: evaluated.value }`) — verified by grepping every
   `canary:` assignment outside tests.
2. It is gated at `core/cli.ts:4364`: `if (previous.state !== "acked" || previous.ack === undefined) return failCanary(...)`. So `canary !== undefined ⟹ state === "acked"`.
3. `retireDispatch` (`dispatch.ts:142`) returns the record **unchanged** when
   `state === "acked"`. So an acked record is never retired.
4. ∴ `dispatch.canary` is always `undefined` at line 153, `retirement.canary` is always
   `undefined`, and `unretireDispatch` always restores `undefined`.

**Production behaviour of FX-01.4 is therefore nil** — which is also why my original M11
survived. The cost of making it *testable* is the part that matters: `isDispatch`'s
`delivered-unacked` branch was relaxed from `canary === undefined` to "…or a
`CanaryRecord` whose `dispatchId`/`target` match" (`types.ts:622-628`), because the new
fixture `{ ...delivered, canary: CANARY }` is otherwise not a valid `Dispatch`.
**MF-X1** shows nothing else in 571 tests depends on that relaxation — it exists solely
to make the fixture legal.

Why that is worth a finding rather than a shrug: `markDispatchDelivered`
(`dispatch.ts:81`) has **no state guard** and clears `ack` but **not** `canary`. Today
its sole caller (`core/cli.ts:4601`) passes a freshly-built `state: "undelivered"`
record, so nothing goes wrong. If a future re-delivery path ever passed an acked record,
the **old** validator would have rejected the write loudly at
`FsDispatchStore.write()`'s round-trip check; the **new** one accepts a
`delivered-unacked` record carrying a stale canary from a previous incarnation — which
`retireDispatch` would then faithfully preserve and `unretireDispatch` restore. The
relaxation converts a loud failure into a silent one for a bug class that the invariant
previously made unrepresentable. The same widening also means a hand-edited or corrupt
on-disk record in that shape now loads instead of being rejected.

Also: `docs/how/pij.md:163-165` now documents "restoring any canary evidence" as a
behaviour operators can rely on. It cannot occur.

**Suggested**: revert FX-01.4 (my F-4 does not need fixing), or — if the defensive
carry is wanted — keep it *and* add the state guard to `markDispatchDelivered` that
makes the widened invariant safe, and soften the doc sentence. Either is fine; the
current combination is the one that isn't.

### G-2 · minor · F-2's test passes, but the cost it was raised about is ~72 % worse in the condition that matters

Measured, not asserted — 50 warmed runs each against a copy of my real home
(120 descriptors, 236 dispatch records, `TICK_MS = 600`):

| Per tick | Old (`ad265b1`) | New (`43de01d`) |
|---|---|---|
| recipient discovery | `openRecipients()` **0.005 ms** | prescan (readdir + 120 `read()`) **3.42 ms** |
| `FsDispatchStore.list()` | **4.95 ms** (unconditional) | **4.95 ms** — *still runs whenever ≥1 closed seat exists* |
| `queue.retire()` | 0 calls | 17 no-op txns, **0.158 ms** (measured — genuinely cheap) |
| **total** | **≈ 4.96 ms → 0.83 % duty** | **≈ 8.53 ms → 1.42 % duty** |

The prescan found **17** complete closed recipients on my home. `closedRecipients.size`
is therefore *not* zero in the steady state of an active orchestration home, so the new
early return does not fire and `list()` runs anyway — with 3.42 ms of registry scanning
now added in front of it. The optimisation pays off only on a home where nothing has
been closed in 48 hours (0.83 % → 0.57 %), i.e. an idle machine, which is precisely when
the tick budget was never under pressure.

Calibration, deliberately: I am **not** re-raising this to major. The absolute cost is
1.42 % of a 600 ms tick; the closed set is **bounded** by `ARCHIVE_AFTER_MS = 48 h`
(I was wrong that it grows without limit, §0); and the 17 SQL transactions I suspected
would dominate measured 0.158 ms and do not. But the half of my original F-2 that was
actually about growth is untouched: `adapters/dispatch-store.ts` has **no prune or
archive path at all**, so the 236 records only ever increase, and `list()` still parses
all of them on every tick of every active session.

Note the shape, because it is the reusable part: a test asserting "zero `list()` calls
on an idle tick" is *true* and still leaves the reported problem in place, because the
test's world (no closed seats) is the opposite of the world the finding was measured in.

**Suggested**: intersect the closed set with recipients that actually have open records
before touching the store, or cache the prescan across ticks keyed on registry mtime;
and treat dispatch-record retention as a real follow-up rather than a phase-scope
deferral.

### G-3 · minor · the new `retirement.canary` integrity check has zero coverage

`types.ts:589-594` rejects a retired record whose `retirement.canary.dispatchId`/
`target` disagree with the record's own `id`/`to`. Good instinct — cross-field integrity
on a durable record is exactly right. **MF-X2 deletes it and all 571 tests still pass.**
One assertion on a mismatched fixture would fix it. (If G-1 is resolved by reverting
FX-01.4, this disappears with it.)

### G-4 · minor · F-6 is threaded through four call sites and proven on two

**MF6b survives the whole of `cli.integration.test.ts`**: the `requeuedDispatches`
capture at `cli.ts:2468` and `:2593` — the pi/omp branches of both the `--attach` and
non-attach revive paths — can be deleted with no test noticing, so neither the JSON key
nor the new human line is verified there. This is the same uncovered seam as my F-5
(explicitly out of scope, and I am not re-litigating that), but F-6 *was* in scope and
its fix is only half-demonstrated. Consistent with the first pass, where M14 on the same
two sites survived the full suite.

### G-5 · info · the sweep hard-codes `FsRegistry`'s disk layout because the port offers no alternative

`daemon.ts:809` does `readdirSync(this.pijHome)` + `<id>.json` slicing, inside a class
that otherwise talks to an injected `RegistryPort`. I assumed this was avoidable and
**measured that it is not**: `RegistryPort.list()` is documented as the hot tier and
`FsRegistry.list()` filters `lifecycle !== "dissolved"` (`fs-registry.ts:277`), so it
returns **0 of the 17** descriptors the sweep exists to find. The consequence is
structural rather than sloppy: a non-`FsRegistry` `RegistryPort` would make this sweep
silently do nothing — no error, no log, just no retirement. A
`listTerminal()`/`listAll()` port method would close the gap and delete the
layout knowledge. Not blocking.

Checked and clean, for the record: the `catch { return; }` wrapping the scan looked
like an all-or-nothing failure mode, but `FsRegistry.readFile` is throw-safe
(`:1535-1542`, catch → null), so the only realistic thrower is `readdirSync` on an
unreadable `pijHome`, for which bailing out is correct.

## §5 What I liked

- **The F-1 fix is the honest one.** It would have been easy to delete the dead line and
  claim the finding closed. Extracting a shared predicate and re-expressing the detector
  so the exclusion is genuinely load-bearing is harder, and it makes the *sweep* and the
  *verb* agree with the detector by construction rather than by comment.
- **The F-2 test counts real calls** (`vi.spyOn` on the prototype) instead of asserting a
  proxy for the behaviour. MF2 proves it fails when it should.
- **The 4-clause close predicate survived relocation byte-for-byte**, including the
  comment's framing of the interlocks. Moving a destructive predicate is where these
  regress, and MF2d says it didn't.
- **`retirement.canary` is validated cross-field, not merely type-checked** (G-3 is that
  it is untested, not that it is wrong), and the `priorState === "undelivered"` branch
  correctly forbids a canary outright.
- **The docs change reframes rather than embellishes** — "considers only the shared
  open-state predicate and then only `delivered-unacked`" is a more accurate sentence
  than the one it replaced, and it admits the detector's real structure.

## §6 Verdict

**APPROVE.** All seven requested confirmations pass. The two findings the fix packet
called major are addressed at the level asked for: F-1 is genuinely closed (both
detector lines load-bearing, proved by two mutations), and F-2's stated criterion is met
and non-vacuous. Twelve of fourteen mutations died, including every one the brief
mandated; M15 and M11 are both dead. The gate is green at 3975 with exactly the +5 the
five new tests account for, `tsc` is clean, `biome` is clean, and the diff is a strict
subset of the allowed file set.

Highest new severity: **minor**. Nothing here blocks the PR.

Follow-ups in the order I would take them:

1. **G-1** — decide whether FX-01.4 should exist at all. My F-4 was wrong; the honest
   options are to revert it, or to keep it and guard `markDispatchDelivered` so the
   widened `isDispatch` invariant is safe. Fix the `docs/how/pij.md` sentence either way.
2. **G-2** — F-2's underlying cost is not resolved for an active home, and dispatch-record
   retention still has no policy.
3. **G-4** — cover the two pi/omp revive branches (naturally bundled with F-5, already
   carried to Phase 5/13).
4. **G-3** — one assertion on a mismatched `retirement.canary`.
5. **G-5** — a `RegistryPort` method for terminal descriptors, when that seam is next open.

Still open from the first pass and untouched here, by design: F-5, F-7, F-8, F-9.

---

**TERMINAL REPORT — Re-review FX-01.** This pass is CLOSED. No mutation, edit, or other
repository change was made after this section was written; every tracked path is
byte-identical to `43de01dd6188aed03e686b7d7b96bb8e56d15ae5`, verified by `cmp` against
pre-mutation copies and by `git diff --exit-code`. The only untracked change
attributable to this pass is this appended section. Further work on dlg-0010 needs a new
dispatch.

---

# Rebase review — Phase 2b onto `origin/main` 42b7268f (conflict resolution only)

**Reviewer**: pij-mobile-reptile (cold on the resolution) · **reviewId**: `review-01-rebase` · **Target**: `s391/item1b-dispatch-retire` @ `cf2a950d8940ce9e2cdeb10ea8129f934cbfeed0` · **New base**: `origin/main` `42b7268f` (s392 PR #13 — bind guard + lifecycle-filtered pane resolvers) · **Brief**: `review-brief-rebase.md`

> The two TERMINAL banners above close the first pass (`ad265b1`) and the FX-01 re-review (`43de01d`) respectively. This third section is scoped to the **rebase conflict resolution only** and closes nothing else.

## §0 Scaffolding, and the limits of this pass

Stated before the findings, so that nothing I did not examine can be mistaken for something I found clean.

**What this pass is.** A scoped confirmation that the rebase from `9912bf8` onto `42b7268f` preserved both sides. It is **not** a fresh review of the 1b feature — that was done twice, above.

**The baseline contains one commit this seat has never reviewed.** The brief describes the approved content as `ad265b1 → 43de01d → 2c1e5dd` "(twice reviewed)". That is accurate for the first two commits only. **`2c1e5dd` (FX-02, "restore dispatch validator tripwire") has had no cold review from this seat** — it landed after my FX-01 re-review closed. I spot-checked it (§2.4) because it is the direct remediation of my own re-review finding G-1, and I can say its revert survived the rebase byte-identically; **a spot-check is not a review**, and I am not approving `2c1e5dd`'s content here. This is a limit of the pass, not a defect in the code. Recorded as **R-1**.

**Method, and what each method can and cannot prove.**
- The load-bearing check is an **interdiff**: `git diff 9912bf8..2c1e5dd` vs `git diff 42b7268..cf2a950`, diffed against each other (`/tmp/d10rb-interdiff.txt`, 253 lines). This proves *what the rebase changed about the change itself*. It cannot prove the result is correct — only that it is the same change, plus exactly the deltas I enumerate.
- The "s392 survived" check is **set-based on trimmed lines** in two directions. The forward direction (every s392-added line is findable on HEAD) is weak on its own — a duplicated `}` would satisfy it. The reverse direction (our deletions ∩ s392's additions = ∅) is exact, and it is the one I rely on.
- **Neither textual check can catch a semantic interaction** between the two sides. §2.5 is my attempt at that, by reading s392's own diff rather than only its result. It is a judgement, not a proof.

**Not checked, and therefore not cleared.**
- No live-daemon proof; no `harness checks` / `just smoke` (I ran `vitest`, `tsc` and `biome` directly).
- I did not re-run the other 12 mutations from the FX-01 pass — the brief names two, and I ran exactly those two.
- I did not review s392 PR #13 itself. I checked only that our branch does not damage it.
- No concurrency, crash-injection, or ordering-under-load testing of the merged tick.
- The 4 `it()` blocks our branch adds to `cli.integration.test.ts` were counted, not read, in this pass (they were read in the FX-01 pass at a different commit).

**Freeze integrity.** HEAD never moved; tracked tree clean at open and close; 26 untracked orchestration paths baselined to `/tmp/d10rb-baseline-status.txt` and unchanged at close (`NO_UNTRACKED_DELTA`). Both mutated sources restored byte-identical two ways (`cmp` against `/tmp/d10rb-{dispatch.ts,daemon.ts}.orig`, and `git diff --exit-code`).

## §1 Freeze

| Fact | Value |
|---|---|
| HEAD | `cf2a950d8940ce9e2cdeb10ea8129f934cbfeed0` |
| branch | `s391/item1b-dispatch-retire` |
| `git merge-base origin/main HEAD` | `42b7268f…` = `origin/main` exactly (branch is *on* main's tip, not merged into a stale one) |
| commits on base | 3 — `42fceda` / `1fca60e` / `cf2a950`, 1:1 with pre-rebase `ad265b1` / `43de01d` / `2c1e5dd` |
| pre-rebase tips still reachable | yes (reflog `@{1}`–`@{3}`), so the interdiff is computable and was |
| tracked tree | clean |

## §2 The three confirmations

| # | Confirm | Verdict |
|---|---|---|
| 1 | Nothing semantic dropped from either side | **CONFIRMED** |
| 2 | Scope ⊆ 1b's file set vs `origin/main` | **CONFIRMED** (16 files — see R-2 on the arithmetic) |
| 3 | Full suite 0 fail; both load-bearing mutations still RED | **CONFIRMED** |

### §2.1 Nothing dropped — our side

The branch delta is **identical in shape** across the rebase before any content inspection: same 16 files, same totals (**1115 insertions, 64 deletions**) on both `9912bf8..2c1e5dd` and `42b7268..cf2a950`. Equal totals are necessary but not sufficient, so the interdiff:

**Of the 16 files, 14 have a byte-identical branch-delta diff old vs new** (they do not appear in the interdiff at all): `cli.integration.test.ts`, `core/anomalies.ts`, `core/anomalies.test.ts`, `core/cli.test.ts`, `core/orchestration/pa-capability.{ts,test.ts}`, `core/platform/dispatch.{ts,test.ts}`, `core/platform/types.ts`, `tasks.md`, `execution.log.md`, and — modulo blob hashes and hunk offsets only — `cli.ts`, `core/cli.ts`, `docs/how/pij.md`.

**Exactly two real content deltas exist, and both are the resolutions the coder declared:**

1. **`daemon.ts` import block.** Our `import { isOpenDispatch, retireDispatch }` (`:102`) now sits above main's `import type { ProcessSnapshot }` (`:103`). Both present; `ProcessSnapshot` is still referenced at **8** sites (`:220`, `:262-264`, `:292`, `:323-324`, `:394`), so main's import is load-bearing, not orphaned. The sweep hunk itself kept identical `-24/+52` counts — the body was not touched by the resolution.
2. **`daemon.delivery.test.ts` tail + import.** The appended `closed-recipient dispatch retirement` describe now follows main's `dual-backend pointer delivery` describe instead of `closed-recipient queue retirement`; the import line became `import { type DaemonPorts, pointerLine }` — main's `pointerLine` retained and used at `:531`, `:549`. All four describes present: `deliverPass` (`:137`), `closed-recipient queue retirement` (`:253`), `dual-backend pointer delivery` (`:512`, main's), `closed-recipient dispatch retirement` (`:562`, ours).

Everything the brief names by hand is present and reachable on HEAD: the closed-recipient sweep with both arms (`daemon.ts:826-875`), the early `closedRecipients` guard (`:846`), `isOpenDispatch` (`dispatch.ts:135-139`), the drain guard (`"the independent drain guard never injects for a descriptor dissolved after indexing"`), and the T011-style negative fixtures on both arms (`"leaves accidental dissolves, incomplete closes, live seats, and fs mail untouched"` and `"leaves dispatches untouched unless the recipient is fully and deliberately closed"`).

### §2.2 Nothing dropped — s392's side

Only **3** of our 16 files are also in s392 PR #13's 12: `cli.ts`, `core/cli.ts`, `daemon.ts`. Those are the only places a conflict could have destroyed upstream work.

| file | s392-added lines | missing on HEAD | **deleted by our branch** |
|---|---|---|---|
| `cli.ts` | 27 | 0 | **0** |
| `core/cli.ts` | 10 | 0 | **0** |
| `daemon.ts` | 21 | 0 | **0** |

The right-hand column is the exact one: the set of lines our branch deletes relative to `origin/main`, intersected with the set s392 added, is **empty in all three files**. Our branch removes only its own predecessor code — which the full `daemon.ts` diff vs main confirms by inspection (the `-` block is the old `openRecipients()` loop and nothing else).

**The stronger evidence is behavioural, not textual**: the full suite on the merged tree is green, and that suite includes every s392 test file (`core/daemon/loop.test.ts` +104, `index-state.test.ts` +80, `daemon.test.ts` +67, `discovery.test.ts` +6, `spawn.test.ts` +8). Source-line survival and test survival are different claims; both hold.

### §2.3 Scope

`git diff --name-only origin/main..HEAD` is **16 files, exactly the same 16** as the pre-rebase `9912bf8..2c1e5dd` set. No file entered or left during the rebase — which is the property that actually matters here. See **R-2** on the brief's "15".

### §2.4 FX-02 survived the rebase (spot-check, not review — see §0)

`git diff 42fceda..cf2a950 -- core/platform/types.ts` is **empty**: `types.ts` on HEAD is net-identical to the first commit, i.e. FX-01.4's `isDispatch` relaxation is fully reverted, exactly as `fix-02.md` promised. The validator tripwire is back — `types.ts:584` requires `ack === undefined && canary === undefined` on the retired branch. That is the remediation of re-review **G-1**, carried through the rebase intact.

### §2.5 The one semantic interaction I could find — checked, clean

This is the class of defect the textual checks structurally cannot see, so I went looking for it.

s392 adds `isPaneDeliveryTarget` (`core/discovery.ts:118`): a descriptor is a live delivery target when `lifecycle !== "dissolved" && lifecycle !== "failed"`. **Upstream now treats `"failed"` as non-live.** Our sweep's first clause (`daemon.ts:834`) knows only `"dissolved"`, so after the rebase the same daemon holds two different notions of "not live" over a 5-value union (`core/types.ts:57`).

**It does not bite.** A `failed` seat is excluded from our sweep, and that is the conservative-correct outcome twice over: a crash is not a deliberate close, and the remaining three clauses (`closeIntent !== undefined`, `terminal?.disposition === "requested"`, no `revivePendingAt`) would exclude it anyway. The sweep retires mail for seats that were *asked* to close; a crashed seat's mail should survive for revive. Recorded as **R-3** (info) because the divergence is now real and a future reader will have to re-derive this.

Two adjacent interactions also checked and clean: (a) s392 changed `unbindGonePane` (`daemon.ts:166`) to bail on `E-AMBIG` rather than `.find()`-ing the first match, which can only leave *fewer* seats dissolved — strictly more conservative for us; (b) s392's per-tick `processSnapshot` hoist does not touch our sweep, which never reads it. The sweep's call site (`daemon.ts:410`, between `index.rebuild` and `refreshPaneSignals`) is **main's line, not ours** — it arrived with the already-merged Phase-2 queue-retire item — and neither side moved it.

### §2.6 Gate

Full `npx vitest run .pi/extensions/pij/` via `pij bg` (`bg-mtbmlg67-78viml`): **171 files passed | 2 skipped (173)**, **3987 passed | 15 skipped (4002)**, `VITEST_EXIT=0`, 170.67s.

Anti-vacuity arithmetic, because a green number proves nothing on its own: across all 6 test files our branch touches, the net `it(`/`test(` count vs `origin/main` is **+13 added, −0 removed**. **Nothing was deleted or disabled to reach green.** (Some of the 4 in `cli.integration.test.ts` may be parameterised, so `+13` is a floor on tests, not an exact count; the `−0` is exact and is the load-bearing half.) Post-restore: fast set **571/571**, `tsc --noEmit` **0 errors**, `biome check` clean on 7 files.

## §3 Dim-0 — the two load-bearing mutations, both still RED

Baselined first: each `-t` selector was proved to match **exactly 1 test** and pass unmutated, so a later failure is a kill and not a mis-selection.

| ID | Site | Mutation | Killer | Result |
|---|---|---|---|---|
| MR1 | `core/platform/dispatch.ts:138` | `isOpenDispatch` also admits `"retired"` | `anomalies.test.ts` → *"flags only stale delivered-unacked dispatches with record and age evidence"* | **RED** — `expected [ …, … ] to have a length of 1 but got 2` |
| MR2 | `daemon.ts:846` | delete `if (closedRecipients.size === 0) return;` | `daemon.delivery.test.ts` → *"does not list the dispatch store when no complete closed recipient exists"* | **RED** — `expected "list" to not be called at all, but actually been called 1 times` |

Both restored byte-identical (`cmp` + `git diff --exit-code`) before the regreen runs in §2.6. The failure messages are the same ones these mutants produced at `43de01d`, which is the point: the rebase did not quietly detach either guard from its test.

## §4 Findings

All **informational**. No major, no minor.

| id | sev | what |
|---|---|---|
| **R-1** | info | **The approved baseline includes an unreviewed commit.** `2c1e5dd` (FX-02) was never cold-reviewed by this seat; the brief's "twice reviewed" covers `ad265b1` and `43de01d` only. Spot-checked in §2.4, not reviewed. If the stream wants FX-02 covered, it needs its own pass — it is small (5 files, 34+/70−) and it *removes* behaviour, so the risk is low, but "low risk" and "reviewed" are different words. |
| **R-2** | info | **Scope arithmetic: the brief says 15 files, the set is 16.** The 16 are byte-for-byte the same 16 as pre-rebase, so nothing entered during the rebase and the confirm's intent holds. The "15" appears carried from FX-01's allowed-file list, which did not include both `pa-capability` files. Worth correcting in the packet so a future reader does not read the mismatch as scope creep. |
| **R-3** | info | **Two notions of "not live" now coexist in the daemon.** s392's `isPaneDeliveryTarget` excludes `"failed"` as well as `"dissolved"`; our sweep clause (`daemon.ts:834`) excludes only `"dissolved"`. Benign today (§2.5) and arguably correct, but it is an undocumented divergence introduced *by the rebase* rather than by either side alone. A one-line comment at `daemon.ts:834` saying "a crashed (`failed`) seat is deliberately not swept — a crash is not a deliberate close" would stop the next reader re-deriving it. |

## §5 What I liked

**The resolution is minimal in the way that is hard to fake.** Fourteen of sixteen files came through with byte-identical diffs, and the two that did not changed by an import line and a describe's position. A rebase that "looks clean" usually means nobody diffed the diff; here the interdiff is 253 lines of hunk headers and blob hashes with two content deltas in it, both declared in advance by the coder. Declaring them in advance is what made this pass cheap — I was checking a claim, not hunting.

**Both merged imports are load-bearing.** It would have been easy to keep `ProcessSnapshot` as a dead import to make the conflict go away; it is used at 8 sites, and `pointerLine` at 2. The test-file tail kept both suites rather than the more tempting "keep ours".

**The two mutations still bite, with the same messages.** That is the only evidence that actually distinguishes "the code is still there" from "the code is still *guarded*", and it is why the brief was right to ask for it rather than settling for a green suite.

## §6 Verdict

**APPROVE** — `cf2a950d8940ce9e2cdeb10ea8129f934cbfeed0`.

The rebase preserved both sides. Our sweep, its early guard, `isOpenDispatch`, the drain guard and the negative fixtures are all present and still guarded (MR1/MR2 RED). s392's bind guard and lifecycle-filtered resolvers lost **zero** lines to our branch and their tests are green on the merged tree. Scope is unchanged from the pre-rebase set. Three informational notes, none blocking: **R-1** (an unreviewed commit sits in the approved baseline — a gap in coverage, not in the code), **R-2** (packet says 15 files, reality is 16 and always was), **R-3** (a benign `failed`-vs-`dissolved` divergence worth one comment).

Carried and still open, untouched by this pass: re-review **G-2** (the prescan does not avoid `list()` on a busy home; no dispatch-record prune exists), **G-3**, **G-4**, **G-5**, and first-pass **F-5/F-7/F-8/F-9**.

---

**TERMINAL REPORT — Rebase review.** This pass is CLOSED. No mutation, file write or gate run was performed after this section was written; the two mutants were restored and re-verified byte-identical before it. Sources restored: `.pi/extensions/pij/core/platform/dispatch.ts`, `.pi/extensions/pij/daemon.ts`. Evidence retained: `/tmp/d10rb-interdiff.txt`, `/tmp/d10rb-{old,new}-delta.diff`, `/tmp/d10rb-baseline-status.txt`, `/tmp/d10rb-status-close.txt`, `/tmp/d10rb-{dispatch.ts,daemon.ts}.orig`; gate log `~/.pij/pij-mobile-reptile/bg-mtbmlg67-78viml.log`.
