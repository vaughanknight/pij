# Coder packet — u-harness (wave 2)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast-1m --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-harness` · branch `s108/w2-harness`
**Common contract (read FIRST, including § 9)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-2/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The four harnesses (claude, copilot, codex, pi/omp) behave differently in ways
that have bitten this fleet repeatedly, and this unit is where those differences
are allowed to live. **It also deletes the `harness` refusal** — the last one
before wave 3.

## Scope

* `crates/harnesses/**` — except `proc.rs`, which u-liveness shipped in wave 1
  (extend it only if you must, and say so).
* your fixtures under `crates/testkit/fixtures/harnesses/**` (index them in
  `MANIFEST.toml` — another unit WILL cite them), allow-list rows, derived files.

## What to build

1. **`HarnessPort` for all four**, per the frozen trait: `kind`,
   `discover_session`, `bind`, `readiness`, `busy`, `models`.
2. **Bind evidence carries pane + model + cwd** (R5 items 13-15). The descriptor
   fields already exist (`spawn_id`/`model`/`provider`/`effort`, PM seam
   `de858841`) — **populate them**; do not add parallel ones. The class being
   closed: the registry row lacked facts another surface already held.
3. **Readiness anchors are per-harness and drift.** Test them against **captured
   pane fixtures**, including the codex never-bind case where a rotating
   placeholder was mistaken for an anchor. `Readiness::NotYet` carries what was
   observed *because* a bare timeout is undiagnosable.
4. **#19 subagent scoping.** A child process inherits `PIJ_*` from its parent and
   can CLAIM to be a seat; it cannot manufacture bind evidence for a session that
   is not its own. `core::admission` already encodes the decision and its case
   table — **use it, do not re-derive it**, and add the harness-specific facts it
   needs as inputs.
5. **THE TYPING GATE — a named deliverable of this unit** (COMMON § 9.3). The
   stateful composer-interaction gate lives here and ANDs with
   `TmuxPort::user_typing` (`pane_in_mode`). Until both agree, `false` from either
   means "no observable interaction", **never** "safe to inject". Document the
   AND at both ends.
6. **Composition recipe** replacing `not_yet("harness", "u-harness, wave 2")`.

## Done bar

* Gate green; contract tests over recorded pane fixtures **per harness**.
* The readiness-anchor regression (rotating placeholder ≠ anchor), named for the
  incident.
* The typing gate proven as an AND: either side false ⇒ do not inject.
* **Mutation evidence** on one readiness anchor and on the admission input path.
* Report committed and pushed before the done message.
