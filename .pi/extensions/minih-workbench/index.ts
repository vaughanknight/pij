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
} from "./minih-adapter.js";
import { SessionMinihWorkbenchPersistence } from "./session-persistence.js";
import {
	actionAvailabilityForRun,
	buildOutboundMessageDraft,
	defaultModalState,
	diagnostic,
	isForbiddenWorkbenchAction,
	MINIH_COMMAND_NAME,
	MINIH_STATUS_KEY,
	type MinihAdapterResult,
	type MinihInventorySnapshot,
	type MinihModalPane,
	type MinihOutboundMessageType,
	type MinihRunRef,
	minihError,
	openModalForRun,
	readOnlyNoWriteResult,
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

interface SendMessageInput extends RootOptions {
	slug: string;
	runId: string;
	body: string;
	subject?: string;
	type?: MinihOutboundMessageType;
	ackOf?: string;
}

function configuredRoot(rootDir?: string): string {
	return rootDir ?? process.env.PIJ_MINIH_WORKBENCH_ROOT ?? defaultFixtureRoot();
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
  /minih report <slug> <runId>
  /minih status --json
  /minih status <slug> <runId> --json
  /minih report <slug> <runId> --json

Tools: minih_runs_list, minih_run_status, minih_read_report, minih_send_message
Send is gated to active coordinated writable runs with persisted audit; stop/push controls land separately in Phase 3.`;
}

export default function (pi: ExtensionAPI) {
	const activeFeeds = new Set<MinihReadOnlyFeedHandle>();
	let currentSessionManager: ExtensionContext["sessionManager"] | undefined;
	const persistence = new SessionMinihWorkbenchPersistence({
		getEntries: () => currentSessionManager?.getEntries() ?? [],
		appendEntry: (customType, data) => pi.appendEntry(customType, data),
	});
	const minihWriter: MinihWriter = async (request) => {
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
		return listMinihRuns({ rootDir: configuredRoot() });
	}

	async function sendMessageToRun(
		input: SendMessageInput,
	): Promise<MinihAdapterResult<MinihWriteOutcome>> {
		const status = await readMinihRunStatus({
			rootDir: configuredRoot(input.rootDir),
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

	async function openRunModal(
		ctx: ExtensionCommandContext,
		run: MinihRunRef,
		options: { focusedPane?: MinihModalPane } = {},
	): Promise<void> {
		bindSession(ctx);
		const result = await readMinihRunStatus({
			rootDir: configuredRoot(),
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
					requestRender: () => {
						if (!closed) tui.requestRender();
					},
				});
				feed = trackFeed(
					createRunFeed({
						read: () =>
							readMinihRunStatus({
								rootDir: configuredRoot(),
								slug: run.slug,
								runId: run.runId,
							}),
						onSnapshot: (snapshot) => {
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
			if (verb === "view" && slug && runId) {
				await openRunModal(ctx, { slug, runId });
				return;
			}
			if (verb === "status" && slug && runId) {
				const result = await readMinihRunStatus({ rootDir: configuredRoot(), slug, runId });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "status" && wantsJson(tokens)) {
				const result = await listMinihRuns({ rootDir: configuredRoot() });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "report" && slug && runId && wantsJson(tokens)) {
				const result = await readMinihReport({ rootDir: configuredRoot(), slug, runId });
				ctx.ui.notify(toolText(result), result.ok ? "info" : "error");
				return;
			}
			if (verb === "report" && slug && runId) {
				await openRunModal(ctx, { slug, runId }, { focusedPane: "report" });
				return;
			}
			const result = await listMinihRuns({ rootDir: configuredRoot() });
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
			rootDir: Type.Optional(Type.String({ description: "Fixture or Minih root directory." })),
		}),
		async execute(_id, params: SendMessageInput, _signal, _onUpdate, ctx) {
			bindSession(ctx);
			const result = await sendMessageToRun(params);
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
