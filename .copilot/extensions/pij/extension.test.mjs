import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createNativeReporter } from "./store.mjs";

// Preloaded only in the owned test subprocess. Real extension source, HTTP and disk;
// explicit SDK/process seams, NOT proof of native CLI installation or real model behavior.
if (process.env.PIJ_NATIVE_EXTENSION_TEST === "1") {
	const sdk = `
    const emit = (event) => console.error('TEST_EVENT ' + JSON.stringify(event));
    export async function joinSession(config) {
      if (process.env.PIJ_NATIVE_TEST_JOIN_FAIL === '1') throw new Error('Fixture join unsupported');
      const session = {
        sessionId: process.env.SESSION_ID,
        on() { return () => {}; },
        async send(input) { emit({kind:'native-send',input}); return 'native-shell-137'; },
        async log(message, options) { emit({kind:'native-log',message,options}); },
        async disconnect() {}
      };
      process.stdin.on('data', async (data) => {
        const input = JSON.parse(String(data));
        const result = await config.tools[0].handler(input, {sessionId:session.sessionId});
        emit({kind:'tool-result',result});
      });
      emit({kind:'joined', tools: config.tools.map((tool) => tool.name)});
      return session;
    }
  `;
	const processApi = `
    import { promisify } from 'node:util';
    export function execFile() { throw new Error('Use promisified fixture process probe'); }
    execFile[promisify.custom] = async (command, args) => {
      if (command !== 'ps') throw new Error('Unexpected process probe: ' + command);
      const pid = args[args.indexOf('-p') + 1];
      return {stdout: args.includes('lstart=') ? 'Sat Sep  5 12:00:00 2026\\n' : pid + ' 1 /fixture/copilot\\n', stderr:''};
    };
  `;
	registerHooks({
		resolve(specifier, context, next) {
			const source =
				specifier === "@github/copilot-sdk/extension"
					? sdk
					: specifier === "node:child_process"
						? processApi
						: undefined;
			return source === undefined
				? next(specifier, context)
				: { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
		},
	});
} else {
	async function launch(t, { daemon = true, key = true, joinFails = false } = {}) {
		const home = await mkdtemp(join(tmpdir(), "pij-native-shell-"));
		const requests = [];
		let registered;
		let claimed = false;
		let server;
		let port;
		if (key) await writeFile(join(home, "daemon.key"), "fixture-secret", { mode: 0o600 });
		if (daemon) {
			server = createServer(async (request, response) => {
				let raw = "";
				for await (const chunk of request) raw += chunk;
				const body = raw ? JSON.parse(raw) : undefined;
				requests.push({ path: request.url, body });
				assert.equal(request.headers.authorization, "Bearer fixture-secret");
				let data;
				if (request.url === "/v1/seats") data = { seats: [] };
				else if (request.url === "/v1/register") {
					registered = body;
					data = {
						id: body.id,
						harness: "copilot",
						session: body.harness_session,
						folder: body.folder,
						pane: null,
						proc: { pid: body.pid, proc_start: body.proc_start },
						native_extension_delivery: true,
					};
				} else if (request.url.startsWith("/v1/inbox?")) {
					const query = new URLSearchParams(request.url.split("?")[1]);
					assert.equal(query.get("seat"), registered.id);
					assert.equal(query.get("native_session"), registered.harness_session);
					assert.equal(Number(query.get("pid")), registered.pid);
					assert.equal(Number(query.get("proc_start")), registered.proc_start);
					data = claimed
						? []
						: [
								{
									job_id: 137,
									message: {
										msg_id: "shell-137",
										from: "pij-peer",
										to: registered.id,
										body: "SHELL_NONCE_137",
									},
									native_consumer: {
										native_session: registered.harness_session,
										pid: registered.pid,
										proc_start: registered.proc_start,
									},
								},
							];
					claimed = true;
				} else if (request.url === "/v1/inbox/ack") {
					assert.deepEqual(body, {
						seat: registered.id,
						job_id: 137,
						native_session: registered.harness_session,
						pid: registered.pid,
						proc_start: registered.proc_start,
					});
					data = 137;
				} else if (request.url === "/v1/send")
					data = { msg_id: body.msg_id, outcome: { outcome: "queued" }, at: 137 };
				else throw new Error(`Unexpected native endpoint ${request.url}`);
				response.setHeader("Content-Type", "application/json");
				response.end(JSON.stringify({ ok: true, v: 2, data }));
			});
			server.listen(0, "127.0.0.1");
			await once(server, "listening");
			port = server.address().port;
		}
		if (!daemon) {
			const reservation = createServer();
			reservation.listen(0, "127.0.0.1");
			await once(reservation, "listening");
			port = reservation.address().port;
			await new Promise((resolve) => reservation.close(resolve));
		}
		const env = {
			...process.env,
			HOME: home,
			COPILOT_HOME: join(home, "copilot"),
			PIJ_RS_STATE_DIR: home,
			PIJ_RS_ADDR: `127.0.0.1:${port}`,
			SESSION_ID: "native-shell-137",
			PIJ_NATIVE_EXTENSION_TEST: "1",
			PIJ_NATIVE_TEST_JOIN_FAIL: joinFails ? "1" : "0",
		};
		for (const name of ["TMUX", "TMUX_PANE", "PIJ_SESSION_ID", "PIJ_SPAWN_ID", "PIJ_PARENT_ID"])
			delete env[name];
		const child = spawn(
			process.execPath,
			[
				"--import",
				fileURLToPath(import.meta.url),
				fileURLToPath(new URL("./extension.mjs", import.meta.url)),
			],
			{ env, stdio: ["pipe", "pipe", "pipe"] },
		);
		t.after(async () => {
			if (child.exitCode === null && child.signalCode === null) {
				const exited = once(child, "exit");
				child.kill("SIGTERM");
				await exited;
			}
			server?.closeAllConnections();
			if (server) await new Promise((resolve) => server.close(resolve));
			await rm(home, { recursive: true, force: true });
		});
		const events = [];
		const emitter = new EventEmitter();
		let text = "";
		let stdout = "";
		child.stdout.on("data", (data) => {
			stdout += data;
		});
		child.stderr.on("data", (data) => {
			text += data;
			for (;;) {
				const end = text.indexOf("\n");
				if (end < 0) break;
				const line = text.slice(0, end);
				text = text.slice(end + 1);
				const prefix = line.startsWith("TEST_EVENT ")
					? "TEST_EVENT "
					: line.startsWith("[pij-native] ")
						? "[pij-native] "
						: undefined;
				if (prefix) {
					const event = JSON.parse(line.slice(prefix.length));
					events.push(event);
					emitter.emit("event", event);
				} else {
					const event = { kind: "stderr", line };
					events.push(event);
					emitter.emit("event", event);
				}
			}
		});
		async function waitFor(kind) {
			const signal = AbortSignal.timeout(5000);
			for (;;) {
				const found = events.find((event) => event.kind === kind);
				if (found) return found;
				await once(emitter, "event", { signal });
			}
		}
		return { child, events, requests, waitFor, stdout: () => stdout };
	}

	test("actual extension shell joins, registers, receives and exposes immutable outgoing tool", async (t) => {
		const f = await launch(t);
		const joined = await f.waitFor("joined");
		assert.deepEqual(joined.tools, ["pij_send"]);
		await f.waitFor("inbox-acknowledged");
		f.child.stdin.write(
			`${JSON.stringify({ to: "pij-peer", message: "SHELL_REPLY_137", from: "forged" })}\n`,
		);
		const result = await f.waitFor("tool-result");
		assert.equal(result.result.ok, true);
		const registration = f.requests.find((r) => r.path === "/v1/register").body;
		assert.equal(registration.harness, "copilot");
		assert.equal(registration.harness_session, "native-shell-137");
		assert.equal(f.requests.find((r) => r.path === "/v1/send").body.from, registration.id);
		assert.equal(f.events.filter((e) => e.kind === "native-send").length, 1);
		assert.match(f.events.find((e) => e.kind === "native-send").input.prompt, /SHELL_NONCE_137/);
		assert.equal(f.stdout(), "");
	});

	test("absent key does not block joined native tools and emits one native timeline diagnostic", async (t) => {
		const f = await launch(t, { daemon: false, key: false });
		await f.waitFor("joined");
		const notice = await f.waitFor("native-log");
		assert.match(notice.message, /^\[pij native\] unavailable:/);
		assert.deepEqual(notice.options, { level: "info" });
		// Cross multiple real backoff attempts, not a single failure observation.
		await sleep(850);
		assert.equal(f.events.filter((e) => e.kind === "native-log").length, 1);
		assert.equal(f.child.exitCode, null);
		f.child.stdin.write(`${JSON.stringify({ to: "pij-peer", message: "still callable" })}\n`);
		assert.equal((await f.waitFor("tool-result")).result.ok, false);
		assert.equal(f.stdout(), "");
	});

	test("absent daemon with readable key stays callable and quiet across network retries", async (t) => {
		const f = await launch(t, { daemon: false });
		await f.waitFor("joined");
		await f.waitFor("native-log");
		await sleep(850);
		assert.equal(f.events.filter((e) => e.kind === "native-log").length, 1);
		assert.equal(f.child.exitCode, null);
		f.child.stdin.write(`${JSON.stringify({ to: "pij-peer", message: "no daemon" })}\n`);
		assert.equal((await f.waitFor("tool-result")).result.ok, false);
	});

	test("prejoin rejection emits once to stderr without claiming native timeline visibility", async (t) => {
		const f = await launch(t, { daemon: false, key: false, joinFails: true });
		assert.match((await f.waitFor("stderr")).line, /^\[pij native\] unavailable: native-join/);
		assert.equal(f.events.filter((e) => e.kind === "native-log").length, 0);
		assert.equal(f.requests.length, 0);
	});

	test("native diagnostic sink counts one call per failure episode and never logs raw remote secrets", async () => {
		const lines = [];
		const report = createNativeReporter({
			log: async (message, options) => lines.push({ message, options }),
			capture: () => undefined,
		});
		for (let i = 0; i < 5; i++)
			await report({ kind: "reconnecting", diagnostic: "SECRET_SERVER_BODY" });
		assert.equal(lines.length, 1);
		await report({ kind: "connection-ready" });
		await report({ kind: "reconnecting", diagnostic: "SECRET_SERVER_BODY" });
		assert.equal(lines.length, 2);
		assert.ok(
			lines.every(
				(line) =>
					line.message.startsWith("[pij native] unavailable:") && !line.message.includes("SECRET"),
			),
		);
	});
}
