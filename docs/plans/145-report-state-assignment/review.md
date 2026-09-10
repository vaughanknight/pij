# Review — plan 145 (`report state|blocked|question --assignment/--refs` on rs)

Reviewer: `pij-gratifying-perosteck`. Prime: `pij-minor-unicorn`.
HEAD reviewed: `79af8508` against main `a0acf9ac`. Branch `145-report-state-assignment`.
Rust via `~/.cargo/bin/cargo`. Production daemon (127.0.0.1:7461) never contacted.
All mutation probes ran in a throwaway worktree `/tmp/145-probe` (detached at
`79af8508`), removed afterwards; `git worktree list` shows no residue.

## Verdict: **APPROVE-WITH-FIXES**

The change is the right change and is honestly built: the refusal that lied is
gone, the ownership check is real and is proven to be load-bearing, old rows read
back, and the goldens are regenerated rather than hand-tuned. One finding
**degrades a control** — making `--assignment` succeed opens a state that plan
139's supervision surface cannot clear, and whose printed remediation is a command
that is now guaranteed to refuse. That is a fix, not a rejection: the defect is in
the `verify` ↔ `anomalies` join, not in this plan's own surface.

---

## 1. AC → the test that goes RED, and two proofs by reverting

Baseline first (reviewed worktree, unmodified):

```
$ cargo test -p pij-daemon --test report_http assignment_
test result: ok. 3 passed; 0 failed; 26 filtered out
```

| AC | Behaviour | Test that goes RED if removed |
|---|---|---|
| AC1 accept | the three leaves take `--assignment`/`--refs`; `now`/`clear`/`verify` do not | `crates/daemon/src/http/report.rs:516` `reporting_assignment_flags_are_accepted_only_on_state_leaves` (parser); `crates/daemon/tests/report_http.rs:1231` for the HTTP 200 + receipt |
| AC1 refuse | `E-RS-ASSIGNMENT-UNKNOWN` / `E-RS-ASSIGNMENT-NOT-YOURS`, before any write | `crates/daemon/tests/report_http.rs:1319` `assignment_refusals_name_owner_and_leave_state_and_questions_untouched` — **proved below** |
| AC2 round-trip | `assignment_id` + `refs` survive the spine, reach `node show` and `pij state` | `crates/daemon/tests/report_http.rs:1231` `assignment_reports_survive_reopen_and_reach_node_and_state_readers` — **proved below**; unit-level `crates/core/tests/report.rs:320` |
| AC2 old rows | pre-145 `StateRecord` reads back | `crates/core/tests/report.rs:294` `old_state_history_defaults_assignment_and_refs_without_losing_its_note` |
| AC3 | `--project` / `--for` refuse honestly | `crates/daemon/tests/report_http.rs:498` `unsupported_report_scopes_refuse_by_name` |
| AC4 control | `report verify --assignment` unchanged, current-parent only | `crates/daemon/tests/report_http.rs:1365` `assignment_done_is_verified_only_by_current_parent_for_matching_task` |

**Proof A — AC1 not-yours refusal.** Neutralised the ownership branch
(`crates/daemon/src/http/decisions.rs:77`, `if task.node_id != *seat` → `if false && …`):

```
$ cargo test -p pij-daemon --test report_http assignment_
test assignment_refusals_name_owner_and_leave_state_and_questions_untouched ... FAILED
  left: 200   right: 400
  {"ok":true,…,"data":{"assignment_id":"assignment-e07be…","state":"done", …}}
```

The seat wrote a state against another node's assignment and got `ok:true`. Reverted; green again.

**Proof B — AC2 round-trip through the spine.** Dropped the field at the point of
persistence only (`crates/core/src/report.rs:258`, `assignment_id` → `assignment_id: None`);
every signature and projection left intact:

```
$ cargo test -p pij-daemon --test report_http assignment_reports_survive
test assignment_reports_survive_reopen_and_reach_node_and_state_readers ... FAILED
  crates/daemon/tests/report_http.rs:1287  left: Null  right: "assignment-ae69044…"
$ cargo test -p pij-core --test report assignment_state_round
test assignment_state_round_trips_and_clear_drops_its_metadata ... FAILED
  left: None  right: Some("assignment-145")
```

Both tests fail on persistence alone — they are not asserting the parser back to itself.

**Independent gate.** `cargo test --workspace` in the reviewed worktree: every
`test result:` line is `ok`, no `FAILED`, no `error:`. The report's claim holds.

## 2. Ownership: can a seat attach state to another node's assignment?

**No, by any path I could find.**

