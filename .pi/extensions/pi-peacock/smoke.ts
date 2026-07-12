// Smoke scenario for pi-peacock. Runs via `npm run smoke -- pi-peacock`.
// Keep smoke deterministic: prefer slash commands over model tool selection.

import { execFileSync } from "node:child_process";

import type { Scenario } from "../../../harness/driver/index.js";

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectedFooterPath(): string {
	const cwd = process.cwd();
	const home = process.env.HOME ?? process.env.USERPROFILE;
	return home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function currentBranch(): string {
	const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		encoding: "utf8",
		timeout: 2000,
	}).trim();
	return branch === "HEAD" ? "detached" : branch;
}

// Proves peacock RENDERS the actual cwd + branch, a context-usage segment
// (`<pct>%/<ctx> (auto)`), and a provider/model/effort segment
// (`(<provider>) <model> • <effort>`) without pinning a checkout or model.
const stableFooterRe = new RegExp(
	`${escapeRegex(expectedFooterPath())} \\(${escapeRegex(currentBranch())}\\)` +
		"[\\s\\S]*\\d[\\d.]*%\\/\\S+ \\(auto\\)[\\s\\S]*\\([\\w-]+\\) \\S+ • \\w+",
);

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
