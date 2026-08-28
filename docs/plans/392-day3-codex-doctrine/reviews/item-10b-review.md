# Cold review — item 10b (pane-misbind bind guard + shared resolver)

> **TERMINAL REPORT.** This pass is CLOSED. No mutations were run after this file was
> written, and no further pass is open on this side. Reviewer: `pij-wilful-morton`.

**Commit**: `c49806e` "fix(pij): prevent pane reuse misbinding" (Vaughan Knight,
2026-08-27 23:38:23 +1000) · 15 files, +507/−80 (12 code files)
**Verdict**: ✅ **APPROVE** — no blocking findings. Four advisories and seven
informational notes, none of which block landing.

---

## 1. Scaffolding, method, and the limits of this pass — stated first

**What I built.** A throwaway detached worktree at the commit under review:

```
git -C ~/GitHub/pij worktree add --detach /tmp/pij-10b-cold c49806e
ln -s ~/GitHub/pij/node_modules /tmp/pij-10b-cold/node_modules
```

All mutation testing ran in that tree, never in a checkout anyone else uses. Every
mutation was applied by an exact-string patcher that **asserts the anchor occurs exactly
once** before writing, so no mutation could silently mis-apply or apply twice. Pristine
copies of `discovery.ts`, `loop.ts`, `index-state.ts`, `daemon.ts`, `canary.ts` and
`daemon.test.ts` were taken before any patch and restored after each; `git status
--porcelain` was checked empty between phases and is empty now. The tree has since been
removed.

**Method.** Dim-0 throughout: for every rule the commit claims, I reverted **that rule
alone** and required the corresponding test to go RED. Where the packet asserted a
result, I re-derived it rather than trusting it. Where a guard's boundary was stated, I
probed the boundary with adversarial inputs rather than the happy path.

**Limits of this pass — a gate I did not examine and a gate I found clean must not look
the same.**

- `node_modules` is a **symlink to the main checkout's install**, not a clean `npm ci`.
  Lockfile/dependency drift is therefore invisible to every test result below.
- I ran the **pij extension suite** (3989 tests) and `typecheck`. I did **not** run
  `just smoke`, `harness checks`, `just self-check`, or the repo-wide test suite.
- `just lint` is red at `c49806e`, but it is red for **pre-existing** reasons (9 errors /
  11 warnings across `producers/`, `core/models/`, `adapters/`, `skills/flow-pair/test/`,
  `biome.json`) — the identical red I scoped in the item-12 review. **None of the
  diagnostics are in this commit's 12 code files.** See §8.
- My mutation testing exercised the **five test files most coupled** to the change
  (`daemon.test.ts`, `loop.test.ts`, `index-state.test.ts`, `discovery.test.ts`,
  `spawn.test.ts`, 355 tests). Two mutations were additionally run against the **full**
  3989-test suite where a "nothing anywhere covers this" claim required it (§4).
- I did **not** exercise the change against a live tmux fleet. Every liveness result
  below is from the fake ports, not from a real `ps`.

**Side effects on the repository**: exactly one — this file. Nothing was committed,
staged, or pushed. The trial merge in §8 was aborted and the tree verified clean.

**Lineage check.** Packet says "Base: main + item-10a" — accurate. True merge-base with
`origin/main` (`df543c3`) is `10483d8`; item 10a (`03d7bac`) is branch-only, not yet on
main. Main-only files since the base are `harness/scripts/pij-skill-check*`,
`skills/pij/references/routes/peer.md` and two `government/briefs/*` — **zero overlap**
with this commit's `.pi/extensions/pij/**` surface. Disjoint, as the plan note claimed.

---

## 2. Dim-0 — every guard mutated alone

Control first, so every later result is attributable: the unmutated targeted set is
**5 files / 353 passed / 2 skipped**, and the unmutated full suite is **3974 passed /
15 skipped** (exactly the numbers the packet states).

