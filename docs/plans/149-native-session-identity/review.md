# Review — plan 149: native session id is the durable identity of a native seat

Reviewer: `pij-sunny-tarsier` (cross-model; coder was GPT-6 Astra / `pij-dry-pavetta`).
Subject: branch `149-native-session-identity` at **`6be799ec`**, baseline `86855c61`.
Probes: throwaway detached worktrees `/Users/jordanknight/pi-hacking/pij-worktrees/s149-review` (@6be799ec),
`…/s149-brakes` (@6be799ec), `…/s149-prefix` (@86855c61), each with a worktree-local `CARGO_TARGET_DIR`.
The coder's worktree was never written. The production daemon (127.0.0.1:7461) was never contacted;
production state was read from a **copy** of `~/.pij-rs/pij.sqlite`.

## Verdict

**APPROVE-WITH-FIXES**

The rule is implemented where the plan said it should be, AC1–AC7 are genuinely proven (I re-ran AC7
myself and it passed), and 11 of the 12 new conditions I attacked are pinned by a test that goes RED
when the condition is deleted. One finding is blocking.

**F001 must be fixed before this merges.** On the *actual production registry* the change converts
four native conversations from "registers with the wrong id" into "cannot register at all, silently,
forever". Those four are precisely the defect population plan 149 was written to rescue — including
session `7a582862…`, the session quoted in `plan.md` line 7.

| Rank | ID | Class | Severity | One line |
|---|---|---|---|---|
| 1 | F001 | degrades a control | **HIGH** | Duplicate-session rows (which production has) now 409 forever; measured regression 200 → 409 |
| 2 | F002 | degrades a control | MEDIUM | Session precedence discards the spawner's prebound id **and parent**; `pij spawn` then times out 504 on a tombstoned id while a healthy seat runs elsewhere |
| 3 | F003 | degrades a control | MEDIUM | A live incumbent incarnation is displaced with zero liveness evidence; the contract never names the external guarantee it now leans on |
| 4 | F004 | obscures information | LOW | AC5's cross-machine refusal is unreachable in production — the store nulls `machine` on every write |
| 5 | F005 | obscures information | LOW | `adopt` collapses the new `Retryable` variant back to a plain 400; untested, undocumented |
| 6 | F006 | obscures information | LOW | One new condition is unpinned (P1c); two pairs of brakes each rest on a single test |
| 7 | F007 | obscures information | LOW | `registration_target`'s session-first selector is **alphabetical** and tombstone-blind — latent today, live the moment F001 is fixed |
| 8 | F008 | obscures information | LOW | 3,884 lines of gate logs committed; no earlier plan folder in this repo committed any |

---

## F001 — HIGH: duplicate-session rows become a permanent, silent registration lockout

### The measured production state

```
$ cp ~/.pij-rs/pij.sqlite{,-wal,-shm} /tmp/pij-ro.sqlite…      # read-only copy, daemon untouched
$ sqlite3 /tmp/pij-ro.sqlite "select harness_session, count(*) c, group_concat(id),
    sum(tombstoned_at is null) live from seats where harness='copilot'
    and harness_session is not null and harness_session<>'' group by harness_session having c>1;"
7a582862-748a-4b07-b35c-2dcd067b3e7b|3|pij-harsh-anaconda,pij-fashionable-chameleon,pij-continental-flamingo|1
3ca048e4-9f2f-486c-a652-b85e60726922|3|pij-satisfactory-earthworm,pij-organic-hoverfly,pij-isolated-mollusk|0
d0d682ed-4249-498b-b974-1795c3476e12|2|pij-scientific-bradley,pij-other-sobeck|1
47a987ea-9191-4543-a144-330009718afb|2|pij-surviving-dajeil,pij-religious-rennala|1
```

Four sessions, 2–3 rows each. `7a582862…` is the session named in `plan.md` line 7.

### The new guard counts tombstoned rows

`crates/daemon/src/registration.rs:543-555` — no `tombstoned_at` filter:

