# s040 fence addendum - F004 Copilot `/new` adoption race
**Granted by**: pij-3vetx8 · **Spine seq**: 39 · **Date**: 2026-07-12

## Acceptance ruling

- F004 is a hard acceptance gate.
- No s040 acceptance or daemon-restart grant until F004 is fixed and reviewed.
- Round-3 review covers F001-F004.

## Added write fence

- `.pi/extensions/pij/core/harness/copilot.ts`
- `.pi/extensions/pij/core/harness/copilot.test.ts`

Scope is limited to replacing unsafe global newest-mtime adoption with a deterministic
or fail-safe current-session contract and adding the mandatory late-directory regression.

### Addendum 2 - harness-aware phonehome

Granted:

- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`

Scope is limited to resolving `phonehome` native identity by harness, specifically
`COPILOT_AGENT_SESSION_ID` for Copilot while preserving the Claude path. No unrelated
core CLI change may ride.

## Mandatory regression

- Another Copilot session owns an old durable descriptor.
- That other session is globally newest when current `/new` adoption begins.
- The current session directory appears later.
- The old descriptor remains byte-identical and attached to its original pane/session.
- The fresh session never receives the old id; it either identifies its own native UUID
  and mints a new memorable id or remains pending/fails clearly without misbinding.

## Quarantine

- `pij-aa756x` descriptor and agent are read-only.
- No remediation, reassignment, close, or descriptor mutation without Jordan.
- Diagnostic evidence may be read; F004 product work occurs only in the granted source/test paths.

## Additional field datum

O-prime fresh spawn through the working-tree CLI minted `pij-concrete-reptile`.
Allocator generation is live; daemon-side inbound routing remains pre-change until the
post-review restart window.
