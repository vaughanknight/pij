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
			expect: /not implemented/,
			expectTimeoutMs: 5000,
		},
		// TODO: add real steps once /pij is implemented.
	],
};

export default scenario;
