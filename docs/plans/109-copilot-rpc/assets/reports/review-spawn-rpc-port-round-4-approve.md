# Review round 4 — FINAL VERDICT — u-spawn-rpc-port (plan 109, unit 1)

**Head:** `s109/u-spawn-rpc-port` = `0181eedc` "fix(spawn): carry registration
correlator". Verified 2026-08-31T03:48–03:52Z in my own detached worktree
`pij-worktrees/s109-rev-head`, `CARGO_TARGET_DIR` unset, `CARGO_INCREMENTAL=0`,
tree clean before the gate and after every mutation.

Governing contract: `f8d56f5b` (RF28–RF31, M1/M3/M6/M7/M8/M9/M10), every clause
registered **before** the code it judges existed.

---

## VERDICT: APPROVE

Nine findings raised across four rounds; all nine closed and each one verified by
observation rather than by receipt. The closing condition I registered in advance
— **arm 1 green through the shipped launcher** — is met.

---

## RF31 — arm 1 is the acceptance. GREEN.

The registration was constructed from **the launch command the launcher actually
built**, parsed out of the tmux recorder, and from nothing else. No value came from
the spawn response, the descriptor, or the registry.

```
PROBE_RF31 env_from_launch  PIJ_SESSION_ID=Some("pij-probe-arm1")
                            PIJ_SPAWN_ID=Some("s-3abce79395784899099f8363f6e726a5")
PROBE_RF31 row_spawn_id     = Some("s-3abce79395784899099f8363f6e726a5")
PROBE_RF31 identity_match   = true
PROBE_RF31 ARM1 at_spawn    = Some(59475)
PROBE_RF31 ARM1 after_bind  = Some(59475)
PROBE_RF31 ARM1 persisted   = Some(59475)
```

`POST /v1/spawn` then `POST /v1/register` over a real listener; `persisted` read
back through `Registry::get`. **A Copilot seat launched by the shipped path now
keeps its port through its own first bind.** That is F1 closed at the only place it
was ever going to matter.

`identity_match = true` is RF29-2 **observed**, not read: the value in the argv is
the value on the row, not merely a value.

## RF29 — all five falsifiers checked

1. **Emitted.** `crates/harnesses/src/spawn.rs:5` `const PIJ_SPAWN_ID: &str =
   "PIJ_SPAWN_ID";`, placed in the argv at `:113`.
2. **Same value.** `launch_seat` mints once at `http/mod.rs:551`, clones into the
   plan at `:618`, moves into the descriptor at `:661` — one variable, and the probe
   above confirms the two agree at runtime. The failure I expected did not occur.
3. **Name matches the consumer.** Rust `"PIJ_SPAWN_ID"` ==
   `process.env.PIJ_SPAWN_ID` (`.pi/extensions/pij/adapters/rust-runtime.ts:245`).
   Compared by hand. **See the gap note below — this remains a proof-surface hole
   whatever I read.**
4. **Rides every spawn.** Emitted at `:113`, **before** the `match input.harness`
   at `:116`, so it is unconditional. As ruled.
5. **Not keyed on the seat id.** The correlator is `spawn_id`, incarnation-scoped.
   The unsound option stayed unused.

Bonus, unprompted and correct: `build_spawn_plan` now **refuses an empty spawn id**
(`:75-81`) — *"spawn id must be non-empty so the first bind can correlate its
launch"*. That is the `Some(0)` / `!launched.is_empty()` lesson applied a third
time, at the producer this time rather than the consumer.

## RF30 — the witness arm's provenance, read from the call order

`crates/cli/tests/spawn.rs:325-327`:

```rust
let revive_launch = tmux.calls().last().cloned().expect("revive launch call");
let launched_spawn_id = launch_env(&revive_launch, "PIJ_SPAWN_ID");
let first_bind = register_same(launched_spawn_id.as_deref());
```

The correlator is taken **from the launch command**, not from `revived.spawn_id` as
it was at `27a161b1`. That is exactly the channel a real process has, and it is the
one-line difference between a test that could not catch F9 and one that does.

Plus a standalone assertion that the launcher transmits at all
(`:343-346`): *"the shipped launcher must hand the correlator to the process that
binds"*.

## Mutations — seven, each applied alone and reverted, each with the predicted signature

| mutation | predicted | observed | signature |
|---|---|---|---|
| **M9** `PIJ_SPAWN_ID` removed from argv (= the F9 defect) | arm 1 red | **RED** | `spawn.rs:335` "matching first bind must preserve" |
| **M10** `PIJ_SPAWN_ID` emitted with a freshly minted value | arm 1 red | **RED** | `spawn.rs:335`, same |
| **M7** predicate never matches | arm 1 red | **RED** | `spawn.rs:335` |
| **M6** predicate always matches | arm 2 red | **RED** | `spawn.rs:357` "without the matching launch id must clear" |
| M1 clear deleted | arm 2 red | RED at `27a161b1` | code untouched since |
| M3 column out of `DO UPDATE SET` | store red | RED at `27a161b1` | code untouched since |
| M8 post-mortem after overwrite | ordering red | RED at `27a161b1` | code untouched since |

