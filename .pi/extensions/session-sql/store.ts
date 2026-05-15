// SessionSqlStore — pi-free SQLite data layer (Pattern P2).
//
// Imports nothing from @earendil-works/*. All pi session/UI wiring lives in
// index.ts. Tests run against this store with real temp SQLite files.

import { Buffer } from "node:buffer";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const STORE_NAME = "session-sql";
export const SCHEMA_VERSION = 1;
export const DEFAULT_ROOT_DIR = ".pi/db/session-sql";
export const DEFAULT_MAX_ROWS = 200;
export const MAX_ROWS = 200;
export const DEFAULT_MAX_RESULT_BYTES = 64 * 1024;
export const MAX_QUERY_BYTES = 256 * 1024;

const DEFAULT_SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS session_sql_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'done', 'blocked')),
  priority INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS todo_deps (
  todo_id INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  depends_on INTEGER NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
  PRIMARY KEY (todo_id, depends_on),
  CHECK (todo_id != depends_on)
);

INSERT INTO session_sql_meta (key, value, updated_at)
VALUES ('schema_version', '1', CURRENT_TIMESTAMP)
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = excluded.updated_at;
`;

export interface SessionSqlLocation {
	sessionId: string;
	rootDir: string;
	dbPath: string;
}

export type SqlBindValue = null | number | bigint | string | NodeJS.ArrayBufferView;
export type SqlNamedBindValues = Record<string, SqlBindValue>;
export type SqlBindValues = readonly SqlBindValue[] | SqlNamedBindValues;

export interface ExecuteOptions {
	maxRows?: number;
	maxResultBytes?: number;
	params?: SqlBindValues;
}

export interface TableColumn {
	name: string;
	type: string;
	notNull: boolean;
	primaryKey: boolean;
	defaultValue: string | null;
}

export interface TableSchema {
	name: string;
	columns: TableColumn[];
}

export interface StoreStatus {
	open: boolean;
	sessionId?: string;
	rootDir?: string;
	dbPath?: string;
	schemaVersion?: number;
	tables: string[];
	nativeExtensionLoading: "available" | "unavailable";
}

export type SqlSuccessResult =
	| {
			ok: true;
			kind: "rows";
			columns: string[];
			rows: Record<string, unknown>[];
			rowsReturned: number;
			truncated: boolean;
			dbPath: string;
	  }
	| {
			ok: true;
			kind: "change";
			changes: number | bigint;
			lastInsertRowid: number | bigint;
			dbPath: string;
	  }
	| {
			ok: true;
			kind: "exec";
			dbPath: string;
	  };

export type SqlFailureResult = {
	ok: false;
	reason: "not_open" | "too_large" | "sqlite_error" | "empty_query";
	message: string;
	dbPath?: string;
};

export type SqlResult = SqlSuccessResult | SqlFailureResult;

export type StoreOpenResult =
	| { ok: true; status: StoreStatus }
	| { ok: false; reason: "sqlite_error"; message: string; dbPath?: string };

export type StoreCloseResult =
	| { ok: true }
	| { ok: false; reason: "sqlite_error"; message: string; dbPath?: string };

export function defaultRootDir(home: string = homedir()): string {
	return join(home, DEFAULT_ROOT_DIR);
}

export function safeSessionId(sessionId: string): string {
	const safe = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
	return safe.length === 0 ? "unknown-session" : safe;
}

export function locationForSession(
	sessionId: string,
	rootDir: string = defaultRootDir(),
): SessionSqlLocation {
	const safeId = safeSessionId(sessionId);
	return {
		sessionId,
		rootDir,
		dbPath: join(rootDir, `${safeId}.sqlite`),
	};
}

export function memoryLocation(sessionId = "memory"): SessionSqlLocation {
	return { sessionId, rootDir: ":memory:", dbPath: ":memory:" };
}

function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function clampMaxRows(maxRows: number | undefined): number {
	if (maxRows === undefined) return DEFAULT_MAX_ROWS;
	if (!Number.isFinite(maxRows)) return DEFAULT_MAX_ROWS;
	if (maxRows <= 0) return 0;
	return Math.min(Math.floor(maxRows), MAX_ROWS);
}

function jsonSize(value: unknown): number {
	const text = JSON.stringify(value, (_key, inner) =>
		typeof inner === "bigint" ? inner.toString() : inner,
	);
	return Buffer.byteLength(text ?? "", "utf8");
}

function firstKeyword(query: string): string {
	const match = /^\s*([a-zA-Z]+)/.exec(query);
	return match?.[1]?.toLowerCase() ?? "";
}

function isMutationKeyword(keyword: string): boolean {
	return (
		keyword === "insert" || keyword === "update" || keyword === "delete" || keyword === "replace"
	);
}

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function isMultiStatementError(message: string): boolean {
	return message.includes("more than one") || message.includes("multiple statements");
}

function isNamedBindValues(params: SqlBindValues): params is SqlNamedBindValues {
	return !Array.isArray(params);
}

function hasBindParams(options: ExecuteOptions): boolean {
	return options.params !== undefined;
}

type PreparedStatement = ReturnType<DatabaseSync["prepare"]>;

function allowBareNamedParams(statement: PreparedStatement, params: SqlBindValues): void {
	if (isNamedBindValues(params)) statement.setAllowBareNamedParameters(true);
}

function iterateStatement(
	statement: PreparedStatement,
	params: SqlBindValues | undefined,
): Iterable<Record<string, unknown>> {
	if (params === undefined) return statement.iterate();
	allowBareNamedParams(statement, params);
	if (isNamedBindValues(params)) return statement.iterate(params);
	return statement.iterate(...params);
}

function runStatement(statement: PreparedStatement, params: SqlBindValues | undefined) {
	if (params === undefined) return statement.run();
	allowBareNamedParams(statement, params);
	if (isNamedBindValues(params)) return statement.run(params);
	return statement.run(...params);
}

export class SessionSqlStore {
	private db: DatabaseSync | undefined;
	private location: SessionSqlLocation | undefined;
	private nativeExtensionLoadingAvailable = false;

	open(location: SessionSqlLocation): StoreOpenResult {
		this.close();
		try {
			if (location.dbPath !== ":memory:") {
				mkdirSync(location.rootDir, { recursive: true });
			}
			const db = new DatabaseSync(location.dbPath, {
				allowExtension: true,
				enableForeignKeyConstraints: true,
				timeout: 1000,
			});
			this.db = db;
			this.location = location;
			this.nativeExtensionLoadingAvailable = this.enableNativeExtensionLoading(db);
			db.exec(DEFAULT_SCHEMA_SQL);
			return { ok: true, status: this.status() };
		} catch (error) {
			this.db = undefined;
			this.location = undefined;
			return {
				ok: false,
				reason: "sqlite_error",
				message: messageFromUnknown(error),
				dbPath: location.dbPath,
			};
		}
	}

	close(): StoreCloseResult {
		if (!this.db) return { ok: true };
		const dbPath = this.location?.dbPath;
		try {
			if (this.db.isOpen) this.db.close();
			this.db = undefined;
			this.location = undefined;
			this.nativeExtensionLoadingAvailable = false;
			return { ok: true };
		} catch (error) {
			return { ok: false, reason: "sqlite_error", message: messageFromUnknown(error), dbPath };
		}
	}

	status(): StoreStatus {
		if (!this.db || !this.location || !this.db.isOpen) {
			return { open: false, tables: [], nativeExtensionLoading: "unavailable" };
		}
		return {
			open: true,
			sessionId: this.location.sessionId,
			rootDir: this.location.rootDir,
			dbPath: this.location.dbPath,
			schemaVersion: this.schemaVersion(),
			tables: this.tables(),
			nativeExtensionLoading: this.nativeExtensionLoadingAvailable ? "available" : "unavailable",
		};
	}

	schema(): TableSchema[] {
		if (!this.db?.isOpen) return [];
		return this.tables().map((table) => ({ name: table, columns: this.columnsForTable(table) }));
	}

	execute(query: string, options: ExecuteOptions = {}): SqlResult {
		if (!this.db || !this.location || !this.db.isOpen) {
			return { ok: false, reason: "not_open", message: "session SQL database is not open" };
		}
		if (Buffer.byteLength(query, "utf8") > MAX_QUERY_BYTES) {
			return {
				ok: false,
				reason: "too_large",
				message: `SQL query exceeds ${MAX_QUERY_BYTES} bytes`,
				dbPath: this.location.dbPath,
			};
		}
		const trimmed = query.trim();
		if (trimmed.length === 0) {
			return {
				ok: false,
				reason: "empty_query",
				message: "SQL query is empty",
				dbPath: this.location.dbPath,
			};
		}

		try {
			const statement = this.db.prepare(query);
			const trailingSql = query.slice(statement.sourceSQL.length).trim();
			if (trailingSql.length > 0) {
				if (hasBindParams(options)) {
					return {
						ok: false,
						reason: "sqlite_error",
						message: "Bound parameters are only supported for a single SQL statement",
						dbPath: this.location.dbPath,
					};
				}
				this.db.exec(query);
				return { ok: true, kind: "exec", dbPath: this.location.dbPath };
			}
			const columns = statement.columns().map((column) => column.name);
			if (columns.length > 0) {
				const rows: Record<string, unknown>[] = [];
				const maxRows = clampMaxRows(options.maxRows);
				const maxBytes = options.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES;
				let returnedBytes = 0;
				let truncated = false;
				for (const row of iterateStatement(statement, options.params)) {
					if (rows.length >= maxRows) {
						truncated = true;
						break;
					}
					const nextBytes = jsonSize(row);
					if (returnedBytes + nextBytes > maxBytes) {
						truncated = true;
						break;
					}
					rows.push({ ...row });
					returnedBytes += nextBytes;
				}
				return {
					ok: true,
					kind: "rows",
					columns,
					rows,
					rowsReturned: rows.length,
					truncated,
					dbPath: this.location.dbPath,
				};
			}

			const keyword = firstKeyword(query);
			if (isMutationKeyword(keyword)) {
				const result = runStatement(statement, options.params);
				return {
					ok: true,
					kind: "change",
					changes: result.changes,
					lastInsertRowid: result.lastInsertRowid,
					dbPath: this.location.dbPath,
				};
			}

			if (hasBindParams(options)) {
				runStatement(statement, options.params);
				return { ok: true, kind: "exec", dbPath: this.location.dbPath };
			}
			this.db.exec(query);
			return { ok: true, kind: "exec", dbPath: this.location.dbPath };
		} catch (error) {
			const message = messageFromUnknown(error);
			if (isMultiStatementError(message)) {
				if (hasBindParams(options)) {
					return {
						ok: false,
						reason: "sqlite_error",
						message: "Bound parameters are only supported for a single SQL statement",
						dbPath: this.location.dbPath,
					};
				}
				try {
					this.db.exec(query);
					return { ok: true, kind: "exec", dbPath: this.location.dbPath };
				} catch (execError) {
					return {
						ok: false,
						reason: "sqlite_error",
						message: messageFromUnknown(execError),
						dbPath: this.location.dbPath,
					};
				}
			}
			return { ok: false, reason: "sqlite_error", message, dbPath: this.location.dbPath };
		}
	}

	reset(): StoreOpenResult {
		if (!this.location) {
			return { ok: false, reason: "sqlite_error", message: "session SQL database is not open" };
		}
		const location = this.location;
		this.close();
		if (location.dbPath !== ":memory:") {
			for (const path of [location.dbPath, `${location.dbPath}-shm`, `${location.dbPath}-wal`]) {
				if (existsSync(path)) rmSync(path, { force: true });
			}
		}
		return this.open(location);
	}

	loadExtension(path: string): SqlResult {
		if (!this.db || !this.location || !this.db.isOpen) {
			return { ok: false, reason: "not_open", message: "session SQL database is not open" };
		}
		if (!this.nativeExtensionLoadingAvailable) {
			return {
				ok: false,
				reason: "sqlite_error",
				message: "native SQLite extension loading is unavailable in this runtime",
				dbPath: this.location.dbPath,
			};
		}
		try {
			this.db.loadExtension(path);
			return { ok: true, kind: "exec", dbPath: this.location.dbPath };
		} catch (error) {
			return {
				ok: false,
				reason: "sqlite_error",
				message: messageFromUnknown(error),
				dbPath: this.location.dbPath,
			};
		}
	}

	private enableNativeExtensionLoading(db: DatabaseSync): boolean {
		try {
			db.enableLoadExtension(true);
			return true;
		} catch {
			return false;
		}
	}

	private tables(): string[] {
		const db = this.db;
		if (!db?.isOpen) return [];
		const rows = db
			.prepare(
				"SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
			)
			.all();
		return rows.map((row) => String(row.name));
	}

	private schemaVersion(): number | undefined {
		const db = this.db;
		if (!db?.isOpen) return undefined;
		try {
			const row = db
				.prepare("SELECT value FROM session_sql_meta WHERE key = 'schema_version'")
				.get();
			if (!row) return undefined;
			const value = Number(row.value);
			return Number.isFinite(value) ? value : undefined;
		} catch {
			return undefined;
		}
	}

	private columnsForTable(table: string): TableColumn[] {
		const db = this.db;
		if (!db?.isOpen) return [];
		const rows = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
		return rows.map((row) => ({
			name: String(row.name),
			type: String(row.type),
			notNull: Number(row.notnull) === 1,
			primaryKey: Number(row.pk) > 0,
			defaultValue:
				row.dflt_value === null || row.dflt_value === undefined ? null : String(row.dflt_value),
		}));
	}
}
