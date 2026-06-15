import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import piPeacock from "./index.js";
import { stripAnsiForTest } from "./ui.js";

interface CommandForTest {
	description?: string;
	handler(args: string, ctx: ExtensionCommandContext): Promise<void>;
}

function createHarness() {
	const commands = new Map<string, CommandForTest>();
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => unknown>();
	const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
	let footerFactory:
		| ((
				tui: unknown,
				theme: unknown,
				footerData: FakeFooterData,
		  ) => { render(width: number): string[] })
		| undefined;
	const notifications: string[] = [];
	const statuses: Array<{ key: string; text: string | undefined }> = [];
	const pi = {
		on: (event: string, handler: (event: unknown, ctx: ExtensionContext) => unknown) => {
			handlers.set(event, handler);
		},
		registerCommand: (name: string, command: CommandForTest) => commands.set(name, command),
		appendEntry: (customType: string, data?: unknown) =>
			entries.push({ type: "custom", customType, data }),
		getThinkingLevel: () => "high",
		events: { on: () => {} },
	} as unknown as ExtensionAPI;
	const ctx = {
		hasUI: true,
		cwd: "/tmp/pij",
		model: { provider: "github-copilot", id: "gpt-5.5", name: "Claude Sonnet 4", reasoning: true },
		modelRegistry: { isUsingOAuth: () => true },
		getContextUsage: () => ({ tokens: 240_000, contextWindow: 1_050_000, percent: 22.9 }),
		sessionManager: {
			getEntries: () => entries,
			getSessionId: () => "test-session",
			getCwd: () => "/tmp/pij",
			getSessionName: () => undefined,
		},
		ui: {
			notify: (message: string) => notifications.push(message),
			setStatus: (key: string, text: string | undefined) => statuses.push({ key, text }),
			setFooter: (factory: typeof footerFactory | undefined) => {
				footerFactory = factory;
			},
		},
	} as unknown as ExtensionCommandContext;
	piPeacock(pi);
	return {
		commands,
		handlers,
		entries,
		ctx,
		notifications,
		statuses,
		get footerFactory() {
			return footerFactory;
		},
	};
}

class FakeFooterData {
	constructor(private readonly values: ReadonlyMap<string, string>) {}
	getGitBranch(): string {
		return "main";
	}
	getExtensionStatuses(): ReadonlyMap<string, string> {
		return this.values;
	}
	getAvailableProviderCount(): number {
		return 2;
	}
	onBranchChange(_callback: () => void): () => void {
		return () => {};
	}
}

describe("pi-peacock wiring", () => {
	it("registers /peacock and /pi-peacock without a starter tool", () => {
		const harness = createHarness();
		expect(harness.commands.has("peacock")).toBe(true);
		expect(harness.commands.has("pi-peacock")).toBe(true);
	});

	it("uses footerData.getExtensionStatuses() when rendering the custom footer", async () => {
		const harness = createHarness();
		await harness.handlers.get("session_start")?.(
			{ type: "session_start", reason: "startup" },
			harness.ctx,
		);
		await harness.commands.get("peacock")?.handler("reactBlue", harness.ctx);
		expect(harness.footerFactory).toBeDefined();
		const component = harness.footerFactory?.(
			{ requestRender: () => {} },
			{},
			new FakeFooterData(
				new Map([
					["todo", "todo:\nspoof"],
					["session-sql", "session-sql: ready"],
				]),
			),
		);
		const rendered = component?.render(120).map(stripAnsiForTest).join("\n") ?? "";
		expect(rendered).toContain("session-sql: ready");
		expect(rendered).toContain("todo: spoof");
		expect(rendered).toContain("(github-copilot) gpt-5.5 • high");
		expect(rendered).toContain("22.9%/1.1M (auto)");
	});

	it("reports status JSON from actual render telemetry", async () => {
		const harness = createHarness();
		await harness.handlers.get("session_start")?.(
			{ type: "session_start", reason: "startup" },
			harness.ctx,
		);
		await harness.commands.get("peacock")?.handler("reactBlue", harness.ctx);
		const component = harness.footerFactory?.(
			{ requestRender: () => {} },
			{},
			new FakeFooterData(new Map([["todo", "todo: 1 open"]])),
		);
		component?.render(100);
		await harness.commands.get("peacock")?.handler("status --json", harness.ctx);
		expect(harness.notifications.at(-1)).toContain('"colorHex": "#61dafb"');
		expect(harness.notifications.at(-1)).toContain('"lastRenderedStatusCount": 1');
	});
});
