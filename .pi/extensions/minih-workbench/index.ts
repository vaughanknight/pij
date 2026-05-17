import { randomUUID } from "node:crypto";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import { createInventoryFeed, createRunFeed, type MinihReadOnlyFeedHandle } from "./feed.js";
import {
	defaultFixtureRoot,
	listMinihRuns,
	type MinihWriteOutcome,
	type MinihWriter,
	readMinihReport,
	readMinihRunStatus,
	sendMinihMessage,
	sendMinihStopControl,
} from "./minih-adapter.js";
import { SessionMinihWorkbenchPersistence } from "./session-persistence.js";
import {
	actionAvailabilityForRun,
	buildOutboundMessageDraft,
	buildPushedContextEnvelope,
	buildStopControlDraft,
	classifyMaterialEvent,
	defaultModalState,
	diagnostic,
	isForbiddenWorkbenchAction,
	isPushScopeEligible,
	MINIH_COMMAND_NAME,
	MINIH_STATUS_KEY,
	type MinihAdapterResult,
	type MinihInventorySnapshot,
	type MinihMaterialEventInput,
	type MinihModalPane,
	type MinihOutboundMessageType,
	type MinihRunRef,
	type MinihViewSnapshot,
	minihError,
	openModalForRun,
	readOnlyNoWriteResult,
	requiredStopConfirmation,
	validateStopConfirmation,
} from "./store.js";
import {
	formatInventoryText,
	MinihRunListComponent,
	MinihRunModalComponent,
	renderWidthSafeModalView,
} from "./ui.js";

interface RootOptions {
	rootDir?: string;
}

interface SendMessageInput {
	slug: string;
	runId: string;
	body: string;
	subject?: string;
	type?: MinihOutboundMessageType;
	ackOf?: string;
}

interface StopRunInput {
	slug: string;
	runId: string;
	confirm: string;
}

function configuredRoot(rootDir?: string): string {
	return rootDir ?? process.env.PIJ_MINIH_WORKBENCH_ROOT ?? defaultFixtureRoot();
}

