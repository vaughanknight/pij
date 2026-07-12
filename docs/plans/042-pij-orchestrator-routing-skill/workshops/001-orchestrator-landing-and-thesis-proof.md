# Workshop: orchestrator landing module and enforceable thesis invocation

**Type**: Integration Pattern + State/Proof Contract
**Plan**: 042-pij-orchestrator-routing-skill
**Spec**: `../spine.md`
**Created**: 2026-07-12
**Status**: Approved

**Value Thesis**: make a briefed orchestrator enter the correct role before it can drift, then make the `/thesis` requirement as enforceable as the available host signals permit without pretending a prose check proves runtime behavior.
**Target Proof Level**: Contract Ready
**Current Proof Level**: Contract Ready

**Selected Value Axes**:
- **Agent Readiness**: a cold orchestrator receives one unambiguous landing path and ordered next actions.
- **Proof Quality**: structural proof, report evidence, and runtime evidence are separated honestly.
- **Safety to Change**: the new module composes with the existing `prime` route instead of duplicating role detection.
- **Review Compression**: one file tree and acceptance matrix let implementation and review check the contract mechanically.
- **Learning Compounding**: the initial s042 role-misclassification becomes a permanent regression fixture.

**Related Documents**:
- `../spine.md` — R1, R2, R11, R12.
- `../research-dossier.md` — F-01, F-04, risks and planning handoff.
- `../../035-o-prime-routing-skill/workshops/001-prime-route-architecture.md` — authoritative single-row role-fan-out precedent.
- `../../../skills/pij/references/routes/prime.md` — current role triage.

**Domain Context**:
- **Primary Domain**: pij skill payload (`skills/pij/**`).
- **Related Domains**: pij control plane (identity/events), Builder, engineering-harness checks.

---

## Purpose

Resolve two plan-shaping questions:

1. Where the briefed-orchestrator module lives and how a new seat reaches it.
2. What "automatically invoke `/thesis`" means, what can be proved mechanically today, and what proof remains a host-sensor gap.

## Fresh Entrant Outcome

A fresh implementer should be able to:

- add the module and route pointer without inventing a second top-level role system;
- encode the exact ordered journey from role landing through preamble;
- extend `pij-skill-check` with honest structural assertions; and
- design a cold acceptance test that distinguishes contract proof from runtime proof.

## Key Questions Addressed

- Should orchestrator be a new `/pij` registry row or a role module inside `prime`?
- What exact file does the stream triage row load first?
- How does a spawned/adopted orchestrator invoke the route without human rescue?
- How is `/thesis` ordered, recorded, and checked?
- What proof is impossible with the current control-plane event substrate?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Contract Ready | The plan needs exact files, ordering, checks, and failure behavior. |
| Primary Value Axis | Agent Readiness | The defect happens before orient; the landing must be immediate. |
| Supporting Value Axes | Proof Quality, Safety to Change, Review Compression | Avoid fake runtime claims, duplicate routing, and prose-only review. |
| Downstream Loop Improved | Cold orchestrator boot → planning | A new seat can enter correctly without transcript history or an extra reminder. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| One `prime` registry row with role fan-out was selected and shipped in 035. | `../../035-o-prime-routing-skill/workshops/001-prime-route-architecture.md` D1-A/D1-C | Keep role detection inside `prime`. | Validated |
| Current stream triage loads `orient-global.md` directly. | `../../../skills/pij/references/routes/prime.md` role table | Exact pointer to replace. | Ready |
| Lived interview recommends module-first because worker-posture drift occurs before orient. | `../research/vendored/s042-interview-uec99o-response.md#Follow-ups-r2` F2 | Thin role landing must precede the orient stack. | Validated |
| This session initially announced it was awaiting a work packet. | `../reports/preamble-checkpoint.md#observations` | Regression fixture for wrong landing behavior. | Validated |
| Jordan ruled that a prime-briefed orchestrator automatically runs `/thesis`. | `../rulings.md` | Required journey step. | Ready |
| Control-plane Copilot peers currently have no pij tool-call event file. | POC below; harness observation `DL-001` | Universal runtime proof cannot rely on `pij tail --type tool_call`. | Validated |

## Decision Space

### D1 — routing home

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| A. New top-level `orchestrator` registry row | `/pij orchestrator` owns stream behavior. | Obvious name. | Caller must know its role; duplicates `prime` triage; violates 035's single-row rationale. | Rejected |
| B. Thin role module inside `prime` | Existing `/pij prime` triage loads `references/prime/orchestrator.md` for streams. | Reuses deterministic role probe; module lands before orient; no registry duplication. | Requires one extra role file. | **Selected** |
| C. Expand `routes/prime.md` | Put the whole journey in the route. | No new file. | Breaks rung-1 line budget and progressive disclosure; couples all roles. | Rejected |

