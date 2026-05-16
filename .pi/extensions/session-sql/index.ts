import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import {
	defaultRootDir,
	locationForSession,
	SessionSqlStore,
	type SqlResult,
	STORE_NAME,
	type StoreStatus,
	type TableSchema,
} from "./store.js";

const STATUS_KEY = "session-sql";
const SESSION_SQL_CHANGED_EVENT = "session-sql:changed";

type SessionSqlChangedSource = "command" | "tool" | "reset";

function looksMutatingSql(query: string): boolean {
	return /(^|;)\s*(insert|update|delete|replace|create|drop|alter|vacuum|pragma|attach|detach|reindex|analyze|begin|commit|rollback)\b/i.test(
		query,
	);
}

function valueToText(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "";
	if (typeof value === "bigint") return value.toString();
	if (value instanceof Uint8Array) return `<${value.byteLength} bytes>`;
	return String(value);
}

function cell(value: unknown): string {
	return valueToText(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatRows(result: Extract<SqlResult, { ok: true; kind: "rows" }>): string {
	const suffix = result.truncated ? " (truncated)" : "";
	const lines = [`sql: ${result.rowsReturned} rows${suffix}`];
	if (result.rows.length === 0) {
		if (result.truncated)
			lines.push("", "Result capped before any rows were returned. Re-run with a narrower query.");
		return lines.join("\n");
	}
	const columns = result.columns.length > 0 ? result.columns : Object.keys(result.rows[0] ?? {});
	lines.push(
		"",
		`| ${columns.map(cell).join(" | ")} |`,
		`| ${columns.map(() => "---").join(" | ")} |`,
	);
	for (const row of result.rows) {
		lines.push(`| ${columns.map((column) => cell(row[column])).join(" | ")} |`);
	}
	if (result.truncated) {
		lines.push(
			"",
			"Result capped at 200 rows. Re-run with a narrower query, LIMIT/OFFSET, or an aggregate/count query.",
		);
	}
	return lines.join("\n");
}

function formatSqlResult(result: SqlResult): string {
	if (!result.ok) return `sql error: ${result.message}`;
	switch (result.kind) {
		case "rows":
			return formatRows(result);
		case "change": {
			const noun = result.changes === 1 ? "change" : "changes";
			return [
				`sql: ok, ${result.changes.toString()} ${noun}`,
				`lastInsertRowid: ${result.lastInsertRowid.toString()}`,
			].join("\n");
		}
		case "exec":
			return "sql: ok, statement executed";
	}
}

function formatStatus(status: StoreStatus): string {
	if (!status.open) return "session-sql: not open";
	return [
		"session-sql: ready",
		`session: ${status.sessionId ?? "unknown"}`,
		`db: ${status.dbPath ?? "unknown"}`,
		`schema_version: ${status.schemaVersion ?? "unknown"}`,
		`native_extension_loading: ${status.nativeExtensionLoading}`,
		`tables: ${status.tables.join(", ")}`,
	].join("\n");
}

function formatSchema(schema: TableSchema[]): string {
	if (schema.length === 0) return "session-sql: no schema available";
	return schema
		.map((table) => {
			const columns = table.columns.map((column) => {
				const flags = [
					column.type,
					column.primaryKey ? "PRIMARY KEY" : "",
					column.notNull ? "NOT NULL" : "",
					column.defaultValue ? `DEFAULT ${column.defaultValue}` : "",
				]
					.filter(Boolean)
					.join(" ");
				return `${column.name} ${flags}`.trim();
			});
			return `${table.name}(${columns.join(", ")})`;
		})
		.join("\n");
}

export default function (pi: ExtensionAPI) {
	const store = new SessionSqlStore();

	function openForCurrentSession(ctx: ExtensionContext): void {
		const sessionId = ctx.sessionManager.getSessionId();
		const result = store.open(locationForSession(sessionId, defaultRootDir()));
		if (!result.ok) {
			ctx.ui.notify(`session-sql: failed to open DB: ${result.message}`, "error");
		}
	}

	function ensureOpen(ctx: ExtensionContext): void {
		if (!store.status().open) openForCurrentSession(ctx);
	}

	function refreshStatus(ctx: ExtensionContext): void {
		const status = store.status();
		ctx.ui.setStatus(STATUS_KEY, status.open ? `${STORE_NAME}: ready` : undefined);
	}

	function emitChanged(source: SessionSqlChangedSource, result?: SqlResult): void {
		if (result && !result.ok) return;
		const status = store.status();
		pi.events.emit(SESSION_SQL_CHANGED_EVENT, {
			source,
			sessionId: status.sessionId,
			kind: result?.ok ? result.kind : "reset",
		});
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, ctx) => {
		openForCurrentSession(ctx);
		refreshStatus(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		const result = store.close();
		if (!result.ok) ctx.ui.notify(`session-sql: failed to close DB: ${result.message}`, "warning");
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.registerCommand("sql", {
		description: "Run SQL against the current session SQLite database",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			ensureOpen(ctx);
			const trimmed = args.trim();
			if (trimmed === "" || trimmed === "status") {
				ctx.ui.notify(formatStatus(store.status()), "info");
				refreshStatus(ctx);
				return;
			}
			if (trimmed === "schema") {
				ctx.ui.notify(formatSchema(store.schema()), "info");
				refreshStatus(ctx);
				return;
			}
			if (trimmed === "reset") {
				const status = store.status();
				const dbPath = status.dbPath ?? "current session DB";
				const confirmed = await ctx.ui.confirm(
					"Reset session SQL database?",
					`This deletes and recreates ${dbPath}.`,
				);
				if (!confirmed) {
					ctx.ui.notify("session-sql: reset cancelled", "info");
					return;
				}
				const result = store.reset();
				if (result.ok) {
					ctx.ui.notify("session-sql: reset complete", "info");
					emitChanged("reset");
				} else {
					ctx.ui.notify(`session-sql: reset failed: ${result.message}`, "error");
				}
				refreshStatus(ctx);
				return;
			}

			const result = store.execute(args);
			ctx.ui.notify(formatSqlResult(result), result.ok ? "info" : "error");
			if (looksMutatingSql(args)) emitChanged("command", result);
			refreshStatus(ctx);
		},
	});

	pi.registerTool({
		name: "sql",
		label: "Session SQL",
		description:
			"Execute SQLite against a private database scoped to the current pi session. Use it for task tracking, test matrices, review queues, file inventories, research ledgers, batches, and structured temporary work.",
		promptSnippet:
			"sql: execute SQLite against a private database linked to the current pi session for structured task state.",
		promptGuidelines: [
			"Use sql when structured current-session state would help: todos, dependencies, file inventories, test matrices, review findings, research sources, decision matrices, or batch progress.",
			"Start with the default session_sql_meta, todos, and todo_deps tables for top-level work queues; create custom tables freely for workflow-specific state.",
			"Query before choosing the next item, update rows after edits/tests/research/decisions, and check open rows before final answers.",
			"The DB persists with this pi session across reload/resume and lives in user pi state, not the repo. Do not use it as long-term memory or project source documentation.",
			"Prefer LIMIT, WHERE, counts, and grouped summaries on exploratory SELECTs. Returned previews cap at 200 rows even though SQL execution is trusted and unrestricted.",
			"Native SQLite extension loading is available when the runtime supports it; treat loaded extensions as trusted local native code.",
		],
		parameters: Type.Object({
			query: Type.String({
				description: "SQLite SQL to execute against the current session database.",
			}),
			description: Type.String({ description: "2-5 word summary of what this query does." }),
			maxRows: Type.Optional(
				Type.Number({
					description:
						"Maximum result rows to return. Defaults to 200; capped by extension maximum.",
				}),
			),
		}),
		executionMode: "sequential",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			ensureOpen(ctx);
			const result = store.execute(params.query, { maxRows: params.maxRows });
			if (looksMutatingSql(params.query)) emitChanged("tool", result);
			refreshStatus(ctx);
			return {
				content: [{ type: "text", text: formatSqlResult(result) }],
				details: result,
			};
		},
	});
}
