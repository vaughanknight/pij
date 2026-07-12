# R9 canonical-prefix cold review

**Verdict**: `APPROVE_WITH_NOTES`

## Findings

| ID | Severity | Location | Finding | Required follow-up |
|---|---|---|---|---|
| F-01 | Medium | `telegram-last-speaker-routing-plan.md:224`; `execution.log.md:39-40` | D003 is marked complete even though its stated completion criteria include cold-review approval, CI green, and PR #11 update. At review time those outcomes are not yet recorded. | Keep D003 in progress until this verdict, CI result, and PR update are persisted. |

No material product-code finding was found. With one Medium evidence-state finding, the verdict is `APPROVE_WITH_NOTES`.

## Normalization proof

- An exact same-sender canonical prefix remains exactly once.
- An exact same-sender tag-only prefix upgrades to the canonical prefix exactly once.
- Unprefixed content receives one canonical prefix.
- A different sender tag remains message content.
- Arbitrary bracketed content remains message content.
- The canonical `[pij-id]` remains the first token.

Text bodies and media captions both use the same exact normalization rule. Only the current sender's full canonical prefix or exact sender tag is stripped.

## Dimension 0 mutation

The normalization expression was replaced with raw `text`, bypassing normalization for text and captions.

- RED: 5 targeted tests failed.
- Restore: `bridge.ts` was byte-identical before and after:
  `042eb275022e678da2a223e1d8afdb3ea6dee9caf1862606b162a3b5b042e0f0`.
- GREEN: targeted Telegram tests returned 104/104.

The duplicate-prefix protections are load-bearing.

## Budget and regression coverage

Normalization occurs before:

- prefix-aware text chunking;
- media-caption limit selection;
- overflow-caption conversion to lossless text bubbles.

All prior `<=4096` text, `<=1024` caption, and lossless-overflow assertions remain green. Existing tests also continue to pin:

- sender-tag parsing and reply routing;
- first-bubble reply threading;
- last-speaker behavior;
- one `onSpoke` notification per delivered message;
- one sender-context lookup per delivered message.

## Gates and scope

| Check | Result |
|---|---|
| Targeted bridge/index/matcher tests | GREEN: 104/104 |
| `git diff --check 5e3a8ae` | GREEN |
| `.pi/packages.yaml` | Clean after restoring package-audit timestamp churn |
| `harness checks --json` | Typecheck, lint, tests, package audit, and snapshots passed; smoke alone failed with the recurring environment-wide missing-pane condition before scenario assertions |

The R9 delta is bounded to the four files authorized by `reports/change-002.md`:

```text
.pi/extensions/pij/telegram/bridge.ts
.pi/extensions/pij/telegram/bridge.test.ts
docs/plans/043-telegram-last-speaker-routing/telegram-last-speaker-routing-plan.md
docs/plans/043-telegram-last-speaker-routing/execution.log.md
```

Orchestrator-owned flow, roster, ruling, and report changes were excluded from implementation review.
