# CROSS-REVIEW PACKET — plan 028, Phase 1 (DOCS) — reviewer: gpt-5.5 xhigh

You are the **cross-model reviewer** (coder was opus). Review the P1 docs diff and
produce a verdict — do NOT edit. This is a DOCS pass: correctness = factual accuracy
against the `justfile`/CLI + working links + the cold-start being followable.

## What was built (Phase 1)
4 new `docs/how/` articles (`build.md`, `update-pi.md`, `workflow.md`, `skills.md`) + a
new root `AGENTS_README.md` cold-start index.
- Plan: `docs/plans/028-docs-cold-start/docs-cold-start-plan.md` (Phase 1 table + **AGENTS_README Link Map** + ACs)
- Coder packet: `docs/plans/028-docs-cold-start/packets/coder-p1.md`
- Diff: `git status` + `git diff -- AGENTS_README.md docs/how/` (confirm ONLY the 5 allowed files changed; README.md MUST be untouched)

## Review dimensions (report file:line evidence)
1. **Index, not dump (AC-01).** `AGENTS_README.md` opens with a cold-start quickstart, then sections that are each a short blurb + link — NOT inlined procedures. A section that re-explains a whole build procedure instead of linking `build.md` is a finding.
2. **Topic coverage (AC-02).** Build, update-pi (+ what pi is), how-to-work-on-pij/workflow, and cold-start essentials are all present and linked.
3. **Skills fact correct + verbatim (AC-03) — HIGH.** Must say: non-Claude agents read `~/.agents/skills/` (via `npx skills`, manifest `~/.agents/.skill-lock.json`); Claude reads `~/.claude/skills/` which **symlinks into** the shared store. VERIFY IT YOURSELF ON DISK (`ls -la ~/.agents/skills ~/.claude/skills`). A paraphrase that loses the symlink/shared-store nuance is a finding.
4. **Link Map fidelity (AC-04) + links resolve (AC-07) — HIGH.** Spot-check that every relative link you can see resolves to a real file (the coder claims "all resolve" — verify a sample yourself, incl. links to the 4 NEW articles and existing ones). A dangling link is a finding.
5. **Fact-check vs justfile (AC-05).** Pick 3–4 commands the articles cite (e.g. `just install`, `just update-pi`, `just self-check`, the skills install recipes) and confirm they exist in the `justfile` with the claimed behaviour. An invented/contradicting command is a finding.
6. **Scope (AC-08).** Only the 5 allowed files changed; README.md and the existing 11 docs/how articles untouched (a moved-link one-liner is the only allowed edit); no code/justfile/.harness diff.

## Dimension 0 for docs — VERIFICATION QUALITY (the coder verified its OWN work)
The coder claims link-check + fact-check passed. Don't take it on faith: independently
re-run a SAMPLE — resolve ~5 links yourself, grep the `justfile` for ~3 cited commands,
`ls` the skills dirs. If your sample finds a broken link or a wrong fact the coder
claimed clean → **FIX_REQUIRED** (the verification was vacuous).

## Verdict — report to pij-5lztp8
```
pij send pij-5lztp8 '{"delegationId":"028-p1-docs","verdict":"APPROVE|APPROVE_WITH_NOTES|FIX_REQUIRED","checked":"links:N resolved/M sampled · facts:K justfile-cited · skills-fact:disk-verified","findings":[{"sev":"…","file":"…","note":"…"}],"summary":"…"}'
```
(If `pij send` can't resolve self: prefix `PIJ_SESSION_ID=<your-id> pij send …`.)