```rust
if seats.iter()
    .filter(|seat| seat.harness == Harness::Copilot
        && seat.harness_session.as_deref() == Some(session))
    .count() > 1
{
    return Err(RegistrationError::Retryable(
        "native session has multiple Pij addresses; refresh the roster".into(),
    ));
}
```

`seats` here is `registry.list(SeatFilter::default())` (`registration.rs:507`), which includes
tombstoned rows. Registry rows are never deleted — `grep -rn "DELETE FROM seats\|fn remove\|fn delete"
crates/store/src/registry.rs crates/core/src/ports.rs` returns nothing, and no CLI verb removes a row
(`Close`/`Reap` only tombstone). So for these four sessions the count can never fall back to 1.

### Proven end-to-end, both trees, same roster

I appended one throwaway test reproducing session `7a582862…`'s exact shape (one live row + two
tombstoned same-session rows) to `crates/daemon/src/http/native_tests.rs` in each worktree, ran it,
then restored both trees (`git checkout -- crates/daemon/src/http/native_tests.rs`; both worktrees
verified clean).

**At `6be799ec`** — `cargo test -p pij-daemon --lib reviewer_probe_production_duplicate_session -- --nocapture`:

```text
PROBE attempt1 = {"command":"pij register","details":{"retryable":true},"error":"refused",
  "meta":"native session has multiple Pij addresses; refresh the roster","ok":false,"v":2}   # HTTP 409
PROBE attempt2 = {"command":"pij register","details":{"retryable":true},"error":"refused",
  "meta":"native session has multiple Pij addresses; refresh the roster","ok":false,"v":2}   # HTTP 409
PROBE roster_after = [("pij-copilot-fixture", None), ("pij-fashionable-chameleon", Some(1)),
                      ("pij-harsh-anaconda", Some(1))]
test result: ok. 1 passed
```

Attempt 1 nominates the live durable id; attempt 2 sends `id: ""` — the "refresh the roster" advice.
Both 409. The roster is unchanged, so no amount of refreshing converges.

**At `86855c61`** — identical fixture, identical claim, `StatusCode::OK` expected:

```text
PROBE attempt1 = {"command":"pij register","data":{"binding":"same","id":"pij-copilot-fixture",
  "proc":{"pid":39113,…},"session":"00000000-0000-4000-8000-000000000137",…},"ok":true,"v":2}   # HTTP 200
PROBE attempt2 = { … "ok":true … }                                                              # HTTP 200
test result: ok. 1 passed
```

Pre-fix the whole native-resolution block was gated on `if native && claim.id.is_empty()`
(`git show 86855c61:crates/daemon/src/registration.rs`), so a claim carrying a non-empty id never
reached the duplicate check. **200 → 409 is a measured regression, not an inference.**

### The client turns the 409 into silence

`.copilot/extensions/pij/extension.mjs:126-162`:

```js
let retry = INITIAL_RETRY_MS;          // 250 ms
let failureEpisode = false;
while (!signal.aborted) {              // ← no attempt bound
  try { … return; }
  catch (error) {
    if (!error.retryable) throw error;
    if (!failureEpisode)               // ← exactly one notice, ever
      nativeReport({ kind: "registration-wait", diagnostic: error.message, retryMs: retry });
    failureEpisode = true;
    await sleep(retry, undefined, { signal });
    retry = Math.min(retry * 2, MAX_RETRY_MS);   // 250 → 5000 ms cap
  }
}
```

Backoff is bounded (250 ms → 5 s cap, `store.mjs:6-7`), so it does not busy-spin. **The attempt count
is not bounded**, and `failureEpisode` latches, so the surface emits one line and then goes quiet for
the life of the session. That single line (`store.mjs:1123`) is:

> `[pij native] unavailable: registration-wait; check the Pij daemon and PIJ_RS_ADDR/PIJ_RS_STATE_DIR; retrying when available; ordinary Copilot remains usable`

For this cause the advice is actively wrong: the daemon is healthy, the addresses are correct, and it
will never "become available". The user is pointed at the wrong diagnosis and then told nothing else.

