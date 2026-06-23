# pij Status-Bar Id + Drop session-sql:ready
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-06-23
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Summary
Surface the current session's **pij id** (`pij-<id>`) in pi's bottom status bar so a
human glancing at the footer knows which pij peer this terminal is — the id is
currently only visible in the boot briefing / `pij list`. While we're in the
footer, **remove the `session-sql: ready` entry** (noise — we don't need it).

### Goals
- The pi footer shows this session's `pij-<id>`, alongside the todo / file-watch indicators.
- The footer no longer shows `session-sql: ready`.
- Smallest possible change — two existing extensions, no new files of consequence.

### Non-Goals
- No new footer *rendering* (we use the existing `ctx.ui.setStatus` contribution API, not `setFooter`).
- No change to how the pij id is derived, nor to the session-sql tool itself (only its footer status).
- No config/toggle surface for the session-sql status — just remove it (YAGNI).

### Target Domains
> pij has no `docs/domains/` registry — this table (the two extensions touched) is the whole domain context.

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `.pi/extensions/pij` | existing | **modify** | Add a footer status entry carrying `self` (the pij id) |
| `.pi/extensions/session-sql` | existing | **modify** | Stop emitting the `session-sql: ready` footer status |

### Testing Strategy
- **Approach**: Lightweight. The status call is a UI side-effect; assert it via a fake `ctx.ui` (the `pi-peacock` test pattern — `setStatus: (k,v)=>captured.push({k,v})`).
- **Focus**: pij sets `("pij", self)` on session start; session-sql no longer sets a `ready` value.
- **Excluded**: live TUI rendering (can't unit-test pixels); covered by the manual reload check (AC).

### Documentation Strategy
- **Location**: none (trivial, self-evident change). A one-line mention can ride along in `docs/how/pij.md` if/when that lands (plan 017 Phase 3) — not gated here.

### Complexity
- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=0, N=0, F=0, T=1
- **Confidence**: 0.9
- **Assumptions**: `ctx.ui.setStatus(key, value|undefined)` is the stable contribution API (confirmed in `docs/tui.md` Pattern 4 + `docs/extensions.md`); footer renders each extension's status value.
- **Dependencies**: none.
- **Risks**: see Risks table.
- **Phases**: 1.

### Acceptance Criteria
- **AC-01** — After boot, the pi footer shows the session's `pij-<id>` (the same id used in `[pij from <id>]` / `pij list`).
- **AC-02** — The footer no longer contains `session-sql: ready`.
- **AC-03** — On `/new` or `/reload` (id may change), the footer reflects the **current** id (no stale value) — same-key overwrite on each `session_start`.
- **AC-04** — A unit test proves pij calls `setStatus` with the pij id via a fake `ctx.ui` (non-vacuous: neutering the call fails the test).

### Risks & Assumptions
- Footer value rendering: extensions put the human label *inside the value* (`"session-sql: ready"`, `"todo: 3 open"`). pij's `self` already starts with `pij-`, so the value `self` renders self-labellingly as `pij-<id>` — no separate prefix needed (coder's call; KISS).

### Open Questions
- None blocking. (Exact value string — bare `pij-<id>` vs a small glyph prefix — is a coder micro-choice, not a spec decision.)

### Workshop Opportunities
_None — the change is too small to workshop._

### Clarifications
#### Session 2026-06-23
- Mode → **Simple** (`--simple`, user: "super simple / KISS / don't overbake").
- Testing → **Lightweight**, Mocks → **targeted** (fake `ctx.ui`), Docs → **none** — applied as KISS defaults per the user's "just power through" directive (not interrogated).

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | n/a — feasibility confirmed inline via `docs/tui.md` + extension source grep |
| workshops/*.md | n | n/a |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical NEEDS-CLARIFICATION markers |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | No `docs/adr/` |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | Lightweight: ≥1 validation task (T-04); AC measurable |
| G7 | Domain Completeness | PASS | Both touched extensions in Target Domains + Manifest |

### Summary
Add one `ctx.ui.setStatus("pij", self)` call to the pij extension's `session_start`
handler (right after `self` is derived), and remove the single `session-sql: ready`
status line from the session-sql extension. One lightweight unit test guards the pij
call via a fake `ctx.ui`. Single phase, two files.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/index.ts` | pij | internal | Adds the footer status entry on session start (+ clear on the existing dispose path if present) |
| `.pi/extensions/pij/index.test.ts` *(or nearest existing test)* | pij | internal | Fake-`ui` assertion that the pij id is published |
| `.pi/extensions/session-sql/index.ts` | session-sql | internal | Removes the `session-sql: ready` status emission |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | `setStatus(key, value\|undefined)` is the footer contribution API (`docs/tui.md` Pattern 4; `docs/extensions.md`); value carries the visible text | Use it directly — do **not** touch `setFooter` |
| 02 | High | `session-sql/index.ts:161` emits `` `${STORE_NAME}: ready` ``; line 184 already clears on dispose | Neuter line 161 (drop the `ready` value); leave the dispose-clear alone |
| 03 | High | pij's `self` (the `pij-<id>`) is derived in the `session_start` handler (`index.ts` ~L221), re-run on reload/new | Set the status right after `self = deriveSelfId(...)`; same key → overwrite handles AC-03 |
| 04 | Med | `pi-peacock`'s test fakes `ctx.ui.setStatus` to capture `{key,text}` | Reuse that pattern for the pij test (no real TUI needed) |

### Implementation

**Objective**: Publish the pij id to the footer; remove `session-sql: ready`.
**Testing Approach**: Lightweight — fake `ctx.ui.setStatus`, assert the pij id is published.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T-01 | Add a `PIJ_STATUS_KEY` const + `ctx.ui.setStatus(PIJ_STATUS_KEY, self)` immediately after `self` is derived in the `session_start` handler | pij | `.pi/extensions/pij/index.ts` | Footer shows `pij-<id>` after boot/reload (AC-01, AC-03) | Same key overwrites on each session_start |
| [ ] | T-02 | If pij has a dispose/cleanup path, also `setStatus(PIJ_STATUS_KEY, undefined)` there (best-effort; fold into T-01 if no dispose hook) | pij | `.pi/extensions/pij/index.ts` | No stale `pij-<id>` lingers after teardown | Mirror session-sql:184 |
| [ ] | T-03 | Remove the `session-sql: ready` status emission (neuter `index.ts:161` so no `ready` value is set) | session-sql | `.pi/extensions/session-sql/index.ts` | `session-sql: ready` no longer in footer (AC-02); session-sql tool still works | Leave the dispose-clear (L184) intact |
| [ ] | T-04 | Lightweight test: fake `ctx.ui.setStatus`, assert pij publishes the pij id; mutation-check by neutering T-01 | pij | `.pi/extensions/pij/index.test.ts` *(or nearest)* | Test passes; neutering the setStatus call fails it (AC-04) | `pi-peacock` test pattern |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T-01 | Manual footer check after boot + T-04 |
| AC-02 | T-03 | Manual footer check (no `session-sql: ready`) |
| AC-03 | T-01 | Manual `/reload` then footer check |
| AC-04 | T-04 | Unit test (non-vacuous via mutation) |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Footer value rendering differs from assumption (label-in-value) | Low | Low | Confirm against `getExtensionStatuses` consumer; bare `self` renders as `pij-<id>` regardless |
| pij has no clean dispose hook for T-02 | Med | Low | T-02 is best-effort; overwrite-on-session_start (T-01) already keeps it current |

---

## Validation Record (2026-06-23)

> Run **as-parent** (not fanned out): the artifact is a CS-2 two-edit Simple plan, and this session's builtin `explore`/`scout` agents are read-blind (tool-name mismatch with `ctx_*`). Lenses merged per the validator's tiny-artifact exception; every claim cross-checked against real source.

### Validation Thesis
- **Raison d'être**: Make the session's pij id glanceable in the footer; drop `session-sql: ready` noise.
- **Value claim**: A human (or operator juggling several pij peers) knows which peer a terminal is without running `pij list`.
- **Artifact promise**: The implement phase gets exact, source-verified anchors (`session-sql/index.ts:161`; pij `self` derivation in the `session_start` handler) + the confirmed contribution API (`ctx.ui.setStatus`).
- **Intended beneficiaries**: the implement phase (flow-pair coder/reviewer); end users reading the footer.
- **Proof target**: Implementation.
- **Evidence standard**: real file:line anchors, a confirmed API (`docs/tui.md` Pattern 4 + `docs/extensions.md`), testable + non-vacuous ACs.
- **Thesis source**: `original-ask.md` + inline source grep.
- **Thesis verdict**: **Advanced** — the plan targets exactly the two edits that satisfy the ask, at Implementation proof level.
- **Main thesis risk**: footer value-rendering assumption (label-in-value) — Low; bare `self` renders as `pij-<id>` regardless.

| Agent (lens) | Issues | Verdict |
|---|---|---|
| Thesis Alignment | 0 | ✅ advanced at Implementation level |
| Source-Truth (anchors real?) | 0 — `session-sql:161` + pij `self` confirmed via grep | ✅ |
| Forward-Compatibility (→ implement phase) | 0 | ✅ |
| Completeness / Testing (AC measurable, T-04 non-vacuous) | 0 | ✅ |

### Forward-Compatibility Matrix

| Consumer | Requirement | Failure Mode | Verdict | Evidence |
|----------|-------------|--------------|---------|----------|
| implement phase (flow-pair) | exact edit anchors + confirmed API | contract drift | ✅ | `session-sql/index.ts:161`, pij `self` @ `index.ts` session_start; `setStatus` in `docs/tui.md` |
| AC-04 unit test | fake-`ui` capture pattern exists | test boundary | ✅ | `pi-peacock/index.test.ts:53` fakes `setStatus` |

**Thesis alignment**: value claim advanced at Implementation proof level; main risk (footer value rendering) is Low and coder-verifiable.
**Outcome alignment**: as planned, the footer will carry `pij-<id>` and drop `session-sql: ready` — exactly the user's ask; the two-edit shape advances it directly.

**Standalone?**: No — downstream is the implement phase.

Overall: ✅ **VALIDATED**
