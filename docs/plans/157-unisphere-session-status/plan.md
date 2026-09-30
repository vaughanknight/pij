# Plan 157: pij-rs embeds Unisphere session status

Author: pij-far-jackal (prime), 2026-09-29, for Jordan. Coder: pij-yelling-trout.

## Why
The 2026-09-28 usage blowout RCA found that the daemon needs live per-seat context size, last-call time and cache state to price each `pij send` (cold wake ≈ 40× warm).
- RCA answers: ~/games/unasphere/scratch/usage-blowout/far-jackal-interview.md
- Unisphere is building a harness-neutral `SessionStatus`: Plan 029, owned by pij-specific-kiwi.
  - Branch builder/029-session-status, worktree ~/substrate/unisphere/unisphere-session-status.
  - Plan file: docs/plans/029-session-status/plan.dd.md.
  - It covers Claude first, then OMP and Codex.
- pij-rs will link `unisphere-sdk` in-process. It will not spawn the CLI.

## Scope (this plan)
1. **Port.** A pij-owned trait, e.g. `SessionStatusSource`, in the right pij crate.
   - It returns a pij-side `SeatStatus` for a seat. Keep each fact's basis, or unknown. Never 0 for unknown.
   - Include a fake for tests.
   - pij code never imports Unisphere types outside the adapter.
2. **Adapter.** A new crate or module that implements the port with `unisphere-sdk`.
   - Dependency: a git dependency on github.com/AI-Substrate/Unisphere, pinned by `rev`. No path deps to ~/substrate.
   - Verify that cargo can fetch it, locally and in CI. The repo may be private; if so, report it and don't work around it.
   - Pin to the 029 branch rev until 029 merges, then move to main.
   - Ratify the new externals in `crates/testkit/arch-allowlist.toml` and regenerate the arch fixtures (they use /workspace/pij paths).
3. **Per-seat cursor.** Keep one fold cursor per seat, reading only appended bytes, if 029's SDK exposes that. If it doesn't, record what's missing and ask kiwi (pij-specific-kiwi) with ONE message.
4. **Read-only surface** to prove the wire end to end. For example, `pij state <seat> --json` gains a `session_status` block, or a `pij status` verb.
   - The proof is a real run against live Claude seats with real numbers, not only a fake.
   - Measure the latency for all seats. The target is under 100 ms warm.
5. **Busy/idle stays pij's own.** Take it from the daemon, not from Unisphere.

## Out of scope
- Send-pricing guards: wake guard, file inbox, coalescing, budget breaker (#446). Jordan decides those next.
- Account 5-hour and weekly usage %.
- Any change to the Unisphere repo. Ask kiwi.

## Done when
- The port, the fake and the adapter are merged to pij main.
- The allow-list has been ratified.
- harness checks is green.
- A live proof on real seats has been recorded in docs/plans/157-unisphere-session-status/evidence/.
- The daemon has been bounced: pull main first, then `just bounce-rs`.

## Phase 2 (Jordan, 2026-09-29): the cold-wake guard on `pij send`
Rulings: #446 (comment of 2026-09-29).
- **Rule.** Per recipient: context > 300k AND last API call > 60 min ago AND the daemon doesn't see the seat working ⇒ refuse the send, code `E-RS-COLD-WAKE`. Keep the thresholds as named constants in one place.
- **Refusal message** carries the price, e.g. `pij-x is cold (idle 1h52m, 720k context). Waking it rewrites ~720k tokens ≈ $5.76 at list price. Use --fyi to hold it, or --force --reason "<why>".`
  - The price table is model → cache-write $/M, labelled an estimate. Opus 5.5 is $8/M for a 1h write.
- **`--force` requires a non-empty `--reason`.** Record both, with the estimate, as a spine event (the audit of every forced cold wake).
- **Never refused:** `--fyi` (it doesn't wake), control commands (compact etc.), and a recipient that is busy.
- **Multi-recipient sends are checked per recipient:** the others are delivered, and the receipt lists who was refused and why.
- **Unknown data** (harness unsupported, Unisphere error, no transcript) ⇒ ALLOW, and the receipt says `cold-check: unknown`. The guard is a brake: it may only ever refuse; it never changes what's delivered.
- **Every send surface:** the CLI, the OMP/Pi `pij_send` tool (`force`, `reason`) and the Copilot extension tool. Tool descriptions say to prefer `fyi`.
- **Skill:** the peer route and prime protocol rule 1 cite the guard.
- **Proof:**
  - tests RED first;
  - live refusal against a real seat that is over 300k and idle over an hour (a refusal sends nothing, so it costs nothing);
  - the --force path in tests only, or against a small seat. Never wake a big cold seat just to prove it.

## Merge gate
The Unisphere dependency must be a pinned git rev, which needs the repo public and 029 pushed. Until then, keep the local path dep on the branch and prove it live from the worktree build, NOT the production daemon.
