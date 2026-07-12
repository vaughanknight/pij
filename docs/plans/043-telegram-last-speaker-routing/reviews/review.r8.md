# R8 repository-context cold review

**Reviewed base**: `5e3a8ae`
**Verdict**: `APPROVE_WITH_NOTES`

## Findings

| ID | Severity | Location | Finding | Required follow-up |
|---|---|---|---|---|
| F-01 | Medium | `.pi/extensions/pij/telegram/bridge.ts:532-547, 569-570` | Text is chunked to the fixed 4,000-character budget before the variable repository prefix is added. Media captions are also prefixed without accounting for Telegram's 1,024-character caption limit. A sufficiently long branch can therefore turn an otherwise valid body or caption into a rejected Telegram payload. | Include the resolved prefix in text/caption budgeting and add long-context boundary tests. |

Only a Medium finding remains, so the verdict is `APPROVE_WITH_NOTES`.

## Boundary evidence

With sender `pij-osn81b`, repository `pij`, and a 77-character branch:

```json
{
  "prefixLength": 96,
  "textMax": 4097,
  "telegramTextLimit": 4096,
  "captionLength": 1097,
  "telegramCaptionLimit": 1024
}
```

The existing tests use short repository contexts and captions, so they do not cover these limits.

## Required proof

### Sender tag and routing

- `senderPrefix` keeps `[pij-id]` as the first token.
- `parseSenderTag` and reply-routing logic are unchanged.
- Main renders `[pij-id] [repo]`.
- Non-main renders `[pij-id] [repo/branch]`.

### Branch-condition mutation

The branch condition was inverted temporarily:

```ts
branch !== "main"
```

This mutation includes `/main` and omits the feature branch.

- RED: 1 targeted test failed.
- Restore: `index.ts` was byte-identical before and after:
  `613f89524dc3c49365976f50347f0386338ba2b84e2e93cb679bdd0edcdc7e1b`.
- GREEN: targeted Telegram tests returned 96/96.

The main/non-main distinction is load-bearing.

### Git context seam

- Repository identity is derived from the sender descriptor's `folder`.
- `git rev-parse --git-common-dir` supplies the stable common repository, avoiding the worktree basename.
- Branch resolution uses the same sender folder, not daemon cwd.
- Git execution is injected through `GitRunner`; unit tests use fakes.
- Both production git calls receive an explicit 2,000 ms timeout.
- Missing descriptors, detached/non-git folders, and git failures degrade to the existing `[pij-id]` prefix.

### Per-message reuse

Sender context is resolved once inside the queued delivered-message operation and reused for:

- every text chunk;
- media captions;
- oversize notices;
- no-media-sender attachment fallbacks.

The relevant tests assert a single `senderContext` call per delivered message.

## Gates and scope

| Check | Result |
|---|---|
| Targeted bridge/index/matcher tests | GREEN: 96/96 |
| `git diff --check 5e3a8ae` | GREEN |
| `.pi/packages.yaml` | Clean after restoring package-audit timestamp churn |
| `harness checks --json` | Typecheck, lint, tests, package audit, and snapshots passed; smoke alone failed with the recurring environment-wide missing-pane condition before scenario assertions |

The bounded implementation diff contains exactly the nine files authorized by `reports/change-001.md`. Orchestrator-owned flow, live-proof, roster, ruling, and report changes were excluded from implementation review. Documentation changes are additive and agree with R8/AC-13.
