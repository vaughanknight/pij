# pij Harness — Flight Plan

**Plan**: 002-pij-harness
**Status**: Ready (plan generated 2026-05-09)
**Mode**: Simple (testing overridden to Hybrid)
**Updated**: 2026-05-09
**Plan**: [pij-harness-plan.md](./pij-harness-plan.md) — 36 tasks across 6 phases

---

## Mission

Build the engineering harness that **encodes** authoring a new pi
extension into a single `npm run new` invocation plus the BIO loop, and
**compounds velocity** across extensions (measured against the v1 build
wall-clock baseline captured in `docs/velocity.md`). v1 success =
`npm run new -- demo && npm run self-check` green from a fresh clone,
with all P1–P10 patterns enforced by templates, ledgers seeded, CI
running, and a **measurement-anchored** compounding hypothesis logged:
"extension #2's `npm run new` → command-registered wall-clock is
materially shorter than v1's equivalent path."

The earlier specific-minute targets ("~80 min", "≤6 min", "<30 min",
"<2 min") were unmeasured intuition from workshop 004 and have been
**replaced** with measurement-anchored claims; see spec § Clarifications
session 2026-05-09b.

---

## Status snapshot

| Item | State |
|------|-------|
| Research | ✅ Complete (`../001-pi-extensions/research-dossier.md`, 182 findings) |
| Workshops 001-004 | ✅ Complete (3,236 lines covering distribution, dev-loop, scratch, harness) |
| Spec | ✅ Clarified (`pij-harness-spec.md` — this folder) |
| Clarification | ✅ Run 2026-05-09 (6 questions; all rubber-stamped at Recommended except Q1 Simple Mode and Q6 separate `docs/project-rules/harness.md` file) |
| Plan / phases | ✅ **Generated 2026-05-09** — `pij-harness-plan.md` — 36 tasks across 6 phases (Simple Mode, inline) |
| ADR (if needed) | ⬜ Not required — design locked in workshops 001–004 |
| Tasks dossiers | ⬜ Not generated — Simple Mode uses inline 7-column tables; `/plan-5` skipped |
| Companion agent | ✅ Installed (`agents/code-review-companion/`) — ready for `/plan-6-v2-implement-phase-companion` |
| Implementation | ⬜ Not started — next step `/plan-6-v2-implement-phase[-companion]` |

---

## Target Domains

| Domain | Status | Relationship |
|--------|--------|--------------|
| `harness` | NEW | create — root configs, scripts, templates, ledgers, docs, CI |
| `extensions` | NEW | create — `.pi/extensions/<name>/` namespace + conventions; v1 generates a throwaway `demo` |

---

## Complexity

**CS-3 (medium)** · S=2, I=1, D=0, N=1, F=0, T=1 → P=5 · Confidence 0.85

The design is locked in workshop 004; risk is mostly empirical (R-2: D-005
compaction survival; R-1: pi version drift). Six small phases, each
~30–90 minutes.

---

## Phase Outline (locked by plan)

