import { mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { PiRuntimeAdapter } from "./adapters/pi-runtime.js";
import { NodeProcess } from "./adapters/process.js";
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
	const pijHome = join(homedir(), ".pij");

	// Per-session handles, (re)assigned on every session_start (all reasons).
	let session: PijSession | undefined;
	let registry: FsRegistry | undefined;
	let eventLog: FsEventLog | undefined;
	let self = "";
	let role: Role | undefined;
	let disposeWatch: (() => void) | undefined;

	// Pattern P10: ONE session_start handler for every reason
	// (startup/reload/new/resume/fork). Boot is idempotent — reload reuses the
	// descriptor (no duplicate, no replay) and refreshes the live ctx.
	pi.on("session_start", async (_event, ctx: ExtensionContext) => {
		// Derive a stable self-id from this OS process (always present, even on
		// first boot; identical across /reload since it's the same process), so
		// boot never depends on resolveSelf — that is the CLI's "which am I"
		// resolver, and the extension is the *producer* of PIJ_SESSION_ID.
		self = `pij-${process.pid}`;
		const envRole = process.env.PIJ_ROLE;
		role = envRole === "parent" || envRole === "worker" ? envRole : undefined;
		const dataDir = join(pijHome, self);
		const eventsPath = join(dataDir, "events.ndjson");

		registry = new FsRegistry(pijHome);
		eventLog = new FsEventLog(pijHome, self);
		const channel = new FsChannel(pijHome);
		session = new PijSession({
			registry,
			eventLog,
			delivery: channel,
			pi: new PiRuntimeAdapter(pi, ctx),
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
			const peers = registry.list().filter((d) => d.id !== self).length;
			ctx.ui.notify(
				`pij: ${self} · role=${role ?? "peer"} · peers ${peers} · events ${eventLog.count()}`,
				"info",
			);
		},
	});
}
