# Cold review packet — item 12 (R2/R3/R4 + R6 + NIT-1) · HARNESS + one skill line · terminal-once
**Reviewer**: pij-wilful-morton · **Commit**: `a0ea133` (impl) + `5df91e3` (docs) · **Diff**: `git show a0ea133` · **Base**: main `f4ba6ec0` (has R5) · **C10**
**Fence**: `pij-skill-check.sh`, `pij-skill-check.test.ts`, `peer.md` (NIT-1). **Allowed**: READ anything; WRITE only `reviews/item-12-review.md`. To run vitest: your own throwaway `git worktree add` + `ln -s ~/GitHub/pij/node_modules`.

## Establish
- **R2** (order-anchor to numbered step): the decoy-mutant (in-section decoy + inverted step 11) now FAILS. Dim-0.
- **R3** (Build-config literal pin): inverting ONLY the Build-config read-back clause now FAILS.
- **R4** (second order loop :479-495): section-scoped like the first (or documented whole-file — check the coder's call); confirm no spurious failure on correct doctrine.
- **R6** (tighten R5, YOUR ADV-1): a real bracketed pointy path `[x](<./real.md>)` now FAILS; a `<placeholder>` (no `/`, no extension) still passes. **Orchestrator proved it**: `[gone](<./nonexistent.md>)` → `✗ prime pointer: … is missing`. Confirm the placeholder-vs-real discrimination is sound (what about `<foo.md>` with no slash? or `<a/b>` no extension? — probe the boundary).
- **NIT-1**: peer.md full-flags adopt line moved off the "never adopt" adjacency; peer.md still 146/150, cli.integration still green.
- **Gates**: `just pij-skill-check` 0 ✗; `pij-skill-check.test.ts` + `cli.integration` + `acceptance-sweep` green (125). Dim-0 non-vacuity on the new fixtures.

## Verdict → `reviews/item-12-review.md`; report {summary,verdict,path}. Terminal-once.
