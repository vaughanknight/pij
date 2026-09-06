// pij-messaging — PiRuntimePort adapter.
//
// ⚠️ THE ONLY FILE under .pi/extensions/pij/ that imports @earendil-works/*.
// Everything in core/ stays pi-free (Patterns P2/P9); this adapter is the
// single seam where the pure core meets the live pi session.
//
// OMP custom messages bypass its user-message editor clearing; Pi retains its
// existing user-message API. Both start a turn when idle and steer when busy.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { PiRuntimePort } from "../core/ports.js";

/** The command-context-only session-control ops, captured from pi's
 *  ExtensionCommandContext the moment the `/pij` command runs (the single
 *  instant pi exposes them). index.ts owns the live holder; null until armed. */
export interface CommandControl {
	newSession(): void;
	reload(): void;
}

type RuntimeContext = Pick<ExtensionContext, "isIdle" | "compact"> & {
	readonly ui: Pick<ExtensionContext["ui"], "setStatus" | "notify">;
};

export class PiRuntimeAdapter implements PiRuntimePort {
	constructor(
		private readonly pi: Pick<ExtensionAPI, "sendUserMessage" | "sendMessage">,
		private readonly ctx: RuntimeContext,
		private readonly runtimeBin: "pi" | "omp",
		/** Reads the currently-armed command control, or undefined if no `/pij`
		 *  invocation has captured one yet (or it was consumed by a prior op). */
		private readonly controlRef: () => CommandControl | undefined = () => undefined,
	) {}

	isIdle(): boolean {
		return this.ctx.isIdle();
	}

	/** Arrival becomes OBSERVABLE here. Delivery to a busy seat already happened;
	 * a steered message just is not on screen until the step boundary, which on a
	 * slow model is minutes of the human believing nothing came. */
	notify(text: string, level: "info" | "warning" | "error" = "info"): void {
		this.ctx.ui.notify(text, level);
	}

	setStatus(text: string | undefined): void {
		this.ctx.ui.setStatus("pij-mail", text);
	}

	inject(text: string, mode: "immediate" | "steer"): void {
		if (this.runtimeBin === "omp") {
			// OMP's message_start clears the editor for external user messages.
			// Its public custom-message path renders and prompts without doing so.
			// triggerTurn also covers a busy -> idle race before async submission.
			this.pi.sendMessage(
				{ customType: "pij", content: text, display: true },
				{ triggerTurn: true, deliverAs: "steer" },
			);
		} else if (mode === "steer") {
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
