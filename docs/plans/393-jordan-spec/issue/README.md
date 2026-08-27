# Issue files — AI-Substrate/pij (filed only on the o-prime's GO; never run from this seat)

- `title.txt` — the issue title (one line).
- `body.md` — lead + spec §0–§11 verbatim (< 65,536 chars).
- `body-part2.md` — spec §12–§17 + Appendix A verbatim, posted as the **first comment** (the spec is 94,476 chars; GitHub caps an issue body / comment at 65,536).

Commands (note: `gh issue create` has no `--title-file`; the title is read from the file via `$(cat …)`):

```sh
cd /Users/vaughanknight/GitHub/pij   # any checkout at or after 0e7adee9
gh issue create --repo AI-Substrate/pij \
  --title "$(cat docs/plans/393-jordan-spec/issue/title.txt)" \
  --body-file docs/plans/393-jordan-spec/issue/body.md
# then, with the number gh prints:
gh issue comment <N> --repo AI-Substrate/pij --body-file docs/plans/393-jordan-spec/issue/body-part2.md
```

Verification after filing: `gh issue view <N> --repo AI-Substrate/pij --json body --jq '.body|length'` should be the `body.md` char count; the comment count should be 1.