- The subject is always the resolved caller. `crates/daemon/src/http/mod.rs:2817`
  and `crates/daemon/src/http/decisions.rs:97` both pass the seat resolved from the
  caller claim, never a positional or a flag.
- `--for` (the only relay grammar) is still refused for every leaf —
  `crates/daemon/src/http/report.rs:162`, checked before leaf dispatch at `:118`.
  Runtime witness in §5.
- Parent/prime have no elevated path: `report` has no `<seat>` positional except
  on `verify`, which writes a verification receipt, not a state.
- Check: `crates/daemon/src/http/decisions.rs:63` `validate_report_assignment`;
  test `crates/daemon/tests/report_http.rs:1319`, which additionally asserts the
  spine tail is byte-identical before and after all six refusals — refuse-before-write.

**It is a restatement, not the helper `verify` uses.** `verify` checks ownership
inside its own write transaction at `crates/store/src/decisions.rs:233-254`
(`SELECT node_id,opened_at,closed_at FROM task_assignments`), and enforces two rules
the new helper does not: the task must have been *open at the time of the done*
(`opened > done_at`, `closed < done_at`). The coder packet said "reuse, do not
restate". Reuse was not literally available — verify's check must run in-transaction
and is temporal — but the divergence is real and is finding F3.

## 3. Old rows

- Serde defaults: `crates/core/src/report.rs:51-56` — `#[serde(default)]` on both
  `assignment_id: Option<String>` and `refs: Vec<String>`.
- Test that loads an actual pre-145 payload:
  `crates/core/tests/report.rs:294`, which appends the literal
  `{"state":"blocked","note":"original explanation","registry_seq":1}` to the spine
  and asserts the note survives while the two new fields default to `null` / `[]`.
- Wire card also defaults: `crates/daemon/src/http/types.rs:490,493`.
  The `rename = "assignment_id"` there is load-bearing, not noise — `StateCard`
  is camelCased, and the rename keeps the card spelling equal to the report wire.

## 4. Refusal honesty

Every `.pi/extensions/…` string remaining in `crates/` is a **doc comment,
fixture note, or provenance citation** — none is refusal text. Verified with
`grep -rn '\.pi/extensions/|no assignment model|PIJ_DAEMON_GENERATION=legacy' crates`.
The refusal-text hits are exactly two, and both are outside `report`:

- `crates/daemon/src/http/shim.rs:262` — `pij send` multi-destination, recommends
  `PIJ_DAEMON_GENERATION=legacy`. Not this plan's surface; flagged only as a
  survivor of the same class (F5).

Report's own refusals, all true on rs today:

- `crates/daemon/src/http/report.rs:160` `--project: rs reports are node-scoped; project comes from the node (see 'pij node show')` — true; `TaskAssignment.project` exists and is joined by node.
- `crates/daemon/src/http/report.rs:162` `--for: rs has no relay authority yet; report as yourself` — true; no relay grammar exists.
- `crates/daemon/src/http/report.rs:324` `rs has no semantic state '<word>'; supported states: …` — true; `SemanticState` carries six words.

