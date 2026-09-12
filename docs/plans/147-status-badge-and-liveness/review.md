# Review — plan 147: status badge + `last_event_at` on the roster row

Reviewer: pij-shocked-zebra. Branch `147-status-badge-and-liveness` @ `ad5c6589` vs `main` (`dd5b61fa`).
Probes ran in a throwaway detached worktree at `/Users/jordanknight/pi-hacking/pij-worktrees/s147-review`
(`git worktree add --detach … ad5c6589`), worktree-local `CARGO_TARGET_DIR`, `RUST_TEST_THREADS=1`.
The production daemon on `127.0.0.1:7461` was never contacted — no read verb, no mutation.

## Verdict: **APPROVE-WITH-FIXES**

The contract itself is honest and correctly shaped. The 15-word order and spellings are byte-exact
against the TS original, the badge genuinely never consults liveness on either surface, worst-first
over open assignments is right and is pinned, roster liveness is correctly absent rather than
all-unknown, and **every row of the per-value reachability table is true** — the artifact most likely
to over-claim does not. What holds the verdict short of APPROVE is one consumer-visible control
defect (F1), one deleted control unrelated to this plan (F2), and three claims in `report.md` that
are implemented but not pinned by any test (F3–F5), one of which I proved by reverting.

What would make this a REJECT: if F1 were judged to put a self-contradicting payload in front of
chainglass — `semanticState: null` beside `badge: "blocked"` on the same card, with the consumer
contractually forbidden from re-deriving. I judge it fixable-in-place because the badge value is
*defensible* (the assignment declaration really does still stand); the defect is that `clear` is
advertised as the way out and is not.

## Independent gate re-run (my run, at `ad5c6589`, clean tree)

| Gate | Result |
|---|---|
| `cargo test --workspace` | **exit 0**, 2m31s |
| `cargo fmt --all --check` | **exit 0** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0** |
| Targeted baseline `-p pij-core -p pij-store --test status`, `-p pij-daemon --test status_http --test report_http` | 4 + 2 + 1 + 29 passed |

`report.md`'s gate claims reproduce. No masked failure found.

---

## 1. Per-value honesty table — checked per value, against code

Verdict: **the table at `docs/how/pij-rs-api.md:220-236` is honest for all 15 values.** This was the
packet's highest-risk artifact and it survives. Method: mechanical axis — every writer of
`SystemState` in the workspace (`grep -rn "SystemState::" --include=*.rs crates/`); semantic axis —
the parser at `crates/daemon/src/http/report.rs:302-304` plus the badge inputs at
`crates/store/src/status.rs:49-51,123-124`.

| Value | Doc claim | Verified | Evidence |
|---|---|---|---|
| `dead` | not reported by the badge | ✅ | `SystemState::Dead` has **no writer at all** — the only non-test writes of `state` are `delivery.rs:352,362` (in `mod tests`) and `model.rs:502` (`new` → `Idle`). Registration builds the row at `http/mod.rs:1048` via `SeatDescriptor::new`; no request field can set `state`. Tombstoning does not touch it (`status.rs` test asserts the retained card keeps `blocked`, not `dead`). |
| `failed` | reachable via `report state failed` | ✅ | `RS_STATE_WORDS` (`report.rs:33`) + `crates/daemon/tests/report_http.rs:443` asserts HTTP 200, `semanticState=="failed"` on the card, and persistence across `build_services` reopen. |
| `stalled` | not reachable (148) | ✅ | no writer; requires `working` first, which has none. |
| `blocked` | reachable | ✅ | `report_http.rs:403` word loop; badge path proven at `crates/store/tests/status.rs:24`. |
| `question` | reachable | ✅ | same loop. |
| `hold` | reachable | ✅ | same loop. |
| `stopped` | not reachable | ✅ | no writer. |
| `unknown` | "not currently produced by their normal badge path" | ✅ | `SeatStatus::badge()` always passes `Some(self.seat.state)` (`status.rs:50`), so the `None`-sentinel branch at `crates/core/src/status.rs:40-41` is unreachable from a row; and `SystemState::Unknown` itself has no writer. The hedge is precisely correct — the generic sentence at `pij-rs-api.md:216` ("No inputs means `unknown`") would over-claim on its own; row 8 repairs it. |
| `waiting` | reachable | ✅ | word loop. |
| `starting` | not reachable (148) | ✅ | no writer. |
| `working` | not reachable (148) | ✅ | **confirmed independently** — every `SystemState::Working` assignment in the workspace is inside a test module (`delivery.rs:352`, `http/tests.rs:534,584,5265`, `delivery/mod.rs:3341`). `delivery/mod.rs:942` only *reads* it. |
| `ready` | reachable | ✅ | word loop. |
| `cancelled` | reachable via `report state cancelled` | ✅ | `report_http.rs:443`, same assertions as `failed`. |
| `done` | reachable while its assignment is open, or unscoped | ✅ | exactly what `status.rs:19-26,123-124` implements; `crates/store/tests/status.rs:33-36` shows it surviving as the open-assignment declaration. |
| `idle` | stored default for all five harnesses, means *not observed* | ✅ | `model.rs:502`. |

