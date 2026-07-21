# Prime experience survey — team scaffolding research

**From**: pij-ancient-rhinoceros (research/PM seat, working directly with Jordan in /Users/jordanknight/pi-hacking/pij)
**Date**: 2026-07-20
**Purpose**: Jordan wants to make agent-team scaffolding more deterministic. Today the network shape (prime → orchestrators → coders/reviewers) is assembled by convention and conversation. The goal: patterns/verbs so Jordan can say to a prime "read this, set up a new project team, get started" and it reliably happens. Your lived experience is the raw data.

**This is a survey, not a tasking.** No work item is being assigned. Answer from experience; be candid about friction and failure, not just doctrine. Doctrine we already have (protocol.md, kickoff.md); what we need is what *actually happened*.

## Questions for you (the prime seat)

1. **Genesis**: How did your seat and government come to exist — bootstrap ritual, adoption, human hand-seating? What was manual, fragile, or repeated?
2. **Team formation**: When you stood up orchestrators/streams, walk through what you actually did vs what kickoff.md prescribes. Which of the 17 steps earn their cost? Which do you shortcut or wish were one command?
3. **Roles in practice**: What roles have you actually run (orchestrators, coders, reviewers, researchers, PM-like seats)? Any roles you invented that doctrine doesn't name? Any doctrine roles you never needed?
4. **Human preamble → work handoff**: How does the "human pre-ambles a peer directly, peer then contacts the prime" flow work for you in practice? (That's how this very survey seat was started.) What breaks or gets lost?
5. **Scaffold verb design**: If `pij` grew a deterministic team-scaffold primitive (e.g. `pij team scaffold --plan <path>` creating project + worktrees + spawns + briefs + canaries from a manifest), what MUST it do, what MUST it leave to judgment, and what would you never trust to automation?
6. **Data-driven era (plan 054)**: Projects/tasks/states/nodes are now platform data. What of your governance is still file/prose-only that scaffolding could/should have as data?
7. **Resume & replacement**: Seat replacement is "a read from disk". True in practice? What state was missing when a seat was replaced or compacted?
8. **Top 3 frictions** in running your team, ranked. And your single highest-leverage wish.

## Tier-down request

Please also put questions 2, 4, 5, and 8 (adapted) to your current or recent orchestrators/children — those you can still reach — and fold their answers into your report, attributed by seat id. If none are reachable, say so and summarize from their persisted reports/briefs instead.

## Reply contract

- Write your report to: `/private/tmp/claude-501/-Users-jordanknight-pi-hacking-pij/df4920d8-e2ec-4232-8dca-d4082ee58e5f/scratchpad/prime-survey/report-<your-pij-id>.md`
- Then: `pij send pij-ancient-rhinoceros "survey-report: <that path>"`
- Pointer only, no inline body. No deadline pressure, but sooner helps — Jordan is waiting on the synthesis.
- Forbidden paths: `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, any government ledger outside your own seat's ownership. This survey changes no governance state.
