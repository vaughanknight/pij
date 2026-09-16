# Review: plan 151 — transient `/restart` session is held, not refused

Reviewer: `pij-sunny-tarsier`. Packet: `packet-reviewer.md`. Range `f619fc05..ab252595` (plan `f619fc05`,
code `6216e984`, evidence `ab252595`). Reviewed in a throwaway detached worktree
`/Users/jordanknight/pi-hacking/pij-worktrees/s151-rev` at `ab252595`, deps via `worktree-deps.mjs`
(358 links), worktree-local `CARGO_TARGET_DIR`. The coder's worktree was never written except this
file. Production daemon `127.0.0.1:7461` never contacted; production registry never read this round.

## Verdict

**APPROVE-WITH-FIXES.**

The rule is right, the daemon implements it narrowly, and the invariant that actually matters — *a
hold is never an admission* — is genuinely defended, not merely asserted. I proved non-admission
independently and at a stronger grade than the plan asked for: twelve consecutive holds leave the
SQLite file **byte-identical**. AC0's branch pin is exact. AC4's live receipt survives an independent
audit of its own JSON. All gates reproduce on my checkout.

Four fixes, one of which I would not ship without. None of them is a correctness defect in shipped
behaviour; three are missing proof for properties the code already has, and one is an evidence label
that claims more than it measured.

| # | Fix | Where | Severity |
|---|---|---|---|
| F1 | Scan-order precedence ("a separate ownership refusal wins") is asserted in a **comment and nowhere else** — and I proved it is observable | `crates/daemon/src/registration.rs:1205-1206` | **blocking** |
| F2 | Both pane terms of the hold branch are deletable, individually and together, with a fully green suite | `crates/daemon/src/registration.rs:1191-1192` | should-fix |
| F3 | The hold retry loop has no attempt or deadline bound, and the contract does not say so | `.copilot/extensions/pij/extension.mjs:129`, `store.mjs:798`, `docs/how/pij-rs-api.md:62` | should-fix |
| F4 | `existing_lines_unchanged: true` is recorded per-file but only measured for test text | `docs/plans/151-transient-session-hold/guard-provenance.json` | minor |

Plus one structural note (coverage concentration, § Brake sweep) and a trim list (§ Evidence weight),
neither a blocker.

---

## 1. Narrow — mutation sweep of the hold guard

Baseline `cargo test -p pij-daemon --lib -- --test-threads=1` at `ab252595`: **396 passed; 0 failed;
0 ignored**, stable across four runs. Every mutation applied alone, suite run, source restored,
`git status --porcelain` asserted empty between probes. Direction is stated for each, because it
decides severity: *widening* = holds where it should not, *narrowing* = refuses more, *admitting* =
lets a claim through.

| Probe | Deleted from the hold branch | Direction | Verdict | Witnesses |
|---|---|---|---|---|
| M1 | `existing.is_none() &&` | widening | UNPINNED | 0 (conjunction pinned — see below) |
| M2 | `&& !seats.iter().any(\|s\| s.harness_session.as_deref() == Some(session))` | widening | UNPINNED | 0 (same) |
| M3 | `claim.pane.is_some() &&` | widening | **UNPINNED** | 0 — **F2** |
| M4 | `seat.pane == claim.pane &&` | widening | **UNPINNED** | 0 — **F2** |
| M5 | `seat.harness == Harness::Copilot &&` | widening | PINNED | 1 |
| M6 | `seat.native_extension_delivery &&` | widening | PINNED | 2 |
| M7 | `!seat.relay &&` | widening | PINNED | 1 |
| M8 | `seat.machine.is_none() &&` | widening | PINNED | 1 |
| M9 | `seat.proc.is_some_and(\|p\| p.pid > 0 && p.proc_start > 0) &&` | widening | PINNED | 1 |
| M9b | that predicate → `\|_\| true` | widening | PINNED | 1 |
| M10 | `&& seat.harness_session…is_some_and(\|old\| !old.is_empty() && old != session)` | widening | PINNED | 1 |
| M10b | just `!old.is_empty() &&` | widening | UNPINNED | 0 — unreachable, see below |
| M11 | `\|\| dead_native.iter().any(\|o\| o.id == seat.id)` from the skip set | widening | PINNED | 2 |
| M12 | `.filter(\|s\| s.tombstoned_at.is_none())` → `.filter(\|_\| true)` | widening | PINNED | 6 |
| M13 | `held_owner = Some(&seat.id); continue;` → immediate `return Err(NativeSessionHold(…))` | precedence | **UNPINNED** | 0 — **F1** |
| M14 | the deferred re-raise `if let Some(error) = native_hold { return Err(error); }` | **admitting** | **PINNED** | 2 |
| M15 | `native_hold = Some(error)` → `return Err(error)` | narrowing | PINNED | 1 |

**M14 is the one that had to hold, and it does.** Deleting the deferred re-raise — which would fully
register a held claim — fails `native_transient_session_holds_without_mutating_owner_or_queue` and
`native_transient_session_tombstoned_or_observed_dead_owner_admits_new_address`. The companion
property, that a hold does not launder an otherwise-invalid claim into a retry, is pinned by M15 via
`native_transient_hold_never_masks_invalid_claims`.

**M1+M2 are masked, not missing.** Neither conjunct of `unknown_session` is individually witnessed,
but forcing `let unknown_session = true;` fails
`native_known_session_foreign_pane_collision_is_never_a_transient_hold`. That test *does*
discriminate hold from refusal — `fn refused` at `registration.rs:1697` asserts
`matches!(result, Err(RegistrationError::Refused(_)))`, which `NativeSessionHold` does not match — it
is simply insensitive to either conjunct alone, because in its fixture both evaluate false for
independent reasons. The composite is defended; no single conjunct is. Acceptable.

