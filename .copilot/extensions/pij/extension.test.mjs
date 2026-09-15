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
      const listeners = new Set();
      let sends = 0;
      const history = [];
      const session = {
        sessionId: process.env.SESSION_ID,
        on(type, handler) {
          const listener = typeof type === 'function' ? type : (event) => { if (event.type === type) handler(event); };
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        async send(input) {
          emit({kind:'native-send',input});
          const nativeId = 'native-shell-' + (137 + sends++);
          history.push({type:'user.message', id:'user-' + nativeId, data:{messageId:nativeId}});
          return nativeId;
        },
        async getEvents() { return history; },
        async log(message, options) { emit({kind:'native-log',message,options}); },
        async disconnect() {}
      };
      process.stdin.on('data', async (data) => {
        const input = JSON.parse(String(data));
        if (input.nativeEvents) {
          for (const event of input.nativeEvents) {
            history.push(event);
            for (const listener of listeners) listener(event);
          }
          return;
        }
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
      if (command === 'tmux') return {stdout: process.ppid + '\\n', stderr:''};
      if (command !== 'ps') throw new Error('Unexpected process probe: ' + command);
      const pid = args[args.indexOf('-p') + 1];
      return {stdout: args.includes('lstart=') ? 'Sat Sep  5 12:00:00 2026\\n' : pid + ' 1 ' + process.env.PIJ_NATIVE_TEST_COMM + '\\n', stderr:''};
    };
  `;
	const kernelApi = `
    export async function readlink(path) {
      if (!/^\\/proc\\/\\d+\\/exe$/.test(path)) throw new Error('Unexpected executable probe');
      return process.env.PIJ_NATIVE_TEST_EXECUTABLE;
    }
  `;
	registerHooks({
		resolve(specifier, context, next) {
			const source =
				specifier === "@github/copilot-sdk/extension"
					? sdk
					: specifier === "node:child_process"
						? processApi
						: specifier === "node:fs/promises" && context.parentURL?.endsWith("/extension.mjs")
							? kernelApi
							: undefined;
			return source === undefined
				? next(specifier, context)
				: { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
		},
	});
} else {
	async function launch(
		t,
		{
			daemon = true,
			key = true,
			joinFails = false,
			processCommand = "/fixture/copilot",
			kernelExecutable = "/fixture/copilot",
			messages = 1,
			inboxPages = [],
			typingSnapshots = [],
			seats = [],
			remoteSeats = [],
			pane,
			requestedId,
			requestedSpawn,
			rosters = [],
			dropRegistrations = 0,
			registerResponses = [],
			registerRefusal,
		} = {},
	) {
		const home = await mkdtemp(join(tmpdir(), "pij-native-shell-"));
		const requests = [];
		let registered;
		let registeredView;
		let claimed = 0;
		let server;
		let port;
		if (key) await writeFile(join(home, "daemon.key"), "fixture-secret", { mode: 0o600 });
		if (daemon) {
			server = createServer(async (request, response) => {
				let raw = "";
				for await (const chunk of request) raw += chunk;
				const body = raw ? JSON.parse(raw) : undefined;
				requests.push({ path: request.url, method: request.method, body });
				const url = new URL(request.url, "http://127.0.0.1");
				assert.equal(request.headers.authorization, "Bearer fixture-secret");
				let data;
				let meta;
				let refusal;
				let status;
				if (url.pathname === "/v1/seats") {
					const local = rosters.length
						? rosters.shift()
						: registeredView
							? [...seats.filter((seat) => seat.id !== registeredView.id), registeredView]
							: seats;
					data = {
						seats: url.searchParams.get("scope") === "local" ? local : [...local, ...remoteSeats],
					};
				} else if (request.url === "/v1/register") {
					const next = registerResponses.shift();
					refusal = next?.refusal ?? registerRefusal;
					status = next?.status;
					registered = { ...body, id: body.id || registered?.id || "pij-bright-otter" };
					data = {
						id: registered.id,
						harness: "copilot",
						session: body.harness_session,
						folder: body.folder,
						pane: body.pane ?? null,
						parent: body.parent ?? null,
						spawn_id: body.spawn_id ?? null,
						proc: { pid: body.pid, proc_start: body.proc_start },
						native_extension_delivery: true,
						typing_grace_ms: 60000,
					};
					if (!refusal) registeredView = data;
					if (dropRegistrations-- > 0) {
						response.destroy();
						return;
					}
				} else if (request.url.startsWith("/v1/inbox?")) {
					const query = new URLSearchParams(request.url.split("?")[1]);
					assert.equal(query.get("seat"), registered.id);
					assert.equal(query.get("native_session"), registered.harness_session);
					assert.equal(Number(query.get("pid")), registered.pid);
					assert.equal(Number(query.get("proc_start")), registered.proc_start);
					if (inboxPages.length > 0) {
						({ data, meta, refusal } = inboxPages.shift());
					} else {
						data =
							claimed >= messages
								? []
								: [
										{
											job_id: 137 + claimed,
											message: {
												msg_id: `shell-${137 + claimed}`,
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
						claimed++;
					}
				} else if (url.pathname === "/v1/inbox/typing") {
					assert.equal(request.method, "GET");
					assert.equal(body, undefined);
					assert.deepEqual(Object.fromEntries(url.searchParams), {
						seat: registered.id,
						native_session: registered.harness_session,
						pid: String(registered.pid),
						proc_start: String(registered.proc_start),
					});
					const snapshot = typingSnapshots.shift() ?? {};
					data = {
						state: "observed",
						native_consumer: {
							native_session: registered.harness_session,
							pid: registered.pid,
							proc_start: registered.proc_start,
						},
						typing_grace_ms: 60000,
						observed_at_ms: 100000,
						semantic_hold: false,
						...(snapshot.state === "unavailable"
							? { reason: "native-typing-sensor-unavailable" }
							: { retry_after_ms: 0, source: "pane-observed-edit-recency" }),
						...snapshot,
					};
				} else if (["/v1/hold", "/v1/release"].includes(url.pathname)) {
					assert.fail("Native delivery never creates or releases typing holds");
				} else if (request.url === "/v1/inbox/ack") {
					assert.deepEqual(body, {
						seat: registered.id,
						job_id: 136 + claimed,
						native_session: registered.harness_session,
						pid: registered.pid,
						proc_start: registered.proc_start,
					});
					data = body.job_id;
				} else if (request.url === "/v1/send")
					data = { msg_id: body.msg_id, outcome: { outcome: "queued" }, at: 137 };
				else throw new Error(`Unexpected native endpoint ${request.url}`);
				response.setHeader("Content-Type", "application/json");
				response.statusCode = status ?? (refusal ? 400 : 200);
				response.end(JSON.stringify(refusal ?? { ok: true, v: 2, data, meta }));
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
			PIJ_NATIVE_TEST_COMM: processCommand,
			PIJ_NATIVE_TEST_EXECUTABLE: kernelExecutable,
		};
		for (const name of ["TMUX", "TMUX_PANE", "PIJ_SESSION_ID", "PIJ_SPAWN_ID", "PIJ_PARENT_ID"])
			delete env[name];
		if (pane !== undefined) env.TMUX_PANE = pane;
		if (requestedId !== undefined) env.PIJ_SESSION_ID = requestedId;
		if (requestedSpawn !== undefined) env.PIJ_SPAWN_ID = requestedSpawn;
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
		async function waitFor(kind, matches = () => true) {
			const signal = AbortSignal.timeout(5000);
			for (;;) {
				const found = events.find((event) => event.kind === kind && matches(event));
				if (found) return found;
				await once(emitter, "event", { signal });
			}
		}
		return { child, events, requests, waitFor, stdout: () => stdout };
	}

	test("actual extension shell joins, registers, receives and exposes immutable outgoing tool", async (t) => {
		const f = await launch(t, { typingSnapshots: [{ state: "unavailable" }] });
		const joined = await f.waitFor("joined");
		assert.deepEqual(joined.tools, ["pij_send"]);
		await f.waitFor("inbox-acknowledged");
		assert.deepEqual(
			f.requests
				.map((request) => new URL(request.path, "http://fixture").pathname)
				.filter((path) =>
					["/v1/inbox", "/v1/inbox/typing", "/v1/release", "/v1/inbox/ack"].includes(path),
				),
			["/v1/inbox", "/v1/inbox/typing", "/v1/inbox/ack"],
		);
		f.child.stdin.write(
			`${JSON.stringify({ to: "pij-peer", message: "SHELL_REPLY_137", from: "forged" })}\n`,
		);
		const result = await f.waitFor("tool-result");
		assert.equal(result.result.ok, true);
		const registration = f.requests.findLast((r) => r.path === "/v1/register").body;
		assert.equal(f.requests.find((r) => r.path === "/v1/register").body.id, "");
		assert.equal(registration.id, "pij-bright-otter");
		assert.equal(registration.harness, "copilot");
		assert.equal(registration.harness_session, "native-shell-137");
		assert.equal(f.requests.find((r) => r.path === "/v1/send").body.from, registration.id);
		assert.equal(f.events.filter((e) => e.kind === "native-send").length, 1);
		assert.match(f.events.find((e) => e.kind === "native-send").input.prompt, /SHELL_NONCE_137/);
		assert.equal(f.events.filter((event) => event.kind === "native-log").length, 0);
		assert.equal(f.stdout(), "");
	});

	test("Linux native host uses the kernel executable when comm is MainThread", {
		skip: process.platform !== "linux",
	}, async (t) => {
		const f = await launch(t, { processCommand: "MainThread" });
		await f.waitFor("inbox-acknowledged");
		assert.equal(f.requests.find((r) => r.path === "/v1/register").body.pid, process.pid);
	});

	test("Linux native host rejects a copilot task name on another executable", {
		skip: process.platform !== "linux",
	}, async (t) => {
		const f = await launch(t, { processCommand: "copilot", kernelExecutable: "/bin/sh" });
		await f.waitFor("native-log", (event) => /extension-unavailable/.test(event.message));
		assert.equal(f.requests.length, 0);
	});

	test("Linux replaced host reaches native registration and message acknowledgement", {
		skip: process.platform !== "linux",
	}, async (t) => {
		const f = await launch(t, {
			processCommand: "MainThread",
			kernelExecutable: "/opt/copilot (deleted)",
		});
		await f.waitFor("inbox-acknowledged");
		assert.equal(f.requests.find((r) => r.path === "/v1/register").body.pid, process.pid);
	});

	test("actual shell discovers local seats without remote pane collisions", async (t) => {
		const local = {
			id: "pij-local-native",
			harness: "copilot",
			session: "native-shell-137",
			pane: "%2",
			proc: { pid: process.pid + 2, proc_start: 20260905115900 },
			native_extension_delivery: true,
		};
		const remote = {
			id: "pij-remote-same-pane",
			harness: "omp",
			session: "remote-session",
			pane: "%2",
			proc: { pid: process.pid + 1, proc_start: 20260905115900 },
			native_extension_delivery: false,
		};
		const f = await launch(t, { pane: "%2", seats: [local], remoteSeats: [remote] });
		await f.waitFor("completion-wait");
		assert.deepEqual(
			f.requests.filter((r) => r.path.startsWith("/v1/seats")).map((r) => r.path),
			["/v1/seats?scope=local"],
		);
		const registration = f.requests.find((r) => r.path === "/v1/register").body;
		assert.equal(registration.id, local.id);
		assert.equal(registration.pid, process.pid);
		assert.equal(registration.pane, "%2");
		assert.equal(registration.supersedes, undefined);
		assert.equal(f.events.filter((e) => e.kind === "native-send").length, 1);
		assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 1);
		assert.equal(f.events.filter((e) => e.kind === "native-log").length, 0);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	test("actual extension shell acknowledges then waits for native completion before second delivery", async (t) => {
		const f = await launch(t, { messages: 2 });
		await f.waitFor("completion-wait", (e) => e.nativeMessageId === "native-shell-137");
		assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length, 1);
		assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 1);
		f.child.stdin.write(
			`${JSON.stringify({
				nativeEvents: [
					{
						type: "user.message",
						id: "user-shell-137",
						parentId: null,
						data: { messageId: "native-shell-137" },
					},
					{
						type: "session.idle",
						id: "idle-shell-137",
						parentId: "user-shell-137",
						ephemeral: true,
						data: {},
					},
				],
			})}\n`,
		);
		await f.waitFor("completion-wait", (e) => e.nativeMessageId === "native-shell-138");
		assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length, 2);
		assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 2);
		assert.equal(f.events.filter((e) => e.kind === "native-send").length, 2);
		assert.equal(f.events.filter((e) => e.kind === "native-completed").length, 1);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	// Native session sends are independent of typing recency and sensor availability.
	for (const [label, snapshot] of [
		["recent human typing", { retry_after_ms: 60000 }],
		["unavailable typing sensor", { state: "unavailable" }],
	]) {
		test(`actual extension shell delivers during ${label} without a typing hold`, async (t) => {
			const f = await launch(t, { typingSnapshots: [snapshot, snapshot] });
			await f.waitFor("completion-wait");
			assert.equal(f.requests.filter((request) => request.path === "/v1/hold").length, 0);
			assert.equal(f.requests.filter((request) => request.path === "/v1/release").length, 0);
			assert.equal(f.requests.filter((request) => request.path.startsWith("/v1/inbox?")).length, 1);
			assert.equal(f.requests.filter((request) => request.path === "/v1/inbox/ack").length, 1);
			const sends = f.events.filter((event) => event.kind === "native-send");
			assert.equal(sends.length, 1);
			assert.equal(sends[0].input.mode, "immediate");
			assert.match(sends[0].input.prompt, /msg_id="shell-137"/);
			assert.equal(
				f.events.some(({ kind }) =>
					["consent-held", "typing-sensor-wait", "receive-held"].includes(kind),
				),
				false,
			);
			const exited = once(f.child, "exit");
			f.child.stdin.end();
			assert.equal((await exited)[0], 0);
			assert.equal(f.stdout(), "");
		});
	}

	test("actual HTTP target-session hold stops claims and ack with actionable native diagnostic", async (t) => {
		const f = await launch(t, {
			inboxPages: [
				{
					data: [],
					meta: "native-consumer-held:native-target-session:original-native; resume that native session or use a new seat and intentionally reissue the message",
				},
			],
		});
		const notice = await f.waitFor("native-log");
		assert.match(notice.message, /queued work targets another native session/);
		assert.match(
			notice.message,
			/resume that native session or use a new seat and intentionally reissue/,
		);
		f.child.stdin.write(
			`${JSON.stringify({ to: "pij-peer", message: "OUTGOING_WHILE_TARGET_HELD" })}\n`,
		);
		assert.equal((await f.waitFor("tool-result")).result.ok, true);
		await sleep(350);
		assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length, 1);
		assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 0);
		assert.equal(f.requests.filter((r) => r.path === "/v1/send").length, 1);
		assert.equal(f.events.filter((e) => e.kind === "native-send").length, 0);
		assert.equal(f.events.filter((e) => e.kind === "native-log").length, 1);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	// Plan 137: consent and operator Hold still defer native delivery; typing does not.
	for (const reason of ["human-consent", "native-pane-changed", "semantic-hold"]) {
		test(`actual HTTP empty page differs from ${reason} hold and release delivers without another send`, async (t) => {
			const f = await launch(t, {
				inboxPages: [{ data: [] }, { data: [], meta: `native-consumer-held:${reason}` }],
			});
			const hold = await f.waitFor("consent-held");
			assert.equal(hold.reason, reason);
			assert.equal(hold.retryMs, 500);
			assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length, 2);
			assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 0);
			assert.equal(f.events.filter((e) => e.kind === "native-send").length, 0);
			await f.waitFor("completion-wait");
			assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length, 3);
			assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 1);
			assert.equal(f.events.filter((e) => e.kind === "native-send").length, 1);
			assert.equal(f.events.filter((e) => e.kind === "consent-held").length, 1);
			assert.equal(f.events.filter((e) => e.kind === "native-log").length, 0);
			const exited = once(f.child, "exit");
			f.child.stdin.end();
			assert.equal((await exited)[0], 0);
			assert.equal(f.stdout(), "");
		});
	}

	test("two-live native ambiguity refreshes until one live address remains beside tombstoned history", async (t) => {
		const candidate = {
			id: "pij-cold-candidate",
			harness: "copilot",
			session: "native-shell-137",
			proc: { pid: process.pid + 1, proc_start: 20260905115900 },
			native_extension_delivery: true,
		};
		const ambiguous = [candidate, { ...candidate, id: "pij-other-candidate" }];
		const resolved = [
			{ ...candidate, id: "pij-a-retired", tombstoned_at: 1 },
			{ ...candidate, id: "pij-b-retired", tombstoned_at: 2 },
			candidate,
		];
		const f = await launch(t, { rosters: [ambiguous, ambiguous, resolved] });
		await f.waitFor("native-log");
		assert.equal(f.requests.filter((r) => r.path === "/v1/register").length, 0);
		assert.equal(f.events.filter((e) => e.kind === "native-send").length, 0);
		await f.waitFor("completion-wait");
		assert.equal(f.requests.filter((r) => r.path === "/v1/seats?scope=local").length, 3);
		assert.equal(f.requests.filter((r) => r.path === "/v1/register").length, 1);
		assert.equal(f.requests.find((r) => r.path === "/v1/register").body.id, candidate.id);
		assert.equal(f.events.filter((e) => e.kind === "native-log").length, 1);
		assert.equal(f.requests.find((r) => r.path === "/v1/inbox/ack").body.seat, candidate.id);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	test("spawned extension consumes and sends under allocated id and parent instead of saved session", async (t) => {
		const saved = {
			id: "pij-saved-session",
			harness: "copilot",
			session: "native-shell-137",
			pane: "%1",
			proc: { pid: process.pid + 1, proc_start: 20260905115900 },
			spawn_id: "saved-spawn",
			parent: "pij-saved-parent",
			native_extension_delivery: true,
		};
		const prebind = {
			id: "pij-allocated-child",
			harness: "copilot",
			session: null,
			proc: null,
			pane: "%2",
			spawn_id: "allocated-spawn",
			parent: "pij-allocated-parent",
			native_extension_delivery: false,
		};
		const f = await launch(t, {
			seats: [saved, prebind],
			pane: prebind.pane,
			requestedId: prebind.id,
			requestedSpawn: prebind.spawn_id,
		});
		await f.waitFor("completion-wait");
		const registered = f.requests.find((r) => r.path === "/v1/register").body;
		assert.equal(registered.id, prebind.id);
		assert.equal(registered.parent, prebind.parent);
		assert.equal(registered.spawn_id, prebind.spawn_id);
		assert.equal(f.requests.find((r) => r.path === "/v1/inbox/ack").body.seat, prebind.id);
		assert.match(f.events.find((e) => e.kind === "native-send").input.prompt, /shell-137/);
		f.child.stdin.write(`${JSON.stringify({ to: "pij-peer", message: "SPAWNED_CHILD_REPLY" })}\n`);
		assert.equal((await f.waitFor("tool-result")).result.ok, true);
		assert.equal(f.requests.find((r) => r.path === "/v1/send").body.from, prebind.id);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	test("retired native attachment retains its durable id across dropped registration response", async (t) => {
		const retired = {
			id: "pij-copilot-0123456789abcdef01234567",
			harness: "copilot",
			session: "native-shell-137",
			proc: { pid: process.pid, proc_start: 20260905120000 },
			native_extension_delivery: false,
			tombstoned_at: 1,
			state: "tombstoned",
		};
		const f = await launch(t, { seats: [retired], dropRegistrations: 1 });
		await f.waitFor("completion-wait");
		const attempts = f.requests.filter((r) => r.path === "/v1/register");
		assert.equal(attempts.length, 2);
		assert.deepEqual(
			attempts.map((attempt) => attempt.body.id),
			[retired.id, retired.id],
		);
		assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 1);
		assert.equal(f.events.filter((e) => e.kind === "native-send").length, 1);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	test("actual HTTP 409 registration retry retains the native id and later consumes queued work", async (t) => {
		const previous = {
			id: "pij-resuming-native",
			harness: "copilot",
			session: "native-shell-137",
			proc: { pid: process.pid + 1, proc_start: 20260905115900 },
			native_extension_delivery: true,
		};
		const refusal = {
			ok: false,
			v: 2,
			command: "pij register",
			error: "refused",
			details: { retryable: true },
			meta: "registration temporarily unavailable",
		};
		const f = await launch(t, {
			seats: [previous],
			registerResponses: [
				{ status: 409, refusal },
				{ status: 409, refusal },
			],
		});
		await f.waitFor("native-log");
		assert.equal(
			f.events.some((event) => ["receive-held", "extension-unavailable"].includes(event.kind)),
			false,
		);
		await f.waitFor("completion-wait");
		assert.deepEqual(
			f.requests
				.filter((request) => request.path === "/v1/register")
				.map((request) => request.body.id),
			[previous.id, previous.id, previous.id],
		);
		assert.equal(
			f.requests.find((request) => request.path === "/v1/inbox/ack").body.seat,
			previous.id,
		);
		assert.equal(f.events.filter((event) => event.kind === "native-send").length, 1);
		assert.equal(
			f.events.some((event) => ["receive-held", "extension-unavailable"].includes(event.kind)),
			false,
		);
		f.child.stdin.write(`${JSON.stringify({ to: "pij-peer", message: "RESUMED_REPLY" })}\n`);
		assert.equal((await f.waitFor("tool-result")).result.ok, true);
		assert.equal(f.requests.find((request) => request.path === "/v1/send").body.from, previous.id);
	});

	test("actual HTTP native-unavailable refusal re-registers and consumes queued work", async (t) => {
		const f = await launch(t, {
			inboxPages: [
				{
					refusal: {
						ok: false,
						v: 2,
						command: "pij inbox",
						error: "refused",
						meta: "daemon/native-inbox: native-extension-unavailable: Copilot requires current native registration",
					},
				},
			],
		});
		const notice = await f.waitFor("native-log");
		assert.match(notice.message, /unavailable: reconnecting;.*retrying when available/);
		assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 0);
		assert.equal(f.events.filter((event) => event.kind === "native-send").length, 0);
		await f.waitFor("completion-wait");
		const registrations = f.requests.filter((r) => r.path === "/v1/register");
		assert.equal(registrations.length, 3);
		assert.deepEqual(registrations[1].body, registrations[2].body);
		assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length, 2);
		assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 1);
		// Re-registration no longer polls typing readiness; only the fresh claim checks semantic consent.
		assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox/typing?")).length, 1);
		assert.equal(f.events.filter((event) => event.kind === "native-send").length, 1);
		assert.equal(f.events.filter((event) => event.kind === "native-log").length, 1);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	test("actual HTTP stale native refusal stays held without reregister or acknowledgement", async (t) => {
		const f = await launch(t, {
			inboxPages: [
				{
					refusal: {
						ok: false,
						v: 2,
						command: "pij inbox",
						error: "refused",
						meta: "daemon/native-inbox: native incarnation mismatch: native_session, pid and proc_start must match the current Copilot seat",
					},
				},
			],
		});
		const notice = await f.waitFor("native-log");
		assert.match(
			notice.message,
			/unavailable: receive-held;.*do not blindly resend or acknowledge/,
		);
		await sleep(350);
		assert.equal(f.requests.filter((r) => r.path === "/v1/register").length, 2);
		assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length, 1);
		assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, 0);
		assert.equal(f.events.filter((event) => event.kind === "native-send").length, 0);
		assert.equal(f.events.filter((event) => event.kind === "native-log").length, 1);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	test("actual native rollover registers a new seat and consumes successor-targeted work", async (t) => {
		const predecessor = {
			id: "pij-predecessor",
			harness: "copilot",
			session: "native-shell-before",
			folder: "/work",
			pane: null,
			proc: { pid: process.pid, proc_start: 20260905120000 },
			native_extension_delivery: true,
		};
		const f = await launch(t, { seats: [predecessor] });
		await f.waitFor("completion-wait");
		const allocation = f.requests.find((r) => r.path === "/v1/register").body;
		assert.equal(allocation.supersedes, predecessor.id);
		assert.equal(allocation.id, "");
		const successor = f.requests.findLast((r) => r.path === "/v1/register").body;
		assert.notEqual(successor.id, predecessor.id);
		assert.equal(successor.harness_session, "native-shell-137");
		const requests = f.requests.filter((r) => r.path.startsWith("/v1/inbox?"));
		assert.equal(requests.length, 1);
		assert.equal(new URLSearchParams(requests[0].path.split("?")[1]).get("seat"), successor.id);
		assert.equal(f.requests.find((r) => r.path === "/v1/inbox/ack").body.seat, successor.id);
		assert.equal(f.events.filter((event) => event.kind === "native-send").length, 1);
		assert.match(
			f.events.find((event) => event.kind === "native-send").input.prompt,
			/SHELL_NONCE_137/,
		);
		const exited = once(f.child, "exit");
		f.child.stdin.end();
		assert.equal((await exited)[0], 0);
		assert.equal(f.stdout(), "");
	});

	test("terminal bootstrap refusal names safe failure and restart without exposing remote text", async (t) => {
		const f = await launch(t, {
			registerRefusal: {
				ok: false,
				v: 2,
				command: "pij register",
				error: "refused",
				meta: "SECRET_REMOTE_TEXT",
			},
		});
		const notice = await f.waitFor("native-log");
		assert.match(
			notice.message,
			/extension-unavailable; native registration failed: Pij HTTP 400; no retry is scheduled/,
		);
		assert.match(notice.message, /restart the Copilot CLI/);
		assert.doesNotMatch(notice.message, /retrying when available|SECRET_REMOTE_TEXT/);
		assert.equal(f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length, 0);
	});

	for (const refused of [false, true]) {
		test(`actual shell cold resume nomination ${refused ? "respects registration refusal" : "retains address through HTTP"}`, async (t) => {
			const previous = {
				id: "pij-existing-native-address",
				harness: "copilot",
				session: "native-shell-137",
				folder: "/work",
				pane: null,
				proc: { pid: process.pid + 1, proc_start: 20260905115900 },
				native_extension_delivery: true,
			};
			const f = await launch(t, {
				seats: [previous],
				registerRefusal: refused
					? {
							ok: false,
							v: 2,
							command: "pij register",
							error: "refused",
							meta: "fixture: previous native incarnation still alive",
						}
					: undefined,
			});
			await f.waitFor(refused ? "native-log" : "completion-wait");
			const selected = f.requests.find((r) => r.path === "/v1/register").body;
			assert.equal(selected.id, previous.id);
			assert.equal(selected.harness_session, previous.session);
			assert.notEqual(selected.pid, previous.proc.pid);
			assert.notEqual(selected.proc_start, previous.proc.proc_start);
			assert.equal(selected.supersedes, undefined);
			assert.equal(f.events.filter((e) => e.kind === "native-send").length, refused ? 0 : 1);
			assert.equal(
				f.requests.filter((r) => r.path.startsWith("/v1/inbox?")).length,
				refused ? 0 : 1,
			);
			assert.equal(f.requests.filter((r) => r.path === "/v1/inbox/ack").length, refused ? 0 : 1);
			const exited = once(f.child, "exit");
			f.child.stdin.end();
			assert.equal((await exited)[0], 0);
			assert.equal(f.stdout(), "");
		});
	}

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
