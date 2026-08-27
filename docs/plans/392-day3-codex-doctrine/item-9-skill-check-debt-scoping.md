# Item 9 scoping — pay the pij-skill-check debt (ruled 2026-08-27T10:0xZ; after 3c and 7; fence skills/pij/** for this item only; own PR; cold-reviewed)

Baseline on origin/main 5445c85c (skills/ untouched by this stream): 10 ✗ / 184 ✓

```
✗ budget: skills/pij/references/routes/peer.md is 155 lines (max 150)
✗ budget: skills/pij/references/routes/node.md is 157 lines (max 150)
✗ budget: skills/pij/references/prime/orchestrator.md is 139 lines (max 120)
✗ real-tree peer: pij link <child> --parent <parent> [--json] — missing 'pij link <child> --parent <parent> [--json]' in skills/pij/references/routes/peer.md
✗ real-tree prime triage: `pij list --prime --here --json` is current-prime-only — missing '`pij list --prime --here --json` is current-prime-only' in skills/pij/references/routes/prime.md
✗ real-tree prime triage: never an active-seat signal — missing 'never an active-seat signal' in skills/pij/references/routes/prime.md
✗ real-tree kickoff: spawned link verified before canary — missing 'verify the automatically persisted structural link with `pij tree <id> --json`'
✗ real-tree kickoff: adopted identity before link before brief — missing 'run `pij link <id> --parent <o-prime-id> --json`'
✗ prime pointer: skills/pij/references/prime/orchestrator.md → <path> is missing
✗ orchestrator order: preamble marker 'human preamble' is out of order
```

Sizes: peer.md 155/150 (−5), node.md 157/150 (−7), prime/orchestrator.md 139/120 (−19), SKILL.md 85/150.

Approach (draft): trim over-budget files by consolidating duplicated prose into cited § C-n conventions (dup-prose rule), add the missing real-tree marker strings verbatim where the check expects them (peer.md link grammar; prime.md triage lines), re-run until 0 ✗; every change is live-skill content → cold review mandatory.
