# Item 18: watchdog-sensor ratchet + doc/relay parked-state cleanup

**Plan**: `../../day3-codex-doctrine-plan.md` (§ Item 18) · **Source**: item-14 cold review (`reviews/item-14-review.md`, `reviews/item-14-adv4-rereview.md` — ADV-5/INFO-7/8/9) + o-prime ruling 2026-08-28
**Base**: origin/main (fetch tip at dispatch) · **This is a SKILL-TEXT PR** → full gate: `just pij-skill-check` (0 ✗) + `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts` + cold SEMANTIC review.
**Fence**: `.pi/extensions/pij/cli.integration.test.ts` (the ratchet), `docs/how/pij-watchdog.md` (ADV-3), `skills/pij/references/prime/orient-oprime.md` (ADV-5), `skills/pij/references/00-routing.md` (INFO-7, one-word citation fix). NO watchdog.ts change (the emitter is CORRECT — the doc is stale).

### Executive Briefing — the E6 class, made concrete
`buildWatchdogTurn` (`core/watchdog.ts:367`) emits a close of:
> "If this unit of work is finished, run `pij report state done`; if you are idle but available on a standing assignment, run `pij report state ready`."
The doc `docs/how/pij-watchdog.md` (:218-219, and the recovery axis :200-205) says only:
> "If done, run `pij report state done`." — and lists done/question/blocked, **never `ready`**.
The gate `cli.integration.test.ts:327` asserts `liveGuidance.toContain("If done, run \`pij report state done\`")` — i.e. it pins the DOC's own stale literal. So the doc can omit `ready` (and the mute set) forever and the gate stays green. **E6 = a green gate certifying the wrong text.** The fix is to pin the doc against the CODE's emitted guidance, not against itself.

### Anchors (re-verify at dispatch)
- Emitter output: `watchdog.ts:392-413` (the `ask`/`close`/`turn` construction). Header prefix to strip: `[pij watchdog #${ordinal} for ${id}] Keep going if working.` (`:368`).
- Mute set truth: `mutesWatchdogNudge` (`watchdog.ts:332`) = `blocked|question|hold|waiting`; `state.ts:139` (`hold` issuer-set); `watchdog.ts:399-405` (`waiting` deliberately not offered to an unblocked seat). `done`/`ready` never mute.
- E6 test: `cli.integration.test.ts:312-331` (the `it("skill guidance routes first-person reports and retires completion self-pause")`).
- Doc: `docs/how/pij-watchdog.md` recovery axis `:200-205`, close `:218-219`.
- ADV-5: `orient-oprime.md:117-118` (relay menu `waiting|hold|blocked|question`).
- INFO-7: `00-routing.md` C9 phrase "per node doctrine" — node.md does NOT split waiting from blocked; the external-vs-self sense lives in `state.ts:145`. Fix the pointer or drop the three words.

### Tasks
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 (E6 RED) | rewrite the `cli.integration.test.ts` watchdog assertion: build the actual guidance by calling `buildWatchdogTurn(id, 1, {owesCard:true, ownAltitude:false})` (import from `core/watchdog.js`), strip the header prefix, and assert the DOC (`pij-watchdog.md`) CONTAINS each substantive clause the emitter produces — critically the `ready` clause ("idle but available on a standing assignment, run `pij report state ready`") and the `done` clause. On current (stale) doc this is RED because the doc lacks `ready`. | pij-skill / pij-control-plane | `.pi/extensions/pij/cli.integration.test.ts` | RED on current doc | keep the existing `.not.toContain` self-pause guards; ADD the code-anchored positive checks |
| [ ] | T002 (ADV-3 GREEN) | fix `docs/how/pij-watchdog.md`: add `ready` to the recovery axis (`:203-205`) and the close (`:218-219`) so it matches the emitter; add an explicit "what mutes / what never mutes" line — mute = `blocked|question|hold|waiting`; `done`/`ready` NEVER mute (cite `watchdog.ts:332`). | pij-control-plane | `docs/how/pij-watchdog.md` | T001 GREEN; doc states the full mute set + ready | do NOT change watchdog.ts |
| [ ] | T003 (ADV-5) | `orient-oprime.md` duty 7 (`:117-118`): narrow the relay menu — an o-prime relays a status-stale seat its `pij report now "<did>" "<next>"` (or `ready` if idle-available, or issuer-set `hold` when the o-prime is parking it). REMOVE `waiting|blocked|question` from the relay menu: those are the seat's OWN first-person claims about its OWN dependencies — an issuer can't know them and prompting them manufactures the permanent-silencer parked state (same defect as item-14 ADV-4, one layer up). | pij-skill | `skills/pij/references/prime/orient-oprime.md` | menu reads now/ready/hold only; a one-line why | budget-flat; skill-text |
| [ ] | T004 (INFO-7) | `00-routing.md` C9: fix the "blocked/waiting per node doctrine" citation — either point at `state.ts:145` (where waiting's external sense lives) or drop "per node doctrine" (node.md doesn't carry the split). One-word/one-clause edit. | pij-skill | `skills/pij/references/00-routing.md` | citation resolves or is dropped; budget-flat (205 lines) | skill-text; keep C9 otherwise identical |
| [ ] | T005 | gates: `just pij-skill-check` 0 ✗ (before/after diff = zero new findings), `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts` green, `just typecheck`; pathspec commit; `reports/item-18-report.md` with the E6 RED→GREEN evidence (stale doc RED, fixed doc GREEN) | pij-skill / pij-control-plane | `reports/item-18-report.md` | all gates recorded; E6 mutation evidence present | one PR |

### Cold-review Dim-0 (the reviewer MUST run)
- **MUT-E6 (headline)**: revert `pij-watchdog.md` to omit the `ready` clause ⇒ T001 RED. Proves the ratchet now pins the DOC against the CODE, not against itself — the E6 class is closed. Record sha + RED line.
- **MUT-MUTE**: change the doc's mute set (e.g. drop `hold`) ⇒ if T002 adds a set-assertion, it goes RED (optional but preferred).
- Semantic review: confirm the doc's recovery axis now matches `buildWatchdogTurn` verbatim-in-substance; confirm ADV-5's narrowed menu doesn't drop the legitimate `hold`; confirm INFO-7's citation resolves.

### Open
- If pinning the WHOLE emitter output is too brittle (it interpolates id/ordinal), pin the STABLE substrings (`report state done`, `report state ready`, the `now` call) — the point is that `ready` can never silently vanish from the doc again, not a byte-lock on the full turn.
- INFO-8 (node.md:64 permissive) and INFO-9 ("Only genuine conditions mute" normative) from the item-14 re-review are NOTE-only — mention in the report, no edit unless the reviewer escalates.
