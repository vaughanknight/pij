# Scope Alert — dlg-0002

**Classification**: accidental forbidden read; no forbidden write; RESUMABLE with amendment
**Peer**: `pij-useful-whitefish`
**Delegation**: `dlg-0002`

## Trigger

The coder ran:

```text
rg pattern="project-local|symlink|cold|mutation|PIJ_SKILL_ROOT|E-DEAD|first tool action|compact.*--wait|receipt"
   paths=".../docs/plans/044-compact-before-redispatch"
   glob="*.md" output_mode="content" -n=true -C=2 head_limit=240
```

The parent-directory glob surfaced matched lines 45–50 from forbidden `the-flow.md`.

## Evidence

- No `the-flow.json` or `.the-flow-state.json` content appeared.
- `.flow-pair` read was limited to the explicitly permitted `dlg-0002` packet.
- No forbidden file was written.
- Independent `git diff` showed no tracked changes and no diff for `the-flow.json` / `the-flow.md`.
- The coder's attempted patch failed before applying; no repository edit resulted.

## Disposition

Resume is allowed because the breach was read-only and immediately self-reported.

Amendment:

- no directory-wide search under the plan folder;
- read/search only explicit allowed files;
- always exclude `the-flow.json`, `the-flow.md`, `.the-flow-state.json`, and `.flow-pair/**`;
- stop again if a tool cannot guarantee the exclusion;
- first repository edit must be T001's structural RED in `harness/scripts/pij-skill-check.sh`.
