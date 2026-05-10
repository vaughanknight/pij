# scratch — Flight Plan

**Plan**: 003-scratch
**Status**: ⏸️ **In flight — awaiting user dogfood** (2026-05-10; agent code path complete; 2 commits on main; T006 + T011 + D-005 verification pending)
**Mode**: Simple
**Updated**: 2026-05-10
**Spec**: [scratch-spec.md](./scratch-spec.md)

---

## Mission

Build pij's first **kept** extension — `scratch`, a session-scoped
notepad — using only the v0.1.0 harness path. Three deliverables ride
together:

1. A working `/scratch` extension end-to-end (AC-01..AC-10).
2. **D-005 resolved** — does `customType` survive `/compact`? (AC-11.)
3. **AC-15 velocity hypothesis decided** against the v1 baseline
   recorded in `docs/velocity.md` (AC-13/AC-14).

The point is **orientation**, not feature scope. Scratch is small enough
to keep in one head and exercises seven of the highest-value
ExtensionAPI surfaces, so building it leaves both authors with a working
mental model.

---

## Status snapshot

| Item | State |
|------|-------|
| Workshop 003 (design) | ✅ Complete — 942 lines, paste-ready (in plan 001) |
| Spec | ✅ Clarified (`scratch-spec.md` — this folder) |
| Clarification | ✅ Run 2026-05-10 (3 questions; all rubber-stamped at Recommended; Mocks/Docs/Domain/Harness inline-resolved) |
| Plan / phases | ✅ Generated 2026-05-10 — [`scratch-plan.md`](./scratch-plan.md) — 12 tasks (T001–T012; T008 conditional) |
| Validation | ✅ Done 2026-05-10 — plan-4 READY (0 HIGH); validate-v2 PASS (1 HIGH + 2 load-bearing MEDIUMs fixed; 1 MEDIUM + 6 LOWs deferred) |
| Implementation | ⏸️ Agent code complete (T001-T005, T007 — commits `bda8e92`, `f32ac06`); awaiting user runtime verification (T006, T011, D-005) |

---

## Target Domains

| Domain | Status | Relationship |
|--------|--------|--------------|
| `harness` | existing (informal) | consume — no changes |
| `extensions` | existing (informal namespace) | modify — add `scratch` |

pij has no formal `docs/domains/` registry. If a third or fourth
extension creates pressure for one, that's a downstream workshop.

---

## Complexity

**CS-2 (small)** · S=1, I=1, D=1, N=0, F=0, T=1 → P=4 · Confidence 0.85

Design is locked in workshop 003. Risk is empirical (R-1: D-005
compaction survival; R-3: template friction surfacing during build). One
phase, inline tasks.

---

## Acceptance anchors (load-bearing)

- **AC-01** — `npm run new -- scratch` produces a working extension with
  no manual edits required.
- **AC-11** — Smoke scenario verifies D-005 (compaction survival); ships
  the snapshot fallback in this PR if falsified.
- **AC-13** — Scratch's absolute wall-clock recorded in
  `docs/velocity.md`. **AC-15 ratio decision is decoupled** from this
  PR (clarify Q3) — moves to extension #3 retrospective when ≥2
  real-extension data points exist.

---

## Risks (top three)

1. **R-1 (D-005)** — `customType` may not survive `/compact`. *Detection*:
   AC-11 smoke. *Mitigation*: snapshot fallback ready (~30 LOC).
2. **R-3** — Template friction surfaces during build (P6 casts? `.js`
   imports? generator UX?). *Detection*: log D-NNN as encountered;
   encode surgical fixes inline.
3. **R-4 [downgraded]** — Velocity ratio drift is no longer a risk in
   this PR. AC-15 ratio is decoupled (clarify Q3); scratch produces the
   first real-extension data point, ratio judgment defers to extension
   #3.

---

## Decisions already locked in workshop 003

These do NOT need re-clarifying:

- Slash command shape: `/scratch <list|add|del|clear>`.
- Tool surface: `scratch_save`, `scratch_list` (no `scratch_delete`).
- Persistence: append-only `customType` entries
  (`scratch:note|delete|clear`).
- Replay: single `session_start` handler walks `getEntries()`.
- Per-session scope (not per-project).
- TypeBox for tool schemas.
- T2 layout (`index.ts` + `store.ts` + `store.test.ts`).
- Patterns P1-P10 from workshop 003.

If any of these come up in clarify/architect, the answer is "see
workshop 003 § <section>." Reopen only if a concrete blocker emerges.

---

## Next Steps

1. ✅ **`/plan-2-v2-clarify`** — done 2026-05-10 (3 questions; all
   Recommended; Mocks / Docs / Domain / Harness inline-resolved).
2. **`/plan-3-v2-architect`** *(next)* — generate the inline-task plan.
   Single phase. Tasks pull paste-ready code from workshop 003 §
   Reference implementation. Smoke task verifies D-005.
3. **`/plan-6-v2-implement-phase[-companion]`** — build it.
4. After scratch is green → log absolute wall-clock to velocity.md →
   resolve D-005 + D-006 → file any new D-NNN. AC-15 ratio decision
   stays open until extension #3.

---

## See Also

- [scratch-spec.md](./scratch-spec.md) — full spec (this folder).
- [../001-pi-extensions/workshops/003-scratch-extension.md](../001-pi-extensions/workshops/003-scratch-extension.md)
  — authoritative design (paste-ready code).
- [../002-pij-harness/pij-harness-spec.md](../002-pij-harness/pij-harness-spec.md)
  — AC-15 velocity hypothesis scratch is testing.
- [../../velocity.md](../../velocity.md) — v1 baseline.
- [../../difficulties.md](../../difficulties.md) — D-005, D-006 carry
  forward.
