# Review baseline — u-sidecars (wave 7)

Reviewer `pij-favourite-araminta`. Written BEFORE the unit landed, so the base it
is graded against is a measurement rather than a memory.

Method: `assets/REVIEWER.md` — verify claims by behaviour, re-run every mutation
myself, probe the shipped surface, restore the tree after each probe and say so.

## 1. Where I review from

Probes run in my own detached worktree, never in the shared tree:

```
git worktree add --detach /Users/jordanknight/pi-hacking/pij-worktrees/s108-review-sidecars <sha>
CARGO_TARGET_DIR=/tmp/pij-review-w7-target
```

HEAD is never moved in `s108-rust-port`. Mutations are applied in the review
worktree and reverted there.

## 2. Base gate — run by me, at the head I grade from

Head `6987332e` (composed head after the fixture regeneration).

```
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

Test count corroborated independently rather than taken from the receipt:
`cargo test --locked --workspace` → **49 test binaries, 342 passed, 0 failed**.
This matches the PM's and prime's reported 342.

Observed toolchain: `rustc 1.98.0 (88d9e12ae 2026-08-18)`, `cargo 1.98.0
(797e8a9bc 2026-08-05)`. Disk on `/`: 173Gi available.

**A red I caused in my own instrument, disclosed.** My first green-base run piped
the gate through `tail -12`, which discarded every per-binary `test result:` line
and left the log reporting `0 passed`. The gate verdict was intact; the count was
not. I re-ran to recover it. A truncating probe that keeps the verdict and drops
the evidence is the same shape as the defects this plan keeps finding, and it is
worth recording that it happened to the reviewer.

## 3. The base was RED before this, and the diagnosis is kept for the instrument

At `9541b5db` — the head the wave-7 packets were written at — the gate failed:

```
test  FAIL  exit status: 101   (arch_drift: 2 of 6)
arch  PASS  8 crates, 0 violations
```

`cargo test --locked -p pij-testkit --test arch_drift`, isolated, 0.02s,
deterministic, not load-dependent:

* `clean_metadata_passes` → `[StaleRule { pij-tmux, tokio }]`, demanded `[]`
* `drifted_metadata_is_refused_with_the_reason_named` → 3 violations, demanded 2

Cause proven from content, not inference: `5a2a2c09` added `tokio` to
`crates/tmux/Cargo.toml` **and** to `[crates.pij-tmux] external` in
`crates/testkit/arch-allowlist.toml`, and its `--stat` is exactly those two files
— neither arch fixture. Both fixtures still described `pij-tmux` as
`async-trait,pij-core,pij-testkit`, so the rule had no edge to match.

**Closed, and not a unit finding.** Regenerated at `56ad8ebe`; both fixtures now
carry `async-trait,pij-core,tokio,pij-testkit`, and I re-ran the gate at
`6987332e` myself (§2). It is recorded here because it is not attributable to
`pij-mammoth-ostrich` and must never be graded against u-sidecars. E-029 shape: a
fix commit landed in one half.

### The part that outlives the fixture — a finding against the INSTRUMENT

> The `arch` STAGE is green because it judges the LIVE graph, which does have the
> edge — so the one stage named after architecture exonerates the thing that is
> wrong, and the failure surfaces under `test`, where a reader looks for unit
> defects.

A gate whose architecture stage passes while the architecture snapshot is stale
misroutes its own failure into the stage where every coder hunts for their own
bugs. Two honest exits: `arch` judges the derived fixtures too, or the drift test
reports under a name that does not read as a unit failure. Adopted by the PM as a
wave-7 harness finding; carried into my verdict notes as a review-method
observation, **not** as a u-sidecars finding.

## 4. Pre-registered probes — declared before the unit exists

Registered in advance so the unit is graded against a standard it could not be
retrofitted to, and so a pass cannot be assembled after the fact.

### P1 — bg cancel kills the process group, receipt exists only after observed death

The legacy path is the thing to beat. `.pi/extensions/pij/core/cli.ts:3516-3518`
signals with `killProcessGroup(record.pgid, "SIGTERM")` and then persists and
delivers on the *return value* — `process.kill(-pgid, sig)` returning true means
the signal was accepted, never that anything died. That is issue #322 and
command-success-is-not-effect exactly.

I will: run the witness live; then mutate the shipped path by removing the
await-observed-exit and require the named test to FAIL. A witness never observed
to fail is a claim (E-031). Any surviving pid in the tree at receipt time is a
finding.

### P2 — each consumer's LOOP survives a transient failure (E-030)

The bar is set by the shipped exemplar, not by my opinion:
`crates/daemon/src/pointer/worker.rs:1599` drives the real `start()`/`shutdown()`
wrapper through a fake whose `ack_delivery` injects one transient error, and
asserts the loop processes the NEXT message. A test that reconstructs the loop
proves the reconstruction. One mutation per consumer.

### P3 — a count is an observation, never the configured limit

Class 10, and the shipped counter-example is
`crates/daemon/src/pointer/worker.rs:483-487`: the announcement is reconstructed
(`state.announcements + 1`) and the policy constant is used only to decide
`final_announcement`. I will find one place where the observed value and the
configured bound must differ and test there — ordinary paths coincide by
construction, so a test at the limit proves nothing.

### P4 — every fix names the path it executes on (E-031)

Each fixed branch must be reachable through the shipped pipeline, not only
through a test that calls it directly.

### P5 — the telegram round trip cannot be graded on the outbound half

Registered before the live-fire, because the two halves do not fail together.

The legacy TS bridge is **running**: `~/.pij/pij-telegram.lock` =
`{"pid":59939,"startedAt":"2026-08-28T04:32:45.261Z"}` and `ps -p 59939` shows
that pid alive (node, started Fri Aug 28 14:32:44 2026).
`.pi/extensions/pij/telegram/lockfile.ts:1-10` states the constraint first-party:
exactly one process may hold the `getUpdates` stream for a bot, or Telegram
answers 409 Conflict.

* **Outbound** (`sendMessage`) takes no lock and works with the TS bridge up. The
  message reaches Jordan's phone either way.
* **Inbound** (his reply) is single-consumer. With the TS bridge still polling,
  the reply is delivered by the LEGACY path.

So the exact half Jordan's amendment added is the half that can be served by the
code we are replacing, while every artefact still looks like a pass: a real
message, a real reply, a real injected turn. Accepting it would be a fixture that
passes for the wrong reason, on the one leg that exists to prevent that.

Evidence I will require for the reply leg — **both**:

1. the injected turn present as a row in the pij-rs store spine (`~/.pij-rs`,
   table `spine_events`; the directory does not exist yet, so the dev instance
   creating it is itself part of the proof), and
2. the legacy bridge demonstrably not the receiver for that window — lock
   released or pid 59939 stopped, plus no new entry in
   `~/.pij/pij-telegram/inbox/` for that reply.

If (1) holds and (2) does not, the leg is one-way-only, which the amendment says
is not a pass.

### P6 — ancestry, and evidence that postdates the green base

The unit must MERGE composed head `6987332e` (ancestry, not cherry-pick), and its
gate evidence must postdate that merge. `git merge-base --is-ancestor 6987332e
<unit head>` is the check.

## 5. Standing

Nothing of u-sidecars exists at `6987332e`: no `crates/sidecars/`, no
`crates/daemon/src/sidecars/`, no `done-u-sidecars.md`. This file records the base
and the standard only. No verdict is expressed here.
