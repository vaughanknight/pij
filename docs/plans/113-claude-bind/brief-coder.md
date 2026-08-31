# Coder brief — plan 113: the Rust daemon binds a spawned Claude seat (o-prime authored)

From: pij-dominant-vicuna (o-prime). Reply form: `pij send pij-dominant-vicuna "<msg>"`.
ACK with objections or "ack clean" BEFORE building. Load BOTH /pij and /builder skills.
Jordan asked for this IMMEDIATELY — it is the top of the queue, but red-first discipline still applies.

## Mission (one unit: u-bind)
A Claude seat spawned by the RUST daemon gets its `proc` filled in without any human touching
/v1/register. Today the transcript-discovery binder is not ported, `proc` stays null forever, and
`UdsTransport::discover` early-returns on missing proc — so the ENTIRE socket transport (plan 110,
branch s110/claude-delivery, PR imminent) is unreachable for any Rust-spawned Claude seat.

## Acceptance = the demo minus the hand registration
`pij-rs spawn --harness claude --accept-inbound` → wait → `pij-rs send --to <seat> --body "..."` →
`{"outcome":"delivered","origin":"injected-to-transport"}` AND the body appears as a REAL type=user
turn in the recipient's own transcript. No manual /v1/register. That exact rig, sentinels, and
verification one-liners already exist: **get them from pij-fatal-woodpecker before you build**
(`pij send pij-fatal-woodpecker "..."`) — do NOT re-derive them.

## Order of attack (ruled, not optional)
1. FIRST, the cheap fix: `discover()` early-returns on `seat.proc?.pid` — req-0002 specifies a
   PANE-FALLBACK resolution path and the early return kills it exactly when needed. Fix that first;
   it may make the demo pass with no binder at all (the session record carries the tmux pane).
   Witness red-first: the demo rig against a proc:null seat FAILS before, delivers after.
2. THEN the binder: port the TS transcript-discovery loop — watch `~/.claude/projects/*.jsonl`,
   match a freshly spawned pane to its real Claude session + pid, fill the seat's proc via the
   registration path. TS reference: `.pi/extensions/pij/core/discovery.ts` (+ session.ts pane
   self-read). Facts that already cost us: TWO claude homes exist (~/.claude AND ~/.claude-alt) —
   TS hardcodes the first and hand-started primes read as lost; match TS parity but NAME the
   second home in a code comment + your findings; a seat parked at the folder-trust modal
   publishes a socket but NO session record — the record's absence is the honest not-ready signal,
   do not "fix" discovery to bypass it (ruled, plan 110 oq-1102).
3. Respect req-0008 (PRD): your registration writes must not clear live state on re-register
   (known defect — do not extend it; port intents and consent stamps are the named victims).

## Scope
- Worktree: /Users/jordanknight/pi-hacking/pij-worktrees/s113-claude-bind, branch s113/claude-bind.
- Fence: crates/daemon/** (binder + registration path), crates/transport/src/uds.rs (the early-return
  only), crates/harnesses/** if the spawn descriptor needs a field, crates/testkit fakes,
  docs/plans/113-claude-bind/**.
- Forbidden: the-flow files, .harness/government/**, docs/plans/110-** and 111-** (live siblings),
  the frozen receipt vocabulary, main directly.
- Gate: `~/.cargo/bin/cargo run -p pij-testkit --bin pij-gate` (bare cargo is a non-rustup 1.95 trap
  — see docs/plans/110-claude-delivery/assets/toolchain-note.md on the s110 branch).
- Done bar: ACs receipted (red-first), mutation proof on the binder match rule (wrong-pane match must
  fail a test), PR open against main, CI green. Do NOT merge. Coordinate the uds.rs line with
  woodpecker if s110 lands first — rebase, never fork the fix.
