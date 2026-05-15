import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, type Component, type KeyId } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import { defaultRootDir, locationForSession, SessionSqlStore } from "../session-sql/store.js";
import {
	DEFAULT_TODO_KEYBINDINGS,
	formatTodoRow,
	parseTodoCommand,
	TODO_LIST_VIEWS,
	TODO_STATUSES,
	TodoSqlStore,
	todoHelpText,
	type ParsedTodoCommand,
	type TodoListView,
	type TodoStatus,
	type TodoStoreResult,
	type TodoViewRow,
} from "./store.js";

const STATUS_KEY = "todo";
const TODO_ACTIONS = ["list", "add", "done", "status", "block", "next", "dep", "clear"] as const;
type TodoToolAction = (typeof TODO_ACTIONS)[number];

interface TodoToolDetails {
	action: string;
	ok: boolean;
	message: string;
	code?: string;
	todos?: TodoViewRow[];
	changed?: TodoViewRow;
	counts?: unknown;
	dependency?: unknown;
}

type TodoActionResult<T> = TodoStoreResult<T> | { ok: false; code: string; message: string };

function localError<T>(code: string, message: string): TodoActionResult<T> {
	return { ok: false, code, message };
}

function isTodoToolAction(value: string): value is TodoToolAction {
	return TODO_ACTIONS.includes(value as TodoToolAction);
}

function isTodoListView(value: string): value is TodoListView {
	return TODO_LIST_VIEWS.includes(value as TodoListView);
}

function isTodoStatus(value: string): value is TodoStatus {
	return TODO_STATUSES.includes(value as TodoStatus);
}

function requiredId(id: number | undefined): TodoActionResult<number> {
	if (id === undefined || !Number.isSafeInteger(id) || id <= 0) {
		return localError("TODO_BAD_ID", "todo error: id must be a positive integer");
	}
	return { ok: true, value: id, message: "" };
}

function parseToolView(view: string | undefined): TodoActionResult<TodoListView | undefined> {
	if (view === undefined) return { ok: true, value: undefined, message: "" };
	if (!isTodoListView(view)) return localError("TODO_BAD_VIEW", `todo error: unknown view ${view}`);
	return { ok: true, value: view, message: "" };
}

function parseToolStatus(status: string | undefined): TodoActionResult<TodoStatus> {
	if (status === undefined || !isTodoStatus(status)) {
		return localError("TODO_BAD_STATUS", `todo error: unknown status ${status ?? ""}`.trimEnd());
	}
	return { ok: true, value: status, message: "" };
}

function isTodoViewRow(value: unknown): value is TodoViewRow {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { id?: unknown }).id === "number" &&
		typeof (value as { title?: unknown }).title === "string" &&
		typeof (value as { status?: unknown }).status === "string" &&
		typeof (value as { priority?: unknown }).priority === "number"
	);
}

function detailsFromResult<T>(action: string, result: TodoActionResult<T>): TodoToolDetails {
	if (!result.ok) return { action, ok: false, message: result.message, code: result.code };
	const details: TodoToolDetails = { action, ok: true, message: result.message };
	if (Array.isArray(result.value)) details.todos = result.value.filter(isTodoViewRow);
	else if (typeof result.value === "object" && result.value !== null) {
		if ("todos" in result.value && Array.isArray(result.value.todos)) {
			details.todos = result.value.todos.filter(isTodoViewRow);
		} else if ("open" in result.value || "total" in result.value) {
			details.counts = result.value;
		} else if ("dependsOn" in result.value) {
			details.dependency = result.value;
		} else if (isTodoViewRow(result.value)) {
			details.changed = result.value;
		}
	}
	return details;
}

function matchesAny(data: string, keys: readonly string[]): boolean {
	return keys.some((key) => matchesKey(data, key as KeyId));
}

class TodoOverlay implements Component {
	private rows: TodoViewRow[] = [];
	private selectedIndex = 0;
	private statusLine: string | undefined;

	constructor(
		private readonly loadRows: () => TodoStoreResult<TodoViewRow[]>,
		private readonly markDone: (id: number) => TodoStoreResult<TodoViewRow>,
		private readonly requestRender: () => void,
		private readonly refreshStatus: () => void,
		private readonly done: (result: "closed") => void,
	) {
		this.refreshRows();
	}

	render(width: number): string[] {
		const safeWidth = Math.max(24, width);
		const lines = [`todo: ${this.rows.length} open`];
		if (this.rows.length === 0) {
			lines.push("todo: no open todos", "Tip: /todo add <title>");
		} else {
			for (const [index, row] of this.rows.entries()) {
				const prefix = index === this.selectedIndex ? "› " : "  ";
				lines.push(`${prefix}${formatTodoRow(row)}`);
			}
		}
		if (this.statusLine) lines.push(this.statusLine);
		lines.push(this.helpText());
		return lines.map((line) => truncateToWidth(line, safeWidth));
	}

