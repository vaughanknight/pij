# Interview packet — pij-uec99o and its workers

**From**: s042 `pij-vital-tiglon` · **Authority**: Jordan's wishlist §2 and recorded cross-government waiver · **Purpose**: refine `spine.md` before planning the orchestrator-routing skill.

## Instructions for pij-uec99o

1. Answer the questions below from your own experience operating the prior flow.
2. Interview the workers you directed during that flow and ask them the worker questions below.
3. Preserve each respondent's words verbatim, labelled by pij id/role where available.
4. Write one response artifact plus a provenance file naming sources and SHA-256 fingerprints.
5. Send only the response-artifact path back through pij; do not inline the interview body.
6. Distinguish observed behavior from recommendations.

## Questions for the orchestrator

1. Walk through the actual sequence Jordan used from briefing/preamble through planning, validation, and build delegation.
2. What wording from Jordan most reliably signalled: explore now, consider a workshop/POC, plan now, validate now, and build now?
3. Where did orchestrators drift into doing implementation themselves, and what instruction would have prevented each incident?
4. What should an orchestrator automatically do immediately after receiving a prime brief?
5. How should `/thesis` fit between brief/orient and the human preamble?
6. What information did Jordan expect in the preamble before allowing planning to begin?
7. When were workshops or POCs genuinely useful, and what observable trigger distinguished them from unnecessary ceremony?
8. How was cold `/validate-v2` run, and what made its independence credible?
9. What exact pause or state should exist after validation so implementation cannot begin before Jordan names or confirms the fleet?
10. Which coder/reviewer configurations did Jordan choose in practice? Was same-model but separate-session review acceptable?
11. How were orchestrator windows and worker/reviewer splits arranged in tmux, and how was correct placement verified?
12. What progress, blocker, ruling, validation, and coordination updates did the o-prime need during the journey?
13. Which parts of the flow were forgotten after compaction or long turns?
14. Which requirements in `docs/plans/042-pij-orchestrator-routing-skill/spine.md` are wrong, incomplete, or over-specified?

## Questions for each worker

1. What packet or instruction made your role and boundary clearest?
2. Did the orchestrator ever perform work that should have remained yours? Give the concrete seam where it happened.
3. What information was missing when you started implementation or review?
4. Did coder and reviewer separation feel real and useful? What evidence made it independent?
5. What tmux placement or messaging behavior helped or hindered the work?
6. What progress did you need from the orchestrator, and what progress did the o-prime need from the orchestrator?
7. What single instruction should every new orchestrator receive to avoid repeating your run's biggest failure?

## Requested return shape

```text
claim
respondents[]
orchestrator_answers[]
worker_answers[]
observed_failures[]
recommended_requirements[]
spine_corrections[]
artifacts[]
shas[]
unknowns[]
```
