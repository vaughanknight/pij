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
	phase1NoWriteResult,
} from "./store.js";
import { formatInventoryText } from "./ui.js";

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
  /minih status --json
  /minih status <slug> <runId> --json
  /minih report <slug> <runId> --json

Tools: minih_runs_list, minih_run_status, minih_read_report
Phase 1 is read-only: no send, stop, composer, push, launch, or install.`;
}

export default function (pi: ExtensionAPI) {
	function clearStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus(MINIH_STATUS_KEY, undefined);
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
			if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
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
