// Smoke scenario for scratch — uses the typed Driver SDK Scenario/Step
// shape from harness/driver. Validates:
//   - D-006: setStatus(key, undefined) clears the pill (verified BEFORE
//     any /scratch add — when count=0 on fresh boot, the footer must
//     NOT show a `scratch:` pill)
//   - D-005: do customType entries survive /compact?
//
// Per plan 004 T008 (rewrite) + T009 (D-006 fix) + Workshop 001
// § Sample scenario. Send strings avoid shell-special metacharacters
// because TC-01/D-014 are now closed at the SDK layer (argv-array
// execFileSync) — but plain hyphenated bodies stay grep-friendly.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "scratch",
	bootReadyTimeoutMs: 30_000,
	steps: [
		// D-006 check (fresh-boot count=0): the rendered pane must NOT
		// contain the `scratch:` status pill. Negative lookahead anchored
		// at start of string with [\s\S] for dotall semantics.
		{ kind: "capture", name: "post-boot" },
		{
			kind: "type",
			text: "/scratch list",
			press: "Enter",
			expect: /^(?![\s\S]*\bscratch:)/,
			expectTimeoutMs: 5_000,
		},
		// Now add two notes with grep-friendly bodies.
		{
			kind: "type",
			text: "/scratch add scratch-smoke-alpha",
			press: "Enter",
			expect: /saved \[#1\]/,
			expectTimeoutMs: 5_000,
		},
		{
			kind: "type",
			text: "/scratch add scratch-smoke-bravo",
			press: "Enter",
			expect: /saved \[#2\]/,
			expectTimeoutMs: 5_000,
		},
		// Verify both visible pre-compact (also confirms the status pill
		// now DOES render `scratch: 2 notes` — implicit positive case
		// for the D-006 contract).
		{
			kind: "type",
			text: "/scratch list",
			press: "Enter",
			expect: /scratch-smoke-alpha[\s\S]*scratch-smoke-bravo/,
			expectTimeoutMs: 5_000,
		},
		// Force compaction.
		{ kind: "type", text: "/compact", press: "Enter" },
		// PR-09: /compact can run 10–60s; the wait step polls until
		// output-stable + prompt-visible + no spinner. Cap at 60s.
		{ kind: "wait", timeoutMs: 60_000 },
		// D-005: both notes must still be listable after /compact.
		// Positive lookahead asserts both bodies appear in the rendered
		// pane in any order.
		{
			kind: "type",
			text: "/scratch list",
			press: "Enter",
			expect: /(?=[\s\S]*scratch-smoke-alpha)(?=[\s\S]*scratch-smoke-bravo)/,
			expectTimeoutMs: 10_000,
		},
		// Capture post-compact pane for inspection.
		{ kind: "capture", name: "post-compact" },
	],
};

export default scenario;
