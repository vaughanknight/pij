// Smoke scenario for minih-workbench Phase 1. Runs via
// `npm run smoke -- minih-workbench`.
//
// Keep smoke deterministic: this uses the built-in fixture root through
// `/minih status --json` rather than model tool selection or live Minih runs.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "minih-workbench",
	steps: [
		{
			kind: "type",
			text: "/minih status --json",
			press: "Enter",
			expect: /"ok": true[\s\S]*code-review-companion[\s\S]*run-active/,
			expectTimeoutMs: 5000,
		},
	],
};

export default scenario;
