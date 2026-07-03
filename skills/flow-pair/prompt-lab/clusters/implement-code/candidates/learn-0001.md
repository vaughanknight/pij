# Learning Candidate — learn-0001

- **Cluster**: implement-code
- **Run**: 2026-07-02T22-32-26Z-github.com-AI-Substr
- **Delegation**: dlg-0001
- **Miss type**: implement-code
- **Created at**: 2026-07-02T23:23:57.787Z

## Summary

minih-integration packets should pre-carry minih's undocumented contract quirks so the coder doesn't rediscover them mid-run

## Evidence

- coder discovered mid-run (execution.log.md): report.json only written when adapter output truthy
- system envelope retro fields need >=10 chars
- listAgents requires non-empty frontmatter description

## Candidate prompt delta

When delegating work that drives minih runAgent: state that FakeAgentAdapter must be seeded with a JSON envelope (stock output '' means no report.json), retrospective fields need >=10 chars, and listAgents skips packs with empty frontmatter description

## Promotion status

Pending manual review. No automatic promotion: do not edit `active.md` automatically. Record any promotion decision in `changelog.md`.
