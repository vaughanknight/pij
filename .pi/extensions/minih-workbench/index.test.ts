import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import minihWorkbench from "./index.js";
import {
	MINIH_WORKBENCH_SESSION_CUSTOM_TYPE,
	type SessionPersistenceEntry,
} from "./session-persistence.js";

interface ToolResultForTest {
	content: Array<{ type: "text"; text: string }>;
	details: unknown;
}

interface ToolForTest {
	name: string;
	parameters: unknown;
	execute(
		id: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: ExtensionContext,
	): Promise<ToolResultForTest>;
}

function createHarness() {
	const tools = new Map<string, ToolForTest>();
	const entries: SessionPersistenceEntry[] = [];
	const order: string[] = [];
	const pi = {
		on: () => {},
		registerCommand: () => {},
		registerTool: (tool: ToolForTest) => tools.set(tool.name, tool),
		registerMessageRenderer: () => {},
		sendMessage: () => order.push("sendMessage"),
		appendEntry: (customType: string, data?: unknown) => {
			entries.push({ type: "custom", customType, data });
			if (customType === MINIH_WORKBENCH_SESSION_CUSTOM_TYPE) {
				const op =
					typeof data === "object" && data !== null && "op" in data ? String(data.op) : "unknown";
				order.push(`append:${op}`);
			}
		},
		exec: async () => {
			order.push("exec");
			return {
				stdout: JSON.stringify({ data: { messageId: "m-test" } }),
				stderr: "",
				code: 0,
				killed: false,
			};
		},
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: false,
		cwd: "/tmp",
		sessionManager: { getEntries: () => entries },
		ui: { notify: () => {}, setStatus: () => {} },
	} as unknown as ExtensionContext;
	minihWorkbench(pi);
	return { tools, entries, order, ctx };
}

describe("minih-workbench command/tool wiring", () => {
	it("persists send intent before invoking the Minih writer and outcome after", async () => {
		const originalNow = process.env.PIJ_MINIH_WORKBENCH_NOW_MS;
		process.env.PIJ_MINIH_WORKBENCH_NOW_MS = "1778903700000";
		try {
			const harness = createHarness();
			const tool = harness.tools.get("minih_send_message");
			expect(tool).toBeDefined();
			const result = await tool?.execute(
				"tool-1",
				{ slug: "code-review-companion", runId: "run-active", body: "hello" },
				undefined,
				undefined,
				harness.ctx,
			);
			expect(result?.details).toMatchObject({ ok: true, data: { status: "accepted" } });
			expect(harness.order).toEqual(["append:audit:record", "exec", "append:audit:record"]);
		} finally {
			if (originalNow === undefined) delete process.env.PIJ_MINIH_WORKBENCH_NOW_MS;
			else process.env.PIJ_MINIH_WORKBENCH_NOW_MS = originalNow;
		}
	});

	it("rejects stop tool confirmation mismatches before persistence or writer side effects", async () => {
		const harness = createHarness();
		const tool = harness.tools.get("minih_stop_run");
		expect(JSON.stringify(tool?.parameters)).toContain("confirm");
		const result = await tool?.execute(
			"tool-2",
			{ slug: "code-review-companion", runId: "run-active", confirm: "stop wrong/run" },
			undefined,
			undefined,
			harness.ctx,
		);
		expect(result?.details).toMatchObject({ ok: false, code: "MINIH_WRITE_REJECTED" });
		expect(harness.order).toEqual([]);
	});
});
