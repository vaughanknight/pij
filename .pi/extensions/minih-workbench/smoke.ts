// Smoke scenario for minih-workbench. Runs via `npm run smoke -- minih-workbench`.
//
// Steps drive pi through the Driver SDK's current discriminated-union Step
// shape. Keep smoke deterministic: prefer slash commands over model tool
// selection.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "minih-workbench",
	steps: [
		{
			kind: "type",
			text: "/minih-workbench",
			press: "Enter",
			expect: /not implemented/,
			expectTimeoutMs: 5000,
		},
		// TODO: add real steps once /minih-workbench is implemented.
	],
};

export default scenario;
