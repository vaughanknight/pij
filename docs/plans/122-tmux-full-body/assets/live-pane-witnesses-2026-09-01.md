# s122 live pane witnesses — 2026-09-01

## Rig

Source-loaded `target/debug/pij-rs` from this worktree; isolated daemon `127.0.0.1:17461`; state `/tmp/pij-s122-live-122`; migrated store `user_version=11`.

Clients were started by hand with `tmux new-window`, not `pij spawn`:

- OMP v18.0.3: pane `%2182`, isolated seat `pij-round-firefly`, launched with `omp --no-extensions --no-skills --no-rules` to avoid the production daemon's foreign pane tap.
- Copilot v1.0.83-0: pane `%2188`, isolated seat `pij-joint-sharrow`, launched with `copilot` and a fresh session.
- Codex v0.146.0: pane `%2187`, isolated seat `pij-weak-dragonfly`, launched with `codex`; used for the red composer-clobber witness.
- Sender: pane `%2172`, isolated seat `pij-terrible-crow`.

## AC-1 — hand-run OMP receives a full framed body: PASS

Message `s122-live-small-2`; no inbox command was run. OMP received one user turn:

```text
[pij-rs from pij-terrible-crow]
S122-LIVE-SMALL-BEGIN
full body reached OMP without inbox pull
S122-LIVE-SMALL-END
[/pij]
```

OMP's independent report: body byte-identical to the queued payload, 82 bytes across three body lines; head and tail each exactly once. Durable receipt: `delivered_messages.seq=2`, recipient `pij-round-firefly`, origin `typed-to-pane`.

Ground-truth OMP transcript:
`/Users/jordanknight/.omp/agent/sessions/-pi-hacking-pij-worktrees-s122-tmux-full-body/2026-09-01T08-46-58-103Z_01a05c26-7037-7000-9b86-a7ce50ac68d5.jsonl`

## AC-1 — hand-run Copilot receives a full framed body: PASS

Message `s122-live-copilot-1` returned immediately as `delivered / typed-to-pane`. Pane `%2188` showed:

```text
❯ [pij-rs from pij-terrible-crow]
  S122-LIVE-COPILOT-BEGIN
  full framed body reached hand-run Copilot without inbox pull
  S122-LIVE-COPILOT-END
  [/pij]
```

No inbox command was involved. Durable receipt: `delivered_messages.seq=12`, recipient `pij-joint-sharrow`, origin `typed-to-pane`.

## AC-2 — 3000+ bytes arrive intact: PASS on final code

Final message `s122-live-large-3` sent the exact file `/tmp/s122-firefly-large.txt` through Python `subprocess` argv, avoiding shell interpolation.

```text
bytes:  6647
lines:  62
sha256: 2910388ffeafd86448ce8416476f02a8b5ed9fd19d040c839de4465731ae75c8
head:   S122-LARGE-FIREFLY-BEGIN
tail:   S122-LARGE-FIREFLY-END
```

OMP compared its persisted pre-render user turn with the source file:

```text
received chars 6527, source 6527
received sha256 2910388ffeafd86448ce8416476f02a8b5ed9fd19d040c839de4465731ae75c8
zero diffs
framing head x1, tail x1
```

Durable receipt: `delivered_messages.seq=11`, recipient `pij-round-firefly`, origin `typed-to-pane`.

Two live failures preceded the final mechanism and prevented false acceptance:

1. One unpaced paste lost one 16-byte repeated block: sender 3040 payload chars, receiver 3024.
2. One bracketed paste per 1000-byte chunk inserted spaces at framed offsets 1000 and 6000 in the same 6647-byte file.

Final mechanism: one bracketed-paste transaction, UTF-8-safe chunks of at most 1000 bytes paced inside it, one named Enter after the closing marker. The permanent real-tmux regression is `submit_pastes_a_3000_byte_multiline_body_intact`.

## AC-3 — non-empty composer vetoes typed body: RED then PASS

### Red live witness before the richer verdict

The old boolean gate expired a parked draft after 60 seconds. Codex pane `%2187` showed the full body spliced directly onto the operator's draft, then submitted as one turn:

```text
› S122-HUMAN-DRAFT-DO-NOT-CLOBBER[pij-rs from pij-terrible-crow]
  S122-LIVE-CODEX-BEGIN
  full framed body reached hand-run Codex without inbox pull
  S122-LIVE-CODEX-END
  [/pij]
```

This proved that hardcoding `composer_idle=true` after `permits_injection_fresh` was false. Regression tests were added and mutation-proved red by replacing the actual composer fact with `true`:

```text
delivery::tests::expired_nonempty_draft_still_vetoes_typed_body_delivery
  left: Delivered { origin: TypedToPane }
  right: Queued
pointer::worker::tests::expired_nonempty_composer_still_retries_typed_body
  left attempts: 1
  right attempts: 2
```

### Final live witness

Copilot pane `%2188` held this unsent draft:

```text
S122-HUMAN-DRAFT-FINAL-DO-NOT-CLOBBER
```

Sending body `S122-VETO-BODY-MUST-WAIT` returned `queued`. After repeated drain attempts and more than the configured 60-second policy window:

- the pane still contained only the draft;
- the body had not appeared or been submitted;
- job 7 remained pending at attempt 8;
- `delivered_messages` contained no `s122-live-veto-final` row.

After the owned draft was explicitly cleared with `Ctrl-U`, the queued body arrived as its own framed turn. Final ledger: job 7 `done`, attempt 14; `delivered_messages.seq=13`, origin `typed-to-pane`. The body waited; it never degraded to a pointer and never clobbered the draft.

## Receipt-class and version-skew notes

`TypedToPane` is weaker than `InjectedToTransport`: tmux accepted pane bytes, while no recipient process acknowledged them. The schema's closed origin enum now includes every `DeliveryOrigin`: `typed-to-pane`, `injected-to-transport`, `verified-arrival`, `reader-read`; no other origin is missing.

The globally installed pre-s122 `pij-rs` cannot decode `typed-to-pane` and may report an unknown-variant error after a successful delivery. The source-built client in this worktree decodes it correctly. No installed binary was modified during this run.

Migration convergence is explicit: s121 owns ordinal 0010 and schema 10; s122 owns `0011_typed_to_pane.sql` and schema 11. This branch currently has the intentional 0010 gap until s121 merges; the second merger must rebase and reconcile the shared `SCHEMA_VERSION` line and migration order.

## Automated final proof

- `~/.cargo/bin/cargo run --locked -p pij-testkit --bin pij-gate` — all six stages green on Rust 1.98.0: toolchain, lock, fmt, clippy, test, arch (9 crates).
- `cargo test -p pij-daemon expired_nonempty` — 2 passed after both guards were mutation-proved red.
- `cargo test -p pij-daemon a_parked_draft_delays_delivery_and_then_stops_blocking_it` — 1 passed; socket delivery retains the 60-second parked-draft policy.
- `cargo test -p pij-harnesses fresh_verdict_keeps_nonempty_composer_fact_after_policy_expiry` — 1 passed; one capture returns policy permission and actual composer state separately.
- `cargo test -p pij-tmux submit_pastes_a_3000_byte_multiline_body_intact` — 1 passed against a real isolated tmux server.
- `harness checks` was attempted as the repository-wide gate. Its TypeScript/tooling sensors remain unavailable in this worktree: `typecheck` reports missing `@types/node`; the other Node-backed sensors exit 127. This is the packet's ruled pre-existing npm-resolution exception, not a green claim. Prime reports the separate portability fix at `prime/govpath-portability@4225e920`; it is not folded into s122.
