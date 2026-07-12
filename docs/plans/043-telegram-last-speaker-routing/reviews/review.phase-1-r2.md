# Phase 1 targeted re-review

**Reviewed diff**: `diff-0002`  
**Prior verdict**: `FIX_REQUIRED`  
**Verdict**: `FIX_REQUIRED`

## Findings

| ID | Status | Severity | Location | Finding | Required fix |
|---|---|---|---|---|---|
| F-01 | Resolved | - | `.pi/extensions/pi-peacock/smoke.ts:18-22` | The git subprocess now has an explicit bounded `timeout: 2000`. Exact cwd, branch, context-usage, provider/model, and effort assertions remain intact. | None. |
| F-02 | Unresolved | High | `.pi/extensions/pij/telegram/index.test.ts:271-274`; `.pi/extensions/pij/adapters/channel.ts:94-103` | The replacement test proves delivery to B, but does not reliably prove delivery only to B. `FsChannel.watch` dispatches asynchronously; after waiting only for B, the test immediately checks A and later disposes A's watcher. A delayed erroneous duplicate to A can arrive after that assertion or after disposal and leave the test green. | Add a bounded settlement/negative proof for A after B's fallback, or synchronously inspect both inboxes before disposing the watchers. |

F-02 remains unresolved, so the verdict is `FIX_REQUIRED`.

## Mutation evidence

### Required first-write-only production mutation

The production setter was changed temporarily to:

```ts
if (!lastSpeaker.has(String(chatId))) lastSpeaker.set(String(chatId), from);
```

- RED: exactly 1 targeted test failed.
- Restore: `index.ts` was byte-identical before and after:
  `5a50db6330224b3bc866048d2f7345027859a64ae9b1e550793f2d64e24ccb6a`.
- GREEN: the targeted Telegram subset returned 91/91 after restoration.

This proves A-to-B replacement is now positively covered.

### Exclusive-delivery mutation

An erroneous duplicate delivery to A was injected 100 ms after the B fallback:

```ts
if (message.body.includes("bare follows B")) {
	setTimeout(() => rt.channel.deliver({ ...message, to: "pij-agent-a" as SessionId }), 100);
}
```

The strengthened `index.test.ts` suite stayed green. The mutation restored byte-identically with the same SHA-256 above. This empirically proves the current negative assertion is timing-dependent and does not guard the required "only B" behavior.

## Gates rerun

| Gate | Result |
|---|---|
| `harness boot --json` | GREEN: typecheck and tests passed |
| Targeted Telegram subset | GREEN: 91/91 |
| Targeted pi-peacock smoke | Environment failure before assertions: spawned tmux pane disappeared (`can't find pane`) |
| `harness checks --json` | Typecheck, lint, tests, package audit, and snapshots passed; smoke alone failed with the same missing-pane condition across all scenarios |
| `.pi/packages.yaml` | Clean after restoring package-audit timestamp churn |

The smoke failures are not attributed to F-01: the targeted scenario and every other smoke scenario failed at pane capture before scenario assertions ran. They prevent a reviewer-side green full-gate attestation but are separate from the code finding.

## Scope

`diff-0002` remains within the eight original fenced files plus the granted `.pi/extensions/pi-peacock/smoke.ts` addendum. Compared with `diff-0001`, only the two fix-authorized source/test files changed:

- `.pi/extensions/pi-peacock/smoke.ts`
- `.pi/extensions/pij/telegram/index.test.ts`

No package manifest, government, flow-state, matcher, config, media, or core source change is present.
