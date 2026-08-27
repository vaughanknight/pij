# Item 9 FIX (cold semantic review FIX_REQUIRED) — orchestrator.md semantic restorations

**Status**: complete — implementation commit `346c19fb622e3d0292331bc74cee5dcfe7bde899`

**Fence**: `skills/pij/references/prime/orchestrator.md` (+ maybe `references/routes/node.md` for F4) ONLY. **Do NOT revert bfbb08d** — peer/node/prime/kickoff APPROVED; only orchestrator.md has blocking findings. Budget headroom: orchestrator.md 112/120 (8 free) — F1+F2 cost ~2. **Verified against base fa6378a by the orchestrator.**

## Blocking (restore the semantics; gate stays 0 ✗)
| # | Fix | Detail |
|---|-----|--------|
| F1 | **Restore the read-back PRECONDITION ordering** | HEAD:53 inverted it: "After the human confirms the fleet, persist the choice and read it back verbatim before creation" puts read-back AFTER confirmation. BASE (fa6378a:56) had "read it back verbatim and confirm inline BEFORE fleet creation" — the read-back GATES the human's yes so a mis-transcribed model is caught before confirmation, not after. Reword so the read-back+confirm happens BEFORE the human confirms/creates. Keep the global-invariant-9 (no modal UI) reference. |
| F2 | **Restore the roster-authority line** | "the plan roster remains the durable configuration truth" was DELETED (0 matches anywhere in skills/pij). The surviving text mandates the WRITE but not the AUTHORITY — the reader has no rule for the flow-pair-vs-roster disagreement the preceding clause sets up. Restore that clause (or an equivalent that names the plan roster as the durable/authoritative config truth over the flow-pair engine's non-persisted override flags). |
| F3 | **Fix the false § C7 citation** | HEAD:91 says "Push-not-poll and outage-first recovery are § C7". C7 (00-routing.md) contains push-not-poll but NOT outage-first (grep-confirmed). Either drop "outage-first" from the C7 attribution (keep it asserted inline, which it already is) or word it "push-not-poll is § C7; outage-first recovery: ..." so no citation points at content C7 lacks. |

## Non-blocking (assess)
- F4 (medium, `node.md`): one behavioural admonition was cut to hit 150/150 (zero slack). If a genuinely-redundant line can be freed to restore it, do so; else add one line to `reports/item-9-fix-report.md` naming the cut admonition + why it's acceptable (or route to the o-prime).
- F5 (structural, OUT OF THIS FENCE): the `human preamble` order check is a FALSE POSITIVE (greps `head -1`, matched a backward cross-reference). The bfbb08d doc reorder was to silence a linter bug. Leave the doc edit (needed for a green gate today); the CHECK fix is a harness ticket (`reports/item-9-F5-harness-check-ticket.md`), NOT this packet.

## Tasks
| Status | ID | Task | Done When |
|--------|-----|------|-----------|
| [x] | 1 | Apply F1, F2, F3 to `orchestrator.md`; assess F4 | `just pij-skill-check` still 0 ✗; the three semantics restored; orchestrator.md ≤120 |
| [x] | 2 | Pathspec commit + `reports/item-9-fix-report.md` quoting base-vs-new for F1/F2/F3 | committed; report shows the restored wording |