No value is documented reachable that cannot occur, and none documented unreachable that can.

## 2. Badge does not consult liveness; one function, but not one input path

**The shared function is real.** `pij_core::status::badge_of` (`crates/core/src/status.rs:35`) is the
only definition; it takes no liveness argument and cannot. Both surfaces obtain their string from the
same `SeatStatus::into_projection()` (`crates/store/src/status.rs:54-58`) fed by the same
`SqliteStatus::read` — roster at `crates/daemon/src/http/mod.rs:2406-2417`, card at `2127-2136`. The
card's `Liveness` probe (`mod.rs:2159-2166`) is computed *after* and never reaches `badge_of`.
`project_seat` (`http/role.rs:234-237`) mutates in place, so the projected badge survives the role join.

**But the card keeps a second derivation over different inputs** — `mod.rs:2255-2257`:

```rust
let badge = seat.badge.unwrap_or_else(|| {
    badge_of(Some(seat.state), seat.semantic_state.as_slice()).to_string()
});
```

The fallback ignores open-assignment declarations entirely. It is unreachable today (the only caller
of `state_card` is `mod.rs:2197`, always fed by `into_projection`), and it exists for federated rows.
That makes it defensible in principle — see F3 for why nothing keeps it that way.

## 3. Severity-table exhaustiveness — proven RED, with one gap

**Direction A (a vocabulary value gains no severity slot): pinned, and stronger than a test.** Adding
a synthetic `SystemState::Suspended` in the throwaway worktree does not merely fail a test, it fails
to **compile**:

```
error[E0004]: non-exhaustive patterns: `SystemState::Suspended` not covered
   --> crates/core/src/status.rs:50:11
error[E0004]: non-exhaustive patterns: `SystemState::Suspended` not covered
   --> crates/core/src/model.rs:113:15
error: could not compile `pij-core` (lib) due to 2 previous errors
```

The duplicated rank tables at `crates/core/tests/status.rs:52-74` give the same guarantee a second
time. AC1's pinning claim holds.

**Direction B (a severity slot that is not in the published vocabulary) is unguarded — see F5.**

## 4. Multi-assignment worst-first, zero assignments, closed assignments

- **Worst-first, ported.** `BADGE_SEVERITY` (`crates/core/src/status.rs:13-29`) is byte-identical in
  order and spelling to `.pi/extensions/pij/core/state.ts:133-149`. `badge_of` selects the minimum
  rank, so declaration order cannot matter — and `crates/core/tests/status.rs:100-113` proves it by
  asserting every ordered pair in both orders.
- **`done` on A + `blocked` on B ⇒ `blocked`**: `crates/core/tests/status.rs:79-85` (pure) and
  `crates/store/tests/status.rs:24` (through SQL, with two real `task_assignments` rows).
- **Zero assignments** ⇒ the badge falls back to the mechanical state (`idle`), never `unknown`,
  because `SeatStatus::badge()` always supplies `Some(state)`. Correct, and row 8 of the doc says so.
- **A closed assignment must not contribute** — implemented at `crates/store/src/status.rs:25`
  (`AND assignment.closed_at IS NULL`) and **pinned**: removing that clause turns
  `roster_badge_includes_every_open_assignment_but_not_closed_declarations` RED
  (`left: "blocked", right: "done"`).

## 5. Old rows read back

Serde defaults: `crates/core/src/model.rs:338-342` — both new fields are
`#[serde(default, skip_serializing)]`, so a pre-147 descriptor JSON decodes to `None`/`None` and a raw
descriptor never re-serializes them. `StateRecord` (`crates/core/src/report.rs:46-59`) is structurally
unchanged; the two new words are additive to `SemanticState`.

Committed test that loads a pre-147 payload: `crates/store/tests/status.rs:47-57` inserts a raw
`seats` row by SQL (no events, legacy `semantic_state='blocked'`) and asserts `last_event_at == None`,
`badge() == "blocked"`. `crates/core/tests/status.rs:122-131` decodes the six legacy wire words.

I verified the three decode paths directly with a throwaway `serde_json` probe (pre-147 row → `None`;
federated row carrying `badge`/`last_event_at` → retained; re-serialization drops both). All three
behave as documented — but see F4: no committed test covers the federated retention half.

## 6. The timing claim — re-derived, and the headline hides the growth term

**The baseline reproduces; the "after" number is fixture-specific.** I rebuilt a 91-seat fixture
(one open assignment per seat with a scoped `report.state`, plus filler card events), 10 warmups,
100 interleaved samples, debug build, same measurement boundary as `report.md`:

| Fixture | before (`SqliteRegistry::list`) median | after (`SqliteStatus::read`) median | ratio |
|---|---:|---:|---:|
| `report.md` claim, 91 seats / 2921 events | 1.106 ms | 2.500 ms | 2.26× |
| mine, 91 seats / 2912 events, 1 open assignment **per seat** | 1.071 ms | **3.563 ms** | **3.33×** |
| mine, 91 seats / **18 200** events (200/seat) | 1.063 ms | **13.517 ms** | **12.71×** |
| same, plus `CREATE INDEX spine_by_seat_kind ON spine_events (seat, kind, seq)` | 1.031 ms | **1.963 ms** | 1.90× |

**Is the work in the query or in a per-row loop? In the query.** One `sqlx::query(...).fetch_all(...)`
(`crates/store/src/status.rs:98-103`), one round trip, no application-level fan-out and no per-seat
call. AC5's letter and the consumer's ban are satisfied, and the 80s precedent does not apply.

**But the growth term is per-seat event history, and `report.md` does not name it.** Plan:

```
|--SCAN seats USING INDEX sqlite_autoindex_seats_1
|--CORRELATED SCALAR SUBQUERY 1  `--SEARCH spine_events USING INDEX spine_by_seat (seat=?)
|--CORRELATED SCALAR SUBQUERY 2  `--SEARCH spine_events USING INDEX spine_by_seat (seat=?)
`--CORRELATED SCALAR SUBQUERY 4  |--SEARCH assignment USING INDEX task_assignments_by_node (node_id=?)
                                 |--SEARCH event USING INTEGER PRIMARY KEY (rowid=?)
                                 `--CORRELATED SCALAR SUBQUERY 3
                                    `--SEARCH spine_events USING INDEX spine_by_seat (seat=?)
```

Everything is index-driven — but `spine_by_seat` is `(seat, seq)` (`migrations/0001_init.sql:51`) and
subqueries 2 and 3 filter on `kind='report.state'` and on a `json_extract`ed `assignment_id`, neither
of which the index covers. So each walks that seat's event slice backwards until it hits a match.
Cost is `O(seats × per-seat history scanned)`, not `O(seats)`, and the fixture's 32 events/seat is
what makes 2.5 ms look like the answer. The three-line index above removes the term (12.7× → 1.9×).
Ranked below as F6 — it obscures a real operating cost, but it degrades nothing today.

## 7. `failed` / `cancelled` and the `unsupported` array

- **Reachable**: `crates/daemon/tests/report_http.rs:443-471` — 200 on `report state failed` and
  `cancelled`, card `semanticState` matches, and the value survives a `build_services` reopen.
  `report now --state` shares the same parser (`report.rs:45`). CLI help updated
  (`crates/cli/src/main.rs:317`).
- **Refused where they should be**: both are non-nudgeable
  (`crates/core/src/model.rs:211-212`, pinned at `core/tests/core_unit_exemplar.rs:45-46` and
  `core/tests/watchdog.rs:46-47`), and they were correctly removed from the route-absence refusal
  corpus at `report_http.rs:609-611` because they are no longer refusals. rs now covers all eight TS
  words at `.pi/extensions/pij/core/types.ts:110-119` — **no TS-only word remains**, so deleting
  `TS_ONLY_STATES` is right.
- **The `unsupported` array no longer claims anything made real**: `lastEventAt` is gone from
  `unsupported_state_fields()` (`http/mod.rs:2323-2345`) and from the card contract test
  (`crates/daemon/src/http/tests.rs:5497-5500`), and `status_http.rs:83-93` asserts neither `lastEventAt` nor
  `last_event_at` appears there. Nothing else in the list was made real. ✅
- One naming seam, low severity: the emitted key is `last_event_at` while the legacy TS field is
  `lastEventAt`, and `lastEventAt` no longer appears in `unsupported` either. A legacy consumer keyed
  on the camelCase name now gets silence instead of a named gap. The plan froze the snake_case
  spelling and chainglass maps it, so this is acceptable — but it is the one place where removing an
  `unsupported` entry slightly outran what was actually supplied.

## 8. AC → the test that goes RED

| AC | Test that fails if the behaviour is removed | Status |
|---|---|---|
| AC1 order/spelling/exhaustive | `core/tests/status.rs:5` `badge_severity_is_the_exact_closed_vocabulary` | ✅ **proved RED** |
| AC1 worst-first over assignments | `core/tests/status.rs:78` `badge_chooses_the_worst_of_multiple_open_assignments` | ✅ **proved RED** |
| AC1 no-candidates ⇒ `unknown` | `core/tests/status.rs:118` | ✅ |
| AC4 `failed`/`cancelled` | `daemon/tests/report_http.rs:443` | ✅ (coder's RED: HTTP 400, exit 101) |
| AC4 non-nudgeable | `core/tests/watchdog.rs:46`, `core_unit_exemplar.rs:45` | ✅ |
| AC5 `last_event_at` on both surfaces | `daemon/tests/status_http.rs:75-79` | ✅ |
| AC5 roster liveness absent | `daemon/tests/status_http.rs:77` `assert!(row.get("liveness").is_none())` | ✅ |
| AC5 no per-row fan-out | — (no test; single `fetch_all` by construction) | ⚠️ structural only |
| AC6 one citable vocabulary | `core/tests/status.rs:5` for the badge order | ⚠️ semantic vocabulary unpinned — F2 |
| AC7 closed assignment excluded | `store/tests/status.rs:27-36` | ✅ **proved RED** |
| AC7 legacy rows read back | `store/tests/status.rs:47` | ✅ |
| AC7 roster/card agreement | `daemon/tests/status_http.rs:9` | ❌ **does not go RED — F3** |
| AC7 closed-declaration guard | — | ❌ **no test — F4** |
| AC3a/AC9 doc table | — (documentation) | acceptable |

### Revert proof 1 — worst-first ordering: **RED, as required**

`crates/core/src/status.rs:38`, `worst.min(...)` → `worst.max(...)`:

```
---- badge_chooses_the_worst_of_multiple_open_assignments ----
assertion `left == right` failed   left: "idle"    right: "blocked"
---- badge_severity_is_the_exact_closed_vocabulary ----
assertion `left == right` failed   left: "unknown" right: "failed"
test result: FAILED. 2 passed; 2 failed
```

### Revert proof 2 — roster/card agreement: **stays GREEN**

Replacing the card's `seat.badge.unwrap_or_else(…)` at `mod.rs:2255-2257` with the unconditional
descriptor-only derivation — i.e. removing exactly the behaviour "the card badge is the roster badge,
including open assignments" — leaves the whole daemon package green:

```
cargo test -p pij-daemon --test status_http
test roster_and_card_share_badge_and_freshness_without_inventing_roster_liveness ... ok
cargo test -p pij-daemon      → exit 0 (full package, 1m09s)
```

Cause: the one cross-surface test sets `seat.semantic_state = Blocked` on the descriptor and creates
**no assignments**, so the projected badge and the fallback badge are both `"blocked"`. The test
proves the two surfaces print the same string; it does not prove they compute it the same way. The
coder's live `evidence.json` *does* discriminate (`semanticState: null` with `badge: "blocked"` on
`pij-bench-000`) — but evidence.json is not a gate.

---

## Findings, ranked

### Degrades a control

**F1 — `pij report clear` cannot clear what the badge shows, and the card then contradicts itself.**
`crates/store/src/status.rs:123-124` admits the descriptor's declaration only when the latest
`report.state` event is unscoped. `report clear` writes `state: None` with `assignment_id: None`
(`crates/core/src/report.rs:192-193,253-261`), which clears the descriptor but matches no assignment,
so the open assignment's last scoped declaration still drives the badge. `report clear` takes no
`--assignment` (`report.rs:118-122` rejects every flag), so there is **no operator path** to clear a
scoped declaration short of closing the assignment or declaring a different state on it. Proved:

```
badge after clear = blocked
assertion failed: EXPECTED by a consumer: clear clears the badge
  left: "blocked"   right: "idle"     (descriptor semantic_state == None at the same instant)