**M10b is unreachable, not untested.** Migration `crates/store/migrations/0013_native_extension_delivery.sql`
(pre-existing; plan 151 touches no migration) constrains any row with `native_extension_delivery = 1`
to `harness = 'copilot' AND pid IS NOT NULL AND pid BETWEEN 1 AND 4294967295 AND proc_start > 0 AND
harness_session IS NOT NULL AND length(harness_session) > 0 AND tombstoned_at IS NULL`. I hit this
directly — `registry.put()` of a native-attested seat with `proc = None` returns
`(code: 275) CHECK constraint failed`. Since the hold branch already requires
`seat.native_extension_delivery`, the empty-session case cannot be persisted. Defence-in-depth against
a state the store forbids. Note the redundancy is *contingent on M6*, which is pinned — so the
argument stands, but it is not independent of it.

Two conditions have **no store-level backstop at all**: `relay` is a bare `INTEGER NOT NULL DEFAULT 0`
in `0001_init.sql` with no CHECK, and `machine` is not a constrained column. M7 and M8 are therefore
defended by a test and nothing else. Both are pinned — which is the right place for them to be
defended, and the reason the concentration note below matters.

### Coverage concentration

`registration::tests::native_transient_hold_requires_local_attested_native_owner`
(`registration.rs:2077`) is a witness for **7 of 15 probes and the sole witness for 6** — M5, M7, M8,
M9, M9b, M10. One seven-iteration loop is the only thing standing between the hold guard and six
separate relaxations, including the only defence for `!seat.relay` and `seat.machine.is_none()`.
Weakening or deleting that single test silently unpins six conditions at once. Not a defect; worth
knowing before someone refactors it.

The compact summary of the guard's coverage shape: **six simultaneous relaxations
(M1+M2+M3+M4+M10b+M13) trip exactly one test.**

### Same-process and same-session conflicts — packet item 1, with one correction

I probed both shapes directly rather than reasoning from the source.

```
PROBE-A  owner proc == claimant proc, same pane, UNKNOWN session
         -> HTTP 400 {"meta":"a subagent of pij-same-proc-owner, not a seat:
                               it inherited PIJ_* from its parent"}   seats after = 1

PROBE-B  owner session == claimed session, DIFFERENT process, same pane
         -> HTTP 200 {"binding":"rebound","id":"pij-same-session-owner", ...}
```

Same-process: still a refusal ✓ — but **not because of the hold branch's narrowness**. It is refused
earlier, by the subagent guard, and never reaches the hold scan at all. That distinction is what
downgrades F2 below.

Same-session: the packet says this "still refuses". It does not — it **resumes**, 200 `rebound`, which
is 149's designed behaviour and is exactly right. `unknown_session` is false whenever a seat already
carries the claimed session, so the hold branch is structurally unreachable there. The packet's
phrasing over-states the requirement; the code does the correct thing.

---

## F1 (blocking) — the precedence property is real, observable, and untested

`registration.rs:1205-1206` carries an explicit claim:

```rust
// Tombstoned and observed-dead owners were excluded above.
// Finish the scan so a separate ownership refusal wins.
held_owner = Some(&seat.id);
continue;
```

Replacing that with an immediate `return Err(RegistrationError::NativeSessionHold(seat.id.clone()))`
leaves the suite **fully green** (`ok. 396 passed; 0 failed`). I verified this myself, and also that
`M1+M13` and `M2+M13` are green, so it is untested outright rather than masked by a correlated
condition.

That would be a tripwire gap if the property were unobservable. It is not. I built the discriminating
case — two seats in one pane, one hold-eligible and one not — and ran the **same request** against
both trees:

```
fixture: pane %151-shared holds two live seats
         pij-aaa-copilot-owner  (copilot, native-attested, live proc, session "owner-session")
         pij-zzz-relay          (relay: true, native_extension_delivery: false, proc None)
claim:   new host in %151-shared, session "unknown-transient" (unknown), id ""

HEAD ab252595 ->  HTTP 400  hold=null
                  meta="native Copilot registration refused: process, native session, or pane
                        already belongs to seat `pij-zzz-relay`"

with M13     ->  HTTP 409  hold="native-session"
                  meta="native Copilot registration held: pane owned by seat
                        `pij-aaa-copilot-owner`; awaiting resumed session"
```

Terminal refusal naming the real conflict, versus a retryable hold naming the wrong seat. The ids are
deliberately `aaa`/`zzz` so the hold-eligible row is scanned first — without controlling iteration
order the case is not reliably reproducible, which is presumably why it was never written.

Why it matters beyond the mutant: this is the failure direction plan 151 exists to prevent, pointed
the wrong way. A genuine pane-ownership conflict would stop producing a terminal, actionable error and
start producing **silence plus an unbounded retry loop** (see F3). The user would be left with a
Copilot that never gets a seat and one scrolled-away line, which is strictly worse than today's wall
of red, because at least the wall of red names the problem.

**Fix:** add the probe above as a test. It is ~35 lines, uses only existing helpers
(`HostFixture`, `FreshStore`, `native_host_services`, `native_registration`), and asserts
`StatusCode::BAD_REQUEST` with the refusal naming `pij-zzz-relay`. Deleting the `continue` must turn
it red. Alternatively, if scanning order is *not* meant to be load-bearing, delete the comment and
return the hold immediately — but then say so, because the comment currently promises a guarantee
nothing enforces.

