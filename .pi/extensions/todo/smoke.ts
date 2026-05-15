// Smoke scenario for todo. Runs via `npm run smoke -- todo`.
//
// Steps drive pi through the Driver SDK's current discriminated-union Step
// shape. Keep smoke deterministic: prefer slash commands over model tool
// selection.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "todo",
	steps: [
		{
			kind: "type",
			text: "/todo",
			press: "Enter",
			expect: /not implemented/,
			expectTimeoutMs: 5000,
		},
		// TODO: add real steps once /todo is implemented.
	],
};

export default scenario;