```

The mirror case is also real: close the last open assignment and the card carries
`semanticState: "blocked"` with `badge: "idle"` (verified). Either way the consumer receives two
fields that disagree, and is contractually forbidden from re-deriving the one it can check.
**Fix**: give `report clear` an `--assignment` (or make unscoped clear supersede scoped declarations),
and until then say in `pij-rs-api.md` § State card and badge vocabulary that `semantic_state` and
`badge` answer different questions and may disagree, naming both directions.

**F2 — an existing control was deleted for no reason this plan required.**
`crates/daemon/src/http/tests.rs` lost the assertion that every `unsupported` entry carries a
non-empty `why`:

```rust
// Every named gap carries a reason; a bare list of names is not an answer.
for entry in card["unsupported"].as_array().expect("unsupported list") {
    assert!(!entry["why"].as_str().expect("why").trim().is_empty(),
        "an unsupported field with no reason is a gap nobody can act on");
}
```

`grep -rn '\["why"\]' --include=*.rs crates/` now returns nothing. AC9 asked only to remove entries
made real; the loop was orthogonal and would have kept passing. Restore it.
Related and same fix-site: the semantic vocabulary now exists in three hand-maintained copies —
`SemanticState` (`model.rs:143-160`), `RS_STATE_WORDS` (`report.rs:33`) and the CLI help string
(`cli/src/main.rs:317`) — and the deleted test at `report_http.rs` was the **only** thing asserting
the refusal text listed the real vocabulary. AC6 says "one vocabulary, one definition, citable";
that is now true of `BADGE_SEVERITY` and false of the semantic words.

### Obscures information

**F3 — the roster/card agreement AC is not pinned (revert proof 2 above).** The assertion that
matters is agreement *when the two inputs differ*. Add an open assignment with a declaration that
differs from the descriptor's `semantic_state` to `status_http.rs` — with the projection the card
reads the assignment's word, with the fallback it reads the descriptor's, and the test discriminates.
Alternatively delete the `unwrap_or_else` fallback on the local path so a missing projected badge is
a loud error rather than a quiet second definition.

**F4 — the closing guard is load-bearing and untested.** Deleting the `latest_assignment_id.is_none()`
condition at `crates/store/src/status.rs:123` — the line whose comment says "A scoped declaration must
not survive closing its assignment simply because the legacy single-state descriptor still contains
that word" — leaves `-p pij-store --test status` (2 passed), `--test status_http` (1 passed) and
`--test report_http` (29 passed) **all green**. The existing store test can't discriminate: its
descriptor state is `Done`, the same word as the surviving open declaration. `report.md:8` claims this
behaviour as delivered ("Closed assignment declarations do not leak through the legacy single-state
descriptor") and `report.md:75` claims it as an encoded regression; neither is true yet. Fix: declare
`blocked` scoped to one assignment, close it, assert the badge is `idle` and not `blocked`.

**F5 — a severity slot outside the published vocabulary silently badges `unknown`.** The sentinel in
`badge_of` is `BADGE_SEVERITY.len()` (`crates/core/src/status.rs:36,40`), and the vocabulary test only
walks array → enum (`core/tests/status.rs:26-46`), never enum → array. A new variant given rank 15 in
both rank tables but not added to `BADGE_SEVERITY` compiles, passes all four tests, and makes
`badge_of(Some(state), &[])` return `"unknown"` — a wrong answer where the compile error in direction A
gave a loud one. Proved in the throwaway (`4 passed`, then
`assert_eq!(badge_of(Some(SystemState::Suspended), &[]), "unknown")` passing). Fix: assert every enum
variant's `as_str()` appears in `BADGE_SEVERITY`, and make the sentinel `usize::MAX`.

**F6 — the timing claim understates the cost and omits its growth term** (§6). `1.106 → 2.500 ms` is
true of that fixture only; with one open assignment per seat I measure `1.071 → 3.563 ms`, and at 200
events/seat `1.063 → 13.517 ms`. Fix: state the assignment density and per-seat history the number was
measured at, and add
`CREATE INDEX spine_by_seat_kind ON spine_events (seat, kind, seq)` — I measured it taking the deep
case back to `1.963 ms` (1.9×).

**F7 — cited parity evidence is stale.** `docs/how/pij-rs-api.md:201` points at
`crates/testkit/fixtures/golden/api/governance-client-parity.json` as the retained byte-equal
native/shim roster capture. Its captured rows predate 147 and carry no `badge` / `last_event_at`, so
the artifact no longer shows the shipped row shape. Nothing consumes the file from Rust
(`grep -rn "governance-client-parity" --include=*.rs crates/` → no hits), so it is documentation, not
a gate — but a reader following the citation sees the old contract. Re-capture or annotate.

**F8 — federated badge retention is designed but untested.** `model.rs:336-337` and `report.md:88`
claim a current remote daemon's badge is retained and not re-derived. The mechanism is right —
`fanin.rs:246-247,284-286` decodes peer rows straight into `Vec<SeatDescriptor>`, where
`#[serde(default)]` picks `badge`/`last_event_at` off the flattened remote row, and `skip_serializing`
stops a raw descriptor ever re-emitting them. I verified all three legs by hand. No committed test
covers it; the asymmetric `default` + `skip_serializing` pair is exactly the kind of attribute a
future refactor "tidies".