| # | Guard reverted | Result | RED tests |
|---|---|---|---|
| M1 | `isPaneDeliveryTarget` → `return true` | **4 RED / 3 files** | `discovery.test` *ignores a terminal seat when a live seat has reused its pane*; `spawn.test` *terminal pane history cannot hide the live caller…*; `index-state.test` *resolves bound and pending panes but never dissolved or failed panes*; `index-state.test` *a terminal descriptor cannot overwrite the fresh seat that reused its pane* |
| M2 | `identity?.cause !== "session-id-match"` → `false` | **1 RED** | `loop.test` *planned binding refuses a pane whose harness process names another session* |
| M3a | drop only the `durable?.lifecycle` clauses | **1 RED** | `loop.test` *a stale pending snapshot cannot bind over a durable dissolved descriptor* |
| M3b | delete the whole terminal early-return | **1 RED** | same as M3a |
| M5 | drop `harness === "copilot" && !isCopilotSessionId(planned)` | **0 RED — fully green** | *(see ADV-1)* |
| M6 | drop `if (identity?.liveness !== "alive")` on the discovery path | **1 RED** | `loop.test` *a discovered Claude transcript cannot bind when the pane process names a foreign session* |

The orchestrator reported "2 RED" for M1; the true figure is **4**, because the resolver
is also load-bearing for `resolveSelf` and `deriveCallerParent`, not only for
`IndexState`. That is a stronger result than claimed, not a weaker one.

M3a vs M3b is the interesting pair: reverting **only** the two `durable?.` clauses REDs
the same single test as deleting the whole block, which proves the durable-record read —
not the descriptor's own lifecycle — is what the test actually depends on. The
`descriptor.lifecycle === "dissolved" | "failed"` half of that early return is
**unexercised** by any test I ran (INFO-7).

**Every guard except M5 is non-vacuous.**

---

## 3. The incident replay — the packet's key focus

**Answer: it is NOT vacuous, but it has no single-mutant sensitivity, and half of what
its title claims is not proven by this commit.**

The packet's hypothesis was that the replay passes trivially because the seat is
pane-less + dissolved and pre-existing `pending()`/`bound` filters already exclude it.
**That hypothesis is wrong**, and I can say why precisely.

### 3.1 It does reach the code under test

I instrumented `driveSession` and confirmed the daemon enters it with the stale
descriptor on **both** ticks:

```
DS-ENTER pij-nasty-tick pending %108
DS-ENTER pij-nasty-tick pending %108
```

So the seat is not filtered out before the guards. With the durable guard intact it
returns there; with the durable guard removed it reaches the planned-bind gate
(`DS-REACHED-PLANNED-GATE … true`) and is then stopped by the session-id-match guard.

### 3.2 It is a conjunction test

| mutation set | replay |
|---|---|
| M1 alone | GREEN |
| M2 alone | GREEN |
| M3a alone / M3b alone | GREEN |
| M5 alone / M6 alone | GREEN |
| **M2 + M3b** | **RED** — `expect(logs.some(l => l.includes("spawn pij-nasty-tick: bound"))).toBe(false)` fails |
| all four (M1+M2+M3b+M6) | **RED** — same assertion, only that assertion |

So the replay proves the *system-level* claim ("the incident cannot recur") and holds as
long as **at least one** of the two bind-path guards survives. That is genuine
belt-and-suspenders value, and it is materially different from "vacuous". But it means
**no single regression to either guard will ever turn this test red** — the loop-level
tests are the only single-mutant sensors, and they exist (M2, M3a both RED them).

### 3.3 The delivery half of the title is carried by pre-existing code

The test is named *"never **delivers to** or binds…"*, but `expect(ports.sent).toEqual([])`
and the "no ready notice" assertion **never failed under any mutation I ran, including
all four guards removed simultaneously**. Only the bind assertion (line 258) ever fails.

The delivery half is held by pre-existing code this commit does not touch —
`Daemon.drainInboxLocked` (`daemon.ts:1102–1109`) returns early for a durable
`lifecycle === "dissolved"` recipient, and `daemon.ts:1112` returns early when the
indexed descriptor has no pane. I confirmed the reused-pane variant too: a probe fixture
in which the **durable record keeps its pane** (`%108`) still delivers nothing under M1,
M2 or M3b individually.

**This is not a defect in the code — it is a mis-statement of what the fixture proves.**
The commit does not need to protect delivery here; the pre-existing dissolved-recipient
check already does. But a reader who trusts the test name will believe c49806e is what
stops the delivery, and a future refactor that removed the `drainInboxLocked` check would
not be caught by this test.

### 3.4 The fixture couples itself to daemon internals

`processSnapshot()` in the fixture has a side effect:

```ts
processSnapshot: () => {
  staleVisible = false;      // ← flips registry.list() to [] on every later call
  return { ok: true, … };
}
```

