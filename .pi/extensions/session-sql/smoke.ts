import type { Scenario } from "../../../harness/driver/index.js";

const smokeTitle = `session sql smoke ${Date.now()}`;

const scenario: Scenario = {
	name: "session-sql",
	bootReadyTimeoutMs: 30_000,
	steps: [
		{
			kind: "type",
			text: "/sql status",
			press: "Enter",
			expect: /session-sql: ready/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: `/sql INSERT INTO todos(title) VALUES ('${smokeTitle}')`,
			press: "Enter",
			expect: /sql: ok/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: `/sql SELECT title FROM todos WHERE title = '${smokeTitle}'`,
			press: "Enter",
			expect: new RegExp(smokeTitle),
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: "/reload",
			press: "Enter",
			expect: /reload|Reload/i,
			expectTimeoutMs: 15_000,
		},
		{
			kind: "type",
			text: `/sql SELECT title FROM todos WHERE title = '${smokeTitle}'`,
			press: "Enter",
			expect: new RegExp(smokeTitle),
			expectTimeoutMs: 10_000,
		},
		{ kind: "capture", name: "final" },
	],
};

export default scenario;