---

## Not findings (checked, and correct)

- Replacing `registry.list(SeatFilter::default())` with `TABLE_QUERY` does not change the row set:
  the default filter compiles to `SELECT * FROM seats ORDER BY id` (`registry.rs:390-404`) and the
  status source is `SELECT *, NULL AS descriptor FROM seats` with the same ordering.
- Tombstone exclusion still happens at the projection (`http/mod.rs:2437-2438`), unchanged.
- `last_event_at` follows `ORDER BY seq DESC`, not `MAX(at)` — matching the documented sentence at
  `pij-rs-api.md:208-209`, and correct given clocks are caller-supplied.
- `badge` is `skip_serializing_if = "Option::is_none"` on the wire while `last_event_at` always
  serializes — deliberate and documented: an older peer's absent badge is omission, an absent event is
  `null`.
- `row_to_descriptor` still refuses an unrecognised `state` word (`registry.rs:140`); widening the
  accepted set to the seven-word enum is the port, not a weakened guard.
- No `.ts` file changed, and no zod schema in `.pi/extensions/pij/` is `.strict()`, so the two additive
  keys cannot break a TS consumer.

## Prime-owned / unverified here

Production and chainglass rendering. The coder's isolated-daemon run on `127.0.0.1:51202` is recorded
in `evidence.json`; I did not re-run it and did not touch `127.0.0.1:7461`. The `harness checks`
composite (vitest, smoke, package audit, snapshots) is likewise the coder's receipt — I independently
re-ran only the Rust gates, which pass.

---

# Round 2 — fix verification (`9b089a59`)

