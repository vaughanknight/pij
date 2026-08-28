# validate-v2 verdict - NEEDS ATTENTION

**Verdict**: **NEEDS ATTENTION** - plan sha256 `0c94a04d5987d71f8d577b3e3ef2089ccaa846ce5e49437983b34250a8db79d4` at repository `HEAD 2953d7599b3b8a498295f9e07b766a4fff49edc9` is structurally coherent and R-4 is honestly closed, but Phases 1-3 contain one critical, two high, and two medium gaps that can leave their runtime promises false while the planned tests stay green.

## Validation contract

- **Purpose / outcome**: make four post-comms gaps mechanically honest without widening them into redesigns; this validation hard-checks Phases 1-3 and confirms the ruled Phase 4 gap is actionable.
- **Promise**: each phase must be implementation-ready, pin its destructive or public-contract edge cases, and cover every production wiring seam needed for its ACs.
- **Proof target**: Implementation plus Integration readiness.
- **Proof required**: exact source/path/line resolution on `2953d75`; state-machine and lifecycle compatibility; all production wrappers and backend variants; targeted current tests.
- **Upstream**: `rulings.md` and `reports/ruling-request-R4.md`; R-4 is ruled `(c-remedy)`.
- **Consumers**: `pij spawn`, the daemon delivery tick, `pij queue retire`, PA capability classification, and `pij revive`.
- **Position**: public CLI behavior, durable delivery-state transitions, model capability resolution, and the daemon's `sendText` port.
- **Constraints**: repository read-only except this requested report; no live-daemon or live-tmux proof; no Phase 4 redesign.

## Fresh proof

- Exact target hash: `0c94a04d5987d71f8d577b3e3ef2089ccaa846ce5e49437983b34250a8db79d4`.
- Exact repository head: `2953d7599b3b8a498295f9e07b766a4fff49edc9`.
- Targeted baseline: 9 files, 465 tests passed across spawn, model registry/validation, SQLite queue, PA capability, daemon tmux/loop/wiring, and revive.
- `harness boot`: typecheck passed; the test stage failed only at the plan's documented known-red `harness/scripts/release-age-policy.test.ts` because `pwsh` is absent (`spawnSync pwsh ENOENT`).
- Deterministic model merge probe over repo `.pi/models.json`: `gemini-3.6-flash` occurs twice, first as provider `github-copilot`, then as `copilot`; the first entry has no `longContext`.

## Findings

### 1. CRITICAL - the automatic retire policy conflicts with supported close-to-revive behavior and can act before terminality

**Location**: plan G-B, AC-05, Key Finding 02, tasks 2.3/2.8; `.pi/extensions/pij/cli.ts:3542-3583`; `.pi/extensions/pij/core/session.ts:482-520`; `.pi/extensions/pij/core/revive.ts:577-612,670-690`.

The proposed `closeIntent !== undefined || terminal?.disposition === "requested"` test is a **policy**, not a safety brake: it positively decides which messages are destructively moved out of the readable/claimable states. It therefore inherits every ambiguity in the close evidence.

Two current contracts make the policy unsafe:

1. Both close paths persist `closeIntent` before killing the pane and before writing terminal truth. A daemon tick can observe a still-live descriptor carrying only `closeIntent`; the repository's applicable s070 history explicitly records this pre-dissolve window. AC-05's generic "live seat untouched" case does not require a live seat with `closeIntent`, so the race can remain green.
2. `planRevive` explicitly tells an operator with a live prior attachment to "close it before reviving", accepts dissolved/requested-terminal descriptors, and `buildRevivedDescriptor` deliberately strips `closeIntent` and `terminal`. A deliberately closed seat is therefore a supported revive input. Retiring its queued/claimed/injected rows makes them invisible to both `listQueued` and `listUnread`, with no requeue path.

**Impact**: a supported `close -> revive` flow can silently lose pending mail, and a tick racing close can retire mail before terminality.

**Smallest fix**: obtain a ruling for close-to-revive mail semantics. At minimum require completed terminal lifecycle evidence (`lifecycle === "dissolved"` plus requested-close evidence), and add the live-with-closeIntent negative test. If revive must preserve pending mail, either delay automatic retirement until a non-revivable boundary such as archival or explicitly requeue `recipient-closed` retirements during revive. Pin `close -> tick -> revive` in an AC.

### 2. HIGH - Phase 3's new `kind` argument is dropped by the production daemon wrapper

**Location**: `.pi/extensions/pij/daemon.ts:271-290,1131-1137`; plan Domain Manifest Phase 3 rows; tasks 3.2-3.4; AC-07/AC-08.

`Daemon` replaces the supplied `sendText` port with a structural wrapper whose function accepts four arguments and calls `rawPorts.sendText(paneId, text, harness, pid)` with four arguments. Phase 3 widens only `core/daemon/loop.ts` and `adapters/daemon-tmux.ts`. The pointer path can pass `{ kind: "pointer" }` to the wrapped port, but the wrapper discards it before `DaemonTmux` sees it.

TypeScript does not expose this omission: a four-argument function remains assignable to the widened signature. AC-07 tests the adapter directly and AC-08 tests the loop with a fake, so both can pass while the live daemon still logs the loud `UNVERIFIED` line.

