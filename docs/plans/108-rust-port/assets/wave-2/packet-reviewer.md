# Reviewer packet — plan 108 wave 2 (composed)

**Role**: cross-model reviewer · **READ-ONLY** ·
**Model**: `openrouter/z-ai/glm-5.3-flash`, effort high (cross-provider from the
sol-fast coders — you are deliberately not the same family as the seats that
wrote this)
**Branch**: `s108/rust-port` · **Worktree**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port`
**PM**: `pij-revolutionary-lungfish`

## Mission

Judge the composed wave-2 tree: **six** parallel units — report, watchdog,
anomalies, delivery, harness, orchestration — merged in dependency order onto the
wave-0 mold and the wave-1 substrate. You are the last check before the PM
reports done. **Do not edit anything** (one exception in § Fences).

Waves 0 and 1 both closed APPROVE, after 11 and 1 findings respectively. Wave 1's
single finding was a receipt that existed only in a chat log — found by checking
the packet's named receipts against the tree rather than assuming they were
there.

## Read in this order

1. `docs/plans/108-rust-port/services.dd.md` — the settled unit rows.
2. `docs/plans/108-rust-port/assets/wave-2/COMMON.md` — the contract every coder
   worked under, including the five rules wave 0 paid for.
3. The six unit packets beside it (`packet-u-*.md`).
4. The six wave-2 receipts in `docs/plans/108-rust-port/assets/reports/`:
   `done-u-report.md`, `done-u-watchdog.md`, `done-u-anomalies.md`,
   `done-u-delivery.md`, `done-u-harness.md`, `done-u-orchestration.md` —
   **these are the receipts you are checking, not evidence you may assume.**
   Check that each one EXISTS before you check what it says. (An earlier version
   of this list named `done-wave-2-u-store.md`, which never existed: it was a
   wave-1 filename mangled by a mechanical rewrite. The reviewer found it by
   reading the tree instead of the packet — finding 1 of the wave-2 review.)
5. `docs/plans/108-rust-port/assets/reports/first-light-wave-2.md`.
6. `docs/plans/108-rust-port/assets/reports/review-round-{1,2}.md` — wave 0's
   eleven findings, none refuted. **Read these before writing your first note**:
   they name the mistake shapes this codebase actually makes.

## The diff

```bash
cd /Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port
git log --oneline e508cd97..HEAD          # 2132d73f is the composition head; 194b1a12 was wave-1 APPROVE
git diff e508cd97...HEAD -- crates/ Cargo.toml
```

## Verify, do not trust

```bash
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR=/tmp/pij-review-w2-target
CARGO_INCREMENTAL=0 cargo run --locked -p pij-testkit --bin pij-gate
CARGO_INCREMENTAL=0 cargo test -p pij-daemon --test first_light_wave1 -- --nocapture
```

Expect six stages green and 181 passing tests. **If it is not green, that is the
finding.** `git status --short` must be empty afterwards — a gate that mutates the
tree it judges is itself a defect (wave-0 round 3).

## The rulings this wave turned on — check the code matches them

Each was a PM ruling on a coder's ack. A ruling that did not land in the code is
worth more to me than a style note:

* **`models()` returns an ERROR, never an empty `Vec`**, until u-models lands in
  wave 3. Empty would CLAIM the harness has no models.
* **Cross-port writes report the true half-state.** No atomic path spans Registry
  and Spine, or an action and its audit event, so a partial failure returns an
  error naming WHICH HALF LANDED — u-report's state+note, u-delivery's
  action-then-audit. Neither may silently succeed.
* **Staleness and nudging are different axes.** A card is stale on the clock
  alone (>10min default, threshold configured); parking suspends NUDGING only.
  u-report's freshness must not consult semantic state; u-watchdog's eligibility
  must.
* **`delivered-unacked-stale`** is the kind spelling — parity with the live TS
  consumer, against the packet's own wording.
* **Delivery to a tombstoned seat REFUSES and queues nothing**, with a distinct
  error variant, because `NotDeliverable` promises "queued, not lost" and that
  would be a false receipt.
* **A delivery job's kind is `delivery:<seat-id>`**, formatted in exactly one
  place, so `inbox(A)` can never claim B's message.
* **Five harness adapters, not one composite** — a composite's `kind()` has no
  truthful value.
* **The typing gate is an AND**: `false` from either the composer gate or
  `pane_in_mode` means "no observable interaction", never "safe to inject".

## Priority order

1. **Vacuous tests — the highest-value thing you can find.** Wave 0's rounds 2–4
   were all one shape: *a regression that exercises the path without exercising
   the property.* For each new test, ask what mutation it would survive. The
   reports claim mutation transcripts; **spot-check at least two by making the
   mutation yourself** and watching the named test fail (revert after; say what
   you touched).
2. **The seams between units.** Six units wrote in parallel behind frozen traits.
   The PM landed the shared types before dispatch (`de858841`, `7addd991`):
   bind evidence on `SeatDescriptor` with migration 0003, `model::Card`,
   `CARD_LIMIT`, `Receipt`. Do the units actually compose, or merely compile?
   Watchdog and anomalies both read cards — do they agree?
3. **Frozen-contract fidelity.** `crates/core/src/ports.rs` still has seven
   traits and no eighth. Did anything widen a signature, or route around one?
   Does `core` still perform no IO, and does nothing outside `store` speak SQL or
   outside `tmux` shell to tmux?
4. **The policy/brake calls.** Three were ruled this wave and each report states
   one: the queue lease (**policy** — age decides a terminal outcome), tmux `kill`
   and exact-pid liveness (**brakes** — removing them does MORE, not different).
   Are those framings correct, and does the code match the framing?
5. **Honest defaults and honest absences.** `subscribe(None, …)` still replays the
   entire spine — wave 2 required every `None` call site to say why unbounded is
   safe there. Are those comments true? And the bind-evidence fields are all
   `Option`: is absent kept absent, or does something invent a value for a seat
   that was adopted rather than spawned?
6. **What a wave-2 coder will get wrong** reading this as a template.

## Known-and-accepted (do not report as new)

- `harness checks` cannot run here: no node tooling in this worktree. The Rust
  gate is `pij-gate` (wave-0 assumption 12, independently reconfirmed).
- `transport` and `harness` still refuse when set to `Real` — they land in waves
  3 and 2. Their `not_yet` arms are supposed to be there.
- `user_typing` is `pane_in_mode` only; the stateful gate is a **named** wave-2
  obligation on `HarnessPort`, recorded in the doc comment, not a silent gap.
- Baselines are deferred to `u-sidecars` (no frozen contract to build against).
- Mutation evidence is manual transcripts; `cargo-mutants` is not installed.

## What to send back

To the PM (`pij send pij-revolutionary-lungfish "…"`), C10 wire discipline —
**line 1 is `APPROVE` or `CHANGES`**:

- Per finding: file:line, what is wrong, why it matters, the smallest fix you
  would accept, severity (blocking / should-fix / note).
- **Cite the command and its output** for anything you ran. Your measurement
  outranks the packet, the reports, and my composition — if a receipt disagrees
  with what you observe, relay the contradiction verbatim rather than
  reconciling it.
- Say in one line where you found nothing. Do not pad.

## Fences

READ-ONLY. Never write to this worktree, `the-flow.*`, `.harness/**`, the TS
sources, or anything outside the worktree. **One exception**: a temporary edit
made solely to verify a mutation — revert it, leave the tree clean, and say
exactly what you touched.
