# FX002 execution log — Phase 2 Dim-0 witnesses

**Delegation**: `dlg-0005`
**Worker**: `pij-gunboat-diplomat`
**Starting tip**: `c354d2265bb557197d40e0f243d72d1a5673171e`

## Witnesses

- FX-A: `leaves the sqlite row claimed when injection throws` drives the production
  `sendUserMessage` seam to reject, then asserts `claimed` and no `acked` receipt.
- The existing successful-injection test now samples delivery state from inside
  `sendUserMessage` and observes `claimed` before the later ack.
- FX-B: the fake-timer reload test brackets `vi.getTimerCount()` and proves reload replaces
  one consumer timer with one consumer timer rather than leaking another.

## Acceptance mutation M2b

```bash
just flow-pair-mutate .pi/extensions/pij/index.ts \
  's/onMessage: async \(dm\) => \{/onMessage: async (dm) => { try { receiver.onInbound(dm, dm.messageId); } catch {} if (dm !== undefined) return;/' \
  'npx vitest run .pi/extensions/pij/index.test.ts'
```

```text
→ mutated .pi/extensions/pij/index.ts; running suite (expect RED)…
✓ suite went RED under mutation:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
✓ mutation smoke PASSED — the suite guards this behaviour.
```

## Acceptance mutation M8

```bash
just flow-pair-mutate .pi/extensions/pij/index.ts \
  's/disposeWatch\?\.\(\); \/\/ reload: drop the prior consumer before opening a new one//' \
  'npx vitest run .pi/extensions/pij/index.test.ts'
```

```text
→ mutated .pi/extensions/pij/index.ts; running suite (expect RED)…
✓ suite went RED under mutation:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
→ restored; re-running suite (expect GREEN)…
✓ GREEN after restore:
✓ mutation smoke PASSED — the suite guards this behaviour.
```

## Gates

- `npx vitest run .pi/extensions/pij/index.test.ts`: 15/15 passed after both restores.
- `just typecheck`: passed.
- `npx biome check .pi/extensions/pij/index.test.ts`: passed.
- `git diff -- .pi/extensions/pij/index.ts`: empty after each mutation restore.

## Non-blocking

M6, the short-lived `pij_send` sqlite handle close, still needs a future open/close seam.
Per the reviewer and orchestrator, it is bounded resource-growth coverage and not part of
this test-only fix.