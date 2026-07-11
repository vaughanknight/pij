# Baton book
**Writer**: pij-3vetx8 (o-prime; single writer) · **Updated**: 2026-07-11T08:42:00Z
Request: `pij send pij-3vetx8 "baton-request <baton> — <purpose>"`. Grants are pushed. One holder; the book binds the o-prime too.

| Baton | Resource + free probe | Holder | Since | Purpose | Queue |
|---|---|---|---|---|---|
| daemon-restart | The machine-wide pij daemon (restart interrupts delivery for EVERY live peer, all repos) · probe: `pij daemon status` | — free | — | — | — |
| git-index | This repo's staging area + local commits · probe: `git diff --cached --quiet` exits 0 | — free | — | — | — |
| push-main | `git push` to main (shared trunk) · probe: no unpushed release-bearing commits | — free | — | — | — |

**Standing rules (adopted day one from INC-004, run-01)**: commits are pathspec-mandatory (`git commit -- <paths>`, never bare); a commit-slot (announce→ack→commit→confirm) applies while any other seat has an apply window open; docs edits during a held git-index are unstaged-only and disclosed.

## Grant log

_Append only: ISO · baton · holder · action — note._

```text
- 2026-07-11T08:42:00Z · book seeded, all batons free.
```
