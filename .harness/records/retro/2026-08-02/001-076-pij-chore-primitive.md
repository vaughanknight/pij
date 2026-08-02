---
record_kind: "retro"
harness_version: "0.13.0"
branch: "s082/chore-primitive"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-08-02T02:02:59.794Z"
agent: "pij-concerned-thrush"
plan_id: "076-pij-chore-primitive"
schema_version: "1.2"
retro_id: "2026-08-02T02:02:59Z-pij-concerned-thrush-a7f2"
started_at: "2026-08-02T00:54:33Z"
ended_at: "2026-08-02T02:03:00Z"
summary: "Phase-end drain for plan 076 `pij chore` — 5 entries, all kept, none declined. Orchestrated build: 1 coder seat (copilot gpt-5.6-sol xhigh), 1 adversarial reviewer seat (copilot gpt-5.6-terra high), 1 plan-validator subagent. Theme: three separate gates reported green on things they had not proven."
entries:
  - id: DL-001
    kind: difficulty
    description: "harness boot reported 'boot-typecheck-failed — the TypeScript surface does not compile' on a fresh worktree whose node_modules was simply absent; the real fix was 'just _root-lock-npm-ci', not a type error. Boot has no missing-deps precondition check, so its verdict misdirects every fresh-worktree agent."
    target: project-sensor
    severity: degrading
    workaround: "ran npm run typecheck directly, saw TS2688 'cannot find type definition file for node', then checked for node_modules"
    suggested_encoding: "a missing-deps precondition in .harness/extensions/boot/extension.ts that reports 'dependencies not installed — run just _root-lock-npm-ci' before ever attributing failure to the TypeScript surface"
    fp: "3b326404a471"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T00:54:33.733Z"
  - id: DL-002
    kind: difficulty
    description: "npm ci fails in this repo with '--min-release-age cannot be provided when using --before' because .npmrc sets min-release-age=7 and the git dep (minih) makes npm synthesize --before. The paved workaround exists (just _root-lock-npm-ci → npm ci --min-release-age=null) but nothing points a newcomer at it from the failure."
    target: tooling
    severity: degrading
    workaround: "found _root-lock-npm-ci by grepping the justfile for 'install'"
    suggested_encoding: "the upstream error is unavoidable, so make the pointer discoverable: a top-level `just install-deps` alias, or a README/AGENTS.md line naming _root-lock-npm-ci as the only working install path"
    fp: "d44ff3f4247d"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T00:54:33.854Z"
  - id: DL-003
    kind: difficulty
    description: "Full harness smoke lost tmux pane %588 during package bootstrap, then timed out in waitIdle; all static/unit/windows/pkg/snapshot sensors passed."
    target: project-sensor
    severity: annoying
    workaround: "focused retry passed"
    suggested_encoding: "distinguish 'pane died' from 'pane idle-timeout' in the smoke driver's failure message so a flake is not read as a product failure"
    fp: "77862bff7569"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T01:35:11.969Z"
  - id: DL-004
    kind: difficulty
    description: "Research finding F-07 asserted 'pij has no role gating' after grepping only cli.ts for E-ROLE/allowedRoles/requireRole. The real gate is PA_VERB_CLASSIFICATION in core/orchestration/pa-capability.ts (fa3bdc1/PR#68) and uses none of those three terms. A new verb family MUST be classified there or the table silently stops being total — but nothing points an author at it: no test fails, and the table's own docstring is the only place the requirement is written. A totality test over the CLI's dispatch branches vs PA_VERB_CLASSIFICATION keys would have caught my error and would catch the next one."
    target: architecture-fitness
    severity: degrading
    workaround: "the implementing seat found the table independently and classified `chore` correctly, despite the plan telling it no permission work was needed"
    suggested_encoding: "a totality test: enumerate the CLI's top-level dispatch branches and assert every one has a PA_VERB_CLASSIFICATION entry — the table claims to be total, so make the claim load-bearing"
    fp: "8ffe8ede6bda"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T01:51:27.475Z"
  - id: INS-001
    kind: insight
    description: "The review found a HIGH the plan-stage validator and the backpressure survey both missed: a probe's own stdout is spliced unframed into the report, so it can forge a CHANGED record for a chore that does not exist. Neither the plan's Risks table nor the coverage matrix modelled 'probe output is untrusted input' — the survey classified report format as provable by string assertions, which is true and useless here, because the assertions test OUR lines, not injected ones. Generalisable: any tool that renders subprocess output into a record format needs an injection test, not just a format test."
    target: security
    suggested_encoding: "add 'is any rendered text probe/attacker-controlled?' to the backpressure survey's failure-mode derivation (STEP 2), so injection is modelled at plan time rather than found at review time"
    fp: "dea69b7c3566"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T01:57:16.860Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — plan 076 `pij chore` (phase-1 drain)

## The theme: three gates reported green on things they had not proven

- **`harness boot`** said the TypeScript surface did not compile. It compiles fine —
  `node_modules` was simply absent. The verdict named the wrong layer, and would misdirect
  every agent entering a fresh worktree (DL-001).
- **The plan-stage validator** returned NEEDS ATTENTION and caught seven real defects — good
  work — but never modelled probe output as untrusted input, so the report-forgery defect
  passed straight through into code (INS-001).
- **The backpressure survey** rated the report format provable by string assertions. True, and
  useless here: those assertions test the lines *we* emit, never the lines a probe injects.

The forgery defect was caught only by an adversarial reviewer seat that had been explicitly
instructed to treat the implementer's green report as a claim rather than evidence. That is
this session's strongest argument for keeping an independent review pass even when every
automated gate is green.

## Highest-leverage encode

**DL-004 — make `PA_VERB_CLASSIFICATION`'s totality load-bearing.** It is the only entry where
the *absence* of a check let a wrong belief survive all the way into a committed plan: my
research asserted no role gating existed, the plan wrote that into a Non-Goal, and nothing in
the repo contradicted it. A totality test over CLI dispatch branches vs table keys converts
"this table is total" from a docstring promise into a failing build. Every future verb family
pays for it once instead of rediscovering it.

## Carried forward

All five stay `open`. None were fixed in-flight, deliberately: the plan-076 PR is scoped to the
`pij chore` feature, and folding harness fixes into it would cost more review attention than
the fixes are worth. They are the candidates for the post-flight harvest.
