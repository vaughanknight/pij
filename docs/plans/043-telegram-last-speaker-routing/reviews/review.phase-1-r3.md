# Phase 1 F-02 re-review

**Reviewed diff**: `diff-0003`  
**Verdict**: `APPROVE`

No material findings.

## F-02 resolution

F-02 is resolved.

`settleWhile` in `.pi/extensions/pij/telegram/index.test.ts:106-113`:

- uses a bounded 200 ms default window;
- checks the predicate every 10 ms throughout the window;
- performs a final predicate assertion at the deadline.

The production composition test at `.pi/extensions/pij/telegram/index.test.ts:280-294` waits for B's fallback, then holds both watchers live while `settleWhile` continuously proves:

```ts
receivedA.length === 1 && receivedB.length === 1
```

Final A/B exclusivity assertions run before either watcher is disposed.

## Mutation evidence

The prior erroneous mutation was repeated exactly: after `"bare follows B"`, schedule a duplicate delivery to A after 100 ms.

- RED: 1 targeted test failed.
- Restore: `index.ts` was byte-identical before and after:
  `5a50db6330224b3bc866048d2f7345027859a64ae9b1e550793f2d64e24ccb6a`.
- GREEN: the targeted bridge/index/matcher suite returned 91/91.

The previously uncaught mutation is now load-bearing.

## Regression and scope

| Check | Result |
|---|---|
| Targeted Telegram suite | GREEN: 91/91 |
| `git diff --check 347b6dd732110bc76b3d421e61a401cc228149d6` | GREEN |
| `.pi/packages.yaml` | Clean |
| Mutation residue | None; `index.ts` restored byte-identically |

The `diff-0002` to `diff-0003` source/test delta touches only the authorized file:

```text
.pi/extensions/pij/telegram/index.test.ts
```

No production source, resolved pi-peacock smoke, package, government, flow-state, matcher, config, media, or core file changed in this fix round.
