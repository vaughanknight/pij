import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, MAX_NOTE_BYTES, ScratchStore } from "./store.js";

// Accept `--tag foo bar baz`  → tag=foo, text="bar baz"
// Or just plain text          → tag=undefined, text="bar baz"
function parseAddArgs(rest: string): { tag?: string; text: string } {
	const m = /^--tag\s+(\S+)\s+(.*)$/s.exec(rest);
	return m ? { tag: m[1], text: m[2] ?? "" } : { text: rest };
}

async function handleScratchCommand(
	args: string,
	ctx: ExtensionCommandContext,
	store: ScratchStore,
	refreshStatus: (ctx: ExtensionContext) => void,
): Promise<void> {
	const trimmed = args.trim();
	const spaceIdx = trimmed.indexOf(" ");
	const sub = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
	const rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

	switch (sub) {
		case "":
		case "list":
			ctx.ui.notify(store.format(), "info");
			return;

		case "add": {
			if (!rest) {
				ctx.ui.notify("usage: /scratch add [--tag <t>] <text>", "error");
				return;
			}
			const { tag, text } = parseAddArgs(rest);
			if (!text) {
				ctx.ui.notify("text is required", "error");
				return;
			}
			const result = store.add(text, tag);
			if (!result.ok) {
				ctx.ui.notify(`rejected: ${result.reason} (max ${MAX_NOTE_BYTES} chars)`, "error");
				return;
			}
			refreshStatus(ctx);
			// pi's notify level enum is info | warning | error (no "success");
			// workshop 003 used "success" but real pi API rejects it. See D-018.
			ctx.ui.notify(`saved [#${store.count()}]`, "info");
			return;
		}

		case "del": {
			const n = parseInt(rest, 10);
			if (Number.isNaN(n)) {
				ctx.ui.notify(`usage: /scratch del <1..${store.count() || 0}>`, "error");
				return;
			}
			const result = store.deleteAt(n);
			if (!result.ok) {
				ctx.ui.notify(`usage: /scratch del <1..${store.count() || 0}>`, "error");
				return;
			}
			refreshStatus(ctx);
			ctx.ui.notify(`deleted note #${n}`, "info");
			return;
		}

		case "clear": {
			if (store.count() === 0) {
				ctx.ui.notify("scratch is already empty", "info");
				return;
			}
			const ok = await ctx.ui.confirm("Clear scratchpad?", `Wipe ${store.count()} notes?`);
			if (!ok) {
				ctx.ui.notify("cancelled", "info");
				return;
			}
			const cleared = store.clear();
			refreshStatus(ctx);
			ctx.ui.notify(`cleared ${cleared} notes`, "info");
			return;
		}

		default:
			ctx.ui.notify(`unknown: /scratch ${sub}. try: list, add, del, clear`, "error");
	}
}

export default function (pi: ExtensionAPI) {
	const store = new ScratchStore((customType, data) => pi.appendEntry(customType, data));

	function refreshStatus(ctx: ExtensionContext): void {
		const n = store.count();
		ctx.ui.setStatus("scratch", n === 0 ? "" : `scratch: ${n} note${n === 1 ? "" : "s"}`);
	}

	// Pattern P10: one handler for session_start, all reasons
	// (startup, /reload, /new, /resume, /fork). D-011 trap: use
	// getEntries() (method) — NOT .entries (property). Workshop 003's
	// reference impl had .entries; that bug was caught and encoded.
	pi.on("session_start", async (event, ctx) => {
		store.rehydrate(ctx.sessionManager.getEntries());
		refreshStatus(ctx);
		if (event.reason === "reload" && store.count() > 0) {
			const n = store.count();
			ctx.ui.notify(`scratch: restored ${n} note${n === 1 ? "" : "s"}`, "info");
		}
	});

	pi.registerCommand("scratch", {
		description: "Session scratchpad. Usage: /scratch [list|add|del|clear]",
		handler: async (args, ctx) => handleScratchCommand(args, ctx, store, refreshStatus),
	});

	pi.registerTool({
		name: "scratch_save",
		label: "Scratch save",
		description:
			"Save a short note to the session scratchpad. Use to remember things across this conversation that don't need to surface to the user yet.",
		parameters: Type.Object({
			content: Type.String({
				description: `What to remember (≤${MAX_NOTE_BYTES} chars)`,
			}),
			tag: Type.Optional(
				Type.String({
					description: "Optional one-word tag (e.g. 'todo', 'bug', 'context')",
				}),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const result = store.add(params.content, params.tag);
			if (!result.ok) {
				return {
					content: [{ type: "text", text: `rejected: ${result.reason}` }],
					details: { error: result.reason },
				};
			}
			refreshStatus(ctx);
			return {
				content: [{ type: "text", text: `Saved note ${result.note.id}` }],
				details: {
					id: result.note.id,
					tag: result.note.tag,
					count: store.count(),
				},
			};
		},
	});

	pi.registerTool({
		name: "scratch_list",
		label: "Scratch list",
		description: "List notes in the session scratchpad. Optional tag filter.",
		parameters: Type.Object({
			tag: Type.Optional(Type.String({ description: "Filter to this tag only" })),
			limit: Type.Optional(
				Type.Number({
					description: `Max notes to return (1–${MAX_LIST_LIMIT}, default ${DEFAULT_LIST_LIMIT})`,
				}),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const text = store.format({ tag: params.tag, limit: params.limit });
			const total = params.tag
				? store.list({ tag: params.tag, limit: MAX_LIST_LIMIT }).length
				: store.count();
			return { content: [{ type: "text", text }], details: { total } };
		},
	});
}
