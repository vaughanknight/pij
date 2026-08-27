// pij-messaging — Codex app-server delivery (frame builders; PoC day-2 item 8).
//
// STATUS: BUILT (frame builders + fake-server test), NOT LIVE-PROVEN. The Codex
// CLI on this machine cannot run — `@openai/codex@0.98.0` is installed but its
// vendor binary is missing (`spawn …/vendor/aarch64-apple-darwin/codex/codex
// ENOENT`), so `codex app-server` never starts and no live turn can be steered.
// See reports/pij-comms-review-2026-08-27.md §13 for the repair needed.
//
// Design (from sub-seat (e), reports/…/e-copilot-codex-ipc.md): a Codex seat
// pij OWNS is launched as `codex app-server --listen unix://<sock>` with the
// pane running `codex --remote unix://<sock>`; the daemon opens a SECOND
// websocket client on the same socket (HTTP Upgrade) and calls, per JSON-RPC:
//   - `turn/start`  when the thread is idle (starts a new user turn), or
//   - `turn/steer`  when a turn is in flight (appends user input to it).
// `thread/read` reports `canAcceptDirectInput`, which selects between the two.
// The `"jsonrpc":"2.0"` field is omitted on the wire (README). Unlike Claude's
// inbox socket and Copilot's --ui-server, this needs pij to own the process
// topology, so it is NOT wired into the current drain — codex seats stay on the
// pointer path until the topology and a live codex exist.

import { frame } from "../core/message.js";
import type { SessionId } from "../core/types.js";

export type CodexTurnMethod = "turn/start" | "turn/steer";

export interface CodexRpcRequest {
	readonly id: string;
	readonly method: CodexTurnMethod;
	readonly params: Record<string, unknown>;
}

/** The prompt text a Codex seat receives — the same `[pij from <id>] body`
 *  envelope every other transport uses. */
export function buildCodexPrompt(from: SessionId, body: string): string {
	return frame(from, body);
}

/** Build the request for delivering `body` to a codex thread. `canAcceptDirectInput`
 *  (from `thread/read`) picks steer-into-current-turn vs start-a-new-turn. The
 *  input is Codex's `[{type:"text",text}]` shape; `expectedTurnId` scopes a steer
 *  to the turn the caller last saw (optimistic concurrency). */
export function buildCodexDelivery(input: {
	readonly threadId: string;
	readonly from: SessionId;
	readonly body: string;
	readonly turnInFlight: boolean;
	readonly clientMessageId: string;
	readonly expectedTurnId?: string;
}): CodexRpcRequest {
	const text = buildCodexPrompt(input.from, input.body);
	const messageInput = [{ type: "text", text }];
	if (input.turnInFlight) {
		return {
			id: input.clientMessageId,
			method: "turn/steer",
			params: {
				threadId: input.threadId,
				clientUserMessageId: input.clientMessageId,
				input: messageInput,
				...(input.expectedTurnId !== undefined ? { expectedTurnId: input.expectedTurnId } : {}),
			},
		};
	}
	return {
		id: input.clientMessageId,
		method: "turn/start",
		params: {
			threadId: input.threadId,
			clientUserMessageId: input.clientMessageId,
			input: messageInput,
		},
	};
}

/** Serialize a request to the wire form the app-server expects: JSON-RPC with
 *  the `jsonrpc` field omitted (README), one message per websocket text frame. */
export function encodeCodexRequest(req: CodexRpcRequest): string {
	return JSON.stringify({ id: req.id, method: req.method, params: req.params });
}
