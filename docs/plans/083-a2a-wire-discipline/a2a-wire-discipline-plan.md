# A2A Wire Discipline — prompting-only terse agent-to-agent comms
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-08-03
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context
📚 Incorporates findings from research-dossier.md (live 6-seat survey + fleet inbox measurement + deep-research literature pass, all 2026-08-03):

- Fleet retained inboxes hold ~9,500 A2A messages averaging 1,208 chars ≈ **2.9M tokens** of message bodies. The terse control seat (statutory-seahorse) runs at ⅓ the prime average with no loss of function.
- Unanimous #1 waste across all six surveyed seats: **restating the recipient's own message back to them**. Then: re-explaining acked rules, praise/rapport (largest byte category, smallest behaviour category — measured), unchanged-baseline itemizations, hedge padding.
- The zero-value class is **acks and unsolicited confirmations** — short but numerous (0/11 PA acks changed action, counted). Style rules alone cannot touch this population; the convention needs **don't-send rules**.
- Count-vs-volume gap: ~30% of messages by count changed action but only ~15% by volume — the load-bearing messages are already the short ones.
- Literature: 28–73% of inter-agent tokens are prunable with neutral-to-**positive** quality effect (AgentPrune, ICLR 2025 — redundant traffic amplifies noise). Telegraphic style stays fully interpretable **iff identifiers, numbers, paths, and scope markers survive**; terseness hurts specifically when correcting false beliefs, disagreeing, or under low-confidence/high-impact.

### Summary
pij seats spend millions of tokens on inter-agent messages whose information content fits in a fraction of the bytes. Jordan ruled the fix must be **prompting/convention only — no deterministic tooling** (no compression middleware, no message linting, no protocol software). We encode a single canonical **wire-discipline convention** into the pij skill (`skills/pij/`) and cite it from every surface that shapes how a seat writes to another seat — so the discipline is inherited at spawn/brief time, not learned by imitation of verbose peers.

### Goals
- One canonical, quotable wire-discipline convention inside the pij skill; every message-shaping surface cites it (never restates it).
- Don't-send rules carry the weight: no unsolicited confirmations, no praise-as-its-own-message, one-line acks, explicit "silence after a clean verify = clean".
- Delta-first message shape: line 1 = the recipient's next action or decision (or `NO ACTION`), with the discriminating value (count/SHA/path); cite rulings by id, never restate.
- The exception stays legal: when correcting a false belief, disagreeing, or acting on low confidence with high impact, full reasoning IS the payload.
- Seats inherit the discipline at birth (spawn packets, stream briefs, seat handovers) and are told not to mirror a verbose peer's style.

### Non-Goals
- No deterministic enforcement: no linters, token counters, middleware, message schemas validated by code, or CLI changes.
- No change to human-facing reporting (status cards, reports to Jordan) — humans get the gist in prose; this governs seat→seat wire traffic.
- No rewrite of existing route contracts beyond the message-writing guidance they carry.
- No retroactive cleanup of historical messages.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-skill | existing | **modify** | Add the canonical wire-discipline convention + citations across routes, prime doctrine, and spawn/brief templates |

### Testing Strategy
- **Approach**: Manual verification (prose-only change).
- **Rationale**: Deliverable is prompt text in skill modules; no runtime surface. Verification = consistency sweep (every message-shaping surface cites the convention; no surface restates it) + a read-through against the acceptance criteria.
- **Focus Areas**: single-source-of-truth (no drift copies), spawn-time inheritance, exception wording.
- **Excluded**: automated tests (would be deterministic tooling and out of scope by ruling).
- **Mock Usage**: n/a.

### Documentation Strategy
- **Location**: No new documentation — the skill IS the documentation. The plan folder carries the evidence trail (dossier).
- **Rationale**: A separate doc would be a restatement the convention itself forbids.

### Complexity
- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=0, D=0, N=0, F=1, T=1
- **Confidence**: 0.85
- **Assumptions**: repo `skills/pij/` is the source of truth for the installed skill; existing install/sync flow carries edits to seats.
- **Dependencies**: none (prose only).
- **Risks**: see § Risks & Assumptions.
- **Phases**: 1 (Simple).

