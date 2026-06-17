import { mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import type { CommandControl } from "./adapters/pi-runtime.js";
import { PiRuntimeAdapter } from "./adapters/pi-runtime.js";
import { NodeProcess } from "./adapters/process.js";
import { type CliDeps, dispatch } from "./core/cli.js";
import { ALLOWED_COMMANDS } from "./core/commands.js";
import { deriveSelfId, isSubagentChild } from "./core/discovery.js";
import { PijSession } from "./core/session.js";
import type { Role } from "./core/types.js";

// pij — peer session messaging + observability.
//
// Thin pi-event -> coordinator translator (Patterns P2/P8/P10): owns NO logic.
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
	// Captured from pi's ExtensionCommandContext on each `/pij` run (the only
	// instant pi exposes newSession/reload). The receive watcher re-routes remote
	// new|reload onto this; undefined until armed / after a consuming op.
	let commandControl: CommandControl | undefined;

	// Pattern P10: ONE session_start handler for every reason
	// (startup/reload/new/resume/fork). Boot is idempotent — reload reuses the
	// descriptor (no duplicate, no replay) and refreshes the live ctx.
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
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
		self = deriveSelfId(piSessionId, process.pid);
		const envRole = process.env.PIJ_ROLE;
		role = envRole === "parent" || envRole === "worker" ? envRole : undefined;
		const dataDir = join(pijHome, self);
		const eventsPath = join(dataDir, "events.ndjson");

		registry = new FsRegistry(pijHome);
		// /new and /fork mint a fresh id => drop the prior session's descriptor so it
		// does not linger as a duplicate live peer (same pid, stale id). /reload keeps
		// the same id, so this is a no-op there.
		if (previousSelf && previousSelf !== self) {
			registry.remove(previousSelf);
		}
		eventLog = new FsEventLog(pijHome, self);
		const channel = new FsChannel(pijHome);
		session = new PijSession({
			registry,
			eventLog,
			delivery: channel,
			pi: new PiRuntimeAdapter(pi, ctx, () => commandControl),
			process: new NodeProcess(),
		});

		const boot = session.boot({ id: self, role, folder: process.cwd(), dataDir, eventsPath });

		// Export self-id (+ role) so a child `pij` CLI under a shared cwd resolves
		// "self" unambiguously (finding 07). NB: env->child inheritance itself is
		// proven by the Phase-5 smoke, not the fakes.
		process.env.PIJ_SESSION_ID = boot.id;
		if (boot.role) process.env.PIJ_ROLE = boot.role;

		// Receive loop. Seed `seen` with the inbox's current contents so a reload
		// does not replay history; the watcher drains new msg-*.json thereafter.
		const inbox = join(dataDir, "inbox");
		mkdirSync(inbox, { recursive: true });
		const seen = new Set(
			readdirSync(inbox).filter((n) => n.startsWith("msg-") && n.endsWith(".json")),
		);
		disposeWatch?.(); // reload: drop the prior watcher before opening a new one
		disposeWatch = channel.watch(self, (dm) => session?.onInbound(dm, dm.messageId), seen);
	});

	// Event capture (registered once, top-level — reload-safe). Each pi event maps
	// to exactly one coordinator capture. There is no pi `usage` event.
	pi.on("tool_call", (event) => session?.capture("tool_call", event));
	pi.on("tool_result", (event) => session?.capture("tool_result", event));
	pi.on("message_end", (event) => session?.capture("message", event));

	// turn_start resolves any queued (steered) delivery receipt -> delivered
	// (finding 08). timestamp is epoch ms; the coordinator speaks ISO.
	pi.on("turn_start", (event) => session?.onTurnStart(new Date(event.timestamp).toISOString()));

	// turn_end flips the descriptor back to idle (D-A) so `pij state` reads
	// working/idle without parsing the stream.
	pi.on("turn_end", () => session?.onTurnEnd());

	pi.on("session_shutdown", async () => {
		disposeWatch?.();
		disposeWatch = undefined;
		session?.shutdown();
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
