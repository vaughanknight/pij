# Reviewer pre-round note — the gate is RED at the wave-7 base

Reviewer `pij-central-crane` (u-cutover-controls). Raised **before** round 1 because it is
not about the unit under review: it is about the surface that unit's definition of done is
measured on, and it blocks **both** wave-7 units equally.

Raised under REVIEWER.md § "Report your own red" — characterise, do not re-run until green.

## What

`cargo run --locked -p pij-testkit --bin pij-gate` at HEAD `80bb0317` (wave-7 dispatch commit,
no unit code yet):

```
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests, and the tree
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      FAIL  exit exit status: 101
  arch      PASS  8 crates, 0 violations

pij-gate: 1 stage(s) failed — test. The task is not done.
```

Two failures, both in `crates/testkit/tests/arch_drift.rs`:

```
---- drifted_metadata_is_refused_with_the_reason_named ----
crates/testkit/tests/arch_drift.rs:59: exactly the two planted edges should be refused, no collateral:
  [ForbiddenExternal { crate_name: "pij-core", dep: "tokio", kind: Normal },
   BannedEverywhere  { crate_name: "pij-store", dep: "mockall", kind: Dev },
   StaleRule         { crate_name: "pij-tmux", dep: "tokio", kind: Normal }]
  left: 3   right: 2

---- clean_metadata_passes ----
crates/testkit/tests/arch_drift.rs:80: the same workspace without the planted edges must be green
  left: [StaleRule { crate_name: "pij-tmux", dep: "tokio", kind: Normal }]   right: []
```

## Why (cause is named, not guessed)

| fact | evidence |
|---|---|
| live `pij-tmux` depends on `tokio` | `crates/tmux/Cargo.toml:13` — `tokio = { workspace = true, features = ["time"] }` |
| the allow-list permits that edge | `crates/testkit/arch-allowlist.toml:79-85` — `[crates.pij-tmux]`, rationale names tokio's timer |
| the committed fixtures do **not** contain that edge | `jq` over both fixtures: `pij-tmux` deps are `async-trait, pij-core, pij-testkit` only |
| the edge arrived in | `5a2a2c09` *fix(rust): verify tap ownership and pointer facts* (wave-6 finding-closing commit) |
| the fixtures were last regenerated in | `b9178984` *feat(daemon): add safe bounce lifecycle* — i.e. before `5a2a2c09` |

So the permission is real and used in the **live** graph (which is why the `arch` stage is
green: 8 crates, 0 violations) and unused in the **snapshot** graph, where the checker
correctly reports it as `StaleRule`. `arch_drift.rs:17-27` documents this exact symptom and
the exact remedy.

This is REVIEWER.md § 2 *"a FIX landed in one half"* (E-029/E-031) applied to `5a2a2c09`
itself: dep added, permission added, **derived fixture not regenerated**. COMMON § 3 classes
`crates/testkit/fixtures/arch/{clean,drifted}-metadata.json` as *derived — regenerate, NEVER
hand-merge*, so the omission is a missed step in a documented procedure, not a judgement call.

## Not flake — characterised per E-13/wave-6 class 13

- Isolated re-run, 3 consecutive: `test result: FAILED. 4 passed; 2 failed` each time, 0.02s.
- Zero compile load involved; the assertion is over committed JSON.
- Deterministic, so unlike wave 6's tick-count settle this is a real red, and a re-run will
  never clear it.

Tree after every probe: unchanged — `git status --short` shows only the two unrelated
`*.bak-leanctx-eradication-20260830` files that COMMON § 3 says to ignore. Own
`CARGO_TARGET_DIR=/tmp/pij-w7-review-crane-target`; HEAD never moved.

## The fence problem this creates

Both wave-7 packets define done as "gate green". Neither packet's write fence includes
`crates/testkit/fixtures/arch/**`, and COMMON § 3 makes it a regenerate-only path. So as
written, **neither coder can reach their own definition of done without writing outside their
fence** — the units are gated on a defect they did not cause and are not permitted to fix.

Remedy is one command from `arch_drift.rs:21-27`, followed by re-planting the two drifted
edges; it needs an owner assigned by the PM, not a unilateral edit by a coder or by me.

## Consequence for this review

Until the base is green I will grade the unit on the **delta**: the five stages that pass at
base must still pass at the unit's head, and `test` must fail with these two failures and
nothing else. A third failure is the unit's. A green `test` stage claimed in a wave-7 receipt
without the fixtures being regenerated is itself a finding, because it cannot have been
observed at this base.
