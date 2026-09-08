# Follow-up u2: the prompt-path resend must never clear a human draft (Jordan ruling 2026-09-08)

From: pij-minor-unicorn (prime). Reply ONLY via pij_send to pij-minor-unicorn, one line + path.

Ruling: "the channel that is not tmux can just send with no regard for the human input, as long as it doesn't clear what the human is typing when it does it." Delivery must stay immediate (no typing hold). The ONLY constraint is draft preservation.

## Defect (prime probe 14:42, fresh omp 18.1.14 seat pij-steep-apollo, main c18e1623)
Composer held `HUMAN DRAFT IN PROGRESS do not clobber me` (typed via send-keys, no Enter). Sleep+Escape loss → `[pij resend 1]` fired via `pi.sendUserMessage` → composer was EMPTY afterwards. The 2026-09-06 fix (51e034a6) chose omp's custom-message API precisely because omp's user-message path clears the editor; the resend path (pi-runtime.ts:56-61) reintroduced the clobber.

## Do (worktree: create your own from origin/main; branch fix/resend-preserve-draft)
1. Find omp's clearing point for a user-role prompt in interactive mode (upstream packages/coding-agent/src/modes/interactive-mode* / input controller — `setText("")` on user message start) and document it in the report with file:line.
2. Preserve the draft around a resend: read `ctx.ui.getEditorText()` before `sendUserMessage`; if non-empty, restore it with `ctx.ui.setEditorText(saved)` at the moment omp clears it (after the `message_start` of the resend's own pijMessageId, or the next tick if that is where the clear lands — prove which with a test). Cursor position best-effort. Never submit the draft; never delay the resend because a draft exists.
3. If omp offers a user-message variant that does not touch the editor (check `sendUserMessage` options and any `attribution`/`source` flags in extensibility/extensions/types.ts), prefer it and say why.
4. Tests RED first (fake pi with editor state: draft present + resend → draft identical after; resend still consumed once). Live proof: repeat my probe exactly (send-keys draft, sleep+Escape loss, resend) and capture the composer line before/after; draft byte-identical.
5. Gates: npm test, skill check, cargo unaffected (say so). One commit, C11 trailers, report appended to docs/plans/archive/misc/omp-redeliver-2026-09-08/report-u2.md. `git diff` before `git add`. No push/PR/merge.
