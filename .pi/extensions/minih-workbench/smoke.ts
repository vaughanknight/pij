// Smoke scenario for minih-workbench Phase 2. Runs via
// `npm run smoke -- minih-workbench`.
//
// Keep smoke deterministic: this uses the built-in fixture root and slash
// commands rather than model tool selection or live Minih/Copilot runs.

import type { Scenario } from "../../../harness/driver/index.js";

const scenario: Scenario = {
	name: "minih-workbench",
	cols: 140,
	rows: 44,
	steps: [
		{
			kind: "type",
			text: "/minih status --json",
			press: "Enter",
			expect: /"ok": true[\s\S]*code-review-companion[\s\S]*run-active/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: "/minih",
			press: "Enter",
			expect: /MINIH WORKBENCH — RUN LIST[\s\S]*code-review-companion\/run-active/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "press",
			key: "Enter",
			expect: /MINIH WORKBENCH — RUN VIEW[\s\S]*Composer disabled[\s\S]*Focused pane: transcript/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "press",
			key: "Tab",
			expect: /Focused pane: tools/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "press",
			key: "Escape",
		},
		{
			kind: "sleep",
			ms: 300,
		},
		{
			kind: "type",
			text: "/minih report companion-completed run-completed",
			press: "Enter",
			expect: /Focused pane: report[\s\S]*Completed companion review/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "press",
			key: "Escape",
		},
		{
			kind: "sleep",
			ms: 300,
		},
		{
			kind: "type",
			text: "/reload",
			press: "Enter",
			expect: /reload|Loaded|extensions|gpt|claude|gemini/i,
			expectTimeoutMs: 10000,
		},
		{
			kind: "type",
			text: "/minih status --json",
			press: "Enter",
			expect: /"ok": true[\s\S]*"diagnostics"/,
			expectTimeoutMs: 5000,
		},
	],
};

export default scenario;
