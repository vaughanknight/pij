# Review r2 — fix round

## Prime ruling on F8

Prime rejected both loss and permanent wedge. The queue row remains authoritative until acked, so the client now retries a failing frame five times through the existing capped reconnect backoff. On the fifth failure it emits one visible notice naming the message id and error, advances the event cursor, and continues. The unacked queue row remains recoverable through later inbox/pointer handling; G1 continues supervising later frames.

## Resolutions

| Finding | Resolution | Evidence |
|---|---|---|
| F8 MINOR | fixed by prime ruling | New RED-first test drives one poison `message.pushed` frame followed by a valid frame. The first four attempts retain the cursor and reconnect; attempt five emits exactly one `poison-1` notice, advances, and consumes cursor 2. |
| F9 MINOR | fixed | New test proves backoff 250ms → frame consumed → next outage resets to 250ms. Removing `if (sawFrame) attempt = 0` now fails permanently. |
| Q2 | accepted deferred coverage note | Existing unit cursor-map witness plus Rust `seq > since` authority remain the approved proof. No product change. |

## Green evidence

- Pre-fix poison regression: 1 failed / 16 passed; valid next frame remained unconsumed.
- Post-fix focused suite: 4 files, 43 tests passed.
- `just typecheck`: exit 0.
- Frame retry constants: five attempts; reconnect delay remains capped at 5s.

## Re-review ask

Produce an r3 ddoc that judges F8/F9/Q2 and returns a final branch verdict. Code remains read-only.