### Net

Pre-fix those four conversations got a working seat under a new name (annoying; orphans the queue).
Post-fix they get **no seat at all**, one misleading notice, and no operator verb that can repair it.
The report's risk bullet ("Existing ambiguous duplicate rows remain a typed retryable refusal rather
than guessing which address owns queued work") states the mechanism but not this consequence.

### Required fix

Exclude tombstoned rows from the ambiguity count — a tombstoned row is not a competing *address*,
it is history:

- `crates/daemon/src/registration.rs:543-555`: add `&& seat.tombstoned_at.is_none()` to the filter.
- `.copilot/extensions/pij/store.mjs:93-98`: the client mirror. (`/v1/seats` already drops tombstoned
  rows at `crates/daemon/src/http/mod.rs:2426-2427`, so the client filter is belt-and-braces, but the
  two layers should state the same rule.)
- Extend `native_session_ambiguity_returns_typed_retry_without_mutation`
  (`native_tests.rs:383-412`) with the **now-distinct** case that currently 409s and must not:
  one live row + N tombstoned rows for the same session ⇒ **200, resumed on the live row**.
  The existing fixture is exactly this shape (`duplicate.tombstoned_at = Some(1)`), so the test as
  written pins the defect rather than the contract; it needs a second live row to keep pinning 409.
- Fix **F007** in the same change (below) — with the count relaxed, the selector becomes load-bearing.

If instead the 409 is deliberately kept for tombstoned duplicates, then this needs an operator remedy
verb that can retire a duplicate *address* (not just tombstone it), and the extension needs an attempt
budget after which it reports a terminal, correctly-worded diagnostic. Silently retrying forever on a
condition that cannot resolve is not an acceptable end state.

---

## F002 — MEDIUM: session precedence discards the spawner's prebound identity and parent

`store.mjs:120` makes the session candidate outrank the prebind, and `registration.rs:824-827` now
retires the prebind row. Executed probe against the real module at `6be799ec` — prebind row present
**and** a same-session candidate with a different id (packet attack 4):

```text
roster: pij-prebound-child { proc:null, pane:"%7", spawn_id:"spawn-NEW", parent:"pij-parent-A" }
        pij-saved-elder    { session:S, proc:{111,…}, pane:"%99", spawn_id:"spawn-OLD", parent:"pij-parent-B" }
env:    PIJ_SESSION_ID=pij-prebound-child  PIJ_SPAWN_ID=spawn-NEW

POST-FIX => { id:"pij-saved-elder", spawn_id:"spawn-NEW", parent:"pij-parent-B", pane:"%7", … }
PRE-FIX  => { id:"pij-prebound-child",                     parent:"pij-parent-A", pane:"%7", … }
```

Both `&& !prebind` escapes fire, so neither corroboration guard throws; `prior = candidates[0]` wins.
Daemon-side, `claim.parent.filter(|_| !resuming)` (`registration.rs:761`) then discards the claimed
parent, and the prebind row is tombstoned.

Two consequences the report does not state:

1. **Parent flips.** The spawner asked for a child under `pij-parent-A`; the live seat reports
   `pij-parent-B`. Governance/ownership checks (`self-or-parent` role assertion,
   `docs/how/pij-rs-api.md`) now resolve against a stale parent.
2. **`pij spawn` reports failure for a healthy child.** The spawn wait polls the *prebind* id:
   `crates/daemon/src/http/mod.rs:1096-1097` — `registry.get(&descriptor.id)` … `Ok(Some(bound)) if
   bound.proc.is_some()`. The retirement clones the roster row and only sets
   `tombstoned_at`/`tombstone_reason`/`native_extension_delivery` (`registration.rs:829-839`), so
   `proc` stays `None` forever. The loop therefore runs to `deadline` and returns
   `GATEWAY_TIMEOUT` with `"timed out after {wait_seconds}s waiting for registration"`
   (`mod.rs:1191-1205`) plus a `spawn.failed` event — while a correctly-registered seat is running
   under a different id. `spawn_failure` does not kill the pane, so nothing is destroyed; but any
   orchestration that treats spawn failure as fatal will retry or tear down.