	handleInput(data: string): void {
		if (matchesAny(data, DEFAULT_TODO_KEYBINDINGS.closeOverlay)) {
			this.done("closed");
			return;
		}
		if (matchesAny(data, DEFAULT_TODO_KEYBINDINGS.refresh)) {
			this.statusLine = "todo: refreshed";
			this.refreshRows();
			this.requestRender();
			return;
		}
		if (matchesAny(data, DEFAULT_TODO_KEYBINDINGS.selectPrevious)) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.requestRender();
			return;
		}
		if (matchesAny(data, DEFAULT_TODO_KEYBINDINGS.selectNext)) {
			this.selectedIndex = Math.min(Math.max(0, this.rows.length - 1), this.selectedIndex + 1);
			this.requestRender();
			return;
		}
		if (matchesAny(data, DEFAULT_TODO_KEYBINDINGS.markDone)) {
			const selected = this.rows[this.selectedIndex];
			if (!selected) return;
			const result = this.markDone(selected.id);
			this.statusLine = result.message;
			this.refreshRows();
			this.refreshStatus();
			this.requestRender();
		}
	}

	invalidate(): void {
		this.refreshRows();
	}

	private refreshRows(): void {
		const result = this.loadRows();
		if (!result.ok) {
			this.rows = [];
			this.statusLine = result.message;
			this.selectedIndex = 0;
			return;
		}
		this.rows = result.value;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.rows.length - 1));
	}

	private helpText(): string {
		return [
			`${DEFAULT_TODO_KEYBINDINGS.selectPrevious.join("/")}/${DEFAULT_TODO_KEYBINDINGS.selectNext.join("/")} select`,
			`${DEFAULT_TODO_KEYBINDINGS.markDone.join("/")} done`,
			`${DEFAULT_TODO_KEYBINDINGS.refresh.join("/")} refresh`,
			`${DEFAULT_TODO_KEYBINDINGS.closeOverlay.join("/")} close`,
		].join(" • ");
	}
}

