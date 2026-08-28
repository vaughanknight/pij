# Item 14 execution log — C9 watchdog mute wording

**Delegation**: `dlg-0017`
**Worker**: `pij-remote-falcon`
**Base**: `445f8ee`

## Runtime verification

`core/watchdog.ts:mutesWatchdogNudge` returns true only for `blocked`, `question`,
`hold`, and `waiting`. It explicitly returns false for `ready`, `failed`, `cancelled`,
and `done`; its comment states that terminal claims require verification.

The daemon's current injected close is no longer the older "If done" sentence. It says:

- finished unit -> `pij report state done`;
- idle but available on a standing assignment -> `pij report state ready`.

The C9 quote was updated to that runtime text. The older exact shorthand remains only in
the clarification as an explicitly negated phrase ("not a silencer"), preserving the
integration string pin without restoring the false implication.

## Wording

- `done` is a verifier claim and does not mute.
- `ready` is active/available and does not mute.
- `blocked`/`waiting` require an external dependency;
- `question` requires a human answer;
- `hold` means an issuer parked the seat;
- only those genuine conditions mute nudges; idleness alone never authorizes them;
- use `watchdog interval` for a legitimate cadence, never self-`pause`.

Duty 7 in `orient-oprime.md` mirrors the `done`/`ready` non-muting distinction.

## ADV-4 correction

Verified `watchdog.ts:399-405`, `state.ts:139`, and `anomalies.ts:818`. The first item-14
wording incorrectly told a seat with no open work to self-declare `hold`/`waiting`.
C9 now directs an idle available seat to `ready`, reserves every muting state for its
actual condition, and explicitly forbids using `hold`/`waiting` as an idle silencer.

`orient-oprime.md` did not repeat the false no-work rule, so ADV-4 leaves it unchanged.

## Gates

- `just pij-skill-check`: passed with zero failures.
- `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts`: 116 passed, 1 skipped.
- `00-routing.md`: 205 lines before and after.
- `orient-oprime.md`: 193 lines before and after.
- `harness checks`: local paths, typecheck, package audit, and snapshots passed;
  repository-wide lint, full test, windows compatibility, and smoke failed.
- `just self-check`: stopped at the same out-of-fence repository lint failures.

## Outcome

The wording and mirror are complete. The phase remains `PARTIAL` because the mandatory
repository gate is red on out-of-fence work.