Reachability is narrow (needs a `pij spawn` whose child attaches to an already-registered session,
e.g. a `--resume` wrapper), which is why I rank it MEDIUM rather than HIGH. It is **untested at the
spawn-wait layer**: `native_sqlite_http_session_precedes_prebind_without_retargeting_its_work` asserts
the registration outcome and both queues, never the spawn waiter's view.

**Fix**: either have the retirement path publish `spawn.bound` for the resumed address carrying the
new `spawn_id` (the descriptor already carries it — `registration.rs:745-749`) and have the spawn
waiter resolve by `spawn_id` rather than by the prebind id, or make the prebind retirement record the
successor id so `mod.rs:1096` can follow it. Add a test at the `/v1/spawn` layer either way.

---

## F003 — MEDIUM: a live incumbent is displaced with no liveness evidence, and the contract is silent

`check_native_roster` (`registration.rs:1068-1073`):

```rust
match existing.proc {
    Some(previous) if previous != identity && !same_session => { return Err(…) }
```

and `observe_dead_native_owners` now skips same-session rows entirely before any liveness probe
(`registration.rs:308-314`, `|| seat.harness_session.as_deref() == Some(session)`).

This is exactly what AC2 demands ("the claim itself is the proof the old incarnation ended"), and
BrakeProbe P4 shows it is heavily pinned — restoring the pre-fix strictness reddens 11 tests and
reproduces the production defect verbatim. So it is **not** a defect against the plan.

It is an undocumented dependency. The daemon now relies on Copilot's own `inuse.lock` to guarantee
that at most one live process carries a given `harness_session`. If that guarantee is ever violated,
the second claimant silently rebinds `descriptor.proc` while the first process still holds its
`/v1/inbox` long-poll on the same seat id — two receivers on one address, no tombstone, no event
naming the displaced process as still-live. The refusal that used to prevent this is gone in both
directions, not one.

**Fix (documentation, not code)**: name the dependency in `docs/how/pij-rs-api.md` § Native Copilot
registration. The paragraph currently says the claim "adopts the observed host tuple and pane … without
waiting for the old process or death sweep" but never says *why that is safe* — the reader cannot tell
that single-liveness-per-session is an assumption rather than something the daemon checks. Record it in
`## Operational risks` of `report.md` too; the existing bullet only covers the bearer/executable trust
boundary.

---

## F004 — LOW: the cross-machine refusal is unreachable in production

`check_native_roster:1055` refuses when `existing.machine.is_some()`. BrakeProbe P3 confirms a test
holds it (`native_session_cannot_resume_a_row_from_another_machine` goes RED on deletion).

But `crates/store/src/registry.rs:339` sets `descriptor.machine = None` on **every** write, and
`/v1/seats` stamps the *local* alias onto every row it serves (`http/mod.rs:2410-2411`), while the
extension only ever asks for `?scope=local` (`extension.mjs:130`). So no row reaching
`registry.list()` can carry `machine: Some(_)`; the test constructs that state directly in an
in-memory roster.

The report's wording ("registry rows are local at rest (`SeatDescriptor.machine` is a federated-view
field)") is accurate. The AC5 evidence row is stronger than what was proven: it reads as a reachable
refusal. No exposure — record it as a defence-in-depth branch with a synthetic fixture, and say so.

---

## F005 — LOW: `adopt` discards the new retryable discriminator

`crates/daemon/src/http/identity.rs:606-609`:

```rust
RegistrationError::Refused(reason) | RegistrationError::Retryable(reason) => refused(ADOPT, reason),
```

`adopt` shares `register_inner`, so it can produce `Retryable` (owner-changed-during-observation,
duplicate session) — and projects it as an ordinary 400 with no `details.retryable`. `/v1/register`
preserves it as 409 (`http/mod.rs:793-800`). No adopt test mentions `Retryable`, 409 or the detail
flag. Whether that asymmetry is intentional cannot be determined from the source: there is no comment,
ADR or plan sentence about it. Either state the asymmetry deliberately or give `adopt` the same
projection; add one test either way.

