// PoC (poc/comms-sqlite-socket): deliver to a Claude Code seat over its inbox
// socket instead of typing into its pane. Verified live 2026-08-27 (report §5).

import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildPeerFrame,
	parsePeerFrame,
	resolveClaudeSocket,
	sendClaudeFrame,
} from "./claude-socket.js";

const BIG_BODY = `HEAD sha 0001\n${Array.from({ length: 30 }, (_, i) => `L${i}: ${"k".repeat(95)}`).join("\n")}\nTAIL`;

let dir: string;
let sessionsDir: string;
let listener: ChildProcess | undefined;

beforeEach(() => {
	// macOS caps AF_UNIX paths at 104 bytes; keep it short.
	dir = mkdtempSync(join("/tmp", "pijsock-"));
	sessionsDir = join(dir, "sessions");
});
afterEach(() => {
	listener?.kill();
	listener = undefined;
	rmSync(dir, { recursive: true, force: true });
});

// The sender is synchronous (spawnSync blocks this event loop), so the fake
// receiver must live OUT of process: a tiny node listener that appends each
// received line to a log and, when told to, answers with a drop status.
const LISTENER = `
const net = require("node:net"), fs = require("node:fs");
const [sock, log, dropReason] = process.argv.slice(1);
net.createServer((c) => {
  let buf = "";
  c.on("data", (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf("\\n")) >= 0) {
      const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
      fs.appendFileSync(log, line + "\\n");
      if (dropReason) {
        const f = JSON.parse(line);
        c.write(JSON.stringify({ type: "peer_message_status", orig_msg_id: f.msg_id, dropped_msg_ids: [f.msg_id], drop_reason: dropReason }) + "\\n");
      }
    }
  });
}).listen(sock);
`;

async function listen(sockPath: string, dropReason = ""): Promise<string> {
	const log = `${sockPath}.log`;
	listener = spawn(process.execPath, ["-e", LISTENER, sockPath, log, dropReason], {
		stdio: "ignore",
	});
	for (let i = 0; i < 100 && !existsSync(sockPath); i++)
		await new Promise((r) => setTimeout(r, 20));
	return log;
}

function receivedLines(log: string): string[] {
	return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
}

describe("buildPeerFrame / parsePeerFrame", () => {
	it("wraps the pij-framed body in Claude Code's cross-session envelope with from-mode=bypass", () => {
		const line = buildPeerFrame({ from: "pij-a", body: "hi\nthere", msgId: "m1" });
		const frame = parsePeerFrame(line);
		expect(frame.msgV).toBe(1);
		expect(frame.msg_id).toBe("m1");
		expect(frame.type).toBe("user");
		expect(frame.priority).toBe("next");
		expect(frame.message.role).toBe("user");
		expect(frame.message.content).toBe(
			'<cross-session-message from="uds:pij-daemon" from-name="pij-a" from-mode="bypass">\n[pij from pij-a] hi\nthere\n</cross-session-message>',
		);
		expect(line.endsWith("\n")).toBe(false);
	});
});

describe("sendClaudeFrame", () => {
	it("delivers a 3 KB multi-line body byte-exact and reports confirmed", async () => {
		const sock = join(dir, "1.sock");
		const log = await listen(sock);
		const line = buildPeerFrame({ from: "pij-a", body: BIG_BODY, msgId: "m-big" });
		const out = await sendClaudeFrame(sock, line, { ackWaitMs: 50 });
		expect(out.outcome).toBe("confirmed");
		const received = receivedLines(log);
		expect(received.length).toBe(1);
		const frame = parsePeerFrame(received[0] ?? "");
		expect(frame.message.content).toContain(`[pij from pij-a] ${BIG_BODY}`);
	});

	it("reports failed (retryable) when the socket is absent", async () => {
		const out = await sendClaudeFrame(
			join(dir, "missing.sock"),
			buildPeerFrame({ from: "a", body: "b", msgId: "m" }),
			{
				ackWaitMs: 50,
			},
		);
		expect(out.outcome).toBe("failed");
		expect(out.detail).toMatch(/ENOENT|ECONNREFUSED/);
	});

	it("reports failed when the receiver reports our msg_id dropped", async () => {
		const sock = join(dir, "2.sock");
		await listen(sock, "rate_limited");
		const out = await sendClaudeFrame(
			sock,
			buildPeerFrame({ from: "a", body: "b", msgId: "m-drop" }),
			{ ackWaitMs: 300 },
		);
		expect(out.outcome).toBe("failed");
		expect(out.detail).toContain("rate_limited");
	});
});

describe("resolveClaudeSocket (records)", () => {
	it("matches by pid first, then by tmux pane, and ignores records without a socket path", () => {
		mkdirSync(sessionsDir, { recursive: true });
		writeFileSync(
			join(sessionsDir, "100.json"),
			JSON.stringify({ pid: 100, tmux: "s:@1.%7", messagingSocketPath: "/tmp/cc-socks/100.sock" }),
		);
		writeFileSync(join(sessionsDir, "200.json"), JSON.stringify({ pid: 200, tmux: "s:@1.%8" })); // bind failed (#84945)
		writeFileSync(
			join(sessionsDir, "300.json"),
			JSON.stringify({ pid: 300, tmux: "s:@2.%9", messagingSocketPath: "/tmp/cc-socks/300.sock" }),
		);
		expect(resolveClaudeSocket({ pid: 100, sessionsDir })?.socketPath).toBe(
			"/tmp/cc-socks/100.sock",
		);
		expect(resolveClaudeSocket({ pid: 999, paneId: "%9", sessionsDir })?.socketPath).toBe(
			"/tmp/cc-socks/300.sock",
		);
		expect(resolveClaudeSocket({ pid: 200, sessionsDir })).toBeUndefined();
		expect(resolveClaudeSocket({ pid: 999, paneId: "%8", sessionsDir })).toBeUndefined();
		expect(resolveClaudeSocket({ pid: 1, sessionsDir: join(dir, "nope") })).toBeUndefined();
	});
});
