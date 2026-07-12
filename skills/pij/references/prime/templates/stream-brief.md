# Stream brief — s<ORD>-<SLUG>
**From**: <o-prime id> · **Date**: <ISO> · **Lifecycle**: provisional/adopted

## Structure tree

```text
human
└─ o-prime <id> · window o-prime
   ├─ this stream <id> · window s<ORD>-<SLUG>
   └─ sibling <id> · window <name> · <status>
```

## Work item

- **Plan folder**: `docs/plans/<ORD>-<SLUG>/`
- **Worktree**: `<absolute worktree path>`
- **Branch**: `<stream branch>`
- **Base**: `<approved base branch>` at `<base SHA>`
- **Spawn evidence**: `<descriptor cwd + tmux window/pane pointer>`
- **Landing**: `/builder 8 ship` to PR merge; teardown only after merge or explicit abandonment
- **Human ask, verbatim**: <quote or durable pointer>
- **Current flow state**: <pointer>
- **Prior art**: <paths only>
- **Cross-repo artifacts** (include whenever foreseeable): vendor VERBATIM into
  your plan folder + record sha256 in a PROVENANCE file BEFORE citing — source
  repos may be severance-ruled; a citation into one rots the day it goes dark.
  Never prepend headers to a verbatim vendor (breaks byte-identity).

## Fences

Canonical fence section: `<government/spine.md#fences--stream-id>`.

- Owns: <exact paths derived from planned actions>
- Scratch: `.harness/temp/<stream-id>/**`
- Read-only seams: <sibling-owned or shared paths>
- Outside-fence need: stop and escalate; never improvise.

## Orient stack

1. Invoke `/pij prime`; stream triage loads `<skill>/references/prime/orchestrator.md`.
2. Portable global orient: `<skill>/references/prime/orient-global.md`
3. Consuming repo local orient: `government/orient-local.md`
4. This item brief
5. Invoke `/thesis` through the host skill mechanism
6. Human preamble + preamble checkpoint
7. Protocol/ritual pages only on demand

## Assignment and reporting

- Assignment stays provisional until the human preamble and first report.
- A validated plan stops at `WAITING_FOR_BUILD_CONFIG`; no implementation begins
  until the human confirms the recorded coder/reviewer profile.
- Report at preamble, every phase checkpoint, and ship using
  `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`.
- Exclusive resources require a pushed baton grant.
- Fleet packets inherit these fences and name their own narrower allowlist.
- Window/identity: `s<ORD>-<SLUG>` / `<pij id>` / role `stream-s<ORD>`; worker
  panes split inside this window and inherit the worktree cwd.
