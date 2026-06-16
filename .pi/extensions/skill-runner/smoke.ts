// Smoke scenario for skill-runner. Runs via `npm run smoke -- skill-runner`.
//
// Drives pi through the Driver SDK. /skills lists loaded skills; in a bare
// scratch session there may be none, so we assert on the command responding
// (either a count or the "no skills" notice) rather than a specific skill.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "skill-runner",
	steps: [
		{
			kind: "type",
			text: "/skills",
			press: "Enter",
			expect: /skill\(s\) loaded|No skills loaded/,
			expectTimeoutMs: 8000,
		},
	],
};

export default scenario;
