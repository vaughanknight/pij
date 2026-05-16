import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MinihWorkbenchStore } from "./store.js";

export default function (pi: ExtensionAPI) {
	const store = new MinihWorkbenchStore((customType, data) => pi.appendEntry(customType, data));

	function refreshStatus(ctx: ExtensionContext): void {
		const n = store.count();
		ctx.ui.setStatus("minih-workbench", n === 0 ? undefined : `minih-workbench: ${n}`);
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, ctx) => {
		store.rehydrate(ctx.sessionManager.getEntries());
		refreshStatus(ctx);
	});

	pi.registerCommand("minih-workbench", {
		description: "TODO: describe minih-workbench",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			// TODO: implement /minih-workbench
			ctx.ui.notify(`minih-workbench: not implemented (got: ${args})`, "info");
		},
	});

	// Optional starter tool — delete or expand.
	pi.registerTool({
		name: "minih-workbench_ping",
		label: "MinihWorkbench ping",
		description: "TODO: describe what minih-workbench_ping does",
		parameters: Type.Object({
			message: Type.String({ description: "Message to echo" }),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			return {
				content: [{ type: "text", text: `pong: ${params.message}` }],
				details: {},
			};
		},
	});
}
