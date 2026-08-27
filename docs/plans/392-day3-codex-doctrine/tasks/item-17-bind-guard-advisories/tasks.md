# Item 17: bind-guard advisories (one follow-up PR)

**Plan**: `../../day3-codex-doctrine-plan.md` (v1.3.0, § Item 17) · **Source review**: `../../reviews/item-10b-review.md` (§3 ADV-2, §4 ADV-3/ADV-4, §5 M5/ADV-1, and the advisory table §"Advisories")
**Base**: origin/main `ed20a68b` (item 10b + 14 already shipped) · **Order (o-prime ruling 2026-08-28)**: ADV-2 → ADV-4 → ADV-3 → ADV-1
**Fence**: `.pi/extensions/pij/core/daemon/loop.ts` (+ `loop.test.ts`), `.pi/extensions/pij/core/daemon/index-state.test.ts`. If ADV-2's log needs a port, `core/daemon/ports.ts` (or wherever `DaemonPorts` lives) is in-fence — additive only. NO schema change, NO government edit.

### Executive Briefing
- **Purpose**: The item-10b bind guard shipped APPROVE with four advisories. Land all four as one PR. Only ADV-2 changes runtime behaviour; ADV-1/3/4 harden tests/sweep. This closes the "the brake is correct but silent, and its guard-tests have gaps" tail of the pane-misbind incident fix.
- **The one behaviour change (ADV-2)**: the planned-bind guard at `loop.ts:392-397` returns a bare `{kind:"waiting"}` whenever `identity?.cause !== "session-id-match"`. That collapses THREE very different states into one silent outcome:
  - `foreign-session-id` (`state.ts:529`) — the pane runs a DIFFERENT live session → a genuine conflict / the incident class → **refuse, and SAY SO** (once-per-seat log).
  - `probe-unavailable` (`state.ts:427`) / `identity-indeterminate` (`state.ts:477,515`) — the observation itself was inconclusive → **transient; keep waiting and retry** (this is correct today, but must not be logged as a refusal / must not spam every tick).
  - copilot `!isCopilotSessionId(planned)` — a malformed PLANNED id (independent of the process) → refuse.
  The daemon.ts:566 comment already says *"Never silent: say it once when it starts."* Make the guard honour it.

### Precise anchors (verified on origin/main ed20a68b — re-verify with `git grep -n` before editing; loop.ts shifts easily)
- Bind guard: `.pi/extensions/pij/core/daemon/loop.ts` — the block
  ```
  const processSnapshot = ports.processSnapshot?.();
  const identity = processSnapshot === undefined ? undefined : resolveAgentLiveness(descriptor, processSnapshot);
  if ((harness === "copilot" && !isCopilotSessionId(planned)) || identity?.cause !== "session-id-match") {
      return { kind: "waiting" };
  }
  ```
  (was `:388-397` on tip; re-anchor by content, not line.)
- Cause enum: `.pi/extensions/pij/core/state.ts` `resolveAgentLiveness` (`:419`), causes at `:427 probe-unavailable`, `:459 session-id-match`, `:477/:515 identity-indeterminate`, `:483 no-harness-process`, `:503 harness-process-present`, `:529 foreign-session-id`. Type `ActivityCredibilityCause` `:558`.
- "Never silent" comment: `daemon.ts:566`.
- Sweep test: `.pi/extensions/pij/core/daemon/index-state.test.ts:126-176` (the grep-sweep `it`); ADV-4 hard-coded path at `:154-157` (`file.endsWith("/core/discovery.ts")`); the shared resolver it must allow is `core/discovery.ts` `resolveLivePane` (`discovery.ts:128`).
- ADV-1 clause: `loop.ts` `harness === "copilot" && !isCopilotSessionId(planned)` (was `:393`).

