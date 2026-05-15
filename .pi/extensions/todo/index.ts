import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { todoHelpText } from "./store.js";

export default function (pi: ExtensionAPI) {
	pi.registerCommand("todo", {
		description: "Manage SQL-backed current-session todos",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			const trimmed = args.trim();
			ctx.ui.notify(trimmed.length === 0 ? todoHelpText() : `todo: not wired yet (${trimmed})`, "info");
		},
	});

	pi.registerTool({
		name: "todo_ping",
		label: "Todo ping",
		description: "Temporary todo extension wiring check",
		parameters: Type.Object({
			message: Type.String({ description: "Message to echo" }),
		}),
		async execute(_id, params) {
			return {
				content: [{ type: "text", text: `pong: ${params.message}` }],
				details: {},
			};
		},
	});
}
