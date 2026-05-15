// .pi/extensions/ralph-loop/smoke.ts
//
// AC-05 gate — `ralph-loop:compact-survival` smoke. Verifies that
// `customType` entries appended by the ralph-loop extension survive pi's
// `/compact` and `/reload` replay path. See:
//   - docs/plans/008-ralph-loop-extension/workshops/004-compact-survival-smoke.md
//   - docs/difficulties.md D-005
//
// Choreography (workshop 004 § Steps, with T025-runtime adjustments):
//   1. /ralph start <fixture-plan.md>   (env: PIJ_RALPH_FAKE_RUNNER=1)
//      Wait for run-end notify "complete (sigil) at iter 3" (≤ 25s).
//   2. /ralph status --json — pane shows "iterations":3 + lastTaskTitle
//   3. /compact — see § /compact behaviour note below
//   4. /ralph status --json — STILL shows "iterations":3   (A1)
//   5. /reload                                              (P10 single handler)
//   6. /ralph status --json — STILL shows "iterations":3   (A3)
//   7. /ralph stop (no-op since run already ended via sigil)
//
// /compact behaviour discovered during T025 first run:
//   - With FakeIterationRunner the session has NO LLM messages of its own,
//     so pi's /compact emits "Nothing to compact (no messages yet)".
//   - That means customType entries trivially survive /compact in this
//     smoke (compact was a no-op for them). The A1/A2 assertion holds
//     without proving durability under real compaction pressure.
//   - The MEANINGFUL AC-05 evidence here is the post-/reload check (A3/A4):
//     /reload triggers session_start handlers + replay through
//     ctx.sessionManager.getEntries(). Entries replaying correctly
//     exercises P10 end-to-end.
//   - A FUTURE smoke (real-model gated by API key) is needed to drive
//     genuine compact pressure and complete AC-05. Captured in D-005.

import { join } from "node:path";

import type { Scenario } from "../../../harness/driver/index.js";

const PIJ_ROOT = join(import.meta.dirname, "..", "..", "..");
const FIXTURE_PLAN = join(
	PIJ_ROOT,
	".pi",
	"extensions",
	"ralph-loop",
	"fixture-plan.md",
);

// FakeIterationRunner now cycles through plan tasks, so after 3 iterations
// the pane shows "iterations":3 + lastTaskTitle:"Task three".
const STATUS_AFTER_RUN_RE =
	/"iterations"\s*:\s*3[\s\S]*?"lastTaskTitle"\s*:\s*"Task three"/;
export const STATUS_LOOSE_MATCH = /"iterations"\s*:\s*3/;

// Accept either a real compaction completion OR pi's "Nothing to compact"
// no-op (the FakeIterationRunner path).
const COMPACT_RESPONSE_RE =
	/(compaction (complete|done))|(nothing to compact)|(compacted)|(context reduced)/i;

const scenario: Scenario = {
	name: "ralph-loop_compact-survival",
	env: { PIJ_RALPH_FAKE_RUNNER: "1" },
	bootReadyTimeoutMs: 30_000,
	steps: [
		// S1+S2: kick off the run and wait for the terminal sigil notify in one
		// step. session.execute's expect path uses 2000-line scrollback so the
		// notify is matchable even after pi has redrawn its footer several times.
		// FakeIterationRunner completes 3 iterations in ~1s.
		{
			kind: "type",
			text: `/ralph start ${FIXTURE_PLAN}`,
			press: "Enter",
			expect: /complete \(sigil\) at iter 3/,
			expectTimeoutMs: 25_000,
		},

		// S3: pre-compact status. A1/A2 anchors.
		{
			kind: "type",
			text: "/ralph status --json",
			press: "Enter",
			expect: STATUS_AFTER_RUN_RE,
			expectTimeoutMs: 5_000,
		},
		{ kind: "capture", name: "preCompactStatus" },

		// S4: /compact. Accepts no-op "Nothing to compact" under fake runner.
		{
			kind: "type",
			text: "/compact",
			press: "Enter",
			expect: COMPACT_RESPONSE_RE,
			expectTimeoutMs: 60_000,
		},

		// S5: post-compact status. Load-bearing — if customType entries dropped,
		// this regex won't match → smoke fails → D-005 confirmed; T025 then
		// runs the upstream escalation per workshop 004 § Failure interpretation.
		{
			kind: "type",
			text: "/ralph status --json",
			press: "Enter",
			expect: STATUS_AFTER_RUN_RE,
			expectTimeoutMs: 5_000,
		},
		{ kind: "capture", name: "postCompactStatus" },

		// S6: /reload — P10 single-handler replay path test.
		{
			kind: "type",
			text: "/reload",
			press: "Enter",
			expect: /reload|extensions reloaded/i,
			expectTimeoutMs: 15_000,
		},

		// S7: post-reload status. A3/A4 anchors — exercises full replay path.
		// This is the MEANINGFUL AC-05 evidence under FakeIterationRunner.
		{
			kind: "type",
			text: "/ralph status --json",
			press: "Enter",
			expect: STATUS_AFTER_RUN_RE,
			expectTimeoutMs: 5_000,
		},
		{ kind: "capture", name: "postReloadStatus" },

		// S8: cleanup — /ralph stop is a no-op after the run ended via sigil.
		// We type-and-press but do NOT expect a specific notify; pi may clear
		// or scroll out the response by the time we'd assert against it. The
		// load-bearing AC-05 evidence is fully captured in S5/S7 above.
		{
			kind: "type",
			text: "/ralph stop",
			press: "Enter",
		},
		{ kind: "sleep", ms: 500 },
	],
};

export default scenario;
