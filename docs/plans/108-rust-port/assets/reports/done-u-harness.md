# u-harness done report — plan 108 wave 2

**Unit**: `u-harness`  
**Branch**: `s108/w2-harness`  
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness`  
**PM**: `pij-revolutionary-lungfish`  
**Date**: 2026-08-29

## Delivered

- Five distinct `HarnessPort` adapters: `ClaudeHarness`, `CopilotHarness`, `CodexHarness`, `PiHarness`, and `OmpHarness`.
- `HarnessRegistry`, keyed by every frozen `Harness` variant. It is deliberately not a composite `HarnessPort`, because a composite cannot return one truthful `kind()`.
- Per-harness discovery, bind validation, readiness, busy classification, and an honest `models()` refusal naming the wave-3 `u-models` owner.
- `ObservedBindFacts` and `BindObservation`. Concrete `observe_bind` accepts the caller-observed native session id, validates it with pane/model/cwd evidence, and delegates the decision to `pij_core::admission::admit`; it does not re-derive admission.
- `InteractionGate`, the named stateful typing gate. Injection is permitted only when both independent clear verdicts hold: `!TmuxPort::user_typing(pane)` **and** no composer/tap interaction. Unknown composer state is not permission.
- Recorded-pane contracts for Claude, Copilot, Codex, Pi, and OMP. Pi and OMP each have ready/working evidence proving that their shared footer/chrome is not a ready signal while the spinner is active.
- Codex never-bind regression: a rotating `Use /skills` placeholder without the persistent model/effort/cwd footer remains `Readiness::NotYet`, carrying the observed text.

Primary implementation:

- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness/crates/harnesses/src/adapter.rs`
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness/crates/harnesses/src/interaction.rs`
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness/crates/harnesses/src/lib.rs`

## Real fixture evidence

Addressable corpus entries live under:

`/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness/crates/testkit/fixtures/harnesses/`

Important pairs:

- `pi-pane-ready.txt` / `pi-pane-working.txt`
- `omp-pane-ready.txt` / `omp-working.txt`
- `codex-rotated-placeholder-ready.txt` / `codex-placeholder-only.txt`

No test touched the live tmux fleet or a live pij seat process. The PM captured Pi/OMP fleet evidence; tests consume committed bytes through `FakeTmux`.

### Decision: no manufactured idle fixture

The available OMP capture initially contained `⠋ Working… ⟦esc⟧`; deleting that spinner would have manufactured an idle state that was never observed. I refused to do that and asked for a real idle capture. The PM supplied `omp-pane-ready.txt`; the paired test now proves the real distinction.

The first PM-supplied `pi-pane-ready.txt` also contradicted its own manifest answer: the file was exactly 16 newline bytes, while the answer described MCP failures, prompt, separators, footer, and seat name. SHA and byte count agreed only because they faithfully hashed the wrong bytes. I relayed the contradiction unchanged. The PM re-captured from the last non-blank row, added a non-blank assertion, and supplied the corrected 1620-byte fixture. This is why tests read content against the answer rather than trusting metadata.

Corpus proof:

```text
cargo test --locked -p pij-testkit --test corpus \
  the_manifest_and_the_corpus_agree_both_ways -- --exact

1 passed; 0 failed
```

## Typing gate truth table

`interaction::tests::injection_requires_both_tmux_and_composer_gates_clear` enumerates all four states:

| tmux `pane_in_mode` | composer/tap interaction | injection |
|---:|---:|---:|
| false | false | permit |
| false | true | block |
| true | false | block |
| true | true | block |

The documentation at the tmux end already states that `user_typing == false` means only “no tmux-observable interaction.” `InteractionGate` documents the other end and the AND of the two clear verdicts.

## Mutation evidence

### Codex rotating placeholder is not an anchor

Mutation:

```rust
Harness::Codex => text.contains("Use /skills") || text.lines().any(is_codex_footer),
```

Command:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-harness-target CARGO_INCREMENTAL=0 \
cargo test --locked -p pij-harnesses \
  adapter::tests::codex_rotating_placeholder_is_not_a_readiness_anchor -- --exact
