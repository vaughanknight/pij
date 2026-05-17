// Read-only Minih artifact adapter.
//
// Phase 1 decision: use local artifact/JSON contracts and deterministic
// fixtures. Do not parse ANSI output from `minih view` / `minih attach`.

import { constants as fsConstants } from "node:fs";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
	classifyAttention,
	DEFAULT_STALE_AFTER_MS,
	diagnostic,
	type MinihAdapterResult,
	type MinihDiagnostic,
	type MinihInsideStatus,
	type MinihInventorySnapshot,
	type MinihLiveness,
	type MinihOutboundMessageDraft,
	type MinihOutsideStatus,
	type MinihPaneCursor,
	type MinihPaneItem,
	type MinihReportSummary,
	type MinihRunKind,
	type MinihRunSummary,
	type MinihStopControlDraft,
	type MinihTerminalResult,
	type MinihViewSnapshot,
	makePaneSnapshot,
	minihError,
	minihOk,
	projectInventory,
	truncateText,
} from "./store.js";

export interface MinihAdapterOptions {
	rootDir?: string;
	nowMs?: number;
	activeLimit?: number;
	completedLimit?: number;
}

export interface MinihRunReadOptions extends MinihAdapterOptions {
	slug: string;
	runId: string;
	transcript?: MinihPaneCursor;
	tools?: MinihPaneCursor;
	coordination?: MinihPaneCursor;
	diagnostics?: MinihPaneCursor;
}

export interface MinihWriterRequest {
	command: "outside.inbox.send";
	slug: string;
	runId: string;
	type: string;
	subject: string;
	body: string;
	ackOf?: string;
}

export interface MinihWriterResult {
	accepted: boolean;
	messageId?: string;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
}

export type MinihWriter = (request: MinihWriterRequest) => Promise<MinihWriterResult>;

export interface MinihWriteOptions {
	writer?: MinihWriter;
}

export interface MinihWriteOutcome {
	status: "accepted" | "rejected";
	slug: string;
	runId: string;
	messageId?: string;
	request: MinihWriterRequest;
	stdout?: string;
	stderr?: string;
	exitCode?: number;
}

interface JsonReadResult {
	ok: boolean;
	value?: unknown;
	diagnostics: MinihDiagnostic[];
}

interface TextReadResult {
	ok: boolean;
	text: string;
	diagnostics: MinihDiagnostic[];
}

interface EventRecord {
	id: string;
	timestamp?: string;
	type: string;
	text: string;
	tool?: string;
	material: boolean;
}

interface RunArtifacts {
	slug: string;
	runId: string;
	runPath: string;
	runJson: JsonReadResult;
	completedJson: JsonReadResult;
	reportJson: JsonReadResult;
	events: EventRecord[];
	eventDiagnostics: MinihDiagnostic[];
	hasInbox: boolean;
	hasState: boolean;
	permissionLike: boolean;
}

export function defaultFixtureRoot(): string {
	return join(dirname(fileURLToPath(import.meta.url)), "fixtures");
}

function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function booleanField(record: Record<string, unknown>, key: string): boolean | undefined {
	const value = record[key];
	return typeof value === "boolean" ? value : undefined;
}

function arrayField(record: Record<string, unknown>, key: string): unknown[] | undefined {
	const value = record[key];
	return Array.isArray(value) ? value : undefined;
}

