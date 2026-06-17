// Smoke scenario for file-watch-notify. Runs via `npm run smoke -- file-watch-notify`.
//
// Steps drive pi through the Driver SDK's current discriminated-union Step
// shape. Keep smoke deterministic: prefer slash commands over model tool
// selection.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "file-watch-notify",
	steps: [
		{
			kind: "type",
			text: "/file-watch-notify",
			press: "Enter",
			// read-only status line: "file-watch: not configured" | "... watching N folder(s)" | "... invalid (...)"
			expect: /file-watch: (not configured|watching \d+ folder|invalid|configured but)/,
			expectTimeoutMs: 5000,
		},
	],
};

export default scenario;
