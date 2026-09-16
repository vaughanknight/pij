import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	createReadStream,
	existsSync,
	closeSync,
	mkdirSync,
	mkdtempSync,
	openSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { startFixtureProvider } from "../../../harness/scripts/copilot-native-fixture.js";

/*
 * Run with the worktree's tsx (no build/install performed here):
 * node --import tsx docs/plans/154-tombstone-lift-all-harnesses/tombstone-lift-live.ts \
 *   --pij-bin /absolute/baseline-or-current/pij-rs --omp-bin /absolute/omp-or-canary \
 *   --receipt /absolute/new-receipt.json --label baseline --allow-recreated-pane-address
 *
 * Prerequisites: real OMP supporting --no-extensions plus explicit -e, --resume,
 * models.yml and the Pi extension API; tmux; worktree extension dependencies.
 * A canary is selected ONLY with --omp-bin; nothing is installed or linked globally.
 * RED exits 1 with failed behavioral checks, GREEN exits 0; precondition failures
 * are distinguished from either. Never count a precondition failure as RED.
 *
 * IMPORTANT: the canonical two-witness reaper vetoes even a dead retained pane.
 * Thus this is explicitly reboot-shaped: after real OMP death and pane removal,
 * the sweep sees absence; a restarted private tmux server recreates the original
 * pane ADDRESS: recreated pane incarnation, not original physical pane.
 * Prime approved this reboot-shaped AC5 interpretation; the required flag keeps it explicit.
 *
 * PrivateGovernanceFixture was examined: its fixed current binary, build fallback,
 * and two inert panes cannot select a baseline or perform this cold tmux restart.
 * Keep its allowlisted environment/owned-child pattern; reuse the existing local
 * provider rather than introduce another provider or simulated extension/runtime.
 */
const project = resolve(import.meta.dirname, "../../..");
const flags = new Map<string, string>();
let acknowledged = false;
for (let i = 2; i < process.argv.length; i++) {
	const key = process.argv[i]!;
	if (key === "--allow-recreated-pane-address") {
		acknowledged = true;
		continue;
	}
	assert(
		["--pij-bin", "--omp-bin", "--receipt", "--label"].includes(key),
		`unknown argument ${key}`,
	);
	const value = process.argv[++i];
	assert(value && !value.startsWith("--") && !flags.has(key), `missing or duplicate ${key}`);
	flags.set(key, value);
}
assert(
	acknowledged,
	"require --allow-recreated-pane-address after accepting the documented reboot-shaped proof scope",
);
for (const key of ["--pij-bin", "--omp-bin", "--receipt"])
	assert(flags.has(key), `required ${key}`);
const binary = realpathSync(resolve(flags.get("--pij-bin")!));
const omp = realpathSync(resolve(flags.get("--omp-bin")!));
const output = resolve(flags.get("--receipt")!);
// Reserve the receipt before any side effects; a completed or interrupted run is never overwritten.
const receiptFd = openSync(output, "wx", 0o600);
const run = mkdtempSync("/tmp/p154-");
const home = join(run, "home"),
	state = join(run, "state"),
	cwd = join(run, "workspace");
const agentDir = join(home, ".omp/agent"),
	sessions = join(run, "sessions");
const socket = join(run, "tmux.sock"),
	observer = join(run, "observe.mjs");
const observations = join(run, "extension.jsonl"),
	config = join(run, "config.yml");
const extension = realpathSync(join(project, ".pi/extensions/pij/index.ts"));
const LIMIT = 32_768,
	WAIT = 60_000;
