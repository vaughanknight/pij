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
import {
	decodeKittyPrintable,
	getKeybindings,
	isKeyRelease,
	matchesKey,
	parseKey,
} from "@earendil-works/pi-tui";
import type { PiRuntimePort } from "../core/ports.js";

/** The command-context-only session-control ops, captured from pi's
 *  ExtensionCommandContext the moment the `/pij` command runs (the single
 *  instant pi exposes them). index.ts owns the live holder; null until armed. */
export interface CommandControl {
	newSession(): void;
	reload(): void;
}

type RuntimeContext = Pick<ExtensionContext, "isIdle" | "compact"> & {
	readonly ui: Pick<
		ExtensionContext["ui"],
		"onTerminalInput" | "getEditorText" | "setStatus" | "notify"
	>;
};

export class PiRuntimeAdapter implements PiRuntimePort {
	constructor(
		private readonly pi: Pick<ExtensionAPI, "sendUserMessage">,
		private readonly ctx: RuntimeContext,
		/** Reads the currently-armed command control, or undefined if no `/pij`
		 *  invocation has captured one yet (or it was consumed by a prior op). */
		private readonly controlRef: () => CommandControl | undefined = () => undefined,
		private readonly clock: () => number = () => Date.now(),
	) {}

	isIdle(): boolean {
		return this.ctx.isIdle();
	}

	getEditorText(): string {
		return this.ctx.ui.getEditorText();
	}

	/** Count edit-capable input, not activity. Clipboard/external-editor actions
	 * can finish asynchronously, so a same-turn text comparison would miss them.
	 * The hold decision independently samples the current draft. */
	onEditorChange(cb: (at: number) => void): () => void {
		const editKeys = Object.entries(getKeybindings().getResolvedBindings()).flatMap(
			([action, keys]) =>
				/^(?:tui\.editor\.(?:delete|yank|undo)|tui\.input\.(?:newLine|submit|tab)$|app\.(?:clipboard\.paste|editor\.external$))/.test(
					action,
				)
					? typeof keys === "string"
						? [keys]
						: (keys ?? [])
					: [],
		);
		return this.ctx.ui.onTerminalInput((data) => {
			if (isKeyRelease(data)) return undefined;
			const key = parseKey(data);
			// Pi's public decoder only accepts CSI-u; OMP also accepts modifyOtherKeys.
			const legacy = data.startsWith("\u001b[27;") ? /^(\d+);(\d+)~$/.exec(data.slice(5)) : null;
			const printable = decodeKittyPrintable(legacy ? `\u001b[${legacy[2]};${legacy[1]}u` : data);
			if (
				data.startsWith("\u001b[200~") ||
				(!data.includes("\u001b") && /[^\p{Cc}]/u.test(data)) ||
				(printable !== undefined && !/[\p{Cc}\p{Co}]/u.test(printable)) ||
				/^(?:shift\+)?(?:.|space)$/u.test(key ?? "") ||
				editKeys.some((binding) => matchesKey(data, binding))
			)
				cb(this.clock());
			return undefined;
		});
	}

	/** Arrival becomes OBSERVABLE here. Delivery to a busy seat already happened;
	 * a steered message just is not on screen until the step boundary, which on a
	 * slow model is minutes of the human believing nothing came. */
	notify(text: string, level: "info" | "warning" | "error" = "info"): void {
		this.ctx.ui.notify(text, level);
	}

	setStatus(text: string | undefined): void {
		this.ctx.ui.setStatus("pij-held", text);
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
