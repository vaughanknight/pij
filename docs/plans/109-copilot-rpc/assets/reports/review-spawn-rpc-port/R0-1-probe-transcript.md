# R0-1 — probe transcript: does `register` inherit the spawn-time stamp?

Committed beside the claim (F0-7). The probe source as it was run is
`R0-1-probe-register-inherits-stamp.rs.txt` in this directory; it was appended to
`crates/daemon/src/http/tests.rs` for the run and **the tree was restored
afterwards** (`git checkout -- crates/daemon/src/http/tests.rs`, verified clean).

- Worktree: `pij-worktrees/s109-review-spawn-rpc-port`, branch
  `s109/review-spawn-rpc-port`
- Product commit under test: `83cad081` (= `s109/copilot-rpc` head at review
  start; docs-only, **no unit-1 code**)
- Reviewer commit at run time: `4a5811ac`
- Wall clock: 2026-08-31T02:27:39Z
- `CARGO_TARGET_DIR` unset — per-worktree `target/` (SHAPE requirement, E-037)

## Command

```
export PATH="$HOME/.cargo/bin:$PATH" CARGO_INCREMENTAL=0
cargo test -p pij-daemon --lib \
  reviewer_probe_does_register_inherit_the_spawn_stamp -- --nocapture
```

## Output (verbatim, untruncated apart from the compile lines)

```
running 1 test
PROBE at_spawn          = Some(true)
PROBE after_register    = Some(true)
PROBE red_arm_status    = 200 OK
PROBE red_arm_never_set = None
test http::tests::reviewer_probe_does_register_inherit_the_spawn_stamp ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 88 filtered out; finished in 0.01s
```

## What distinguishes the two states (stated before the run)

| world | `after_register` prints |
|---|---|
| register INHERITS the stamp | `Some(true)` |
| register RESETS the stamp | `None` |
| seat never spawned (red arm) | `None` |

Every arm yields a **positive artifact**; no arm is an absence. The red arm is
what makes the green mean anything: it shows the probe's output tracks the field
rather than always printing `Some(true)`.

## Both routes are the SHIPPED ones

`POST /v1/spawn` → `spawn_seat` (`crates/daemon/src/http/mod.rs:429`) and
`POST /v1/register` → `register` (`:261`), over a real `axum::serve` listener on
a real TCP socket via `reqwest`. No handler was called directly.

## My own instrument error, disclosed

**First run of this probe had a dead red arm.** I reused one `ProcIdentity` for
both the spawned seat and the never-spawned seat, so the fresh registration was
refused by the #19 alias guard:

```
PROBE red_arm_status    = 400 Bad Request
PROBE red_arm_body      = {"ok":false,...,"meta":"a subagent of pij-probe-open,
                          not a seat: it inherited PIJ_* from its parent","error":"refused"}
```

The **green arm was already correct in that run** — `after_register = Some(true)`
was printed and is unaffected — but the red arm measured nothing, which would have
left the green as a formality. Fixed by giving the never-spawned seat its own
`(pid, proc_start)`; re-run above. Recorded rather than quietly corrected, because
a probe whose negative arm silently fails to run is precisely the class this plan
keeps paying for.
