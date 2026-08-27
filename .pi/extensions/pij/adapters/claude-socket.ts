// pij-messaging — deliver to a Claude Code seat over its inbox socket (PoC).
//
// Claude Code ≥ 2.1.224 binds `/tmp/cc-socks/<pid>.sock` and registers
// `~/.claude/sessions/<pid>.json` (fields incl. `pid`, `tmux`, `messagingSocketPath`).
// A newline-terminated JSON frame written to that socket is delivered to the
// model between tool calls mid-turn, or starts a turn when idle — no keystrokes,
// no pty, no 1022-byte chunking, no composer paste race (review §5; verified
// live 2026-08-27 with 3 KB / 31-line bodies).
//
// The frame shape was captured from Claude Code's own `SendMessage` by pointing
// a fake session record at a listener. `from-mode="bypass"` in the content is
// what a bypass-permissions receiver checks; without it the message is HELD
// behind a 5-minute approval dialog. `from` is informational (reply routing is
// pij's job — the body already carries `[pij from <id>]`).
//
// Delivery is SYNCHRONOUS from the daemon's point of view (the drain loop is
// sync). We pay a short-lived `node -e` child per send (~40 ms) rather than
// re-plumb the loop for the PoC; day-2 makes the drain async and uses `net`.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { frame } from "../core/message.js";
import type { SessionId } from "../core/types.js";

export interface ClaudeSessionRecord {
	readonly pid?: number;
	readonly tmux?: string;
	readonly messagingSocketPath?: string;
	readonly name?: string;
	readonly version?: string;
	readonly status?: string;
}

export interface ResolvedClaudeSocket {
	readonly socketPath: string;
	readonly record: ClaudeSessionRecord;
}

/** Find the recipient's inbox socket: by the seat's pid (the record is keyed by
 *  Claude's pid, which IS the pij descriptor pid), else by its tmux pane id.
 *  A record without `messagingSocketPath` is a failed bind (claude-code#84945)
 *  → undefined, so the caller falls back to pane injection. */
export function resolveClaudeSocket(input: {
	readonly pid?: number;
	readonly paneId?: string;
	readonly sessionsDir: string;
}): ResolvedClaudeSocket | undefined {
	const byPid =
		input.pid !== undefined ? readRecord(join(input.sessionsDir, `${input.pid}.json`)) : undefined;
	if (byPid?.messagingSocketPath) return { socketPath: byPid.messagingSocketPath, record: byPid };
	if (!input.paneId) return undefined;
	let names: string[];
	try {
		names = readdirSync(input.sessionsDir).filter((n) => n.endsWith(".json"));
	} catch {
		return undefined;
	}
	for (const name of names) {
		const rec = readRecord(join(input.sessionsDir, name));
		if (rec?.tmux?.endsWith(`.${input.paneId}`) && rec.messagingSocketPath) {
			return { socketPath: rec.messagingSocketPath, record: rec };
		}
	}
	return undefined;
}

function readRecord(path: string): ClaudeSessionRecord | undefined {
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8"));
		return typeof parsed === "object" && parsed !== null
			? (parsed as ClaudeSessionRecord)
			: undefined;
	} catch {
		return undefined;
	}
}

export function claudeSessionsDir(home: string): string {
	return join(home, ".claude", "sessions");
}

export interface PeerFrame {
	readonly msgV: number;
	readonly msg_id: string;
	readonly type: "user";
	readonly message: { readonly role: "user"; readonly content: string };
	readonly priority: "next";
	readonly from: string;
}

/** One JSON line (no trailing newline) in Claude Code's cross-session shape. */
export function buildPeerFrame(input: {
	readonly from: SessionId;
	readonly body: string;
	readonly msgId: string;
}): string {
	const content = `<cross-session-message from="uds:pij-daemon" from-name="${input.from}" from-mode="bypass">\n${frame(input.from, input.body)}\n</cross-session-message>`;
	const f: PeerFrame = {
		msgV: 1,
		msg_id: input.msgId,
		type: "user",
		message: { role: "user", content },
		priority: "next",
		from: "uds:pij-daemon",
	};
	return JSON.stringify(f);
}

export function parsePeerFrame(line: string): PeerFrame {
	return JSON.parse(line) as PeerFrame;
}

export interface SocketSendResult {
	readonly outcome: "confirmed" | "failed";
	readonly detail?: string;
}

// The child: connect, write the frame, then listen `ackWaitMs` for a
// `peer_message_status` naming our msg_id as dropped. Exit codes:
// 0 = written (and not reported dropped), 2 = reported dropped, 1 = connect/write error.
const CHILD = `
const net = require("node:net");
const [sock, ackWaitMs] = process.argv.slice(1);
let frameLine = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => { frameLine += d; });
process.stdin.on("end", () => {
  let msgId = "";
  try { msgId = JSON.parse(frameLine).msg_id; } catch {}
  const c = net.createConnection(sock);
  let buf = "";
  const done = (code, detail) => { try { c.destroy(); } catch {} process.stdout.write(detail || ""); process.exit(code); };
  c.on("error", (e) => done(1, String(e && e.code || e)));
  c.on("connect", () => {
    c.write(frameLine + "\\n", () => {
      setTimeout(() => done(0, ""), Number(ackWaitMs));
    });
  });
  c.on("data", (d) => {
    buf += d.toString();
    for (const line of buf.split("\\n")) {
      if (!line) continue;
      try {
        const st = JSON.parse(line);
        if (st.type === "peer_message_status" && Array.isArray(st.dropped_msg_ids) && st.dropped_msg_ids.includes(msgId)) {
          done(2, "dropped: " + (st.drop_reason || "unknown"));
        }
      } catch {}
    }
  });
});
`;

/** Write one frame to a Claude inbox socket and wait briefly for a drop report.
 *  `confirmed` = the receiver accepted the bytes and did not report our msg_id
 *  dropped within `ackWaitMs`; `failed` = nothing landed (retry-safe). */
export function sendClaudeFrameSync(
	socketPath: string,
	frameLine: string,
	opts: { readonly ackWaitMs?: number } = {},
): SocketSendResult {
	if (!existsSync(socketPath)) return { outcome: "failed", detail: `ENOENT ${socketPath}` };
	const r = spawnSync(process.execPath, ["-e", CHILD, socketPath, String(opts.ackWaitMs ?? 150)], {
		input: frameLine,
		encoding: "utf8",
		timeout: 5_000,
	});
	if (r.error) return { outcome: "failed", detail: String(r.error) };
	if (r.status === 0) return { outcome: "confirmed" };
	return { outcome: "failed", detail: r.stdout || r.stderr || `exit ${r.status}` };
}