**M9 red and M10 red is the pair that mattered.** M9 alone would only have proved
the arm notices *absence*; M10 proves it notices **identity** — a wrong correlator
fails just as loudly as a missing one. That was the discrimination I registered
before the fix existed, and it is unit 0's server-assigned-versus-echoed
`messageId` question in a different costume.

M1/M3/M8 taken as proven at `27a161b1`: `git diff 27a161b1 0181eedc` touches
`cli/tests/spawn.rs`, `daemon/src/http/mod.rs`, `daemon/src/http/tests.rs`,
`daemon/tests/review_regressions.rs`, `harnesses/src/spawn.rs` — **none of their
code**. Stated as a decision, not an omission.

## F8 — the absence model now matches the build

Row 1 says `None` means *"never launched with the flags"*. Arm 1 shows a seat that
**was** launched with the flags reading `Some(59475)` after its bind. The two
absences Amendment 2 created the fourth row to keep apart are no longer collapsed
in production. **F8 closes on that observation**, as registered — not on the
receipt's wording.

## The LOW — per-command wording restored, verified behaviourally

```
PROBE_MSG collision        = 400 Bad Request
PROBE_MSG body             = "seat `pij-probe-msg` already exists and is not
                              tombstoned — choose another --id or tombstone it
                              before respawning"
PROBE_MSG mentions_revive  = false
PROBE_MSG launches before/after = 1/1
```

A plain `pij spawn` collision is no longer told about a command the caller did not
run, the refusal still refuses, and **it still launches nothing** — the `1/1` that
matters more than the wording.

## Gate, re-measured at THIS head

```
cd pij-worktrees/s109-rev-head        # detached at 0181eedc, tree clean
export PATH="$HOME/.cargo/bin:$PATH" CARGO_INCREMENTAL=0; unset CARGO_TARGET_DIR
cargo run --locked -p pij-testkit --bin pij-gate
```

2026-08-31T03:52:19Z, 47s, **EXIT 0** — toolchain 1.98.0 / lock / fmt / clippy /
test / arch (9 crates, 0 violations).

Measured here. The main merge has not landed on this head; that is the PM's
deliberate sequencing and the merge happens once, after. **I have not measured a
post-merge head and I am not claiming anything about one.**

---

## A GAP I AM RECORDING RATHER THAN CLOSING

**Nothing in this workspace can test the Rust↔TypeScript env-var seam.** No Rust
test crosses into `.pi/extensions/`, `pij-gate` does not either, and the TS suite
does not launch through `build_spawn_plan`. The correlator's name matching on both
sides is currently guaranteed by **a human reading two literals** — I read them,
and they match at `0181eedc`.

My reading closes this instance. It does not close the class: a future rename on
either side is invisible to every automated check we have, and it would present
exactly as F9 did — a green suite and a fleet of pointer seats. The cheapest
closure is a test that asserts the emitted env-var name against the same constant
the bridge reads, or a shared manifest both sides consume. **Not a blocker for this
unit; a standing hole that F9 has now demonstrated is load-bearing.**

## CHECKED AND NOT RAISED

- **The predicate is unchanged** by the F9 fix and still carries
  `descriptor.proc.is_none()`, so preserve remains a one-shot transition; M6 and M7
  were re-run rather than assumed, and both still fire.
- **The empty-correlator guard** cannot be satisfied by `Some("")` on either side:
  `build_spawn_plan` refuses an empty spawn id at the producer, `launch_env` returns
  `None` for an empty value, and the predicate keeps `!launched.is_empty()`.
- **`PIJ_SESSION_ID` is unchanged** and still first in the argv; the fix added a
  pair, it did not reorder or replace one.
- **No transport code** anywhere in the diff. Unit 1 still ships no reader; the
  read-time possession rule remains unit 2's, written down and assigned.
- **The mechanism fence** is intact — the diff touches `harnesses/src/spawn.rs`,
  which is unit 1's mechanism, and no store or orchestration code beyond what
  rounds 1–3 already closed.
- **F3, F4, F5, F6 unchanged** since round 3 verified them; their code is untouched
  by this diff.

## MY OWN INSTRUMENT ERRORS — nine, across four rounds, none reaching a verdict

Dead red arm on my first probe; an eyeballed field count; `head`-induced SIGPIPE
read as a test failure; a branch detector a rename would have silenced; a reverse
diff read as a landing; a probe that failed to compile; a `sed` matching nothing
silently; a `sed`-based M6 that deleted without inserting and gave `EXIT=101` from a
compile failure; an M8 that did not compile.

**Three of the nine were `EXIT != 0` meaning something other than "the test
failed".** Every mutation red in this report is quoted with its panic line and its
assertion message for exactly that reason — an exit code alone has been wrong three
times on this review and right the rest, and the panic line is what distinguishes
them.

## TREE RESTORED

Four mutations and three probes this round, each applied alone and reverted with
`git checkout --`. `git status --porcelain` empty before the gate run and after the
last revert. The coder's worktree was never touched and its HEAD never moved.

---

## APPROVE

F1, F2, F3, F4, F5, F6, F8, F9 and the LOW are closed, each verified by an
observation I ran at this head. The two arms that decide it:

- **arm 1**, shipped launcher end to end → `Some(59475)` preserved;
- **arm 2**, unmatched registration → cleared, and M6 proves that arm can fail.

R0-1 stays closed while F1 closes, which was the pair no build satisfied at
`3cbd2820`.
