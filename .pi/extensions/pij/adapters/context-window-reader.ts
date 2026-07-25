// pij-control-plane — tmux-backed effective context-window observation.

import { execFileSync } from "node:child_process";
import {
	type ContextWindowObservation,
	type ContextWindowReaderPort,
	contextWindowFromPane,
} from "../core/context/window.js";
import type { SessionDescriptor } from "../core/types.js";

export class TmuxContextWindowReader implements ContextWindowReaderPort {
	read(descriptor: SessionDescriptor): ContextWindowObservation | null {
		if (descriptor.paneId === undefined) return null;
		try {
			const pane = execFileSync(
				"tmux",
				["capture-pane", "-p", "-t", descriptor.paneId, "-S", "-120"],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
			);
			return contextWindowFromPane(pane);
		} catch {
			return null;
		}
	}
}