---

## F2 (should-fix) — pane scoping is a tripwire gap, not an exploitable one

Both pane terms in the hold branch are deletable with a green suite, individually **and together**:

```
M3 alone   ok. 396 passed; 0 failed
M4 alone   ok. 396 passed; 0 failed
M3+M4      ok. 396 passed; 0 failed    (verified independently)
```

The obvious reading is that this converts same-process and paneless ownership conflicts from hard
refusals into retryable holds. **I measured that and it does not happen.** With M3+M4 applied:

```
PROBE-M34 other-pane: HTTP 400 hold=null
          meta="a subagent of pij-m34-owner, not a seat: it inherited PIJ_* from its parent"
PROBE-M34 paneless:   HTTP 400 hold=null   (same guard)
          seats after = 1
```

The upstream subagent guard refuses the same-process shape before the roster scan runs, so the hold
branch is unreachable for it. The pane terms are therefore **defence-in-depth behind an earlier
guard**, and their absence from the test suite is a missing tripwire rather than a live hole.

Still worth a test, for the ordinary reason: the protection currently depends on an unrelated guard
upstream continuing to fire for a shape nobody has written down. Assert that a hold requires a pane
match — the cheapest version is the M3+M4 mutant failing one new case.

---

## 2. Not an admission — verified at byte level

The plan asked for a store check after AC4 and after ≥10 synthetic retries. I did the stronger
version: twelve consecutive holds against the **real HTTP route** and a real SQLite store, with mail
already queued at the owner so a leak would show in the queue as well, comparing the registry, the
queue, the spine **and the sqlite file's sha256**.

```
PROBE 12 holds returned 409 hold=native-session
PROBE seats  before=1 after=1
PROBE sqlite before=1fe8f6113488865c546d2faa55b21482662ce4be19d4f505eeefa09bc3131489
             after =1fe8f6113488865c546d2faa55b21482662ce4be19d4f505eeefa09bc3131489
PROBE spine events before=3 after=3
```

Registry list equal, queue equal, spine tail equal, **and the database file is byte-identical**. Not
even an observation event is written. AC1's "all returns precede mutation" is not just true, it is
true at the storage layer.

Independently, the AC4 receipt's own leak queries reproduce:
`leak_queries: [{"session":"26e1bc6c-…","seats":[],"jobs":[]}]`, and
`seats_after: [{"id":"pij-specified-barnacle","harness_session":"49c2573f-…"}]` — one seat, the real
session, nothing else. That is AC5, confirmed from the artifact rather than from the prose.

## 3. Resolution paths — all three

**(a) owner dies → a NEW seat, not a resume.** Continuing the same probe, I killed and reaped the
owner's host and retried the identical claim:

```
PROBE after owner death -> "pij-extended-tochee" binding="created"
PROBE owner tombstoned=true mail_kept=true
```

New id, `binding: created` (not `rebound`), old owner tombstoned, and the owner's queued mail stays at
the owner's address rather than being inherited by the newcomer. The hold self-resolves on the very
next retry after real death — no sweep interval to wait out. Also pinned by
`native_transient_session_tombstoned_or_observed_dead_owner_admits_new_address`, which covers both the
already-tombstoned and the observed-dead arms.

**(b) claimed session gains a seat → 149 resume.** Two directions, both measured. Live owner,
same session, new process → `HTTP 200 binding:"rebound"` to the existing id (PROBE-B above).
Tombstoned saved session → `native_known_historical_session_resumes_instead_of_holding_live_bootstrap`
asserts `rebound` onto the saved address with the live bootstrap row retired. The hold branch cannot
intercept either, because `unknown_session` is false by construction.

**(c) fork killed → nothing left behind.** Implied by the byte-identical store above (nothing was ever
written, so nothing can be left), and confirmed live: the transient fork exits
`code=0 disposition=stopped-normally`, `fork_counts: [{"session":"26e1bc6c-…","forks":1}]`.

## 4. Extension surface — verified against the real module

Probes run directly against `.copilot/extensions/pij/store.mjs`, not against the tests:

```
P-EXT1  200 consecutive holds spanning 20 simulated minutes -> user lines: 1
        ["[pij native] waiting for this pane's resumed Copilot session"]
        captured events: 200   (stderr timeline only, not user-visible)
P-EXT2  elapsedMs=9999 -> 0 lines | 10000 -> 1 | 10001 -> 1
P-EXT3  elapsedMs undefined/null/NaN/-1 -> 0 lines, no throw
P-EXT4  banned-phrase check ("restart the Copilot CLI" / "unavailable"): absent
P-EXT5  hold, then a genuine non-hold failure ->
        ["[pij native] waiting for this pane's resumed Copilot session",
         "[pij native] unavailable: reconnecting; check the Pij daemon and …"]
P-EXT6  INITIAL 250  MAX 5000  sequence 250,500,1000,2000,4000,5000,5000,…
```

Every clause of AC3 holds: silent under 10 s, exactly one line ever, correct wording, backoff capped
at 5 s, and the extension never exits — `if (!error.retryable) throw error` at `extension.mjs:157` is
not reached because holds are retryable.

**P-EXT5 is the one I most wanted to fail and it did not.** A hold does not become a blanket mute: a
subsequent genuine failure still raises its banner, because the non-hold branch resets `holdStarted`
and the reporter resets `registrationWaiting`. Quiet mode is scoped to the hold, which is the whole
point.

