// Smoke scenario for todo. Runs via `npm run smoke -- todo`.
//
// Keep smoke deterministic: prefer slash commands over model tool selection.

import type { Scenario } from "../../../harness/driver/index.js";

const smokeSeed = Date.now();
const smokeTitle = `Smoke todo ${smokeSeed}`;
const smokeDoneTitle = `Smoke done ${smokeSeed}`;
const smokeDeleteTitle = `Smoke delete ${smokeSeed}`;
const smokeDeleteId = 1_000_000 + (smokeSeed % 1_000_000);
const smokeTitleRe = new RegExp(smokeTitle);
const oneOpenRe = new RegExp(`todo: 1 open[\\s\\S]*${smokeTitle}`);
const widgetInFlightRe = new RegExp(`Todos 0/1 done[\\s\\S]*1 in flight[\\s\\S]*${smokeTitle}`);
const deletedRe = new RegExp(`todo: deleted #${smokeDeleteId}[\\s\\S]*${smokeDeleteTitle}`);

const scenario: Scenario = {
	name: "todo",
	bootReadyTimeoutMs: 30_000,
	steps: [
		{
			kind: "type",
			text: "/sql DELETE FROM todos",
			press: "Enter",
			expect: /sql: ok/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: "/todo",
			press: "Enter",
			expect: /todo: no open todos/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: `/todo add ${smokeTitle}`,
			press: "Enter",
			expect: new RegExp(`todo: added #[0-9]+ pending . ${smokeTitle}`),
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: `/sql UPDATE todos SET status = 'in_progress' WHERE title = '${smokeTitle}'`,
			press: "Enter",
			expect: widgetInFlightRe,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: "/todo list",
			press: "Enter",
			expect: oneOpenRe,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: `/sql SELECT title FROM todos WHERE title = '${smokeTitle}'`,
			press: "Enter",
			expect: smokeTitleRe,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: `/sql INSERT INTO todos(title, status, priority) VALUES ('${smokeDoneTitle}', 'done', 0)`,
			press: "Enter",
			expect: /sql: ok/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: "/todo prune done",
			press: "Enter",
			expect: /todo: pruned 1 done todos/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: `/sql INSERT INTO todos(id, title, status, priority) VALUES (${smokeDeleteId}, '${smokeDeleteTitle}', 'pending', 0)`,
			press: "Enter",
			expect: /sql: ok/,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: `/todo delete ${smokeDeleteId}`,
			press: "Enter",
			expect: deletedRe,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: "/todo list",
			press: "Enter",
			expect: oneOpenRe,
			expectTimeoutMs: 5000,
		},
		{
			kind: "type",
			text: "/todo overlay",
			press: "Enter",
			expect: oneOpenRe,
			expectTimeoutMs: 5000,
		},
		{ kind: "type", text: "q" },
		{ kind: "sleep", ms: 300 },
		{
			kind: "type",
			text: "/reload",
			press: "Enter",
			expect: /reload|Reload/i,
			expectTimeoutMs: 15_000,
		},
		{ kind: "wait", timeoutMs: 15_000 },
		{
			kind: "type",
			text: "/todo list",
			press: "Enter",
			expect: oneOpenRe,
			expectTimeoutMs: 10_000,
		},
		{ kind: "capture", name: "final" },
	],
};

export default scenario;
