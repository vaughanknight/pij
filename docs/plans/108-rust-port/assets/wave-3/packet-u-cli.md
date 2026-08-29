# Coder packet — u-cli (wave 3)

**Spawn form (pinned, Jordan)**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast-1m --effort high --layout window`
— OMP harness, never the copilot CLI harness, and **its own tmux window, never a
split pane**.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w3-cli` · branch `s108/w3-cli`
**Common contract (read FIRST)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-3/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The verb surface — the only part of this port a human touches. `pij-rs` currently
has `daemon` and `ping`; you make it a CLI, and you make the parity tripwire real.

## Scope

* `crates/cli/**` — yours.
* `crates/testkit/fixtures/cli/**` and `MANIFEST.toml` (append) for goldens.
* your tests, allow-list rows, derived files.

## What to build

1. **Each verb is a thin `fn(client, args) -> Envelope` plus a rendering.** Two
   faces — human and `--json` — from ONE value, so they cannot disagree about what
   happened. The daemon decides; the CLI relays. A CLI that computes its own
   verdict is a second implementation of the daemon.
2. **Version skew is guarded by the envelope `v`.** CLI and daemon ship in one
   binary, so they cannot skew on one machine — but a CLI CAN now meet a peer
   daemon of a different generation (§ federation). Refuse a `v` you do not
   understand; never half-read it.
3. **Goldens for COMPUTED payloads only.** Editorial content (help text, prose)
   gets shape assertions — freezing prose means every wording fix is a test
   failure and the suite trains people to re-record without reading. The golden
   mechanism is `pij_testkit::golden`, already negative-tested.
4. **The exit-code contract is a table**, not an accident: success, refusal,
   not-found, auth failure. Assert it.

### Federation (req-0017) — your half

5. **Parse `<seat>@<machine-alias>`.** An unqualified name **always** means local
   — that invariant is the whole reason single-machine usage is unchanged, so it
   gets its own test, not a comment. Decide and state in your ack: what does an
   empty machine part (`seat@`) mean? What about a seat id that legitimately
   contains `@`? Those are the cases a parser gets wrong six months later.
6. **Address rendering round-trips**: what you print, you must be able to parse.

## Done bar

* Gate green; byte-goldens for computed payloads against committed fixtures;
  clap surface snapshot; the exit-code table asserted.
* `seat@machine` parse table including the degenerate cases you name in your ack,
  and the unqualified-means-local invariant as its own named test.
* **Mutation evidence** on the address parser and on the envelope-version refusal.
* Report committed and pushed before the done message.