**The removed legacy escape hatches were themselves stale, so removing them is a
correction, not a lost fallback.** The old text told callers
`PIJ_DAEMON_GENERATION=legacy pij report …`; the stable API contract
(`skills/pij/SKILL.md`, *Serve or refuse, never another generation*: "Explicit
`PIJ_DAEMON_GENERATION=legacy` … never enables fallback") makes that advice false.
Rewriting the TS-only-state refusal is slightly beyond AC3's four named strings,
and it is the right call.

## 5. Fallback risk

**No caller lost a refusal it was relying on.**

- **Shim / generation router**: both new refusals are HTTP **400** with a complete
  v2 envelope (`crates/daemon/tests/report_http.rs:1348`). The shim's route-absence
  classifier only fires on "404/405 with a body that does not decode as a pij
  envelope" (`crates/daemon/src/http/report.rs:19-22`), so neither refusal can be
  mistaken for an unserved route and silently served from legacy. This control is intact.
- **chainglass**: no occurrence anywhere in the repo outside archived plans.
- **anomalies**: consumes `payload.assignment_id` at
  `crates/daemon/src/http/anomalies.rs:104` and filters by it at `:212`. Plan 145 is
  the first *production* writer of that field — see F1 and F4.
- **skill route / docs**: see F2.

## 6. Goldens

Regenerated deliberately, not hand-edited, and the manifest agrees with the bytes
on disk (`shasum -a 256` + `wc -c` on all four, matched against
`crates/testkit/fixtures/MANIFEST.toml:433,440,400,408`):

| fixture | sha256 on disk | manifest | class |
|---|---|---|---|
| `report-state-record.json` | `2e822685…4638f` (133 B) | matches | GENERATED via `UPDATE_GOLDENS=1` |
| `report-assignment-client-parity.json` | `72102f00…9ac385` (9524 B) | matches | EXECUTED capture, private daemon |
| `governance-routes.json` | `aee1eca9…a729f6` (89016 B) | matches | DESIGNED contract (hand-maintained by construction) |
| `governance-events.json` | `a650137137…c90cc` (34210 B) | matches | DESIGNED contract |

The two DESIGNED contracts changed only by additive fields (`"state": null` on the
selected node, `assignment_id`/`refs` on the report.state payload and question
receipt) plus a rewritten invariant line — consistent with the code. The manifest
notes name the plan and refuse to claim production deployment. Honest.

---

## Findings

### F1 — DEGRADES A CONTROL: an assignment-scoped `done` becomes permanently unverifiable, and `anomalies` prints a remediation command that is guaranteed to refuse

`crates/store/src/decisions.rs:206-232` — `verify_done_committed` selects the seat's
**latest** `report.state` done event and only then compares `payload.assignment_id`
to the requested assignment. `crates/daemon/src/http/anomalies.rs:108-117` keys open
done facts by `(seat, assignment_id)`.

Before 145 the daemon never wrote `assignment_id` onto a `report.state` payload, so
that key was always `(seat, None)`: one done fact per seat, and a newer done
*replaced* the older one. Making `--assignment` succeed makes multiple keys
reachable, and an older scoped done can no longer be reached by `verify` at all.

Probe (throwaway worktree, isolated daemon; scoped done, then an ordinary done):

```
SCOPED VERIFY => {"ok":false,"details":{"code":"E-RS-DONE-ASSIGNMENT", …}}
LATEST VERIFY => {"ok":true,"data":{"done_seq":8, …}}
UNVERIFIED-DONE ROWS = 1
ROW: {"kind":"unverified-done","assignmentId":"assignment-01745951…",
      "relay":"⚠️ anomaly unverified-done on pij-report-witness (assignment …)"}
```

and the row's own `remediation_line` (`crates/core/src/anomalies.rs:408-411`) is
`pij report verify <seat> --assignment <id>` — the exact command that just returned
`E-RS-DONE-ASSIGNMENT`. The anomaly is open, unclearable, and self-contradicting.

This is load-bearing because `pij anomalies` is the supervision surface pij
invariant 12 makes mandatory ("query `pij anomalies --json` **unscoped** … then
follow the actual remediation until the card changes"). A permanently-open row
whose remediation cannot succeed trains supervisors to ignore the queue.

**Fix (smallest correct)**: when `assignment` is `Some`, have
`verify_done_committed` select the latest done event **whose payload names that
assignment**, instead of the latest done overall. Unscoped verify is untouched; the
existing open/closed window check at `:246-254` still applies; the
`E-RS-DONE-ASSIGNMENT` refusal survives for a genuinely wrong id. Regression test:
scoped done → plain done → parent verifies the scoped one → the anomaly row clears.
A prime ruling that older scoped dones are *intended* to be superseded (and should
be dropped by `anomalies`) is an acceptable alternative, but the current behaviour
is neither of those two answers.

### F2 — OBSCURES INFORMATION: the skill route still advertises two report flags rs refuses, and the report claims otherwise

`skills/pij/references/routes/node.md:55` prints `pij report now … [--project <slug>]`
and `:59` prints `pij report clear [--assignment <id>]`. Both refuse:

```
["report","clear","--assignment", …] => {"ok":false,"meta":"unknown flag --assignment for `pij report clear`"}
["report","now","did","next","--project","some-slug"] => {"ok":false,"meta":"--project: rs reports are node-scoped; …"}
```

This is precisely the defect class plan 145 exists to close ("the node route
documents the flag" while the daemon refuses, plan.md:3) — left standing for two
sibling flags. `docs/how/pij-rs-api.md:300-303` states the true contract
("`now` and `clear` do not accept assignment/refs flags"), so the two documents
now disagree.

`report.md:16` claims *"Existing node skill flag guidance remains true and
unchanged"*. The second half is true; **the first half is false**. AC5 asked for
the node route line to stay true.

**Fix**: delete `[--project <slug>]` from node.md:55 and `[--assignment <id>]` from
node.md:59. (`docs/how/pij.md:110-114` describes the legacy TS surface and is
correctly out of scope.)

### F3 — OBSCURES INFORMATION: a report may scope itself to a CLOSED assignment; the two ownership checks have diverged

`crates/daemon/src/http/decisions.rs:63-85` checks existence and `node_id` only.
`crates/store/src/decisions.rs:246-254` additionally requires the task to have been
open across the done. So:

```
CLOSED => 1789000742168
REPORT ON CLOSED ASSIGNMENT => {"ok":true,"data":{"assignment_id":"assignment-613a78…","state":"waiting", …}}
```

A seat gets `ok:true` scoping a live state to an assignment closed minutes earlier,
`node show` projects it, and the disagreement only surfaces later at verify time.
Within the letter of AC1 (`task(id).node == caller`), so not a blocker — but the two
checks are now two rules wearing one name, which is how they will drift.

**Fix**: either add the `closed_at` guard to `validate_report_assignment` (a new
named refusal, e.g. `E-RS-ASSIGNMENT-CLOSED`), or record in
`docs/how/pij-rs-api.md` that reporting against a closed assignment is deliberately
permitted and name why. Do not leave it undecided.

### F4 — OBSCURES INFORMATION: 145 activates the anomalies project filter with no test in this change

`crates/daemon/src/http/anomalies.rs:212-219` filters unverified-done rows by
joining `row.assignment_id` to `task.project`. Until this commit no production
writer produced `assignment_id`, so that branch always excluded every row under
`--project`; it now selects. Behaviour change to a supervision query, untested in
plan 145 (the existing anomaly tests at `crates/core/src/anomalies.rs:884` use
synthetic facts, not a real report).

**Fix**: one HTTP test — `task set --project p` → `report state done --assignment` →
`anomalies --project p` returns the row, and `--project other` does not.

### F5 — INFORMATIONAL: one legacy-fallback refusal survives outside this surface

`crates/daemon/src/http/shim.rs:262` still tells callers to use
`PIJ_DAEMON_GENERATION=legacy` for multi-destination `pij send`. Same false-advice
class as the strings 145 removed, different verb. Out of scope here; worth its own
one-line plan.

---

## Report honesty (per claim)

| report.md claim | verdict |
|---|---|
| AC1 named refusals before any write | **true** — spine tail asserted unchanged, `report_http.rs:1352` |
| AC2 metadata survives reopen, receipts, `node show`, `pij state`; refs-only works; clear discards; old history defaults | **true** — verified by reading and by probe B |
| AC2a `assignment_id` is the only canonical spelling | **true** — no `assignment` alias anywhere in `crates/*/src` |
| AC3 no report refusal cites a legacy source line or recommends legacy fallback | **true** for `report`; see F5 for the neighbouring surface |
| AC4 RED first, all suites green, goldens regenerated deliberately | **true** — `cargo test --workspace` reproduced clean; manifest hashes match bytes |
| AC5 "Existing node skill flag guidance remains true and unchanged" | **FALSE in its first half** — F2 |
| AC6 live proof on an isolated daemon, production never restarted | **consistent** — outputs are shape-correct and internally coherent (ids, seqs and spine numbers line up across the eight captures); not independently re-executed, and the private runtime is gone |
| "`report state done` does not close a task" | **true** — asserted at `report_http.rs:1310` |

## What is good here, on the record

- The refusal that lied is gone and what replaced it is checked, not asserted.
- Refuse-before-write is *proven* by comparing the spine tail across six refusals —
  not by trusting the status code.
- The `--assignment`/`--refs` parse rejects duplicates, empty values and a value
  that is another flag (`report.rs:395-406`), so the flag cannot silently eat its
  successor.
- `ReportCall::Blocked`/`Question` collapsing into one `State` variant removes a
  parallel declaration path rather than adding one.
- Manifest notes say GENERATED / EXECUTED / DESIGNED explicitly and refuse to claim
  production acceptance.

## Recommended disposition

Land after F1 and F2. F1 is a real control defect but is a small, well-localised
change to `verify_done_committed` plus one regression test; F2 is two words deleted
from a skill route. F3 wants a decision, F4 a test — both can follow.

---

# Re-review — fix commit `fe3895bb` (F1 and F2 only)

Reviewer: `pij-gratifying-perosteck`. Reviewed `fe3895bb` against review `6598483f`
(itself on `79af8508`). Scope per prime: F1 and F2 only; F3 and F4 were never
blockers and are unchanged. Probes ran in a throwaway worktree `/tmp/145-probe2`
detached at `fe3895bb`, removed afterwards. Production daemon untouched.

## Verdict: **APPROVE**

Both blockers are closed, and closed the right way — F1 by the recommended
selection change plus a regression that binds the *detector's own advice line*, F2
by deleting the two flags and correcting the report's false claim.

## F1 — CLOSED

`crates/store/src/decisions.rs:216-227`: the done scan now sets `saw_done` on any
done, then `continue`s past dones whose `payload["assignment_id"]` does not equal
the requested assignment, so scoped verify binds the latest done **naming that
assignment**. Unscoped verify is unchanged (`assignment.is_some_and(…)` is false
when `None`). `E-RS-DONE-ASSIGNMENT` survives for a genuinely wrong id via the
`saw_done` discriminator at `:229`, and the task open/closed window check at
`:246-254` still runs against the *selected* done's `done_at`. This is exactly the
fix the review recommended, with the refusal semantics preserved rather than widened.

**Baseline green** at `fe3895bb`, unmodified worktree:

```
$ cargo test -p pij-daemon --test report_http assignment_
test result: ok. 3 passed; 0 failed; 26 filtered out
```

**Revert proof.** Neutralised the new scope guard only
(`decisions.rs:218` → `if false && assignment.is_some_and(…)`), restoring
latest-done-overall selection; nothing else touched:

```
test assignment_done_is_verified_only_by_current_parent_for_matching_task ... FAILED
  crates/daemon/tests/report_http.rs:1479  left: Number(11)  right: Number(9)
test result: FAILED. 2 passed; 1 failed
```

The receipt bound spine 11 (the intervening unrelated done) instead of 9 (A's own
latest done). Reverted with `git checkout`; green again.

**The original F1 scenario, re-run verbatim** (scoped done A, later plain done B,
parent verifies A):

```
SCOPED DONE seq => 6
PLAIN DONE seq  => 8
SCOPED VERIFY => {"ok":true,"data":{"done_seq":6,"assignment_id":"assignment-669ac32f…", …}}
A ROW STILL OPEN = false   B ROW STILL OPEN = true
UNSCOPED VERIFY => {"ok":true,"data":{"done_seq":8, …}}
```

All four required properties hold: scoped verify succeeds; it binds A's done (6),
not the later one; **it clears only A** — B's `unverified-done` row is still open
and still verifiable; and unscoped verify still selects the latest overall (8).

**The advice line no longer refuses, and is proven by execution not by inspection.**
The regression at `crates/daemon/tests/report_http.rs:1445-1470` builds a `DoneFact`
from the *HTTP anomaly card's own* `nodeId`/`assignmentId`/`evidence[0]`, runs
`UnverifiedDoneDetector.scan`, splits `advice[0].remediation_line` into argv and
POSTs that — then asserts `ok:true` and that A's row is gone while the unrelated
row remains. That is the correct shape: it cannot drift from the printed
remediation, because it *is* the printed remediation. The comment at `:1446-1447`
says so explicitly.

Coverage is also wider than the review asked for: the loop at `:1411` runs the
whole sequence twice, once with an intervening **plain** done and once with an
intervening **other-assignment** done, and re-reports A first each pass so both
readers must select A's *latest* done rather than its first. The `E-RS-DONE-ASSIGNMENT`
refusal for a wrong id is still asserted after the loop.

## F2 — CLOSED

`skills/pij/references/routes/node.md:55` is now
`pij report now '<did>' '<next>' [--state <word>] [--note '<text>']` and `:59` is a
bare `pij report clear`. Every flag still advertised in that block is one the
daemon accepts (`--assignment` on `question`/`blocked`/`state`/`verify`, `--refs` on
`state`, `--project` on `task set`). No sibling document repeats the mistake:
`grep -rn "pij report now\|pij report clear" skills/ docs/how/` returns only
flagless usages outside the legacy-surface doc `docs/how/pij.md`.

The false claim is corrected too. `report.md:16` no longer asserts the node guidance
"remains true and unchanged"; it now names the finding and the fix. Honest.

## Independent gate

`cargo test --workspace` in the reviewed worktree at `fe3895bb`: **1064 passed**,
zero `FAILED`, zero `error:` — matching the commit message's claim exactly.

## Remaining, non-blocking

- **F3** — `validate_report_assignment` still ignores `closed_at`, so a state may be
  scoped to a closed assignment while verify would refuse it. Wants a decision
  (guard, or a documented "deliberately permitted"), not a fix in this round.
- **F4** — the `anomalies --project` join is now genuinely reachable; the new
  regression exercises unscoped `anomalies` only. One filtered assertion would close it.
- **F5** — `shim.rs:262` still recommends `PIJ_DAEMON_GENERATION=legacy` for
  multi-destination `pij send`. Separate surface, separate plan.

## Disposition

Ship. No further changes required for plan 145.
