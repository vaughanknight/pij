import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { TodoStore } from "./store.js";

export default function (pi: ExtensionAPI) {
	const store = new TodoStore(
		(customType, data) => pi.appendEntry(customType, data),
	);

	function refreshStatus(ctx: ExtensionContext): void {
		const n = store.count();
		ctx.ui.setStatus("todo", n === 0 ? undefined : `todo: ${n}`);
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, ctx) => {
		store.rehydrate(ctx.sessionManager.getEntries());
		refreshStatus(ctx);
	});

	pi.registerCommand("todo", {
		description: "TODO: describe todo",
		handler: async (
			args: string,
			ctx: ExtensionCommandContext,
		): Promise<void> => {
			// TODO: implement /todo
			ctx.ui.notify(`todo: not implemented (got: ${args})`, "info");
		},
	});

	// Optional starter tool — delete or expand.
	pi.registerTool({
		name: "todo_ping",
		label: "Todo ping",
		description: "TODO: describe what todo_ping does",
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