type Facts = Record<string, unknown>;
interface Claim {
	id: string;
	harness: string;
	harness_session: string;
	pid: number;
	proc_start: number;
	pane: string;
	extension_path: string;
	spawn_id?: string;
}
interface Descriptor {
	id: string;
	session: string | null;
	proc: { pid: number; proc_start: number } | null;
	tombstoned_at?: number;
	tombstone_reason?: string;
}
interface Envelope<T = unknown> {
	ok: boolean;
	data?: T;
	error?: string;
	meta?: string;
}
interface StateCard {
	liveness: string;
	tombstonedAt: number | null;
}
interface Command {
	program: string;
	args: string[];
	cwd: string;
	at: string;
	stdout: string;
	stderr: string;
	pid?: number;
	exit?: number | null;
	signal?: string | null;
	ended_at?: string;
	error?: string;
}
interface Registration {
	at: string;
	claim: Claim;
	raw_request: string;
	http_status: number;
	envelope: Envelope<Descriptor>;
	raw_response: string;
}
interface Observation {
	type: string;
	at: string;
	pid: number;
	launch: string;
	session: string;
	session_file?: string;
	message?: { role?: string; customType?: string; content?: unknown };
}
interface Frame {
	event?: { kind: string; seat?: string; payload: string };
}
interface Host {
	launch: string;
	pane: string;
	pid: number;
	server_pid: number;
	terminal?: string;
}
interface Receipt extends Facts {
	commands: Command[];
	registrations: Registration[];
	lifecycle: Facts[];
	checks: { name: string; passed: boolean; actual: unknown }[];
	teardown: { name: string; ok: boolean; error?: string }[];
	status?: string;
	error?: string;
	event_error?: string;
}
const receipt: Receipt = {
	version: 1,
	label: flags.get("--label") ?? "current",
	command: [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
	started_at: new Date().toISOString(),
	run,
	home,
	state,
	cwd,
	socket,
	scope: "recreated pane incarnation, not original physical pane",
	provider:
		"existing deterministic loopback OpenAI fixture; no production credentials or network inference",
	commands: [],
	registrations: [],
	lifecycle: [],
	checks: [],
	teardown: [],
};
const env: NodeJS.ProcessEnv = {
	PATH: process.env.PATH ?? "/usr/bin:/bin:/opt/homebrew/bin",
	HOME: home,
	SHELL: "/bin/sh",
	TERM: "xterm-256color",
	LC_ALL: "C",
	TMPDIR: join(run, "tmp"),
	TMUX_TMPDIR: run,
	PI_CODING_AGENT_DIR: agentDir,
	PI_CONFIG_DIR: join(home, ".omp"),
	OMP_CONFIG_DIR: join(home, ".omp"),
	XDG_CONFIG_HOME: join(home, ".config"),
	XDG_DATA_HOME: join(home, ".local/share"),
	XDG_STATE_HOME: join(home, ".local/state"),
	XDG_CACHE_HOME: join(home, ".cache"),
	CLAUDE_CONFIG_DIR: join(home, ".claude"),
	COPILOT_HOME: join(home, ".copilot"),
	COPILOT_CONFIG_DIR: join(home, ".copilot"),
	CODEX_HOME: join(home, ".codex"),
	PIJ_HOME: join(home, ".pij"),
	PIJ_RS_STATE_DIR: state,
	PIJ_DAEMON_GENERATION: "rs",
	PIJ_RS_DEATH_SWEEP_MS: "250",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_SYSTEM: "/dev/null",
	PIJ_154_OBSERVATIONS: observations,
};
const bounded = (text: string) =>
	text.length > LIMIT ? `[earlier output omitted]\n${text.slice(-LIMIT)}` : text;
const record = (stage: string, facts: Facts) =>
	receipt.lifecycle.push({ stage, at: new Date().toISOString(), ...facts });
const check = (name: string, passed: boolean, actual: unknown) =>
	receipt.checks.push({ name, passed, actual });
async function hash(path: string): Promise<string> {
	const value = createHash("sha256");
	for await (const bytes of createReadStream(path)) value.update(bytes);
	return value.digest("hex");
}
async function treeHash(root: string): Promise<{ path: string; sha256: string; files: number }> {
	const digest = createHash("sha256");
	let files = 0;
	async function visit(folder: string): Promise<void> {
		for (const entry of readdirSync(join(root, folder), { withFileTypes: true }).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			if (entry.name === "node_modules") continue;
			const name = join(folder, entry.name);
			if (entry.isDirectory()) await visit(name);
			else if (entry.isFile() && /\.(ts|mjs|json)$/.test(name)) {
				digest.update(`${name}\0${await hash(join(root, name))}\n`);
				files++;
			}
		}
	}
	await visit("");
	return { path: root, sha256: digest.digest("hex"), files };
}
async function until<T>(
	what: string,
	read: () => Promise<T | undefined> | T | undefined,
	timeout = WAIT,
): Promise<T> {
	const deadline = Date.now() + timeout;
	while (Date.now() < deadline) {
		if (interrupted) throw new Error(interrupted);
		const value = await read();
		if (value !== undefined) return value;
		await delay(100);
	}
	throw new Error(`timeout waiting for ${what}`);
}
type Owned = { child: ChildProcess; row: Command; done: Promise<void>; closed: boolean };
const children: Owned[] = [];
function start(program: string, args: string[], childEnv = env): Owned {
	const row: Command = { program, args, cwd, at: new Date().toISOString(), stdout: "", stderr: "" };
	receipt.commands.push(row);
	const child = spawn(program, args, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
	const owned = { child, row, closed: false } as Owned;
	row.pid = child.pid;
	child.stdout?.on("data", (chunk) => {
		row.stdout = bounded(row.stdout + chunk.toString());
	});
	child.stderr?.on("data", (chunk) => {
		row.stderr = bounded(row.stderr + chunk.toString());
	});
	child.on("error", (error) => {
		row.error = String(error);
	});
	owned.done = new Promise((done) =>
		child.once("close", (code, signal) => {
			owned.closed = true;
			Object.assign(row, { exit: code, signal, ended_at: new Date().toISOString() });
			done();
		}),
	);
	children.push(owned);
	return owned;
}
async function settled(child: Owned, ms: number): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			child.done.then(() => true),
			new Promise<boolean>((ok) => {
				timer = setTimeout(() => ok(false), ms);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}
async function stop(child: Owned): Promise<void> {
	if (!child.closed) child.child.kill("SIGTERM");
	if (!(await settled(child, 5_000))) {
		child.child.kill("SIGKILL");
		assert(await settled(child, 5_000), `owned child ${child.child.pid} did not reap`);
	}
}
async function command(
	program: string,
	args: string[],
	childEnv = env,
	required = true,
): Promise<Command> {
	const child = start(program, args, childEnv);
	if (!(await settled(child, 15_000))) {
		await stop(child);
		throw new Error(`command timeout: ${program} ${args.join(" ")}`);
	}
	if (required) assert.equal(child.row.exit, 0, JSON.stringify(child.row));
	return child.row;
}
const tmux = async (args: string[], required = true) =>
	command("tmux", ["-S", socket, ...args], env, required);
let interrupted: string | undefined;
const interrupt = (signal: string) => {
	interrupted = `interrupted by ${signal}`;
};
const sigint = () => interrupt("SIGINT"),
	sigterm = () => interrupt("SIGTERM");
process.on("SIGINT", sigint);
process.on("SIGTERM", sigterm);
let daemon: Owned | undefined, mux: Owned | undefined, proxy: Server | undefined;
let provider: Awaited<ReturnType<typeof startFixtureProvider>> | undefined;
let daemonAddr = "",
	key = "",
	primaryPane = "",
	peerPane = "";
const ownedHosts: Host[] = [];
const eventAbort = new AbortController();
let eventTask: Promise<void> | undefined;
const frames: Frame[] = [];
async function listen(server: Server): Promise<number> {
	await new Promise<void>((ok, fail) => {
		server.once("error", fail);
		server.listen(0, "127.0.0.1", ok);
	});
	const address = server.address();
	assert(address && typeof address !== "string");
	assert.notEqual(address.port, 7461, "never bind production port");
	return address.port;
}
async function closeServer(server: Server): Promise<void> {
	server.closeAllConnections();
	await new Promise<void>((ok, fail) => server.close((error) => (error ? fail(error) : ok())));
}
async function api<T>(path: string): Promise<Envelope<T>> {
	const answer = await fetch(`http://${daemonAddr}${path}`, {
		headers: { Authorization: `Bearer ${key}` },
		signal: AbortSignal.timeout(5_000),
	});
	const body = (await answer.json()) as Envelope<T>;
	assert(answer.ok && body.ok, JSON.stringify({ status: answer.status, body }));
	return body;
}
function data<T>(envelope: Envelope<T>): T {
	assert(
		envelope.ok && envelope.data !== undefined,
		`missing successful envelope data: ${JSON.stringify(envelope)}`,
	);
	return envelope.data;
}
// The public roster intentionally omits retired rows. Observe our private
// authoritative store read-only; never manufacture a lifecycle transition.
const seat = async (id: string): Promise<Descriptor> => {
	const db = new DatabaseSync(join(state, "pij.sqlite"), { readOnly: true });
	try {
		const row = db.prepare("SELECT * FROM seats WHERE id = ?").get(id);
		assert(row, `missing stored seat ${id}`);
		return {
			...row,
			id: String(row.id),
			session: row.harness_session === null ? null : String(row.harness_session),
			proc: row.pid === null ? null : { pid: Number(row.pid), proc_start: Number(row.proc_start) },
			tombstoned_at: row.tombstoned_at === null ? undefined : Number(row.tombstoned_at),
			tombstone_reason: row.tombstone_reason === null ? undefined : String(row.tombstone_reason),
		};
	} finally {
		db.close();
	}
};
function observed(): Observation[] {
	if (!existsSync(observations)) return [];
	const text = readFileSync(observations, "utf8");
	return text
		.slice(0, text.lastIndexOf("\n"))
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line) as Observation);
}
async function capture(pane: string): Promise<string> {
	return (await tmux(["capture-pane", "-p", "-J", "-S", "-120", "-t", pane])).stdout;
}
async function* streamBytes(body: NonNullable<Response["body"]>): AsyncGenerator<Uint8Array> {
	const reader = body.getReader();
	try {
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) return;
			yield chunk.value;
		}
	} finally {
		reader.releaseLock();
	}
}
async function startMux(): Promise<void> {
	mux = start("tmux", ["-S", socket, "-f", "/dev/null", "-D"]);
	await until("owned foreground tmux", async () => {
		assert(!mux!.closed, JSON.stringify(mux!.row));
		return (await tmux(["show-options", "-s", "exit-empty"], false)).exit === 0 ? true : undefined;
	});
	await tmux(["set-option", "-g", "remain-on-exit", "on"]);
	// Keep an empty REAL server available for the reaper's successful empty listing.
	await tmux(["set-option", "-s", "exit-empty", "off"]);
	env.TMUX = `${socket},${mux.child.pid},0`;
}
async function launchPane(name: string, resume?: string, claim?: string): Promise<string> {
	const args = [
		omp,
		"--no-extensions",
		"-e",
		observer,
		"-e",
		extension,
		"--no-skills",
		"--no-rules",
		"--no-title",
		"--no-tools",
		"--no-lsp",
		"--no-pty",
		"--thinking",
		"off",
		"--model",
		"p154/pij-native-fixture",
		"--session-dir",
		sessions,
		"--config",
		config,
	];
	if (resume) args.push("--resume", resume);
	const launch = [
		"/usr/bin/env",
		`PIJ_154_LAUNCH=${name}`,
		...(claim ? [`PIJ_SESSION_ID=${claim}`] : []),
		...args,
	];
	const verb =
		name === "peer"
			? ["new-window", "-t", "lift154:"]
			: ["new-session", "-s", "lift154", "-x", "160", "-y", "48"];
	const result = await tmux([
		...verb,
		"-d",
		"-P",
		"-F",
		"#{pane_id}|#{pane_pid}|#{socket_path}|#{pid}",
		"-n",
		name,
		"-c",
		cwd,
		...launch,
	]);
	const [pane, pid, actualSocket, serverPid] = result.stdout.trim().split("|");
	assert(
		pane && /^%\d+$/.test(pane) && actualSocket === socket && Number(serverPid) === mux!.child.pid,
		result.stdout,
	);
	ownedHosts.push({ launch: name, pane, pid: Number(pid), server_pid: Number(serverPid) });
	// An inert, unadopted anchor keeps list-panes a successful real observation
	// after the OMP pane disappears. It never contributes a session/process claim.
	if (name !== "peer")
		await tmux(["new-window", "-d", "-t", "lift154:", "-n", "anchor", "/bin/sleep", "3600"]);
	return pane;
}
async function registrationFor(name: string, pane: string): Promise<Registration> {
	const lifecycle = await until(`${name} actual OMP session`, () =>
		observed().find((event) => event.launch === name && event.type === "session_start"),
	);
	const registration = await until(`${name} extension HTTP registration`, () =>
		receipt.registrations.find(
			(row) => row.claim.pid === lifecycle.pid && row.claim.harness_session === lifecycle.session,
		),
	);
	assert.equal(registration.claim.harness, "omp");
	assert.equal(registration.claim.pane, pane);
	assert.equal(registration.claim.extension_path, dirname(extension));
	assert.equal(
		registration.claim.pid,
		ownedHosts.find((host) => host.launch === name)!.pid,
		"launch the actual OMP executable directly; pane PID must be the extension host",
	);
	assert.equal(
		registration.claim.spawn_id,
		undefined,
		"no spawn-token shortcut may prove this session continuity",
	);
	assert(
		Number.isSafeInteger(registration.claim.proc_start) && registration.claim.proc_start > 0,
		"real process incarnation required",
	);
	record(name, { lifecycle, registration, terminal: await capture(pane) });
	return registration;
}
async function killHost(pane: string, claim: Claim): Promise<void> {
	const witness = (
		await tmux([
			"display-message",
			"-p",
			"-t",
			pane,
			"#{pane_pid}|#{pane_dead}|#{pid}|#{socket_path}",
		])
	).stdout.trim();
	assert.equal(
		witness,
		`${claim.pid}|0|${mux!.child.pid}|${socket}`,
		"only signal the verified OMP host in our owned pane/server",
	);
	const processBefore = await command("ps", [
		"-p",
		String(claim.pid),
		"-o",
		"pid=,ppid=,lstart=,command=",
	]);
	process.kill(claim.pid, "SIGKILL");
	const terminalExit = await until("owned OMP death", async () => {
		const value = (
			await tmux([
				"display-message",
				"-p",
				"-t",
				pane,
				"#{pane_dead}|#{pane_dead_status}|#{pane_dead_signal}",
			])
		).stdout.trim();
		return value.startsWith("1|") ? value : undefined;
	});
	const dead = await command(
		"ps",
		["-p", String(claim.pid), "-o", "pid=,lstart=,command="],
		env,
		false,
	);
	assert.equal(dead.exit, 1, "real OMP process must be absent after SIGKILL");
	record("process-death", {
		pane,
		pid: claim.pid,
		signal: "SIGKILL",
		process_before: processBefore.stdout,
		terminal_exit: terminalExit,
		absent_process_exit: dead.exit,
		terminal: await capture(pane),
	});
	await tmux(["kill-pane", "-t", pane]);
}
async function swept(id: string): Promise<Descriptor> {
	const retired = await until("canonical observed-dead tombstone", async () => {
		const row = await seat(id);
		return row.tombstoned_at != null ? row : undefined;
	});
	assert.equal(retired.tombstone_reason, "observed-dead");
	await until("canonical seat.tombstone event", () =>
		frames.find((frame) => frame.event?.kind === "seat.tombstone" && frame.event?.seat === id),
	);
	record("canonical-sweep", {
		descriptor: retired,
		panes: (await tmux(["list-panes", "-a", "-F", "#{pane_id}"])).stdout,
	});
	return retired;
}
try {
	for (const path of [home, state, cwd, agentDir, sessions, env.TMPDIR!])
		mkdirSync(path, { recursive: true, mode: 0o700 });
	receipt.runtime = {
		pij: { path: binary, sha256: await hash(binary) },
		omp: { path: omp, sha256: await hash(omp) },
		driver_sha256: await hash(import.meta.filename),
		extension: await treeHash(dirname(extension)),
		provider_sha256: await hash(join(project, "harness/scripts/copilot-native-fixture.ts")),
	};
	await command(omp, ["--version"]);
	await command("tmux", ["-V"]);
	provider = await startFixtureProvider();
	assert.notEqual(new URL(provider.url).port, "7461");
	receipt.provider_url = provider.url;
	writeFileSync(
		join(agentDir, "models.yml"),
		JSON.stringify({
			providers: {
				p154: {
					api: "openai-completions",
					baseUrl: provider.url,
					apiKey: "isolated-fixture-not-a-secret",
					models: [
						{
							id: "pij-native-fixture",
							name: "Plan 154 local deterministic fixture",
							reasoning: false,
							input: ["text"],
							contextWindow: 128000,
							maxTokens: 4096,
							cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
						},
					],
				},
			},
		}),
	);
	writeFileSync(
		config,
		JSON.stringify({
			startup: { setupWizard: false, checkUpdate: false },
			marketplace: { autoUpdate: "off" },
			memory: { backend: "off" },
			mcp: { enableProjectConfig: false },
		}),
	);
	// Passive API observer only: never changes a claim, emits a message, or creates a session.
	writeFileSync(
		observer,
		`import { appendFileSync } from "node:fs";
export default function(pi) {
 let count = 0;
 for (const type of ["session_start", "message_start", "message_end", "agent_end"]) pi.on(type, (event, ctx) => {
  if (++count > 200) return;
  const row = { type, at: new Date().toISOString(), pid: process.pid, launch: process.env.PIJ_154_LAUNCH,
   session: ctx.sessionManager.getSessionId(), session_file: ctx.sessionManager.getSessionFile(), reason: event.reason,
   ...(event.message ? { message: event.message } : {}) };
  const line = JSON.stringify(row);
  appendFileSync(process.env.PIJ_154_OBSERVATIONS, line.length <= 32768 ? line + "\\n" : JSON.stringify({ ...row, message: { omitted: true, bytes: line.length } }) + "\\n");
 });
}
`,
	);
	const reservation = createServer();
	daemonAddr = `127.0.0.1:${await listen(reservation)}`;
	await closeServer(reservation);
	proxy = createServer(async (request, response) => {
		const abort = new AbortController();
		response.on("close", () => abort.abort());
		try {
			const chunks: Buffer[] = [];
			let size = 0;
			for await (const chunk of request) {
				const bytes = Buffer.from(chunk);
				size += bytes.length;
				assert(size <= 4 * 1024 * 1024, "oversized proxy request");
				chunks.push(bytes);
			}
			const body = Buffer.concat(chunks).toString();
			const upstream = await fetch(`http://${daemonAddr}${request.url}`, {
				method: request.method,
				headers: {
					Authorization: request.headers.authorization ?? "",
					"Content-Type": request.headers["content-type"] ?? "application/json",
				},
				...(body ? { body } : {}),
				signal: abort.signal,
			});
			response.writeHead(upstream.status, {
				"Content-Type": upstream.headers.get("content-type") ?? "application/json",
			});
			if (request.url === "/v1/register") {
				const text = await upstream.text();
				receipt.registrations.push({
					at: new Date().toISOString(),
					claim: JSON.parse(body) as Claim,
					raw_request: body,
					http_status: upstream.status,
					envelope: JSON.parse(text) as Envelope<Descriptor>,
					raw_response: text,
				});
				response.end(text);
			} else {
				response.flushHeaders();
				if (upstream.body)
					for await (const bytes of streamBytes(upstream.body)) response.write(bytes);
				response.end();
			}
		} catch (error) {
			if (!response.destroyed) {
				if (!response.headersSent) response.writeHead(502);
				response.end(String(error));
			}
		}
	});
	const proxyAddr = `127.0.0.1:${await listen(proxy)}`;
	Object.assign(env, { PIJ_RS_ADDR: proxyAddr, PIJ_RS_BIND: daemonAddr });
	Object.assign(receipt, { daemon_address: daemonAddr, extension_proxy_address: proxyAddr });
	await startMux();
	daemon = start(binary, ["--state-dir", state, "daemon", "--bind", daemonAddr]);
	await until("private all-real daemon", async () => {
		assert(!daemon!.closed, JSON.stringify(daemon!.row));
		if (!existsSync(join(state, "daemon.key"))) return undefined;
		key = readFileSync(join(state, "daemon.key"), "utf8").trim();
		try {
			const result = await api<{ offline: boolean }>("/health");
			assert.equal(data(result).offline, false);
			receipt.health = result;
			return true;
		} catch {
			return undefined;
		}
	});
	console.log(JSON.stringify({ stage: "ready", daemon_address: daemonAddr, receipt: output }));
	const eventResponse = await fetch(`http://${daemonAddr}/v1/events?scope=local`, {
		headers: { Authorization: `Bearer ${key}` },
		signal: eventAbort.signal,
	});
	const eventBody = eventResponse.body;
	assert(eventResponse.ok && eventBody, "real event stream must attach before spawning");
	assert(
		eventResponse.headers.get("content-type")?.includes("application/x-ndjson"),
		"use the real NDJSON event contract",
	);
	eventTask = (async () => {
		const decoder = new TextDecoder();
		let pending = "";
		for await (const bytes of streamBytes(eventBody)) {
			pending += decoder.decode(bytes, { stream: true });
			let boundary: number;
			while ((boundary = pending.indexOf("\n")) >= 0) {
				const line = pending.slice(0, boundary);
				pending = pending.slice(boundary + 1);
				if (line.trim()) {
					assert(frames.length < 2000, "event receipt bound exceeded");
					frames.push(JSON.parse(line) as Frame);
				}
			}
		}
	})().catch((error) => {
		if (!eventAbort.signal.aborted) receipt.event_error = String(error);
	});
	primaryPane = await launchPane("initial");
	const initial = await registrationFor("initial", primaryPane);
	assert.equal(initial.http_status, 200, JSON.stringify(initial));
	const id = initial.claim.id,
		sessionId = initial.claim.harness_session;
	assert(sessionId, "real OMP native session ID required");
	const warmup = `PIJ_154_WARMUP_${randomUUID()}`;
	await tmux(["send-keys", "-t", primaryPane, "-l", warmup]);
	await tmux(["send-keys", "-t", primaryPane, "Enter"]);
	const persisted = await until("actual persisted OMP conversation", () =>
		observed().find(
			(row) =>
				row.launch === "initial" &&
				row.type === "message_end" &&
				row.message?.role === "assistant" &&
				JSON.stringify(row.message.content ?? "").includes("PIJ_NATIVE_OBSERVED") &&
				row.session_file &&
				existsSync(row.session_file),
		),
	);
	assert(persisted.session_file, "native session receipt must name its persisted file");
	record("persisted-session", { observed: persisted, sha256: await hash(persisted.session_file) });
	await killHost(primaryPane, initial.claim);
	const retired = await swept(id);
	await tmux(["kill-server"]);
	await stop(mux!);
	await startMux();
	primaryPane = await launchPane("resumed", persisted.session_file, id);
	assert.equal(primaryPane, initial.claim.pane, "same pane address after real private tmux reboot");
	const resumed = await registrationFor("resumed", primaryPane);
	assert.equal(resumed.http_status, 200, JSON.stringify(resumed));
	assert.equal(resumed.claim.id, id);
	assert.equal(resumed.claim.harness_session, sessionId);
	assert.notEqual(resumed.claim.pid, initial.claim.pid);
	const live = await seat(id);
	assert.equal(live.id, id);
	assert.equal(live.session, sessionId);
	assert(live.proc, "resumed descriptor must carry the observed process incarnation");
	assert.equal(live.proc.pid, resumed.claim.pid);
	assert.equal(live.proc.proc_start, resumed.claim.proc_start);
	const stateResult = await command(binary, [
		"--json",
		"--state-dir",
		state,
		"--addr",
		daemonAddr,
		"state",
		id,
	]);
	const stateEnvelope = JSON.parse(stateResult.stdout) as Envelope<StateCard>;
	const stateCard = data(stateEnvelope);
	record("resumed-state", {
		descriptor: live,
		envelope: stateEnvelope,
		terminal: await capture(primaryPane),
	});
	// Roster skips an absent tombstone; state explicitly serializes its null Option.
	check(
		"successful_resume_has_no_tombstone",
		live.tombstoned_at === undefined &&
			stateCard.tombstonedAt === null &&
			stateCard.liveness === "active",
		{ descriptor: live, state: stateEnvelope },
	);
	const resumeEvent = frames.find(
		(frame) => frame.event?.kind === "seat.resumed" && frame.event?.seat === id,
	);
	const resumePayload = resumeEvent?.event
		? (JSON.parse(resumeEvent.event.payload) as Facts)
		: undefined;
	check(
		"seat_resumed_event",
		resumePayload?.prior_reason === retired.tombstone_reason,
		resumeEvent ?? null,
	);
	peerPane = await launchPane("peer");
	const peer = await registrationFor("peer", peerPane);
	assert.equal(peer.http_status, 200);
	assert.notEqual(peer.claim.id, id);
	const marker = `PIJ_154_DELIVERY_${randomUUID()}`,
		bodyFile = join(run, "message.txt");
	writeFileSync(bodyFile, marker);
	const sent = await command(
		binary,
		[
			"--json",
			"--state-dir",
			state,
			"--addr",
			daemonAddr,
			"send",
			"--to",
			id,
			"--body-file",
			bodyFile,
		],
		{ ...env, PIJ_SESSION_ID: peer.claim.id, TMUX_PANE: peerPane },
		false,
	);
	const sendEnvelope = JSON.parse(sent.stdout) as Envelope;
	let consumed: Observation | undefined;
	if (sendEnvelope.ok)
		consumed = await until("same-ID peer message consumed by actual resumed OMP", () =>
			observed().find(
				(row) =>
					row.launch === "resumed" &&
					row.session === sessionId &&
					row.type === "message_end" &&
					row.message?.customType === "pij" &&
					JSON.stringify(row.message).includes(marker),
			),
		);
	check("same_id_peer_message_lands", Boolean(consumed), {
		marker,
		peer: peer.claim.id,
		envelope: sendEnvelope,
		consumed: consumed ?? null,
	});
	record("peer-delivery", { command: sent, terminal: await capture(primaryPane), consumed });
	// Foreign continuity is tested ONLY on a retired identity, not a live seat takeover.
	await killHost(primaryPane, resumed.claim);
	const foreignBefore = await swept(id);
	await tmux(["kill-server"]);
	await stop(mux!);
	await startMux();
	const foreignPane = await launchPane("foreign", undefined, id);
	assert.equal(
		foreignPane,
		initial.claim.pane,
		"foreign session must claim the SAME recreated pane address too",
	);
	const foreign = await registrationFor("foreign", foreignPane);
	assert.notEqual(
		foreign.claim.harness_session,
		sessionId,
		"fresh OMP must have its own native session",
	);
	assert.notEqual(foreign.claim.pid, resumed.claim.pid);
	const expected = `seat ${id} is retired (${foreignBefore.tombstone_reason}, ${foreignBefore.tombstoned_at}); a different session may not take it`;
	check(
		"foreign_registration_http400",
		foreign.http_status === 400 &&
			foreign.envelope.ok === false &&
			foreign.envelope.error === "refused" &&
			foreign.envelope.meta === expected,
		{ expected, actual: foreign },
	);
	const foreignAfter = await seat(id);
	check(
		"foreign_refusal_preserves_descriptor",
		JSON.stringify(foreignBefore) === JSON.stringify(foreignAfter),
		{ before: foreignBefore, after: foreignAfter },
	);
	receipt.initial_tombstone = retired;
	receipt.status = receipt.checks.every((row) => row.passed) ? "passed" : "behavioral-red";
} catch (error) {
	receipt.status = "precondition-or-execution-failed";
	receipt.error = error instanceof Error ? error.stack : String(error);
} finally {
	const cleanup = async (name: string, action: () => Promise<void>) => {
		try {
			await action();
			receipt.teardown.push({ name, ok: true });
		} catch (error) {
			receipt.teardown.push({ name, ok: false, error: String(error) });
		}
	};
	receipt.extension_receipts = observed();
	receipt.events = frames;
	if (mux && !mux.closed) {
		await cleanup("capture remaining owned panes", async () => {
			const panes = new Set(
				(await tmux(["list-panes", "-a", "-F", "#{pane_id}"])).stdout.trim().split("\n"),
			);
			for (const host of ownedHosts.filter(
				(host) => host.server_pid === mux!.child.pid && panes.has(host.pane),
			))
				host.terminal = await capture(host.pane);
		});
		await cleanup("owned tmux server and all panes", async () => {
			await tmux(["kill-server"]);
			await stop(mux!);
		});
	}
	eventAbort.abort();
	if (eventTask) await eventTask;
	if (proxy) await cleanup("registration proxy", () => closeServer(proxy!));
	if (daemon) await cleanup("owned native daemon", () => stop(daemon!));
	if (provider) {
		receipt.provider_requests = provider.requests;
		await cleanup("local provider", () => provider!.close());
	}
	await cleanup("all direct child handles reaped", async () => {
		await Promise.all(children.map(stop));
		assert(children.every((child) => child.closed));
	});
	for (const host of ownedHosts)
		await cleanup(`OMP host ${host.launch} absent`, async () => {
			for (let attempt = 0; attempt < 50; attempt++) {
				const result = await command(
					"ps",
					["-p", String(host.pid), "-o", "pid=,lstart=,command="],
					env,
					false,
				);
				if (result.exit === 1) return;
				await delay(100);
			}
			throw new Error(`owned OMP PID ${host.pid} remains; retaining private root`);
		});
	receipt.hosts = ownedHosts;
	if (receipt.event_error) receipt.status = "precondition-or-execution-failed";
	if (receipt.teardown.some((row) => !row.ok)) receipt.status = "cleanup-failed";
	else
		await cleanup("private root removed", async () => {
			rmSync(run, { recursive: true, force: true });
			assert(!existsSync(run));
		});
	if (receipt.teardown.some((row) => !row.ok)) receipt.status = "cleanup-failed";
	receipt.ended_at = new Date().toISOString();
	writeFileSync(receiptFd, `${JSON.stringify(receipt, null, 2)}\n`);
	closeSync(receiptFd);
	process.off("SIGINT", sigint);
	process.off("SIGTERM", sigterm);
	process.exitCode = receipt.status === "passed" ? 0 : 1;
	console.log(
		JSON.stringify({
			status: receipt.status,
			receipt: output,
			failed_checks: receipt.checks.filter((row) => !row.passed).map((row) => row.name),
			error: receipt.error,
		}),
	);
}