| # | Phase | Tasks | Output | Validation |
|---|-------|-------|--------|------------|
| 1 | **Foundation** | T001–T009 | `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, verified `.gitignore`, `README.md` | `npm install` clean; typecheck clean; lint clean |
| 2 | **Templates + generator** | T010–T019 | 5 templates, `new-extension.ts` generator, `npm run new` wired, `demo` generated and validated | AC-02, AC-03 (typecheck), AC-06, AC-07 |
| 3 | **Test harness** | T020–T021 | `harness/test-utils.ts` (`makeRecorder`), vitest exercising demo | AC-03 (test) |
| 4 | **Smoke runner** | T022–T025 | `harness/scripts/smoke.ts`, demo smoke run, manual `/demo` verify | AC-04, AC-05 |
| 5 | **Project docs + ledgers** | T026–T030 | `AGENTS.md`, `RUNBOOK.md`, `docs/project-rules/harness.md` (BIO), `docs/difficulties.md` (D-001..D-008), `docs/velocity.md` (phases 0–5 + hypothesis) | AC-08, AC-09, AC-10, AC-11, AC-16 |
| 6 | **CI + self-check + teardown** | T031–T036 | `.github/workflows/ci.yml`, `self-check` script, demo torn down, v0.1.0 tagged | AC-01 (full), AC-12, AC-13, AC-14 |

**Total**: 36 tasks. Phase 5 may run in parallel with Phases 2–4 (docs/ledgers don't depend on templates compiling).

After Phase 6 ships → run `npm run new -- scratch` and start the velocity
test for **extension #2** (target <30 min, per AC-15 / OQ-1).

---

## Acceptance Anchors

16 testable scenarios (AC-01..AC-16) in the spec. The two load-bearing
ones for proving the philosophy:

- **AC-01** — Boot: fresh clone → `npm install && npm run self-check`
  exits 0; wall-clock recorded (no fixed minute threshold).
- **AC-15** — Velocity hypothesis: extension #2's wall-clock is
  materially shorter than v1's equivalent path (provisional target
  ≤ 50% of v1; falsifiable; locked when v1 baseline is measured).

---

## Open questions — status after clarify

Pre-clarify open questions OQ-1..OQ-6 carry forward from the spec; none
were promoted to clarify questions because all have agreed default
resolution paths:

- OQ-1: <30-minute hypothesis for extension #2 — *empirical, post-ship*.
- OQ-2: pin pi version range now or wait? — *defer to workshop 005*.
- OQ-3: Windows smoke support? — *Linux/macOS only for v1; document*.
- OQ-4: Does `customType` survive `/compact`? (D-005) — *answered by
  smoke scenario in extension #1 (scratch)*.
- OQ-5: `setStatus(key, "")` semantics? (D-006) — *observed during demo*.
- OQ-6: Keep `demo` extension long-term, or delete after v1? — *delete*.

Clarify session 2026-05-09 resolved Q1–Q6 in the spec (see
`pij-harness-spec.md` § Clarifications). Net effect on this flight plan:
phase 5 gains `docs/project-rules/harness.md`; AC-16 added; testing
strategy locked to Hybrid even under Simple Mode.

---

## Risks (top three)

1. **R-2 (D-005)** — `customType` may not survive `/compact`. If true,
   Pattern P9 needs revision and the first extension's storage strategy
   requires a snapshot fallback. *Detection*: smoke scenario in
   extension #1 will reveal; this is OQ-4.
2. **R-1** — Pi version drift could break templates. *Detection*: CI on
   each push catches typecheck/test failures; pi version pinning is a
   stretch goal (workshop opportunity).
3. **R-3** — Smoke is local-only (tmux + pi). CI cannot catch behavioural
   regressions. *Detection*: pre-merge `npm run smoke` discipline;
   SDK-driven smoke is a stretch goal (D-008).

---

## Decisions already locked in workshops

These do NOT need rediscussion in clarify/architect:

- **Toolchain**: npm scripts + tsx + biome + vitest. No `just`, no Make.
- **Layout**: T2 (`<name>/index.ts + store.ts + store.test.ts`) by default.
- **Patterns**: P1–P10 from workshop 003 are the rules; they are encoded,
  not nudged.
- **Templates as files** (not string literals in the generator).
- **CI scope**: typecheck + lint + test. Smoke deferred to local until
  D-008.
- **No publishing in v1.** Defer until ≥3 extensions are stable.
- **No file watcher in v1.** `/reload` is manual.

If any of these come up in clarification, the answer is "see workshop
003/004." Reopen only if a concrete blocker emerges.

---

## Next Steps

1. ✅ **`/plan-2-v2-clarify`** — done 2026-05-09.
2. ✅ **`/plan-3-v2-architect`** — done 2026-05-09 → `pij-harness-plan.md`.
3. ✅ **Companion agent installed** — `agents/code-review-companion/` from
   local minih (007-backgrounding); doctor=degraded (state vocab drift,
   non-blocking).
4. **`/plan-6-v2-implement-phase-companion`** *(recommended)* — implement
   the harness Phase 1 onward with the code-review-companion booted in
   parallel. Brief once per session, ping at every commit. Track
   wall-clock in `docs/velocity.md` as each phase completes.
   - Alternative: **`/plan-6-v2-implement-phase`** without the companion.
   - Alternative: **`/plan-4-complete-the-plan`** for an extra validation
     pass before implementation (optional in Simple Mode).
5. After v1 ships → **`npm run new -- scratch`** → measure extension #2
   wall-clock → log result → file any new D-NNN entries → close v1.

---

## See Also

- `pij-harness-spec.md` (this folder) — full spec with 15 acceptance criteria.
- `../001-pi-extensions/workshops/004-pij-harness.md` — design (file trees,
  full source for generator + smoke runner + AGENTS.md + RUNBOOK.md, etc.).
- `../001-pi-extensions/research-dossier.md` — research foundation.
- `../001-pi-extensions/workshops/003-scratch-extension.md` — the patterns
  the templates encode.