### D2 — module name and scope

| Option | Description | Decision |
|--------|-------------|----------|
| `orient-stream.md` | Orientation-only name; does not describe plan/validate/delegate duties. | Rejected |
| `orient-orchestrator.md` | Better role name, but still implies orientation-only scope. | Rejected |
| `orchestrator.md` | Thin role landing plus the authoritative journey and pointers. | **Selected** |

`orchestrator.md` owns the role boundary and journey order. It cites existing Builder, pair, baton, report, and protocol surfaces; it does not restate their full contracts.

### D3 — route trigger

| Trigger | Contract |
|---------|----------|
| New spawn | The prime-authored spawn task says: invoke `/pij prime` first; do not begin work from the task body. |
| Adoption | The adoption brief says: invoke `/pij prime`; deterministic role triage resolves the adopted stream. |
| Resume/compact | Re-run `/pij prime`; role is re-derived from registry/government/brief evidence. |
| Missing/conflicting role evidence | Fail loudly and route the conflict one hop up; never select worker posture by inference. |

The stream brief's orient stack is updated to put the role landing first:

1. `/pij prime` → `prime/orchestrator.md`;
2. `orient-global.md`;
3. consuming repo `government/orient-local.md`;
4. item brief;
5. actual `/thesis` invocation;
6. human preamble.

### D4 — thesis invocation contract

The selected contract has four proof layers. They are cumulative, not interchangeable.

| Layer | What It Proves | Mechanism | Required |
|-------|----------------|-----------|----------|
| L1 — module contract | The shipped instructions demand the real action in the right order. | `orchestrator.md` says: invoke `/thesis` through the host skill mechanism after orient and before preamble/Builder; never synthesize a thesis-shaped answer from memory. | Yes |
| L2 — structural proof | The runtime payload still contains the anti-fake contract and ordered pointers. | `pij-skill-check` checks the new file, pointer integrity, line budget, required tokens, and relative ordering. | Yes |
| L3 — durable outcome | The stream carried the thesis into human alignment. | Preamble checkpoint records the thesis axes/output plus resulting human rulings. | Yes |
| L4 — runtime invocation proof | The host actually invoked the thesis skill. | Cold acceptance reads host-native tool-call evidence when available. | Best available; never fabricated |

**Anti-fake wording is load-bearing**:

> Invoke `/thesis` through the host's skill mechanism. A plausible thesis written from memory does not satisfy this step.

### D5 — honest proof ceiling

The skill and shell check cannot universally prove L4 today.

#### POC: control-plane event availability

```text
$ pij path pij-vital-tiglon --events
/Users/jordanknight/.pij/pij-vital-tiglon/events.ndjson

$ ls -l /Users/jordanknight/.pij/pij-vital-tiglon/events.ndjson
ls: .../events.ndjson: No such file or directory

$ ls -la /Users/jordanknight/.pij/pij-vital-tiglon
inbox/
```

Observed on the live Copilot control-plane orchestrator after real `/thesis` invocations. The pi extension captures `tool_call` events, but this control-plane peer has no event log. Therefore:

- `pij-skill-check` must claim **contract proof**, not runtime proof;
- the preamble report must claim **durable outcome**, not runtime proof;
- a cold acceptance run may use harness-native traces when available;
- missing cross-harness tool-call telemetry is a named harness gap, not a reason to weaken or fake the contract.

## Selected file architecture

```text
skills/pij/
├── SKILL.md                                  # registry unchanged: one `prime` row
└── references/
    ├── routes/
    │   └── prime.md                          # stream row now points to prime/orchestrator.md
    └── prime/
        ├── orchestrator.md                   # NEW: role landing + ordered journey, advisory max 120 lines
        ├── orient-global.md                  # existing portable rules, read second
        ├── rituals/
        │   └── kickoff.md                    # spawn/adopt task invokes /pij prime first
        └── templates/
            └── stream-brief.md               # ordered stack includes module + /thesis

harness/scripts/
└── pij-skill-check.sh                        # file/pointer/budget/order/anti-fake assertions
```

## `orchestrator.md` contract

