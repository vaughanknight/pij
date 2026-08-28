# Item 21 review packet — bind-guard advisory tail (cold, CODE)

**Candidate**: `18584414547a5f84371a651832b0d0e5b08565d2` (HEAD of s392 stream; base reconciled to main 3adf0515). Build/verify as CHERRY-PICK onto fresh main (COORD-004).
**Dossier**: `../tasks/item-21-bind-guard-tail/tasks.md`. **Write verdict to** `reviews/item-21-review.md`.
**Files**: loop.ts(+test), index-state.test.ts.

## What this lands
- **ADV-A2**: `reportBindRefusal` now sets `drive.settled = false` — so after refuse→bind→refuse→re-bind the re-bind re-announces the bound notice (main left the spawner on a stale refusal for a bound seat, because buildBoundNotice is gated on !drive.settled which stayed true).
- **ADV-B** (notify-only, no timeout — coder's stated choice): `refusalCause` now also fires for `no-harness-process` and `harness-process-present` (they refused forever silently); `probe-unavailable`/`identity-indeterminate` stay quiet retries.
- **ADV-C**: sweep catches direct/reversed comparisons + inline & aliased destructures (both orders) + a valid pane comparison sharing a line with an unrelated `undefined` check. RESIDUAL documented as a heuristic (split-line + arbitrary alias/dataflow need an AST rule) — NOT claimed "closed".

## Dim-0 mutation gate — MANDATORY, sha-verify RED→restore→GREEN on disk (lines CODER-CLAIMED — verify against file [DL-011])
- **MUT-A2** (claimed loop.test.ts:562): remove the `drive.settled = false` reset ⇒ RED (a re-bind after a refusal no longer re-announces).
- **MUT-B** (claimed loop.test.ts:501): drop `no-harness-process`/`harness-process-present` from refusalCause ⇒ RED (a stuck non-binding seat goes silent again).
- **MUT-C** (claimed index-state.test.ts:270): revert a newly-caught sweep shape (aliased destructure) ⇒ RED.

## Semantic checks (Dim-1)
1. **ADV-A2 composition with item-17's ADV-A**: item 17 clears `bindRefusalCauses` on a successful bind; item 21 resets `settled` on a refusal. Confirm they compose correctly over a refuse→bind→refuse→bind cycle: each refusal reports once (cleared each bind), each re-bind re-announces (settled reset each refusal). Confirm NO unbounded notice spam — a seat oscillating should still be bounded by the once-per-cause dedup on the refusal side, and a re-bind notice is a real event (acceptable).
2. **ADV-A2 safety**: `settled=false` on a FIRST-EVER refusal (before any bind) is a no-op (settled already false) — confirm no regression to the normal single-bind announce path.
3. **ADV-B once-only**: the new causes notify exactly once (via bindRefusalCauses dedup), and are genuinely permanently-non-binding (a `no-harness-process` seat cannot spontaneously start binding without a new identity) — confirm notify-only is honest and doesn't suppress a legitimate later bind.
4. **ADV-C honesty**: the residual comment accurately scopes what the textual sweep CANNOT catch (no over-claim); the real `discovery.ts` resolver still passes; a comment mentioning the pattern is not a false positive.
5. **No collateral** (E17): cherry-pick onto fresh main; `vitest list` + line-diff confirm no test removed/weakened. `gatesClean:false` = pre-existing repo-wide only — confirm none touches the 3 files.

Report verdict + the 3 mutation shas/RED lines + Dim-1 findings to me.
