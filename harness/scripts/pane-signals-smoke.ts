#!/usr/bin/env -S npx tsx

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FsChannel } from "../../.pi/extensions/pij/adapters/channel.js";
import { DaemonTmux } from "../../.pi/extensions/pij/adapters/daemon-tmux.js";
import { FsRegistry } from "../../.pi/extensions/pij/adapters/fs-registry.js";
import type { SessionDescriptor } from "../../.pi/extensions/pij/core/types.js";
import { Daemon } from "../../.pi/extensions/pij/daemon.js";

const CHILD_FLAG = "--child";

function childTui(): void {
	let length = 0;
	process.stdin.setRawMode?.(true);
	process.stdin.resume();
	process.stdout.write("\x1b[5;3H");
	process.stdin.on("data", (chunk: Buffer) => {
		for (const byte of chunk) {
			if (byte === 13) {
				length = 0;
				process.stdout.write("\r\n\x1b[5;3H");
			} else if (byte >= 32 && byte <= 126) {
				length += 1;
				process.stdout.write(`${String.fromCharCode(byte)}\x1b[5;${3 + length}H`);
			}
		}
	});
}

function sleep(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}

function descriptor(
	home: string,
	over: Partial<SessionDescriptor> & { id: string },
): SessionDescriptor {
	return {
		folder: process.cwd(),
		dataDir: join(home, over.id),
		eventsPath: join(home, over.id, "events.ndjson"),
		pid: process.pid,
		startedAt: new Date().toISOString(),
		...over,
	};
}

function main(): void {
	const home = mkdtempSync(join(tmpdir(), "pij-pane-smoke-"));
	const server = `pij-pane-smoke-${process.pid}`;
	const script = fileURLToPath(import.meta.url);
	const childCommand = `${shellQuote(process.execPath)} --import tsx ${shellQuote(script)} ${CHILD_FLAG}`;
	const tmux = (args: readonly string[]): string =>
		execFileSync("tmux", ["-L", server, ...args], {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		});
	let paneId: string | undefined;
	try {
		paneId = tmux(["new-session", "-d", "-P", "-F", "#{pane_id}", childCommand]).trim();
		sleep(300);
		const panePid = Number(tmux(["display-message", "-p", "-t", paneId, "#{pane_pid}"]).trim());
		const runner = (args: readonly string[]) => tmux(args);
		const adapter = new DaemonTmux({ runner, sleep: () => undefined });
		const registry = new FsRegistry(home);
		const channel = new FsChannel(home);
		registry.write(descriptor(home, { id: "pij-smoke-sender" }));
		registry.write(
			descriptor(home, {
				id: "pij-smoke-target",
				pid: panePid,
				harness: "claude",
				lifecycle: "bound",
				paneId,
				harnessSessionId: "pane-smoke",
			}),
		);
		const daemon = new Daemon(home, adapter, registry, channel);
		daemon.tick();

		tmux(["send-keys", "-t", paneId, "-l", "human"]);
		sleep(150);
		channel.deliver({ from: "pij-smoke-sender", to: "pij-smoke-target", body: "one" });
		channel.deliver({ from: "pij-smoke-sender", to: "pij-smoke-target", body: "two" });
		daemon.tick();
		if (!daemon.paneSignal(paneId)?.userTyping) throw new Error("typing hold was not detected");
		const held = channel.listUnread("pij-smoke-target");
		if (!held.ok || held.value.length !== 2)
			throw new Error("messages were not retained while held");

		tmux(["send-keys", "-t", paneId, "Enter"]);
		sleep(150);
		daemon.tick();
		const released = channel.listUnread("pij-smoke-target");
		if (!released.ok || released.value.length !== 0) throw new Error("FIFO queue did not flush");

		tmux(["kill-pane", "-t", paneId]);
		daemon.tick();
		if (daemon.paneSignal(paneId) !== undefined) throw new Error("dead pane was not retired");
		daemon.dispose();
		process.stdout.write("pane-signals smoke: hold, FIFO release, and retire passed\n");
	} finally {
		try {
			tmux(["kill-server"]);
		} catch {
			// Last-pane removal already stops the isolated server.
		}
		rmSync(home, { recursive: true, force: true });
	}
}

if (process.argv.includes(CHILD_FLAG)) childTui();
else main();