This silently encodes an assumption about **when** the daemon captures the process table
relative to its index rebuild. If that capture moves (and this very commit moved it —
`daemon.ts:542` now hoists it immediately before the pending loop), the fixture's meaning
changes without any assertion changing.

I proved the flip is doing **no protective work**: with `staleVisible = false` removed so
the stale descriptor stays visible across both ticks, the replay **still passes** with
guards intact, and still passes under M3b alone. It only alters which guard fires first.
So the coupling buys nothing and can only mislead later.

### 3.5 Recommended strengthening (not blocking)

Two small changes would make the replay say what it means:

1. Drop `staleVisible = false` from the fixture's `processSnapshot` — proven to change
   no verdict, removes a hidden coupling to tick ordering.
2. Split the delivery claim into its own fixture that drives the **reused-pane class**
   the incident is actually about (a dissolved seat still holding `%108` **plus** a fresh
   live seat that reused `%108`), so that the resolver — not the pre-existing
   dissolved-recipient check — is what the delivery assertion depends on.

Neither is required to land.

---

## 4. The sweep — does it catch a new unfiltered site, and is the allowlist tight?

`index-state.test.ts` walks every non-`.test.ts` `.ts` under `.pi/extensions/pij/`,
flags any line containing `.paneId ===` (excluding `=== undefined`), and allows two
sites by file + ±4-line context.

**It catches the canonical shape.** Adding
`ds.filter((d) => d.paneId === p)` to `core/canary.ts` produced exactly the expected
failure:

```
+ "core/canary.ts:214: export function pA(…) { return ds.filter((d) => d.paneId === p)[0]; }"
```

**Bypass probes** (each added to a real source file, sweep re-run):

| shape | caught? | real risk |
|---|---|---|
| `d.paneId === p` | ✅ caught | — |
| `d.paneId===p` | ❌ bypass | **none in practice** — Biome reformats it to the spaced form (verified: `biome format` rewrites `d.paneId===p` → `d.paneId === p`), so it cannot survive a formatted commit |
| `p === d.paneId` (reversed operands) | ❌ bypass | plausible human shape |
| `d["paneId"] === p` | ❌ bypass | unlikely |
| `({paneId}) => paneId === p` (destructured) | ❌ bypass | **plausible human shape** |
| `!(d.paneId !== p)` | ❌ bypass | contrived |

**Allowlist breadth.** I planted a genuinely unfiltered resolver *inside* `discovery.ts`,
four lines above the allowlisted anchor:

```ts
const bogus = descriptors.filter((d) => d.paneId === paneId);   // ← no lifecycle filter
```

The sweep **passed**. The ±4-line window means any new ad-hoc resolver added near the
shared one in `core/discovery.ts` is admitted — and `discovery.ts` is precisely the file
where a second pane helper would most plausibly be written. Blast radius is one file, and
the same applies to `core/current-session.ts`.

**False positive.** A *comment* reading `// never write d.paneId === pane by hand; use
resolveLivePane` **fails the sweep**. The check is textual, so documenting the rule
breaks the build — mildly self-defeating for a repo whose doctrine is "encode, don't
document".

**Allowlist semantics are sound.** I checked the premise rather than the outcome:
`pendingPaneOccupant` (`current-session.ts:80–87`) filters `lifecycle === "pending" ||
"ready"`, both of which are non-terminal by construction, and it refuses to guess when
more than one matches. Exempting it is semantically correct, not merely convenient.

**Site inventory.** Seven `.paneId ===` lines survive in source; five are
`=== undefined` null-checks, and the two substantive ones are exactly the two allowlisted
sites. The report's claim that all runtime pane→seat resolution now goes through
`resolveLivePane` **holds**.

---

## 5. `E-AMBIG` caller enumeration — as the packet required

`IndexState.resolvePane` has **zero production callers** (only its own definition and
tests). Its `Result` return and its `E-AMBIG` path are, today, exercised only by
`index-state.test.ts`. The public-API churn is therefore free of live risk — and also
free of live value (INFO-3).

Every `resolveLivePane` caller, and what each does with `!ok`:

