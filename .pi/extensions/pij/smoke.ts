// Smoke scenario for pij. Runs via `npm run smoke -- pij`.
//
// Steps drive pi through the Driver SDK's current discriminated-union Step
// shape. Keep smoke deterministic: prefer slash commands over model tool
// selection.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "pij",
	steps: [
		{
			kind: "type",
			text: "/pij",
			press: "Enter",
			// pinned wired status line: `pij: <id> · role=<role> · peers <n> · events <m>`
			expect: /pij: pij-\d+ · role=\S+ · peers \d+ · events \d+/,
			expectTimeoutMs: 5000,
		},
	],
};

export default scenario;