One benign edge, noted so nobody mistakes it for a bug later: `registrationWaiting` is latched
**before** the log RPC is awaited (`store.mjs:1215-1216`), so if that RPC fails the user gets zero
lines rather than a retry — it degrades toward silence, which is the intended direction.

### F3 (should-fix) — the loop is unbounded and the contract does not say so

The packet asks directly: can a hold spin forever if the daemon keeps answering 409?

**Yes.** `extension.mjs:129` is `while (!signal.aborted)` and `store.mjs:798` is the same in the
bridge. There is no attempt counter and no deadline. The only bound is `signal.aborted`, driven by
`session.shutdown` (`extension.mjs:102`) or EOF — i.e. **Copilot killing the fork**. In the `/restart`
case that always happens and the live receipt proves it. But if the pane's owner stays alive and its
session never resumes, the fork polls every 5 s indefinitely, silent after one line.

Note precisely what changed, because the unboundedness itself is not new: the retry loop was already
unbounded for every retryable error pre-151. What 151 changes is that **for this claim shape it
converts a terminating path into a non-terminating one** — the measured production behaviour was
HTTP 400 → non-retryable → throw → `extension-unavailable` → exit. That trade is the right one; it is
the plan's entire purpose. It should simply be written down.

`docs/how/pij-rs-api.md:62` describes both resolution paths and says the extension "stays alive,
retries with backoff capped at 5 seconds", but never states that the retry has no attempt limit and no
deadline, nor that fork termination is the only bound. Add one sentence.

## 5. Live proof honesty — AC4 audited from the receipt, not the prose

`transient-hold-live.ts` cannot reach production, and the lines that guarantee it:

| Guarantee | Line |
|---|---|
| Never the production daemon | `:27` `assert.notEqual(daemonAddr, "127.0.0.1:7461")`; port from `:21-25` (ephemeral) |
| Private HOME / state / cwd / Copilot home | `:15-20` `mkdtempSync` + `mkdirSync(…, 0o700)`; `:95` `smokeEnvironment(…)`; `:96` private `CLAUDE_CONFIG_DIR`; `:99` private `config.json` |
| Private tmux | `:19` `socket = pij-151-<uuid>`; `:103` `tmux -L socket`; `:203` `kill-server` on that socket only |
| Own daemon | `:124` `spawn(bin, ["--state-dir", state, "daemon", "--bind", daemonAddr])` |
| Store read-only | `:172` `new DatabaseSync(…, { readOnly: true })` |
| Never overwrite proof | `:17` `assert(!existsSync(output))` |

Re-derived from `live-green-release.json` itself rather than the report's table:
`addr 127.0.0.1:51172`, `daemonAddr 127.0.0.1:51171`, `home` under `/var/folders/…`, production port
absent. Registrations group as **7 × HTTP 409** for transient `26e1bc6c-…` and 3 × HTTP 200 for real
`49c2573f-…`; `forks: 1`; across all three extension logs, **`unavailable` count = 0**.

**The SIGSTOP is labelled correctly and is the right process.** `stretched` records
`pid 17809`, `observed "15919 …/copilot"`, `method "SIGSTOP owned restart child AFTER extension
requests roster; extension remains running"`, `duration_ms 15000` — and `:50` asserts the paused
process's parent is the recorded owner before signalling, `:202` always `SIGCONT`s in `finally`. It
freezes the restarted CLI, not the extension, which is why the extension still emitted seven
`registration-wait` events over 13.2 s.