function isRunJsonRecord(value: unknown): value is Record<string, unknown> {
	if (!isRecord(value)) return false;
	const status = stringField(value, "status");
	const hasKnownStatus =
		status === "active" || status === "running" || status === "completed" || status === "failed";
	return typeof stringField(value, "runId") === "string" && hasKnownStatus;
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path, fsConstants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function safeReadText(
	path: string,
	source: MinihDiagnostic["source"],
): Promise<TextReadResult> {
	try {
		return { ok: true, text: await readFile(path, "utf8"), diagnostics: [] };
	} catch (error) {
		const message = messageFromUnknown(error);
		const permission = message.includes("EACCES") || message.includes("permission");
		return {
			ok: false,
			text: "",
			diagnostics: [
				diagnostic(
					permission ? "error" : "warning",
					permission ? "MINIH_PERMISSION_DENIED" : "MINIH_ARTIFACT_MISSING",
					`${path}: ${message}`,
					source,
				),
			],
		};
	}
}

async function safeReadJson(
	path: string,
	source: MinihDiagnostic["source"],
): Promise<JsonReadResult> {
	const text = await safeReadText(path, source);
	if (!text.ok) return { ok: false, diagnostics: text.diagnostics };
	try {
		return { ok: true, value: JSON.parse(text.text), diagnostics: [] };
	} catch (error) {
		return {
			ok: false,
			diagnostics: [
				diagnostic("error", "MINIH_BAD_JSON", `${path}: ${messageFromUnknown(error)}`, source),
			],
		};
	}
}

async function readEvents(
	path: string,
): Promise<{ events: EventRecord[]; diagnostics: MinihDiagnostic[] }> {
	const text = await safeReadText(path, "events");
	if (!text.ok) return { events: [], diagnostics: text.diagnostics };
	const events: EventRecord[] = [];
	const diagnostics: MinihDiagnostic[] = [];
	let index = 0;
	for (const line of text.text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		index += 1;
		try {
			const parsed = JSON.parse(trimmed);
			if (!isRecord(parsed)) {
				diagnostics.push(
					diagnostic(
						"warning",
						"MINIH_BAD_EVENT",
						`event line ${index} is not an object`,
						"events",
					),
				);
				continue;
			}
			const type = stringField(parsed, "type") ?? "event";
			const textValue =
				stringField(parsed, "message") ??
				stringField(parsed, "body") ??
				stringField(parsed, "summary") ??
				JSON.stringify(parsed);
			events.push({
				id: stringField(parsed, "id") ?? `event-${index}`,
				timestamp: stringField(parsed, "ts") ?? stringField(parsed, "timestamp"),
				type,
				text: textValue,
				tool: stringField(parsed, "tool"),
				material: booleanField(parsed, "material") ?? (type === "finding" || type === "farewell"),
			});
		} catch (error) {
			diagnostics.push(
				diagnostic(
					"warning",
					"MINIH_BAD_EVENT_JSON",
					`event line ${index}: ${messageFromUnknown(error)}`,
					"events",
				),
			);
		}
	}
	return { events, diagnostics };
}

async function readInboxMessages(runPath: string): Promise<{
	items: MinihPaneItem[];
	diagnostics: MinihDiagnostic[];
}> {
	const inboxPaths = [
		join(runPath, "inbox", "inside", "messages.ndjson"),
		join(runPath, "inbox", "outside", "messages.ndjson"),
		join(runPath, "history", "outside.ndjson"),
	];
	const items: MinihPaneItem[] = [];
	const diagnostics: MinihDiagnostic[] = [];
	for (const path of inboxPaths) {
		if (!(await exists(path))) continue;
		const read = await readEvents(path);
		diagnostics.push(...read.diagnostics);
		items.push(
			...read.events.map((event) => ({
				id: event.id,
				timestamp: event.timestamp,
				type: event.type,
				text: event.text,
			})),
		);
	}
	return { items, diagnostics };
}

function mapInsideStatus(value: string | undefined): MinihInsideStatus {
	switch (value) {
		case "idle":
		case "reading":
		case "reviewing":
		case "reporting":
		case "blocked":
		case "stopping":
		case "complete":
			return value;
		case "running":
		case "in-progress":
			return "running";
		case "needs_recovery":
		case "needs-recovery":
		case "error":
			return "needs_recovery";
		default:
			return "unknown";
	}
}

function mapOutsideStatus(value: string | undefined, hasInbox: boolean): MinihOutsideStatus {
	switch (value) {
		case "available":
		case "polling":
		case "waiting":
		case "unavailable":
			return value;
		default:
			return hasInbox ? "available" : "unknown";
	}
}

function reportSummary(path: string, read: JsonReadResult): MinihReportSummary {
	if (!read.ok) return { state: "none", findingsCount: 0, bytes: 0, truncated: false };
	if (!isRecord(read.value))
		return { state: "error", path, findingsCount: 0, bytes: 0, truncated: false };
	const summary = stringField(read.value, "summary") ?? "";
	const truncated = truncateText(summary, 16 * 1024);
	return {
		state: "ready",
		path,
		summary: truncated.text,
		findingsCount: arrayField(read.value, "findings")?.length ?? 0,
		bytes: Buffer.byteLength(truncated.text, "utf8"),
		truncated: truncated.truncated,
	};
}

async function readArtifacts(rootDir: string, slug: string, runId: string): Promise<RunArtifacts> {
	const runPath = join(rootDir, "agents", slug, "runs", runId);
	const runJson = await safeReadJson(join(runPath, "run.json"), "run");
	const completedJson = await safeReadJson(join(runPath, "completed.json"), "run");
	const reportJson = await safeReadJson(join(runPath, "output", "report.json"), "report");
	const events = await readEvents(join(runPath, "events.ndjson"));
	return {
		slug,
		runId,
		runPath,
		runJson,
		completedJson,
		reportJson,
		events: events.events,
		eventDiagnostics: events.diagnostics,
		hasInbox: await exists(join(runPath, "inbox")),
		hasState: await exists(join(runPath, "state")),
		permissionLike: await exists(join(runPath, "permission-denied.marker")),
	};
}

function summaryFromArtifacts(artifacts: RunArtifacts, nowMs: number): MinihRunSummary {
	const diagnostics: MinihDiagnostic[] = [
		...artifacts.runJson.diagnostics,
		...artifacts.eventDiagnostics,
	];
	if (artifacts.permissionLike) {
		diagnostics.push(
			diagnostic(
				"error",
				"MINIH_PERMISSION_LIKE_FIXTURE",
				"fixture simulates a permission-denied read path",
				"adapter",
			),
		);
	}
	const runRecord = isRunJsonRecord(artifacts.runJson.value) ? artifacts.runJson.value : undefined;
	if (!runRecord) {
		diagnostics.push(
			diagnostic(
				"error",
				"MINIH_BAD_RUN_JSON",
				"run.json is missing, invalid, or missing required runId/status fields",
				"run",
			),
		);
	}
	const completedRecord = isRecord(artifacts.completedJson.value)
		? artifacts.completedJson.value
		: undefined;
	const status = stringField(runRecord ?? {}, "status");
	const completedAt =
		stringField(runRecord ?? {}, "completedAt") ??
		stringField(completedRecord ?? {}, "completedAt");
	const updatedAt = stringField(runRecord ?? {}, "updatedAt");
	const updatedMs = Date.parse(updatedAt ?? "");
	const hasCompleted = Boolean(completedRecord) || status === "completed" || Boolean(completedAt);
	const failed =
		status === "failed" || stringField(completedRecord ?? {}, "terminalReason") === "failed";
	const liveness: MinihLiveness = hasCompleted
		? failed
			? "failed"
			: "completed"
		: !runRecord
			? "missing"
			: Number.isFinite(updatedMs) && nowMs - updatedMs > DEFAULT_STALE_AFTER_MS
				? "stale"
				: "active";
	const terminal: MinihTerminalResult = hasCompleted
		? failed
			? "failed"
			: stringField(completedRecord ?? {}, "terminalReason") === "stopped"
				? "stopped"
				: "completed"
		: "running";
	const kind: MinihRunKind = booleanField(runRecord ?? {}, "coordinated")
		? "coordinated"
		: artifacts.hasInbox
			? "coordinated"
			: runRecord
				? "standalone"
				: "unknown";
	const inside = mapInsideStatus(stringField(runRecord ?? {}, "selfReportedState"));
	const outside = mapOutsideStatus(
		stringField(runRecord ?? {}, "outsideStatus"),
		artifacts.hasInbox,
	);
	const baseStatus = { liveness, terminal, inside, outside, attention: "none" as const };
	return {
		slug: stringField(runRecord ?? {}, "slug") ?? artifacts.slug,
		runId: stringField(runRecord ?? {}, "runId") ?? artifacts.runId,
		kind,
		runPath: artifacts.runPath,
		startedAt: stringField(runRecord ?? {}, "startedAt"),
		updatedAt,
		completedAt,
		status: { ...baseStatus, attention: classifyAttention({ status: baseStatus, diagnostics }) },
		report: reportSummary(join(artifacts.runPath, "output", "report.json"), artifacts.reportJson),
		diagnostics,
		materialEventCount: artifacts.events.filter((event) => event.material).length,
		hasInbox: artifacts.hasInbox,
		hasState: artifacts.hasState,
	};
}

function eventPane(
	events: readonly EventRecord[],
	predicate: (event: EventRecord) => boolean,
): MinihPaneItem[] {
	return events.filter(predicate).map((event) => ({
		id: event.id,
		timestamp: event.timestamp,
		type: event.type,
		text: event.tool ? `${event.tool}: ${event.text}` : event.text,
	}));
}

async function resolveRunPath(
	rootDir: string,
	slug: string,
	runId: string,
): Promise<string | undefined> {
	const runPath = join(rootDir, "agents", slug, "runs", runId);
	return (await exists(runPath)) ? runPath : undefined;
}

function writeUnavailable(request: MinihWriterRequest): MinihAdapterResult<MinihWriteOutcome> {
	return minihError(
		"MINIH_WRITE_UNAVAILABLE",
		"Minih writer dependency was not provided; no write was attempted",
		[
			diagnostic(
				"warning",
				"MINIH_WRITE_UNAVAILABLE",
				`writer missing for ${request.slug}/${request.runId}`,
				"adapter",
			),
		],
	);
}

async function executeWrite(
	request: MinihWriterRequest,
	writer: MinihWriter | undefined,
): Promise<MinihAdapterResult<MinihWriteOutcome>> {
	if (!writer) return writeUnavailable(request);
	try {
		const result = await writer(request);
		return minihOk(
			{
				status: result.accepted ? "accepted" : "rejected",
				slug: request.slug,
				runId: request.runId,
				messageId: result.messageId,
				request,
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
			},
			result.accepted
				? []
				: [
						diagnostic(
							"warning",
							"MINIH_WRITE_REJECTED",
							result.stderr ?? "Minih writer rejected the request",
							"adapter",
						),
					],
		);
	} catch (error) {
		return minihError("MINIH_IO_ERROR", `Minih writer failed: ${messageFromUnknown(error)}`, [
			diagnostic(
				"error",
				"MINIH_WRITE_FAILED",
				`Minih writer failed: ${messageFromUnknown(error)}`,
				"adapter",
			),
		]);
	}
}

export async function sendMinihMessage(
	draft: MinihOutboundMessageDraft,
	options: MinihWriteOptions = {},
): Promise<MinihAdapterResult<MinihWriteOutcome>> {
	return executeWrite(
		{
			command: "outside.inbox.send",
			slug: draft.slug,
			runId: draft.runId,
			type: draft.type,
			subject: draft.subject,
			body: draft.body,
			ackOf: draft.ackOf,
		},
		options.writer,
	);
}

export async function sendMinihStopControl(
	draft: MinihStopControlDraft,
	options: MinihWriteOptions = {},
): Promise<MinihAdapterResult<MinihWriteOutcome>> {
	return executeWrite(
		{
			command: "outside.inbox.send",
			slug: draft.slug,
			runId: draft.runId,
			type: draft.type,
			subject: draft.subject,
			body: draft.body,
		},
		options.writer,
	);
}

export async function listMinihRuns(
	options: MinihAdapterOptions = {},
): Promise<MinihAdapterResult<MinihInventorySnapshot>> {
	const rootDir = options.rootDir ?? defaultFixtureRoot();
	const agentsDir = join(rootDir, "agents");
	try {
		const agentEntries = await readdir(agentsDir, { withFileTypes: true });
		const summaries: MinihRunSummary[] = [];
		const diagnostics: MinihDiagnostic[] = [];
		for (const agent of agentEntries.filter((entry) => entry.isDirectory())) {
			const runsDir = join(agentsDir, agent.name, "runs");
			if (!(await exists(runsDir))) continue;
			const runEntries = await readdir(runsDir, { withFileTypes: true });
			for (const run of runEntries.filter((entry) => entry.isDirectory())) {
				const artifacts = await readArtifacts(rootDir, agent.name, run.name);
				const summary = summaryFromArtifacts(artifacts, options.nowMs ?? Date.now());
				diagnostics.push(...summary.diagnostics);
				summaries.push(summary);
			}
		}
		return minihOk(
			projectInventory(summaries, {
				activeLimit: options.activeLimit,
				completedLimit: options.completedLimit,
			}),
			diagnostics,
		);
	} catch (error) {
		return minihError("MINIH_ROOT_MISSING", `${agentsDir}: ${messageFromUnknown(error)}`, [
			diagnostic(
				"error",
				"MINIH_ROOT_MISSING",
				`${agentsDir}: ${messageFromUnknown(error)}`,
				"adapter",
			),
		]);
	}
}

export async function readMinihRunStatus(
	options: MinihRunReadOptions,
): Promise<MinihAdapterResult<MinihViewSnapshot>> {
	const rootDir = options.rootDir ?? defaultFixtureRoot();
	const runPath = await resolveRunPath(rootDir, options.slug, options.runId);
	if (!runPath) {
		return minihError("MINIH_RUN_NOT_FOUND", `${options.slug}/${options.runId} not found`, [
			diagnostic(
				"error",
				"MINIH_RUN_NOT_FOUND",
				`${options.slug}/${options.runId} not found`,
				"adapter",
			),
		]);
	}
	const artifacts = await readArtifacts(rootDir, options.slug, options.runId);
	const summary = summaryFromArtifacts(artifacts, options.nowMs ?? Date.now());
	const inbox = await readInboxMessages(runPath);
	const diagnosticItems = [...summary.diagnostics, ...inbox.diagnostics].map((item, index) => ({
		id: `diagnostic-${index}`,
		type: item.severity,
		text: `${item.code}: ${item.message}`,
	}));
	return minihOk(
		{
			slug: summary.slug,
			runId: summary.runId,
			summary,
			transcript: makePaneSnapshot(
				eventPane(artifacts.events, (event) => !event.type.startsWith("tool")),
				options.transcript,
			),
			tools: makePaneSnapshot(
				eventPane(artifacts.events, (event) => event.type.startsWith("tool")),
				options.tools,
			),
			coordination: makePaneSnapshot(inbox.items, options.coordination),
			diagnostics: makePaneSnapshot(diagnosticItems, options.diagnostics),
			report: summary.report,
		},
		[...summary.diagnostics, ...inbox.diagnostics],
	);
}

export async function readMinihReport(
	options: MinihRunReadOptions,
): Promise<MinihAdapterResult<MinihReportSummary>> {
	const status = await readMinihRunStatus(options);
	if (!status.ok) return status;
	return minihOk(status.value.report, status.diagnostics);
}