### Acceptance Criteria
1. **AC-01** — `skills/pij/references/00-routing.md` § Shared conventions contains a new convention (C10 — Wire discipline) stating: line-1 = recipient's next action/decision or `NO ACTION`; delta + discriminating value (count/SHA/path); cite prior rulings/messages by id, never restate; never restate the recipient's own words; unchanged state is at most one denominator line.
2. **AC-02** — C10 carries the don't-send rules verbatim: no unsolicited confirmations (silence after a clean verify = clean; a requested check returns one line `checked X, clear`), acks are one line and never restate the instruction, praise never travels as its own message.
3. **AC-03** — C10 carries the exception: correcting a false belief, disagreeing, or low-confidence/high-impact → full reasoning is the payload, flagged so the receiver can pull more; marked "rare — never use as cover".
4. **AC-04** — C10 carries anti-drift: identifiers/numbers/paths/scope markers are never compressed away; "do not mirror a verbose peer's style".
5. **AC-05** — `skills/pij/SKILL.md` global invariant 8 cites C10 (global reach across every route) without restating its body.
6. **AC-06** — Spawn/brief surfaces seed the discipline at seat birth: `routes/peer.md` (spawn/send), `prime/templates/stream-brief.md`, `prime/templates/seat-handover.md`, and `prime/orchestrator.md`'s coder/reviewer packet-freeze list each carry a one-line citation of C10 in their packet/brief shape.
7. **AC-07** — `prime/protocol.md` § Reports and verification folds in the silence-after-clean-verify norm and the exception; `routes/delegate.md`, `routes/skill.md`, `routes/pair.md`, `routes/agent.md`, and `prime/rituals/reports.md` return/report-shape guidance opens with the verdict/next-action line and cites C10.
8. **AC-08** — No new files under any non-skill path except this plan folder; `git diff` touches only `skills/pij/**` and `docs/plans/083-a2a-wire-discipline/**`.

### Risks & Assumptions
- **Compliance drift over long sessions** — mitigated by spawn-time placement (packets/briefs) rather than mid-conversation reminders, plus the do-not-mirror rule.
- **Over-compression dropping referents** — mitigated by AC-04's "ambiguity is not terse" floor.
- **Terse culture suppressing needed reasoning** — mitigated by AC-03's explicit exception; reviewers should treat a bare "no" on a correction as a defect.
- Assumes repo skill copy → installed skill copy sync is the existing release process (out of scope here).

### Open Questions
- None blocking. (Ordinal allocation resolved by o-prime pij-wee-albatross: 083; 078 is burned in merged history.)

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| — | | none — convention text is settled by survey + literature convergence | |

### Clarifications
#### Session 2026-08-03
- Q: Workflow Mode? → **Simple** (defaulted autonomously: CS-2, one domain, prose-only; pij doctrine forbids modal questions).
- Q: Testing Strategy? → **Manual** (prose artifact; automated checks would violate the prompting-only ruling).
- Q: Mock Usage? → n/a.
- Q: Documentation Strategy? → **No new documentation** (the skill is the doc).

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings + the convention text itself |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | no critical markers; defaults recorded in Clarifications |
| G2 | Constitution | N/A | no docs/project-rules/constitution.md |
| G3 | Architecture | N/A | no docs/project-rules/architecture.md |
| G4 | ADR Compliance | N/A | no docs/adr/ |
| G5 | Structure | PASS | all required sections present |
| G6 | Testing Alignment | PASS | manual verification task present (T008) |
| G7 | Domain Completeness | PASS | single existing domain `pij-skill`; manifest covers all files |

