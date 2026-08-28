# Cold review — Phase 15 / item 32 (daemon direct-child launch)

**Reviewer**: `pij-powerful-whale` (cold cross-model, claude-opus-5 via GitHub Copilot CLI)
**Frozen SHA**: `61d68f1b0352aa4a2c7801e62fb6c08c51e69b08` · parent `7117164` · branch `s391/item32-daemon-direct-child`
**Verdict**: **APPROVE** — highest remaining severity **low**. No open major/high.

---

## R0 — Scaffolding, and what I did NOT verify

Stated first, because a gate I did not examine and a gate I found clean must not
look the same.

**Scaffolding I used** (all outside the repo tree; the worktree was mutated only
under the harness below, always restored byte-identical):

- `/tmp/pw32/mut.sh` — sha-pinned mutation harness. Refuses to start when HEAD
  has moved off the pin **or** when `.pi/` is dirty (this worktree is shared and
  other seats commit into it mid-session); asserts each anchor occurs exactly
  once; **aborts on an empty `.pi/` diff** so a mutation that silently failed to
  apply can never be reported as a GREEN survivor; restores with
  `git checkout -- .pi/` and re-asserts cleanliness.
- `/tmp/pw32/probe_launch.sh`, `cwdprobe.sh`, `boot.sh` — real daemon launches,
  **every one in a `mktemp -d` `PIJ_HOME`**, with `TMUX`/`TMUX_PANE` unset.
- `/tmp/pw32/logs/M1…M6.log` — retained vitest output for every mutation.

**The live daemon was never signalled.** `~/.pij/daemon.lock` holds pid 82643
before and after this pass; nothing was written to `~/.pij`. Every process I
killed was one I had just spawned into a temp home, by numeric pid.

**NOT verified — do not read silence here as a clean bill:**

1. **`harness checks` was not run.** The coder names three baseline reds (`lint`
   / `test` / `windows-compat`, all tracing to `osc-7337-producer.ts` Biome
   findings and a missing local `pwsh`). I did not reproduce or refute them. I
   did verify the narrower claim they rest on — see R3.6.
2. **No tmux was exercised.** The composition test asserts against a *fake* tmux
   log. I confirmed `TmuxAdapter.newWindow` passes `cmd` + `args` as separate
   argv elements with no shell interpretation, but I never created a real tmux
   window, so the end-to-end `tmux new-window → node → daemon` path is proven
   only by its two halves, not as one chain.
3. **No Windows / `pwsh` behaviour.** `process.execPath` on Windows contains a
   space (`C:\Program Files\nodejs\node.exe`); I could not test how that
   interacts with tmux argv there. tmux is not a Windows surface, so I judge
   this out of scope rather than clean.
4. **`pij daemon start` was never run against the real home**, so the operator's
   actual auto-start path is proven only through the integration test's fake
   tmux plus my out-of-tree real launches.
5. **The full suite was run once, not repeatedly.** The three new real-launch
   tests spawn processes and wait on 5 s markers; I did not run them enough
   times to characterise flake risk. Given Phase 14 was itself a flake hunt,
   that is a real gap and I am naming it.

---

## R1 — Freeze, fence, and gates

| check | result |
|---|---|
| `HEAD` | `61d68f1b0352…` — matches the frozen SHA |
| `HEAD^` | `7117164` — matches the stated base |
| branch | `s391/item32-daemon-direct-child` |
| commits added | exactly 1 (`feat(spawn): launch daemon as direct Node child`) |
| tracked tree at start | clean |
| tracked tree at end | clean (`git status --porcelain -uno` empty) |

**Fence.** `git diff 7117164..61d68f1` touches 6 files: `cli.ts`, `daemon.ts`,
`cli.integration.test.ts`, `daemon.test.ts`, `docs/how/pij.md`, and the new
`execution.log.md`. That is exactly the declared scope — nothing outside it.
Production change is **26 lines across two files**.

**Gates I ran myself** (the vitest gate was launched *before* I touched
anything, so no mutation could overlap the baseline):

| gate | result |
|---|---|
| `npx vitest run .pi/extensions/pij/` | **172 files passed, 2 skipped · 4152 passed, 15 skipped, 0 failed** |
| `npx tsc --noEmit -p .` | exit 0 |
| `npx biome check` (4 touched files) | clean, no fixes applied |
| `npx vitest run harness/scripts/cli-invocation.test.ts` | 3 passed |

The suite result is an **exact match** to the coder's claim (172 / 4152 / 0) and
to `docs/plans/391-day3-core/logs/vitest-phase15.log`.

**Anti-vacuity.** Diffing the test files for removed declarations
(`^-` lines matching `\b(it|test|describe)(\.[a-z]+)?\(`) returns **empty**.
Across both test files there is exactly **one** removed line in total —
`-import { verifyPersistedAdoptDescriptor } from "./cli.js";` — replaced in
place by the two-symbol form. Nothing was deleted, weakened, retried or skipped
to make this green.

---

## R2 — Mutation ledger

All six sha-pinned at `61d68f1`, all restored byte-identical, all verified to
have actually landed before the run.