function configuredNowMs(): number | undefined {
	const value = process.env.PIJ_MINIH_WORKBENCH_NOW_MS;
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function envelope<T>(result: MinihAdapterResult<T>) {
	if (result.ok) return { ok: true, data: result.value, diagnostics: result.diagnostics };
	return {
		ok: false,
		code: result.code,
		message: result.message,
		diagnostics: result.diagnostics,
	};
}

function jsonText(value: unknown): string {
	return JSON.stringify(value, null, 2);
}

function toolText<T>(result: MinihAdapterResult<T>): string {
	return jsonText(envelope(result));
}

function persistenceError(message: string): MinihAdapterResult<MinihWriteOutcome> {
	return minihError("MINIH_IO_ERROR", message, [
		diagnostic("error", "MINIH_PERSISTENCE_FAILED", message, "adapter"),
	]);
}

function parseMessageId(stdout: string | undefined): string | undefined {
	if (!stdout) return undefined;
	try {
		const parsed = JSON.parse(stdout) as unknown;
		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
		const data = (parsed as Record<string, unknown>).data;
		if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
		const messageId = (data as Record<string, unknown>).messageId;
		return typeof messageId === "string" ? messageId : undefined;
	} catch {
		return undefined;
	}
}

function commandTokens(args: string): string[] {
	return args.trim().split(/\s+/).filter(Boolean);
}

function wantsJson(tokens: readonly string[]): boolean {
	return tokens.includes("--json");
}

function withoutFlags(tokens: readonly string[]): string[] {
	return tokens.filter((token) => !token.startsWith("--"));
}

function helpText(): string {
	return `minih-workbench commands:
  /minih
  /minih list
  /minih view <slug> <runId>
  /minih send <slug> <runId> <body>
  /minih stop <slug> <runId>
  /minih report <slug> <runId>
  /minih status --json
  /minih status <slug> <runId> --json
  /minih report <slug> <runId> --json

Tools: minih_runs_list, minih_run_status, minih_read_report, minih_send_message, minih_stop_run
Send/stop are gated to active coordinated writable runs with persisted audit; stop requires explicit confirmation.`;
}

export default function (pi: ExtensionAPI) {
	const activeFeeds = new Set<MinihReadOnlyFeedHandle>();
	let currentSessionManager: ExtensionContext["sessionManager"] | undefined;
	const persistence = new SessionMinihWorkbenchPersistence({
		getEntries: () => currentSessionManager?.getEntries() ?? [],
		appendEntry: (customType, data) => pi.appendEntry(customType, data),
	});
	const minihWriter: MinihWriter = async (request) => {
		if (process.env.PIJ_MINIH_WORKBENCH_FAKE_WRITER === "1") {
			return {
				accepted: true,
				messageId: `fake-${request.slug}-${request.runId}`,
				stdout: jsonText({ data: { messageId: `fake-${request.slug}-${request.runId}` } }),
				exitCode: 0,
			};
		}
		const args = [
			"outside",
			"inbox",
			"send",
			request.slug,
			"--run",
			request.runId,
			"--type",
			request.type,
			"--subject",
			request.subject,
			"--body",
			request.body,
		];
		if (request.ackOf) args.push("--ack-of", request.ackOf);
		const result = await pi.exec("minih", args, { timeout: 30_000 });
		return {
			accepted: result.code === 0,
			messageId: parseMessageId(result.stdout),
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.code,
		};
	};

	function bindSession(ctx: ExtensionContext): void {
		currentSessionManager = ctx.sessionManager;
	}

	function disposeActiveFeeds(): void {
		for (const feed of activeFeeds) feed.dispose();
		activeFeeds.clear();
	}

	function trackFeed(feed: MinihReadOnlyFeedHandle): MinihReadOnlyFeedHandle {
		activeFeeds.add(feed);
		return feed;
	}

	function releaseFeed(feed: MinihReadOnlyFeedHandle | undefined): void {
		if (!feed) return;
		feed.dispose();
		activeFeeds.delete(feed);
	}

	function clearStatus(ctx: ExtensionContext): void {
		ctx.ui.setStatus(MINIH_STATUS_KEY, undefined);
	}

	function clearSelectedPointer(): void {
		persistence.clearSelectedRun();
	}

	function setSelectedPointer(run: MinihRunRef): void {
		persistence.setSelectedRun(run);
	}

	async function loadInventory(): Promise<MinihAdapterResult<MinihInventorySnapshot>> {
		return listMinihRuns({ rootDir: configuredRoot(), nowMs: configuredNowMs() });
	}

	async function sendMessageToRun(
		input: SendMessageInput,
	): Promise<MinihAdapterResult<MinihWriteOutcome>> {
		const status = await readMinihRunStatus({
			rootDir: configuredRoot(),
			nowMs: configuredNowMs(),
			slug: input.slug,
			runId: input.runId,
		});
		if (!status.ok) return minihError(status.code, status.message, status.diagnostics);
		const availability = actionAvailabilityForRun(status.value.summary, "send");
		if (!availability.available) {
			return minihError("MINIH_WRITE_REJECTED", availability.reason ?? "send disabled", [
				diagnostic(
					"warning",
					"MINIH_SEND_NOT_AVAILABLE",
					availability.reason ?? "send disabled",
					"adapter",
				),
			]);
		}
		const draft = buildOutboundMessageDraft({
			run: { slug: input.slug, runId: input.runId },
			type: input.type,
			subject: input.subject ?? "message from Pi Minih Workbench",
			body: input.body,
			ackOf: input.ackOf,
		});
		const createdAt = new Date().toISOString();
		const intent = persistence.recordAudit({
			id: randomUUID(),
			kind: "intent",
			action: "send",
			status: "accepted",
			createdAt,
			run: { slug: draft.slug, runId: draft.runId },
			message: draft.subject,
			metadata: { type: draft.type, bodyBytes: draft.body.length },
		});
		if (!intent.ok) return persistenceError(intent.message);
		const result = await sendMinihMessage(draft, { writer: minihWriter });
		const outcome = persistence.recordAudit({
			id: randomUUID(),
			kind: "outcome",
			action: "send",
			status: result.ok && result.value.status === "accepted" ? "succeeded" : "failed",
			createdAt: new Date().toISOString(),
			run: { slug: draft.slug, runId: draft.runId },
			message: result.ok ? result.value.messageId : result.message,
			metadata: result.ok ? { adapterStatus: result.value.status } : { adapterCode: result.code },
		});
		if (!outcome.ok) return persistenceError(outcome.message);
		return result;
	}

	async function stopRun(input: StopRunInput): Promise<MinihAdapterResult<MinihWriteOutcome>> {
		const run = { slug: input.slug, runId: input.runId };
		if (!validateStopConfirmation(run, input.confirm)) {
			return minihError("MINIH_WRITE_REJECTED", "stop confirmation did not match required text", [
				diagnostic(
					"warning",
					"MINIH_STOP_CONFIRMATION_MISMATCH",
					`Expected confirmation: ${requiredStopConfirmation(run)}`,
					"adapter",
				),
			]);
		}
		const status = await readMinihRunStatus({
			rootDir: configuredRoot(),
			nowMs: configuredNowMs(),
			slug: input.slug,
			runId: input.runId,
		});
		if (!status.ok) return minihError(status.code, status.message, status.diagnostics);
		const availability = actionAvailabilityForRun(status.value.summary, "stop");
		if (!availability.available) {
			return minihError("MINIH_WRITE_REJECTED", availability.reason ?? "stop disabled", [
				diagnostic(
					"warning",
					"MINIH_STOP_NOT_AVAILABLE",
					availability.reason ?? "stop disabled",
					"adapter",
				),
			]);
		}
		const draft = buildStopControlDraft(run);
		const intent = persistence.recordAudit({
			id: randomUUID(),
			kind: "intent",
			action: "stop",
			status: "accepted",
			createdAt: new Date().toISOString(),
			run,
			message: draft.subject,
			metadata: { type: draft.type },
		});
		if (!intent.ok) return persistenceError(intent.message);
		const result = await sendMinihStopControl(draft, { writer: minihWriter });
		const outcome = persistence.recordAudit({
			id: randomUUID(),
			kind: "outcome",
			action: "stop",
			status: result.ok && result.value.status === "accepted" ? "succeeded" : "failed",
			createdAt: new Date().toISOString(),
			run,
			message: result.ok ? result.value.messageId : result.message,
			metadata: result.ok ? { adapterStatus: result.value.status } : { adapterCode: result.code },
		});
		if (!outcome.ok) return persistenceError(outcome.message);
		return result;
	}

	async function confirmAndStop(
		ctx: ExtensionCommandContext,
		run: MinihRunRef,
	): Promise<MinihAdapterResult<MinihWriteOutcome>> {
		const required = requiredStopConfirmation(run);
		const confirmed = await ctx.ui.confirm(
			"Stop Minih run?",
			`Send dedicated stop control to ${run.slug}/${run.runId}? Required confirmation: ${required}`,
		);
		if (!confirmed) {
			return minihError("MINIH_WRITE_REJECTED", "stop cancelled by user", [
				diagnostic("warning", "MINIH_STOP_CANCELLED", "stop cancelled by user", "adapter"),
			]);
		}
		return stopRun({ ...run, confirm: required });
	}

	function materialEventsFromSnapshot(snapshot: MinihViewSnapshot): MinihMaterialEventInput[] {
		const run = { slug: snapshot.slug, runId: snapshot.runId };
		return [
			...snapshot.transcript.items.map((item) => ({
				run,
				source: "events" as const,
				id: item.id,
				type: item.type,
				text: item.text,
				timestamp: item.timestamp,
			})),
			...snapshot.coordination.items.map((item) => ({
				run,
				source: "inside" as const,
				id: item.id,
				type: item.type,
				text: item.text,
				timestamp: item.timestamp,
			})),
		];
	}

	function deliverMaterialEvent(event: MinihMaterialEventInput): void {
		if (!isPushScopeEligible({ opened: true, observed: true, optedIn: false })) return;
		const classification = classifyMaterialEvent(event);
		const envelope = buildPushedContextEnvelope(event, classification);
		if (!envelope) return;
		const cursorKey = {
			...event.run,
			source: "push" as const,
			channel: envelope.details.dedupeKey,
		};
		const cursor = persistence.getSeenCursor(cursorKey);
		if (!cursor.ok || cursor.value?.cursor === "delivered") return;
		const audit = persistence.recordAudit({
			id: randomUUID(),
			kind: "cursor",
			action: "push_context",
			status: "accepted",
			createdAt: new Date().toISOString(),
			run: event.run,
			message: envelope.details.reason,
			metadata: { urgency: envelope.details.urgency, eventType: event.type },
		});
		if (!audit.ok) return;
		const advanced = persistence.advanceSeenCursor({
			...cursorKey,
			cursor: "delivered",
			updatedAt: new Date().toISOString(),
		});
		if (!advanced.ok) return;
		pi.sendMessage(envelope, {
			deliverAs: "steer",
			triggerTurn: envelope.details.urgency === "urgent",
		});
	}

	function deliverSnapshotPushes(snapshot: MinihViewSnapshot): void {
		for (const event of materialEventsFromSnapshot(snapshot)) deliverMaterialEvent(event);
	}

	async function openRunModal(
		ctx: ExtensionCommandContext,
		run: MinihRunRef,
		options: { focusedPane?: MinihModalPane } = {},
	): Promise<void> {
		bindSession(ctx);
		const result = await readMinihRunStatus({
			rootDir: configuredRoot(),
			nowMs: configuredNowMs(),
			slug: run.slug,
			runId: run.runId,
		});
		if (!result.ok) {
			ctx.ui.notify(toolText(result), "error");
			return;
		}
		const state = {
			...openModalForRun(run, defaultModalState()),
			focusedPane: options.focusedPane ?? "transcript",
		};
		if (!ctx.hasUI) {
			ctx.ui.notify(renderWidthSafeModalView(result.value, 120, { state }).join("\n"), "info");
			return;
		}
		setSelectedPointer(run);
		deliverSnapshotPushes(result.value);
		ctx.ui.setStatus(MINIH_STATUS_KEY, `minih: viewing ${run.slug}/${run.runId}`);
		let component: MinihRunModalComponent | undefined;
		let feed: MinihReadOnlyFeedHandle | undefined;
		let closed = false;
		await ctx.ui.custom<"closed">(
			(tui, _theme, _keybindings, done) => {
				const close = (): void => {
					closed = true;
					done("closed");
				};
				component = new MinihRunModalComponent(result.value, state, {
					onClose: close,
					onSendMessage: (body) => {
						void sendMessageToRun({ slug: run.slug, runId: run.runId, body }).then((sendResult) => {
							if (!closed)
								component?.updateView(
									result.value,
									sendResult.ok ? "minih: sent" : sendResult.message,
								);
						});
					},
					onStopRun: () => {
						void confirmAndStop(ctx, run).then((stopResult) => {
							if (!closed)
								component?.updateView(
									result.value,
									stopResult.ok ? "minih: stop sent" : stopResult.message,
								);
						});
					},
					requestRender: () => {
						if (!closed) tui.requestRender();
					},
				});
				feed = trackFeed(
					createRunFeed({
						read: () =>
							readMinihRunStatus({
								rootDir: configuredRoot(),
								nowMs: configuredNowMs(),
								slug: run.slug,
								runId: run.runId,
							}),
						onSnapshot: (snapshot) => {
							deliverSnapshotPushes(snapshot);
							if (!closed) component?.updateView(snapshot, "minih: refreshed");
						},
						onDiagnostics: (diagnostics) => {
							if (!closed)
								component?.updateView(result.value, `minih: ${diagnostics.length} diagnostics`);
						},
					}),
				);
				feed.start();
				return component;
			},
			{
				overlay: true,
				overlayOptions: {
					width: "95%",
					minWidth: 70,
					maxHeight: "95%",
					anchor: "center",
					margin: 1,
				},
			},
		);
		closed = true;
		releaseFeed(feed);
		component = undefined;
		clearSelectedPointer();
		clearStatus(ctx);
	}

	async function openRunList(ctx: ExtensionCommandContext): Promise<void> {
		bindSession(ctx);
		const initial = await loadInventory();
		if (!initial.ok) {
			ctx.ui.notify(toolText(initial), "error");
			return;
		}
		if (!ctx.hasUI) {
			ctx.ui.notify(formatInventoryText(initial.value), "info");
			return;
		}
		let component: MinihRunListComponent | undefined;
		let feed: MinihReadOnlyFeedHandle | undefined;
		let closed = false;
		const selected = await ctx.ui.custom<MinihRunRef | "closed">(
			(tui, _theme, _keybindings, done) => {
				const finish = (value: MinihRunRef | "closed"): void => {
					closed = true;
					done(value);
				};
				component = new MinihRunListComponent(initial.value, {
					onOpenRun: (run) => finish(run),
					onClose: () => finish("closed"),
					onRefresh: () => feed?.refresh(),
					requestRender: () => {
						if (!closed) tui.requestRender();
					},
				});
				feed = trackFeed(
					createInventoryFeed({
						read: loadInventory,
						onSnapshot: (snapshot) => {
							if (!closed) component?.updateSnapshot(snapshot, "minih: refreshed");
						},
						onDiagnostics: (diagnostics) => {
							if (!closed)
								component?.updateSnapshot(
									initial.value,
									`minih: ${diagnostics.length} diagnostics`,
								);
						},
					}),
				);
				feed.start();
				return component;
			},
			{
				overlay: true,
				overlayOptions: {
					width: "90%",
					minWidth: 60,
					maxHeight: "85%",
					anchor: "center",
					margin: 1,
				},
			},
		);
		closed = true;
		releaseFeed(feed);
		component = undefined;
		if (selected !== "closed") await openRunModal(ctx, selected);
	}

	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (event, ctx) => {
		bindSession(ctx);
		disposeActiveFeeds();
		if (event.reason === "new" || event.reason === "fork") {
			persistence.resetForNewSession(new Date().toISOString());
		}
		clearStatus(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		bindSession(ctx);
		disposeActiveFeeds();
		clearStatus(ctx);
	});

	pi.registerCommand(MINIH_COMMAND_NAME, {
		description: "Inspect Minih runs through the Pi-native Minih Workbench",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			bindSession(ctx);
			const tokens = commandTokens(args);
			const positional = withoutFlags(tokens);
			const [verb, slug, runId] = positional;
			if (verb && isForbiddenWorkbenchAction(verb)) {
				ctx.ui.notify(toolText(readOnlyNoWriteResult(verb)), "warning");
				return;
			}
			if (!verb || verb === "list") {
				await openRunList(ctx);
				return;
			}
			if (verb === "help" || verb === "--help" || verb === "-h") {
				ctx.ui.notify(helpText(), "info");
				return;
			}
			if (verb === "send") {
				const body = positional.slice(3).join(" ").trim();
				if (!slug || !runId || body.length === 0) {
					ctx.ui.notify("Usage: /minih send <slug> <runId> <body>", "warning");
					return;
				}
				const result = await sendMessageToRun({ slug, runId, body });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "stop" && slug && runId) {
				const result = await confirmAndStop(ctx, { slug, runId });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "warning");
				return;
			}
			if (verb === "view" && slug && runId) {
				await openRunModal(ctx, { slug, runId });
				return;
			}
			if (verb === "status" && slug && runId) {
				const result = await readMinihRunStatus({
					rootDir: configuredRoot(),
					nowMs: configuredNowMs(),
					slug,
					runId,
				});
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "status" && wantsJson(tokens)) {
				const result = await listMinihRuns({ rootDir: configuredRoot(), nowMs: configuredNowMs() });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "report" && slug && runId && wantsJson(tokens)) {
				const result = await readMinihReport({
					rootDir: configuredRoot(),
					nowMs: configuredNowMs(),
					slug,
					runId,
				});
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "report" && slug && runId) {
				await openRunModal(ctx, { slug, runId }, { focusedPane: "report" });
				return;
			}
			const result = await listMinihRuns({ rootDir: configuredRoot(), nowMs: configuredNowMs() });
			ctx.ui.notify(
				result.ok ? formatInventoryText(result.value) : toolText(result),
				result.ok ? "info" : "error",
			);
		},
	});

	pi.registerTool({
		name: "minih_runs_list",
		label: "Minih runs list",
		description:
			"List Minih runs through the read-only Minih Workbench artifact adapter. Returns active/stale runs plus a bounded completed/report-ready section.",
		parameters: Type.Object({
			rootDir: Type.Optional(Type.String({ description: "Fixture or Minih root directory." })),
			activeLimit: Type.Optional(Type.Number({ description: "Maximum active/stale rows." })),
			completedLimit: Type.Optional(
				Type.Number({ description: "Maximum completed/report-ready rows." }),
			),
		}),
		async execute(_id, params: RootOptions & { activeLimit?: number; completedLimit?: number }) {
			const result = await listMinihRuns({
				rootDir: configuredRoot(params.rootDir),
				activeLimit: params.activeLimit,
				completedLimit: params.completedLimit,
			});
			return { content: [{ type: "text", text: toolText(result) }], details: envelope(result) };
		},
	});

	pi.registerTool({
		name: "minih_run_status",
		label: "Minih run status",
		description: "Read one Minih run status/view snapshot through the read-only artifact adapter.",
		parameters: Type.Object({
			slug: Type.String({ description: "Minih agent slug." }),
			runId: Type.String({ description: "Minih run id." }),
			rootDir: Type.Optional(Type.String({ description: "Fixture or Minih root directory." })),
		}),
		async execute(_id, params: RootOptions & { slug: string; runId: string }) {
			const result = await readMinihRunStatus({
				rootDir: configuredRoot(params.rootDir),
				slug: params.slug,
				runId: params.runId,
			});
			return { content: [{ type: "text", text: toolText(result) }], details: envelope(result) };
		},
	});

	pi.registerTool({
		name: "minih_send_message",
		label: "Minih send message",
		description:
			"Send a message to an active coordinated writable Minih run through the gated Minih Workbench adapter. Requires explicit slug and runId; performs a fresh capability check and persists audit before writing.",
		parameters: Type.Object({
			slug: Type.String({ description: "Minih agent slug." }),
			runId: Type.String({ description: "Minih run id." }),
			body: Type.String({ description: "Message body to deliver through the outside inbox." }),
			subject: Type.Optional(Type.String({ description: "Optional message subject." })),
			type: Type.Optional(
				Type.Union([
					Type.Literal("task"),
					Type.Literal("question"),
					Type.Literal("directive"),
					Type.Literal("briefing"),
					Type.Literal("review-request"),
					Type.Literal("note"),
				]),
			),
			ackOf: Type.Optional(
				Type.String({ description: "Optional Minih message id to ack/reply to." }),
			),
		}),
		async execute(_id, params: SendMessageInput, _signal, _onUpdate, ctx) {
			bindSession(ctx);
			const result = await sendMessageToRun(params);
			return { content: [{ type: "text", text: toolText(result) }], details: envelope(result) };
		},
	});

	pi.registerTool({
		name: "minih_stop_run",
		label: "Minih stop run",
		description:
			"Send a dedicated confirmed stop control to an active coordinated writable Minih run. Requires exact confirm text: stop <slug>/<runId>.",
		parameters: Type.Object({
			slug: Type.String({ description: "Minih agent slug." }),
			runId: Type.String({ description: "Minih run id." }),
			confirm: Type.String({ description: "Must exactly equal: stop <slug>/<runId>." }),
		}),
		async execute(_id, params: StopRunInput, _signal, _onUpdate, ctx) {
			bindSession(ctx);
			const result = await stopRun(params);
			return { content: [{ type: "text", text: toolText(result) }], details: envelope(result) };
		},
	});

	pi.registerTool({
		name: "minih_read_report",
		label: "Minih read report",
		description: "Read a bounded Minih output/report.json summary through the read-only adapter.",
		parameters: Type.Object({
			slug: Type.String({ description: "Minih agent slug." }),
			runId: Type.String({ description: "Minih run id." }),
			rootDir: Type.Optional(Type.String({ description: "Fixture or Minih root directory." })),
		}),
		async execute(_id, params: RootOptions & { slug: string; runId: string }) {
			const result = await readMinihReport({
				rootDir: configuredRoot(params.rootDir),
				slug: params.slug,
				runId: params.runId,
			});
			return { content: [{ type: "text", text: toolText(result) }], details: envelope(result) };
		},
	});
}