### Summary
Encode the wire-discipline convention once (C10 in the skill's shared conventions), then wire citations from the global invariant, the routes that shape replies, the prime doctrine, and the spawn/brief templates — so every seat inherits terse-by-default at birth and the don't-send rules (the measured bulk of the waste) are explicit norms, not style advice. Verify by consistency sweep.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| skills/pij/references/00-routing.md | pij-skill | contract | canonical C10 text (single source of truth) |
| skills/pij/SKILL.md | pij-skill | contract | global invariant 8 cites C10 |
| skills/pij/references/routes/peer.md | pij-skill | internal | spawn packet + send guidance cite C10 |
| skills/pij/references/routes/delegate.md | pij-skill | internal | return-shape opens with verdict line |
| skills/pij/references/routes/skill.md | pij-skill | internal | pushed-output shape cites C10 |
| skills/pij/references/routes/ready.md | pij-skill | internal | once-work-arrives note cites C10 |
| skills/pij/references/prime/protocol.md | pij-skill | internal | governing doctrine: silence norm + exception |
| skills/pij/references/prime/templates/stream-brief.md | pij-skill | internal | brief seeds discipline at stream birth |
| skills/pij/references/prime/templates/seat-handover.md | pij-skill | internal | handover seeds discipline at seat birth |
| skills/pij/references/routes/agent.md | pij-skill | internal | pushed-result shape cites C10 |
| skills/pij/references/routes/pair.md | pij-skill | internal | PM report + worker done-report shapes cite C10 |
| skills/pij/references/prime/orchestrator.md | pij-skill | internal | coder/reviewer packet-freeze list seeds C10 |
| skills/pij/references/prime/rituals/reports.md | pij-skill | internal | one-hop-up A2A report contract cites C10 |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Don't-send rules, not style rules, remove most traffic: acks/unsolicited confirmations are the 0%-value class (0/11 changed action, counted); style rules can't touch them | C10 leads with don't-send rules; "no reply after clean verify = clean" made an explicit norm (AC-02) |
| 02 | Critical | Unanimous top waste is restating the recipient's own message; praise is the largest byte category and smallest behaviour category (measured) | Explicit never-restate + praise-never-travels-alone rules (AC-01/AC-02) |
| 03 | High | Telegraphic compression is safe only while identifiers/values/scope markers survive; dropped referents are the primary failure mode | AC-04 floor: "terse is fine; ambiguous is not" |
| 04 | High | Bare corrections get acked but not internalised — reasoning is the payload when a seat is about to act on a false belief | AC-03 exception, marked rare/no-cover (also prevents terse culture from suppressing dissent) |
| 05 | High | Compliance drifts over long sessions; seats mirror verbose peers | Spawn-time placement (packets/briefs/handovers, AC-06) + do-not-mirror line (AC-04) |
| 06 | Medium | The skill already has a token-lean invariant (SKILL.md #8) but it is one line with no operational content and no reach into message shape | Upgrade invariant 8 into the citation hook for C10 (AC-05) |
| 07 | Critical | Live incident (2026-08-04, o-prime albatross / chief-roadrunner): a self-contradictory receipt relayed VERBATIM was the only evidence of a fleet-scoped chore defect; any tidy summary would have destroyed it — "a report that contradicts itself is a finding, not a formatting problem" | C10 rule 7: never reconcile a contradiction — relay instrument output verbatim, summary above, never instead |

### Implementation

**Objective**: One canonical wire-discipline convention in the pij skill, cited from every message-shaping surface, inherited at seat birth.
**Testing Approach**: Manual — consistency sweep + read-through against ACs.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Author **C10 — Wire discipline (A2A messages)** in § Shared conventions: don't-send rules, delta-first line-1 shape, cite-by-id, one-line acks, silence norm, exception, ambiguity floor, do-not-mirror | pij-skill | skills/pij/references/00-routing.md | AC-01..04 text present, ≤ ~25 lines, quotable | canonical copy — every other surface cites, never restates |
| [x] | T002 | Rewrite SKILL.md invariant 8 to cite C10 (keep one-line form + pointer) | pij-skill | skills/pij/SKILL.md | AC-05; no body restated | |
| [x] | T003 | peer.md: spawn packet guidance + send section cite C10 so spawned seats carry it from first turn | pij-skill | skills/pij/references/routes/peer.md | AC-06 | |
| [x] | T004 | delegate.md + skill.md + ready.md + pair.md: return/report shape = verdict/next-action first line, cite C10 (pair.md: PM report steps + worker done-report handling) | pij-skill | skills/pij/references/routes/{delegate,skill,ready,pair}.md | AC-07 (return-shape), ready's "once work arrives" cites C10 | |
| [x] | T005 | protocol.md: fold silence-after-clean-verify + exception into **§ Reports and verification**, cite C10; rituals/reports.md one-hop report contract cites C10 | pij-skill | skills/pij/references/prime/{protocol.md,rituals/reports.md} | AC-07 | supervisors enforce the exception, not just the terseness |
| [x] | T006 | stream-brief.md + seat-handover.md: one-line wire-discipline citation in the template body; orchestrator.md packet-freeze list seeds C10 into coder/reviewer packets | pij-skill | skills/pij/references/prime/{templates/{stream-brief,seat-handover}.md,orchestrator.md} | AC-06 | |
| [x] | T007 | agent.md: pushed-result shape cites C10 (agent packs return raw data, first line = result) | pij-skill | skills/pij/references/routes/agent.md | AC-07 | small |
| [x] | T008 | Consistency sweep: grep every route/prime file for restated rules; confirm single canonical copy + citations only; read-through vs AC-01..08 | pij-skill | skills/pij/** | zero restatement copies; all ACs check off; diff confined per AC-08 | manual verification |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001 | T008 |
| AC-02 | T001 | T008 |
| AC-03 | T001, T005 | T008 |
| AC-04 | T001 | T008 |
| AC-05 | T002 | T008 |
| AC-06 | T003, T006 | T008 |
| AC-07 | T004, T005, T007 | T008 |
| AC-08 | all | T008 |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Convention restated (not cited) in some surface → drift copies | Medium | Medium | T008 sweep; C10 marked "canonical — cite, never restate" |
| Over-terse corrections stop landing | Low | High | AC-03 exception is part of the canonical text, enforced in prime doctrine (T005) |
| Installed-skill copy lags repo copy | Medium | Low | Existing release/sync process; out of scope by assumption (noted in Risks & Assumptions) |
