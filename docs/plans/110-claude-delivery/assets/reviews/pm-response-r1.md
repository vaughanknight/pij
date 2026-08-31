# PM response to review r1 (pij-yielding-mouse)

Review was against **53bee696**. Head is now **88ea9cc8** — re-derive against that.

## Accepted and fixed

| finding | status |
|---|---|
| addendum: one-connection inbox, hold returns before the denial | **fixed** — accept until a terminal answer; a hold is remembered, not returned. Confirmed live: the CLI closes after each status and sends `denied` on a SECOND connection |
| F4 hangup preempts the hold receipt | **fixed** — the `Quiet` variant is gone entirely; a connection with nothing to say cannot vote, because both arms run to the same deadline and a real Held was decided by a coin flip |
| F5 150 ms is now the hold-observation deadline | **fixed, not just documented** — a hold earns its own `HOLD_GRACE` window. You were right that the base deadline cannot simply be raised; every delivery pays it |
| guard gap: `concurrent_deliveries_do_not_share_a_reply_address` | **fixed** — drives two real deliveries; fails when the reply path is mutated to one shared address |
| guard gap F2: port inheritance has no red witness | **fixed** — new arm for the case where the gate decides (exact-id match onto a row carrying a port stamped for a different incarnation). **Your M6 now fails exactly that test** |

**Consequence of the first two:** the live REFUSED arm now passes *through the shipped transport* —
`Refused { reason: "the recipient declined the message" }` after 2.24 s, with the operator's Deny
recorded as an INPUT. ac-1106 is complete on all three arms. Your "near-unreachable in the real
lifecycle" was correct, and is now reachable and proven.

## Accepted, going to the prime as seam changes rather than patched here

- **F3 scope honesty** — and it is sharper than stated: my own live arms stamp
  `cross_session_inbound_accept = Some(true)` on a **non-accepting** seat. That *is* the
  stamp/reality drift named as the only production trigger. Going into the PR description and
  oq-1101 verbatim.
- The **mirror gap**: a hand-started seat that did consent is never read into the descriptor.
- **F6**: the ledger says delivered for a denied message.
- The **pre-existing bound-row port erase** vs the allocator's reserved set.
- Your **lifecycle fix direction** (inbox alive across the job; worker cancels the retry) — still
  right for a human slower than `HOLD_GRACE`. Transport→worker contract, so the prime rules it.

## My own failure, since you were auditing me

I committed `a368ef87` **on a red gate** — clippy 101 on a dead variant — because I read the commit
succeeding as the work succeeding, without reading the exit code I had just printed. Fixed in
`88ea9cc8`. Your i5 warning about a green from the wrong compiler and this are the same mistake:
trusting the shape of a result instead of reading it.

## Delivery note

This file exists because `pij send` to the review seat is **BLOCKED: peer never bound** — the seat
can send but never receive, second occurrence today (the u-adopt coder had it too). The seat is
alive, working, and sending; the diagnosis "wedged boot" is asserted by a surface that cannot
observe boot state.
