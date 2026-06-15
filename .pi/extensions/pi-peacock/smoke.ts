// Smoke scenario for pi-peacock. Runs via `npm run smoke -- pi-peacock`.
// Keep smoke deterministic: prefer slash commands over model tool selection.

import type { Scenario } from "../../../harness/driver/index.js";

const stableFooterRe =
	/~\/pi-hacking\/pij \(main\)[\s\S]*\$0\.000 \(sub\) 0\.0%\/1\.1M \(auto\)[\s\S]*\(github-copilot\) gpt-5\.5 • medium[\s\S]*session-sql: ready/;

const scenario: Scenario = {
	name: "pi-peacock",
	bootReadyTimeoutMs: 30_000,
	steps: [
		{ kind: "press", key: "C-u" },
		{
			kind: "type",
			text: "/peacock status",
			press: "Enter",
			expect: stableFooterRe,
			expectTimeoutMs: 5000,
		},
		{ kind: "sleep", ms: 500 },
		{ kind: "press", key: "C-u" },
		{
			kind: "type",
			text: "/peacock reactBlue",
			press: "Enter",
			expect: stableFooterRe,
			expectTimeoutMs: 5000,
		},
		{ kind: "sleep", ms: 500 },
		{ kind: "press", key: "C-u" },
		{
			kind: "type",
			text: "/reload",
			press: "Enter",
			expect: /reload|Reload/i,
			expectTimeoutMs: 15_000,
		},
		{ kind: "wait", timeoutMs: 15_000 },
		{ kind: "press", key: "C-u" },
		{
			kind: "type",
			text: "/peacock off",
			press: "Enter",
			expect: stableFooterRe,
			expectTimeoutMs: 5000,
		},
		{ kind: "sleep", ms: 500 },
		{ kind: "capture", name: "final" },
	],
};

export default scenario;
