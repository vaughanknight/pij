# Retrospective: session-sql

## 2026-05-15 — implementation pass

```json
{
  "retrospective": {
    "magicWand": "I wish the extension generator and test harness had a preflight that exercises the generated store test under the current Node builtin set, so new runtime APIs like node:sqlite fail with a clear harness message instead of a Vite collection error.",
    "magicWandTarget": "project",
    "difficulties": [
      {
        "category": "driver-sdk",
        "description": "Vitest/Vite did not recognize Node 24's node:sqlite builtin and failed test collection before any store tests ran.",
        "workaround": "Added a narrow vitest.config.ts plugin shim that resolves node:sqlite/sqlite to a virtual module backed by createRequire('node:sqlite').",
        "severity": "medium"
      },
      {
        "category": "scenario-author",
        "description": "The generated smoke template still used the retired { send, expect, delay } shape while current Driver SDK scenarios use discriminated Step unions.",
        "workaround": "Updated the smoke template to import Scenario and use kind/type/press/expect steps.",
        "severity": "medium"
      },
      {
        "category": "driver-sdk",
        "description": "Driver SDK waitIdle only checked the final non-empty line for the prompt/footer. A startup extension status line rendered after the model footer and caused a false boot timeout.",
        "workaround": "Updated waitIdle to scan the last five non-empty lines for the prompt/footer signal.",
        "severity": "medium"
      }
    ],
    "notes": "D-022, D-023, and D-024 were promoted to docs/difficulties.md and encoded during the same implementation pass. The L2 smoke harness remains sufficient for this feature."
  }
}
```

## Curator notes (2026-05-15)

- **Magic wand**: Encode/defer hybrid. D-022 encoded the immediate `node:sqlite` shim; a future harness enhancement could turn this into a reusable builtin-preflight for new extensions.
- **Difficulties**: Promoted to D-022, D-023, and D-024 in `docs/difficulties.md`.
- **Action**: No broad Phase 0 harness upgrade needed; keep the feedback loop active through final smoke/self-check.
