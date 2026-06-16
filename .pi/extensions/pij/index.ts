import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// pij — peer session messaging + observability.
//
// Phase 1 ships the pi-free core (./core/*) + fake adapters (./adapters/fakes.ts)
// with full unit coverage. The real wiring below (registry write + boot
// self-announce + delivery injector + event capture, plus the PIJ_SESSION_ID
// env export) lands in Phase 3 against the same ports — this file is a
// deliberate stub until then.

export default function (pi: ExtensionAPI) {
	// Pattern P10: one handler for session_start, all reasons.
	pi.on("session_start", async (_event, _ctx: ExtensionContext) => {
		// Phase 3: write registry descriptor, export PIJ_SESSION_ID/PIJ_ROLE,
		// inject the boot self-announce, and begin event capture.
	});

	pi.registerCommand("pij", {
		description: "pij peer messaging (wiring lands in Phase 3)",
		handler: async (args: string, ctx: ExtensionCommandContext): Promise<void> => {
			ctx.ui.notify(`pij: not implemented (got: ${args})`, "info");
		},
	});
}