Verification pass, not a fresh review. Scope: did each fix do what it claims, and did it break
anything on the way. Probes ran in a fresh throwaway detached worktree at
`/Users/jordanknight/pi-hacking/pij-worktrees/s147-rr` (`ad5c6589`→`9b089a59`), worktree-local
`CARGO_TARGET_DIR`, `RUST_TEST_THREADS=1`. The live daemon on `127.0.0.1:7461` was never contacted;
the one probe that needed real data used a `VACUUM INTO` snapshot copy of
`~/.pij-rs/pij.sqlite`, never the file itself.

## Verdict: **VERIFIED 9b089a59**

All eight findings are fixed, and the three I had proved by revert now go RED for the reason claimed
rather than by accident of a new fixture. No regression found. Two of the fixes are materially better
than what I asked for: the F1 escape hatch is pinned end-to-end through the real CLI against a
migrated copy of the original proof store, and the F5 fix catches a *wrong* rank, not merely a
missing one. One new measurement changes how the index should be read — see "Index cost, measured"
below: at real store scale the index is not an optimisation, it is what keeps plan 147 shippable.

## 1. My own mutants, re-applied to the fixed tree

| Mutant | Before (`ad5c6589`) | After (`9b089a59`) | Discriminates for the right reason? |
|---|---|---|---|
| **F3** — card re-derives instead of using the projected badge (`http/mod.rs:2255-2257` → unconditional `badge_of`) | GREEN (whole `-p pij-daemon` suite) | **RED**, `left: "done"` / `right: "blocked"` | ✅ Yes. The fixture now sets descriptor `semantic_state = Done` and declares `blocked` **scoped to an open assignment**, so the projection (worst over assignments) and the descriptor-only fallback give genuinely different words. This is the discriminating case I asked for, not a renamed assertion. |
| **F4** — drop the `latest_assignment_id.is_none()` guard (`store/src/status.rs:123`) | GREEN (`-p pij-store --test status`, `status_http`, `report_http`) | **RED**, `left: "blocked"` / `right: "idle"`, message "closed scope must not fall back to its stale descriptor word" | ✅ Yes. `closing_last_assignment_does_not_resurrect_descriptor_declaration` declares `blocked` scoped to `task`, asserts the badge, then closes the assignment and asserts `row.seat.semantic_state == Some(Blocked)` **and** `badge() == "idle"` — it pins the contradiction explicitly rather than relying on the two words differing. |
| **F5** — synthetic `SystemState::Suspended` with rank 15, absent from `BADGE_SEVERITY` | GREEN; `badge_of` silently returned `"unknown"` | **RED**, `every_state_has_a_published_badge_slot` panics: `Suspended has no published badge slot` | ✅ Yes, and the characterisation is right — see below. |

**The F5 "compile error was setup noise" claim checks out.** In round 1 the E0004 non-exhaustive-match
errors at `model.rs:113` and `status.rs:50` were what you hit *before* giving the variant a rank; they
are the cost of introducing the variant at all, so they cannot witness the vocabulary gap. My round-1
probe supplied the rank to both tables precisely to get past them, and only then observed the silent
`"unknown"`. On the fixed tree the same fully-ranked variant compiles and **fails a test**, so the
guard is now the assertion and not the type checker. Not counting the compile error as the witness is
correct.

The new test is stronger than the fix I proposed. I asked for membership
(`BADGE_SEVERITY.contains(state.as_str())`); it also asserts
`badge_of(Some(state), &[]) == state.as_str()` for every variant of both enums, so a variant given the
*wrong* rank — pointing at another word's slot, which membership alone would pass — also fails. The
`usize::MAX` sentinel additionally turns an out-of-range rank into a panic rather than a wrong answer.

## 2. The vocabulary macro (F2) — wire compatibility proven byte-for-byte

This was the largest unrequested change and the one with real blast radius: `SystemState` and
`SemanticState` are encoded by every stored descriptor and every `report.state` spine payload, and the
macro adds a per-variant `#[serde(rename = …)]` alongside the container `rename_all`.

I did not reason about serde attribute precedence — I measured it. A probe enumerating all 15 variants
explicitly (so it compiles unchanged at both SHAs, using no macro-introduced item) dumps
`serde_json` encode, decode round-trip, `as_str`, `parse`, and `nudgeable`, plus seven near-miss words
that must stay refusals. Run at `9b089a59`, then `git checkout e3f99483`, run again, `diff`:

```
== DIFF before vs after ==
WIRE-IDENTICAL
```

All 15 spellings identical (`idle`…`unknown`, `ready`…`cancelled`), all round-trips true, `parse`
agrees with `as_str` on every variant, `nudgeable` unchanged (`Ready` alone true). Refusals hold on
**both** codecs and **both** axes for `"Idle"`, `"IDLE"`, `"busy"`, `""`, `" idle"`, `"cancel"`,
`"fail"` — so the macro did not quietly acquire case-insensitivity or an alias. `row_to_descriptor`'s
refusal (`registry.rs:139-144`) is textually unchanged and still routes through the same `parse`, so
the round-1 validation stands.

