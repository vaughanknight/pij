# Final verdict — u-sidecars · **APPROVE** at `a64c8773`

Reviewer `pij-favourite-araminta`. Nine rounds. Every finding below was closed by
a probe or mutation I ran myself against the shipped surface — never by reading a
commit message.

## Gate, at the composed head, run by me

```
pij-gate: all stages green
binaries: 53   passed: 363   non-ok: 0    tree after: 0 modified
```

`--locked`, fresh target dir. The composed head's code is **byte-identical** to
`e73f96bd`, which I verified independently — `git diff e73f96bd a64c8773 --
crates/ Cargo.lock Cargo.toml` is empty — so the two verifications are one fact,
not two samples.

## The two final fixes, verified by mutation

| mutation | result |
|---|---|
| **M7** — `signal_survivors` made a no-op (`if true { continue; }`) | `survivor_recheck_kills_a_live_pid_in_the_owned_group` **FAILED**: *"the witness must activate SIGKILL, not only exercise the veto"* |
| **M8** — egress guard disabled (`if false && chat_id != …`) | `telegram_refuses_egress_outside_the_configured_operator_chat` **FAILED**: *"wrong-chat request must never reach the bot API"* |

Both restored, tree clean after each.

M8's assertion is on the **bot-API send count**, not on the returned error — it
proves the effect did not happen, rather than that a refusal was reported. That is
the distinction this whole review kept turning on, applied by the coder without
being asked.

M7 closes the gap I raised in round 8: the skip test proved the veto; only its
mirror proves the kill.

## Findings, and what closed each

| # | finding | closed by |
|---|---|---|
| F1 | non-zero exit reported `finished` | shipped daemon: `failed (exit 3/4/5)`, `done (exit 0)` |
| F2 | orphan reported `finished` | planted orphan → `lost`, honestly labelled; and still reachable after the fix, so it discriminates rather than deletes |
| F3 | failed inbound delivery confirmed the update to Telegram | repaired probe: offsets `["0","0"]`, cursor not advanced, `telegram.inbound-delivery-failed` recorded |
| F4 | in-memory cursor replayed after restart | durable `telegram.cursor` spine fact |
| F5 / F9 | one stuck row starved all completions; one retry wedged the runner | shipped daemon: bystander starts, turns deliver |
| F6 | cancel signalled a durable-record pgid with no ownership interlock | planted stale-owner record aimed at a tree I owned → refused, tree untouched |
| F7 | live-fire never run | reply leg verified by me from the store: row 21 `"hi"`, cursor advanced only after |
| F8 | duplicate Telegram post on binding failure | M4: terminal→retry fails the named test |
| F10 | caller-controlled outbound `chat_id` | M8 above |
| F12 | producer reported `FAILED` for work that landed | `pij sidecar: ok`, exit 0 |
| — | `Lost`/`Failed` misclassification | deterministic witness 3/3, then 17 jobs / 4 runs / zero `lost` |
| — | cancel timeout under load | 6/6 workspace runs; M6 still fails with the original signature |
| — | lock-schema divergence (legacy would steal a live Rust lock) | M5: reverting the writer fails `lock_json["startedAt"].is_string()` |
| — | prose branches in the errno path | gone; contract tests pin `Some(3)` / `Some(1)` |
| — | per-pid fallback unwitnessed | M7 above |

Raised and **not** attributable to this unit: the wave-7 base red (stale arch
fixtures), the `arch`-stage instrument observation, and the latched `pid-missing`
on the live relay descriptor — the last filed as a TS registry issue.

## The instrument ledger — nine errors, all mine, all disclosed

Recorded because the reliability of everything above rests on it.

1. A probe that SIGTERMed its own process group (no `setsid`).
2. A zombie row read as a survivor — one step from filing *"SIGTERM does not kill
   the group leader"*, which is false.
3. `tail -12` reporting `0 passed` under `all stages green`.
4. `head`'s exit status read as the command's.
5. An F3 fake refusing `enqueue()` after `enqueue_turn` moved to
   `enqueue_delivery()` — it stopped injecting, and **a clean pass looked exactly
   like the original defect**.
6. A "pre-window" baseline captured 55 s **after** the window closed; verifying by
   delta would have failed a leg that passed.
7. `probe-zombie-contract.py`'s first version called `poll()` while observing —
   **the observer reaped the zombie it was measuring**.
8. That same probe reporting errno *names* — prose again, one layer up, in the
   artefact arguing against prose.
9. A filtered runner reporting **"OK — 5s"** for a gate plus six workspace runs,
   because a hard `--locked` failure matched none of its greps.

Plus one hygiene failure: `cargo test --offline` regenerated `Cargo.lock` in the
worktree it was judging — COMMON 1.4, committed by the reviewer, on the head whose
entire finding was that the lock was missing.

Six were misreadings. #7 was different in kind: an instrument that **destroyed**
the state it reported. None reached a verdict, and two are now permanent habits in
`REVIEWER.md`.

## Verdict

**APPROVE.** The unit ships.

* Gate green at the composed head, run by me, `--locked`.
* Every witness this packet named has been observed to fail under mutation, so
  each green means something.
* The live-fire is real: Jordan's reply reached a seat through the Rust bridge,
  and the legacy path is provably not the receiver.

Nothing is open that I own.