| # | site | `!ok` handling | verdict |
|---|---|---|---|
| 1 | `daemon.ts:166` `unbindGonePane` | logs `unbind pane %N: E-AMBIG …`, returns without dissolving | ✅ fail-safe **and** visible |
| 2 | `spawn.ts:798` `deriveCallerParent` | `if (resolved.ok) return resolved.value` → falls through to `undefined` | ⚠️ **swallows** — INFO-4 |
| 3 | `core/cli.ts:2005` `selfId` | `return resolved` | ✅ propagates |
| 4 | `index-state.ts:109` `resolvePane` | `return` the Result | ✅ propagates (no callers) |
| 5 | `discovery.ts:162` `resolveSelf` | `return resolved` | ✅ propagates |
| 6 | `cli.ts:1154` `ensureCurrentRegistration` | `return paneOwner` | ✅ propagates |
| 7 | `cli.ts:2028` `waitForFocusPiRegistration` | `return paneOwner` | ✅ propagates |
| 8 | `cli.ts:4015` `orchestrationSelf` | `return paneOwner` | ✅ propagates |
| 9 | `cli.ts:4359` `runAgentSpawn` | propagates into `callerRes`, then `callerRes.ok ? … : undefined` — but a **loud stderr warning** fires when `spawnedBy` is unset (FX001-1) | ✅ degraded, but visible |
| 10 | `cli.ts:4601` `resolveChoreSeatId` | `derived = !paneOwner.ok ? paneOwner : …`, surfaced as `{error}` | ✅ propagates |

**No caller mis-routes on ambiguity.** The packet's specific fear — "a caller that treats
`!ok` as *no match* could mis-route" — is not realised: site 2 converts `E-AMBIG` to
"no parent", which loses a diagnostic but never picks a wrong seat. Its three `cli.ts`
callers (2249, 2661, 2768) do not emit the FX001-1 warning that site 9 does, so an
ambiguous pane there produces a silently parentless spawn.

---

## 6. The planned-bind guard — correct direction, but silent when it refuses

Framed as this repo asks: **what does removing it do?** Removing
`identity?.cause !== "session-id-match"` makes the daemon bind *more* (including the
misbind this stream exists to remove). It is therefore a **one-directional safety
interlock — a brake, not a policy**. Nothing downstream inherits a wrong answer from it;
it can only ever refuse. That is the right shape for this fix, and it is why none of what
follows is blocking.

Two properties of the brake are worth the o-prime's attention.

**(a) It demands the strongest rung, and treats "unknown" like "wrong".**
`resolveAgentLiveness` is deliberately laddered, and `process-snapshot.ts` states the
contract in its own words: *"unreadable is NOT-PROBEABLE, never ABSENT … which mutates no
descriptor and sends no notice."* The new guard accepts **only** rung 2
(`cause === "session-id-match"`). Every other outcome — `probe-unavailable` (a failed
`ps`), `identity-indeterminate` (an unparseable row), and even `alive` /
`harness-process-present` (a live harness whose argv carries no session id) — is refused
identically. The guard honours the letter of that contract (it mutates nothing, notifies
nobody) while converting "we could not tell" into "do not bind".

I checked the two ways this could bite and found both **smaller than they first look**,
which is worth saying plainly rather than overstating:

- Width truncation is **not** a risk: the capture uses `ps -Awwo …`, and the module
  documents `-ww` as mandatory for exactly this reason.
- Subtree depth is bounded at `AGENT_LIVENESS_MAX_DEPTH = 3`, but the same probe is
  already trusted to declare **death** in the reconciler — if depth 3 were inadequate in
  this fleet, live seats would already be being reaped. Empirically it is adequate.

So the residual exposure is a transient `ps` failure (recovers next tick) or a harness
launched without its id in argv.

**(b) When it refuses, nothing says so.** The guard returns `{ kind: "waiting" }`, and the
pending loop logs only for `out.kind !== "waiting" && !== "boot" && !== "held-by-pane-input"`
(`daemon.ts:566`). A seat blocked by this guard is therefore **indefinitely and silently
stuck in `pending`** — indistinguishable from a slow boot. The file's own neighbouring
code sets the opposite standard: the `held-by-pane-input` branch four lines away is
commented *"Never silent: say it once when it starts."* A once-per-seat log line
(`spawn <id>: bind withheld — pane process does not name <planned> (<cause>)`) would cost
nothing and would turn an unexplainable stall into a one-line diagnosis. **ADV-2.**

---

## 7. Other behavioural deltas I verified

