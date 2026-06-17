import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { FileWatchNotifyStore } from "./store.js";

export default function (pi: ExtensionAPI) {
	const store = new FileWatchNotifyStore(
		(customType, data) => pi.appendEntry(customType, data),
	);

	function refreshStatus(ctx: ExtensionContext): void {
		const n = store.count();
		ctx.ui.setStatus("file-watch-notify", n === 0 ? undefined : `file-watch-notify: ${n}`);
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, ctx) => {
		store.rehydrate(ctx.sessionManager.getEntries());
		refreshStatus(ctx);
	});

	pi.registerCommand("file-watch-notify", {
		description: "TODO: describe file-watch-notify",
		handler: async (
			args: string,
			ctx: ExtensionCommandContext,
		): Promise<void> => {
			// TODO: implement /file-watch-notify
			ctx.ui.notify(`file-watch-notify: not implemented (got: ${args})`, "info");
		},
	});

	// Optional starter tool — delete or expand.
	pi.registerTool({
		name: "file-watch-notify_ping",
		label: "FileWatchNotify ping",
		description: "TODO: describe what file-watch-notify_ping does",
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
