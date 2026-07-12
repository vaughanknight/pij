# Stream brief — s045-copilot-5-6-effort-levels
**From**: pij-primary-carp · **Date**: 2026-07-12T20:40:00Z · **Lifecycle**: active, oriented

## Structure tree

```text
human (Jordan)
└─ o-prime pij-primary-carp
   ├─ s041-inbox-no-tmux pij-concrete-reptile · live proof / ship path
   ├─ s044-compact-before-redispatch pij-eventual-scorpion · waiting build config
   └─ this stream pij-evolutionary-jellyfish · s045-copilot-5-6-effort-levels
       └─ fleet only after validated plan + human build configuration
```

## Work item

- **Plan folder**: `docs/plans/045-copilot-5-6-effort-levels/`
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s045-copilot-5-6-effort-levels`
- **Branch**: `s045/copilot-5-6-effort-levels`
- **Base**: `origin/main` at `347b6dd732110bc76b3d421e61a401cc228149d6`
- **Spawn evidence**: `pij-evolutionary-jellyfish`, Copilot `gpt-5.6-sol` xhigh, worktree cwd, window `@742`
- **Landing**: `/builder 8 ship` to PR merge
- **Human rulings**:
  - `sol, terra luna all have none, low, medium, high, xhigh, max`
  - `nwo on to the effort levels issue`
- **Current flow**: `government/prime-flow.json#wi-copilot-effort-advertisement`

## Job

Correct `pij models` and effort validation for Copilot `gpt-5.6-sol`,
`gpt-5.6-terra`, and `gpt-5.6-luna`.

Required model-specific levels:

```text
none, low, medium, high, xhigh, max
```

`minimal` must not be advertised or accepted for this trio. Preserve
source-derived behavior for every other provider/model.

Known source seam:

- `core/models/registry.ts` seeds verified Copilot entries from Pi's
  `github-copilot` provider; those currently expose `minimal,xhigh,max`.
- verified seed entries win over `copilotSnapshot()` aliases.
- Copilot CLI generically accepts `none,minimal,low,medium,high,xhigh,max`;
  the trio's model-specific subset is Jordan's ruling above.

## Fences

- Owns: `docs/plans/045-copilot-5-6-effort-levels/**`
- Scratch: `.harness/temp/s045/**`
- Read-only during planning: all `.pi/extensions/pij/**`, `skills/**`,
  `harness/**`, package files, and government
- Likely surfaces are model registry/validation tests, but derive the exact
  manifest from actions and escalate before any edit.

## Orient stack

1. Invoke `/pij prime`.
2. Read `skills/pij/references/prime/orient-global.md`.
3. Read `/Users/jordanknight/pi-hacking/pij/government/orient-local.md`.
4. Read this brief.
5. Invoke `/thesis`.
6. Persist a preamble checkpoint before Builder mutation.
7. Run `/builder` through research and cold-validated plan.

## Assignment and reporting

- Jordan's direct instruction is the human preamble for explore/plan.
- Stop at `WAITING_FOR_BUILD_CONFIG` after plan validation.
- No product/model-registry edits or fleet before the build profile is confirmed.
- Reports: `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`.
- Default future proposal: separate Copilot GPT-5.6 Sol xhigh coder/reviewer.

**Ack after spawn**: `brief-ack s045` + any discrepancy.
