# Original ask — pij-telemetry-join-keys
**Captured**: 2026-07-04  ·  **By**: /the-flow

> lets get a quick flow up to do the work

**Referent**: "the work" = the two pij telemetry features scoped this session for peer
orchestrator **pij-4s10mb**, written up in `docs/notes/telemetry-join-keys-scoping.md`:

1. **Join-key query surface** — the harness↔pij join key is already persisted per peer
   (`SessionDescriptor.harnessSessionId`); add a `pij sessions --json` join-table verb that
   surfaces it (+ `harness`, `transcriptPath`, `boundModel`, `spawnedBy`, `parentId`,
   `lifecycle`) so fleet cost attribution is a deterministic lookup, not env archaeology.
2. **Orchestrator self-identity** — make `adopt`'s inner-session-id resolution harness-aware
   (currently claude-shaped) so an adopting copilot/codex orchestrator gets its own
   `harnessSessionId` persisted; optional `pij adopt --export` / `pij whoami --env` sugar that
   fixes pij self-resolution in the adopted shell (not the telemetry fix — the registry read is).
