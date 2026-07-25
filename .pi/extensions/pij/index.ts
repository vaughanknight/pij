import { mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { FsChannel, pollPrimaryWatchOpts } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { GitRepositoryAdapter } from "./adapters/git-repository.js";
import type { CommandControl } from "./adapters/pi-runtime.js";
import { PiRuntimeAdapter } from "./adapters/pi-runtime.js";
import { NodeProcess } from "./adapters/process.js";
import { FsSpawnExpectationStore } from "./adapters/spawn-expectation-store.js";
import { TmuxAdapter } from "./adapters/tmux.js";
import { FsWatchdogStore } from "./adapters/watchdog-store.js";
import { type CliDeps, dispatch } from "./core/cli.js";
import { ALLOWED_COMMANDS } from "./core/commands.js";
import { deriveSelfId, isSubagentChild, memorableIdentitySeed } from "./core/discovery.js";
import { guardInvariantNineModal } from "./core/invariant-guard.js";
import { loadModels } from "./core/models/registry.js";
import { PijSession } from "./core/session.js";
import type { Role, SessionDescriptor } from "./core/types.js";

// pij — peer session messaging + observability.
//
// Thin pi-event -> coordinator translator (Patterns P2/P8/P10): owns NO logic.

/** Footer status key — shows the session's pij id (e.g. `pij-arbitrary-locust`) in pi's
 *  bottom bar so the operator knows which peer this terminal is at a glance. */
const PIJ_STATUS_KEY = "pij";
// All boot/announce/capture/inject/command/receipt/shutdown behaviour lives in
// the pure, fakes-tested PijSession (./core/session.ts); this file only adapts
// pi events into coordinator calls and wires the fs adapters. The single
// pi-importing seams are here + adapters/pi-runtime.ts; core/ stays pi-free.

export default function (pi: ExtensionAPI): void {
	// A pi process spawned as a subagent child (pi-subagents: `pi --mode json -p`)
	// must NOT activate pij: the session_start announce is a sendUserMessage that
	// collides with the child's `-p` task prompt ("Agent is already processing"),
	// and a throwaway child should never register as a peer. Skip ALL wiring.
	if (isSubagentChild(process.env)) return;

	const pijHome = process.env.PIJ_HOME ?? join(homedir(), ".pij");
	const repositories = new GitRepositoryAdapter();

	// Native send tool (the model-facing comms seam). Agents call this instead of
	// shelling out to the `pij` CLI — it reuses the proven core dispatch() send
	// path (resolveSelf, E-SELF/E-NOID/E-DEAD, command allow-list, receipts) over
	// the same fs adapters the CLI bin wires, so there is no second send logic.
	// Registered at factory level so it is callable before/independent of a turn.
	pi.registerTool({
		name: "pij_send",
		label: "pij send",
		description:
			"Send a message — or run an allow-listed control command (compact/new/reload) — to another pij peer session in this project. Prefer this over shelling out to the `pij` CLI: it resolves your id, delivers, and reports the receipt. Reply to a `[pij from <id>]` message by passing that <id> as `to`.",
		promptSnippet: "Message or control a peer pij session (reply to [pij from <id>])",
		promptGuidelines: [
			"Use pij_send to reply to a `[pij from <id>]` message or to message/control a peer — do not shell out to the `pij` CLI to send.",
		],
		parameters: Type.Object({
			to: Type.String({
				description:
					"Target peer session id, e.g. pij-1gzyr0p (the <id> from a `[pij from <id>]` message, or from `pij list --here`).",
			}),
			message: Type.Optional(
				Type.String({
					description:
						"Message text to deliver (appears to the peer as user input). Provide message OR command, not both.",
				}),
			),
			command: Type.Optional(
				StringEnum(ALLOWED_COMMANDS, {
					description:
						"Run an allow-listed control command on the peer instead of text: compact | new | reload. Provide message OR command, not both.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const message = typeof params.message === "string" ? params.message.trim() : "";
			const command = typeof params.command === "string" ? params.command : undefined;
			if (message.length > 0 === (command !== undefined)) {
				throw new Error("pij_send needs exactly one of `message` or `command`.");
			}
			const deps: CliDeps = {
				registry: new FsRegistry(pijHome),
				eventLogFor: (id) => new FsEventLog(pijHome, id),
				delivery: new FsChannel(pijHome),
				process: new NodeProcess(),
				cwd: ctx.cwd,
				pijHome,
			};
			const res = dispatch(
				{
					verb: "send",
					to: params.to,
					text: command === undefined ? message : undefined,
					command,
					wait: false,
					json: false,
				},
				deps,
			);
			if (res.exitCode !== 0) {
				throw new Error(res.stderr || `pij_send failed (exit ${res.exitCode})`);
			}
			return { content: [{ type: "text", text: res.stdout }], details: {} };
		},
	});

	// Per-session handles, (re)assigned on every session_start (all reasons).
	let session: PijSession | undefined;
	let registry: FsRegistry | undefined;
	let eventLog: FsEventLog | undefined;
	let self = "";
	let role: Role | undefined;
	let disposeWatch: (() => void) | undefined;
	let fallbackGeneration = 0;
	// Captured from pi's ExtensionCommandContext on each `/pij` run (the only
	// instant pi exposes newSession/reload). The receive watcher re-routes remote
	// new|reload onto this; undefined until armed / after a consuming op.
	let commandControl: CommandControl | undefined;

	// pij_spawn — open a new tmux window running a pij worker (T206).
	// Parameters: {task?, model?}; cwd from ctx.cwd (§M6). Thin pass-through of
	// session.spawn(); E-NOTMUX is returned by spawn() itself (§M5 / P8-testable).
	pi.registerTool({
		name: "pij_spawn",
		label: "pij spawn",
		description:
			"Spawn a new pij worker session running pi in tmux — by DEFAULT stacked in a ~1/3-width column on your right (main-left; the stack grows downward and evens itself, no cap), or pass layout:'window' for a background tmux window instead. Returns once the pane opens (fire-and-forget); the child announces via a ready-ping once booted. Requires an active tmux session.",
		promptSnippet: "Spawn a pij worker into the side stack (default) or a new tmux window",
		promptGuidelines: [
			"Use pij_spawn to start a new worker session. By default it lands in the side stack — a ~1/3-width column on your right that grows downward and evens itself (no pane cap). Pass layout:'window' to open a background tmux window instead. The child sends a ready-ping via the delivery channel when it has booted.",
		],
		parameters: Type.Object({
			task: Type.Optional(
				Type.String({
					description:
						"Initial task injected into the child session as its first prompt (via PIJ_SPAWN_TASK env; avoids the announce-race).",
				}),
			),
			model: Type.Optional(
				Type.String({
					description: "Model override for the child session (passed as --model).",
				}),
			),
			effort: Type.Optional(
				Type.String({
					description: "Reasoning effort override for the child session.",
				}),
			),
			layout: Type.Optional(
				Type.Union([Type.Literal("window"), Type.Literal("split")], {
					description:
						"Where to place the worker: 'split' (the DEFAULT — omitting behaves the same) stacks it in a ~1/3-width column on the caller's right (uncapped; the stack evens itself); 'window' opens a new background tmux window instead.",
				}),
			),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!session) throw new Error("pij_spawn: session not booted yet");
			const res = session.spawn({
				task: typeof params.task === "string" ? params.task : undefined,
				model: typeof params.model === "string" ? params.model : undefined,
				effort: typeof params.effort === "string" ? params.effort : undefined,
				layout: params.layout === "window" || params.layout === "split" ? params.layout : undefined,
				cwd: ctx.cwd, // §M6: cwd from tool execute context
			});
			if (!res.ok) {
				throw new Error(`pij_spawn failed (${res.code}): ${res.message}`);
			}
			return {
				content: [
					{
						type: "text",
						text: `spawned pij worker — spawnId=${res.value.spawnId} paneId=${res.value.paneId}${res.value.notice ? `\n${res.value.notice}` : ""}`,
					},
				],
				details: {},
			};
		},
	});

	// pij_close — kill a spawned worker's tmux window + remove its descriptor (T206).
	pi.registerTool({
		name: "pij_close",
		label: "pij close",
		description:
			"Close a pij worker session: kills its tmux window and removes it from the peer registry.",
		promptSnippet: "Close a pij worker session",
		promptGuidelines: [
			// FT-005: pij_spawn returns spawnId+paneId, NOT the child SessionId.
			// The child id arrives as [pij from <child-id>] or via pij list.
			"Use pij_close to terminate a spawned worker session. Pass the child session id from its ready-ping ([pij from <child-id>]) or from pij list; do not pass the spawnId.",
		],
		parameters: Type.Object({
			to: Type.String({
				description: "Session id of the worker to close (e.g. pij-1abc2de).",
			}),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			if (!session) throw new Error("pij_close: session not booted yet");
			const res = session.close(params.to);
			if (!res.ok) {
				throw new Error(`pij_close failed (${res.code}): ${res.message}`);
			}
			// FT-002: surface AC-06 non-owner warning to the caller.
			const text = res.value.warning
				? `closed pij worker: ${params.to}\n⚠️ ${res.value.warning}`
				: `closed pij worker: ${params.to}`;
			return {
				content: [{ type: "text", text }],
				details: {},
			};
		},
	});

	// Pattern P10: ONE session_start handler for every reason
	// (startup/reload/new/resume/fork). Boot is idempotent — reload reuses the
	// descriptor (no duplicate, no replay) and refreshes the live ctx.
	pi.on("session_start", async (event, ctx: ExtensionContext) => {
		// Derive a stable self-id from pi's OWN session identity (changes on /new
		// and /fork, stable across /reload and /resume) so a /new session becomes a
		// new peer instead of reusing this process's id (D-041). Falls back to the
		// OS pid when pi does not surface a session id (SDK/test). The extension is
		// the *producer* of PIJ_SESSION_ID; resolveSelf is the CLI's "which am I".
		const previousSelf = self; // module-scoped; holds the prior id across reload/new
		let piSessionId: string | undefined;
		try {
			piSessionId = ctx.sessionManager?.getSessionId();
		} catch {
			piSessionId = undefined; // stale/unavailable session manager
		}
		registry = new FsRegistry(pijHome);
		let durableDescriptor: SessionDescriptor | undefined;
		let reservationOwnerToken: string | undefined;
		if (piSessionId) {
			const allocated = registry.allocateIdentity(
				"pi",
				piSessionId,
				memorableIdentitySeed("pi", piSessionId),
				deriveSelfId(piSessionId, process.pid),
			);
			if (!allocated.ok) {
				ctx.ui.setStatus(PIJ_STATUS_KEY, "identity error");
				ctx.ui.notify(`pij: ${allocated.code} ${allocated.message}`, "error");
				throw new Error(`pij identity allocation error: ${allocated.message}`);
			}
			self = allocated.value.id;
			durableDescriptor = allocated.value.descriptor;
		} else if (previousSelf && event.reason !== "new" && event.reason !== "fork") {
			self = previousSelf;
		} else {
			fallbackGeneration += 1;
			reservationOwnerToken = `pi-fallback:${process.pid}:${fallbackGeneration}`;
			const reserved = registry.reserveMemorableId(
				`pi-fallback\0${process.pid}\0${fallbackGeneration}`,
				reservationOwnerToken,
				process.pid,
			);
			if (!reserved.ok) {
				ctx.ui.setStatus(PIJ_STATUS_KEY, "identity error");
				ctx.ui.notify(`pij: ${reserved.code} ${reserved.message}`, "error");
				throw new Error(`pij fallback identity allocation error: ${reserved.message}`);
			}
			self = reserved.value.id;
		}
		// OMP's default status line includes the session_name segment but renders
		// extension statuses on a separate row. Mirror the pij identity into that
		// native segment so the peer id remains visible in the actual bar.
		const hostExecutable = basename(process.execPath || process.argv[0] || "");
		const runtimeBin = process.env.OMPCODE === "1" || hostExecutable === "omp" ? "omp" : "pi";
		if (runtimeBin === "omp") {
			await pi.setSessionName(self);
		} else {
			ctx.ui.setStatus(PIJ_STATUS_KEY, self);
		}
		const envRole = process.env.PIJ_ROLE;
		role = envRole === "parent" || envRole === "worker" ? envRole : undefined;
		const dataDir = join(pijHome, self);
		const eventsPath = join(dataDir, "events.ndjson");
		const folder = process.cwd();
		const gitCommonDir = repositories.gitCommonDir(folder);
		// /new and /fork mint a fresh id => drop the prior session's descriptor so it
		// does not linger as a duplicate live peer (same pid, stale id). /reload keeps
		// the same id, so this is a no-op there.
		if (previousSelf && previousSelf !== self) {
			registry.remove(previousSelf);
		}
		eventLog = new FsEventLog(pijHome, self);
		// Poll-primary delivery: this live self-inbox watcher drops fs.watch (no-op
		// watchFactory) and drains via the 500ms poll — no silent FSEvents drop
		// under load, and prod == what the boot tests exercise (plan 057 thread-1).
		const channel = new FsChannel(pijHome, pollPrimaryWatchOpts());
		session = new PijSession({
			registry,
			eventLog,
			delivery: channel,
			pi: new PiRuntimeAdapter(pi, ctx, () => commandControl),
			process: new NodeProcess(),
			tmux: new TmuxAdapter(),
			watchdog: new FsWatchdogStore(pijHome),
			expectations: new FsSpawnExpectationStore(pijHome),
			models: loadModels(),
		});

		const boot = session.boot({
			id: self,
			role,
			folder,
			dataDir,
			eventsPath,
			harness: "pi",
			harnessSessionId: piSessionId,
			runtimeBin,
			paneId: process.env.TMUX_PANE,
			...(process.env.PIJ_PARENT_ID !== undefined ? { parentId: process.env.PIJ_PARENT_ID } : {}),
			...(gitCommonDir !== null ? { gitCommonDir } : {}),
			durableDescriptor,
			resetRuntimeState: event.reason !== "reload",
		});
		if (reservationOwnerToken) {
			const consumed = registry.consumeReservation(boot.id, reservationOwnerToken);
			if (!consumed.ok) {
				throw new Error(`pij fallback reservation error: ${consumed.message}`);
			}
		}

		// Export self-id (+ role) so a child `pij` CLI under a shared cwd resolves
		// "self" unambiguously (finding 07). NB: env->child inheritance itself is
		// proven by the Phase-5 smoke, not the fakes.
		process.env.PIJ_SESSION_ID = boot.id;
		if (boot.role) process.env.PIJ_ROLE = boot.role;

		// Receive loop. Durable read markers own cross-start/reload history; the
		// process-local `seen` set remains only the fs.watch/poll watermark.
		const inbox = join(dataDir, "inbox");
		mkdirSync(inbox, { recursive: true });
		const unread = channel.listUnread(self);
		if (!unread.ok) {
			throw new Error(`pij inbox initialization error: ${unread.message}`);
		}
		const unreadNames = new Set(unread.value.map((message) => `msg-${message.messageId}.json`));
		const seen = new Set(
			readdirSync(inbox).filter(
				(name) => name.startsWith("msg-") && name.endsWith(".json") && !unreadNames.has(name),
			),
		);
		disposeWatch?.(); // reload: drop the prior watcher before opening a new one
		// Delivery ownership (Plan 019, finding 01/06, AC-08): this in-process
		// receiver watches ONLY its OWN inbox (`self`) and is the SOLE consumer of
		// a pi session's inbox — `pi.sendUserMessage` is the one immovable seam. The
		// daemon never injects into pi (it `observe`s pi inboxes for the TUI and
		// consumes only tmux harnesses' inboxes), so there is no double-processing.
		const receiver = session;
		disposeWatch = channel.watch(
			self,
			(dm) => {
				receiver.onInbound(dm, dm.messageId);
				const marked = channel.markRead(self, dm.messageId, {
					messageId: dm.messageId,
					readAt: new Date().toISOString(),
					reader: self,
				});
				if (!marked.ok) {
					throw new Error(`pij inbox mark-read error: ${marked.message}`);
				}
			},
			seen,
			// Poll-primary liveness heartbeat (plan 057 thread-1): stamp on every
			// delivery poll scan; PijSession persists it at the coarse ~2500ms cadence.
			(atMs) => receiver.noteInboxScan(atMs),
		);
	});

	// Event capture (registered once, top-level — reload-safe). Each pi event maps
	// to exactly one coordinator capture. There is no pi `usage` event.
	pi.on("tool_call", (event) => {
		session?.capture("tool_call", event);
		return guardInvariantNineModal(registry?.read(self), event.toolName);
	});
	pi.on("tool_result", (event) => session?.capture("tool_result", event));
	pi.on("message_end", (event) => session?.capture("message", event));

	// turn_start resolves any queued (steered) delivery receipt -> delivered
	// (finding 08). timestamp is epoch ms; the coordinator speaks ISO.
	pi.on("turn_start", (event) => session?.onTurnStart(new Date(event.timestamp).toISOString()));

	// turn_end flips the descriptor back to idle (D-A) so `pij state` reads
	// working/idle without parsing the stream.
	pi.on("turn_end", () => session?.onTurnEnd());

	pi.on("session_shutdown", async (event, ctx: ExtensionContext) => {
		disposeWatch?.();
		disposeWatch = undefined;
		// Pi guarantees this closed union (extensions.md, session_shutdown): only
		// replacement reasons dissolve a predecessor; quit remains observable.
		session?.shutdown(event.reason);
		ctx.ui.setStatus(PIJ_STATUS_KEY, undefined);
	});

	pi.registerCommand("pij", {
		description: "pij peer messaging — self id, role, live peers, captured events",
		handler: async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
			if (!registry || !eventLog || !self) {
				ctx.ui.notify("pij: not booted yet", "info");
				return;
			}
			// Arm the command-control channel: this ctx is an ExtensionCommandContext,
			// the one place pi hands out newSession/reload. Capture it so the receive
			// watcher can fire remote new|reload, then drain anything queued while
			// un-armed.
			commandControl = {
				newSession: () => {
					void ctx.newSession();
				},
				reload: () => {
					void ctx.reload();
				},
			};
			const applied = session?.applyPendingControl() ?? [];
			const peers = registry.list().filter((d) => d.id !== self).length;
			const appliedNote = applied.length > 0 ? ` · applied ${applied.join("+")}` : "";
			ctx.ui.notify(
				`pij: ${self} · role=${role ?? "peer"} · peers ${peers} · events ${eventLog.count()}${appliedNote}`,
				"info",
			);
		},
	});
}
