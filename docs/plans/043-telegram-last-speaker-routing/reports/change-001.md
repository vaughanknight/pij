# s043 post-ship change — Telegram repository context prefix

**Source**: R8 · **State**: authorized before merge

## Mission

Prefix every agent-originated Telegram text bubble and media caption:

- main branch: `[pij-id] [repo] message`
- non-main branch: `[pij-id] [repo/branch] message`

The existing `[pij-id]` must remain the first token so `parseSenderTag` and Telegram reply-to routing stay unchanged. Bot-authored guidance, `/list`, `/tail`, and address confirmations have no agent sender and are out of scope.

## Requirements

1. Resolve repository context from the sending session's registry descriptor folder, not the daemon cwd.
2. Use the stable repository name (`pij` for this repository), not the worktree directory name.
3. Omit `/main`; include every other branch verbatim.
4. Compute context once per delivered pij message, then reuse it across all chunks, oversize notices, attachment fallbacks, and media captions.
5. Degrade safely outside git or when the sender descriptor is missing: retain the existing `[pij-id] message` shape.
6. Inject git/process effects with explicit bounded subprocess timeouts; tests use fakes.
7. Keep `parseSenderTag` and reply-to routing byte-unchanged; `[pij-id]` remains first.
8. Add a named Dim-0 mutation proving `/main` is omitted while a non-main branch is included.
9. Unit tests must not execute real git; the impure git seam is injected/faked.

## Allowed files

- `.pi/extensions/pij/telegram/bridge.ts`
- `.pi/extensions/pij/telegram/bridge.test.ts`
- `.pi/extensions/pij/telegram/index.ts`
- `.pi/extensions/pij/telegram/index.test.ts`
- `README.md`
- `docs/how/pij-telegram.md`
- `docs/domains/pij-control-plane/domain.md`
- `docs/plans/043-telegram-last-speaker-routing/telegram-last-speaker-routing-plan.md`
- `docs/plans/043-telegram-last-speaker-routing/execution.log.md`

## Proof

- RED before implementation for main, non-main, missing descriptor/non-git fallback, chunked text, media captions, and unchanged sender-tag parse.
- Targeted Telegram tests.
- Mutation/named assertion proving branch omission on main and inclusion on non-main.
- Rendered examples for `[pij-id] [repo]` and `[pij-id] [repo/branch]`.
- Full isolated `harness checks`.
- No package, flow-state, government, matcher/config/media/core changes.

## Report

Return changed files, RED/GREEN evidence, exact rendered examples, gates, and blockers. Do not commit.
