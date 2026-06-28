// Smoke scenario for pi-peacock. Runs via `npm run smoke -- pi-peacock`.
// Keep smoke deterministic: prefer slash commands over model tool selection.

import type { Scenario } from "../../../harness/driver/index.js";

// Proves peacock RENDERS the status line, without pinning the machine's pi
// config: the cwd + git branch, a context-usage segment (`<pct>%/<ctx> (auto)`),
// and a provider/model/effort segment (`(<provider>) <model> • <effort>`) — all
// three are peacock's doing and hold regardless of which model/provider the user
// has configured. (Previously pinned `(github-copilot) gpt-5.5 • medium`, `1.1M`,
// and a `session-sql: ready` footer segment — all environment-specific: they
// drift when the user switches model/provider or pi changes the footer segments,
// turning an env change into a false smoke failure. session-sql has its own smoke.)
const stableFooterRe =
	/~\/pi-hacking\/pij \(main\)[\s\S]*\d[\d.]*%\/\S+ \(auto\)[\s\S]*\([\w-]+\) \S+ • \w+/;

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
