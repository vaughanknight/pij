# Claude Code direct delivery over the messaging socket (req-0002, plan 110)

Delivers to Claude Code seats over Claude's own messaging socket — no typing into the pane,
byte-exact at any length — and, the part this plan exists for, **the sender learns the truth**:
delivered, held awaiting approval, or refused.

## The bug this fixes

A message parked behind the recipient's approval dialog was reported **delivered**.

```
before   Delivered { origin: InjectedToTransport }     153.9ms
after    Held { reason: "recipient approval pending" }   73.6ms
```

Same test file, unchanged between the runs. It was written and witnessed **failing** before any
transport change, because a regression test green from birth is a claim, not a witness.

## Four measured defects, none hypothesised

- **B-2 — the reply address was not an address.** The transport advertised `from="uds:pij-daemon"`.
  The receiver delivers `peer_message_status` by connecting *back* to whatever `from=` names, so the
  CLI skipped the receipt (`reply address unshaped or outside our socket namespace`) and every held
  message timed out into `Delivered`. Each delivery now binds its own listener beside the
  recipient's socket. Measured: the CLI routes a receipt to **any** name in its namespace, which is
  what lets deliveries stay concurrent instead of serialising on one address.
- **B-2b — the decoder matched a shape the CLI never sends.** It required
  `type=="peer_message_status"`; the live wire is `{"type":"control","action":"peer_message_status"}`.
  The bare form documented in the fork's issue #311 did not appear once across five arms. This was a
  **second independent reason** `Held` was unreachable — fixing the address alone would not have
  surfaced it.
- **B-3 — there is no correlation id anywhere in the status lifecycle.** No `orig_msg_id`, no
  `wereHeld`; each status carries its own fresh uuid, and a denial cannot be paired with its own
  hold. Correlation is therefore **positional**, and sound only because the reply address is private
  to one delivery. The transport writes **exactly one frame per connection**, asserted on the wire so
  a future batching change fails there rather than minting a verdict for the wrong message.
- **B-1 — registration did not adopt the spawned identity.** The pre-bind row was found by seat id
  alone, so a daemon-spawned seat minted a second row on the same pane with the same `spawn_id`, and
  the `rpc_port_intent` stamped for that incarnation was cleared on the very registration that
  stamped it. Adoption now falls back to `spawn_id` + `pane` + **unbound**.

## Two things this plan changed beyond the defect list

**`Refused{reason}`.** The CLI reports `status:"denied"` when the operator declines. We had no word
for it. `Held` was available and nearly right — but `Held` means *pending*, and a denial is
*terminal*, so anything retrying on it re-prompts a human who already said no. The least-wrong
spelling of a wrong claim is still a wrong claim.

**A dialog storm, defused before it could fire.** `Held` was consumed by `retry(job, Duration::ZERO)`
— an immediate re-delivery, each raising a fresh approval dialog. That line had **never executed**,
because `Held` was unreachable; making the mechanism honest is exactly what would have armed it. Held
now backs off and parks after four attempts. Ruled coupled to the consent default: the default may
not be switched on without this.

## Evidence

| claim | how |
|---|---|
| Held observable | live, non-accepting seat, 62.9 ms on the composed head |
| Delivered byte-exact | live, `--accept-inbound` seat: 3000 bytes, lines 1..40 contiguous, real `type=user` turn, no hold record |
| every guard | witnessed RED by mutating its fix away — reply address (4 fail), status matcher (5), held backoff (2), unbound clause (1) |
| gate | `pij-gate` exit 0 on the composed, rebased head, rustc 1.98.0 |
| review | cross-model (GLM 5.3 Flash), every mutation re-executed independently; five findings fixed, four escalated as open questions |

| Refused | live, operator clicked Deny: `Refused` through the shipped transport after 2.24 s |

### The scope qualifier that matters most

**These outcomes are drift-only reachable on today's fleet, and the PR should not be read as
"socket delivery is now on".** Verified live by the reviewer: every Claude session record carries
`crossSessionInbound: null`, so `can_deliver` refuses before any write and the CLI never gets a
frame to hold; and an *accepting* seat never holds. So `Held` and `Refused` are reachable in
production only under **stamp/reality drift** — a descriptor claiming a consent the CLI did not
apply.

The live held and refused arms above stamp `cross_session_inbound_accept = Some(true)` on a
**non-accepting** seat, which *is* that drift. They are honest about the transport and they do not
demonstrate a configuration the fleet currently has. Said plainly here rather than left for a reader
to discover.

**One test that is not a guard:** `the_control_shape_is_what_the_live_cli_actually_emits` stays green
under the status-matcher mutation. It pins the fixture; it does not guard the decoder. Kept, and not
counted.

## Fixtures

The invented `#311` status shapes are replaced by lines **recorded off the wire** (Claude 2.1.250),
with a README naming which are recordings and which are not. `status-dropped.ndjson` remains
unrecorded and says so. A fixture authored by its own consumer proves nothing about the wire.

## Not in scope

Copilot RPC (plan 109). The send-keys path (it is being replaced, not repaired). The
`crossSessionInbound` consent default — implemented and opt-in today, so **the socket transport is
off for every seat on the fleet**; switching it on is a consent decision for the operator, and is
coupled to the held backoff above.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_0111BvcqZ8g2UCctQUsSBMvr
