# Item 14: C9 watchdog-mute wording — `done` does not silence the watchdog

**Status**: implementation complete; repository pre-commit blocked outside this item fence.

**Fence**: `skills/pij/references/00-routing.md` (C9) + `skills/pij/references/prime/orient-oprime.md` (duty 7, if budget). **Gate** (skill-text PR): `just pij-skill-check` 0 ✗ + `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts` green + cold semantic review. BUDGET-FLAT (00-routing.md ≤250 lines — tighten, don't add net lines).

## Problem (verified)
C9's "If a nudge re-invokes you" list offers `pij report state done` as a response, and the nudge text says "If done, run `pij report state done`" — implying `done` quiets the watchdog. It does NOT: `core/watchdog.ts:332 mutesWatchdogNudge` mutes ONLY `blocked|question|hold|waiting`; `done`/`ready` never mute (by design — `done` is a claim a verifier must confirm). A seat that reports `done` and stops still gets nudged; a seat standing by with no open work should park `hold`/`waiting` (which mute), not `done`.

## Fix (o-prime wording, budget-flat)
Amend C9 (weave into the existing "If a nudge re-invokes you" paragraph — tighten adjacent prose to stay net-flat): add the sense of — "`done` is a claim for a verifier and does not mute; a seat standing by with no open work parks with `hold`/`waiting`; reach for `interval`, never `pause`." Do NOT change the nudge quote itself (it's a faithful render of the daemon's actual injected text — verify against `core/` before touching; if the daemon text really says "If done…", leave the quote, add the clarification below it).
Mirror ONE line in `orient-oprime.md` duty 7 IF budget allows (state the call in the report).

## Tasks
| Status | ID | Task | Done When |
|--------|-----|------|-----------|
| [x] | 1 | Amend C9 in 00-routing.md (budget-flat); verify `core/watchdog.ts mutesWatchdogNudge` really excludes done/ready before wording it; mirror orient-oprime duty 7 if budget | 00-routing.md ≤250; the mute distinction is stated |
| [ ] | 2 | Gates (`just pij-skill-check` 0 ✗; cli.integration + acceptance-sweep green) + pathspec commit + `reports/item-14-report.md` | item gates are green; repository `harness checks` remains red outside this fence |

## ADV-4 FIX (fold before PR; o-prime ruling) — correct the C9 hold/waiting claim to match code
The landed C9 says "Truly parked with no open work → `hold`/`waiting`" — WRONG per code (cite these before wording):
- `core/watchdog.ts:399-405`: `waiting` is DELIBERATELY NOT offered to an unblocked seat — "parking with no blocker recreates the parked-but-working state, which is a permanent silencer".
- `core/state.ts:139`: `hold` is canonically "parked by an ISSUER" (not self-declared for no-work); `core/anomalies.ts:818` foreign-hold-clear assumes a hold carries an issuer.
- The four that mute (`mutesWatchdogNudge`, watchdog.ts:332) are for GENUINE conditions: `blocked` (external dep), `question` (human answer), `hold` (issuer parked you), `waiting` (external, per node.md's blocked-vs-waiting split). An idle seat available on a standing assignment uses `ready` (stays watched); tune a legitimate cadence with `interval`, never self-`pause`.
FIX: reword the C9 sentence so it does NOT tell an idle-no-work seat to park `hold`/`waiting`. Keep budget-flat. Verify against the three code sites above. Re-run: skill-check 0 ✗ + cli.integration + acceptance-sweep green.