```

Observed failure:

```text
test adapter::tests::codex_rotating_placeholder_is_not_a_readiness_anchor ... FAILED
rotating placeholder must remain NotYet, got Ready
0 passed; 1 failed
```

Restored to the persistent footer anchor; the harness suite returned green.

### Admission depends on observed bind facts

Mutation: passed literal `true` to the shared admission candidate instead of the computed `facts_match` value.

Command:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-harness-target CARGO_INCREMENTAL=0 \
cargo test --locked -p pij-harnesses \
  adapter::tests::bind_evidence_depends_on_observed_cwd_model_and_process -- --exact
```

Observed failure:

```text
test adapter::tests::bind_evidence_depends_on_observed_cwd_model_and_process ... FAILED
left: Admit
right: Refuse(NoBindEvidence)
0 passed; 1 failed
```

Restored to `facts_match`; the harness suite returned green.

## Verification

Toolchain and disk:

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
1.98.0-aarch64-apple-darwin (rust-toolchain.toml override)
/dev/disk3s5: 242 GiB available
```

Focused behavior:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-harness-target CARGO_INCREMENTAL=0 \
cargo test --locked -p pij-harnesses

21 passed; 0 failed; 2 doctests ignored
```

Canonical final gate, after the OMP ready/working pair landed:

```text
PATH="$HOME/.cargo/bin:$PATH" \
CARGO_TARGET_DIR=/tmp/pij-w2-harness-target \
CARGO_INCREMENTAL=0 \
cargo run --locked -p pij-testkit --bin pij-gate

pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

`git diff --check` produced no output. Rust LSP diagnostics: zero issues in `crates/harnesses/src/**/*.rs`.

`harness boot` was also attempted before coding and failed at the pre-existing TypeScript `just typecheck` stage. This is the wave-0 documented node-harness gap; the Rust definition of done is the green `pij-gate` above.

## Composition recipe

The PM owns the composition-root edit in `crates/daemon/src/lib.rs`:

```rust
use pij_harnesses::HarnessRegistry;

pub harnesses: HarnessRegistry,

let harnesses = match config.adapters.harness {
    AdapterChoice::Fake => HarnessRegistry::new([
        Arc::new(FakeHarness::new(Harness::Claude)) as Arc<dyn HarnessPort>,
        Arc::new(FakeHarness::new(Harness::Copilot)),
        Arc::new(FakeHarness::new(Harness::Codex)),
        Arc::new(FakeHarness::new(Harness::Pi)),
        Arc::new(FakeHarness::new(Harness::Omp)),
    ])?,
    AdapterChoice::Real => HarnessRegistry::real(tmux.clone()),
};
```

This changes `Services::harness` to `Services::harnesses`, deletes
`not_yet("harness", "u-harness, wave 2")`, and lets callers select with
`harnesses.get(descriptor.harness)`. Real bind callers use
`harnesses.observe_bind(descriptor, native_session_id, subagent_of)`.

## Shared-merge and derived files

Touched during the unit and regenerated from the branch tree:

- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness/crates/testkit/fixtures/MANIFEST.toml`
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness/crates/testkit/fixtures/arch/clean-metadata.json`
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness/crates/testkit/fixtures/arch/drifted-metadata.json`

`Cargo.lock` was checked by the gate and required no authored change. Derived arch conflicts from PM merges were resolved only by regeneration from `cargo metadata`, never by hand-merging JSON.

## Assumptions

1. Native session id is caller knowledge, not pane text: Claude/Codex supply transcript or rollout discovery; Copilot supplies the planned session id; Pi/OMP supply phonehome evidence. `None` remains a valid absent fact and produces named `BindHealth::Unbound` evidence.
2. Pane-observed facts are not silently filled from the descriptor. A cwd/model mismatch refuses admission; a missing native session id never becomes an empty string or a guessed value.
3. `HarnessPort::bind` validates and does not mutate `SeatDescriptor`. The concrete `observe_bind` returns facts for the caller to persist.
4. `HarnessPort::models()` returns `PijError::Adapter` until `u-models` lands in wave 3. An empty vector would falsely claim a harness has no models.
5. Pi and OMP remain distinct `Harness` variants, adapters, and idle anchors. Similar chrome does not collapse their session artifacts or bind provenance.
6. OMP readiness was not manufactured by editing a working capture. Missing evidence was treated as missing and escalated until a real idle capture existed.
