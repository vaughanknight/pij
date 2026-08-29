# Coder packet — u-models (wave 3)

**Spawn form (pinned, Jordan)**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high --layout window`
— OMP harness, never the copilot CLI harness, and **its own tmux window, never a
split pane**.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-models` · branch `s108/w3-models`
**Common contract (read FIRST)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-3/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The model catalog: which models exist, on which runtime, from which provider, and
how a user names one. `u-harness` shipped five adapters whose `models()` currently
returns an **error naming you** — deleting that error is your unit's visible edge.

Behaviour-preserving port of s106 semantics (landed `f53a9fde` in TS).

## Scope

* `crates/harnesses/src/models/**` — yours alone; the adapters themselves are
  u-harness's and stay as they are except for the `models()` bodies.
* `crates/testkit/fixtures/cli/models.json` already exists — **use it, do not
  recapture**; index any new fixture you add.
* your tests, allow-list rows, derived files.

## What to build

1. **`ModelCatalog::list(filter) -> Vec<ModelRow>`** assembled from the harness
   adapters. `ModelRow` already exists in `core::model` with
   `runtime`/`provider`/`selector`/`request_model_id`/`thinking_levels`.
2. **The three-way separation is the contract**: runtime (which binary runs it),
   provider (who serves it), selector (how a user names it). The corpus fixture
   shows rows where the selector carries no provider prefix — those are real, and
   collapsing any two of the three is the defect this unit exists to prevent.
3. **`thinking_levels` is a `Vec`, empty means none.** The TS output expresses
   "no levels" as `[]` on some rows and by OMITTING the key on others; the raw
   `null` some providers send never reaches pij's output. Three encodings, one
   fact — the fold is already ruled and the corpus asserts it.
4. **Whole-inventory failure on a malformed row.** One bad row invalidates the
   catalog rather than silently yielding a model nobody can request. The corpus
   carries `malformed/ts/models-missing-request-id.json` for exactly this.
5. **The parity golden**: `crates/testkit/src/golden.rs` is the mechanism, proven
   in wave 0 against committed bytes. Wire your catalog to it. **Not against a
   live `pij models`** — the live catalog is time-varying (599 rows → 125 in ten
   minutes, measured), so a live golden flaps for reasons unrelated to this port.

## Done bar

* Gate six stages green; the five adapters' `models()` no longer error.
* Golden against the committed TS fixture; malformed-row rejection by
  set-equality.
* **Mutation evidence** on the whole-inventory failure (make one bad row survive)
  and on the levels fold. Break, watch the named test fail, restore, transcript.
* Report committed and pushed before the done message.
