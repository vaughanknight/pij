// pij-messaging — PiRuntimePort adapter.
//
// ⚠️ THE ONLY FILE under .pi/extensions/pij/ that imports @earendil-works/*.
// Everything in core/ stays pi-free (Patterns P2/P9); this adapter is the
// single seam where the pure core meets the live pi session.
//
// Logic is lifted verbatim from the proven scratch prototype
// (scratch/messenger_test/messenger.ts, finding 01): idle → sendUserMessage
// (triggers a turn); busy → sendUserMessage(text, { deliverAs: "steer" })
// (queued after the current turn). isIdle()/compact() read from the live
// ExtensionContext.
//
// Note: in Phase 3 wiring, isIdle()/compact() need the *current* per-event
// context. The extension constructs/refreshes this adapter with the active
// ctx; here the contract shape is what matters (Phase-2 typecheck target).

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PiRuntimePort } from "../core/ports.js";

/** The command-context-only session-control ops, captured from pi's
 *  ExtensionCommandContext the moment the `/pij` command runs (the single
 *  instant pi exposes them). index.ts owns the live holder; null until armed. */
export interface CommandControl {
	newSession(): void;
	reload(): void;
}

export class PiRuntimeAdapter implements PiRuntimePort {
	constructor(
		private readonly pi: ExtensionAPI,
		private readonly ctx: ExtensionContext,
		/** Reads the currently-armed command control, or undefined if no `/pij`
		 *  invocation has captured one yet (or it was consumed by a prior op). */
		private readonly controlRef: () => CommandControl | undefined = () => undefined,
	) {}

	isIdle(): boolean {
		return this.ctx.isIdle();
	}

	inject(text: string, mode: "immediate" | "steer"): void {
		if (mode === "steer") {
			this.pi.sendUserMessage(text, { deliverAs: "steer" });
		} else {
			this.pi.sendUserMessage(text);
		}
	}

	compact(): void {
		this.ctx.compact();
	}

	control(command: "new" | "reload"): boolean {
		const c = this.controlRef();
		if (!c) return false;
		if (command === "new") c.newSession();
		else c.reload();
		return true;
	}
}
