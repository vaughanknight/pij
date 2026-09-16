// pij-control-plane — per-harness bad-model detector (pure, T010).
//
// Operates on capturePane text (not process stderr). Each harness surfaces
// a bad-model 400 differently:
//   claude:  "API Error: 400" + not_found_error body (→ also classifyReadiness "dead")
//   copilot: "Error: 400" or "model not supported" in pane text
//   pi:      "isError: true" + model-error body
//   codex:   similar to copilot (HTTP 400 body)

import type { DeathReason } from "../types.js";
import type { HarnessKind } from "./types.js";

export interface BadModelDetection {
	readonly detected: boolean;
	readonly reason?: DeathReason;
}

const NOT_DETECTED: BadModelDetection = { detected: false };

// Patterns shared across harnesses
const MODEL_NOT_FOUND_RE =
	/not_found_error|model.*not found|invalid_model|model.*does not exist|unknown model|model.*unavailable|model not supported/i;
const HTTP_400_RE = /API Error:\s*400|Error:\s*400|400\s+Bad Request/i;

/** Extract the actual model id from the harness footer after first inference.
 *  Copilot CLI appends the model name to the end of the status bar with leading
 *  whitespace: `/ commands · ? help · tab next tab   GPT-5.5`.
 *  Claude prepends it before the ready marker: `claude-opus-4-5 · bypass permissions on`.
 *  Returns undefined when no model marker is visible. */
export function extractBoundModel(harness: HarnessKind, pane: string): string | undefined {
	if (harness === "copilot") {
		const m = /\s{2,}([\w][\w.-]*)[ \t]*$/.exec(pane);
		return m?.[1];
	}
	// Claude: model name precedes the · ready marker
	const m = /\b(claude[-\w]+)[ \t]*[·•]/i.exec(pane);
	return m?.[1];
}

/** Detect a bad-model error in a captured pane for the given harness. Pure. */
export function detectBadModelInPane(harness: HarnessKind, pane: string): BadModelDetection {
	switch (harness) {
		case "claude":
			// claude shows "API Error: 400 {…not_found_error…}" then the pane dies
			if (MODEL_NOT_FOUND_RE.test(pane) || HTTP_400_RE.test(pane)) {
				return { detected: true, reason: "model-not-supported" };
			}
			return NOT_DETECTED;

		case "copilot":
		case "pi":
			// copilot/pi show "Error: 400" or "model not supported" / "isError: true"
			if (
				MODEL_NOT_FOUND_RE.test(pane) ||
				HTTP_400_RE.test(pane) ||
				/isError:\s*true/i.test(pane)
			) {
				return { detected: true, reason: "model-not-supported" };
			}
			return NOT_DETECTED;

		default:
			return NOT_DETECTED;
	}
}
