import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { RalphLoopStore } from "./store.js";

export default function (pi: ExtensionAPI) {
	const store = new RalphLoopStore(
		(customType, data) => pi.appendEntry(customType, data),
	);

	function refreshStatus(ctx: ExtensionContext): void {
		const n = store.count();
		ctx.ui.setStatus("ralph-loop", n === 0 ? undefined : `ralph-loop: ${n}`);
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, ctx) => {
		store.rehydrate(ctx.sessionManager.getEntries());
		refreshStatus(ctx);
	});

	pi.registerCommand("ralph-loop", {
		description: "TODO: describe ralph-loop",
		handler: async (
			args: string,
			ctx: ExtensionCommandContext,
		): Promise<void> => {
			// TODO: implement /ralph-loop
			ctx.ui.notify(`ralph-loop: not implemented (got: ${args})`, "info");
		},
	});

	// Optional starter tool — delete or expand.
	pi.registerTool({
		name: "ralph-loop_ping",
		label: "RalphLoop ping",
		description: "TODO: describe what ralph-loop_ping does",
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
