# s109 — pi/omp seats must not walk the ready route into identity commands
**Prime**: pij-dominant-vicuna · 2026-08-29 · branch s109/ready-pi-guard off origin/main
**Jordan's ask (verbatim intent)**: pi/OMP clients firing up seem to run the pij ready skill,
which they don't need — suspected double-registration. Investigation found: no live doubles
(adopt refuses pi with E-ARG; inbox register dedupes via 'existing'), so this is a
WASTE+CONFUSION bug, not corruption. Fix the affordances so it cannot even confuse.

## Deliverables (all in this branch, PR at the end — PR AUTHORIZED by Jordan, MERGE IS NOT)
1. skills/pij/references/routes/ready.md — make step 1's first line blunt and terminal for
   pi/omp: "You are a pi/omp seat: the extension registered you at boot. Reply `Ready.` and
   STOP — run NO pij identity command (no adopt, no inbox register)." Keep the existing
   claude/copilot/codex flow untouched. Note 2dbde5b0 already dropped pi from the adopt list;
   this makes the stop explicit rather than implied.
2. Audit skills/pij/ for OTHER lines that could route a pi/omp seat into adopt/register
   (00-routing.md C1, SKILL.md aliases table). Fix with the same one-line bluntness; list
   every file touched in the PR body.
3. CLI affordance: the E-ARG for `pij adopt --harness pi` should TEACH, not just refuse —
   message: "pi/omp seats self-register at boot; you are already reachable — run `pij whoami`
   to confirm, never adopt". Find the validation site in .pi/extensions/pij (grep adopt +
   harness validation), change the message ONLY (no behavior change), add/adjust the test
   that pins the message. Same for `pij inbox register` when the caller already has an
   in-process identity IF such detection already exists — do NOT build new detection.
4. Gate: repo's standard checks green (npm test for the touched packages / harness checks if
   runnable); every changed test justified in the PR body.
5. PR: title "fix(skill+cli): pi/omp seats never adopt or re-register — teach at the refusal".
   Body: problem, evidence pointers (feran E-ARG 2026-08-28, lynx relay; register 'existing'
   dedupe at core/inbox.ts:293-299), files touched, what was NOT done (no new detection, no
   registration behavior change). Base main. DO NOT MERGE.

## Fence
skills/pij/** and .pi/extensions/pij/** (message + its test only) and this plan folder.
Nothing else. FORBIDDEN: the-flow files, .harness/government/**, any registration/dedupe
BEHAVIOR change (message-only), any other repo.

## Rules
Ack with a numbered plan to pij-dominant-vicuna BEFORE code (pij send, C10). Absolute paths.
BEGIN nothing outside the fence. Report at start and done edges (pij report now).
