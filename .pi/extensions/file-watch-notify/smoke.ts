// Smoke scenario for file-watch-notify. Runs via `npm run smoke -- file-watch-notify`.
//
// Tool selection is model-dependent, so the deterministic smoke only verifies
// the extension boots cleanly. Runtime behavior is covered by Vitest and live
// peer/file-watch tests.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "file-watch-notify",
	steps: [],
};

export default scenario;
