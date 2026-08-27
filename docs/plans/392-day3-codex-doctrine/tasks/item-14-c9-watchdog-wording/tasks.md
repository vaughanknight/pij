# Item 14: C9 watchdog-mute wording — `done` does not silence the watchdog

**Fence**: `skills/pij/references/00-routing.md` (C9) + `skills/pij/references/prime/orient-oprime.md` (duty 7, if budget). **Gate** (skill-text PR): `just pij-skill-check` 0 ✗ + `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts` green + cold semantic review. BUDGET-FLAT (00-routing.md ≤250 lines — tighten, don't add net lines).

## Problem (verified)
C9's "If a nudge re-invokes you" list offers `pij report state done` as a response, and the nudge text says "If done, run `pij report state done`" — implying `done` quiets the watchdog. It does NOT: `core/watchdog.ts:332 mutesWatchdogNudge` mutes ONLY `blocked|question|hold|waiting`; `done`/`ready` never mute (by design — `done` is a claim a verifier must confirm). A seat that reports `done` and stops still gets nudged; a seat standing by with no open work should park `hold`/`waiting` (which mute), not `done`.

## Fix (o-prime wording, budget-flat)
Amend C9 (weave into the existing "If a nudge re-invokes you" paragraph — tighten adjacent prose to stay net-flat): add the sense of — "`done` is a claim for a verifier and does not mute; a seat standing by with no open work parks with `hold`/`waiting`; reach for `interval`, never `pause`." Do NOT change the nudge quote itself (it's a faithful render of the daemon's actual injected text — verify against `core/` before touching; if the daemon text really says "If done…", leave the quote, add the clarification below it).
Mirror ONE line in `orient-oprime.md` duty 7 IF budget allows (state the call in the report).

## Tasks
| Status | ID | Task | Done When |
|--------|-----|------|-----------|
| [ ] | 1 | Amend C9 in 00-routing.md (budget-flat); verify `core/watchdog.ts mutesWatchdogNudge` really excludes done/ready before wording it; mirror orient-oprime duty 7 if budget | 00-routing.md ≤250; the mute distinction is stated |
| [ ] | 2 | Gates (`just pij-skill-check` 0 ✗; cli.integration + acceptance-sweep green) + pathspec commit + `reports/item-14-report.md` | gates recorded; net line delta stated |
