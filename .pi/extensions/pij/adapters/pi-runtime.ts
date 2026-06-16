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

export class PiRuntimeAdapter implements PiRuntimePort {
	constructor(
		private readonly pi: ExtensionAPI,
		private readonly ctx: ExtensionContext,
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
}