Also untested after the test churn: the `Retryable` *owner-changed-during-observation* branch itself
(`registration.rs:521-524`). The old concurrent-mutation matrices that covered that race
(`cold_resume_revalidates_owner_after_unlocked_death_observation`,
`explicit_prebind_revalidates_both_rows_before_retiring_dead_same_native_owner`) were deleted and not
replaced with an equivalent.

---

## F006 — LOW: one unpinned condition, and two single-test pinch points

Twelve conditions attacked by deletion in a throwaway worktree, each in isolation, tree restored
between probes. **Eleven are genuinely pinned.**

| Probe | Condition deleted | RED test(s) | Verdict |
|---|---|---|---|
| P1a | whole auto-supersedes discovery block (`registration.rs:569-586`) | `native_reconnect_retains_address_and_explicit_new_session_retires_old_capability` | PINNED |
| P1b | `&& seat.proc == proc` | `native_sqlite_http_fresh_session_retires_dead_pane_owner_without_retargeting_m1` (400 vs 200) | PINNED |
| **P1c** | **`&& seat.pane == claim.pane`** | **NO TEST FAILED** — `-p pij-daemon` 534/534 green; full workspace 1078 pass, only the known `pij-tmux` adapter flake | **UNPINNED** |
| P2 | `.chain(handoff…prebind)` in the retirement loop | `native_sqlite_http_session_precedes_prebind_without_retargeting_its_work` | PINNED (single test) |
| P3 | `existing.machine.is_some() \|\|` | `native_session_cannot_resume_a_row_from_another_machine` | PINNED (see F004) |
| P4 | `&& !same_session` on the incarnation guard | 11 tests incl. all three AC3/AC4/AC6 HTTP tests, `native_session_fast_restart_does_not_consult_old_process` | PINNED, heavily |
| P5 | duplicate-session `Retryable` guard | `native_session_ambiguity_returns_typed_retry_without_mutation` (200 vs 409) | PINNED (single test — see F001) |
| P6 | `registration_target` session-first branch | 8 tests | PINNED, heavily |
| P7 | `.filter(spawn_id…).or(prebind)` in the spawn-id guard | `native_sqlite_http_session_precedes_prebind_without_retargeting_its_work` | PINNED (**same** test as P2) |
| P8 | `&& !prebind` on the prebind-corroboration throw | `fresh verified spawn correlation resumes a saved session without replacing its parent` | PINNED (single test) |
| P9 | `&& !prebind` on the spawn-correlation throw | same test as P8 | PINNED (**same** test as P8) |
| P10 | `seat !== candidates[0] &&` in the pane guard | `same native session nominates its durable address when native delivery withdrawn` | PINNED |
| P11 | `&& seat !== candidates[0]` in the `exact.some` guard | `native session resolution precedes stale pane metadata and duplicate process candidates` | PINNED |
| P12 | `candidates[0] ?? exact[0]` → `exact[0] ?? candidates[0]` | `same-process A to B to A restores the retired native address and accepted journal` | PINNED |

