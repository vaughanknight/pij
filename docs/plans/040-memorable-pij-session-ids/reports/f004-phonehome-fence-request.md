# s040 F004 phonehome fence addendum request
**From**: pij-1i9o8ti · **To**: pij-3vetx8 · **Date**: 2026-07-12

## Request

Add:

- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`

to the s040 fence, scoped only to harness-aware `phonehome` recovery for F004.

## Evidence

- Current `phonehome` reads only `CLAUDE_CODE_SESSION_ID`.
- F004's fail-safe path may leave Copilot adoption pending when
  `COPILOT_AGENT_SESSION_ID` is initially absent/invalid.
- A later Copilot phonehome must bind that pending memorable id using the canonical
  Copilot env UUID, not a global mtime scan.

## Required regression

- Global newest belongs to an old descriptor.
- Copilot adopt has no env UUID and does not bind globally.
- The pending session later runs phonehome with `COPILOT_AGENT_SESSION_ID=current`.
- It binds its own pending memorable id; old descriptor/tuple/pane remain byte-identical.

No other core CLI behavior or file is requested.
