# s043 post-ship change — idempotent Telegram prefix

**Source**: R9
**Observed raw body**:

```text
[pij-primary-carp] [pij] Restart done on the approved Telegram update...
```

The bridge added the same prefix, producing:

```text
[pij-primary-carp] [pij] [pij-primary-carp] [pij] Restart done...
```

## Mission

Make prefixing canonical and idempotent for text and media captions.

## Contract

1. Existing exact canonical prefix -> keep one.
2. Existing exact sender tag only -> upgrade to one canonical prefix.
3. No prefix -> add one canonical prefix.
4. A different sender tag or arbitrary bracketed content is message content; never strip it.
5. Normalize before text/caption budgeting, preserving `<=4096` text, `<=1024` captions, and lossless overflow.
6. `parseSenderTag`, reply routing, last-speaker state, threading, `onSpoke`, and context-once invariants remain unchanged.

## Allowed files

- `.pi/extensions/pij/telegram/bridge.ts`
- `.pi/extensions/pij/telegram/bridge.test.ts`
- `docs/plans/043-telegram-last-speaker-routing/telegram-last-speaker-routing-plan.md`
- `docs/plans/043-telegram-last-speaker-routing/execution.log.md`

## Proof

- RED for the exact observed duplicate.
- Text chunks/media captions contain one canonical prefix.
- Sender-id-only input upgrades correctly.
- Other-sender/bracketed content is retained.
- Boundary tests remain green and mutation-removing normalization goes RED.
- Targeted Telegram tests and isolated full gate; no commit.
