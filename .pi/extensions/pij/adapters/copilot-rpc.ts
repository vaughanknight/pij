// pij-messaging — deliver to a Copilot CLI seat over its embedded JSON-RPC server.
//
// A Copilot seat spawned with `--ui-server --port <P>` (hidden flag, 1.0.81)
// runs the SAME TUI plus a loopback JSON-RPC server (vscode-jsonrpc,
// `Content-Length` framing) that registers the TUI's own session. Method
// `session.send {sessionId, prompt, mode}`: `enqueue` appends to the session
// queue (starts a turn when idle), `immediate` interjects at the next boundary
// of an in-flight turn. Verified live 2026-08-27: a 3 KB / 31-line body landed
// byte-exact as a `user.message` in the seat's events.jsonl and the model
// acknowledged it. A seat launched WITHOUT the flag has no endpoint at all
// (lsof-verified), so `rpcPort` on the descriptor is the capability signal.
//
// Async (`net` directly), like claude-socket.ts.

import { createConnection } from "node:net";
import { frame } from "../core/message.js";
import type { SessionId } from "../core/types.js";

export type CopilotSendMode = "enqueue" | "immediate";

export interface CopilotRpcSendResult {
	readonly outcome: "confirmed" | "failed";
	readonly messageId?: string;
	readonly detail?: string;
}

/** The prompt text a Copilot seat receives — the same `[pij from <id>] body`
 *  envelope every other transport uses, so `parseFrame` keeps working. */
export function buildCopilotPrompt(from: SessionId, body: string): string {
	return frame(from, body);
}

let rpcSeq = 0;

/** `session.send` to the seat's embedded server. `confirmed` = the server
 *  returned a `messageId` for our prompt (it is now in the seat's own queue —
 *  durable in-process, rendered by the TUI). `failed` = no endpoint / refused /
 *  timeout; nothing landed, safe to retry. Never throws. */
export function sendCopilotRpc(input: {
	readonly port: number;
	readonly sessionId: string;
	readonly prompt: string;
	readonly mode?: CopilotSendMode;
	readonly timeoutMs?: number;
}): Promise<CopilotRpcSendResult> {
	rpcSeq += 1;
	const id = `pij-${process.pid}-${rpcSeq}`;
	const req = {
		jsonrpc: "2.0",
		id,
		method: "session.send",
		params: { sessionId: input.sessionId, prompt: input.prompt, mode: input.mode ?? "enqueue" },
	};
	const body = Buffer.from(JSON.stringify(req), "utf8");
	return new Promise((resolve) => {
		let settled = false;
		let buf = Buffer.alloc(0);
		const c = createConnection({ host: "127.0.0.1", port: input.port });
		const done = (r: CopilotRpcSendResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			c.destroy();
			resolve(r);
		};
		const timer = setTimeout(
			() => done({ outcome: "failed", detail: "timeout waiting for session.send response" }),
			input.timeoutMs ?? 5_000,
		);
		c.on("error", (e) =>
			done({ outcome: "failed", detail: String((e as NodeJS.ErrnoException).code ?? e) }),
		);
		c.on("connect", () => {
			c.write(`Content-Length: ${body.length}\r\n\r\n`);
			c.write(body);
		});
		c.on("data", (d) => {
			buf = Buffer.concat([buf, d]);
			for (;;) {
				const sep = buf.indexOf("\r\n\r\n");
				if (sep < 0) return;
				const m = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0, sep).toString());
				if (!m) return done({ outcome: "failed", detail: "bad frame header" });
				const len = Number(m[1]);
				if (buf.length < sep + 4 + len) return;
				let msg: { id?: unknown; result?: { messageId?: string }; error?: { message?: string } };
				try {
					msg = JSON.parse(buf.subarray(sep + 4, sep + 4 + len).toString());
				} catch {
					return done({ outcome: "failed", detail: "bad frame body" });
				}
				buf = buf.subarray(sep + 4 + len);
				if (msg.id !== id) continue; // a server notification — keep reading
				if (msg.error) return done({ outcome: "failed", detail: msg.error.message ?? "rpc error" });
				if (msg.result?.messageId) {
					return done({ outcome: "confirmed", messageId: msg.result.messageId });
				}
				return done({ outcome: "failed", detail: "response without messageId" });
			}
		});
	});
}