### Tasks (order = o-prime ruling)
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 (ADV-2 RED) | add a `loop.test.ts` case: a planned-bind attempt where `resolveAgentLiveness` yields `cause:"foreign-session-id"` ⇒ (a) still `waiting` (no false bind — unchanged) AND (b) a once-per-seat diagnostic is emitted naming the cause; a SECOND case where cause is `probe-unavailable`/`identity-indeterminate` ⇒ `waiting` with NO refusal log (transient, retry). Assert via a spy on the log port / `ports` sink. | pij-control-plane | `.pi/extensions/pij/core/daemon/loop.test.ts` | both fail on current code (no log emitted) | reuse the existing bind-guard fixtures in this file; drive `processSnapshot` to force each cause |
| [ ] | T002 (ADV-2 GREEN) | in the guard, before `return {kind:"waiting"}`, classify: `foreign-session-id` OR copilot-malformed-planned ⇒ log once-per-seat (dedupe key = descriptor id + cause; a `Set`/`Map` on the drive/daemon state so it fires once, not every tick) at a REFUSAL level naming `identity.cause` (or "malformed-planned-copilot-id"); `probe-unavailable`/`identity-indeterminate`/other transient ⇒ stay quiet (or debug-only). Keep the return value `{kind:"waiting"}` unchanged for ALL of them — behaviour of WHAT binds is identical; only observability changes. | pij-control-plane | `.pi/extensions/pij/core/daemon/loop.ts` (+ `ports` if a log sink must be threaded) | T001 GREEN; full `loop.test.ts` green | dedupe is load-bearing — a per-tick log IS the "spam" ADV-2 warns of. If no log port exists, add one additively to `DaemonPorts` and default it to a no-op/console in production wiring |
| [ ] | T003 (ADV-4) | replace `file.endsWith("/core/discovery.ts")` with a separator-normalized compare: `relative(root, file).split(sep).join("/") === "core/discovery.ts"` (import `relative`, `sep` from `node:path`). Add a `path.win32`-style assertion (or a comment-proven note) that the allowlist survives `\\`-joined paths. | pij-control-plane | `.pi/extensions/pij/core/daemon/index-state.test.ts` | sweep still passes on posix AND a win32-joined path does not disarm the allowlist | test-only; no source change |
| [ ] | T004 (ADV-3) | tighten the sweep regex/logic: match BOTH operand orders (`X.paneId === p` and `p === X.paneId`) and the destructured shape (`({paneId}) => paneId === p`); anchor the discovery.ts allowlist to the SPECIFIC resolver line (exact match on the normalized relative path + the known-good line), not a ±4-line window; SKIP matches inside `//`/`/* */` comments (strip or ignore comment lines before matching). Prove with the bypass probes from review §4 (reversed operands + destructuring) planted in a fixture source string ⇒ sweep now FLAGS them. | pij-control-plane | `.pi/extensions/pij/core/daemon/index-state.test.ts` | each planted bypass shape is caught; the legit `discovery.ts` resolver still passes; a comment mentioning `paneId === p` is NOT a false positive | test-only; keep the ±4 removal from re-flagging the real resolver |
| [ ] | T005 (ADV-1) | add a fixture pinning the copilot clause: `plannedHarnessSessionId:"not-a-uuid"`, process snapshot naming that same string, harness copilot ⇒ expect `waiting` (never bound). Prove it pins: deleting `harness === "copilot" && !isCopilotSessionId(planned)` turns this test RED (record the RED→restore→GREEN in the report). | pij-control-plane | `.pi/extensions/pij/core/daemon/loop.test.ts` | test green with the clause, RED without it (mutation-proven) | this is the M5 gap from review §5 (deleting the clause passed all 3989 tests) |
| [ ] | T006 | gates (`npx vitest run .pi/extensions/pij/core/daemon/`, `just typecheck`, `just pij-skill-check` for parity), pathspec commit, `reports/item-17-report.md` with the ADV-2 before/after log behaviour + the 5 mutation records (T001, T005 RED→GREEN; T003/T004 bypass-caught) | pij-control-plane | `.pi/extensions/pij/core/daemon/`, `reports/item-17-report.md` | all daemon tests green; report has mutation evidence for every advisory | one PR |

### Cold-review Dim-0 (mutation gate the reviewer MUST run)
- **MUT-A (ADV-2)**: delete the once-per-seat log call in the guard ⇒ T001 case (b) RED. Proves the log is pinned, not decorative.
- **MUT-B (ADV-2 dedupe)**: change the dedupe key to fire every tick ⇒ a "no-spam" assertion in T001 RED (if the test asserts call-count === 1).
- **MUT-C (ADV-1)**: delete `harness === "copilot" && !isCopilotSessionId(planned)` ⇒ T005 RED (the M5 gap, now closed).
- **MUT-D (ADV-4)**: revert to `file.endsWith("/core/discovery.ts")` ⇒ the win32 assertion in T003 RED.
- **MUT-E (ADV-3)**: revert the regex to single operand order ⇒ the reversed-operand bypass in T004 RED.
- The verdict artifact must record sha + RED line for each. No APPROVE without all five.

### Open
- ADV-2 log sink: confirm whether `DaemonPorts` already carries a logger (grep `ports.log`/`ports.warn`/`console` usage in loop.ts). If yes, reuse it; if no, add additively and default to console in `daemon.ts` wiring — flag in the report which path was taken.
- Dedupe lifetime: once-per-seat means keyed on descriptor id for the daemon process lifetime; a seat that legitimately transitions foreign→match (re-bind after revive) should be allowed to log again if it goes foreign a second time — acceptable to keep it simple (log once ever per id+cause) and note the tradeoff.
