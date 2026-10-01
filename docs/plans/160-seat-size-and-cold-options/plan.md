# Plan 160: show seat size and coldness; priced options on a cold-wake refusal

Author: pij-far-jackal (prime), 2026-10-01. Jordan approved this. Coder: pij-yelling-trout. Uses the sessionStatus already on the seat card (Plan 157). No Unisphere change.

## 1. `pij list` and `pij state` show size and coldness
- **`pij list` (human):** add the columns CTX (e.g. `375k`, or `?` when unknown), IDLE (time since the last API call, e.g. `2h14m`) and CACHE (`warm` / `cold 9m` / `?`). Mark `❄` on a row the guard would refuse right now: over 300k, cold, and not working. Use the same function as the guard; don't restate the rule.
- **`pij state <seat>` (text):** add a line like `context 375k / 1M · last call 14m ago · cache 5m (cold 9m) · 3 compactions`, plus a `❄ cold-wake guard: …` line with the price when it applies.
- **JSON (list and state):** add the derived fields `contextUsed`, `idleMs`, `cacheState`, `coldWake: {wouldRefuse, estimateUsd}` next to the existing sessionStatus.
- **Performance:** list over ~60 seats must stay under ~300 ms warm. Read status per seat with the existing cursor and a bounded per-seat wait; on a timeout, show `?`. Measure it.

## 2. The cold-wake refusal shows priced options
When `pij send` is refused with E-RS-COLD-WAKE, the message lists the sender's options, each with an estimate from the seat's context and model price table:
```
❄ pij-x is cold (600k, idle 3h). Options:
  --fyi                  hold for its next turn          $0 now
  --force --reason "…"   wake on its current model        ~$5.39
```
Price basis: a cold 1-hour write of the context, plus ~5 calls (bolvar's means: ~1,585 written + ~590 out per call). Label it an estimate at list price. Leave room in the format for future options (item 3), without showing options that don't exist yet.

## 3. NOT in this plan (pending a blind quality test)
`--consult-on sonnet` and `--compact-on sonnet`. See ~/games/unasphere/scratch/usage-blowout/cold-seat-model-switch.md.

## Proof
- Tests RED first.
- Live: `pij list` on production, showing real ❄ rows and timing; `pij state` on a cold large seat; a real refusal showing the options (it sends nothing).
- Linux CI (no Windows). Merge without --admin, bounce, evidence in docs/plans/160-seat-size-and-cold-options/evidence/.
- Independent review by uther before merge.