export default function (pi: ExtensionAPI) {
	const sqlStore = new SessionSqlStore();
	const todoStore = new TodoSqlStore(sqlStore);

	function openForCurrentSession(ctx: ExtensionContext): void {
		const sessionId = ctx.sessionManager.getSessionId();
		const result = sqlStore.open(locationForSession(sessionId, defaultRootDir()));
		if (!result.ok) ctx.ui.notify(`todo: failed to open DB: ${result.message}`, "error");
	}

	function ensureOpen(ctx: ExtensionContext): void {
		if (!sqlStore.status().open) openForCurrentSession(ctx);
	}

	function refreshStatus(ctx: ExtensionContext): void {
		const counts = todoStore.counts();
		if (!counts.ok) {
			ctx.ui.setStatus(STATUS_KEY, "todo: error");
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, counts.value.open === 0 ? undefined : `todo: ${counts.value.open} open`);
	}

	function notifyResult<T>(ctx: ExtensionCommandContext, result: TodoStoreResult<T>): void {
		ctx.ui.notify(result.message, result.ok ? "info" : "error");
		refreshStatus(ctx);
	}

	async function openTodoOverlay(ctx: ExtensionContext): Promise<void> {
		ensureOpen(ctx);
		await ctx.ui.custom<"closed">(
			(tui, _theme, _keybindings, done) =>
				new TodoOverlay(
					() => todoStore.list(),
					(id) => todoStore.done(id),
					() => tui.requestRender(),
					() => refreshStatus(ctx),
					done,
				),
			{
				overlay: true,
				overlayOptions: {
					width: "70%",
					minWidth: 40,
					maxHeight: "80%",
					anchor: "center",
					margin: 2,
				},
			},
		);
		refreshStatus(ctx);
	}

	async function runParsedCommand(
		parsed: ParsedTodoCommand,
		ctx: ExtensionCommandContext,
	): Promise<void> {
		switch (parsed.action) {
			case "help":
				ctx.ui.notify(todoHelpText(), "info");
				refreshStatus(ctx);
				return;
			case "list":
				notifyResult(ctx, todoStore.list({ view: parsed.view, limit: parsed.limit }));
				return;
			case "add":
				notifyResult(ctx, todoStore.add({ title: parsed.title }));
				return;
			case "done":
				notifyResult(ctx, todoStore.done(parsed.id));
				return;
			case "status":
				notifyResult(
					ctx,
					todoStore.setStatus({ id: parsed.id, status: parsed.status, reason: parsed.reason }),
				);
				return;
			case "block":
				notifyResult(ctx, todoStore.block(parsed.id, parsed.reason));
				return;
			case "dep":
				notifyResult(ctx, todoStore.addDependency({ id: parsed.id, dependsOn: parsed.dependsOn }));
				return;
			case "next":
				notifyResult(ctx, todoStore.next({ limit: parsed.limit }));
				return;
			case "overlay":
				await openTodoOverlay(ctx);
				return;
			case "clear": {
				const confirmed = await ctx.ui.confirm(
					"Clear all current-session todos?",
					"This deletes rows from todos and todo_deps for this session.",
				);
				if (!confirmed) {
					ctx.ui.notify("todo: clear cancelled", "info");
					refreshStatus(ctx);
					return;
				}
				notifyResult(ctx, todoStore.clear());
				return;
			}
		}
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, ctx) => {
		openForCurrentSession(ctx);
		refreshStatus(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		const result = sqlStore.close();
		if (!result.ok) ctx.ui.notify(`todo: failed to close DB: ${result.message}`, "warning");
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.registerCommand("todo", {
		description: "Manage SQL-backed current-session todos",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			ensureOpen(ctx);
			const parsed = parseTodoCommand(args);
			if (!parsed.ok) {
				ctx.ui.notify(parsed.message, "error");
				refreshStatus(ctx);
				return;
			}
			await runParsedCommand(parsed.value, ctx);
		},
	});

	const [openOverlayShortcut] = DEFAULT_TODO_KEYBINDINGS.openOverlay;
	if (openOverlayShortcut) {
		pi.registerShortcut(openOverlayShortcut as KeyId, {
			description: "Open SQL-backed todo overlay",
			handler: async (ctx: ExtensionContext): Promise<void> => {
				await openTodoOverlay(ctx);
			},
		});
	}

	pi.registerTool({
		name: "todo",
		label: "Todo",
		description:
			"Manage the current pi session's SQL-backed todo list. Use this for routine task tracking; use sql only for custom queries or repair.",
		promptSnippet:
			"todo: manage the current session's SQL-backed todo list with add/list/status/done/dep/next actions.",
		promptGuidelines: [
			"Use todo for multi-step work, dependencies, and progress that the human should be able to inspect.",
			"Use action=list or action=next before choosing the next item when a todo plan already exists.",
			"Use sql only when you need custom inspection/repair beyond the routine todo actions.",
			"Do not call action=clear unless the human explicitly requested destructive cleanup and confirm=true is set.",
		],
		parameters: Type.Object({
			action: Type.String({
				description: "Action: list, add, done, status, block, next, dep, or clear.",
			}),
			view: Type.Optional(Type.String({ description: "List view: open, all, done, or blocked." })),
			title: Type.Optional(Type.String({ description: "Todo title for action=add." })),
			description: Type.Optional(Type.String({ description: "Optional description for action=add." })),
			priority: Type.Optional(Type.Number({ description: "Optional integer priority; higher sorts first." })),
			id: Type.Optional(Type.Number({ description: "Todo id for done/status/block/dep." })),
			status: Type.Optional(
				Type.String({ description: "Canonical status: pending, in_progress, blocked, or done." }),
			),
			reason: Type.Optional(Type.String({ description: "Optional reason for status/block." })),
			dependsOn: Type.Optional(Type.Number({ description: "Prerequisite todo id for action=dep." })),
			limit: Type.Optional(Type.Number({ description: "Maximum rows for list/next." })),
			confirm: Type.Optional(Type.Boolean({ description: "Must be true for action=clear." })),
		}),
		executionMode: "sequential",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			ensureOpen(ctx);
			const actionText = params.action.trim();
			if (!isTodoToolAction(actionText)) {
				const result = localError("TODO_BAD_ACTION", `todo error: unknown action ${actionText}`);
				return { content: [{ type: "text", text: result.message }], details: detailsFromResult(actionText, result) };
			}

			const action = actionText;
			let result: TodoActionResult<unknown>;
			switch (action) {
				case "list": {
					const view = parseToolView(params.view);
					result = view.ok ? todoStore.list({ view: view.value, limit: params.limit }) : view;
					break;
				}
				case "add":
					result = todoStore.add({
						title: params.title ?? "",
						description: params.description,
						priority: params.priority,
					});
					break;
				case "done": {
					const id = requiredId(params.id);
					result = id.ok ? todoStore.done(id.value) : id;
					break;
				}
				case "status": {
					const id = requiredId(params.id);
					const status = parseToolStatus(params.status);
					result = id.ok && status.ok
						? todoStore.setStatus({ id: id.value, status: status.value, reason: params.reason })
						: !id.ok
							? id
							: status;
					break;
				}
				case "block": {
					const id = requiredId(params.id);
					result = id.ok ? todoStore.block(id.value, params.reason) : id;
					break;
				}
				case "next":
					result = todoStore.next({ limit: params.limit });
					break;
				case "dep": {
					const id = requiredId(params.id);
					const dependsOn = requiredId(params.dependsOn);
					result = id.ok && dependsOn.ok
						? todoStore.addDependency({ id: id.value, dependsOn: dependsOn.value })
						: !id.ok
							? id
							: dependsOn;
					break;
				}
				case "clear":
					result = params.confirm === true
						? todoStore.clear()
						: localError("TODO_CLEAR_CONFIRM", "todo error: clear requires confirmation");
					break;
			}

			refreshStatus(ctx);
			return {
				content: [{ type: "text", text: result.message }],
				details: detailsFromResult(action, result),
			};
		},
	});
}
