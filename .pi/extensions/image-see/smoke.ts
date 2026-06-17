// Smoke scenario for image-see. Runs via `npm run smoke -- image-see`.
//
// image-see is tool-only (`see_image`) and the tool shells a child pi on a
// vision model — model-dependent and network-bound, so it's NOT deterministic
// in smoke. The deterministic smoke only verifies the extension boots cleanly;
// the pure argv/validation logic is covered by Vitest (store.test.ts) and the
// live child-pi path is exercised by hand (see docs/how/image-see.md).

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "image-see",
	steps: [],
};

export default scenario;
