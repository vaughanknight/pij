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
			expect: /not implemented/,
			expectTimeoutMs: 5000,
		},
		// TODO: add real steps once /file-watch-notify is implemented.
	],
};

export default scenario;
