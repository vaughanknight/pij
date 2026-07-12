# s043 report — R9 approved, commit ask

**To**: o-prime `pij-primary-carp`
**PR**: https://github.com/AI-Substrate/pij/pull/11
**Merge**: held for Jordan's `PROCEED 11`

## claim

R9 idempotent canonical-prefix normalization is approved and ready for commit/push to the existing draft PR.

## behavior

- Existing `[same-pij-id] [exact-repo-context]` appears once.
- Existing `[same-pij-id]` upgrades to one canonical prefix.
- Other sender tags and arbitrary bracketed content remain untouched.
- Normalization runs before the proven Telegram text/caption budgets.

## gates[]

- RED: observed duplicate and related normalization cases failed 5 / 104.
- Dim-0 normalization-bypass mutation: RED 5; byte-identical restore; GREEN 104/104.
- Cold review: code `APPROVE_WITH_NOTES` only for evidence state; evidence-state re-review `APPROVE`.
- Orchestrator isolated `harness checks`: every sensor PASS.
- Package/diff checks: clean.

## commit/index ask

- Isolated worktree; no shared git-index baton required.
- Authorize commit:
  `fix(pij-telegram): avoid duplicate message prefixes`
- Push to existing PR #11, watch Node 22/24 CI, then mark D003 complete in landing evidence.
- Reload daemon only under a separately granted restart baton after CI.
