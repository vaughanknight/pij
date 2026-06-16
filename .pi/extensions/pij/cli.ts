#!/usr/bin/env -S npx tsx
// pij-messaging — the `pij` CLI bin. THIN: wires the real fs adapters to the
// pure core/cli.ts, owns Node I/O (argv, stdout/stderr, exit) and the only two
// imperative loops (--follow tail, --wait receipt poll). Pi-free by design —
// remote `compact` rides the channel as a command message the extension runs;
// this process never imports @earendil-works/*.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
import { NodeProcess } from "./adapters/process.js";
import type { CliDeps, CliResult, ParsedCommand } from "./core/cli.js";
import { dispatch, parseArgs } from "./core/cli.js";
import { parseReceiptBody } from "./core/message.js";

const pijHome = join(homedir(), ".pij");
const FOLLOW_MS = 200;
const WAIT_TIMEOUT_MS = 15_000;

function write(res: CliResult): void {
	if (res.stdout) process.stdout.write(`${res.stdout}\n`);
	if (res.stderr) process.stderr.write(`${res.stderr}\n`);
}

function deps(): CliDeps {
	return {
		registry: new FsRegistry(pijHome),
		eventLogFor: (id) => new FsEventLog(pijHome, id),
		delivery: new FsChannel(pijHome),
		process: new NodeProcess(),
		cwd: process.cwd(),
		pijHome,
	};
}

/** --follow: poll the peer's log from the trailer cursor, print only new batches. */
function followTail(cmd: ParsedCommand & { verb: "tail" }, d: CliDeps, fromSeq: number): void {
	let cursor = fromSeq;
	const tick = (): void => {
		const res = dispatch({ ...cmd, since: cursor, follow: false }, d);
		const next = res.follow?.kind === "tail" ? res.follow.nextSince : cursor;
		if (next > cursor) {
			write({ ...res, follow: undefined });
			cursor = next;
		}
		setTimeout(tick, FOLLOW_MS);
	};
	setTimeout(tick, FOLLOW_MS);
}

/** --wait: poll self's receipt events until the delivered receipt for this
 *  messageId lands (F3 — parse receiptBody), or the timeout elapses. */
function waitReceipt(
	d: CliDeps,
	self: string,
	messageId: string,
	timeoutMs = WAIT_TIMEOUT_MS,
): void {
	const started = Date.now();
	const log = d.eventLogFor(self);
	const seen = new Set<string>();
	const tick = (): void => {
		for (const e of log.read({ type: "receipt" })) {
			const body = (e.data as { body?: string } | undefined)?.body;
			const r = body ? parseReceiptBody(body) : null;
			if (!r || r.messageId !== messageId) continue;
			const key = `${r.state}`;
			if (seen.has(key)) continue;
			seen.add(key);
			process.stdout.write(`receipt → ${r.state}\n`);
			if (r.state === "delivered") process.exit(0);
		}
		if (Date.now() - started > timeoutMs) {
			process.stdout.write("receipt → (timeout; check `pij tail` later)\n");
			process.exit(0);
		}
		setTimeout(tick, FOLLOW_MS);
	};
	tick();
}

function main(): void {
	// E-NOREG: registry home absent => the extension never booted here.
	if (!existsSync(pijHome)) {
		process.stderr.write("E-NOREG: no pij registry — is the pij extension loaded?\n");
		process.exit(3);
	}
	const parsed = parseArgs(process.argv.slice(2));
	if (!parsed.ok) {
		process.stderr.write(`${parsed.code}: ${parsed.message}\n`);
		process.exit(64);
	}
	const d = deps();
	const res = dispatch(parsed.value, d);
	write(res);
	if (res.follow?.kind === "tail" && parsed.value.verb === "tail") {
		followTail(parsed.value, d, res.follow.nextSince);
		return; // loops until killed
	}
	if (res.follow?.kind === "wait") {
		waitReceipt(d, res.follow.self, res.follow.messageId, res.follow.timeoutMs);
		return;
	}
	process.exit(res.exitCode);
}

main();
