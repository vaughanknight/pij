import assert from "node:assert/strict";
import test from "node:test";
import { resolveNativeHost } from "./store.mjs";

const processes = new Map([
	[300, { pid: 300, ppid: 200, command: "/runtime/extension-loader", proc_start: 20260905120002 }],
	[
		200,
		{ pid: 200, ppid: 100, command: "/Users/test/.local/bin/copilot", proc_start: 20260905120001 },
	],
	[100, { pid: 100, ppid: 1, command: "/bin/zsh", proc_start: 20260905120000 }],
]);
const inspectProcess = async (pid) => processes.get(pid);

test("host is verified Copilot ancestor, not extension loader or pane shell", async () => {
	assert.deepEqual(
		await resolveNativeHost({ parentPid: 300, inspectProcess, pane: "%137", paneProcess: 100 }),
		{ pid: 200, proc_start: 20260905120001, pane: "%137" },
	);
});

test("paneless native host remains truthful without inventing a pane", async () => {
	assert.deepEqual(await resolveNativeHost({ parentPid: 300, inspectProcess }), {
		pid: 200,
		proc_start: 20260905120001,
	});
});

test("a pane not in actual ancestry refuses instead of hiding pane metadata", async () => {
	await assert.rejects(
		resolveNativeHost({ parentPid: 300, inspectProcess, pane: "%other", paneProcess: 100 }),
		/pane/i,
	);
	await assert.rejects(
		resolveNativeHost({ parentPid: 300, inspectProcess, pane: "%138", paneProcess: 999 }),
		/exact pane/i,
	);
});

test("absence of native ancestor is explicit unsupported identity", async () => {
	await assert.rejects(
		resolveNativeHost({ parentPid: 100, inspectProcess }),
		/Copilot host ancestor/i,
	);
});

test("PID reuse during observation refuses stale host incarnation", async () => {
	let hostReads = 0;
	await assert.rejects(
		resolveNativeHost({
			parentPid: 300,
			inspectProcess: async (pid) => {
				const row = processes.get(pid);
				return pid === 200 && ++hostReads > 1 ? { ...row, proc_start: row.proc_start + 1 } : row;
			},
		}),
		/incarnation changed/i,
	);
});