| Section | Required content |
|---------|------------------|
| Role boundary | "You are a stream orchestrator"; own plan/fleet/accountability; never implement or pre-empt reviewer findings. |
| Ordered boot | orient-global → orient-local → brief → actual `/thesis` → human preamble → preamble report. |
| Planning | Guided `/builder`: explore, surface workshops/POCs, plan, cold `/validate-v2`. |
| Build gate | Visible `WAITING_FOR_BUILD_CONFIG`; read back and record user/default coder+reviewer profile. |
| Fleet | Verify stream worktree/branch; `/pij pair`; named coder + separate reviewer; peers split in the orchestrator window with the worktree cwd. |
| Packaging duties | Source-verify seams; immutable staging-safe packets; aim/freeze reviewer; stop-and-rebrief on change. |
| Coordination | Event-driven pointer reports to o-prime; one-hop escalation; use existing timing-baton and fallback shared-tree primitives by pointer. |
| Landing | `/builder 8 ship` pushes the stream branch, opens a PR, watches CI, and gates merge through its existing confirmations. |
| Resume | Re-run `/pij prime`; re-derive state from substrate, never memory. |
| Failure modes | Missing thesis skill, conflicting role evidence, unavailable peer config, missing seam/grant, mutable review lane. |

## Structural check contract

`pij-skill-check` adds:

1. `prime/orchestrator.md` exists and is in the prime payload list.
2. `routes/prime.md` has exactly one stream row pointing to it.
3. `orchestrator.md` resolves all relative Markdown pointers.
4. Advisory line budget ≤120.
5. Required ordered markers occur once and in order:
   - role boundary;
   - `orient-global.md`;
   - `government/orient-local.md`;
   - item brief;
   - `/thesis`;
   - `host skill mechanism`;
   - human preamble;
   - `/builder`;
   - `/validate-v2`;
   - `WAITING_FOR_BUILD_CONFIG`;
   - `worktree`;
   - `/pij pair`;
   - `/builder 8 ship`.
6. Negative markers fail:
   - language permitting direct implementation;
   - language permitting orchestrator-authored review findings;
   - a second top-level orchestrator registry row.

The check does not report "thesis invoked." It reports "runtime contract contains the enforceable invocation instruction."

## Journey state table

| State | Entry evidence | Required action | Exit evidence |
|-------|----------------|-----------------|---------------|
| `LANDED` | `/pij prime` resolves stream role. | Load `orchestrator.md`; state boundary. | Role acknowledged. |
| `ORIENTED` | Ordered files read and claims checked. | Invoke `/thesis` via host mechanism. | Thesis output available. |
| `PREAMBLE` | Thesis + ask + open decisions ready. | Human confirms assignment/config; record rulings. | Preamble report pointer. |
| `PLANNING` | Assignment confirmed. | Guided Builder through validated plan. | Frozen plan + verdict. |
| `WAITING_FOR_BUILD_CONFIG` | Plan validated. | Stop; read back default or await named fleet. | User-confirmed profile. |
| `DELEGATING` | Fleet profile and worktree/branch recorded. | `/pij pair`; package, review, verify, report. | Phase checkpoints on stream branch. |
| `LANDING` | All phases approved. | `/builder 8 ship`: push branch, open PR, watch CI, confirm merge. | PR/CI/merge report. |

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Cold orchestrator boot | Prompt interpretation decides role. | `/pij prime` deterministically loads one role module. |
| Skill review | Reviewer searches prose for intended order. | One module contract + ordered marker check. |
| Thesis compliance | "It mentioned thesis" can masquerade as proof. | Contract, outcome, and runtime proof are explicitly separated. |
| Acceptance testing | Cross-harness telemetry assumed. | Host trace used when present; missing control-plane telemetry named honestly. |
| Plan authoring | Route row vs role module remains open. | File tree and contracts are fixed. |

## Validation / Acceptance

This workshop is Contract Ready when:

- one `prime` registry row remains authoritative — **selected**;
- stream triage lands on `prime/orchestrator.md` before orient — **selected**;
- spawn/adopt/resume all enter through `/pij prime` — **selected**;
- the module's ordered journey and anti-fake thesis wording are exact — **specified**;
- worktree-per-stream construction and Builder ship PR landing are the default — **selected by human ruling**;
- structural checks prove payload presence/order without claiming runtime invocation — **specified**;
- preamble checkpoints carry the thesis outcome — **specified**;
- host-native runtime evidence is used when available and absence is surfaced honestly — **specified and POC-constrained**.

## Open implementation detail

The cold acceptance runner must inspect the actual tool-call shape exposed by each supported harness. Copilot control-plane sessions currently expose no pij event file, so the plan must either add a cross-harness trace affordance or mark L4 unproven for that harness while still enforcing L1–L3.