**The natural run's outcome is stated, not implied.** `live-red.json` is `status: "failed"` with
`transient: []` and the driver's own guard as the error — *"restart must exercise a throwaway native
session, not skip the hold"*. The uncontrolled bootstrap finished before registration, so the natural
run proves nothing about the hold, and the report says exactly that ("proof-gap receipt, not a
behavioral RED"). That is the honest call.

Equally honest, and worth crediting: `report.md` does **not** claim the 10-second notice was observed
live. It states the paused CLI could not render timeline RPCs and that the one-line behaviour is
proven by the subprocess fixture instead. My own audit agrees — `waiting for this pane` appears 0
times in all three logs. A weaker review would have let that pass as proven.

`:187-188` are what make the receipt non-fabricable: the scenario fails unless the control actually
produced a transient hold, and **every** transient registration must be 409.

## 6. AC0 — branch pin verified exactly

The report pins pre-fix `registration.rs:1165-1173`, refusal at `1170`, and says the plan's guess
(line 523) was wrong. Checked against `f619fc05`:

```
1165: if seat.proc == Some(identity)
1166:     || (seat.harness == Harness::Copilot
1167:         && seat.harness_session.as_deref() == Some(session))
1168:     || (claim.pane.is_some() && seat.pane == claim.pane)
1169: {
1170:     return Err(native_refusal(format!(
1171:         "process, native session, or pane already belongs to seat `{}`",
1172:         seat.id
1173:     )));
```

Exact, and the text matches the observed 400 envelope. Correcting the prime's guess in the report
rather than quietly implementing to it is the right behaviour.

## 7. Guards preserved — AC2 holds, with one label to fix

I re-derived the insertion-only claim myself instead of trusting `guard-provenance.json`:

- `native_tests.rs`: **178 insertions, 0 deletions.**
- `registration.rs`: exactly **2** deleted lines in the whole file — `check_native_roster(` and `)?;`
  — both **production** lines at old 611-620, the `?`-to-`match` conversion. The `mod tests` hunk
  (`@@ -2001,6 +2044,87 @@`) contains **zero** deletion lines.
- All 15 tests in the AC2 table exist, one definition each, none `#[ignore]`d (corroborated by
  `0 ignored` in every run).

JS surfaces needed the same scrutiny, since `extension.test.mjs` *does* have deletions. The only
removed test is `native diagnostic sink counts one call per failure episode…`, which moved verbatim
into `hold.test.mjs:23-41`; the only removed assertions are its three; 29 assertions were added along
with three new test families. **No assertion was weakened.** The "fixture repair" in `report.md` is
what it says it is — the classic way a suite goes quietly green is a repair that also relaxes a
check, and that did not happen here.

### F4 (minor) — the provenance artifact over-claims its own scope

`guard-provenance.json` records, per file:

```
/files/crates/daemon/src/registration.rs/existing_lines_unchanged = True
/files/crates/daemon/src/registration.rs/change_kinds = ['insert']
```

At file granularity that is false — two existing production lines changed. The sibling
`comparison` string narrows it ("existing Rust **test** text unchanged"), and the narrowed claim is
true; I verified it. But the field is keyed by file path and named as if it covered the file, so it
reads as a stronger statement than was measured. Since AC2's whole value is "you can trust the
preserved-guard table", rename it to `existing_test_lines_unchanged` or scope the record to the
`mod tests` range.

## 8. Gates — re-run on my checkout

| Gate | Result |
|---|---|
| `cargo fmt --all --check` | **exit 0** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0** |
| `cargo test --workspace -- --test-threads=1` | **88 suites, 1117 passed**, zero `failures:` blocks — matches the report exactly |
| `node --test .copilot/extensions/pij/*.test.mjs` | **exit 0** — tests 224, pass 221, fail 0, skipped 3 |
| `npm run smoke` | **exit 0**, all 11 scenarios |
| `just self-check` | exit 1 on a cold-cache artefact — see below |

**The Node invocation question, answered.** The packet's literal
`node --test .copilot/extensions/pij/` is genuinely invalid on Node v24.7.0: **exit 1**,
`Error: Cannot find module '…/.copilot/extensions/pij'`, `code: 'MODULE_NOT_FOUND'`. The valid
invocation is `node --test .copilot/extensions/pij/*.test.mjs`, and it is not an improvisation —
it is already the canonical form at **`justfile:108`**, the same line `just self-check` runs. It
covers **5 of 5** test files in the directory, so "every native test file" is accurate. The packet
was wrong; the coder used the repo's existing command.

**`just self-check` exit 1 is not a plan-151 defect.** It failed in `smoke: file-watch-notify` with
`waitIdle timed out after 30000ms`, and the captured tail shows the scenario was still *cloning a
repository and running npm install* when the idle budget expired. Re-run warm in the same worktree,
`npm run smoke` passes all 11 scenarios, exit 0. This is precisely the cold-boot gap the report's own
harness closeout names ("a future cold-boot sensor could expose package warmup separately from the
90 s smoke budget"). I hit it because my worktree was cold; it is a harness issue, and the honest
disclosure of it in the report is to the coder's credit.

**One reviewer-side note on gate hygiene.** My first `cargo test --workspace` run failed one test in
`pij-tmux --test adapter` while a mutation sweep was running concurrently in the same worktree.
Re-run in isolation: `ok. 32 passed; 0 failed`. Real-tmux suites in this repo do not tolerate a
concurrent second cargo process; anyone scoring this gate must not run it alongside other work.

## 9. Evidence weight — trim list (not a blocker)

3,084 lines / 296 KB under `docs/plans/151-transient-session-hold/`. Applying the plan-150 H-round
rule — keep what a reader needs to re-derive the claim:

| Artifact | Lines | Recommendation |
|---|---|---|
| `live-stretch-green.json` | 629 | **Delete.** Structurally identical to `live-green-release.json` — same `binary_sha256`, `extension_sha256`, `store_sha256`, same `status`; every other field differs only by run (tmp dir, pids, ports). Two runs of one build proving one claim. |
| `ac0-red.json` | 258 | **Delete.** The report itself supersedes it: it "used the npm loader as pane process; only `ac0-exact-red.json` proves that the pane process itself is the recorded host." A weaker version of a claim the stronger artifact already carries. |
| `live-red.json` | 224 | **Reduce to a pointer.** It is a proof-gap receipt; the two facts worth keeping (bootstrap ended before registration; the driver's guard fired) are already prose in `report.md`. |

≈1,111 lines, about 36%. **Keep** `live-green-release.json` (the AC4 receipt), `ac0-exact-red.json`
and `live-stretch-red.json` (two genuinely different REDs — synthetic claim vs. the extension's own),
`guard-provenance.json`, the three gate logs, `red-daemon.log`, and both extension stderr logs —
those are small and are the discriminating evidence.

`transient-hold-live.ts` should stay in the tree regardless of trimming: it is a permanent, runnable
driver with a self-guard against fabricated greens, not a receipt.

## 10. Fixes, restated with locations

1. **`crates/daemon/src/registration.rs:1205-1206`** — add the two-seats-one-pane test in § F1, or
   delete the comment and the `continue` together. Blocking.
2. **`crates/daemon/src/registration.rs:1191-1192`** — one test asserting a hold requires a pane
   match; M3+M4 must go red.
3. **`docs/how/pij-rs-api.md:62`** — state that the hold retry is unbounded in attempts and time, and
   that fork termination (`extension.mjs:129` `signal.aborted`) is its only bound.
4. **`docs/plans/151-transient-session-hold/guard-provenance.json`** — rename
   `existing_lines_unchanged` to reflect that only test text was compared.

Non-blocking: the trim list in § 9, and the coverage-concentration note in § 1.

---

## Commands executed

```bash
git worktree add --detach …/pij-worktrees/s151-rev ab252595
node harness/scripts/worktree-deps.mjs                  # 358 links
cargo test -p pij-daemon --lib -- --test-threads=1      # baseline 396/0, ×4
# 15 assigned + 8 combination mutants, each isolated, source restored between probes
# 4 reviewer probes appended to native_tests.rs, run, then `git checkout --`
cargo test --workspace -- --test-threads=1              # 88 suites, 1117 passed
cargo clippy --workspace --all-targets -- -D warnings   # exit 0
cargo fmt --all --check                                 # exit 0
node --test .copilot/extensions/pij/                    # exit 1, MODULE_NOT_FOUND (packet's form)
node --test .copilot/extensions/pij/*.test.mjs          # exit 0, 224/221/0/3
npm run smoke                                           # exit 0, 11/11
just self-check                                         # exit 1, cold-cache clone timeout
```

The review worktree was restored clean (`git status --porcelain` empty, `registration.rs` and
`native_tests.rs` byte-identical to `ab252595`) before this file was written, and is removed.

---

# Round 2 — fix round

Range `2059d0da..12bdcfc1` (fix `b3f8378c`, evidence `12bdcfc1`). Fresh throwaway worktree
`/Users/jordanknight/pi-hacking/pij-worktrees/s151-r2` at `12bdcfc1`, deps via `worktree-deps.mjs`
(358 links), worktree-local `CARGO_TARGET_DIR`. Baseline at HEAD: `cargo test -p pij-daemon --lib
-- --test-threads=1` → **398 passed; 0 failed; 0 ignored** (396 + the two new tests).

## Round 2 verdict

**APPROVE.**

All four findings are fixed, each verified by my own mutant rather than by the coder's logs. The
blocking one (F1) is not merely covered — it is covered *deterministically*, which was the specific
reason it was never written before. The trim is exactly the list I gave and removed nothing
load-bearing. Gates are green on my checkout.

| Finding | Fix | Verified by |
|---|---|---|
| F1 (blocking) | `native_transient_hold_yields_to_separate_pane_ownership_refusal` | 2 mutants red, HEAD green ×12 |
| F2 | `native_transient_hold_requires_present_matching_pane_at_roster_guard` | M3 red, M4 red |
| F3 | `HOLD_ESCALATION_MS` / `HOLD_ESCALATED_RETRY_MS` + contract sentence | 90-min reporter probe, 2 mutants × 13 tests red |
| F4 | field renamed at its only write site | grep of every writer |
| Trim | 2 deletions + 1 reduction | file-level diff + retained-receipt audit |

## F1 — precedence is now pinned, and pinned deterministically

`crates/daemon/src/http/native_tests.rs:444` builds the exact fixture from my round-1 probe: a
hold-eligible `pij-aaa-copilot-owner` and a terminal-conflict `pij-zzz-relay` sharing `%151-shared`,
claimed by a new host under an unknown session. It asserts `BAD_REQUEST`, `details.hold` absent, and
that the meta names `` `pij-zzz-relay` ``.

Both directions of the mutation go red; HEAD is green:

```
F1a  held_owner = Some(&seat.id); return Err(NativeSessionHold(seat.id.clone()));   # scan never completes
     test http::native_tests::native_transient_hold_yields_to_separate_pane_ownership_refusal ... FAILED
     test result: FAILED. 0 passed; 1 failed; 397 filtered out

F1b  held_owner = Some(&seat.id);                                                   # `continue` deleted, falls through
     test http::native_tests::native_transient_hold_yields_to_separate_pane_ownership_refusal ... FAILED
     test result: FAILED. 0 passed; 1 failed; 397 filtered out

HEAD test result: ok. 1 passed; 0 failed; 397 filtered out
```

F1a is the mutant from round 1 in a compiling form — deleting the assignment outright breaks type
inference on `held_owner` (`E0282`), so the equivalent mutation keeps the assignment and returns
immediately. F1b is the narrower "delete only the `continue`" variant; the coder ran both too
(`red-f1-immediate-hold.log`, `red-f1-continue-deletion.log`), and both are genuinely red.

**The reproducibility objection from round 1 is resolved, not worked around.** I flagged that the
case depends on the hold-eligible seat being scanned first and is therefore not reliably
reproducible. It now is: `crates/store/src/registry.rs:395` lists seats `ORDER BY id`, so the
`aaa`/`zzz` ids make the ordering a property of the store rather than an accident of iteration.
Twelve consecutive runs, all green:

```
for i in $(seq 1 12); do … | grep -c "^test result: ok. 1 passed"; done | sort | uniq -c
  12 1
```

## F2 — both pane terms now discriminate

`crates/daemon/src/registration.rs:2113` calls `check_native_roster` directly rather than going
through HTTP, with the reason stated in-comment: *"upstream subagent rejection otherwise masks
same-process collisions before either pane condition is reached."* That is exactly the round-1
measurement (PROBE-M34: the HTTP path returns the subagent refusal and never reaches the hold scan),
so testing at the guard is the correct level — the alternative would have been a test that passes
for the wrong reason.

The two loop iterations isolate one term each: `(None, None)` leaves `seat.pane == claim.pane` true
so only `claim.pane.is_some()` blocks the hold; `(Some("%151-claim"), Some("%151-owner"))` leaves
`claim.pane.is_some()` true so only the equality blocks it. Each mutant goes red:

```
M3  drop `claim.pane.is_some() &&`
    failures:
        registration::tests::native_transient_hold_requires_present_matching_pane_at_roster_guard
    test result: FAILED. 0 passed; 1 failed; 397 filtered out

M4  drop `seat.pane == claim.pane &&`
    failures:
        registration::tests::native_transient_hold_requires_present_matching_pane_at_roster_guard
    test result: FAILED. 0 passed; 1 failed; 397 filtered out
```

`refused(...)` at `registration.rs:1697` asserts `Refused(_)`, which `NativeSessionHold` does not
match, so the assertion distinguishes hold from refusal rather than merely "not Ok".

## F3 — escalation, measured over 90 simulated minutes

`HOLD_ESCALATION_MS = 600000`, `HOLD_ESCALATED_RETRY_MS = 60000` (`store.mjs:8-9`). Driving the real
`createNativeReporter` with the real backoff arithmetic from `extension.mjs:160-180`:

```
P1  90 minutes of continuous hold — attempts: 203 | user lines: 2 | stderr timeline events: 203
    [ { "elapsedMs":  12500, "msg": "[pij native] waiting for this pane's resumed Copilot session" },
      { "elapsedMs": 602500, "msg": "[pij native] still waiting for this pane's resumed Copilot
                                      session after 10 min; pij delivery is unavailable in this window" } ]
    pre-escalation retry max: 5000 (123 attempts)
    post-escalation retry values (unique): [ 60000 ]  over 80 attempts
```

Two lines in an hour and a half, 203 attempts. Cadence, boundary, idempotence and episode reset all
hold:

```
P2  elapsedMs 599999 -> ["… waiting for this pane's resumed Copilot session"]   (no escalation)
    elapsedMs 600000 -> ["… still waiting for this pane …"]                     (escalation)
P3  500 consecutive post-escalation events -> 1 line
P4  escalated hold, connection-ready, escalated hold again -> 2 lines (one per episode)
P5  elapsedMs undefined / null / NaN / -1 -> 0 lines, no throw
P6  escalated hold, then a genuine non-hold failure ->
    ["… still waiting for this pane's resumed Copilot s…",
     "[pij native] unavailable: registration-wait; check the Pij d…"]
```

P6 is the one that mattered most: escalation does not become a blanket mute, because
`registrationEscalated` resets on the non-hold branch alongside `registrationWaiting`
(`store.mjs:1247`).

**Two mutants, both deep red.** The packet asked for one; the second isolates the notice threshold
from the retry cadence, so a green suite cannot be explained by the cadence assertions alone:

```
HOLD_ESCALATION_MS = 0                      -> ℹ tests 230  ℹ pass 214  ℹ fail 13
const escalated = event.elapsedMs >= 0      -> ℹ tests 230  ℹ pass 214  ℹ fail 13
```

Both red sets include `transient registration hold is silent before ten seconds and reports once
afterward`, `registration hold escalates once at ten minutes even when the initial notice was
skipped`, and both `startup`/`bridge` copies of the escalation lifetime test. The notice-only mutant
fails precisely on the "nothing before the threshold" assertion:

```
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  actual: 1,  expected: 0
observed [... {"kind":"registration-wait","elapsedMs":0,"retryMs":250},
          {"kind":"native-log","message":"[pij native] still waiting … after 10 min; pij delivery
           is unavailable in this window"} ...]
```

— the escalation line emitted at `elapsedMs: 0`, caught.

**No exit, verified at the level that matters.** `extension.test.mjs:480` drives the *actual
extension child process* on a controlled clock: `599999 ms is still before escalation`, escalation at
exactly `600000` with `retryMs: 60000`, no registration request at `+59999 ms`, `exitCode === null`
and `signalCode === null` at 1 h, 1 h 1 min and 2 h, then exit `0` only on `session.shutdown` / EOF
with `aborting cancels the pending minute retry`, and exactly `[waitingMessage, escalationMessage]`
across the whole run. Both retry loops are still `while (!signal.aborted)` (`extension.mjs:131`,
`store.mjs:799`) — no attempt limit, no deadline, which is what the contract now says.

**Contract sentence — present and accurate**, `docs/how/pij-rs-api.md:62`:

> After 10 minutes of continuous hold, it emits exactly once: “[pij native] still waiting for this
> pane's resumed Copilot session after 10 min; pij delivery is unavailable in this window”. The hold
> retry has no attempt limit or deadline: fork termination is the terminating bound, and after that
> escalation retries continue at a slower 60-second cadence without exiting.

That answers every part of F3, including the "fork termination is the only bound" clause I asked for.
The earlier sentence also correctly became "backoff **initially** capped at 5 seconds".

**One mechanism note, not a finding.** The 60-second cadence survives only because
`if (elapsedMs >= HOLD_ESCALATION_MS) retry = HOLD_ESCALATED_RETRY_MS` re-applies on every iteration
*before* the sleep — the tail of the loop still runs `retry = Math.min(retry * 2, MAX_RETRY_MS)`,
which clamps 60000 back down to 5000 between iterations. The value is correct at every point it is
used, and the assertion at `+59999 ms` would catch a regression, but anyone editing that loop should
know the escalated value is re-derived rather than carried.

## F4 — renamed at its only write site

```
guard-provenance.json:6   "existing_test_lines_unchanged": true,
guard-provenance.json:12  "existing_test_lines_unchanged": true,
```

Both file entries renamed. Grep for the old name across the repo returns only two prose mentions —
`packet-fix.md:10` (the instruction) and `report.md:224` (the RED description) — neither of which
writes the field. No script emits it: grep for `guard-provenance` / `change_kinds` across
`*.ts *.mjs *.js *.py *.sh` returns nothing, so the artifact is hand-authored and there is no
generator left holding the old key.

## Trim — exactly the list, nothing load-bearing

```
deleted:  ac0-red.json              (259 lines)
          live-stretch-green.json   (630 lines)
reduced:  live-red.json             224 -> 7 lines
```

No other receipt was deleted; `git diff --diff-filter=D` over the range lists exactly those two
files. The reduced `live-red.json` retains precisely the two facts I said were worth keeping, plus a
pointer:

```json
{ "facts": [
    "The uncontrolled native bootstrap ended before transient registration was attempted.",
    "The driver failed its guard: restart must exercise a throwaway native session, not skip the hold." ],
  "report": "report.md#ac4--actual-native-restart-one-transient-fork" }
```

All six artifacts I said to keep are present: `live-green-release.json`, `ac0-exact-red.json`,
`live-stretch-red.json`, `guard-provenance.json`, `red-daemon.log`, `transient-hold-live.ts`, plus
both extension stderr logs and the gate logs.

**The deletion I most needed to check was `live-stretch-green.json`, because the stretched run is the
only one that reaches the hold.** The retained `live-green-release.json` *is* the stretched run —
it carries the `stretched` block (`pid 17809`, `SIGSTOP owned restart child AFTER extension requests
roster`, `duration_ms 15000`), `registrations {409: 7, 200: 3}`, `fork_counts [{forks: 1}]`,
`leak_queries [{seats: [], jobs: []}]`, `daemonAddr 127.0.0.1:51171`. The duplicate went; the proof
stayed.

Evidence is now 2,204 receipt lines (from 3,084) with ~500 lines of new fix-round proof added, so the
underlying trim is larger than the net.

## Disclosure I did not ask for and should credit

`fix-native-ui-gap.json` records that the post-fix live re-run **failed**: Copilot moved 1.0.84-9 →
1.0.85, the shared `nativeComposer` parser expects `╻/┃/╹` and 1.0.85 renders horizontal rules and
`❯`, so the driver timed out at `initial empty composer` before `/restart`.
`transient_registration_count: 0`, `registration_statuses: [200, 200]`. `report.md:334` states it
plainly — *"not a HOLD failure or fresh GREEN"*, and *"F3 is proven by accelerated extension
subprocesses with explicit SDK/clock seams, not a fresh 1.0.85 lifecycle run."* Recording a failed
re-run that nobody asked for, and refusing to let the old receipt imply a new one, is the behaviour
that makes the rest of this evidence trustworthy.

I checked what that actually leaves unproven, and it is less than it looks:

```
git diff --numstat 2059d0da..12bdcfc1 -- crates/
  44  0  crates/daemon/src/http/native_tests.rs
  21  0  crates/daemon/src/registration.rs
hunks: @@ -441,6 +441,50 @@ (native_tests.rs)   @@ -2109,6 +2109,27 @@ mod tests
mod tests begins at registration.rs:1551
```

Zero deletions, and the only `registration.rs` hunk sits 558 lines inside `mod tests`. **Daemon
production code is byte-identical across this range**, so the AC4 receipt's daemon half — the seven
409s, the empty leak queries, the single seat — carries over verbatim and needs no re-proof. Only the
extension changed, and the changed behaviour is gated at 10 minutes, which the 13.2-second AC4 window
never reached; in that window the diff reduces to hoisting an identical expression into `elapsedMs`
plus an `if` that evaluates false. The extension half rests on controlled-clock subprocess tests,
which I mutation-verified above rather than taking on trust.

## Gates — re-run on my checkout, warm

| Gate | Result |
|---|---|
| `cargo test --workspace --no-fail-fast -- --test-threads=1` | **exit 0** — 88 suites, **1119 passed, 0 failed** (1117 + 2 new) |
| `cargo fmt --all --check` | **exit 0** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0** |
| `node --test .copilot/extensions/pij/*.test.mjs` | **exit 0** — tests 230, pass 227, fail 0, skipped 3 |
| `cargo test -p pij-daemon --lib -- --test-threads=1` | **398 passed; 0 failed; 0 ignored** |

The first `--workspace` attempt exited 101 on
`pij-tmux --test adapter :: post_enter_cleanup_failure_remains_success_and_submits_once` —
`tmux … (exit 75): tmux returned no diagnostic`. This is the same flake I hit in round 1. Isolated:
`ok. 32 passed; 0 failed`. Full workspace re-run with `--no-fail-fast`: **0 FAILED blocks, 1119
passed**. Unrelated to plan 151, and the round-1 note stands — real-tmux suites in this repo do not
tolerate a second concurrent cargo process.

## Round 2 commands

```bash
git worktree add --detach …/pij-worktrees/s151-r2 12bdcfc1 && node harness/scripts/worktree-deps.mjs
cargo test -p pij-daemon --lib -- --test-threads=1                    # 398/0 baseline
# F1a, F1b, M3, M4 applied one at a time, source restored between each
# HOLD_ESCALATION_MS=0 and the notice-threshold-only mutant, restored after each
node --test .copilot/extensions/pij/*.test.mjs                        # 230/227/0/3
cargo test --workspace --no-fail-fast -- --test-threads=1             # 88 suites, 1119 passed
cargo clippy --workspace --all-targets -- -D warnings                 # exit 0
cargo fmt --all --check                                               # exit 0
```

The round-2 worktree was restored clean (`git status --porcelain` empty; `registration.rs` and
`store.mjs` byte-identical to `12bdcfc1`) and removed. No production daemon or registry was touched
in either round.
