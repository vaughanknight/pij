// PoC (poc/comms-sqlite-socket): Copilot embedded JSON-RPC delivery.

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
// A minimal Content-Length JSON-RPC server that answers session.getForeground
// with a fixed sessionId, runs `fn(port)`, then closes. Out-of-process is
// unnecessary here — probeCopilotReady is async and yields to the event loop.
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCopilotPrompt, probeCopilotReady, sendCopilotRpc } from "./copilot-rpc.js";

async function startForegroundServer<T>(
	fgSessionId: string,
	fn: (port: number) => Promise<T>,
): Promise<T> {
	const srv = createServer((c) => {
		let buf = Buffer.alloc(0);
		c.on("data", (d) => {
			buf = Buffer.concat([buf, d]);
			for (;;) {
				const sep = buf.indexOf("\r\n\r\n");
				if (sep < 0) return;
				const header = /Content-Length:\s*(\d+)/i.exec(buf.subarray(0, sep).toString());
				if (!header) return;
				const len = Number(header[1]);
				if (buf.length < sep + 4 + len) return;
				const msg = JSON.parse(buf.subarray(sep + 4, sep + 4 + len).toString());
				buf = buf.subarray(sep + 4 + len);
				const resp = JSON.stringify({
					jsonrpc: "2.0",
					id: msg.id,
					result: { sessionId: fgSessionId },
				});
				c.write(`Content-Length: ${Buffer.byteLength(resp)}\r\n\r\n${resp}`);
			}
		});
	});
	await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
	const port = (srv.address() as { port: number }).port;
	try {
		return await fn(port);
	} finally {
		await new Promise<void>((r) => srv.close(() => r()));
	}
}

const BIG = `HEAD sha 0001\n${Array.from({ length: 30 }, (_, i) => `L${i}: ${"k".repeat(95)}`).join("\n")}\nTAIL`;

// Out-of-process fake of copilot's server: Content-Length framed JSON-RPC that
// logs each request and answers session.send with a messageId (or an error).
const SERVER = `
const net = require("node:net"), fs = require("node:fs");
const [log, portFile, failMode] = process.argv.slice(1);
const srv = net.createServer((c) => {
  let buf = Buffer.alloc(0);
  c.on("data", (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const sep = buf.indexOf("\\r\\n\\r\\n"); if (sep < 0) return;
      const len = Number(/Content-Length:\\s*(\\d+)/i.exec(buf.slice(0, sep).toString())[1]);
      if (buf.length < sep + 4 + len) return;
      const msg = JSON.parse(buf.slice(sep + 4, sep + 4 + len).toString()); buf = buf.slice(sep + 4 + len);
      fs.appendFileSync(log, JSON.stringify(msg) + "\\n");
      // a notification BEFORE the response, like the real server does
      const note = JSON.stringify({ jsonrpc: "2.0", method: "host.event", params: { kind: "noise" } });
      c.write("Content-Length: " + Buffer.byteLength(note) + "\\r\\n\\r\\n" + note);
      if (failMode === "silent") continue;
      const resp = failMode === "error"
        ? { jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: "no such session" } }
        : { jsonrpc: "2.0", id: msg.id, result: { messageId: "mid-" + msg.id } };
      const body = JSON.stringify(resp);
      c.write("Content-Length: " + Buffer.byteLength(body) + "\\r\\n\\r\\n" + body);
    }
  });
});
srv.listen(0, "127.0.0.1", () => fs.writeFileSync(portFile, String(srv.address().port)));
`;

let dir: string;
let server: ChildProcess | undefined;

beforeEach(() => {
	dir = mkdtempSync(join("/tmp", "pijcop-"));
});
afterEach(() => {
	server?.kill();
	server = undefined;
	rmSync(dir, { recursive: true, force: true });
});

async function startServer(failMode = ""): Promise<{ port: number; log: string }> {
	const log = join(dir, "req.log");
	const portFile = join(dir, "port");
	server = spawn(process.execPath, ["-e", SERVER, log, portFile, failMode], { stdio: "ignore" });
	for (let i = 0; i < 100 && !existsSync(portFile); i++)
		await new Promise((r) => setTimeout(r, 20));
	return { port: Number(readFileSync(portFile, "utf8")), log };
}

describe("buildCopilotPrompt", () => {
	it("uses the standard pij frame", () => {
		expect(buildCopilotPrompt("pij-a", "x\ny")).toBe("[pij from pij-a] x\ny");
	});
});

describe("sendCopilotRpc", () => {
	it("sends session.send with the 3 KB prompt byte-exact and returns the server's messageId", async () => {
		const { port, log } = await startServer();
		const out = await sendCopilotRpc({ port, sessionId: "sess-1", prompt: BIG, mode: "enqueue" });
		expect(out).toMatchObject({ outcome: "confirmed" });
		expect(out.messageId).toMatch(/^mid-pij-/);
		const reqs = readFileSync(log, "utf8")
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l));
		expect(reqs).toHaveLength(1);
		expect(reqs[0].method).toBe("session.send");
		expect(reqs[0].params).toEqual({ sessionId: "sess-1", prompt: BIG, mode: "enqueue" });
	});

	it("reports failed when the server answers with a JSON-RPC error", async () => {
		const { port } = await startServer("error");
		const out = await sendCopilotRpc({ port, sessionId: "sess-1", prompt: "hi" });
		expect(out.outcome).toBe("failed");
		expect(out.detail).toContain("no such session");
	});

	it("reports sent when the request lands but its response is lost", async () => {
		const { port, log } = await startServer("silent");
		const out = await sendCopilotRpc({
			port,
			sessionId: "sess-1",
			prompt: "hi",
			timeoutMs: 60,
		});

		expect(readFileSync(log, "utf8").trim().split("\n")).toHaveLength(1);
		expect(out.outcome).toBe("sent");
	});

	it("reports failed (retryable) when nothing listens on the port", async () => {
		const out = await sendCopilotRpc({ port: 1, sessionId: "s", prompt: "hi", timeoutMs: 500 });
		expect(out.outcome).toBe("failed");
		expect(out.detail).toMatch(/ECONNREFUSED|EACCES|timeout/);
	});
});

describe("probeCopilotReady (day-2 item 9)", () => {
	it("ready when getForeground returns our sessionId; not-ready otherwise", async () => {
		const server = startForegroundServer;
		const a = await server("sess-live", async (port) =>
			probeCopilotReady({ port, sessionId: "sess-live", timeoutMs: 1000 }),
		);
		expect(a.ready).toBe(true);
		const b = await server("sess-other", async (port) =>
			probeCopilotReady({ port, sessionId: "sess-live", timeoutMs: 1000 }),
		);
		expect(b.ready).toBe(false);
		expect(b.detail).toContain("booting");
	});

	it("not-ready (retryable) when nothing listens", async () => {
		const r = await probeCopilotReady({ port: 1, sessionId: "s", timeoutMs: 500 });
		expect(r.ready).toBe(false);
	});
});
