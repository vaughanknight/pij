# Plan 159: FYI usage rules, warm flush, digest and question warning

Author: pij-far-jackal (prime), 2026-09-30. Jordan approved this. Coder: pij-yelling-trout. Builds on Plan 158 (--fyi) and Plan 157 (the cold-wake guard's warm/cold check). Branch off main AFTER #459 merges.

## 1. Wording: when something is an FYI
Rule, stated identically everywhere, and cited rather than restated where the surface allows:
> Use `--fyi` only when the recipient's next action doesn't depend on it. If they'd be stuck, wrong or waiting without it, it's a normal send. If they'd be fine not reading it until their next turn, it's `--fyi`. If they'd be fine never reading it, don't send it.
> Always normal sends: work done or a phase complete, review verdicts, hand-offs, blockers, questions, decisions needed.
> FYI examples: "merged #452, nothing needed from you"; "heads-up: main moved, rebase when you next touch it"; progress notes nobody is waiting on.

Surfaces:
- OMP/Pi `pij_send` tool description AND the promptGuidelines line (REMOVE the "(status, heads-ups)" example);
- the Copilot `pij_send` tool;
- skills/pij peer route (the FYI paragraph);
- prime protocol rule 3;
- 00-routing C10 (the "Don't send" item);
- `pij send --help` for `--fyi`.
Run pij-skill-check.

## 2. Warm flush at 5
When a seat's pending FYIs reach 5 (a named constant) AND the recipient is WARM (working now, or last API call under the cold threshold, using the Plan 157 guard's check), deliver them as ONE message: "5 FYIs were queued for you:" plus the same numbered block, through the same carrying-enqueue path (claimed in the carrier's transaction, exactly once).
- If the recipient is cold or unknown: keep holding and never flush. The flush must never cause a cold wake.
- Trigger: on the send that makes the count reach 5. Also re-check when a held seat turns warm again (e.g. its next activity), if that's cheap; otherwise the next real turn carries them as today.

## 3. Digest when many pile up
When more than 5 are pending at delivery time (ride-along, hook or flush), the block shows a summary line (count per sender), the newest 3 in full, and "run `pij-rs fyi-claim --seat <you>` … for all". Pin the format in the shared golden. All the FYIs are marked delivered, and the full text stays readable (a claim/read command or the stored rows). Say how in the block.

## 4. Question warning
If an `--fyi` body contains a `?`, still hold it, but the receipt adds: "held (fyi), but this looks like a question; if you need an answer, resend without --fyi". The warning only; never auto-convert or refuse. Do this on the CLI and both tools.

## Proof
- Tests RED first for 2–4.
- Live on real seats:
  - 5 FYIs to a warm seat ⇒ one flush turn;
  - 5 to a cold seat ⇒ no turn;
  - 8 pending ⇒ a digest on the next typed turn;
  - `--fyi "can you check X?"` ⇒ the warning.
- Rules: C12. Linux CI must run the tests (no Windows). Merge without --admin, then pull, `just bounce-rs`, and record the live proof in evidence/.
