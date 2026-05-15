// Smoke scenario for ralph-loop. Runs via `npm run smoke -- ralph-loop`.
//
// Steps drive pi through the Driver SDK's current discriminated-union Step
// shape. Keep smoke deterministic: prefer slash commands over model tool
// selection.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "ralph-loop",
	steps: [
		{
			kind: "type",
			text: "/ralph-loop",
			press: "Enter",
			expect: /not implemented/,
			expectTimeoutMs: 5000,
		},
		// TODO: add real steps once /ralph-loop is implemented.
	],
};

export default scenario;
