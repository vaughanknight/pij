# Manual test evidence — fail-loud-model (live pi spawns)

**Run**: 2026-06-28 · **daemon**: fresh restart (new code, pid 27461) · **creator**: pij-5lztp8

Three live cases against real `pi` spawns. Verdict: **spawn-time validation layer works (cases 1+2); daemon-detection layer has a real gap for the quota/provider-failure case (case 3) — the very case that motivated the feature.**

## Case 1 — VALID model `@preset/glm-1m` ✅
- `pij spawn --harness pi --model @preset/glm-1m` → spawned, **NO validation warning** (correct).
- Worker self-registered (pij-15dxwap) with `model: @preset/glm-1m`; `state: done·active`, `failureReason: none`. Clean happy path.
- Note: `boundModel` not populated for pi — pi self-registers and never traverses the daemon bind path where `extractBoundModel` runs (that path is claude/copilot deterministic-bind). For pi the model is known via the self-register ready-ping, not `boundModel`. Minor; AC-05's bound-model capture is effectively daemon-bound-harness-only.

## Case 2 — MISNAMED model `glm-1m-bogus-xyz` ✅ (validation) / no daemon push
- `pij spawn --harness pi --model glm-1m-bogus-xyz` → **`warning: unknown model 'glm-1m-bogus-xyz' — spawn continues; confirm the id is correct`** then spawned anyway. **Warn-don't-block confirmed** (AC-02).
- Empirical: pi **exits at startup** on a clearly-bogus name — the tmux pane closed within seconds and pi never self-registered, so the daemon had nothing to track and pushed nothing. Fail-loud signal for this case = the **spawn-time warning only**.
- Minor gaps: (a) the warning did **not** include a closest-match **suggestion** (plan said "warn + suggest"); (b) research F-07 assumed pi fails at first-inference, but a bogus *name* is rejected at *startup* (more like claude).

## Case 3 — VALID name, OUT OF CREDITS `fugu-ultra` (sakana) ⚠️ GAP
- `pij spawn --harness pi --model fugu-ultra` → **NO warning** (correct — valid name). Worker registered (pij-qn8pxh), footer `fugu-ultra • high`.
- Pane showed the provider failure live: `credits at https://console.sakana.ai/billing?tab=payAsYouGo` + `⠴ Retrying (3/3)…`, then settled showing the credit error.
- **Outcome: NO fail-loud signal.** Descriptor stayed `state: idle, failureReason: none`; **no `quota` death-push to the creator**.
- **Root causes (DL-003, INS-007):**
  1. `pushWholeLifeTransition` only fires on **dead** (pid gone) or **stalled** (working+quiet). A worker that's **idle while sitting on a fatal provider error** is neither → invisible to the push.
  2. Even if its pane were scanned, `QUOTA_RE` (state.ts:75) matches `429|rate_limit|overloaded|quota.exceeded|resource_exhausted` but **not** "credits"/"billing"/"prepaid credit balance exhausted" → would classify `unknown`.

## Net
| Layer | Status |
|---|---|
| Spawn-time validation (warn, don't block) | ✅ works (cases 1, 2) — minus the suggestion string |
| Daemon bad-model gate + push (claude/copilot deterministic bind) | not exercised live (used pi); unit-tested + mutation-proof |
| Daemon detection for **pi self-register + provider failure (quota/credit)** | ❌ **gap** — the motivating case (pij-vigz1i's 429) is not caught |

## Recommended follow-up (next flow-pair cycle)
1. Daemon: scan **registered/bound** sessions' panes for **fatal provider errors** (credit/billing/400/429) regardless of dead/stalled, and push with the classified reason — so an idle-but-broken worker is caught.
2. Broaden `QUOTA_RE` to include `credit|balance|billing|prepaid|payAsYouGo|insufficient`.
3. Add the closest-match suggestion to the spawn-time validation warning.
4. (Optional) capture `boundModel` for the pi self-register path from the ready-ping model.
