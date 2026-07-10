# FX001 Review

## Verdict

**APPROVE after 1 fix cycle.** The implementation matches the validated dossier after correcting the backspace count for non-BMP Unicode payloads.

## Scope

Reviewed the working-tree diff and relevant unchanged control flow in:

- `.pi/extensions/pij/adapters/daemon-tmux.ts`
- `.pi/extensions/pij/adapters/daemon-tmux.test.ts`
- `docs/fixes/FX001-duplicate-injection-composer-retype.md`
- `docs/fixes/FX001-duplicate-injection-composer-retype.log.md`

## Findings History

1. Initial dossier validation failed on four readiness gaps: no injectable runner/sleeper seam, under-specified capture scripts, ambiguous settle-poll attempt semantics, and an unproven composer-clear key. Revision 2 resolved all four.
2. Revalidation found one retry-count contradiction (`TYPE_CONFIRM_RETRIES` as three retries versus three total attempts). The dossier renamed and fixed the contract as `TYPE_CONFIRM_ATTEMPTS = 3` total calls, then passed validation.
3. Code review found `[...text].length` counted code points while Copilot backspace removes one UTF-16 code unit. Astral characters therefore under-cleared the composer. The fix uses `text.length`, adds a framed emoji regression test (22 backspaces rather than 21), and scopes the spike evidence accurately.

## Verification

- Ran `npm test`: 117 files passed, 4 skipped; 1,584 tests passed, 10 skipped.
- Independently mutation-tested in a temporary repo copy: `TYPE_CONFIRM_POLLS = 1`, removed inner clear, `TYPE_CONFIRM_ATTEMPTS = 4`, and removed outer clear each made the intended regression tests fail.
- Inspected the installed Copilot reducer and confirmed one backspace deletes one UTF-16 code unit; directly reproduced the old 21-versus-22 undercount.
- After the fix, ran the focused adapter suite: 22/22 tests passed.

## Handover Brief

FX001 code and unit proof are approved.
FX001-5, the coordinated live Copilot and Claude regression after daemon restart, remains outstanding.
Do not close the fix until boot onboarding and ordinary sends each arrive exactly once.
