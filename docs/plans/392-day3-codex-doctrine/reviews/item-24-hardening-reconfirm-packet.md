# Item-24 fold HARDENING — re-confirm (hunk only, cold)

**Candidate**: `588dd0ee957f71c0f57bc2cf6d12d1a52d12b55c` — item-24 + ADV-1 fold + the hardening. **Cherry-pick the item-24 chain (a27ab58 → 6641943 → 588dd0e) onto FRESH main** (base bab9854+) to verify — the stream worktree is a known frankenstein (cli.integration RED there because cli.ts is behind main; NOT the item's doing — do NOT run the full suite on the stream tree).
**Prior**: item-24 APPROVE (a27ab58) + fold APPROVE (6641943) both stand. This re-confirms the HARDENING (the 2 previously-unsensored E28 guards + ADV-3). **Write to** `reviews/item-24-hardening-reconfirm.md`.

## What this hardens (o-prime E28 fold)
- **T009 (MUT-PREFIXLEN sensor)**: a STABLE-COUNT drift test — partCount EQUAL under both prefixes, prefixLength DIFFERS (7000 chars, 2 parts under both) → redelivery SENDS ALL, every byte preserved. Closes the guard that was fully-green-under-mutation before.
- **T010 (MUT-NOMARK sensor)**: a 3-pass A→B→A marking probe — a partial pass-2 must not contaminate the original partition's marks. Byte-coverage measured.
- **T011 (ADV-3)**: skip-set scoped to `index < currentPartition.partCount` so caption/attachment sendText (shared nextTextPartIndex) can't be suppressed by out-of-body marks.

## Dim-0 (MANDATORY, sha-verify RED→GREEN; lines CODER-CLAIMED — verify)
- **MUT-PREFIXLEN** (claimed bridge.test.ts:1335): compare partCount only (drop prefixLength) ⇒ RED on T009 (84 chars would be lost). The headline — this mutation was FULLY GREEN before the hardening.
- **MUT-NOMARK** (claimed bridge.test.ts:1397): remove the `if (positionalPartsValid)` marking gate ⇒ RED on T010.
- Confirm MUT-DRIFT/IDEMPOTENT/RETRY/LOGID still RED-able (prior guards survive).

## Dim-1
1. T009 truly has STABLE partCount but DIFFERENT prefixLength (so it catches a partCount-only impl that the original drift test could not). Verify the body/prefixes produce equal part counts.
2. T010 measures BYTE coverage across the 3-pass cycle (not just part counts) and proves no mark contamination.
3. T011: caption/attachment text at an index ≥ partCount is NOT skipped even when the body identity matches. Body-part behaviour unchanged.
4. No collateral (E17): cherry-pick onto fresh main; vitest list + line-diff on bridge.test.ts.

Report verdict + the 2 mutation shas/RED lines + Dim-1 to me. Then I run two green full runs on the PR worktree → item-24 PR (base current main; carries the §14 provenance note for #311).
