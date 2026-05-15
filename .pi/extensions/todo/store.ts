// TodoSqlStore — pi-free todo operations over the session SQL work-state.
//
// Imports no pi runtime APIs. All state lives in the canonical session SQL
// `todos` and `todo_deps` tables owned by the session-work-state domain.

import type { SessionSqlStore, SqlResult } from "../session-sql/store.js";

export const TODO_STATUSES = ["pending", "in_progress", "blocked", "done"] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export const TODO_LIST_VIEWS = ["open", "all", "done", "blocked"] as const;
export type TodoListView = (typeof TODO_LIST_VIEWS)[number];

export const DEFAULT_TODO_LIMIT = 50;
export const MAX_TODO_LIMIT = 200;

export const DEFAULT_TODO_KEYBINDINGS = {
	openOverlay: ["ctrl+shift+y"],
	closeOverlay: ["escape", "q"],
	refresh: ["r"],
	markDone: ["d"],
	selectPrevious: ["up"],
	selectNext: ["down"],
} as const;

export type TodoErrorCode =
	| "TODO_EMPTY_TITLE"
	| "TODO_BAD_ID"
	| "TODO_NOT_FOUND"
	| "TODO_BAD_STATUS"
	| "TODO_BAD_VIEW"
	| "TODO_SELF_DEP"
	| "TODO_DEP_EXISTS"
	| "TODO_CLEAR_CONFIRM"
	| "TODO_SQL_ERROR";

export type TodoStoreResult<T> =
	| { ok: true; value: T; message: string }
	| { ok: false; code: TodoErrorCode; message: string };

export interface TodoViewRow {
	id: number;
	title: string;
	description: string;
	status: TodoStatus;
	priority: number;
	createdAt: string;
	updatedAt: string;
	dependencyIds: number[];
	blockedByIds: number[];
}

export interface TodoCounts {
	open: number;
	done: number;
	blocked: number;
	total: number;
}

export interface AddTodoInput {
	title: string;
	description?: string;
	priority?: number;
}

export interface ListTodosInput {
	view?: TodoListView;
	limit?: number;
}

export interface SetTodoStatusInput {
	id: number;
	status: TodoStatus;
	reason?: string;
}

export interface AddTodoDependencyInput {
	id: number;
	dependsOn: number;
}

export interface TodoDependencyResult {
	id: number;
	dependsOn: number;
	duplicate: boolean;
}

export interface TodoNextValue {
	todos: TodoViewRow[];
	openCount: number;
}

export interface TodoClearResult {
	cleared: number;
}

export type ParsedTodoCommand =
	| { action: "help" }
	| { action: "list"; view?: TodoListView; limit?: number }
	| { action: "add"; title: string }
	| { action: "done"; id: number }
	| { action: "status"; id: number; status: TodoStatus; reason?: string }
	| { action: "block"; id: number; reason?: string }
	| { action: "dep"; id: number; dependsOn: number }
	| { action: "next"; limit?: number }
	| { action: "overlay" }
	| { action: "clear" };

const TODO_ROW_SELECT =
	"SELECT id, title, description, status, priority, created_at, updated_at FROM todos";

function todoError<T>(code: TodoErrorCode, message: string): TodoStoreResult<T> {
	return { ok: false, code, message };
}

function todoOk<T>(value: T, message: string): TodoStoreResult<T> {
	return { ok: true, value, message };
}

function isTodoStatus(value: string): value is TodoStatus {
	return TODO_STATUSES.includes(value as TodoStatus);
}

function isTodoListView(value: string): value is TodoListView {
	return TODO_LIST_VIEWS.includes(value as TodoListView);
}

function positiveInt(value: unknown): number | undefined {
	const numeric = typeof value === "bigint" ? Number(value) : value;
	if (typeof numeric !== "number") return undefined;
	if (!Number.isSafeInteger(numeric) || numeric <= 0) return undefined;
	return numeric;
}

function integerOrZero(value: unknown): number {
	const numeric = typeof value === "bigint" ? Number(value) : value;
	if (typeof numeric !== "number" || !Number.isFinite(numeric)) return 0;
	return Math.trunc(numeric);
}

