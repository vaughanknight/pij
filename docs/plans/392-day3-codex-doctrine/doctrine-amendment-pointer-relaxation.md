# DRAFT — Pointer delivery follows the clipping precondition

**Status**: DRAFT for o-prime review and single-writer incorporation  
**Targets**:

- `government/doctrine/preconditions-travel-with-remedies.md`
- `skills/pij/references/prime/orient-global.md` iron rule 2

This file proposes wording only. It does not amend government or the portable global
orientation directly.

## Evidence

- `reports/pij-comms-review-2026-08-27.md` (repo-root-relative — NOT this plan folder's `reports/`) §5 (Claude inbox socket, verified live) and §11 / §13
  (PoC + day-2 benchmarks): socket/RPC transport carried ~3 KB bodies byte-exact with zero pane
  keystrokes (§11 C1: 3032 B in 391 ms, 0 keystrokes; §13: "every 3 KB body arrives byte-exact
  with zero keystrokes (claude socket / copilot RPC)"). [orchestrator correction: the earlier
  draft cited `reviews/phase-1-review.md` §5/§11–13 — that flow-pair phase review has no such
  sections; the real provenance is the comms review report above.]
- `.pi/extensions/pij/core/daemon/loop.test.ts` describe
  `routing invariant — body on socket/RPC, pointer only where a pty can clip (plan 392 Phase 4)`:
  - `claude with an inbox socket receives the byte-exact body with zero pane keystrokes`
  - `copilot with rpcPort receives the byte-exact body with zero pane keystrokes`
  - `codex without an endpoint receives one pointer line and never the body`
  - `socketless claude consults the composer-idle guard before typing its pointer`
- The original pointer rule answered the Claude Code 2.1.246 pty chunk regression. Its
  precondition was a clipping-capable terminal path, not the existence of a message body.

## Distinction

Two rules were previously compressed into one:

1. **P1 — transport safety**: a pty can clip a typed body, so a socketless seat receives a
   short pointer after the composer-idle guard.
2. **P2 — persistence/audit**: packets and large bodies are written durably before the
   state mutation or delivery they authorize.

This amendment relaxes only P1 when the clipping precondition is absent. P2 is unchanged.
It introduces no body-size cap, and remote commands remain on the harness command path.

## Proposed ruling text

> **The pointer follows the clipping precondition.** A path pointer is the remedy for a
> body crossing a pty that can clip it. When the recipient has no non-pty endpoint, persist
> the packet or large body first, then type only a short path pointer after the
> composer-idle guard. When the recipient has a socket, RPC, or in-process channel that
> cannot clip terminal input, deliver the body byte-exact over that channel. Persistence
> for audit and durability is a separate, unchanged rule.

## Proposed orient-global iron rule 2

> **Persist first; route by transport.** Persist packets and large bodies before the
> mutation or delivery they authorize. On the live wire, send the byte-exact body through
> socket, RPC, or in-process delivery. For a socketless tmux seat, keep the body durable
> and type only a short path pointer after the composer-idle guard. Keep agent-to-agent
> sends concise under C10; remote commands still use the harness command path.

## Adoption note

The o-prime is the single writer for both target surfaces. If adopted, preserve the
separation between P1 and P2 explicitly so a future transport addition does not inherit a
pty-specific remedy after its precondition disappears.
