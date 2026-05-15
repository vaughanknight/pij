# Workshop: /compact-survival smoke design

**Type**: Storage Design
**Plan**: 008-ralph-loop-extension
**Spec**: [`../ralph-loop-extension-spec.md`](../ralph-loop-extension-spec.md)
**Created**: 2026-05-15
**Status**: Draft

**Value Thesis**: AC-05 is the load-bearing gate of this build. D-005 (whether pi's `customType` entries survive `/compact`) has been open since 2026-05-09 and Ralph Loop is the chosen re-test vehicle. A loosely-defined smoke risks producing inconclusive evidence — pass/fail noise rather than a verdict. This workshop pins the choreography, the assertions, the upstream-escalation template, and the fallback rules so the smoke is decisive.

**Target Proof Level**: Implementation Ready
**Current Proof Level**: Implementation Ready

**Selected Value Axes**:
- **Proof Quality** — the smoke must produce a verdict, not a guess.
- **Safety to Change** — future PRs that touch `customType` durability will be caught by this exact scenario.
- **Knowability** — the difference between "history compressed but recoverable" and "history lost" must be visible.
- **Cross-Domain Coordination** — if D-005 fails, the upstream pi-mono issue must be filed with evidence the maintainers can act on.

**Related Documents**:
- [`001-stop-condition-catalog.md`](001-stop-condition-catalog.md) — `IterationRecord` is the data that must survive.
- [`002-sdk-iteration-lifecycle.md`](002-sdk-iteration-lifecycle.md) — iteration entries are appended via `pi.appendEntry`; that's what `/compact` operates on.
- [`docs/difficulties.md` D-005](../../../difficulties.md) — the open difficulty this smoke resolves.
- [`harness/driver/index.ts`](../../../../harness/driver/index.ts) — Driver SDK primitives the smoke uses.
- [Spec § AC-05](../ralph-loop-extension-spec.md) — the acceptance gate.

**Domain Context**:
- **Primary Domain**: `agentic-loops` — iteration history durability is a core contract.
- **Related Domains**: pi core (`pi-mono`) — the `/compact` semantics live upstream; this smoke is the contract test against that boundary.

---

## Purpose

Define the **exact tmux choreography** that drives a Ralph run through `/compact` and asserts iteration history is preserved. Define what "preserved" means precisely. Define the **upstream-escalation template** to use if the smoke fails. Define the v1 stance: **escalate, do not paper over** (per clarify Q6).

## Fresh Entrant Outcome

A fresh human or agent should be able to use this workshop to reach **Implementation Ready** with no additional context.

They should be able to:

- Author `smoke.ts` § "compact-survival" scenario from the step table.
- Run the smoke locally and interpret pass/fail correctly.
- Distinguish "history survives" (success) from "history compressed but readable via different API" (also success) from "history lost" (failure).
- Open the right pi-mono issue with the right evidence if the smoke fails.

## Key Questions Addressed

- What's the tmux step sequence?
- Which assertions go before `/compact`, which after?
- How do we capture the iteration count in a deterministic way?
- What's the timing budget (when do we give up waiting)?
- What does the test fixture look like? (deterministic plan + mock runner)
- What's "success" vs "the smoke is bugged" vs "pi-mono /compact dropped entries"?
- If it fails, what's the GitHub issue body that pi-mono maintainers can act on?
- Can this become its own reusable driver-SDK helper for any extension that must survive `/compact`?

---

## Value Frame

| Field | Selection | Why It Matters |
|-------|-----------|----------------|
| Target Proof Level | Implementation Ready | The smoke is the verdict; ambiguity here re-opens D-005. |
| Primary Value Axis | Proof Quality | This smoke produces verifiable evidence either way. |
| Supporting Value Axes | Safety to Change, Knowability, Cross-Domain Coordination | Specific assertions; specific escalation; specific scope. |
| Downstream Loop Improved | Testing + Upstream escalation + Future "must-survive-/compact" extensions | One scenario template, one escalation template, one Driver SDK helper. |

## Evidence Ledger

| Evidence | Location | Supports | Status |
|----------|----------|----------|--------|
| Step-by-step choreography | § Choreography | AC-05 | Ready |
| Fixture plan + fake-runner | § Fixture | reproducibility | Ready |
| Assertion matrix | § Assertions | "what counts as pass/fail" | Ready |
| Timing budget | § Timing | flake protection | Ready |
| Failure interpretation table | § Failure modes | "is it me or is it pi-mono?" | Ready |
| Upstream issue template | § Upstream escalation | clarify Q6 | Ready |
| `compactAndAssert(state)` Driver SDK helper sketch | § Reusable helper | harness gift candidate for AC-12 | Draft |

## Decision Space

### What does "history survives" mean?

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Count survives | Post-`/compact`, `ralph_status` reports the same iteration count as pre-`/compact`. | Easiest to assert. | Doesn't catch "count right, content lost". | Required, but **not sufficient**. |
| Count + last-iteration details survive | Post-`/compact`, the last iteration's `taskTitle`, `iteration`, `costUsd` are queryable. | Catches content loss. | Requires a `/ralph last` command or equivalent. | **Selected** — implement `/ralph status --json` to expose this. |
| Full replay still works | After `/compact`, `session_start` (reload-equivalent) reconstructs the in-memory state from entries. | Most rigorous. | Requires triggering a reload mid-smoke. | **Selected** as an additional check (Phase 2 of the smoke). |
| Bit-identical entries | Each `ralph-loop:iteration` entry's payload is byte-identical pre/post. | Most rigorous. | Compaction may legitimately recompress; bit-identity is too strict. | Rejected. Content-equality on the fields we care about is enough. |

### Failure stance

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| Escalate to pi-mono; build does not ship until upstream fix | Hard gate. | Maintains upstream-trust contract; respects AGENTS.md "do not modify pi-mono without approval". | Blocks release indefinitely. | Rejected — too strict; pi-mono cadence is not ours to control. |
| Escalate to pi-mono; build ships with the smoke marked `expected_fail` + the GH issue link | Honest reporting; doesn't block. | Build ships; D-005 stays open with a real upstream issue not just a ledger row. | Need `expected_fail` semantics in the smoke runner. | **Selected**. |
| Paper over with an in-extension shadow log of iterations outside pi's entry stream | "Solve" it locally. | Build "passes" AC-05. | Re-opens D-005 in disguise; violates clarify Q6 ("escalate, do not paper over"). | Rejected. |

### Driver SDK reusability

| Option | Description | Pros | Cons | Decision |
|--------|-------------|------|------|----------|
| One-off scenario in `ralph-loop/smoke.ts` | Bespoke to ralph-loop. | Fast. | Every future "must-survive-/compact" extension reinvents this. | Acceptable for v1. |
| Driver SDK helper `compactAndAssert(state)` | Reusable primitive that any extension's smoke can call. | Encodes the choreography; future extensions just say `await driver.compactAndAssert({ key: "ralph-loop", before: 3 })`. | One more API in `harness/driver/`. | **Selected** — this is the AC-12 harness gift (alongside the minih adoption). |

---

## Choreography

### Fixture setup (before the smoke runs)

```ts
// .pi/extensions/ralph-loop/smoke.ts § fixture

const FIXTURE_DIR = mkdtempSync(join(tmpdir(), "ralph-smoke-"));
const PLAN_PATH = join(FIXTURE_DIR, "PLAN.md");
writeFileSync(PLAN_PATH, [
  "# Compact-survival smoke fixture",
  "",
  "- [ ] Task one",
  "- [ ] Task two",
  "- [ ] Task three",
  "",
].join("\n"));
```

The fixture is a tmp dir with a 3-task plan. The smoke uses a **deterministic fake runner** (per 002's `FakeIterationRunner`) registered through a pi-side override (`PIJ_RALPH_FAKE_RUNNER=1` env var the extension respects in test mode). The fake runner advances tasks deterministically and produces fixed `IterationResult`s — no real LLM calls in the smoke.

> **Why a fake runner**: AC-05 is about **entry durability**, not about whether the SDK works. Decoupling these isolates the failure mode. If the smoke fails, it's pi's `/compact`, not the LLM.

### Steps (using the Driver SDK)

```ts
// .pi/extensions/ralph-loop/smoke.ts § scenario

export default {
  name: "ralph-loop:compact-survival",
  env: { PIJ_RALPH_FAKE_RUNNER: "1" },
  steps: [
    // S1: Open the extension's command surface.
    { send: "/ralph start " + PLAN_PATH, expect: /ralph: iter 1\/10/, delay: 2000 },

    // S2: Wait until 3 iterations have been recorded (fake runner advances on its own).
    { send: "", expect: /ralph: iter 3\/10/, idleTimeoutMs: 15000 },

    // S3: Capture iteration count and last task title via JSON-status command.
    { send: "/ralph status --json", capture: "preCompactStatus", delay: 2000 },

    // S4: Issue /compact.
    { send: "/compact", expect: /Compaction completed|compacted/i, idleTimeoutMs: 30000 },

    // S5: Verify iteration count is unchanged.
    { send: "/ralph status --json", capture: "postCompactStatus", delay: 2000 },

    // S6: Trigger a soft reload (simulates resume/replay path — P10 single handler test).
    { send: "/reload", expect: /reload|reloaded/i, idleTimeoutMs: 10000 },

    // S7: Verify iteration count survives reload too.
    { send: "/ralph status --json", capture: "postReloadStatus", delay: 2000 },

    // S8: Stop the run cleanly.
    { send: "/ralph stop", expect: /stopped/i, idleTimeoutMs: 5000 },
  ],
  assert(captures) {
    const pre = parseJsonStatus(captures.preCompactStatus);
    const postCompact = parseJsonStatus(captures.postCompactStatus);
    const postReload = parseJsonStatus(captures.postReloadStatus);

    // A1: Iteration count survives /compact.
    assertEqual(pre.iterations, postCompact.iterations, "iteration count must survive /compact");

    // A2: Last task title survives /compact.
    assertEqual(pre.lastTaskTitle, postCompact.lastTaskTitle, "last task title must survive /compact");

    // A3: Iteration count survives /reload after /compact.
    assertEqual(pre.iterations, postReload.iterations, "iteration count must survive /reload after /compact");

    // A4: Last task title survives /reload after /compact.
    assertEqual(pre.lastTaskTitle, postReload.lastTaskTitle, "last task title must survive /reload after /compact");
  },
};
```

Where `parseJsonStatus(buf: string)` extracts the JSON block from the pane capture (since `/ralph status --json` prints a JSON envelope). See § Helper utilities below.

---

## Assertions matrix

| ID | Statement | Pass when | Implies |
|----|-----------|-----------|---------|
| A1 | Iteration count survives `/compact`. | `pre.iterations === postCompact.iterations` | Count-level durability. |
| A2 | Last task title survives `/compact`. | `pre.lastTaskTitle === postCompact.lastTaskTitle` | Content-level durability of summary fields. |
| A3 | Iteration count survives `/reload` after `/compact`. | `pre.iterations === postReload.iterations` | Replay path (P10) works post-`/compact`. |
| A4 | Last task title survives `/reload` after `/compact`. | `pre.lastTaskTitle === postReload.lastTaskTitle` | Replay path produces same in-memory state. |

**All four must pass** for AC-05 to be considered met. If any fails, D-005 is unresolved and § Upstream escalation fires.

---

## Timing budget

| Step | Budget | Why |
|------|--------|-----|
| `/ralph start` → `iter 1/10` | 2 s | First iteration with fake runner is fast. |
| 3 iterations recorded (S2) | 15 s | Fake runner produces deterministic results in ~3 s per iter; 15 s leaves margin. |
| `/compact` (S4) | 30 s | Conservative; `/compact` on a small session usually completes in <5 s but can stall on first run after install. |
| `/reload` (S6) | 10 s | Includes pi's extension re-bind cycle. |
| `/ralph stop` (S8) | 5 s | Cancellation should be near-instant. |

**Total wall-clock cap**: 90 s. If the smoke exceeds 120 s, it's the Driver SDK's `bootReadyTimeoutMs` that fails; that's a different bug (see D-014).

Idle-timeout semantics from the Driver SDK (per `harness/driver/index.ts`): the step waits until the pane is "idle" (no new output for ~500 ms) AND the `expect` regex has matched. If neither happens within `idleTimeoutMs`, the step fails with `DriverIdleTimeoutError`.

---

## Failure interpretation

When the smoke fails, classify by which assertion fired and what the captures show.

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| A1 fails: `postCompact.iterations === 0` | `/compact` deleted all custom entries | **D-005 confirmed**. File pi-mono issue (§ template below). |
| A1 fails: `postCompact.iterations === pre.iterations - 1` (off-by-one) | `/compact` dropped the most recent entry only | **D-005 confirmed (partial)**. File issue with the off-by-one detail. |
| A1 passes, A2 fails | Count-only durability; payload content stripped | **D-005 confirmed (content)**. File issue noting count vs content asymmetry. |
| A1 + A2 pass, A3 fails | `/reload` re-rehydration doesn't see the compacted entries | Likely P10 handler bug in OUR extension, not pi-mono. Investigate `session_start` replay first. |
| A4 fails after A1+A2+A3 pass | Inconsistent rehydration state | Our extension bug. Investigate replay order. |
| `/ralph status --json` returns malformed JSON | Our status command bug | Fix the JSON envelope; not a D-005 issue. |
| Smoke times out at S2 | Fake runner not advancing | Our test setup; check `PIJ_RALPH_FAKE_RUNNER=1` propagation. |
| Smoke times out at S4 | `/compact` hung | pi-mono performance issue or environment; capture `tmux capture-pane -p` manually. |
| Smoke times out at S6 | `/reload` hung or extension factory threw | Investigate our extension's `session_start` handler. |

**Decision rule**: only A1, A2 failures attribute to pi-mono. A3, A4 failures + timeouts attribute to our extension unless ruled out. The companion enforces this distinction during review.

---

## Upstream escalation template

If A1 or A2 fail, file this issue against `earendil-works/pi-mono` (or the appropriate pi-mono repo path the maintainers use):

````markdown
# /compact drops customType entries appended via `pi.appendEntry`

**Reproduction**: `npm run smoke -- ralph-loop` in https://github.com/AI-Substrate/pij (commit <SHA>) running scenario `ralph-loop:compact-survival`.

**Expected**: After `/compact`, `customType` entries appended via `pi.appendEntry()` remain queryable via `sessionManager.getEntries()`.

**Actual**: <one of>
- All `ralph-loop:iteration` custom entries were absent after `/compact` (count: 3 → 0).
- The most recent entry was absent after `/compact` (count: 3 → 2).
- Entries were present but their `data` payload was `null`/missing fields.

**Smoke captures** (attached):
- `preCompactStatus.json` — iteration count, last task title before `/compact`.
- `postCompactStatus.json` — same after `/compact`.
- `postReloadStatus.json` — same after `/reload`.
- `tmux-pane-capture.txt` — raw pane content.

**Pi version**: <output of `pi --version`>
**Node version**: <output of `node --version`>
**Platform**: <`uname -a`>

**Context**:
This is the resolution path for an open difficulty in pij (https://github.com/AI-Substrate/pij/blob/main/docs/difficulties.md D-005), tracked since 2026-05-09. Multiple pij extensions plan to depend on custom-entry durability across `/compact`; if entries don't survive, every event-sourced extension (including ours, the upcoming `ralph-loop`) needs to either fall back to a shadow log or block `/compact` while active.

**Suggested investigation**: the compaction routine in `packages/coding-agent/src/core/session-manager.ts` (compaction path); look at how the entry types filter is applied — possibly only `"message"` entries are preserved.

**Acceptance**: pi-mono test asserting `customType` entries persist through `/compact` and are returned by `sessionManager.getEntries()` after rehydration.
````

Filing this issue **AND** marking the smoke `expected_fail` are both required actions when D-005 is confirmed. The build can ship; the difficulty ledger row points at the issue URL; future PRs gate-check the issue's status.

---

## Helper utilities (Driver SDK addition)

Proposed for `harness/driver/index.ts` — also satisfies AC-12 (a durable harness improvement):

```ts
// harness/driver/index.ts § export

export interface CompactAssertOpts {
  /** Status command to run before and after /compact (must emit JSON). */
  statusCommand: string;
  /** Field in the parsed JSON to compare for equality. Default: ["iterations"]. */
  fields?: readonly string[];
  /** Wall-clock to allow /compact to complete. Default: 30_000. */
  compactTimeoutMs?: number;
  /** Whether to also run /reload and re-assert after. Default: true. */
  includeReloadCheck?: boolean;
}

export interface CompactAssertResult {
  ok: boolean;
  pre: Record<string, unknown>;
  postCompact: Record<string, unknown>;
  postReload?: Record<string, unknown>;
  divergences: { field: string; pre: unknown; post: unknown; phase: "compact" | "reload" }[];
}

export async function compactAndAssert(
  session: Session,
  opts: CompactAssertOpts,
): Promise<CompactAssertResult> {
  // Captures status, runs /compact (and optionally /reload), captures status again, diffs.
  // Returns a structured result the calling smoke scenario can assert against.
}
```

ralph-loop's smoke (and any future extension's smoke) becomes a one-liner:

```ts
const r = await compactAndAssert(session, {
  statusCommand: "/ralph status --json",
  fields: ["iterations", "lastTaskTitle"],
});
if (!r.ok) throw new Error(`compact-survival failed: ${JSON.stringify(r.divergences)}`);
```

> This helper is exactly the kind of harness gift AC-12 demands — extracted from this build, reusable for every future event-sourced extension.

---

## Companion engagement

Per the Power-On-Mode protocol (briefed at the start of Plan 008), the companion reviews each commit-boundary. For this workshop's outputs, the review-request triggers are:

| Commit | Companion concern |
|--------|-------------------|
| `harness/driver/index.ts` adds `compactAndAssert` | Helper signature; resource ownership; flake protection; reusability scope |
| `.pi/extensions/ralph-loop/smoke.ts` adds the scenario | Scenario shape matches Driver SDK conventions; assertions match § Assertions matrix; fake-runner env var honored |
| `.pi/extensions/ralph-loop/index.ts` adds `/ralph status --json` | JSON envelope is deterministic; field names match what the smoke parses; no leaked transients |
| Difficulty ledger updated if smoke fails | D-005 status updated to point at the upstream issue URL; no in-extension shadow log added |

Companion explicitly flagged hazard from briefing: "Do NOT let AC-05 get papered over with shadow logs."

---

## Attention Reduction

| Future Loop | Before Workshop | After Workshop |
|-------------|-----------------|----------------|
| Implementation | "Write a smoke that exercises /compact somehow" | Copy the 8-step scenario; implement `/ralph status --json`; implement `FakeIterationRunner`; wire env var |
| Review | "Does the smoke actually prove anything?" | Diff against Assertions matrix; if all 4 pass, AC-05 met. |
| Testing | "What goes wrong if it fails?" | Failure interpretation table; specific action per row |
| Upstream filing | "How do I write the pi-mono issue?" | Copy the template; fill in version + captures |
| Future extensions | "How do I prove my custom entries survive /compact?" | Call `compactAndAssert(session, { ... })` from the Driver SDK |

---

## Validation / Acceptance

This workshop reaches Implementation Ready when:

- [ ] `smoke.ts` § scenario "ralph-loop:compact-survival" matches the choreography step-for-step.
- [ ] `harness/driver/index.ts` exports `compactAndAssert` with the signature in § Helper utilities.
- [ ] `.pi/extensions/ralph-loop/index.ts` implements `/ralph status --json` returning `{ iterations: number, lastTaskTitle: string | null, runActive: boolean, ... }`.
- [ ] `FakeIterationRunner` honors `PIJ_RALPH_FAKE_RUNNER=1` (or equivalent) and produces deterministic 3-iteration sequences.
- [ ] All four assertions (A1–A4) run on every `npm run smoke -- ralph-loop`.
- [ ] If A1 or A2 fails, the upstream issue template lands in the difficulty ledger row for D-005 with a real GitHub URL.
- [ ] `compactAndAssert` has a vitest unit test (mocked tmux) AND a self-test via this smoke.

---

## Open Questions

### Q1: Should the smoke run with a real model in CI, gated by API key?

**RESOLVED**: No. AC-05 is about entry durability, not about whether models work. The fake runner is sufficient; CI gates are tracked separately (D-008).

### Q2: Should we test with > 3 iterations?

**OPEN — defer to Phase 1.D**. 3 iterations is enough to prove the structural case. A long-run smoke (50+ iterations through `/compact`) could surface aggregate behaviors; that's a future "robustness smoke", not v1's correctness smoke.

### Q3: Should we test multiple `/compact` calls in a row?

**OPEN — defer**. Same rationale as Q2. v1 proves single `/compact` survival; multiple-`/compact` smoke is robustness work.

### Q4: Should `/ralph status --json` be the public API or a hidden one?

**RESOLVED**: Public, documented in `docs/how/ralph-loop.md`. JSON output for slash commands is a community-aligned pattern (matches pi's own `--mode json`). Hidden APIs invite drift.

### Q5: If D-005 is confirmed and the upstream fix takes months, what's the v1 behavior?

**RESOLVED**: The smoke ships marked `expected_fail`. The difficulty ledger row for D-005 carries the pi-mono issue URL. Ralph runs in v1 work fine — `/compact` is rare during single-session runs. The README and `docs/how/ralph-loop.md` carry a warning: "Avoid `/compact` mid-run until pi-mono#XXXX lands." This is honest reporting; users decide.
