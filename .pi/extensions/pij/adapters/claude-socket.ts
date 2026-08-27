// pij-messaging — deliver to a Claude Code seat over its inbox socket.
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
// Async (`net` directly): the drain loop awaits it (day-2 item 1 — the PoC
// paid a `node -e` child per send).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
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
	readonly outcome: "confirmed" | "sent" | "failed";
	readonly detail?: string;
}

/** Write one frame to a Claude inbox socket and listen `ackWaitMs` for a
 *  `peer_message_status` naming our msg_id. `confirmed` = a positive status;
 *  `sent` = bytes flushed but no status arrived; `failed` = nothing landed, or
 *  the receiver explicitly dropped the message (retry-safe). */
export function sendClaudeFrame(
	socketPath: string,
	frameLine: string,
	opts: { readonly ackWaitMs?: number; readonly connectTimeoutMs?: number } = {},
): Promise<SocketSendResult> {
	if (!existsSync(socketPath)) {
		return Promise.resolve({ outcome: "failed", detail: `ENOENT ${socketPath}` });
	}
	let msgId = "";
	try {
		msgId = parsePeerFrame(frameLine).msg_id;
	} catch {
		/* a frame we cannot parse cannot be matched in a drop report — still send it */
	}
	const ackWaitMs = opts.ackWaitMs ?? 150;
	return new Promise((resolve) => {
		let settled = false;
		let wrote = false;
		let buf = "";
		const c = createConnection(socketPath);
		let ackTimer: NodeJS.Timeout | undefined;
		const done = (r: SocketSendResult): void => {
			if (settled) return;
			settled = true;
			clearTimeout(connectTimer);
			if (ackTimer !== undefined) clearTimeout(ackTimer);
			c.destroy();
			resolve(r);
		};
		const ambiguousFailure = (detail: string): void => {
			done({ outcome: wrote ? "sent" : "failed", detail });
		};
		const connectTimer = setTimeout(
			() => done({ outcome: "failed", detail: "connect timeout" }),
			opts.connectTimeoutMs ?? 2_000,
		);
		c.on("error", (e) => {
			const detail = String((e as NodeJS.ErrnoException).code ?? e);
			ambiguousFailure(detail);
		});
		c.on("close", () => {
			ambiguousFailure(
				wrote ? "socket closed after write before status" : "socket closed before write",
			);
		});
		c.on("connect", () => {
			clearTimeout(connectTimer);
			c.write(`${frameLine}\n`, (err) => {
				if (err) return done({ outcome: "failed", detail: String(err) });
				wrote = true;
				ackTimer = setTimeout(
					() => ambiguousFailure("acknowledgement window elapsed after write"),
					ackWaitMs,
				);
			});
		});
		c.on("data", (d) => {
			buf += d.toString();
			for (const line of buf.split("\n")) {
				if (!line) continue;
				try {
					const st = JSON.parse(line) as {
						type?: string;
						orig_msg_id?: string;
						dropped_msg_ids?: string[];
						drop_reason?: string;
					};
					if (st.type !== "peer_message_status") continue;
					if (Array.isArray(st.dropped_msg_ids) && st.dropped_msg_ids.includes(msgId)) {
						done({ outcome: "failed", detail: `dropped: ${st.drop_reason ?? "unknown"}` });
					} else if (st.orig_msg_id === msgId) {
						done({ outcome: "confirmed" });
					}
				} catch {
					/* partial line — wait for more */
				}
			}
		});
	});
}
