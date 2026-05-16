# Minih Dependency Decision — Phase 1

**Plan**: `docs/plans/007-options-for-pi-extensions-that-do-subagents/agent-workbench-plan.md`  
**Phase**: Phase 1: Minih inventory + artifact adapter  
**Date**: 2026-05-16  
**Status**: Accepted for Phase 1

## Decision

Phase 1 uses **local Minih artifact/JSON contracts plus deterministic fixtures**. It does **not** add a runtime package dependency on Minih helper modules and does **not** shell out to `minih view` / `minih attach` / ANSI human-view output.

The adapter may read Minih-owned files shaped like:

- `agents/<slug>/runs/<runId>/run.json`
- `agents/<slug>/runs/<runId>/events.ndjson`
- `agents/<slug>/runs/<runId>/completed.json`
- `agents/<slug>/runs/<runId>/output/report.json`
- coordinated run inbox/state/history files when present

All raw artifact reads remain isolated in `.pi/extensions/minih-workbench/minih-adapter.ts` and are fixture-tested.

## Rationale

- The current pij package manifest does not include a vetted Minih library dependency for direct helper imports.
- Phase 1 must be deterministic and should not require live Minih/Copilot or companion process execution in routine validation.
- The Minih Workbench must not parse ANSI or nest Minih's Ink human UI.
- Keeping the raw fallback behind `minih-adapter.ts` lets future phases switch to public Minih reader helpers without changing `store.ts`, command/tool envelopes, or fixture tests.

## Package policy

No package was added for Phase 1.

If a later task needs a Minih helper package, it must use the project gate:

```bash
just pkg add <source> <note words>
```

Then record:

1. vet/audit output,
2. resulting `.pi/packages.yaml` source-of-truth diff,
3. generated `.pi/settings.json` diff,
4. any accepted warning override with explicit `vetted.overrides.rules`, and
5. a companion review request for the package change.

Never hand-edit `.pi/packages.yaml`, `.pi/settings.json`, pi-mono, or the installed Pi binary.

## Evidence

- `minih --version`: `0.1.6`
- `minih doctor --json`: degraded with **0 errors**; warnings only (`package-vetter` retrospective, missing shared preamble, unharvested package-vetter retro); `code-review-companion` `prompt-state-vocabulary-drift` passed.
- Pre-phase engineering checks: `just typecheck` and `npm run smoke -- session-sql` passed.
- T007 does not modify package manifests.

## Consequences

- Phase 1 adapter must gracefully handle missing/malformed/permission-like artifacts with diagnostics instead of throws.
- Fixture shapes become the local contract for this phase; if Minih upstream changes artifact shapes, the adapter gets the compatibility patch.
- Future use of Minih public reader helpers is allowed only after the dependency is vetted or provided through a stable local/public contract.
