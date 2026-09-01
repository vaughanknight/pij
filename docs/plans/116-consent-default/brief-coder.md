# Coder brief — plan 116: inbound-delivery consent ON by default (o-prime authored)

From: pij-dominant-vicuna (o-prime). Reply: `pij send pij-dominant-vicuna "<msg>"`.
ACK with objections or "ack clean" BEFORE building. Load BOTH /pij and /builder skills.

## The decision (already made — this is execution, not deliberation)
Jordan ruled 2026-09-01: **inbound-delivery consent is ON by DEFAULT for daemon-spawned
Claude seats.** This settles plan 110's oq-1101, which was deliberately left open because
consent is an act, not a default flipped on an operator's behalf — the operator has now
performed that act.

Precondition already met (do not re-open it): the held-delivery backoff-and-park landed in
plan 110 (cfbee122). Without it, a held message retried at zero delay and raised a fresh
approval dialog each time — a dialog storm at the operator. THAT COUPLING WAS THE WHOLE
REASON THE DEFAULT STAYED OFF. Verify the backoff is present on your tree before you flip
anything, and say so in your receipt.

## Scope
- Worktree: /Users/jordanknight/pi-hacking/pij-worktrees/s116-consent-default, branch s116/consent-default.
- Fence: `crates/harnesses/src/spawn.rs` (the stamp is derived from the EMITTED argv at
  ~:82/:133/:163 — keep that property), `crates/cli/src/main.rs` (the flag surface),
  tests, `docs/plans/116-consent-default/**`.
- Forbidden: crates/transport internals, the receipt vocabulary, .harness/**, skills/**,
  other plans' folders, main directly.

## What to build
1. Daemon-spawned **claude** seats get inbound consent stamped by default.
2. An explicit **opt-OUT** must exist and work (`--no-accept-inbound` or equivalent — pick the
   shape that matches this CLI's conventions and say why in your ACK). Consent that cannot be
   withdrawn is not consent; revocation must be an ACT, available at spawn.
3. `--accept-inbound` keeps working as an explicit affirmation (no breakage for existing callers).
4. Non-claude harnesses still REFUSE the setting by name, exactly as today (spawn.rs:82) — the
   default must not silently apply where the runtime cannot honour it.
5. **The stamp must stay derived from the emitted argv, never asserted.** That property is why
   the descriptor can be trusted; a default that stamps `true` without the argv actually carrying
   the setting would reintroduce the stamp/reality drift plan 110 named as its only production
   trigger (oq-1104). If you cannot preserve derivation, STOP and tell me.

## Test bar (red-first, and a compile error is not a red witness)
- Default path: spawn claude with no flags -> emitted argv carries the setting AND the descriptor
  stamp is true, both asserted.
- Opt-out path: the flag suppresses BOTH the argv and the stamp.
- Non-claude: still refused by name.
- Discriminating arm: a stamp of `true` with the setting ABSENT from the emitted argv must be
  impossible — assert derivation, not the value.
- Mutation proof: revert the default and the default-path test must fail.

## Done bar
`~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` green (read the VERDICT BLOCK; a pipe
launders the exit code). PR open against main, CI green. Do NOT merge.
