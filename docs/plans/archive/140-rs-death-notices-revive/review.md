# Review — plan 140: rs death notices + revive of observed-dead seats

Reviewer: `pij-systematic-aardwolf`. Branch `140-rs-death-notices-revive`, reviewed at
`0c2d3ad9` (= coder's `b7dac1e7` plus the process repair in P1 below) against `bbc29c1f`.
Rust via `~/.cargo/bin/cargo`. Production daemon (127.0.0.1:7461) never touched.

## Verdict: APPROVE-WITH-FIXES

The behaviour the plan asked for is present, single-sourced, and defended by tests that
genuinely go RED when the behaviour is removed (proved below for AC3 and AC5). Two fixes
are required before merge: **F1** is a regression that makes `revive` impossible for a
class of already-tombstoned seats — on the branch whose purpose is making revive work
after a death — and **F2** prints a remediation command the shim refuses.

## Independent gate run at `0c2d3ad9`

| Command | Observed |
|---|---|
| `cargo fmt --all -- --check` | exit 0, no output |
| `cargo clippy --all-targets -- -D warnings` | `Finished dev profile`, no warnings |
| `cargo test --workspace` | 84 suites `test result: ok`, zero `FAILED` |
| `cargo test -p pij-daemon --lib reaper::tests::death_sweep` | 3 passed |
| `cargo test -p pij-daemon --test revive_http` | 9 passed |
| `cargo test -p pij-cli --test revive` | 4 passed (in workspace run) |

Not re-run by me: `just pij-skill-check`, `just smoke`, `harness checks`, `just windows-compat`
(node harness; the report's logs are the only evidence — see § Unverifiable claims).

## AC → the test that goes RED if the behaviour is removed

| AC | Named test | Status |
|---|---|---|
| AC1 automatic sweep, reap-rule parity, one observation | `reaper::tests::death_sweep_matches_manual_candidates_and_commits_observation_once` (`crates/daemon/src/reaper_tests.rs:334`) — asserts `swept.candidates == dry.candidates`, `reason: "observed-dead"`, the four observation fields, and that a second sweep emits nothing | present, green |
| AC2 obituary text + sender + honest receipt | `reaper::tests::death_sweep_notifies_living_parent_with_pinned_body_and_honest_receipt` (`reaper_tests.rs:372`, rebuilds the body from `death_notice_body_template` in the corpus) and `death_sweep::tests::obituary_has_exact_utc_millisecond_timestamp_and_revival_command` (`crates/daemon/src/death_sweep.rs:187`) | present, green |
| AC3 suppression when parent dead | `reaper::tests::death_sweep_withholds_notices_when_parent_already_or_simultaneously_dead` (`reaper_tests.rs:424`) | **PROVED RED** below |
| AC4 revive accepts observed-dead, atomic, seq cited | `revive_observed_dead_tombstones_before_relaunch_and_cites_seq` and `concurrent_observed_dead_revives_launch_exactly_one_incarnation` (`crates/daemon/tests/revive_http.rs:154,348`) | present, green — but see **F1** for the tombstoned half of AC4 |
| AC5 `--assume-dead` authorization | `revive_assumption_requires_parent_or_authoritative_prime_for_parentless` and `revive_assumption_refuses_missing_evidence_self_and_forged_parent` (`revive_http.rs:268,305`), plus `revive_assumption_never_overrides_active_process_or_present_pane`, `revive_recycled_process_is_never_signaled`, `revive_assumption_publication_failure_cannot_retire_or_launch`, CLI `shipped_revive_assumption_flags_authorize_parent_and_record_evidence` | **PROVED RED** below |
| AC6 docs + skill | `just pij-skill-check` (coder's log) and `pij-testkit --test corpus` for the pinned template | corpus green here; skill gate not re-run by me |
| AC7 live proof | no test — static captures under `assets/evidence/` | not reproducible; see § Unverifiable claims |

### AC3 proof — injected violation

`crates/daemon/src/death_sweep.rs:115-121`, the whole suppression predicate replaced with
`let dead = false;`:

```
cargo test -p pij-daemon --lib reaper::tests::death_sweep
test reaper::tests::death_sweep_withholds_notices_when_parent_already_or_simultaneously_dead ... FAILED
  left: Null   right: "recipient-dead"
test result: FAILED. 2 passed; 1 failed
```

Restored; the same command then reports `3 passed; 0 failed`.

### AC5 proof — injected violation

`crates/daemon/src/http/revive.rs:194-200`, the parent/prime predicate replaced with
`let authorized = true;`:

```
cargo test -p pij-daemon --test revive_http
test revive_assumption_refuses_missing_evidence_self_and_forged_parent ... FAILED
test revive_assumption_requires_parent_or_authoritative_prime_for_parentless ... FAILED
  left: Bool(true)  right: false   (envelope shows ok:true, assumed_dead_seq:4, seq:5)
test result: FAILED. 7 passed; 2 failed
```

Restored; the suite then reports `9 passed; 0 failed`.

## Answers to the packet's structural questions

2. **Canonical candidate fn, not a restatement.** `death_sweep::sweep` (`death_sweep.rs:88-96`)
   calls `reaper::reap_with_reason`, which is exactly the body `reap` now delegates to
   (`reaper.rs:112-121`). `eligibility` (`reaper.rs:64-101`) is unchanged and single-sourced;
   the only new argument is the tombstone reason override. Manual/automatic parity is
   asserted directly (`reaper_tests.rs:347`). No restatement.
3. **Single-witness tombstones: yes, on the paneless path — see F4.** Two witnesses are
   required whenever a pane is recorded (`reaper.rs:78-85`; `revive.rs:157`), and a failed
   pane probe is a veto in both (`reaper.rs:84`, `revive.rs:69` + `revive.rs:157`). But a seat
   with `pane: None` is a candidate on the process witness alone (`reaper.rs:86-88`,
   pre-existing; `revive.rs:46` leaves `pane_present: Some(false)` untouched when
   `revive.rs:63` finds nothing recorded). Disclosed in `docs/how/pij-rs-api.md:266`.
4. **Yes, honest, and it lands on the spine.** `DeliveryService::send` at
   `death_sweep.rs:133-137`; the outcome is mapped verbatim, then downgraded to
   `"unverified"` when the parent's own process is no longer `Active`
   (`death_sweep.rs:139-152`); the `death.notice` event carrying `tombstone_seq`, the
   receipt and the delivery word is published at `death_sweep.rs:163-173`. Live capture
   agrees: seq 9 `seat.tombstone` → 10 `message.pushed` → 11 `delivery.outcome`
   (`queued`/`extension-stream`) → 12 `death.notice`
   (`assets/evidence/live-death-events.json`).
5. **Two concurrent revives cannot both launch.** `revive.rs:128` takes
   `state.spawn_lock` — the same process-wide mutex the spawn route uses
   (`http/mod.rs:72,398,870`) — *before* the registry read at `revive.rs:129`, and hands the
   guard through to `launch_seat_locked` (`revive.rs:284`), so observation, CAS retirement
   and launch are one critical section. The second caller therefore reads the new
   incarnation, not the dead predecessor; the comment at `revive.rs:126-127` states this and
   `concurrent_observed_dead_revives_launch_exactly_one_incarnation` enforces it. (Scope:
   one daemon process; the lock is not cross-process.)
6. **Sender defined once.** `pij_core::BG_ACTOR` (`crates/core/src/lib.rs:34`). The daemon's
   duplicate `pub const BG_ACTOR` was deleted and the two sidecar string literals replaced
   (`git diff bbc29c1f..0c2d3ad9 -- crates/daemon/src/background.rs crates/sidecars/src/background.rs`).
   `grep -n BG_ACTOR crates/daemon/src/{background.rs,http/identity.rs,http/mod.rs}` shows every
   comparison going through the core constant. The remaining `"pij-bg"` occurrences are
   refusal message prose, test fixture ids, docs and golden envelopes — no second definition.

## Findings

### Degrades a control

**F1 — `revive` of a tombstoned seat now hard-fails when the tombstone has no spine event
(regression).** `revive.rs:146-154` routes every already-tombstoned seat through
`lifecycle::tombstone_receipt`, which errors when no matching `seat.tombstone` event exists
(`lifecycle.rs:219-232`) and is surfaced as `internal(...)`. Two shipped paths retire a seat
with a bare `registry.put` — `registration.rs:776` ("dead native incarnation released its
pane…") and `registration.rs:791` ("superseded by … at a native session boundary") — and
`SqliteRegistry::put` emits `seat.put`, never `seat.tombstone` (`crates/store/src/registry.rs`,
`descriptor_event` at the `put` publish). Such seats can no longer be revived at all.
Before this branch the handler accepted any `tombstoned_at.is_some()` with no spine lookup
(`git diff bbc29c1f..0c2d3ad9 -- crates/daemon/src/http/mod.rs`, deleted arm
`Ok(Some(prior)) if prior.tombstoned_at.is_some() => prior`). AC4 says revive "succeeds when
the seat is tombstoned"; for this class it does not.

Proved with a throwaway probe appended to `crates/daemon/tests/revive_http.rs` in a scratch
worktree — seed `target()` with `tombstoned_at`/`tombstone_reason` set via `registry.put`,
then POST `/v1/revive`:

```
cargo test -p pij-daemon --test revive_http probe_revive_of_eventless_tombstone -- --nocapture
PROBE RESPONSE: {"command":"pij revive","error":"adapter",
 "meta":"lifecycle/tombstone-receipt: no matching durable tombstone event for pij-child",
 "ok":false,"v":2}
test result: FAILED. 0 passed; 1 failed
```

Fix: a missing receipt is a *reporting* gap, not a reason to refuse the relaunch. Either omit
`details.seq` when no durable tombstone event exists, or refuse with a decodable code and a
remediation — not an opaque adapter `internal`. Probe deleted; it is not in the branch.

**F2 — the refusal prints an override command the shim refuses.** `revive.rs:82` builds
``pij revive <seat> --assume-dead --evidence "<text>"``, and `pij revive` is a named
`E-RS-UNPORTED` refusal (`.pi/extensions/pij/core/generation-routing.ts:264`:
"shim revive grammar is not native revive grammar; use pij-rs revive --help"). The docs
written by this same change use the native spelling (`docs/how/pij-rs-api.md:284-290`,
`skills/pij/references/routes/peer.md`), and the amend `b7dac1e7` corrected exactly this
spelling in the obituary body — but not here. AC5 requires the refusal to name "the exact
override command"; an operator who copies this one gets a second refusal.
`crates/daemon/tests/revive_http.rs:148` currently pins the broken text, so it must be
corrected with the code, not re-pinned. `const COMMAND: &str = "pij revive"` (`revive.rs:18`)
is the envelope's command label and matches the existing convention — leave it.

**F3 — one transient store error permanently loses the remaining obituaries of a sweep.**
In `death_sweep::sweep` the notice loop propagates with `?` at `death_sweep.rs:105`
(tombstone lookup), `:113` (`iso`), `:114` (`registry.get`) and `:173` (event publish), so the
first failure aborts the whole loop. The seats are already retired by then, and the next
sweep skips tombstoned rows (`reaper.rs:146`), so every later candidate's parent is never
told — silently, forever. The delivery arm already gets this right (`death_sweep.rs:155-158`
logs and continues). Fix: isolate per seat with the same shape.

### Obscures information

**F4 — `pane_present: false` is a constant, not an observation.** `tombstone_event`
(`crates/store/src/registry.rs:282-300`) hardcodes `"pane_present": false` for the
`observed-dead` / `revive-*` reasons instead of recording what the caller observed, directly
under a doc comment saying "the caller owns the two-witness observation". It is accurate for
every path that exists today, so this is not a live lie — but it is a fact no one measured,
and it will quietly become false the moment a fourth reason reuses the branch. For paneless
seats the obituary compounds it: `death_sweep.rs:73` renders `pane none absent`, asserting a
pane witness that never existed. Fix: pass the observed value through.

**F5 — the revive receipt is dropped on the waiting launch branch.** `spawn_success(...)`
is called with `None` on the bound-wait path in `http/mod.rs`, so `details.seq` /
`assumed_dead_seq` would vanish. Safe only because `revive.rs:275` hardcodes `no_wait: true`.
Latent; worth an assertion or a comment at the call site.

**F6 — the same-sweep clause of the suppression predicate has no independent RED.** Removing
only `|| receipt.candidates.iter().any(...)` (`death_sweep.rs:118-121`) leaves all three sweep
tests green (verified in a scratch worktree). What the suite actually enforces is the
retire-all-before-notify ordering — the fixture's `a-child` sorts before `z-parent`, so a
notify-inside-the-reap-loop refactor does go RED. The clause is defence in depth, not a
proved guard; no change requested, but do not treat it as covered.

### Process

**P1 — my mutation probe was committed into the coder's amend; repaired.** I ran the AC3
probe in the shared worktree `fs3-rs-death-notices-revive`; `pij-nuclear-regis` staged and
committed while it was live, so `b7dac1e7` shipped `let dead = false;` in place of the
suppression guard and `death_sweep_withholds_notices_when_parent_already_or_simultaneously_dead`
was RED on branch HEAD. My fault, not the coder's. Prime ruled the repair to me: `0c2d3ad9`
`fix(pij-rs): restore AC3 suppression guard clobbered by review mutation probe`, after which
`cargo test -p pij-daemon` is green and that test passes (`3 passed; 0 failed`).

**Standing rule from prime, effective now: mutation probes run in a THROWAWAY worktree**
(`git worktree add ../fs3-140-probe HEAD`), never in the shared one. Every probe in this
review after P1 ran in a detached scratch worktree with its own `CARGO_TARGET_DIR`, and the
scratch tree was reverted to clean and removed.

## Unverifiable claims (per claim, not per section)

- report §"Isolated live proof" 1–5 — **not reproducible**: the isolated daemon
  (`127.0.0.1:17461`), its temp state dir and tmux session `p140-ocv_v86t` were destroyed. I
  can confirm the captures exist and are internally coherent (`live-death-events.json` seqs
  9→12 in the right order with a `queued`/`extension-stream` outcome; `live-parent-obituary.txt:33`
  shows `📨 pij from pij-bg: [pij] seat p140-child died (observed-dead) …`). I cannot confirm
  they came from the run described.
- "within **1.35 seconds**" — read from `elapsed_seconds` inside the same capture; no
  independent clock. Unverified.
- "parent pane visibly received the obituary" — the captured line is truncated at
  `gone a…`, so it evidences receipt of the **pre-amend** body only. The report states this
  itself (report.md:60, :88); I confirm the ceiling is honestly declared and that no live
  capture covers the shipped `pij-rs revive` text.
- `harness checks` (both runs), `just windows-compat`, `just smoke`, `just pij-skill-check`,
  `npm test -- skills/flow-pair/test/identity.test.ts` — logs only; not re-run here. The
  report's "full-gate exception is explicit, not a green claim" framing is accurate as far as
  I can check it, but the exception rests on prime's ruling, not on evidence I reproduced.
- RED logs under `assets/evidence/red-*.log` — chronological claims about a pre-implementation
  tree; unverifiable after the fact. I independently re-derived equivalent RED for AC3 and AC5
  by mutation instead (above), which is the stronger form.
- Verified by me directly: `fmt`, `clippy -D warnings`, `cargo test --workspace` (84 suites,
  zero failures), the three targeted suites, the two mutation proofs, the F1 probe, and the
  `BG_ACTOR` single-definition grep.

## What is good

- The sweep reuses the reaper instead of restating it, and proves parity in a test rather
  than in prose.
- Retire-everything-then-notify is the right ordering for the reboot case, and the reason is
  written where the code is (`death_sweep.rs:81-83`).
- `unverified` as a distinct delivery word (`death_sweep.rs:145-152`) refuses to let a queued
  push read as an acknowledgement; the docs repeat it ("queued is not parent observation").
- Publishing `revive.assumed-dead` **before** the CAS (`revive.rs:215-244`) means a failed
  retirement leaves an audit of the attempt, not a death claim.
- The report names its own proof ceilings, including the one that weakens its own AC7.
