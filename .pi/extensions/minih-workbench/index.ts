import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
	defaultFixtureRoot,
	listMinihRuns,
	readMinihReport,
	readMinihRunStatus,
} from "./minih-adapter.js";
import {
	isPhase1ForbiddenAction,
	MINIH_COMMAND_NAME,
	MINIH_STATUS_KEY,
	type MinihAdapterResult,
	type MinihInventorySnapshot,
	type MinihRunRef,
	phase1NoWriteResult,
} from "./store.js";
import { formatInventoryText, MinihRunListComponent } from "./ui.js";

interface RootOptions {
	rootDir?: string;
}

function configuredRoot(rootDir?: string): string {
	return rootDir ?? process.env.PIJ_MINIH_WORKBENCH_ROOT ?? defaultFixtureRoot();
}

function envelope<T>(result: MinihAdapterResult<T>) {
	if (result.ok) return { ok: true, data: result.value, diagnostics: result.diagnostics };
	return {
		ok: false,
		code: result.code,
		message: result.message,
		diagnostics: result.diagnostics,
	};
}

function jsonText(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function toolText<T>(result: MinihAdapterResult<T>): string {
	return jsonText(envelope(result));
}

function commandTokens(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

function wantsJson(tokens: readonly string[]): boolean {
	return tokens.includes("--json");
}

function withoutFlags(tokens: readonly string[]): string[] {
	return tokens.filter((token) => !token.startsWith("--"));
}

function helpText(): string {
	return `minih-workbench read-only commands:
  /minih
  /minih list
  /minih status --json
  /minih status <slug> <runId> --json
  /minih report <slug> <runId> --json

Tools: minih_runs_list, minih_run_status, minih_read_report
Phase 2 is read-only: no send, stop, composer, push, launch, or install.`;
}

export default function (pi: ExtensionAPI) {
	function clearStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus(MINIH_STATUS_KEY, undefined);
	}

	async function loadInventory(): Promise<MinihAdapterResult<MinihInventorySnapshot>> {
		return listMinihRuns({ rootDir: configuredRoot() });
	}

	async function openRunList(ctx: ExtensionCommandContext): Promise<void> {
		const initial = await loadInventory();
		if (!initial.ok) {
			ctx.ui.notify(toolText(initial), "error");
			return;
		}
		if (!ctx.hasUI) {
			ctx.ui.notify(formatInventoryText(initial.value), "info");
			return;
		}
		let component: MinihRunListComponent | undefined;
		let closed = false;
		const selected = await ctx.ui.custom<MinihRunRef | "closed">(
			(tui, _theme, _keybindings, done) => {
				const finish = (value: MinihRunRef | "closed"): void => {
					closed = true;
					done(value);
				};
				component = new MinihRunListComponent(initial.value, {
					onOpenRun: (run) => finish(run),
					onClose: () => finish("closed"),
					onRefresh: () => {
						const activeComponent = component;
						if (!activeComponent) return;
						void loadInventory().then((result) => {
							if (closed || activeComponent !== component) return;
							if (result.ok) activeComponent.updateSnapshot(result.value, "minih: refreshed");
							else activeComponent.updateSnapshot(initial.value, `minih: ${result.message}`);
						});
					},
					requestRender: () => tui.requestRender(),
				});
				return component;
			},
			{
				overlay: true,
				overlayOptions: {
					width: "90%",
					minWidth: 60,
					maxHeight: "85%",
					anchor: "center",
					margin: 1,
				},
			},
		);
		closed = true;
		component = undefined;
		if (selected !== "closed") {
			ctx.ui.notify(`minih: selected ${selected.slug}/${selected.runId}; modal lands in T006`, "info");
		}
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, ctx) => {
		clearStatus(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		clearStatus(ctx);
	});

	pi.registerCommand(MINIH_COMMAND_NAME, {
		description: "Inspect Minih runs through the Pi-native Minih Workbench",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			const tokens = commandTokens(args);
			const positional = withoutFlags(tokens);
			const [verb, slug, runId] = positional;
			if (verb && isPhase1ForbiddenAction(verb)) {
				ctx.ui.notify(toolText(phase1NoWriteResult(verb)), "warning");
				return;
			}
			if (!verb || verb === "list") {
				await openRunList(ctx);
				return;
			}
			if (verb === "help" || verb === "--help" || verb === "-h") {
				ctx.ui.notify(helpText(), "info");
				return;
			}
			if (verb === "status" && slug && runId) {
				const result = await readMinihRunStatus({ rootDir: configuredRoot(), slug, runId });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "status" && wantsJson(tokens)) {
				const result = await listMinihRuns({ rootDir: configuredRoot() });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "report" && slug && runId) {
				const result = await readMinihReport({ rootDir: configuredRoot(), slug, runId });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			const result = await listMinihRuns({ rootDir: configuredRoot() });
			ctx.ui.notify(
				result.ok ? formatInventoryText(result.value) : toolText(result),
				result.ok ? "info" : "error",
			);
		},
	});

	pi.registerTool({
		name: "minih_runs_list",
		label: "Minih runs list",
		description:
			"List Minih runs through the read-only Minih Workbench artifact adapter. Returns active/stale runs plus a bounded completed/report-ready section.",
		parameters: Type.Object({
			rootDir: Type.Optional(Type.String({ description: "Fixture or Minih root directory." })),
			activeLimit: Type.Optional(Type.Number({ description: "Maximum active/stale rows." })),
			completedLimit: Type.Optional(
				Type.Number({ description: "Maximum completed/report-ready rows." }),
			),
		}),
		async execute(_id, params: RootOptions & { activeLimit?: number; completedLimit?: number }) {
			const result = await listMinihRuns({
				rootDir: configuredRoot(params.rootDir),
				activeLimit: params.activeLimit,
				completedLimit: params.completedLimit,
			});
			return { content: [{ type: "text", text: toolText(result) }], details: envelope(result) };
		},
	});

	pi.registerTool({
		name: "minih_run_status",
		label: "Minih run status",
		description: "Read one Minih run status/view snapshot through the read-only artifact adapter.",
		parameters: Type.Object({
			slug: Type.String({ description: "Minih agent slug." }),
			runId: Type.String({ description: "Minih run id." }),
			rootDir: Type.Optional(Type.String({ description: "Fixture or Minih root directory." })),
		}),
		async execute(_id, params: RootOptions & { slug: string; runId: string }) {
			const result = await readMinihRunStatus({
				rootDir: configuredRoot(params.rootDir),
				slug: params.slug,
				runId: params.runId,
			});
			return { content: [{ type: "text", text: toolText(result) }], details: envelope(result) };
		},
	});

	pi.registerTool({
		name: "minih_read_report",
		label: "Minih read report",
		description: "Read a bounded Minih output/report.json summary through the read-only adapter.",
		parameters: Type.Object({
			slug: Type.String({ description: "Minih agent slug." }),
			runId: Type.String({ description: "Minih run id." }),
			rootDir: Type.Optional(Type.String({ description: "Fixture or Minih root directory." })),
		}),
		async execute(_id, params: RootOptions & { slug: string; runId: string }) {
			const result = await readMinihReport({
				rootDir: configuredRoot(params.rootDir),
				slug: params.slug,
				runId: params.runId,
			});
			return { content: [{ type: "text", text: toolText(result) }], details: envelope(result) };
		},
	});
}