| # | mutation | expectation | result |
|---|---|---|---|
| **M1** | `daemonLaunchArgv` → `{ cmd: "npx", args: ["tsx", daemonPath] }` (Dim-0 #1) | composition + both real-launch cases RED | 🔴 **RED, 3 failed** — exactly the right three |
| **M2** | drop `onSignal("SIGHUP", shutdown)` (Dim-0 #2) | SIGHUP case RED, SIGTERM green | 🔴 **RED, exactly 1** |
| **M3** | `resolveTsxLoaderUrl()` → bare `"tsx"` (Dim-0 #3) | composition RED | 🔴 **RED, exactly 1** |
| **M4** | `cmd: process.execPath` → `cmd: "node"` | composition RED | 🔴 **RED, exactly 1** |
| **M5** | drop `onSignal("SIGINT", shutdown)` | ? | 🟢 **GREEN — survivor.** See P-2 |
| **M6** | relay *control* rewired to `daemonLaunchArgv(DAEMON_BIN)` | control RED if load-bearing | 🔴 **RED** — control is real |

Failure messages, which matter more than the counts:

- **M1** — `AssertionError: expected { cmd: 'npx', args: [ 'tsx', …(1) ] } to
  deeply equal { …(2) }` (composition), and on **both** real launches
  `expected 75076 to be 74659` / `expected 76126 to be 76038`. That second form
  is the **pid-identity** assertion firing — the property the item exists for,
  not a proxy for it. The 15-FX test and the relay control correctly stayed
  green under M1, since neither consumes the builder.
- **M2** — `expected { code: null, signal: 'SIGHUP' } to deeply equal
  { code: +0, signal: null }`. The daemon died *from* the signal instead of
  handling it. Precisely the regression, and SIGTERM was unaffected — the
  sensor is selective, not a blanket.
- **M6** — `expected 84841 not to be 84841`. The relay control asserts a pid
  *difference* that only a relay can produce, so it is a genuine negative
  control rather than decoration.

**M3 is worth reading carefully.** Under a bare `"tsx"` specifier the two
*real-launch* tests stayed **green**, because vitest's cwd is the repo root,
which has `node_modules`. Only the composition test caught it. That is not a
defect — the composition test does the job — but it means loader **absoluteness**
rests on a single sensor, and it is the reason I went outside vitest for the
cwd proof in R3.3.

---

## R3 — The dispatch's questions, answered

### R3.1 — Does `createRequire(...).resolve("tsx")` reach `dist/loader.mjs`?

**Yes, and I proved it two ways.**

Reading `node_modules/tsx/package.json` (version **4.23.0**), the `"."` export is
an **unconditional string**:

```
".": "./dist/loader.mjs"
```

There is no condition map on `"."`, so the `require` condition cannot divert to
a CJS entry. `cli.mjs` is reachable only via the separate `"./cli"` subpath (and
`bin`), which this code never asks for. Executing the exact production
expression confirms it:

```
resolved: …/node_modules/tsx/dist/loader.mjs
href    : file:///…/node_modules/tsx/dist/loader.mjs
```

**No child process** — the decisive proof, run for real in a temp `PIJ_HOME`:

```
ARGV: /opt/homebrew/bin/node --import file:///…/tsx/dist/loader.mjs …/daemon.ts
OUTER PID : 28257
LOCK  PID : 28257
IDENTICAL : YES
CHILDREN of outer: []          ← no relay
STDERR BYTES: 0
```

Note I deliberately ran that with `NODE_NO_WARNINGS` **cleared**. The old launch
inherited `NODE_NO_WARNINGS=1` from the CLI's shebang; the new one sets only
`PIJ_DAEMON_OWNED=1`, so I checked whether the loader now leaks an
`ExperimentalWarning` into the daemon's pane. It does not — **0 bytes** on
stderr. A plausible regression, checked and absent.

### R3.2 — The contrast the item is buying

Same probe, relay form, same temp-home discipline:

| | direct (`61d68f1`) | relay (former) |
|---|---|---|
| process levels | **1** | **3** — `npm exec` → `node …/.bin/tsx` → daemon |
| outer == `daemon.lock` pid | **YES** | NO (37228 vs 39546) |
| SIGHUP outcome | exit **0** | outer exits **129** (Hangup) |
| `spine/write.lock` after | released | **orphaned** |
| `spine/events.lock` after | released | **orphaned** |

The relay run also emitted:

```
npm warn exec The following package was not found and will be installed: tsx@4.23.12
```

That is an **unclaimed benefit** the coder did not write down, and it is
substantive: `ensureDaemonRunning` passes `cwd: process.cwd()` to
`newWindow`, so the daemon window's cwd is wherever the operator happened to
run `pij`. From any such cwd outside the repo, `npx tsx` resolved out of the npx
cache and pulled **tsx 4.23.12** — a different transformer from the 4.23.0 this
repo pins — with a network fetch on the daemon's boot path. Item 32 removes that
exposure as a side effect of removing the relay.

### R3.3 — cwd independence (Dim-0 #3)

Proven **outside** vitest, from a `mktemp -d` cwd with no `node_modules`,
comparing the two argv shapes present in this repo:

```
probe cwd = /tmp/pw32-nomod-BWg7Rr  (node_modules present? NO)

--- BARE_15fx_shape    node --import tsx <daemon>
    BOOTED (LOCKS_HELD): 0
    stderr first line : node:internal/modules/package_json_reader:301   ← resolution failure

--- ABS_item32_shape   node --import file:///…/tsx/dist/loader.mjs <daemon>
    BOOTED (LOCKS_HELD): 1
    stderr first line :                                                  ← clean boot
```

**Production is cwd-independent.** `resolveTsxLoaderUrl()` resolves from
`import.meta.url` (the CLI's own location), never from cwd, and the absolute
`file://` URL it produces is additionally space-safe by percent-encoding — a
small robustness gain over the previous raw-path form.

The same probe is what surfaced P-1 below.

### R3.4 — pid identity (Dim-0 #4)

Confirmed three independent ways: my own real launch (`OUTER 28257 == LOCK
28257`), the shipped test's assertion, and M1's inversion of it (`expected 75076
to be 74659`). The property is both true and sensored.

### R3.5 — `daemon stop` / `status` unchanged

`cli.ts`'s only production edits are the `pathToFileURL` import, the new
exported builder, and a 3-line swap inside `ensureDaemonRunning`. Everything
else in the diff is context. `daemonStatus()` (`:1564`) still projects
`parseLockFile` + `isAlive`, and stop still `process.kill(plan.pid, "SIGTERM")`
at `:1782` off the lock pid. Both are byte-unchanged.

I also checked the one place that could plausibly have broken silently:
`daemonSourceDir()` (`cli.ts:1651`) derives the daemon's checkout by regexing
`ps -o command=` output for
`(\S*[/\\]\.pi[/\\]extensions[/\\]pij[/\\])daemon\.ts`. The new argv still ends
in that same absolute `daemon.ts` path, so the match is unaffected — and it now
matches against the *same* process the lock names rather than a relay's child.
`core/state.ts`'s `COMMAND_RUNNERS` set (which contains `"npx"`/`"tsx"`/`"node"`)
governs **agent-seat** liveness, not the daemon, and `core/state.ts` is
byte-unchanged.

### R3.6 — `harness/scripts/cli-invocation.ts` (windows-compat)

Byte-unchanged, and **no coupling**: it contains no reference to `daemon`,
`--import`, or the launch builder. It uses `process.execPath` only to locate
`npm-cli.js` for npm/npx invocation, which is an independent concern. Its tests
pass (3/3). The coder's claim that no Windows file changed is confirmed by the
6-file fence.

### R3.7 — item 15 / 15-FX still green

`releases held write locks before SIGTERM exits` and `the real daemon SIGTERM
path releases write.lock and events.lock in a temp home` both pass at `61d68f1`
and remained green under M1, M2 and M3 — i.e. they were not accidentally
co-opted into the new behaviour. `installDaemonShutdownHandlers` gained one line
and changed one type union; the existing shutdown body is untouched.

### R3.8 — tmux `newWindow` env/cwd, and docs

`name` / `title` / `cwd: process.cwd()` / `env: { PIJ_DAEMON_OWNED: "1" }` /
`detached: true` are all unchanged context lines. Only `cmd` and `args` moved.

`docs/how/pij.md` is **accurate**. Its three substantive claims — the direct
`process.execPath` + `--import` + absolute loader URL launch; "no `npx` or `tsx`
CLI relay… the pane process and the pid recorded in `daemon.lock` are the same
process"; and `stop`/`status` continuing to use the lock pid — are each
independently verified above. Extending the prose to `SIGHUP/SIGINT/SIGTERM`
matches the code.

---

## R4 — Findings

### P-1 (low) — a second, un-converted copy of the launch shape, and it is cwd-dependent

`daemon.test.ts:2843` (the item-15-FX real-SIGTERM test) still hand-composes:

```ts
spawn(process.execPath, ["--import", "tsx", DAEMON_BIN], { … })
```

The dispatch asked me to confirm the builder is the only source of the launch
argv. In production it **is**. But this pre-existing test is a second copy of the
same shape that was not routed through `daemonLaunchArgv(DAEMON_BIN)`, and it
uses a **bare** specifier where production now uses an absolute URL. Two
consequences, one measured:

1. **Measured**: that shape does not boot from a cwd without `node_modules`
   (R3.3), whereas production's does. The test only passes because vitest's cwd
   is the repo root.
2. **Structural**: it will not track future changes to the builder. If
   `daemonLaunchArgv` were altered, this test would keep passing against a shape
   production no longer uses.

Not a production defect, and not a regression — it predates this commit. But it
is the exact question the dispatch posed, so I am recording the answer rather
than reporting "no second copy". One-line fix if wanted: pass
`daemonLaunchArgv(DAEMON_BIN)` there too.

### P-2 (low) — `SIGINT` has zero test coverage, repo-wide

M5 removed `onSignal("SIGINT", shutdown)` outright and the **entire**
`daemon.test.ts` stayed green (101 passed). `git grep -n 'SIGINT' -- '.pi/**/*.test.ts' 'harness'`
returns **nothing**: no test anywhere asserts the daemon handles SIGINT.

This gap **pre-dates** item 32 — SIGINT was already in the union and already
unsensored, so it is not a regression and does not block. I raise it because
this commit widened `DaemonShutdownSignal` to three members and built a real
sensor for exactly one of the two non-SIGTERM signals, leaving its sibling bare.
The fix is nearly free: extend the new `it.each` from `["SIGTERM", "SIGHUP"]` to
include `"SIGINT"`, which would have killed M5.

### P-3 (info) — source comments not updated alongside the docs

`docs/how/pij.md` was updated correctly; three in-source comments were not, and
each now describes the mechanism this item removed:

- **`daemon.ts:8`** — "Run it in a tmux window: `npx tsx .pi/extensions/pij/daemon.ts`".
  Still executable by hand, so not false, but it advertises precisely the relay
  form the change exists to eliminate.
- **`daemon.ts:1`** — shebang `#!/usr/bin/env -S NODE_NO_WARNINGS=1 npx tsx`.
  Now inert for the managed launch (the file is passed to `node`, not executed).
  Harmless; noted only so nobody assumes the daemon still inherits
  `NODE_NO_WARNINGS=1` from it. It does not — and per R3.1 it does not need to.
- **`core/daemon/lifecycle.ts:59`** — "Almost all of that is `npx` + the `tsx`
  transform of the daemon's import graph", justifying
  `DAEMON_VERIFY_BUDGET_MS = 2_500` from measurements of 584/572/576 ms.

That last one I checked rather than assumed, because a budget invalidated by a
change is a real hazard. **It is not.** Measured at `61d68f1`, direct launch:
**446 / 442 / 515 ms** to lock write — faster than the recorded baseline. And
the constant is a **brake, not a policy**: removing it would make
`reportDaemonStart` more permissive, and it is a ceiling on the failure case
only (the poll returns as soon as the lock goes live). A change that makes boot
*faster* can only move it further inside its margin. The attribution in the
comment is stale; the number it defends is still sound.

### P-4 (info) — the repo now carries two tsx-invocation idioms

`bgNotifyArgv()` (`cli.ts:5206`) still composes
`[process.execPath, createRequire(import.meta.url).resolve("tsx/cli"), entry, "bg-deliver"]`
— i.e. the `tsx` **CLI relay**, the same class of shape item 32 just removed from
the daemon path. Out of fence and low-consequence (`bg-deliver` is short-lived
and is never signalled, so the orphaned-lock failure mode does not apply). Noted
only so the divergence is deliberate rather than forgotten: the `--import`
loader form now available via `resolveTsxLoaderUrl()` would work there too.

### Durability note (info, not a defect)

`createRequire().resolve("tsx")` lands on `dist/loader.mjs` **because** tsx
4.23.0 declares `"."` as an unconditional string. `package.json` pins
`"tsx": "^4.23.0"`, so a future 4.x could legally reintroduce a conditional
export map whose `require` branch points at a CJS entry — which is exactly the
failure the dispatch asked about. The composition test already guards this:

```ts
expect(fileURLToPath(TSX_LOADER_URL)).toMatch(/[/\\]tsx[/\\]dist[/\\]loader\.mjs$/);
expect(existsSync(fileURLToPath(TSX_LOADER_URL))).toBe(true);
```

It pins the **outcome** rather than the mechanism, so such a bump would surface
as a test failure rather than a silently-relayed daemon. Recording this as a
strength of the test design, since it is the thing that makes the resolution
choice safe to keep.

---

## R5 — Disposition

| id | severity | open? | summary |
|---|---|---|---|
| P-1 | low | open | 15-FX test at `daemon.test.ts:2843` still hand-composes a **bare**, cwd-dependent `--import tsx` argv instead of using the builder (pre-existing) |
| P-2 | low | open | `SIGINT` handler has zero test coverage repo-wide; M5 survived (pre-existing) |
| P-3 | info | open | `daemon.ts:1`/`:8` and `lifecycle.ts:59` comments still describe the removed `npx` relay; the budget they justify remains valid (re-measured) |
| P-4 | info | open | `bgNotifyArgv()` still uses the `tsx/cli` relay idiom (out of fence) |

**No major or high findings.** Per the brief's verdict law, that is an
**APPROVE**.

What this change actually establishes, in one line: the daemon is now the
process tmux launches, so the pid in `daemon.lock` is the pid that receives the
signal — verified by an independent real launch showing **one** process with
**zero** children where the former form showed **three**, and inverted by a
mutation that fails on pid identity itself rather than on a proxy. The
implementation is 26 production lines, every one of them load-bearing under
mutation (M1–M4, M6 all RED and all selective), with a genuine negative control
that I confirmed is not decorative. The four findings are all pre-existing or
out-of-fence tidy-ups; none of them touch the property under review.

---

## TERMINAL REPORT

This pass is **CLOSED**. No mutation was run after this file was written; the
worktree is clean at `61d68f1` (`git status --porcelain -uno` empty, `.pi/`
empty) and the live daemon (pid 82643) was never signalled. No pass is left
open. Any further work on this branch must open a **new** section below rather
than edit this one.

61d68f1b0352aa4a2c7801e62fb6c08c51e69b08

---

# Re-review FX-01

**Verdict: APPROVE.** All three folds (P-1, P-2, P-3) land, and the one that
mattered — P-2, my surviving M5 mutant — is now dead and **selectively** dead.
Highest remaining severity **info**. Nothing blocking; nothing to fix before PR.

Frozen at `225f443` (parent `61d68f1`, branch `s391/item32-daemon-direct-child`).

## R0 — scaffolding, and what I did NOT verify

Stated first so a gate I did not examine never looks like a gate I found clean.

**Scaffolding.** Mutation harness re-pinned to `225f443` at
`/tmp/pw32fx01/mut.sh`: it refuses to start on a dirty `.pi/`, asserts each
anchor occurs exactly once, **aborts if `git diff --name-only -- .pi/` is empty**
(the false-GREEN trap), and verifies a byte-identical restore afterwards. The
two mutation scripts are my cold-pass `m5.py` / `m1.py` re-used **verbatim** —
both anchors are unchanged at this SHA, which is itself a small check that the
fold did not move the surfaces I previously sensored.

Ordering: I ran `pij report now`, verified the freeze, and kicked my own full
vitest gate (`bg-mtcea9ua-aqxvv1`, start 13:31:26) **before** touching the tree,
so no mutation could contaminate the baseline. First mutation landed after it
returned.

**NOT verified (5):**

1. **`harness checks` not run by me.** The coder's three named baseline reds
   (`osc-7337-producer.ts` biome, absent local `pwsh`, windows-compat repeating
   the same producer lint) are neither reproduced nor refuted here. They match
   the reds recorded on the cold pass and DL-018, so I have no reason to doubt
   them — but I did not measure them.
2. **No real tmux was exercised.** As on the cold pass, the end-to-end
   `tmux → node → daemon` chain is proven only as two halves.
3. **No Windows / `pwsh`.** `process.execPath` contains a space there. Untested.
4. **The composition test was not re-run under mutation this round.** I ran N2
   against `daemon.test.ts` only (`cli.integration.test.ts` costs ~3 min). My
   cold-pass M3/M1 results for it carry over **by inference, not by fresh
   measurement**: `cli.ts` is byte-identical between `61d68f1` and `225f443`
   (it is absent from `git diff 61d68f1..225f443`). I flag this as inference.
5. **Flake characterisation is better but still not a distribution.** Between the
   coder's ×10 log and my own runs the three spawning cases have now executed
   ~40 times without an unexplained red. That is reassuring, not a bound.

## R1 — freeze, fence, gates

| check | result |
|---|---|
| `HEAD` | `225f443864dee772b625855ee7f2e5192fc43931` ✅ |
| `HEAD^` | `61d68f1…` = the cold-pass SHA ✅ |
| branch | `s391/item32-daemon-direct-child` ✅ |
| tracked tree at start | **clean** (`git status --porcelain -uno` empty) ✅ |
| fence | 3 code files + `execution.log.md`; nothing outside the packet ✅ |
| my full vitest | **172 files passed / 2 skipped; 4153 passed / 15 skipped / 0 failed** ✅ |
| coder's claim | 172 / 4153 / 0 — **exact match** ✅ |
| `tsc --noEmit` | exit 0 ✅ |
| `biome check` (3 changed files) | clean, "No fixes applied" ✅ |
| `.pi/` after every mutation | empty diff, byte-identical restore ✅ |

**Anti-vacuity.** The suite moved `4152 → 4153`, exactly `+1`, and the only
declaration-affecting edit in the diff is the single `"SIGINT",` added to the
`it.each` tuple. Zero test declarations removed; the sole removed line in
`daemon.test.ts` is the old `spawn(...)` argument list, replaced in place. The
count and the diff corroborate each other.

**Packet freshness.** `fix-01.md` mtime 13:19:09 vs `review-01.md` 13:17:57 —
the packet post-dates my cold verdict, so this is new work, not a re-dispatch.

## R2 — mutation ledger (all pinned at `225f443`, all restored)

| # | mutation | result |
|---|---|---|
| N1 | remove `onSignal("SIGINT", shutdown);` (`daemon.ts:1945`) | 🔴 **RED** — `Tests 1 failed \| 101 passed \| 2 skipped (104)`; `AssertionError: expected { code: null, signal: 'SIGINT' } to deeply equal { code: +0, signal: null }` |
| N2 | `daemonLaunchArgv` → `{ cmd: "npx", args: ["tsx", daemonPath] }` | 🔴 **RED** — `Tests 3 failed \| 99 passed`; all three `it.each` arms, each on pid identity (`expected 14119 to be 13802`, `15076/14993`, `16225/15696`) |

N1 is the one that matters: **my cold-pass M5 survivor is dead.**

**N1 is selective, and that is a stronger result than the coder's own
evidence.** The coder's RED log (`dlg-0030-fx01-sigint-red.log`) reports
`1 failed | 103 skipped` — it was filtered to the SIGINT case alone, so it can
show that SIGINT is sensored but **cannot** show that SIGTERM and SIGHUP survive
the removal. I ran the mutant against the whole file: `1 failed | 101 passed`.
Exactly one arm died. The three `it.each` arms are therefore **independently**
sensored rather than cross-wired — the right check for a parameterised matrix,
where a single mutant reddening "something" would not distinguish three real
sensors from one.

## R3 — the five questions

### (1) Is my M5 (drop SIGINT) now RED? — **YES**

N1 above. Dead, and selectively dead. P-2 closed.

Worth recording: `docs/how/pij.md:314` already asserted
"SIGHUP/SIGINT/SIGTERM shutdown token-check releases every lock still owned by
that daemon process before exit" **at `61d68f1`**, while SIGINT had zero
coverage repo-wide. The documentation was writing a cheque the suite could not
cash. P-2 makes that sentence sensored rather than merely asserted.

### (2) Does any hand-composed `--import` tsx spawn remain in a test? — **the daemon one is gone; one non-daemon one remains**

Answering the literal grep honestly. `git grep -n -- '--import'` over
`*.test.ts` / `*.ts` / `harness` / `justfile` / `package.json` returns four
live sites:

| site | shape | judgement |
|---|---|---|
| `cli.ts:1543` | `["--import", resolveTsxLoaderUrl(), daemonPath]` | the production builder — the single source ✅ |
| `cli.integration.test.ts:289` | `["--import", TSX_LOADER_URL, DAEMON]` | the composition test's **expectation**, independently derived on purpose ✅ |
| `channel.test.ts:155` | `["--import", "tsx", "--input-type=module", "--eval", script]` | **remains** — see below |
| `harness/scripts/pane-signals-smoke.ts:60` | `` `${execPath} --import tsx ${script}` `` | **remains** (harness script, not a test) |

`daemon.test.ts` now contains exactly **two** `spawn(` calls, both
`spawn(launch.cmd, [...launch.args])`. The daemon-spawning duplicate the packet
named is gone.

Correctly **not** converted: `daemon.test.ts:2909`, the negative control
`probeRealDaemonSignal({ cmd: "npx", args: ["tsx", DAEMON_BIN] }, …)`. That one
must keep hand-composing the relay — it is the contrast case, and my cold-pass
M6 proved it load-bearing. The coder did not over-convert it. Good.

So the strict answer to (2) is *one test hit remains*, and I record it as
**info, not a defect** (finding Q-1) for three reasons given in R4.

### (3) Is `lifecycle.ts` comment-only, constant unchanged? — **YES, proven structurally**

- The diff has **one** hunk, entirely inside the `/** … */` docblock; every
  added and removed line begins ` * `.
- Stronger than reading the diff: stripping all comment lines from the file and
  hashing the remainder gives **`cec36cef4c700b723e13d562a6b440efced6d1e3` at
  both `61d68f1` and `225f443`** — the code is byte-identical.
- `DAEMON_VERIFY_BUDGET_MS = 2_500` at line 64 and `DAEMON_VERIFY_POLL_MS = 50`
  at line 65 at **both** SHAs. Unchanged.

The new prose ("direct Node starts put the lock write at 446/442/515 ms") uses
my cold-pass measurements, and the coder's log says so explicitly ("the
reviewer's direct-launch measurements"). Provenance is honest — the comment says
MEASURED and the measurement exists. The brake characterisation ("the ceiling on
the failure case only") is retained verbatim and is still correct.

### (4) Shebang removal — is `daemon.ts` ever executed directly? — **NO, and more strongly than claimed**

The coder's justification is "the file mode is `100644`". That is true *now*.
The stronger fact:

```
$ git log --all --format='%h' -- .pi/extensions/pij/daemon.ts \
    | while read s; do git ls-tree $s -- .pi/extensions/pij/daemon.ts; done \
    | cut -d' ' -f1 | sort -u
100644
```

**`daemon.ts` has never been mode `100755` at any commit on any ref.** A kernel
only honours a `#!` line when the file is executed directly, which requires the
exec bit. So the shebang was not merely inert today — it could never have fired.
Removing it cannot change behaviour.

Corroborating sweep, with the scope stated (an absence is only as good as the
scope that produced it):

- `git grep -nE '(\./|exec |sh )[^ ]*daemon\.ts'` over the whole tracked tree →
  only `cli.ts:1607` and `daemon.test.ts:50`, both
  `fileURLToPath(new URL("./daemon.ts", import.meta.url))`, i.e. the path is
  **passed to node as an argument**, never executed.
- `justfile`: **0** hits for `daemon.ts`. `package.json`: **0** hits. No
  `*.json/*.yaml/*.toml/Makefile` hit is an invocation (all are `the-flow.json`
  prose logs plus one flowspace schema example).
- `harness/scripts/comms-bench.py:146` does `pgrep -f "extensions/pij/daemon.ts"`
   — it matches the **command line**, which still contains that absolute path
  under the direct launch (and now matches exactly one process instead of the
  relay chain's several). Unaffected, mildly improved.

The removed shebang also carried `NODE_NO_WARNINGS=1`. Nothing consumed it: the
launch never went through the shebang, and my cold-pass direct launch emitted
**0 bytes** on stderr with the variable deliberately cleared.

### (5) Is the ×10 log what it claims (30 real runs)? — **YES**

`docs/plans/391-day3-core/logs/item32-spawn-x10.log`, 150 lines:

- **10** `=== run NN ===` markers, each followed by an independent
  `RUN v4.1.10` banner and its own `Test Files 1 passed (1)` /
  `Tests 3 passed | 101 skipped (104)` summary — 10 separate vitest
  invocations, not one run reported ten times.
- Each of `SIGTERM` / `SIGHUP` / `SIGINT` appears as a ✓ line exactly **10**
  times → **30 executions**, 30 passes, 0 failures.
- **They are real spawns.** Per-case durations are 380–460 ms (e.g. run 01:
  407/392/458 ms), which matches the direct-boot lock-write latency I measured
  independently on the cold pass (446/442/515 ms). A skipped, mocked or
  short-circuited case would be single-digit ms. `Start at` stamps advance
  13:21:37 → 13:21:40 → … , ~3 s apart, consistent with 10 real cold starts.

## R4 — findings

None blocking. All four are **info**.

**Q-1 (info) — one hand-composed `--import tsx` spawn remains in a test.**
`adapters/channel.test.ts:155`. I am not calling this a defect:
(a) it does not spawn the daemon — it is `--input-type=module --eval` of an
inline claimer script, so `daemonLaunchArgv(daemonPath)` cannot express it
without a signature change, and `resolveTsxLoaderUrl` is **private**
(`cli.ts:1536`, no `export`); (b) it pins `cwd: import.meta.dirname`, an
in-repo directory, so the bare `tsx` specifier always resolves by walking up to
the repo-root `node_modules` — it is structurally *not* exposed to the P-1
failure mode, unlike the unpinned site that was fixed; (c) it is outside the
item-32 fence. Recorded only so that "no hand-composed spawn remains" is not
overstated in the record.

**Q-2 (info) — `harness/scripts/pane-signals-smoke.ts:60`** uses the same bare
`--import tsx` idiom with **no** cwd pin: it builds a tmux command string, and
the new pane inherits the invoking cwd. This one genuinely would fail from a
`node_modules`-free cwd. In practice it is a harness smoke invoked from the repo
root, and it is pre-existing and out of fence. Naming it so the P-1 defect class
is fully mapped rather than half-mapped.

**Q-3 (info) — one stale relay sentence survives P-3.**
`docs/how/pij-platform.md:243`: "The machine-wide daemon runs `tsx` off
**exactly** `…/daemon.ts`". That is relay-era phrasing; there is no `tsx` CLI in
the chain now. The sentence's actual claim (source-path provenance) is unaffected
and the file is outside both the packet's named list and the fence.
`docs/how/pij.md:305-315` is correct and explicitly says "There is no `npx` or
`tsx` CLI relay between tmux and the daemon".

**Q-4 (info) — the shebang removal shifts every `daemon.ts` line by −1**
(1974 → 1973 lines). ~15 `daemon.ts:NNN` prose citations across `docs/how/**`,
`.harness/records/**`, `core/daemon/tick-heartbeat.ts:218`,
`core/daemon/watchdog-manager.ts:40` and `daemon.test.ts:2965` are now off by
one. I checked whether this breaks anything executable: it does not — no gate,
snapshot or lint rule pins `daemon.ts` line numbers; every hit is prose. The
repo already treats citation drift as a known hazard and documents it
(`docs/how/fleet/ledger/s098-daemon-perf.md:52` records citations that were
"wrong at authoring"). Cost of the fix would exceed its value; noted, not asked.

### Beyond the packet — P-1's benefit, measured

The packet's P-1 is a **test-side** change, and my usual test for those is: revert
only that change and see whether the suite notices. It does not — under N2 the
converted 15-FX test at `:2839` stayed **green** while the three `it.each` arms
died, because its assertions (`exit === {code:0, signal:null}`, both locks gone)
are satisfied by the relay under SIGTERM in the non-flaky case. So the conversion
adds **no new suite sensor**, and it also **removes none** (3 RED before and
after). Its value is real but lives outside vitest, where the suite is blind to
it by construction — vitest's own cwd always has `node_modules`.

So I measured it directly, deriving the loader from the builder's own expression
(`pathToFileURL(createRequire(<cli.ts URL>).resolve("tsx")).href`, cross-checked
against `cli.integration.test.ts:56`, which derives it independently), then
launching from a `mkdtemp` cwd where `require.resolve("tsx")` fails:

| shape | booted? |
|---|---|
| `node --import tsx <daemon.ts>` — the line FX-01 **removed** from `:2843` | **0** — `ERR_MODULE_NOT_FOUND` |
| `node --import file:///…/tsx/dist/loader.mjs <daemon.ts>` — what the builder FX-01 **installed** returns | **1** — `PIJ_TEST_LOCKS_HELD`, clean stderr |

P-1 converts a genuinely cwd-fragile spawn into a cwd-independent one. Closed on
evidence, not on inspection.

## R5 — disposition

| item | claim | verdict |
|---|---|---|
| P-1 | 15-FX test consumes `daemonLaunchArgv`; no second launch shape | ✅ **closed** — sole daemon spawn converted; benefit proven out-of-vitest; negative control correctly left hand-composed |
| P-2 | real SIGINT sensor | ✅ **closed** — N1 RED **and selective** (1 failed / 101 passed) |
| P-3 | stale relay prose | ✅ **closed** for the three sites named; one unnamed site remains (Q-3) |
| lifecycle.ts | comment-only, constant intact | ✅ **proven** — comment-stripped hash identical at both SHAs |
| shebang removal | safe | ✅ **proven stronger than claimed** — never mode `100755` in history |
| ×10 log | 30 real runs | ✅ **audited** — 10 invocations × 3 cases, durations consistent with real cold starts |

**Summary.** A small, honest fold that does exactly what the packet asked: the
one mutant that survived my cold pass now dies, and dies selectively; the
comment-only change is provably comment-only; the shebang was provably inert
before removal; and the ×10 evidence is what it says it is. The four residues I
record are all info — one out-of-fence test, one out-of-fence harness script, one
unnamed doc sentence, and an off-by-one in prose citations that no gate reads.
**APPROVE.**

## TERMINAL REPORT

This pass is **CLOSED**. No mutation was run after this section was written; the
worktree is clean at `225f443` (`git status --porcelain -uno` empty, `.pi/`
empty), every mutation was restored byte-identical, and the live daemon
(pid in `~/.pij/daemon.lock`) was never signalled — every real launch used a
`mkdtemp` `PIJ_HOME`. No pass is left open. Any further work on this branch must
open a **new** section below rather than edit this one.

225f443864dee772b625855ee7f2e5192fc43931

---

## Re-review FX-02

**Reviewer**: `pij-powerful-whale` (cold seat, scoped re-check)
**Frozen SHA**: `af84d06` — parent `261b16f`, branch `s391/item32-daemon-direct-child`
**Rebase note**: the branch was rebased since my FX-01 pass. `261b16f` is my
FX-01 SHA `225f443` replayed; `92b7ca7` is the cold-pass `61d68f1`. `git
merge-base af84d06 main` = `9742d37`, matching the dispatch. Local `main` has
since advanced to `916e915`; **all scope below is `261b16f..af84d06`**, i.e. the
FX-02 commit alone, never a two-dot range against a moving `origin/main`.
**Scope**: 1 file, +16/−9 — `.pi/extensions/pij/daemon.test.ts`.
**Packet**: `fix-02.md` (o-prime merge-check red: the relay CONTROL test spawned
bare `npx tsx` on a 5 s budget and starved two main-owned subprocess tests).

### R0 — scaffolding, and what I did NOT verify

**Say the workarounds before the findings.**

**S-1 — I did not review in the shared worktree, and it is not on this branch.**
`/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core` is checked out on
`s391/item33-watchdog-smoke-proof` @ `2026d92`. Another seat owns it. I did not
move it. Instead I created two *detached* worktrees and removed nothing:

| path | SHA | role |
|---|---|---|
| `/private/tmp/pw32fx02/wt` | `af84d06` | candidate |
| `/private/tmp/pw32fx02/parent` | `261b16f` | control |

Both have `node_modules` symlinked to the shared checkout. Node resolves through
symlinks to realpaths, so `createRequire(...).resolve("tsx/cli")` returned the
**same** `…/s391-day3-core/node_modules/tsx/dist/cli.mjs` the coder reports. The
coder's own fresh worktree shows the identical arrangement (its logs contain
`--import file:///…/s391-day3-core/node_modules/tsx/dist/loader.mjs` while the
daemon path is under `/private/tmp/pij-item32-fx02.4rWJip`), so this matches
their scaffolding rather than diverging from it.

**S-2 — a trap that silently faked a passing result, stated because it nearly
cost me a false finding.** My first out-of-vitest probe reported that the relay
shape "exits 0 immediately with no output" — which would have contradicted the
suite. It was my scaffolding. macOS `/tmp` is a symlink to `/private/tmp`, and
the run-if-main guard at `daemon.ts:1963` is a raw string compare:

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
```

`import.meta.url` is the realpath (`/private/tmp/…`) while `process.argv[1]` was
what I passed (`/tmp/…`), so the guard was false, `runDaemon()` never ran, the
module finished and the process exited **0 with empty stdout and empty stderr**.
A launch-shape probe that silently no-ops and exits 0 is indistinguishable from
"the daemon booted and quit cleanly" unless you look for the marker. **The
production shape failed the same way**, which is what told me it was mine and
not the relay's. Every out-of-vitest measurement below uses `/private/tmp`
paths. Vitest normalises to realpath, so in-suite runs were never affected (my
gate, run from `/tmp/…`, had all daemon signal tests green).

**Not verified — a gate I did not examine must not look like a gate I found
clean:**

1. **I did not run `harness checks`.** Of the coder's three named baseline reds I
   reproduced exactly one (the `pwsh` one, below). **OSC-7337 lint and
   windows-compat are neither reproduced nor refuted by me.**
2. **I did not reproduce o-prime's original merge-product RED** (3/4168). It is
   load-dependent, and per the 15-FX brief's own rule a green run is not
   disproof. I argue the mechanism quantitatively (R2/R3) instead of claiming a
   repro I do not have.
3. **The coder's fresh worktree `/private/tmp/pij-item32-fx02.4rWJip` no longer
   exists**, so I could not read its `HEAD` directly. I pinned the logs to
   `af84d06` indirectly (R3.4) — that is weaker than reading the SHA.
4. **No Windows, no `pwsh`, no real tmux.**
5. **Flake distribution is still not bounded.** I have three 236-file runs total
   (2 candidate, 1 parent). That is a comparison, not a bound.

### R1 — freeze, fence, gates

- `HEAD` = `af84d06c9920235b26e930cdc0cedd3de769764e`; `HEAD^` = `261b16f`;
  `git status --porcelain` **empty** before any mutation and again after.
- **Packet freshness** (orchestrators re-dispatch delivered work): `fix-02.md`
  mtime **13:55:18**, my `review-01.md` mtime **13:41:00**. The packet post-dates
  my FX-01 verdict — genuinely new work.
- **Fence honoured exactly.** `git diff --name-only 261b16f..af84d06` returns
  **one** path, `.pi/extensions/pij/daemon.test.ts`. `cli.ts`, `daemon.ts` and
  `core/daemon/lifecycle.ts` are therefore byte-identical to `261b16f` — this is
  measurement, not inference, and it is why I did not re-run the composition
  mutations this round.

**Gates I ran myself** (all in the candidate worktree at `af84d06`):

| gate | result |
|---|---|
| `tsc --noEmit` | exit **0** |
| `biome check .pi/extensions/pij/daemon.test.ts` | **clean**, 1 file |
| `vitest run` (full config include, 236 files) ×2 | see ledger below |
| `vitest run .pi/extensions/pij/daemon.test.ts` | 101 passed \| 2 skipped (104) |

**Scope note, not a defect**: the packet specified the proof runs as `npx vitest
run .pi/extensions/pij/` — 172 of the 236 files the vitest config actually
includes (`.pi/extensions/**`, `harness/**`, `skills/**`). The coder complied
with the packet. I ran the **whole** include, which is strictly more load than
either the packet or the coder used, and it is where the two reds below came
from.

**Broad-run ledger (mine, 236 files each, run alone):**

| # | SHA | failed | detail |
|---|---|---|---|
| 1 | `af84d06` | **2** | `pwsh` baseline + `pij-skill-check` timeout |
| 2 | `261b16f` (control) | **1** | `pwsh` baseline only |
| 3 | `af84d06` | **1** | `pwsh` baseline only |

- **`release-age-policy` → not a finding.** `Error: spawnSync pwsh ENOENT` at
  `harness/scripts/release-age-policy.test.ts:196`. Reproduces **identically at
  parent and candidate**, and in isolation at both. This is the coder's named
  missing-`pwsh` baseline red.
- **`pij-skill-check` → not attributable, and I checked rather than assumed.** It
  failed run 1 with `Test timed out in 30000ms` on a line that is a plain
  `readFileSync(...).toContain(...)` — a pure starvation timeout; the whole file
  took **62 472 ms**. It **passed in isolation at both SHAs**, passed at the
  parent under the same 236-file load, and passed on candidate run 3 — at
  **39 676 ms**, i.e. still enormous. It is a pre-existing slow file living close
  to its ceiling. FX-02 cannot plausibly drive it: FX-02 *removes* a process and
  cuts the relay's launch cost 3 183 ms → 557 ms (R2), so the mechanism runs the
  wrong way. **Reported as an environment observation, not as a regression.**

**Anti-vacuity.** `daemon.test.ts` alone: **101 passed | 2 skipped (104)**, and
both mutations below moved it to `1 failed | 101 passed`, so the file is live and
the deltas are real. The relay control was green in **six** independent
observations — coder isolated 541 ms; coder full runs 603 ms / 574 ms; my
236-file runs 744 ms / 761 ms; my out-of-vitest probe 557 ms.

### R2 — mutation ledger (pinned at `af84d06`, both restored byte-identical)

Harness refuses to run unless `HEAD` == pin and `.pi/` is clean, asserts the
anchor occurs **exactly once**, **aborts if the mutation produces an empty
`.pi/` diff** (the false-GREEN trap), and verifies the restore. It aborted
correctly once on a bad script path and restored before running anything.

| # | mutation | result |
|---|---|---|
| **MUT-A** *(the mandated one)* | relay control launch → `daemonLaunchArgv(DAEMON_BIN)` | 🔴 **RED**, `1 failed \| 101 passed \| 2 skipped (104)` — `AssertionError: expected 49067 not to be 49067` |
| **MUT-B** | ternary true-branch `? 129 :` → `? 0 :` | 🔴 **RED**, `1 failed \| 101 passed` — `AssertionError: expected +0 to be 129` |

MUT-A is **selective**: one arm dies, the other 101 tests hold, so the control is
independently sensored rather than cross-wired.

**Independent, out-of-vitest measurement** (my own probe, replicating
`probeRealDaemonSignal` outside the repo; every run in its own `mkdtemp`
`PIJ_HOME`; the live daemon was never signalled):

| shape | marker | outer vs daemon pid | children | exit | locks after | inner alive |
|---|---|---|---|---|---|---|
| production (`--import` loader) | 581 ms | **21060 == 21060** | 0 | `{code:0, signal:null}` | released | n/a |
| **relay `node <tsx/cli>`** (new control) | **557 ms** | 22133 ≠ 22405 | 1 | `{code:null, signal:"SIGHUP"}` | **both left** | **yes** |
| historical `npx tsx` (the old prod path) | **3 183 ms** | 23438 ≠ 27501 | 1 (27196, an *intermediate*) | `{code:null, signal:"SIGHUP"}` | **both left** | **yes** |

Two things fall out of that table:

1. **The new control and the historical `npx tsx` path produce the same
   observable defect signature** — pid split, one relayed child, death by signal,
   both locks left on disk, inner daemon still alive. The control is a faithful
   model of the old path, minus one intermediate process.
2. **The packet's premise is confirmed quantitatively, not just accepted.** `npx`
   costs **3 183 ms vs 557 ms — a 5.7× cold-lookup penalty** against a 5 000 ms
   budget, i.e. only **1.57× headroom on an idle box**. The starvation o-prime
   observed stretched main-owned tests by **15.9×–19.6×** (`appendOnce` 5 028 ms
   vs a 317–321 ms baseline; `invalid Codex UUID` 10 050 ms vs 512–545 ms).
   1.57× headroom against a ~16× stretch is not a marginal budget, it is an
   inevitable one. The diagnosis holds.

Also verified by the same table: `resolve("tsx")` → `dist/loader.mjs` (the
`--import` entry, **no relay**, 0 children) while `resolve("tsx/cli")` →
`dist/cli.mjs` (the relay, 1 child). Confirmed against `tsx@4.23.0`'s
`package.json` exports (`"." → ./dist/loader.mjs`, `"./cli" → ./dist/cli.mjs`).

### R3 — the five dispatch questions

**(1) Resolved `tsx/cli`, no `npx`. ✅ Verified.**
`const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli")` at `:52`,
hoisted to module scope so it is resolved once per file, not per test. `grep -n
npx .pi/extensions/pij/daemon.test.ts` returns **nothing** — not merely no `npx`
*spawns*, but no occurrence at all. Both `spawn(` sites in the file (`:2728` in
the helper, `:2846` in the standalone SIGTERM test) go through a `launch`
object. The negative-control-by-`npx` I confirmed load-bearing in the cold pass
is gone, and MUT-A shows nothing was lost by removing it.

**(2) It still proves the OLD path's defect. ✅ Verified, two ways.**
MUT-A (mandated) is RED and selective. Independently, my probe shows the control
reproduces every element of the defect and that `npx tsx` reproduces the *same*
signature. The assertions retained are `daemonPid ≠ outerPid`,
`writeLockExists === true`, `eventsLockExists === true` — and my probe measured
all three directly, plus `innerAliveAfter: true`, so none of them is vacuous.

**(3) Cold budget ≥ 15 s, ceiling only. ✅ Verified — with a caveat (W-2).**
`:2748` is `15_000`, meeting "≥ 15 s". It is structurally a ceiling —
`setTimeout(reject, 15_000)` cleared the instant the marker arrives — and
empirically the whole test costs **557–761 ms** across six observations, so the
ceiling is never approached. The `timeout: 20_000` raises at `:2898`/`:2909` are
not padding: the shared marker wait is now 15 s, so a 10 s outer timeout would
have made the new budget unreachable. 20 s is the smallest coherent value.
**Caveat**: the raise is not uniform across the block — see W-2/W-4.

**(4) The two full-run logs are genuine, and each names both tests green. ✅
Verified.** They are not copies, and the corroboration is arithmetic rather than
eyeballed:

- Run 1 `Start at 13:58:20`, `Duration 199.60s` → ends ≈ 14:01:40. Run 2
  `Start at 14:01:42`. **Back-to-back, 2 s apart**, exactly as "two consecutive
  runs" claims. File mtimes (14:01:42, 14:05:08) match both endpoints.
- Distinct content: different temp folders (`pij-folder-KtqpMH` vs
  `…-A95LRz`) and different spawn ids. The embedded epochs differ by
  **202 583 ms ≈ 203 s** — which independently reproduces run 2's own
  `203.44s` duration. Two separate executions.
- Fresh worktree confirmed in-band: the daemon path is
  `/private/tmp/pij-item32-fx02.4rWJip/.pi/extensions/pij/daemon.ts`, not the
  shared checkout.
- Both name the two main-owned tests green, twice each (inline and in the tail
  listing): `appendOnce hard-link race` 317 ms / 321 ms, `'invalid Codex UUID'`
  540 ms / 545 ms — i.e. back to their healthy baselines, ~16× and ~19× below
  the starved figures o-prime reported.
- The extra `Test Files 2 passed (2)` block at the end of run 2 is **not** a
  laundered concatenation: it sits under an explicit
  `=== previously starved tests ===` header, is a 1.36 s targeted re-run at
  14:05:06, and is clearly separated from the full-run summary above it.
- **Limit**: the worktree is deleted, so I pinned the logs to `af84d06`
  *indirectly* — they contain the test name `the resolved tsx CLI relay …`,
  which exists only at `af84d06`, and the 4 153-test count matches. That is
  strong but it is not reading the SHA.

**(5) No vitest config change. ✅ Verified, and stronger than asked.**
`vitest.config.ts` is untouched not merely since the parent but since the **main
base `9742d37`** — `git diff 9742d37..af84d06 -- vitest.config.ts` is empty. Nor
was serialisation smuggled into the test file instead: no `describe.sequential`,
`it.sequential`, `concurrent`, `poolOptions`, `maxConcurrency` or `isolate`
appears in `daemon.test.ts`. Packet step 3 ("ask first") was correctly not
exercised, and the coder's report says so.

### R4 — findings

None blocking. Highest severity **low**.

**W-1 (low) — FX-02 leaves no durable in-repo record.**
`execution.log.md` has sections for T001, T002, T003, T004, *Mutation evidence*,
and FX-01 (with P-1/P-2/P-3 subsections and an evidence block) — but **no
`## FX-02` section**; the file is not in the FX-02 diff at all. The reasoning
that a reviewer or a future maintainer would need — why `tsx/cli` rather than
`npx`, why 15 s, why no serialisation — exists only in
`docs/plans/391-day3-core/logs/dlg-0030-fx02-report.json` and the two proof logs. All of
`.harness/temp/` is gitignored (`.gitignore:81`), nothing under it is tracked,
and `git grep item32-fx02-full` over the branch returns **nothing**. So the sole
surviving artefact of this round will be a one-line commit subject and a changed
budget with no recorded rationale. Every previous round on this branch was
logged; this one breaks the pattern.

**W-2 (low) — the raise is not uniform: an identical 5 s real-subprocess marker
budget was left behind, one test above the fixed one.** Budgets in this describe
block after FX-02:

| line | budget | raised? | used by |
|---|---|---|---|
| `:2748` | 15 000 ms marker | ✅ 5 000 → 15 000 | shared helper (`it.each` + relay control) |
| `:2785` | 5 000 ms post-signal exit | ❌ | shared helper |
| `:2842` | `timeout: 10_000` | ❌ | standalone SIGTERM test |
| `:2858` | 5 000 ms marker | ❌ | standalone SIGTERM test |
| `:2898`, `:2909` | `timeout: 20_000` | ✅ 10 000 → 20 000 | `it.each`, relay control |

`:2842`/`:2858` launch a **real daemon subprocess** and wait for the same marker
— the same construct, the same failure mode. It escaped the packet because it
uses `daemonLaunchArgv` and so never paid the `npx` cost. But the exposure is
not the launch shape, it is the stretch factor: that test is measured at
**449–875 ms**, and o-prime's observed stretch was **15.9×–19.6×**. 450 ms × 16
≈ 7.2 s and 875 ms × 16 ≈ 14 s — **both exceed the 5 000 ms marker budget at
`:2858`, and the upper end exceeds the 10 000 ms test timeout at `:2842`**. On
this evidence the least-protected real-subprocess test in the block is now the
one immediately *above* the one that was fixed. It was inside the fence
(`daemon.test.ts` only). Not blocking — it did not red in five full runs across
two SHAs — but it is the next thing to starve, and fixing it is a two-line
change.

**W-3 (info) — the new exit assertion is a tautology on the path actually
exercised.** The added line is:

```ts
expect(probe.exit.signal === "SIGHUP" ? 129 : probe.exit.code).toBe(129);
```

My probe measured the outer relay's real exit as `{code: null, signal:
"SIGHUP"}`, and **MUT-B confirms it inside the suite** — flipping the true-branch
constant to `0` gives `expected +0 to be 129`, so that is the branch taken.
Therefore the assertion as executed reduces to `expect(129).toBe(129)`: the
`129` literal is never compared against anything the process produced. The
coder's report phrases this as "shell-equivalent SIGHUP exit 129" — accurate
about the *shell convention* (128+1), but the process does not exit 129, it dies
by SIGHUP. The line is **not worthless**: it still fails if the relay ever
swallows the signal and exits (`signal: null` → compares the real code), which
is a genuine regression shape, and accepting either form is defensible
portability. But it does not pin what its wording implies, and
`expect(probe.exit).toEqual({ code: null, signal: "SIGHUP" })` would pin more for
less. Recorded so nobody later cites this line as proof of an exit code.

**W-4 (info)** — `:2785`, the post-signal exit wait, stayed at 5 000 ms. Measured
exit latency is prompt in all shapes, so this is comfortable today; noted only so
the budget inventory in W-2 is complete rather than selective.

**W-5 (info) — my own miss from the previous round, disclosed.**
`probeRealDaemonSignal` declares `signal: "SIGHUP" | "SIGTERM"` (`:2718`), but the
`it.each` at `:2895` passes `"SIGINT"`. `tsc --noEmit` is **silent** — which is
itself the proof that vitest's `it.each`-with-options overload widens the
callback parameter, so the helper's declared contract is unenforced and a
misspelled signal would compile. The union is byte-identical at `92b7ca7`,
`261b16f` and `af84d06`; `"SIGINT"` entered the array at **`261b16f` (FX-01) —
the round I approved**. This is pre-existing to FX-02, not a regression in it,
and I should have caught it last pass.

**Observations (not findings)**

- `core/agents/peer.live.test.ts:50` still uses
  `execFileSync("npx", ["tsx", CLI, …])` — the same cold-`npx` idiom this fix
  removed, now the last one under `.pi/**/*.test.ts`. Outside the fence, and it
  is a `.live.` test, but it is where this hazard would recur.
- `daemon.ts:1963`'s run-if-main guard compares `` `file://${process.argv[1]}` ``
  by string. That is symlink-fragile (S-2 above) and would also break on a path
  needing percent-encoding, e.g. a space — relevant because `process.execPath`
  on Windows contains one. Unchanged by FX-02 and outside this packet; flagged
  because it fails **silently with exit 0**, which is the worst available shape.

### R5 — disposition

| ask | verdict |
|---|---|
| (1) resolved `tsx/cli`, no `npx` in `daemon.test.ts` spawns | ✅ verified (no occurrence at all) |
| (2) still proves the old path's defect; MUT→`daemonLaunchArgv` RED | ✅ verified (MUT-A RED + selective; independent probe) |
| (3) cold budget ≥ 15 s, ceiling only | ✅ verified (15 000 ms; 557–761 ms actual) — caveat W-2 |
| (4) two full-run logs genuine, both main-owned tests named green | ✅ verified (timing arithmetic + distinct content) |
| (5) no vitest config change unless recorded | ✅ verified (unchanged since main base; no serialisation in-file) |

**Verdict: APPROVE.** The fix does what it claims, for the reason it claims, and
I could measure the claim rather than take it: `npx` really did cost 5.7× and
really did leave only 1.57× headroom against a stretch factor observed at ~16×.
The replacement control is a faithful model of the old relay — same pid split,
same leaked locks, same live orphan — and MUT-A shows it is sensored. Nothing in
the change is out of fence, and the config was not touched.

Highest severity **low** (W-1 missing FX-02 log entry; W-2 the un-raised sibling
budget at `:2842`/`:2858`). Both are follow-ups, neither blocks the PR.

---

**TERMINAL REPORT.** This pass is CLOSED. No mutation was run after this file was
written; both mutations were restored byte-identical (`git status --porcelain`
empty at `af84d06` afterwards), the shared worktree was never checked out or
modified, the live daemon (pid in `~/.pij/daemon.lock`) was never signalled, and
every real launch used a `mkdtemp` `PIJ_HOME`. Nothing was written to `~/.pij`.
The two detached review worktrees under `/private/tmp/pw32fx02/` are mine and are
removed on completion. No pass is left open. Any further work on this branch must
open a **new** section below rather than edit this one.

af84d06c9920235b26e930cdc0cedd3de769764e
