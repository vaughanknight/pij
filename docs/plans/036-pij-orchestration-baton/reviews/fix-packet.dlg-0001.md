# Fix packet — dlg-0001 (narrowed: review findings ONLY)
**To**: pij-1vstguw (coder) · **From**: pij-1khprxk · **Basis**: `reviews/review.phase-1.dlg-0001.md` (read it in full — evidence and line refs live there)

Scope is ONLY the five findings below. Same fences, gates, and prohibitions as your original packet (additive-only cli.ts/daemon.ts; no daemon restart; no commits; no government/**).

## F1 (HIGH) — pin bypass on unknown HEAD · `core/orchestration/baton.ts` ~:286
An unreadable/absent HEAD (`currentHead: null`) must NOT silently grant a pinned request. Rule: a pinned request with `currentHead === null` → `E-PIN` ("pin unverifiable — HEAD unavailable; re-run with --repin to acknowledge") unless `--repin`. This stays a firm guide (the `--repin` self-serve override is the sanctioned exit — ruling #7). Add tests for: pinned+null-head refused; pinned+null-head+repin granted (lease records the ack; keep the old pin — there is no new HEAD to re-pin to, record `repinAck: true` or equivalent honest shape).

## F2 (HIGH) — log line must precede durable mutation (P9) · `baton.ts` :412-421,484-495,522-537,620-636
Reorder every verb to append the machine-log line BEFORE the state change it describes (persist-before-mutate). If the log append fails → return `E-STORE` WITHOUT mutating. Extend `adapters/fakes.ts` so the fake store can inject append/write failures; add ordering tests per verb (log-fail ⇒ no lease/queue/definition change; state-write-fail after log is acceptable residue — assert the log line exists so the action is reconstructible).

## F3 (HIGH) — sticky `failureReason` breaks re-arm · `core/daemon/baton-sweep.ts` :24-31
`classifyBatonHolder()` must derive health from CURRENT liveness/state, not the persisted sticky `failureReason` (the daemon keeps "stalled" on recovered descriptors). Fix the classification precedence (alive+idle/working ⇒ healthy regardless of stale failureReason), and fix the recovery test to use a production-shaped descriptor (alive + `failureReason:"stalled"`) proving re-arm → a second transition alerts again (AC-04).

## F4 (HIGH) — close the named coverage gaps (tests only, no behavior changes beyond F1–F3)
1. AC-01: concurrent request+grant race test — two grants racing on one baton: exactly one lease, the loser's request REMAINS QUEUED.
2. AC-06: `show --json` test asserting `requestedAt`/`grantedAt`/delta fields.
3. AC-07: every-verb-logs test — run define/request/grant/return/reclaim through the service against the fake store and assert one log line each (not manually appended).
4. AC-05: CLI queue rendering test — purposes shown, no positional/FIFO implication.
5. AC-09/AC-02: unit test for `CliBatonNoticeSink` classification (delivered/queued/unverified mapping incl. dead target + stale heartbeat), fakes-level is fine — name the production class under test.

## F5 (MEDIUM) — execution log completeness · `docs/plans/036-…/execution.log.md`
Append: explicit changed-file list; non-obvious decisions/trade-offs made during the build (rubric dims 7/10) — including the F1–F3 fix decisions.

## Done-when
`npx vitest run .pi/extensions/pij/` green · `just pij-skill-check` green · `harness checks --quick` green · report to pij-1khprxk: per-finding fix summary + new test names + gate outputs verbatim.
