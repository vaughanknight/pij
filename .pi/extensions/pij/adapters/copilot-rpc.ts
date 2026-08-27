// pij-messaging — deliver to a Copilot CLI seat over its embedded JSON-RPC server (PoC).
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
// Synchronous like claude-socket.ts (the drain loop is sync): one short-lived
// node child per send.

import { spawnSync } from "node:child_process";
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

// Child: connect to 127.0.0.1:<port>, send one `session.send`, wait for the
// response with our id (skipping server notifications), print JSON, exit 0.
const CHILD = `
const net = require("node:net");
const [port, timeoutMs] = process.argv.slice(1);
let req = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { req += d; });
process.stdin.on("end", () => {
  const body = Buffer.from(req, "utf8");
  const wantId = JSON.parse(req).id;
  const c = net.createConnection({ host: "127.0.0.1", port: Number(port) });
  let buf = Buffer.alloc(0);
  const done = (code, out) => { try { c.destroy(); } catch {} process.stdout.write(out); process.exit(code); };
  const timer = setTimeout(() => done(3, JSON.stringify({ error: "timeout waiting for session.send response" })), Number(timeoutMs));
  c.on("error", (e) => { clearTimeout(timer); done(1, JSON.stringify({ error: String(e && e.code || e) })); });
  c.on("connect", () => { c.write("Content-Length: " + body.length + "\\r\\n\\r\\n"); c.write(body); });
  c.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const sep = buf.indexOf("\\r\\n\\r\\n");
      if (sep < 0) return;
      const head = buf.slice(0, sep).toString();
      const m = /Content-Length:\\s*(\\d+)/i.exec(head);
      if (!m) { done(1, JSON.stringify({ error: "bad frame header" })); return; }
      const len = Number(m[1]);
      if (buf.length < sep + 4 + len) return;
      const msg = JSON.parse(buf.slice(sep + 4, sep + 4 + len).toString());
      buf = buf.slice(sep + 4 + len);
      if (msg.id === wantId) { clearTimeout(timer); done(msg.error ? 2 : 0, JSON.stringify(msg)); return; }
    }
  });
});
`;

/** `session.send` to the seat's embedded server. `confirmed` = the server
 *  returned a `messageId` for our prompt (it is now in the seat's own queue —
 *  durable in-process, rendered by the TUI). `failed` = no endpoint / refused /
 *  timeout; nothing landed, safe to retry. */
export function sendCopilotRpcSync(input: {
	readonly port: number;
	readonly sessionId: string;
	readonly prompt: string;
	readonly mode?: CopilotSendMode;
	readonly timeoutMs?: number;
}): CopilotRpcSendResult {
	const req = {
		jsonrpc: "2.0",
		id: `pij-${process.pid}-${Date.now()}`,
		method: "session.send",
		params: { sessionId: input.sessionId, prompt: input.prompt, mode: input.mode ?? "enqueue" },
	};
	const r = spawnSync(
		process.execPath,
		["-e", CHILD, String(input.port), String(input.timeoutMs ?? 5_000)],
		{ input: JSON.stringify(req), encoding: "utf8", timeout: (input.timeoutMs ?? 5_000) + 2_000 },
	);
	if (r.error) return { outcome: "failed", detail: String(r.error) };
	let parsed: { result?: { messageId?: string }; error?: unknown } = {};
	try {
		parsed = JSON.parse(r.stdout || "{}");
	} catch {
		/* fall through to the exit-code verdict */
	}
	if (r.status === 0 && parsed.result?.messageId) {
		return { outcome: "confirmed", messageId: parsed.result.messageId };
	}
	return { outcome: "failed", detail: r.stdout || r.stderr || `exit ${r.status}` };
}
