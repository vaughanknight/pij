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
	readonly outcome: "confirmed" | "unverified" | "failed";
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
 *  returned a `messageId`; `unverified` = the request flushed but its response
 *  was lost; `failed` = no request landed or the server explicitly refused it.
 *  Never throws. */
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
		let wrote = false;
		let buf = Buffer.alloc(0);
		const c = createConnection({ host: "127.0.0.1", port: input.port });
		const done = (r: CopilotRpcSendResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			c.destroy();
			resolve(r);
		};
		const ambiguousFailure = (detail: string): void => {
			done({ outcome: wrote ? "unverified" : "failed", detail });
		};
		const timer = setTimeout(
			() => ambiguousFailure("timeout waiting for session.send response"),
			input.timeoutMs ?? 5_000,
		);
		c.on("error", (e) => ambiguousFailure(String((e as NodeJS.ErrnoException).code ?? e)));
		c.on("connect", () => {
			const request = Buffer.concat([
				Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"),
				body,
			]);
			c.write(request, (err) => {
				if (err) return done({ outcome: "failed", detail: String(err) });
				wrote = true;
			});
		});
		c.on("data", (d) => {
			buf = Buffer.concat([buf, d]);
			for (;;) {
				const sep = buf.indexOf("\r\n\r\n");
				if (sep < 0) return;
				const m = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0, sep).toString());
				if (!m) return ambiguousFailure("bad frame header");
				const len = Number(m[1]);
				if (buf.length < sep + 4 + len) return;
				let msg: { id?: unknown; result?: { messageId?: string }; error?: { message?: string } };
				try {
					msg = JSON.parse(buf.subarray(sep + 4, sep + 4 + len).toString());
				} catch {
					return ambiguousFailure("bad frame body");
				}
				buf = buf.subarray(sep + 4 + len);
				if (msg.id !== id) continue; // a server notification — keep reading
				if (msg.error) return done({ outcome: "failed", detail: msg.error.message ?? "rpc error" });
				if (msg.result?.messageId) {
					return done({ outcome: "confirmed", messageId: msg.result.messageId });
				}
				return ambiguousFailure("response without messageId");
			}
		});
	});
}

export interface CopilotReadyResult {
	readonly ready: boolean;
	readonly detail?: string;
}

/** Readiness probe before the FIRST RPC delivery to a copilot seat (PoC day-2
 *  item 9). A fresh session can return a messageId from `session.send` while its
 *  model turn is still hung at boot (observed once after an MCP reload: 0 AIC,
 *  pending). `session.getForeground` only answers with the session once the TUI
 *  has finished registering it, so a matching foreground id is a positive
 *  "the composer will actually process input" signal. `ready:false` (no answer,
 *  or a different/undefined foreground) → the caller leaves the message queued
 *  and retries next tick instead of sending into a hang. Never throws. */
export function probeCopilotReady(input: {
	readonly port: number;
	readonly sessionId: string;
	readonly timeoutMs?: number;
}): Promise<CopilotReadyResult> {
	rpcSeq += 1;
	const id = `pij-ready-${process.pid}-${rpcSeq}`;
	const body = Buffer.from(
		JSON.stringify({ jsonrpc: "2.0", id, method: "session.getForeground", params: {} }),
		"utf8",
	);
	return new Promise((resolve) => {
		let settled = false;
		let buf = Buffer.alloc(0);
		const c = createConnection({ host: "127.0.0.1", port: input.port });
		const done = (r: CopilotReadyResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			c.destroy();
			resolve(r);
		};
		const timer = setTimeout(
			() => done({ ready: false, detail: "getForeground timeout" }),
			input.timeoutMs ?? 3_000,
		);
		c.on("error", (e) =>
			done({ ready: false, detail: String((e as NodeJS.ErrnoException).code ?? e) }),
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
				if (!m) return done({ ready: false, detail: "bad frame header" });
				const len = Number(m[1]);
				if (buf.length < sep + 4 + len) return;
				let msg: { id?: unknown; result?: { sessionId?: string } };
				try {
					msg = JSON.parse(buf.subarray(sep + 4, sep + 4 + len).toString());
				} catch {
					return done({ ready: false, detail: "bad frame body" });
				}
				buf = buf.subarray(sep + 4 + len);
				if (msg.id !== id) continue; // a notification — keep reading
				const fg = msg.result?.sessionId;
				if (fg === input.sessionId) return done({ ready: true });
				return done({ ready: false, detail: `foreground=${fg ?? "none"} (booting)` });
			}
		});
	});
}