`SemanticState::WORDS` expands to the same string the deleted `RS_STATE_WORDS` held, and
`semantic_words_match_every_declared_variant` now pins the enum and the published list together —
which is what AC6 asked for and round 1 said was false. The three hand-maintained copies are down to
one definition: daemon refusal text, CLI `after_long_help` and the test all read `WORDS`.

One residual, explicitly minor: the new test compares `WORDS` as a `BTreeSet`, so reordering the enum
would change the refusal string's word order undetected. Cosmetic — the order carries no meaning and
`BADGE_SEVERITY` (which does) is pinned exactly. Not worth a change.

## 3. Index cost, measured — the number nobody had

The coder declined to claim anything about index write or storage cost. Both fixture sets are
synthetic; neither is production. I measured all three on a `VACUUM INTO` snapshot of the **real**
store — 1078 seats, 35 260 spine events, 0 open assignments, `user_version` 19 migrating to 20 on
open. Debug build (matching the coder's methodology), 30 interleaved read samples after 5 warmups,
1000 timed `SqliteSpine::append` calls per case, and the whole present/absent cycle run **twice** to
cancel drift:

| Index | `SqliteRegistry::list` median | `SqliteStatus::read` median | `read` p95 | `spine.append` median | append p95 |
|---|---:|---:|---:|---:|---:|
| present (pass 1) | 13.359 ms | **19.972 ms** | 28.656 ms | 0.1530 ms | 0.1959 ms |
| absent (pass 1) | 14.112 ms | **70.235 ms** | 74.174 ms | 0.1967 ms | 0.3956 ms |
| present (pass 2) | 13.361 ms | **20.606 ms** | 25.453 ms | 0.1509 ms | 0.2166 ms |
| absent (pass 2) | 14.148 ms | **69.545 ms** | 73.258 ms | 0.1479 ms | 0.1892 ms |

**Write cost: below measurement noise. Acceptable.** The append medians are 0.1530 / 0.1509 with the
index and 0.1967 / 0.1479 without — the *between-pass* spread in the index-absent case (33%) is larger
than any difference between the cases, and the two cases interleave rather than separate. The append
is dominated by its transaction and WAL fsync, not by B-tree maintenance; a second three-column index
on a table of this width does not move it. This is the answer to the open question, and it is the
permissive one.

**Storage cost: 1.71 MiB on a 27.8 MiB store, 6.2%.** (`SELECT SUM(pgsize) FROM dbstat` — 1 798 144
bytes for `spine_by_seat_kind`, against 1 171 456 for the existing `spine_by_seat`; larger because it
carries `kind`.) It grows with the spine, which is append-only and unpruned — worth a line in the
retention conversation (#204), not a blocker here.

**Read: the index is load-bearing, not an optimisation.** At real scale the delivered `ad5c6589`
roster read is **70 ms** against a 13 ms baseline — 5.3×, +56 ms on a read chainglass runs every 8 s.
With the index it is 20 ms, 1.5×, +6.6 ms. So the fix did not merely tidy my F6 finding; without it
plan 147 ships a 5× regression on the real store, and neither the 2.5 ms headline nor my own 3.5 ms
reviewer number was anywhere near that. Note that production currently has **zero** open assignments,
so the entire 70 ms is the per-seat last-event and last-state subqueries over 35 k events — the growth
term is seat count × per-seat history, exactly what the index addresses, and exactly what the
assignment-shaped fixtures could not show. **Recommend this measurement be carried into the report**;
it is the strongest available argument for the migration.

## 4. Migration safety — an older binary refuses cleanly

Forward: `fix-cli-smoke.json` records a real `source_schema_version: 19` → `migrated_schema_version:
20` on daemon boot against a private backup of the original proof store, `production_contact: false`.

Backward — the case the packet cares about, tested with a genuinely older binary (the globally
installed `pij-rs`, which speaks v19) pointed at a v20 store copy:

```
$ PIJ_RS_STATE_DIR=/tmp/rr-old-state pij-rs daemon --bind 127.0.0.1:51999
pij-rs: store schema is v20 but this binary speaks v19 — /tmp/rr-old-state/pij.sqlite was written by
a NEWER pij than this binary — upgrade pij (or point PIJ_STORE at a different file); this build will
not guess at a schema it does not know
EXIT=1
```

**Refuses decodably, names both versions and the remedy, exits 1, and leaves the store untouched**
(`PRAGMA integrity_check` → `ok`, `user_version` still 20, 35 260 events unchanged). That is the
`StoreSchemaStale` contract at `migrate.rs:103-111` behaving as documented, and it is the right answer:
a prime who bounces production onto this and needs to roll back gets a refusal, not corruption.

Note for whoever schedules the bounce: `0020` ships no `.down.sql`, so rollback is
restore-from-backup, not migrate-down. Correct for an additive index — `DROP INDEX` is the whole
inverse and an operator can issue it — but it should be said out loud in the bounce plan rather than
discovered.

## 5. F1's new surface — same resolution path, both directions documented

- **Not a second implementation.** `report clear --assignment` calls
  `decisions.validate_report_assignment` (`http/mod.rs:2864`) — the identical function `report state
  --assignment` calls at `http/mod.rs:2836`, defined once at `decisions.rs:63`. Both refusals come
  from that one body.
- **Both refusals pinned for `clear`**: `assignment_refusals_name_owner_and_leave_state_and_questions_untouched`
  (`report_http.rs:1354`) drives `["report","clear","--assignment", …]` through both
  `E-RS-ASSIGNMENT-NOT-YOURS` and `E-RS-ASSIGNMENT-UNKNOWN`, and asserts state and questions are left
  untouched.
- **Unscoped clear unchanged**, and the test proves it by asserting the defect I reported:
  `scoped_report_clear_removes_only_its_assignment_declaration` (`report_http.rs:1295`) checks
  `semanticState` is null while `badge == "blocked"` — "unscoped clear leaves task testimony intact" —
  *then* clears with `--assignment` and gets `idle`, *then* asserts `closed_at` is still null so
  "clear is not task closure". That single test encodes the finding, the escape hatch, and the
  boundary.
- **Proven through the real CLI, not just HTTP**: `fix-cli-smoke.json` walks
  `state` → `clear --assignment blocked-task` → `state` → `clear --assignment done-task` → `state`,
  and the badge moves `blocked` → `done` → `idle` with `assignments_still_open: 2` throughout. That is
  the operator path I said did not exist, exercised end to end.
- **Docs name both directions** (`pij-rs-api.md`, new paragraph after the badge vocabulary): unscoped
  clear leaving `semanticState: null` beside `badge: "blocked"`, *and* closing the assignment leaving
  `semanticState: "blocked"` beside `badge: "idle"`. Both of the cases I found are stated, with the
  reason they answer different questions.

## 6. F6/F7 honesty

**The density correction is right, and it is confirmed by retained receipts rather than assertion.**
`fix-cli-smoke.json` records `assignments_still_open: 2` on the original proof store, and its steps
name both of them — `blocked-task` and `done-task`, both on `pij-bench-000`. So the original fixture
really did have 2 open assignments on 1 of 91 seats; the remaining 90 had none. The event arithmetic
in the report is self-consistent too (89×32 + 34 + 36 + 3 = 2921 = the retained `fixture_events`).
This corrects **against** the coder and **in my favour**: the `1.106 → 2.500 ms` headline was measured
where 90 of 91 seats did no assignment work at all, so it understated the shipped cost by more than my
round-1 note claimed. Correctly reported.

**F7 relabelling is sufficient.** The `governance-client-parity.json` citation now says in the text
that the capture **predates plan 147**, that its rows carry neither `badge` nor `last_event_at`, what
it does still prove (folder-filter/argument and native/shim byte parity), and where the current row
shape lives instead. A reader cannot now take it for the current contract.

**F8** is covered by `peer_status_metadata_decodes_but_raw_descriptors_never_emit_it`
(`core/tests/status.rs`), which asserts the pre-147 peer row decodes to `None`/`None`, the current
peer row retains both, and a raw descriptor re-serializes neither — the three legs I verified by hand
in round 1, now committed.

**F2's restored control** is back verbatim at `crates/daemon/src/http/tests.rs:5518-5525`, including
the original reason string.

## 7. Gates — my independent re-run at `9b089a59`

| Gate | Result |
|---|---|
| `cargo test --workspace` | **exit 0**, 2m47s, no `FAILED`, no `failures:` |
| `cargo fmt --all --check` | **FMT-OK** |
| `cargo clippy --workspace --all-targets -- -D warnings` | **exit 0** |
| Targeted: `-p pij-core -p pij-store --test status`, `-p pij-daemon --test status_http --test report_http` | 7 + 3 + 1 + 30 passed |

Test counts moved as expected: `core/tests/status.rs` 4 → 7 (`every_state_has_a_published_badge_slot`,
`semantic_words_match_every_declared_variant`, `peer_status_metadata_decodes_but_raw_descriptors_never_emit_it`),
`store/tests/status.rs` 2 → 3, `report_http` 29 → 30. Per the packet I spot-checked rather than
re-running `just self-check`, and I did not re-verify the `pi-askuserquestion` audit finding, which
prime confirmed is pre-existing on main.

All probe files were deleted and the throwaway worktree left clean (`git status --porcelain` empty)
before this addendum was written.

## Nothing carried forward

No finding from round 1 remains open, and round 2 introduced none. The only items I would hand to
whoever bounces production are operational, not defects: carry the real-store index numbers into the
report, say in the bounce plan that `0020` rolls back by restore rather than by migrate-down, and let
the 1.71 MiB index join the spine-retention conversation.
