# FX-02 — item 31 (dlg-0029) — cold review FIX_REQUIRED (M-1) — base 98cce88

Verdict `review-01.md`: all four ACs implemented and sensored (16 mutations, 14 RED); ONE major open.

## M-1 (major) — `watchdog-manager.ts:662` `reportSustainedLiveness` window changed out of scope, undisclosed, unsensored
You replaced `Math.min(cfg.intervalMs, STALE_AFTER_MS)` with the new `staleAfterMsFor` seam, so the "sustained liveness" window (the path that CLEARS a pinned `failure: stalled`) grew from 60 s to the seat's interval (×20 at the 20-min default). T006 authorised the seam for the LEGACY DETECTOR only ("no change to the watchdog fire path"); execution.log.md does not mention it; reverting it leaves the full suite green (the only guard, `:1485`, uses `intervalMs: 100`, where old and new are arithmetically identical).
**Ruling (plan owner): REVERT — option (a).** AC-29 is about when the daemon SETS stalled; the path that CLEARS it must keep demanding fresh evidence (≤ 60 s). Restore `:662` to exactly `Math.min(cfg.intervalMs, STALE_AFTER_MS)`.
**Plus the sensor the reviewer showed was missing**: a test with `intervalMs` well ABOVE 60 s (use the 20-min default) where the newest event is, e.g., 5 min old → the pinned `stalled` is NOT cleared by sustained liveness; mutate the window to `staleAfterMsFor` (or to `intervalMs`) → RED. Record RED→GREEN in execution.log.md and disclose the near-miss there.

## F-2 (low) — pin the `subjectId` choice
Correct that the death-sweep summary keeps naming the dead seats (not `pij-daemon`) after `from` moved to the sensor — but nothing pins it (D7 survivor). Add the assertion: N dead seats → summary names the seats; mutate `subjectId` to the sensor id → RED.

## F-3 (low) — restore what was deleted
AC-04's selectivity anchor and the s097 assertion-discipline comment were removed in the test rewrite. Put both back (the comment verbatim from base; the anchor as an assertion in the sibling case).

## F-4 (low) — record the reversal
The pij#161 docblock documented "deliver unknown to the watcher" as a rejected alternative; AC-28 reverses that. Rewrite the docblock to say the reversal happened here (item 31, AC-28) and why (attention cost; log is the compensating record), rather than silently editing history.

## Not required (info, measured by the reviewer): F-5/F-6 the extra `statSync` at `daemon.ts:1073` is ≤ 0.75 % of a tick — leave it.

Gates: full vitest via `pij bg` → `docs/plans/391-day3-core/logs/vitest-phase13-fx02.log`; tsc; biome on changed files. One commit on the branch (do not rewrite 98cce88); report per schema via `--body-file` with: SHA, the M-1 sensor RED evidence at the mutated window, the F-2 RED evidence, and confirmation that `:662` is byte-identical to base.
