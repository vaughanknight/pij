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