function stringOrEmpty(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function normalizeLimit(limit: number | undefined): number {
	if (limit === undefined) return DEFAULT_TODO_LIMIT;
	if (!Number.isFinite(limit)) return DEFAULT_TODO_LIMIT;
	if (limit <= 0) return 0;
	return Math.min(Math.floor(limit), MAX_TODO_LIMIT);
}

function sqlError<T>(result: Extract<SqlResult, { ok: false }>): TodoStoreResult<T> {
	return todoError("TODO_SQL_ERROR", `todo error: storage unavailable: ${result.message}`);
}

function rowsFromSql(result: SqlResult): TodoStoreResult<Record<string, unknown>[]> {
	if (!result.ok) return sqlError(result);
	if (result.kind !== "rows") {
		return todoError("TODO_SQL_ERROR", "todo error: storage unavailable: expected row result");
	}
	return todoOk(result.rows, "");
}

function changeFromSql(result: SqlResult): TodoStoreResult<Extract<SqlResult, { ok: true; kind: "change" }>> {
	if (!result.ok) return sqlError(result);
	if (result.kind !== "change") {
		return todoError("TODO_SQL_ERROR", "todo error: storage unavailable: expected change result");
	}
	return todoOk(result, "");
}

function parseIdToken(token: string | undefined): TodoStoreResult<number> {
	if (!token) return todoError("TODO_BAD_ID", "todo error: id must be a positive integer");
	const normalized = token.startsWith("#") ? token.slice(1) : token;
	if (!/^\d+$/.test(normalized)) {
		return todoError("TODO_BAD_ID", "todo error: id must be a positive integer");
	}
	const id = Number(normalized);
	if (!Number.isSafeInteger(id) || id <= 0) {
		return todoError("TODO_BAD_ID", "todo error: id must be a positive integer");
	}
	return todoOk(id, "");
}

function normalizeStatusToken(token: string | undefined): TodoStoreResult<TodoStatus> {
	if (!token || !isTodoStatus(token)) {
		return todoError("TODO_BAD_STATUS", `todo error: unknown status ${token ?? ""}`.trimEnd());
	}
	return todoOk(token, "");
}

function viewLabel(view: TodoListView): string {
	if (view === "all") return "total";
	return view;
}

function rowTitle(row: Pick<TodoViewRow, "id" | "title">): string {
	const trimmed = row.title.trim();
	return trimmed.length === 0 ? `<untitled #${row.id}>` : trimmed;
}

export function formatTodoRow(row: TodoViewRow): string {
	return `#${row.id} ${row.status.padEnd(11)} p${row.priority}  ${rowTitle(row)}`;
}

export function formatTodoRows(rows: readonly TodoViewRow[]): string {
	return rows.map((row) => formatTodoRow(row)).join("\n");
}

export function formatTodoList(view: TodoListView, rows: readonly TodoViewRow[]): string {
	if (rows.length === 0) {
		if (view === "open") return "todo: no open todos\nTip: /todo add <title>";
		return `todo: no ${viewLabel(view)} todos`;
	}
	return `todo: ${rows.length} ${viewLabel(view)}\n${formatTodoRows(rows)}`;
}

export function formatTodoNext(value: TodoNextValue): string {
	if (value.todos.length > 0) {
		return `todo: ${value.todos.length} ready\n${formatTodoRows(value.todos)}`;
	}
	if (value.openCount === 0) return "todo: no open todos";
	return `todo: no ready todos\n${value.openCount} open todos are blocked by status or dependencies\nTip: /todo list blocked or /todo list all`;
}

export function parseTodoCommand(args: string): TodoStoreResult<ParsedTodoCommand> {
	const trimmed = args.trim();
	if (trimmed.length === 0) return todoOk({ action: "list", view: "open" }, "");
	const [verb = "", ...rest] = trimmed.split(/\s+/);
	switch (verb) {
		case "help":
		case "--help":
		case "-h":
			return todoOk({ action: "help" }, "");
		case "list": {
			const [viewToken, limitToken] = rest;
			let view: TodoListView | undefined;
			if (viewToken !== undefined) {
				if (!isTodoListView(viewToken)) {
					return todoError("TODO_BAD_VIEW", `todo error: unknown view ${viewToken}`);
				}
				view = viewToken;
			}
			const limit = limitToken === undefined ? undefined : Number(limitToken);
			return todoOk({ action: "list", view, limit }, "");
		}
		case "add": {
			const title = rest.join(" ").trim();
			if (title.length === 0) return todoError("TODO_EMPTY_TITLE", "todo error: title is required");
			return todoOk({ action: "add", title }, "");
		}
		case "done": {
			const id = parseIdToken(rest[0]);
			if (!id.ok) return id;
			return todoOk({ action: "done", id: id.value }, "");
		}
		case "status": {
			const id = parseIdToken(rest[0]);
			if (!id.ok) return id;
			const status = normalizeStatusToken(rest[1]);
			if (!status.ok) return status;
			const reason = rest.slice(2).join(" ").trim();
			return todoOk(
				{ action: "status", id: id.value, status: status.value, reason: reason || undefined },
				"",
			);
		}
		case "block": {
			const id = parseIdToken(rest[0]);
			if (!id.ok) return id;
			const reason = rest.slice(1).join(" ").trim();
			return todoOk({ action: "block", id: id.value, reason: reason || undefined }, "");
		}
		case "dep": {
			const id = parseIdToken(rest[0]);
			if (!id.ok) return id;
			const dependsOn = parseIdToken(rest[1]);
			if (!dependsOn.ok) return dependsOn;
			return todoOk({ action: "dep", id: id.value, dependsOn: dependsOn.value }, "");
		}
		case "next": {
			const limit = rest[0] === undefined ? undefined : Number(rest[0]);
			return todoOk({ action: "next", limit }, "");
		}
		case "overlay":
			return todoOk({ action: "overlay" }, "");
		case "clear":
			return todoOk({ action: "clear" }, "");
		default:
			return todoOk({ action: "help" }, "");
	}
}

export function todoHelpText(): string {
	return `todo commands:
  /todo                       list open todos
  /todo list [open|all|done|blocked]
  /todo add <title>
  /todo done <id>
  /todo status <id> <pending|in_progress|blocked|done>
  /todo block <id> [reason]
  /todo dep <id> <depends_on_id>
  /todo next
  /todo overlay
  /todo clear

Raw inspection: /sql SELECT * FROM todos;`;
}

export class TodoSqlStore {
	constructor(private readonly sql: SessionSqlStore) {}

	add(input: AddTodoInput): TodoStoreResult<TodoViewRow> {
		const title = input.title.trim();
		if (title.length === 0) return todoError("TODO_EMPTY_TITLE", "todo error: title is required");
		const description = input.description?.trim() || null;
		const priority = integerOrZero(input.priority ?? 0);
		const inserted = rowsFromSql(
			this.sql.execute(
				`INSERT INTO todos (title, description, status, priority, created_at, updated_at)
VALUES (:title, :description, 'pending', :priority, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
RETURNING id, title, description, status, priority, created_at, updated_at`,
				{ params: { title, description, priority } },
			),
		);
		if (!inserted.ok) return inserted;
		const rows = this.normalizeRows(inserted.value);
		if (!rows.ok) return rows;
		return this.singleRowResult(rows.value, () => "todo error: id not found", (row) =>
			`todo: added #${row.id} pending — ${rowTitle(row)}`,
		);
	}

	list(input: ListTodosInput = {}): TodoStoreResult<TodoViewRow[]> {
		const view = input.view ?? "open";
		const limit = normalizeLimit(input.limit);
		if (limit === 0) return todoOk([], formatTodoList(view, []));
		const where = this.whereForView(view);
		const result = this.rowsWithDeps(
			`${TODO_ROW_SELECT} ${where}
ORDER BY
  CASE status WHEN 'in_progress' THEN 0 WHEN 'pending' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
  priority DESC,
  created_at ASC,
  id ASC
LIMIT :limit`,
			{ limit },
		);
		if (!result.ok) return result;
		return todoOk(result.value, formatTodoList(view, result.value));
	}

	get(id: number): TodoStoreResult<TodoViewRow> {
		const validId = positiveInt(id);
		if (validId === undefined) return todoError("TODO_BAD_ID", "todo error: id must be a positive integer");
		const rows = this.rowsWithDeps(`${TODO_ROW_SELECT} WHERE id = :id`, { id: validId });
		if (!rows.ok) return rows;
		return this.singleRowResult(
			rows.value,
			() => `todo error: id #${validId} not found`,
			(row) => `todo: #${row.id} ${row.status} — ${rowTitle(row)}`,
		);
	}

	setStatus(input: SetTodoStatusInput): TodoStoreResult<TodoViewRow> {
		const validId = positiveInt(input.id);
		if (validId === undefined) return todoError("TODO_BAD_ID", "todo error: id must be a positive integer");
		if (!isTodoStatus(input.status)) {
			return todoError("TODO_BAD_STATUS", `todo error: unknown status ${String(input.status)}`);
		}
		const reason = input.reason?.trim() || null;
		const result = rowsFromSql(
			this.sql.execute(
				`UPDATE todos
SET status = :status,
    description = CASE WHEN :reason IS NULL THEN description ELSE :reason END,
    updated_at = CURRENT_TIMESTAMP
WHERE id = :id
RETURNING id, title, description, status, priority, created_at, updated_at`,
				{ params: { id: validId, status: input.status, reason } },
			),
		);
		if (!result.ok) return result;
		const rows = this.normalizeRows(result.value);
		if (!rows.ok) return rows;
		return this.singleRowResult(
			rows.value,
			() => `todo error: id #${validId} not found`,
			(row) => {
				const suffix = input.status === "blocked" && reason !== null ? reason : rowTitle(row);
				return `todo: #${row.id} ${input.status} — ${suffix}`;
			},
		);
	}

	done(id: number): TodoStoreResult<TodoViewRow> {
		return this.setStatus({ id, status: "done" });
	}

	block(id: number, reason?: string): TodoStoreResult<TodoViewRow> {
		return this.setStatus({ id, status: "blocked", reason });
	}

	addDependency(input: AddTodoDependencyInput): TodoStoreResult<TodoDependencyResult> {
		const id = positiveInt(input.id);
		const dependsOn = positiveInt(input.dependsOn);
		if (id === undefined || dependsOn === undefined) {
			return todoError("TODO_BAD_ID", "todo error: id must be a positive integer");
		}
		if (id === dependsOn) {
			return todoError("TODO_SELF_DEP", "todo error: todo cannot depend on itself");
		}
		const todo = this.get(id);
		if (!todo.ok) return todo.code === "TODO_NOT_FOUND" ? todoError("TODO_NOT_FOUND", `todo error: id #${id} not found`) : todo;
		const dependency = this.get(dependsOn);
		if (!dependency.ok) {
			return dependency.code === "TODO_NOT_FOUND"
				? todoError("TODO_NOT_FOUND", `todo error: id #${dependsOn} not found`)
				: dependency;
		}
		const existing = rowsFromSql(
			this.sql.execute("SELECT 1 AS present FROM todo_deps WHERE todo_id = :id AND depends_on = :dependsOn", {
				params: { id, dependsOn },
			}),
		);
		if (!existing.ok) return existing;
		if (existing.value.length > 0) {
			return todoOk(
				{ id, dependsOn, duplicate: true },
				`todo: #${id} already depends on #${dependsOn}`,
			);
		}
		const inserted = changeFromSql(
			this.sql.execute("INSERT INTO todo_deps(todo_id, depends_on) VALUES (:id, :dependsOn)", {
				params: { id, dependsOn },
			}),
		);
		if (!inserted.ok) return inserted;
		return todoOk({ id, dependsOn, duplicate: false }, `todo: #${id} depends on #${dependsOn}`);
	}

	next(input: { limit?: number } = {}): TodoStoreResult<TodoNextValue> {
		const limit = normalizeLimit(input.limit);
		const counts = this.counts();
		if (!counts.ok) return counts;
		if (limit === 0) {
			const value = { todos: [], openCount: counts.value.open };
			return todoOk(value, formatTodoNext(value));
		}
		const rows = this.rowsWithDeps(
			`${TODO_ROW_SELECT} t
WHERE t.status IN ('pending', 'in_progress')
  AND NOT EXISTS (
    SELECT 1
    FROM todo_deps d
    JOIN todos dep ON dep.id = d.depends_on
    WHERE d.todo_id = t.id
      AND dep.status != 'done'
  )
ORDER BY
  CASE t.status WHEN 'in_progress' THEN 0 ELSE 1 END,
  t.priority DESC,
  t.created_at ASC,
  t.id ASC
LIMIT :limit`,
			{ limit },
		);
		if (!rows.ok) return rows;
		const value = { todos: rows.value, openCount: counts.value.open };
		return todoOk(value, formatTodoNext(value));
	}

	counts(): TodoStoreResult<TodoCounts> {
		const result = rowsFromSql(
			this.sql.execute(`SELECT
  COALESCE(SUM(CASE WHEN status != 'done' THEN 1 ELSE 0 END), 0) AS open,
  COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done,
  COALESCE(SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END), 0) AS blocked,
  COUNT(*) AS total
FROM todos`),
		);
		if (!result.ok) return result;
		const [row] = result.value;
		if (!row) return todoOk({ open: 0, done: 0, blocked: 0, total: 0 }, "todo: 0 total");
		const counts = {
			open: integerOrZero(row.open),
			done: integerOrZero(row.done),
			blocked: integerOrZero(row.blocked),
			total: integerOrZero(row.total),
		};
		return todoOk(counts, `todo: ${counts.open} open, ${counts.done} done, ${counts.total} total`);
	}

	clear(): TodoStoreResult<TodoClearResult> {
		const counts = this.counts();
		if (!counts.ok) return counts;
		const deleted = changeFromSql(this.sql.execute("DELETE FROM todos"));
		if (!deleted.ok) return deleted;
		return todoOk({ cleared: counts.value.total }, `todo: cleared ${counts.value.total} todos`);
	}

	private whereForView(view: TodoListView): string {
		switch (view) {
			case "open":
				return "WHERE status != 'done'";
			case "done":
				return "WHERE status = 'done'";
			case "blocked":
				return "WHERE status = 'blocked'";
			case "all":
				return "";
		}
	}

	private rowsWithDeps(
		query: string,
		params?: Record<string, null | number | bigint | string | NodeJS.ArrayBufferView>,
	): TodoStoreResult<TodoViewRow[]> {
		const rows = rowsFromSql(this.sql.execute(query, params ? { params } : {}));
		if (!rows.ok) return rows;
		return this.normalizeRows(rows.value);
	}

	private normalizeRows(rows: readonly Record<string, unknown>[]): TodoStoreResult<TodoViewRow[]> {
		const deps = this.dependencyMaps();
		if (!deps.ok) return deps;
		const normalized: TodoViewRow[] = [];
		for (const row of rows) {
			const todo = this.normalizeTodoRow(row, deps.value);
			if (todo) normalized.push(todo);
		}
		return todoOk(normalized, "");
	}

	private singleRowResult(
		rows: readonly TodoViewRow[],
		notFoundMessage: () => string,
		message: (row: TodoViewRow) => string,
	): TodoStoreResult<TodoViewRow> {
		const [row] = rows;
		if (!row) return todoError("TODO_NOT_FOUND", notFoundMessage());
		return todoOk(row, message(row));
	}

	private dependencyMaps(): TodoStoreResult<{
		dependencyIdsByTodo: Map<number, number[]>;
		blockedByIdsByTodo: Map<number, number[]>;
	}> {
		const result = rowsFromSql(
			this.sql.execute("SELECT todo_id, depends_on FROM todo_deps ORDER BY todo_id, depends_on"),
		);
		if (!result.ok) return result;
		const dependencyIdsByTodo = new Map<number, number[]>();
		const blockedByIdsByTodo = new Map<number, number[]>();
		for (const row of result.value) {
			const todoId = positiveInt(row.todo_id);
			const dependsOn = positiveInt(row.depends_on);
			if (todoId === undefined || dependsOn === undefined) continue;
			const dependencyIds = dependencyIdsByTodo.get(todoId) ?? [];
			dependencyIds.push(dependsOn);
			dependencyIdsByTodo.set(todoId, dependencyIds);
			const blockedByIds = blockedByIdsByTodo.get(dependsOn) ?? [];
			blockedByIds.push(todoId);
			blockedByIdsByTodo.set(dependsOn, blockedByIds);
		}
		return todoOk({ dependencyIdsByTodo, blockedByIdsByTodo }, "");
	}

	private normalizeTodoRow(
		row: Record<string, unknown>,
		deps: {
			dependencyIdsByTodo: Map<number, number[]>;
			blockedByIdsByTodo: Map<number, number[]>;
		},
	): TodoViewRow | undefined {
		const id = positiveInt(row.id);
		if (id === undefined) return undefined;
		const statusValue = stringOrEmpty(row.status);
		if (!isTodoStatus(statusValue)) return undefined;
		return {
			id,
			title: stringOrEmpty(row.title),
			description: stringOrEmpty(row.description),
			status: statusValue,
			priority: integerOrZero(row.priority),
			createdAt: stringOrEmpty(row.created_at),
			updatedAt: stringOrEmpty(row.updated_at),
			dependencyIds: deps.dependencyIdsByTodo.get(id) ?? [],
			blockedByIds: deps.blockedByIdsByTodo.get(id) ?? [],
		};
	}
}
