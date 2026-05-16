import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { MINIH_COMMAND_NAME, MINIH_STATUS_KEY, WORKBENCH_NAME } from "./store.js";

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
			const suffix = args.trim().length > 0 ? ` (got: ${args.trim()})` : "";
			ctx.ui.notify(`${WORKBENCH_NAME}: adapter wiring lands in Phase 1 T010${suffix}`, "info");
			clearStatus(ctx);
		},
	});
}