**Impact**: G-C remains false in production despite a green Phase 3 suite.

**Smallest fix**: add `daemon.ts` to Phase 3's manifest and tasks; widen the wrapper and forward `opts` to `rawPorts.sendText`. Add a real-`Daemon` composition test proving the fifth argument reaches the raw port.

### 3. HIGH - the model capability can be attached to the losing duplicate registry entry

**Location**: `.pi/extensions/pij/core/models/registry.ts:150-156,284-323`; `.pi/extensions/pij/core/models/validate.ts:13-19`; plan AC-02 and tasks 1.2/1.3/1.5.

`loadModels()` returns raw `piModels` before the remapped `copilotSeed`. For a model in the `github-copilot` provider, including `gemini-3.6-flash`, that creates two entries with the same id. `findKnownModel` uses `Array.find`, so the raw `github-copilot` entry wins.

The plan says to apply the deny-set in the copilot branch / snapshot, but does not explicitly require the first raw entry or the final merged result to carry `longContext: false`. A snapshot/seed unit can therefore pass while `resolveLongContext(loadModels(), "gemini-3.6-flash")` still sees `undefined` and preserves today's failing `--context long_context`.

The degraded host path also needs an explicit pin: if the snapshot does not include the deny-set model, absent registry data makes Gemini unknown, and the intentional unknown-model default emits the rejected flag.

**Impact**: Item 6's sole target model can remain unspawnable with green registry, resolver, and builder units.

**Smallest fix**: make the capability resolution independent of duplicate ordering, either by annotating all `github-copilot` and `copilot` entries/post-merge results or by applying the curated deny-set inside the shared resolver. Add a pure merged-order test with raw Pi entry first and an offline/snapshot-only test.

### 4. MEDIUM - the declared dual-backend support is not pinned to the existing `sqliteOf` seam

**Location**: plan Non-Goals, G-B, AC-04/AC-05, tasks 2.7/2.8; `.pi/extensions/pij/adapters/channel-factory.ts:48-102`; `.pi/extensions/pij/cli.ts:614-621`; `.pi/extensions/pij/daemon.ts:1089`.

The plan says retire is supported for `sqlite/dual`, but its ACs cover SQLite and fs only. The current queue CLI and daemon narrow with `instanceof SqliteQueue`, which rejects or misses `DualWriteChannel`; the repository already provides `sqliteOf(channel)` specifically to reach the SQLite source of truth behind either backend.

The plan also does not decide what happens to dual's mirrored fs inbox file after retirement.

**Impact**: `PIJ_QUEUE_BACKEND=dual` can reject the verb with the wrong fs remedy and skip automatic retirement while all stated tests pass.

**Smallest fix**: name `sqliteOf` in tasks 2.7/2.8, add dual cases to AC-04/AC-05, and state whether the fs mirror is removed, marked read, or deliberately retained.

### 5. MEDIUM - `parked` has no declared retirement semantics

**Location**: `.pi/extensions/pij/adapters/sqlite-queue.ts:38,397-437`; plan AC-03/AC-05 and tasks 2.1/2.5.

The existing delivery union includes `parked`, produced when lease recovery exceeds `maxAttempts`. The plan names `TERMINAL = ["acked", "retired"]` and proposes the automatic sweep over only `queued`, `claimed`, and `injected`, but never states whether `parked` is terminal, open, or retireable. No AC constructs a parked row.

**Impact**: the longest-stuck deliveries can remain outside the new operator/automatic policy, and implementers can make incompatible choices while satisfying the written ACs.

**Smallest fix**: explicitly classify `parked`; pin whether a no-state retire filter and the closed-recipient sweep include it, and update the state/summary count expectations accordingly.

## R-4 and plan structure

R-4 is honest, grounded, and actionable. Current source confirms that `status-stale` already requires recent `lastEventAt`, while `systemStateOf` maps fresh working telemetry to `working`. The `(c-remedy)` ruling preserves the predicate, adds remedy-bearing rejection/detail text, and adds the missing `systemState: "working"` fixture. No unresolved G1 marker remains.

The unified document otherwise satisfies the expected structural checks: Business Specification, Planning Seam, Implementation Plan, G1-G7 matrix, Target Domains, Domain Manifest, phase success criteria, and AC coverage map are present; tests precede implementation in every phase.

## Thesis and consumers

**Thesis**: partial. The plan advances the intended four scalpel cuts, but its claimed Implementation/Integration readiness is not yet supported for Phases 1-3.

**Consumers**:

- `pij spawn` -> per-model context capability -> **not satisfied** until duplicate/offline resolution is pinned.
- daemon pointer delivery -> optional `sendText` kind -> **not satisfied** because the production wrapper drops it.
- queue retire / daemon sweep -> delivery lifecycle and `pij revive` -> **not satisfied** pending a close-to-revive policy ruling and race guard.
- dual backend -> SQLite retirement source of truth -> **not satisfied** until `sqliteOf` and fs-mirror behavior are explicit.
- PA `queue` subverb classification -> **satisfied** by the planned mapping plus real-switch scrape and anti-vacuity floor.

No automatic repair was made: the retained findings require lifecycle/product decisions and new AC/task scope, not mechanical document correction.
