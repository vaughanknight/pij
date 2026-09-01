# AC-2 pre-fix red — duplicate delivery

**Observed**: 2026-09-01
**Witness**: `pij-civic-flyingfish` · OMP 18.0.3 · pane `%2179`
**Sender**: `pij-obedient-marmot`
**Message marker**: `AC2-S123-20260901-1834 one-message-one-delivery red witness`
**Send/dedupe id**: `62264665-d910-4c34-959f-2dd28fa64460`

## Positive artifacts

The witness pane rendered both daemon paths for the same body, in order:

```text
[pij from pij-obedient-marmot] AC2-S123-20260901-1834 one-message-one-delivery red witness
[pij-rs from pij-obedient-marmot]message waiting — run: pij inbox[/pij]
```

Read-only queue inspection of `~/.pij-rs/pij.sqlite:jobs:108` after both renderings:

```text
id: 108
kind: delivery:pij-civic-flyingfish
serial_key: pij-civic-flyingfish
dedupe_key: 62264665-d910-4c34-959f-2dd28fa64460
state: pending
worker: NULL
outcome: NULL
claimed_at: NULL
acked_at: NULL
attempt: 13
```

The first rendering proves the extension consumed `message.pushed`. The second proves the daemon still treated the same unacknowledged queue row as deliverable. The row remained pending with no acknowledgement after both appeared.

## Runtime caveat

`pij daemon status` reported process source `c8d99b13` while this checkout was `d84001bb`; the retained evidence is intentionally a live pre-fix behavioral witness, not a source/binary parity claim.