- **`unbindGonePane` no longer retires `failed` seats.** The old predicate was
  `lifecycle !== "dissolved"`; `isPaneDeliveryTarget` also excludes `"failed"`. A `failed`
  seat whose pane disappears is therefore no longer `dissolve()`d and its entry in
  `this.drives` is no longer deleted (only two `drives.delete` sites exist:
  `daemon.ts:174`, `:612`). `failed` is already terminal so the user-visible impact is
  small, and the death reconciler may cover it — I did not confirm that it does. INFO-5.
- **`ensureCurrentRegistration` widened its ambiguity set.** The old filter required
  `isPushedSeat && harnessSessionId && !dissolved` *before* the uniqueness test; the new
  code resolves across **all** live pane occupants and applies `isPushedSeat` afterwards.
  A pane holding one pushed seat plus one other live descriptor previously resolved and
  now returns `E-AMBIG`. Intentional per the report ("no caller guesses"), but it is a
  strictly-more-errors change. INFO-6.
- **`waitForFocusPiRegistration` moved its harness filter after resolution**, so
  ambiguity is now computed over all harnesses rather than pi-only. Same direction, same
  reasoning. INFO-6.
- **`driveSession` now performs `registry.read()` unconditionally**, before the
  `isPaneDead` early return. `FsRegistry.read` is one or two real file reads plus a tick
  read (`fs-registry.ts:317–326`). It is bounded by the **pending** cohort, not the full
  descriptor set, so it is nothing like the per-descriptor `ps` the s095 R2 comment
  forbids — but it is new I/O on a per-tick path and worth knowing about. INFO-7.
- **`deriveCallerParent` semantics changed beyond the lifecycle filter**: previously two
  descriptors on one pane (any lifecycle) yielded `undefined`; now one live + one terminal
  yields the live one. That is the fix, and `spawn.test.ts` pins it.
- **Per-tick snapshot memoisation is correct.** `processSnapshotThisTick` caches on
  `tickProcessSnapshot`, which `tick()` clears alongside `processStates.invalidate()`.
  Hoisting the capture to `daemon.ts:542` does not add a second `ps` per tick — the death
  sweep at `:791` now reuses the same value.

---

## 8. Gates, first-hand

| gate | command | result |
|---|---|---|
| pij extension suite | `npx vitest run .pi/extensions/pij/` | ✅ **171 files / 3974 passed / 15 skipped** (167s) |
| typecheck | `npx tsc --noEmit -p tsconfig.json` | ✅ exit 0, no output |
| targeted set (control) | 5 coupled files | ✅ 353 passed / 2 skipped |
| repo lint | `just lint` | ❌ red — **pre-existing**, 9 errors / 11 warnings / 505 files, **none in this commit's 12 code files** |
| windows-compat | `npx tsx harness/scripts/windows-compat.ts` | ❌ red — fails at its `lint` stage on the same pre-existing diagnostics, so its `focused-tests` stage never runs |

The report's "windows compatibility FAIL" is therefore **not** a portability finding
against this commit; it is the pre-existing lint red surfacing through a proxy. I looked
for a real portability defect instead and found one — see ADV-4.

**Trial merge with current main** (`origin/main` = `df543c3`): merged **cleanly**
(5 files, all item-12/governance). On the **merged** tree: targeted set 353 passed / 2
skipped, and `harness/scripts/pij-skill-check.sh` exits 0 "all green". Merge aborted;
tree verified clean.

The report's self-assessment (PARTIAL; extension suite green; repo-wide gate red outside
the fence) is **honest and matches what I measured**, including the TDD numbers.

---

## 9. Findings

