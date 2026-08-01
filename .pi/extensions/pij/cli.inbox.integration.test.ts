import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
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
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsChannel } from "./adapters/channel.js";
import { FsEventLog } from "./adapters/event-log.js";
import { FsRegistry } from "./adapters/fs-registry.js";
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
	let agentHome: string;

	beforeEach(() => {
		pijHome = mkdtempSync(join(tmpdir(), "pij-portable-home-"));
		folder = realpathSync(mkdtempSync(join(tmpdir(), "pij-portable-cwd-")));
		agentHome = realpathSync(mkdtempSync(join(tmpdir(), "pij-portable-agent-home-")));
	});

	afterEach(() => {
		rmSync(pijHome, { recursive: true, force: true });
		rmSync(folder, { recursive: true, force: true });
		rmSync(agentHome, { recursive: true, force: true });
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

	function cliEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
		return {
			...process.env,
			HOME: agentHome,
			USERPROFILE: agentHome,
			PIJ_HOME: pijHome,
			PIJ_SESSION_ID: "",
			TMUX: "",
			TMUX_PANE: "",
			CLAUDE_CODE_SESSION_ID: "",
			COPILOT_AGENT_SESSION_ID: "",
			CODEX_THREAD_ID: "",
			...overrides,
		};
	}

	function runPij(
		args: readonly string[],
		envOverrides: Record<string, string> = {},
		timeout = 10_000,
	): CliRun {
		const result = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
			cwd: folder,
			env: cliEnv(envOverrides),
			encoding: "utf8",
			timeout,
		});
		if (result.error) throw result.error;
		return {
			code: result.status ?? 1,
			stdout: result.stdout,
			stderr: result.stderr,
		};
	}

	function ambientFixture(
		harness: "claude" | "copilot" | "codex",
		sessionId: string,
	): Record<string, string> {
		if (harness === "claude") return { CLAUDE_CODE_SESSION_ID: sessionId };
		if (harness === "copilot") {
			mkdirSync(join(agentHome, ".copilot", "session-state", sessionId), {
				recursive: true,
			});
			return { COPILOT_AGENT_SESSION_ID: sessionId };
		}
		const rolloutDir = join(agentHome, ".codex", "sessions", "2026", "07", "12");
		mkdirSync(rolloutDir, { recursive: true });
		writeFileSync(
			join(rolloutDir, `rollout-2026-07-12T00-00-00-${sessionId}.jsonl`),
			`${JSON.stringify({ type: "session_meta", payload: { cwd: folder } })}\n`,
		);
		return { CODEX_THREAD_ID: sessionId };
	}

	function register(env: Record<string, string>): {
		readonly id: string;
		readonly existing: boolean;
	} {
		const result = runPij(["inbox", "register", "--json"], env);
		expect(result).toMatchObject({ code: 0, stderr: "" });
		return JSON.parse(result.stdout) as { id: string; existing: boolean };
	}

	function bindPushedSeat(
		sessionId: string,
		paneId: string,
	): { readonly id: string; readonly ambientEnv: Record<string, string> } {
		const ambientEnv = ambientFixture("claude", sessionId);
		const registration = register(ambientEnv);
		const registry = new FsRegistry(pijHome);
		const descriptor = registry.read(registration.id);
		if (!descriptor) throw new Error("missing pushed-seat descriptor");
		registry.write({
			...descriptor,
			deliveryMode: "push",
			paneId,
			lifecycle: "bound",
		});
		return { id: registration.id, ambientEnv };
	}

	function spawnPij(
		args: readonly string[],
		envOverrides: Record<string, string>,
		timeout: number,
	): {
		readonly output: () => { stdout: string; stderr: string };
		readonly completed: Promise<CliRun>;
	} {
		const child = spawn(process.execPath, [TSX_CLI, CLI, ...args], {
			cwd: folder,
			env: cliEnv(envOverrides),
			stdio: "pipe",
			timeout,
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		const completed = new Promise<CliRun>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", (code) => {
				resolve({ code: code ?? 1, stdout, stderr });
			});
		});
		return { output: () => ({ stdout, stderr }), completed };
	}

	async function waitForOutput(
		run: { readonly output: () => { stdout: string; stderr: string } },
		text: string,
		timeout = 5000,
	): Promise<void> {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			if (run.output().stdout.includes(text)) return;
			await new Promise<void>((resolve) => setTimeout(resolve, 50));
		}
		throw new Error(`timed out waiting for subprocess output: ${text}`);
	}

	it("runs whoami through process.execPath and the tsx entrypoint without tmux", {
		timeout: 15_000,
	}, () => {
		const descriptor = writeDescriptor("pij-portable-a");

		const result = runPij(["whoami", "--json"], { PIJ_SESSION_ID: descriptor.id });

		expect(result).toMatchObject({ code: 0, stderr: "" });
		// plan 078: whoami now also projects the seat's role and, for a PA, the
		// verbs it will be refused — a capability boundary whose input the caller
		// cannot read is the s075 opened.actor defect, so the gate had to come
		// with a way to ask BEFORE attempting. An unroled seat reads null/[] and
		// is otherwise unchanged; toEqual is kept deliberately (not toMatchObject)
		// so a future addition to this surface has to be noticed here.
		expect(JSON.parse(result.stdout)).toEqual({
			id: descriptor.id,
			folder,
			dataDir: descriptor.dataDir,
			state: "idle",
			pid: process.pid,
			orchestrationRole: null,
			refusedVerbs: [],
		});
	});

	it("delivers a raw message through the real CLI into an isolated PIJ_HOME", {
		timeout: 15_000,
	}, () => {
		const sender = writeDescriptor("pij-portable-a");
		const receiver = writeDescriptor("pij-portable-b");

		const result = runPij(["send", receiver.id, "hello portable", "--json"], {
			PIJ_SESSION_ID: sender.id,
		});

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

	it.each([
		{
			label: "Claude",
			harness: "claude" as const,
			sessionId: "claude-portable-current",
		},
		{
			label: "Copilot",
			harness: "copilot" as const,
			sessionId: "11111111-2222-4333-8444-555555555555",
		},
		{
			label: "Codex",
			harness: "codex" as const,
			sessionId: "aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb",
		},
	])("$label ambient registration is idempotent and finite wait returns JSON", {
		timeout: 30_000,
	}, ({ harness, sessionId }) => {
		const env = ambientFixture(harness, sessionId);
		const first = register(env);
		expect(first.existing).toBe(false);
		expect(register(env)).toMatchObject({ id: first.id, existing: true });
		expect(new FsRegistry(pijHome).read(first.id)).toMatchObject({
			id: first.id,
			harness,
			harnessSessionId: sessionId,
			deliveryMode: "pull",
			lifecycle: "bound",
		});

		const timed = runPij(["inbox", "check", "--wait", "10", "--json"], env);
		expect(timed).toMatchObject({ code: 0, stderr: "" });
		expect(JSON.parse(timed.stdout)).toEqual({
			self: first.id,
			messages: [],
			timedOut: true,
		});
	});

	it("refuses inbox --wait immediately for a pushed-delivery seat", {
		timeout: 15_000,
	}, () => {
		const pushed = bindPushedSeat("claude-pushed-wait", "%42");

		const result = runPij(["inbox", "--wait"], { ...pushed.ambientEnv, TMUX_PANE: "%42" }, 5000);

		expect(result).toMatchObject({ code: 2, stdout: "" });
		expect(result.stderr).toBe(
			"error: this seat is a pushed-delivery peer (claude, pane %42); it receives turns pushed by the daemon and must not block on 'pij inbox --wait'. End your turn instead.\n",
		);
	});

	it("keeps finite inbox waits available to pull-delivery seats", {
		timeout: 15_000,
	}, () => {
		const ambientEnv = ambientFixture("claude", "claude-pull-wait");
		const registration = register(ambientEnv);

		const result = runPij(["inbox", "--wait", "10", "--json"], ambientEnv);

		expect(result).toMatchObject({ code: 0, stderr: "" });
		expect(JSON.parse(result.stdout)).toEqual({
			self: registration.id,
			messages: [],
			timedOut: true,
		});
	});

	it("registers an already-bound pushed seat from TMUX_PANE without ambient identity", {
		timeout: 15_000,
	}, () => {
		const pushed = bindPushedSeat("claude-pane-register", "%43");

		const result = runPij(["inbox", "register", "--json"], { TMUX_PANE: "%43" });

		expect(result).toMatchObject({ code: 0, stderr: "" });
		expect(JSON.parse(result.stdout)).toMatchObject({
			id: pushed.id,
			harness: "claude",
			harnessSessionId: "claude-pane-register",
			deliveryMode: "push",
			existing: true,
		});
	});

	it("registers a self-registered OMP seat from TMUX_PANE without ambient identity", {
		timeout: 15_000,
	}, () => {
		const descriptor = writeDescriptor("pij-omp-pane-register");
		const harnessSessionId = "019f8def-1111-4222-8333-bbbbbbbbbbbb";
		new FsRegistry(pijHome).write({
			...descriptor,
			harness: "pi",
			harnessSessionId,
			paneId: "%44",
		});

		const result = runPij(["inbox", "register", "--json"], { TMUX_PANE: "%44" });

		expect(result).toMatchObject({ code: 0, stderr: "" });
		expect(JSON.parse(result.stdout)).toMatchObject({
			id: descriptor.id,
			harness: "pi",
			harnessSessionId,
			existing: true,
		});
	});

	it("keeps register fail-loud when ambient identity and TMUX_PANE are both absent", {
		timeout: 15_000,
	}, () => {
		const result = runPij(["inbox", "register", "--json"]);

		expect(result).toMatchObject({ code: 2, stdout: "" });
		expect(result.stderr).toBe(
			"E-AMBIG: cannot detect a current Claude, Copilot, or Codex session; run inside an agent tool shell\n",
		);
	});

	// SKIPPED ON WINDOWS (Jordan's ruling, 2026-07-30). This spawns real OS
	// processes that race for the same files; on the Windows CI runner it failed
	// intermittently at roughly a 50% rate while passing on every rerun and on
	// every local run. Two DIFFERENT concurrency tests failed the same way the
	// same day, which points at the runner's file locking under concurrent
	// access rather than at either test.
	//
	// The coverage loss is real and deliberately narrow: this is the ONLY
	// multi-process assertion for the pull-inbox delivery round trip on Windows. Windows atomic-replace
	// behaviour is still covered by the single-process tests (see the passing
	// "retries transient Windows replace failures" case), and the full race
	// still runs on darwin and linux, so a genuine regression in the logic is
	// caught there. What is no longer covered is Windows-specific behaviour
	// under real process contention — if that is ever suspected, run this file
	// on Windows by hand rather than trusting CI green.
	it.skipIf(process.platform === "win32")(
		"round-trips wait → dead-pid send → read → delivered receipt without tmux or daemon",
		{
			timeout: 30_000,
		},
		async () => {
			const receiverEnv = ambientFixture("claude", "claude-portable-receiver");
			const senderEnv = ambientFixture("claude", "claude-portable-sender");
			const receiver = register(receiverEnv);
			const sender = register(senderEnv);

			const receiverWait = spawnPij(["inbox", "--wait"], receiverEnv, 15_000);
			await waitForOutput(receiverWait, "waiting for pij inbox messages");
			const competingSenderInbox = spawnPij(
				["inbox", "check", "--wait", "3000", "--json"],
				senderEnv,
				8000,
			);
			await new Promise<void>((resolve) => setTimeout(resolve, 250));

			const registry = new FsRegistry(pijHome);
			const receiverDescriptor = registry.read(receiver.id);
			if (!receiverDescriptor) throw new Error("missing receiver descriptor");
			registry.write({ ...receiverDescriptor, pid: 2_147_483_647 });

			const sent = runPij(
				["send", receiver.id, "hello from portable sender", "--wait", "10000"],
				senderEnv,
				15_000,
			);
			const received = await receiverWait.completed;
			const competing = await competingSenderInbox.completed;

			expect(sent).toMatchObject({ code: 0, stderr: "" });
			expect(sent.stdout).toContain("queued (pull-inbox): awaiting the peer's own inbox check");
			expect(sent.stdout).toContain("receipt → delivered");
			expect(received).toMatchObject({ code: 0, stderr: "" });
			expect(received.stdout).toContain("[pij from");
			expect(received.stdout).toContain("hello from portable sender");
			expect(competing).toMatchObject({ code: 0, stderr: "" });
			expect(JSON.parse(competing.stdout)).toEqual({
				self: sender.id,
				messages: [],
				timedOut: true,
			});

			const senderEvents = new FsEventLog(pijHome, sender.id).read({ type: "receipt" });
			expect(senderEvents).toHaveLength(1);
			expect(JSON.stringify(senderEvents)).toContain("delivered");
			expect(new FsChannel(pijHome).listUnread(sender.id)).toEqual({
				ok: true,
				value: [],
			});
		},
	);

	it("appendOnce hard-link race publishes one atomic event across two processes", {
		timeout: 30_000,
	}, async () => {
		const raceRoot = join(pijHome, "append-once-race");
		mkdirSync(raceRoot, { recursive: true });
		const workerPath = join(raceRoot, "worker.ts");
		const eventLogUrl = pathToFileURL(join(import.meta.dirname, "adapters", "event-log.ts")).href;
		writeFileSync(
			workerPath,
			`
import { existsSync, writeFileSync } from "node:fs";
import { FsEventLog } from ${JSON.stringify(eventLogUrl)};

const [home, id, key, ready, barrier] = process.argv.slice(2);
if (!home || !id || !key || !ready || !barrier) process.exit(64);
writeFileSync(ready, "");
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const deadline = Date.now() + 5000;
while (!existsSync(barrier)) {
	if (Date.now() >= deadline) process.exit(2);
	Atomics.wait(sleeper, 0, 0, 10);
}
const result = new FsEventLog(home, id).appendOnce(key, {
	seq: 1,
	timestamp: "2026-07-12T00:55:00.000Z",
	type: "receipt",
	data: { body: "[pij receipt m1] delivered" },
});
process.stdout.write(result);
`,
		);
		const raceHome = join(raceRoot, "home");
		const barrier = join(raceRoot, "barrier");
		const readyA = join(raceRoot, "ready-a");
		const readyB = join(raceRoot, "ready-b");
		const spawnWorker = (ready: string): Promise<CliRun> => {
			const child = spawn(
				process.execPath,
				[TSX_CLI, workerPath, raceHome, "sender", "receipt-envelope:r1", ready, barrier],
				{
					cwd: folder,
					env: cliEnv(),
					stdio: "pipe",
					timeout: 10_000,
				},
			);
			let stdout = "";
			let stderr = "";
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});
			return new Promise<CliRun>((resolve, reject) => {
				child.once("error", reject);
				child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
			});
		};

		const workerA = spawnWorker(readyA);
		const workerB = spawnWorker(readyB);
		const readyDeadline = Date.now() + 5000;
		while ((!existsSync(readyA) || !existsSync(readyB)) && Date.now() < readyDeadline) {
			await new Promise<void>((resolve) => setTimeout(resolve, 25));
		}
		expect(existsSync(readyA)).toBe(true);
		expect(existsSync(readyB)).toBe(true);
		writeFileSync(barrier, "");

		const results = await Promise.all([workerA, workerB]);
		expect(results).toEqual([
			expect.objectContaining({ code: 0, stderr: "" }),
			expect.objectContaining({ code: 0, stderr: "" }),
		]);
		expect(results.map(({ stdout }) => stdout).sort()).toEqual(["appended", "existing"]);
		expect(new FsEventLog(raceHome, "sender").read()).toHaveLength(1);
	});
});
