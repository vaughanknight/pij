import { spawnSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DeliveredMessage, SessionDescriptor } from "./core/types.js";

const nodeRequire = createRequire(import.meta.url);
const TSX_CLI = nodeRequire.resolve("tsx/cli");
const CLI = join(import.meta.dirname, "cli.ts");

interface CliRun {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

describe("portable pij CLI baseline", () => {
	let pijHome: string;
	let folder: string;

	beforeEach(() => {
		pijHome = mkdtempSync(join(tmpdir(), "pij-portable-home-"));
		folder = realpathSync(mkdtempSync(join(tmpdir(), "pij-portable-cwd-")));
	});

	afterEach(() => {
		rmSync(pijHome, { recursive: true, force: true });
		rmSync(folder, { recursive: true, force: true });
	});

	function writeDescriptor(id: string): SessionDescriptor {
		const dataDir = join(pijHome, id);
		const descriptor: SessionDescriptor = {
			id,
			folder,
			dataDir,
			eventsPath: join(dataDir, "events.ndjson"),
			pid: process.pid,
			startedAt: "2026-07-12T00:00:00.000Z",
			state: "idle",
		};
		mkdirSync(join(dataDir, "inbox"), { recursive: true });
		writeFileSync(join(pijHome, `${id}.json`), JSON.stringify(descriptor));
		return descriptor;
	}

	function runPij(args: readonly string[], selfId: string): CliRun {
		const result = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
			cwd: folder,
			env: {
				...process.env,
				PIJ_HOME: pijHome,
				PIJ_SESSION_ID: selfId,
			},
			encoding: "utf8",
			timeout: 10_000,
		});
		if (result.error) throw result.error;
		return {
			code: result.status ?? 1,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	}

	it("runs whoami through process.execPath and the tsx entrypoint without tmux", {
		timeout: 15_000,
	}, () => {
		const descriptor = writeDescriptor("pij-portable-a");

		const result = runPij(["whoami", "--json"], descriptor.id);

		expect(result).toMatchObject({ code: 0, stderr: "" });
		expect(JSON.parse(result.stdout)).toEqual({
			id: descriptor.id,
			folder,
			dataDir: descriptor.dataDir,
			state: "idle",
			pid: process.pid,
		});
	});

	it("delivers a raw message through the real CLI into an isolated PIJ_HOME", {
		timeout: 15_000,
	}, () => {
		const sender = writeDescriptor("pij-portable-a");
		const receiver = writeDescriptor("pij-portable-b");

		const result = runPij(["send", receiver.id, "hello portable", "--json"], sender.id);

		expect(result).toMatchObject({ code: 0, stderr: "" });
		expect(JSON.parse(result.stdout)).toMatchObject({
			from: sender.id,
			to: receiver.id,
			kind: "text",
		});
		const inboxDir = join(receiver.dataDir, "inbox");
		const messageNames = readdirSync(inboxDir).filter(
			(name) => name.startsWith("msg-") && name.endsWith(".json"),
		);
		expect(messageNames).toHaveLength(1);
		const messageName = messageNames[0];
		expect(messageName).toBeDefined();
		const delivered = JSON.parse(
			readFileSync(join(inboxDir, messageName as string), "utf8"),
		) as DeliveredMessage;
		expect(delivered).toMatchObject({
			from: sender.id,
			to: receiver.id,
			body: "hello portable",
		});
		expect(messageName).toBe(`msg-${delivered.messageId}.json`);
	});
});