| # | sev | where | finding |
|---|---|---|---|
| ADV-1 | advisory | `loop.ts:393` | `harness === "copilot" && !isCopilotSessionId(planned)` has **zero coverage**: deleting the clause passes the **entire 3989-test suite**. It is not dead code — it independently rejects a malformed planned id even when the process names it — but nothing pins it. One fixture (`plannedHarnessSessionId: "not-a-uuid"`, process argv naming that same string, expect `waiting`) closes it. |
| ADV-2 | advisory | `loop.ts:392–397`, `daemon.ts:566` | The bind guard refuses **silently and indefinitely**: `{kind:"waiting"}` is never logged, and every non-`session-id-match` outcome — including `probe-unavailable` / `identity-indeterminate`, which `process-snapshot.ts` explicitly designs to be consequence-free — is treated as refusal. Add a once-per-seat log naming the `cause`. |
| ADV-3 | advisory | `index-state.test.ts:126–176` | Sweep is bypassable by **reversed operands** and **destructuring** (both plausible human shapes), and its ±4-line allowlist admits a genuinely unfiltered resolver planted inside `core/discovery.ts` (proven). Also flags the pattern inside **comments**. A regex over `paneId` with both operand orders, and anchoring the allowlist to the specific line rather than a ±4 window, would tighten it. |
| ADV-4 | advisory | `index-state.test.ts:154–157` | `file.endsWith("/core/discovery.ts")` hard-codes the POSIX separator while the paths come from `join()`. On win32 the allowlist is **disarmed** and `discovery.ts:128` — the shared resolver itself — becomes a violation, failing the sweep. Verified with `path.win32`. Fix: compare `relative(root,file).split(sep).join("/")`. |
| INFO-1 | info | `daemon.test.ts:199` | Incident replay is a **conjunction** test: RED only when the durable guard **and** the bind guard are both removed. No single-guard regression will ever turn it red. §3.2. |
| INFO-2 | info | `daemon.test.ts:224` | Its `staleVisible = false` side effect inside `processSnapshot()` couples the fixture to tick-capture ordering; proven to change no verdict, so it is pure coupling. §3.4. |
| INFO-3 | info | `index-state.ts:108` | `IndexState.resolvePane` has **no production callers**; its new `Result` shape and `E-AMBIG` path are test-only today. |
| INFO-4 | info | `spawn.ts:798` | `deriveCallerParent` swallows `E-AMBIG` → `undefined`. Fail-safe (never mis-routes), but its three `cli.ts` callers lack the loud FX001-1 warning that `runAgentSpawn` emits. |
| INFO-5 | info | `daemon.ts:166` | `unbindGonePane` no longer retires `failed` seats or drops their `drives` entry (the predicate widened from `!== "dissolved"` to `isPaneDeliveryTarget`). |
| INFO-6 | info | `cli.ts:1154`, `:2028` | Ambiguity sets widened by moving `isPushedSeat` / harness filters *after* resolution — strictly more `E-AMBIG` than before. Intentional, but a behavioural delta. |
| INFO-7 | info | `loop.ts:243–251` | New unconditional `registry.read()` (1–2 fs reads) per **pending** descriptor per tick, ahead of the `isPaneDead` early return. Also: the `descriptor.lifecycle` half of that early return is unexercised — M3a and M3b RED the identical single test. |

**Nothing here blocks landing `c49806e`.**

---

## 10. What I did **not** examine

Stated so an unexamined item never reads as a clean one:

- `just smoke`, `harness checks`, `just self-check`, and the **repo-wide** test suite.
- Any live tmux / real-`ps` execution. All liveness evidence is from fake ports.
- A clean `npm ci`; dependency drift is invisible to every result above.
- The `cli.ts` behavioural deltas in §7 were read and reasoned about, **not** executed —
  I did not build fixtures for `ensureCurrentRegistration` or
  `waitForFocusPiRegistration` ambiguity.
- Whether the death reconciler compensates for INFO-5 (unretired `failed` seats).
- The non-code files in the commit (`tasks.md`, `execution.log.md`) beyond reading the
  report.
- Item 10a (`03d7bac`), which this branch sits on but which is out of this packet's fence.

---

## 11. Verdict

✅ **APPROVE.**

The resolver consolidation is real, load-bearing, and better-tested than the packet
claimed (4 RED, not 2). The two bind-path guards are each independently pinned by
loop-level tests. The sweep genuinely catches the shape a developer would actually write.
The change is a **brake in every dimension** — every mutation I ran made the daemon bind
or resolve *more*, never differently — which is exactly the right shape for a misbind
fix, and it is why four advisories can sit alongside an approval.

The packet's key question is answered: **the incident replay is not vacuous, but it is a
two-guard conjunction with no single-mutant sensitivity, and its "never delivers" clause
is carried entirely by pre-existing code.** The single highest-value follow-up is ADV-1
(one uncovered clause, one fixture closes it); the highest-value *operational* one is
ADV-2 (make the brake say when it engages).

**Terminal-once: this pass is closed.**