**P1c**: deleting the pane equality from the auto-supersedes predicate breaks nothing. The predicate
still requires `seat.proc == proc` (the claimant's own verified OS process), so the blast radius is
small — but the condition is load-bearing prose with no test behind it. Root cause of the hole: every
fixture reaching that block either supplies `claim.supersedes` explicitly (so `claim.supersedes.is_none()`
is false and the pane check in `check_native_roster:1038` is what's exercised) or runs single-pane.
Add a fixture with a same-proc, different-session row on a **different** pane and `supersedes` unset.

**Pinch points**: P2 and P7 both rest on `native_sqlite_http_session_precedes_prebind_without_retargeting_its_work`;
P8 and P9 both rest on `fresh verified spawn correlation resumes a saved session without replacing its parent`.
Two independent brakes behind one test means one weakened assertion darkens both.

### On the retirement question the packet asked directly

Every new path that tombstones a row:

1. **Auto-discovered bootstrap predecessor** (`registration.rs:569-586` → tombstoned at `846-859`).
   It retires a **live** row, but only one with `seat.proc == proc` — literally the claimant's own OS
   process under a different session id. Removing any condition can only *broaden* what is retired,
   and P1a/P1b show two of the three are pinned. This is a brake, and it is the claimant's own
   previous incarnation. No objection.
2. **Verified prebind** (`registration.rs:824-827`). This retires a row that is **not** the claimant's
   previous incarnation — it is a third-party-allocated address with its own parent and queue. It can
   never retire a live-bound row (`prebind` requires `seat.proc.is_none()`), so it is not a liveness
   hazard; the objection is F002, not "could it kill a live seat".
3. `dead_native` **narrowed**: `same_address_resume` and `explicit_same_native_prebind` were removed
   from `observe_dead_native_owners`, leaving only `stale_pane_owner`. Strictly fewer retirements.

---

## F007 — LOW: the session-first selector is alphabetical and tombstone-blind

`registration_target` (`registration.rs:974-981`) returns `seats.iter().find(session matches)` — the
first row in `registry.list` order, which is `ORDER BY id` (`crates/store/src/registry.rs:423`). With
several same-session rows it therefore picks the **alphabetically first**, live or tombstoned.

Not reachable today: the F001 count guard fires first. It becomes the deciding selector the moment
that guard is relaxed. (On the current production data it would pick correctly for all four sessions
— `pij-continental-flamingo`, `pij-religious-rennala`, `pij-other-sobeck` all happen to sort ahead of
their tombstoned siblings. That is luck, not design.)

**Fix, alongside F001**: prefer `tombstoned_at.is_none()`, then the most recently written row; make the
ordering explicit rather than inherited from `ORDER BY id`.

---

## F008 — LOW: committed gate logs

`docs/plans/149-native-session-identity/` carries 3,884 lines of `*.log`/`*.json`
(`gate-rust.log` 1604, `gate-self-check.log` 770, `live-green-release.json` 469, `live-red-final.json`
376, `red-js.log` 350, `gate-native-js.log` 191, rest small). `find docs/plans -maxdepth 2 -name '*.log'`
excluding plan 149 returns **zero** — plans 118, 121, 122, 123, 134, 136, 137 and 146 committed none.

Judgment: **trim, don't keep as-is.** The high-value artefacts are `artifact-provenance.json` (17
lines — I verified all nine source SHAs match the tree at `6be799ec`, see below) and the criterion-
specific RED/GREEN excerpts already inlined in `report.md`. `live-green-release.json` earns its place:
it carries AC7 facts (per-leg ids, job ids, ack origins) that cannot be compressed without loss.
`gate-rust.log` and `gate-self-check.log` are routine success output and should be tails plus exit
codes. This is a judgment call, not a blocker.

---

## Verification I ran

### Gates re-run at `6be799ec` (unmodified throwaway worktree, worktree-local `CARGO_TARGET_DIR`)

| Gate | Result |
|---|---|
| `cargo test --workspace` | **exit 0** — 85 suites, 1079 passed, 0 failed, 8 ignored (129 s) |
| `cargo fmt --all --check` | **exit 0**, no output |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0**, zero warnings |
| `node --test .copilot/extensions/pij/*.test.mjs` | **exit 0** — tests 181, pass 178, fail 0, skipped 3 |

All four match the coder's claims. One flake surfaced under concurrent load —
`pij-tmux tests/adapter.rs:775 forced_old_read_write_interleaving_allows_only_one_adapter`,
`"adapter A completes while B is held after its empty read: Timeout"` — which passed when re-run
alone (`cargo test -p pij-tmux --test adapter forced_… → 1 passed`). Unrelated to registration;
consistent with the plan's "smoke flakes under cargo load" note. The `pi-askuserquestion` package-audit
finding was ignored per the packet.

### AC7 re-run independently

I built `pij-rs` in my own worktree and ran the coder's script myself:

```
$ node harness/scripts/worktree-deps.mjs            # 358 links
$ CARGO_TARGET_DIR=$PWD/target cargo build -p pij-cli --bin pij-rs
$ node_modules/.bin/tsx docs/plans/149-native-session-identity/native-resume-live.ts \
      /tmp/s149/reviewer-ac7-receipt.json
exit 0
```

Own daemon `127.0.0.1:61153`, own tmux socket `pij-149-662e8806-…`, own HOME/COPILOT_HOME.
Production daemon untouched (`assert.notEqual(addr, "127.0.0.1:7461")` at script line 27).

| Leg | Seat id | Pane | Host pid | Job | Ack |
|---|---|---|---|---|---|
| spawn | `pij-profitable-latenna` | %1 | 1712 | — | — |
| same-window | `pij-profitable-latenna` | %1 | 5819 | 1 `pending`→`done` | `origin: reader-read` |
| new-window | `pij-profitable-latenna` | %2 | 6882 | 2 `pending`→`done` | `origin: reader-read` |

`/v1/state` after each leg: new pid, `tombstonedAt: null`, `tombstoneReason: null`.
The gap messages were **acknowledged by the resumed incarnation**, not merely enqueued — the receipt
rows come from `delivered_messages … WHERE origin = 'reader-read'` keyed on the resumed seat id, and
the job rows flip `pending` → `done`. AC7 is real.

Two honest caveats, both already disclosed in `report.md`:

- The new-window leg **manufactures** its tombstone via `/v1/close` (script line 116) after a dry-run
  reaper proves the pane dead, rather than waiting for the natural sweep. That exercises tombstone
  revival deterministically, but it is not a verbatim replay of `plan.md` defect #2.
- `binary_sha256` in `artifact-provenance.json` is not reproducible across worktrees (debug builds
  embed paths), so I could not match it. **All nine `files_sha256` entries match the tree at
  `6be799ec` exactly** (`sha256sum` on each path) — the provenance is sound where it is checkable.

### Attack list answers

| # | Packet question | Answer |
|---|---|---|
| 1 | Scope creep that widens retirement | Two new tombstoning paths. The bootstrap-predecessor path retires the claimant's own OS process's row — a genuine brake (P1a/P1b RED; P1c unpinned, F006). The prebind path retires a third party's row — never live-bound, but see **F002**. `dead_native` strictly narrowed. |
| 2 | Session-keyed nomination outranks process-exact | Confirmed both sides (`store.mjs:120`, `registration.rs:974-981`). Live seat *can* be displaced with no liveness evidence — this is what AC2 asked for, but it converts Copilot's `inuse.lock` into an unnamed daemon invariant. **F003.** |
| 3 | HTTP 409 typed-retryable refusal | Predicate is tight (`store.mjs:311-318` checks path, status, `v`, `ok`, `command`, `error`, `details.retryable`). Backoff bounded 250 ms→5 s; **attempt count unbounded and the notice latches** — **F001**. "Never manufactures an id" is structurally true, not just tested: `chooseRegistration` only ever emits `prior.id` or `""`, and `verifyRegisteredSeat` (`store.mjs:151-164`) rejects a readback whose id differs from a non-empty claim. |
| 4 | Prebind bypass | Reproduced. Prebind + same-session candidate with a different id ⇒ both `!prebind` escapes fire, the saved address wins, and the **parent silently flips**. **F002.** |
| 5 | AC5 anti-theft refusals | Different-session refusal pinned (`native_sqlite_http_different_session_cannot_take_existing_address_or_mail`); same-pane-new-session supersede pinned; cross-machine pinned by a test but unreachable in production — **F004.** |
| 6 | AC3/AC4 discriminate | **Yes, both.** The shared helper asserts `resumed["data"]["id"] == seat.id` (`native_tests.rs:318-322`) *before* the behaviour branch, mail is claimed through the original id (`:330-333`), parent/role are read back through it (`:336-341`), and the Telegram assertion compares the exact persisted record whose payload names `seat.id` (`:342-348`, seeded `:278-284`). A new id copying fields fails every one. AC6 asserts the real `/v1/state` HTTP projection (`:351-362`), not an in-memory descriptor. |
| 7 | AC7 live proof | Re-run independently, passed — table above. |
| 8 | Churn | Largely necessary; see below. |

### On the churn (packet item 8)

The rewrite is mostly justified: `registration_target` gained a parameter and a new first branch, and
`check_native_roster` inverted several guards from "incarnation is identity" to "session is identity".
Eleven tests were removed or renamed; ChurnAudit traced every one. Nine encode the *old* policy and
were correctly reversed (e.g. `native_refuses_active_identity_process_session_harness_and_pane_collisions`
cases 0/3/5/6/7 are now the positive contract). Two deletions lost coverage that was not replaced and
is not policy-reversed:

- `cold_resume_revalidates_owner_after_unlocked_death_observation` and
  `explicit_prebind_revalidates_both_rows_before_retiring_dead_same_native_owner` — the
  mutate-between-observation-and-commit matrices. The production code still returns `Retryable` on
  observed-owner drift (`registration.rs:512-525`), and after these deletions **nothing tests it**.
  That is the concurrency brake the whole two-phase observation exists for. Restore an equivalent.

Behaviour that moved with no test naming it: `existing.machine.is_some()` reachability (F004), the
`adopt` Retryable collapse (F005), the auto-supersedes pane condition (F006/P1c), the owner-drift
`Retryable` branch (above), and the spawn-waiter consequence of prebind retirement (F002). Tombstone
reason wording changed and is deliberately unpinned — correct.

## Required before merge

1. **F001** — stop counting tombstoned rows as competing addresses (daemon + client), fix the
   ambiguity test so it pins the contract rather than the defect, and land **F007** with it.
2. **F002** — make `pij spawn`'s waiter survive prebind retirement, or refuse the composition; add a
   `/v1/spawn`-layer test. State the parent-flip in `report.md` either way.
3. **F003** — name the single-live-host-per-session dependency in `docs/how/pij-rs-api.md` and
   `report.md` § Operational risks.
4. Restore a test for the observed-owner-drift `Retryable` branch.

Recommended, not blocking: F004 wording, F005 adopt asymmetry, F006/P1c fixture and the two
single-test pinch points, F008 log trim.

## Commands executed

```bash
git worktree add --detach …/pij-worktrees/s149-review  6be799ec
git worktree add --detach …/pij-worktrees/s149-brakes  6be799ec
git worktree add --detach …/pij-worktrees/s149-prefix  86855c61
git diff 86855c61..6be799ec --stat
git diff -U80 86855c61..6be799ec -- crates/daemon/src/registration.rs crates/daemon/src/http/native_tests.rs
sqlite3 /tmp/pij-ro.sqlite "select harness_session, count(*) …"          # copy of ~/.pij-rs/pij.sqlite
CARGO_TARGET_DIR=$PWD/target cargo test --workspace                       # 6be799ec, exit 0
CARGO_TARGET_DIR=$PWD/target cargo fmt --all --check                      # exit 0
CARGO_TARGET_DIR=$PWD/target cargo clippy --workspace --all-targets -- -D warnings   # exit 0
node --test .copilot/extensions/pij/*.test.mjs                            # exit 0
CARGO_TARGET_DIR=$PWD/target cargo test -p pij-daemon --lib reviewer_probe_production_duplicate_session -- --nocapture
node_modules/.bin/tsx docs/plans/149-native-session-identity/native-resume-live.ts /tmp/s149/reviewer-ac7-receipt.json
sha256sum <9 provenance paths>                                            # all match
# 12 brake-deletion probes, each isolated, `git checkout -- .` between each
```

All three throwaway worktrees were restored to a clean tree (`git status --porcelain` empty) after
probing. My AC7 receipt: `/tmp/s149/reviewer-ac7-receipt.json`.
