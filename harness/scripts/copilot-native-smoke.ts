#!/usr/bin/env tsx
// Real client witness, never a replacement transport. Tmux keys simulate draft/one-shot consent only.
import { strict as assert } from "node:assert";
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
	object,
	sendPrompt,
	smokeEnvironment,
	startFixtureProvider,
} from "./copilot-native-fixture.js";
import { manageCopilotExtension } from "./link-global.js";

interface Options {
	mode: "manual" | "spawned" | "both";
	provider: "local" | "real";
	workspaceTrust: "seeded" | "prompt";
	model?: string;
	pijBin: string;
	copilotBin: string;
	output?: string;
	timeoutMs: number;
}
interface Seat {
	id: string;
	harness: string;
	session: string;
	pane: string;
	proc: { pid: number; proc_start: number };
	spawn_id?: string;
	native_extension_delivery?: boolean;
}
interface NativeEvent {
	id: string;
	type: string;
	data: Record<string, unknown>;
}

const ROOT = resolve(import.meta.dirname, "../..");
const HUMAN_KEYS = {
	clearDraft: "C-u",
	approveOnce: "Enter",
	submitCommand: "Enter",
	newSession: "/new",
	exit: "/exit",
} as const;

export function parseSmokeArgs(args: string[]): Options {
	const options: Options = {
		mode: "both",
		provider: "local",
		workspaceTrust: "seeded",
		pijBin: join(ROOT, "target/debug/pij-rs"),
		copilotBin: "copilot",
		timeoutMs: 90_000,
	};
	for (let index = 0; index < args.length; index += 2) {
		const value = args[index + 1];
		if (!value) throw new Error(`missing value for ${args[index]}`);
		switch (args[index]) {
			case "--mode":
				assert(["manual", "spawned", "both"].includes(value), "--mode manual|spawned|both");
				options.mode = value as Options["mode"];
				break;
			case "--workspace-trust":
				assert(["seeded", "prompt"].includes(value), "--workspace-trust seeded|prompt");
				options.workspaceTrust = value as Options["workspaceTrust"];
				break;
			case "--provider":
				assert(["local", "real"].includes(value), "--provider local|real");
				options.provider = value as Options["provider"];
				break;
			case "--model":
				options.model = value;
				break;
			case "--pij-bin":
				options.pijBin = resolve(value);
				break;
			case "--copilot-bin":
				options.copilotBin = value;
				break;
			case "--output":
				options.output = resolve(value);
				break;
			case "--timeout-seconds":
				options.timeoutMs = Number(value) * 1000;
				assert(
					Number.isFinite(options.timeoutMs) &&
						options.timeoutMs > 0 &&
						options.timeoutMs <= 600_000,
					"timeout must be 1..600 seconds",
				);
				break;
			default:
				throw new Error(`unknown option ${args[index]}`);
		}
	}
	return options;
}

export function readNativeEvents(path: string): NativeEvent[] {
	if (!existsSync(path)) return [];
	const text = readFileSync(path, "utf8");
	// Only complete lines: the live CLI may currently be appending its final event.
	return text
		.slice(0, text.lastIndexOf("\n") + 1)
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const event = object(JSON.parse(line));
			assert.equal(typeof event.id, "string", "native event must have its real event id");
			assert.equal(typeof event.type, "string");
			return { id: event.id as string, type: event.type as string, data: object(event.data ?? {}) };
		});
}

export function nativeMessages(events: NativeEvent[], nonce: string): NativeEvent[] {
	return events.filter(
		(event) =>
			event.type === "user.message" &&
			typeof event.data.content === "string" &&
			event.data.content.includes(nonce),
	);
}

export function verifyOrdinaryUsability(
	events: NativeEvent[],
	nonce: string,
	terminal: string,
): void {
	const users = nativeMessages(events, nonce);
	assert.equal(users.length, 1, "ordinary native user nonce must occur once");
	const user = users[0];
	assert(
		user && typeof user.data.messageId === "string" && typeof user.data.interactionId === "string",
		"ordinary user needs actual native message/interaction ids",
	);
	assert(
		events.some(
			(event) =>
				event.type === "assistant.message" &&
				event.data.interactionId === user.data.interactionId &&
				typeof event.data.messageId === "string" &&
				event.data.content === "PIJ_NATIVE_OBSERVED",
		),
		"ordinary assistant must answer the same native interaction",
	);
	assert.equal(
		terminal.split("[pij native] unavailable:").length - 1,
		1,
		"one diagnostic per outage episode, not per retry",
	);
}

/** Compare full-driver startup runs, never two sessions sharing remembered trust. */
export function verifyWorkspaceTrustDiscriminator(
	seeded: Record<string, unknown>,
	prompt: Record<string, unknown>,
): void {
	const seededIsolation = object(seeded.isolation);
	const promptIsolation = object(prompt.isolation);
	assert(
		typeof seededIsolation.home === "string" &&
			typeof promptIsolation.home === "string" &&
			seededIsolation.home !== promptIsolation.home &&
			seeded.run !== prompt.run,
		"trust discriminator requires distinct private HOMEs and runs",
	);
	assert.equal(
		typeof seededIsolation.trust_config_before,
		"string",
		"seeded native config must be captured before launch",
	);
	assert.deepEqual(
		object(JSON.parse(seededIsolation.trust_config_before as string)).trustedFolders,
		[seededIsolation.workspace],
		"native config must trust only the isolated workspace",
	);
	assert.equal(
		promptIsolation.trust_config_before,
		null,
		"unseeded run must start without native config",
	);
	assert(Array.isArray(seeded.witnesses), "seeded run requires an ordinary-use witness");
	const ordinary = seeded.witnesses
		.map(object)
		.find((row) => row.kind === "daemon-key-absent-ordinary-use");
	assert(ordinary && Array.isArray(ordinary.events), "seeded run requires an ordinary-use witness");
	assert.equal(ordinary.daemon_started, false);
	assert.equal(ordinary.key_present, false);
	verifyOrdinaryUsability(
		ordinary.events as NativeEvent[],
		String(ordinary.nonce),
		String(ordinary.terminal),
	);
	assert.deepEqual(
		prompt.witnesses,
		[],
		"unseeded run must remain before ordinary use and daemon startup",
	);
	assert.deepEqual(prompt.fixture_requests, [], "unseeded run must have no provider activity");
	assert(Array.isArray(prompt.final_pane_captures), "unseeded run needs terminal evidence");
	const workspace = promptIsolation.workspace;
	assert(
		typeof workspace === "string" &&
			prompt.final_pane_captures
				.map(object)
				.some(
					(row) =>
						typeof row.terminal === "string" &&
						row.terminal.includes("Confirm folder trust") &&
						row.terminal.split("\n").some((line) => line.replaceAll("│", "").trim() === workspace),
				),
		"trust prompt must name the exact isolated workspace",
	);
}

function command(bin: string, args: string[], env?: NodeJS.ProcessEnv): string {
	return execFileSync(bin, args, {
		encoding: "utf8",
		env,
		timeout: 15_000,
		stdio: ["ignore", "pipe", "pipe"],
	}).trim();
}
function quote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`;
}
function sha(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}
async function freePort(): Promise<number> {
	const server = createServer();
	await new Promise<void>((ok, fail) => {
		server.once("error", fail);
		server.listen(0, "127.0.0.1", ok);
	});
	const addr = server.address();
	assert(addr && typeof addr !== "string");
	await new Promise<void>((ok, fail) => server.close((error) => (error ? fail(error) : ok())));
	return addr.port;
}
async function until<T>(
	label: string,
	timeout: number,
	probe: () => T | undefined | Promise<T | undefined>,
): Promise<T> {
	const deadline = Date.now() + timeout;
	do {
		const result = await probe();
		if (result !== undefined) return result;
		await delay(250);
	} while (Date.now() < deadline);
	throw new Error(`PIJ_NATIVE_TIMEOUT: ${label}`);
}
async function stopOwned(child: ChildProcess): Promise<void> {
	if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise<void>((ok) => child.once("exit", () => ok()));
	child.kill("SIGINT");
	const hardKill = setTimeout(() => child.kill("SIGKILL"), 5000);
	try {
		await exited;
	} finally {
		clearTimeout(hardKill);
	}
}

/** Snapshot every owned pane before teardown; an exited pane must not hide the others. */
export function captureSmokePanes(tmux: (args: string[]) => string) {
	const panes = tmux(["list-panes", "-a", "-F", "#{pane_id} #{pane_pid} #{pane_current_command}"]);
	const captures = panes
		.split("\n")
		.filter(Boolean)
		.map((row) => {
			const pane = row.split(" ")[0] as string;
			try {
				return { pane, terminal: tmux(["capture-pane", "-p", "-J", "-S", "-2000", "-t", pane]) };
			} catch (error) {
				return { pane, error: String(error) };
			}
		});
	return { panes, captures };
}

/** Match only the active bottom modal, never arguments echoed in earlier conversation. */
export function verifyToolApproval(
	terminal: string,
	expected: { to: string; message: string },
): boolean {
	const lines = terminal
		.trim()
		.split("\n")
		.map((line) => line.trim());
	const top = lines.findIndex((line) => /^╭─+╮$/.test(line));
	if (top < 0) return false;
	const fail = "PIJ_NATIVE_UNEXPECTED_APPROVAL";
	assert(/^╰─+╯$/.test(lines.at(-1) ?? ""), `${fail}: incomplete or non-active modal`);
	const modal = lines.slice(top + 1, -1).map((line) => {
		assert(/^│.*│$/.test(line), `${fail}: ambiguous modal boundary`);
		return line.slice(1, -1).trim();
	});
	assert.equal(modal[0], 'Run extension tool "pij_send"', `${fail}: unknown dialog title`);
	const start = modal.indexOf("{");
	const end = modal.indexOf("}", start + 1);
	assert(start > 0 && end > start, `${fail}: missing complete dialog arguments`);
	assert.equal(modal.lastIndexOf("{"), start, `${fail}: ambiguous dialog arguments`);
	assert.equal(modal.lastIndexOf("}"), end, `${fail}: ambiguous dialog arguments`);
	let args: unknown;
	try {
		args = JSON.parse(modal.slice(start, end + 1).join("\n"));
	} catch {
		throw new Error(`${fail}: malformed dialog arguments`);
	}
	assert.deepEqual(args, expected, `${fail}: dialog recipient/body mismatch`);
	assert.deepEqual(
		modal.filter((line) => /^(?:❯ )?\d+\. /.test(line)),
		[
			"❯ 1. Yes",
			'2. Yes, and approve "pij_send" for the rest of the session',
			"3. No",
			"4. No, and tell Copilot why... (Esc to stop)",
		],
		`${fail}: one-time Yes must be the sole selected choice`,
	);
	assert.equal(
		modal.at(-1),
		"↑/↓ to navigate · enter to select · esc to cancel",
		`${fail}: unknown controls`,
	);
	return true;
}

/** One test-human confirmation; every screen is retained before a key can be sent. */
export async function confirmSmokeToolInvocation(
	tmux: (args: string[]) => string,
	expected: { pane: string; to: string; message: string },
	timeout: number,
	witness: Record<string, unknown>,
): Promise<void> {
	const capture = () => tmux(["capture-pane", "-p", "-J", "-t", expected.pane]);
	const args = { to: expected.to, message: expected.message };
	Object.assign(witness, { kind: "native-tool-human-approval", expected, status: "waiting" });
	try {
		await until("exact native pij_send approval dialog", timeout, () => {
			const terminal = capture();
			witness.before = terminal;
			return verifyToolApproval(terminal, args) ? true : undefined;
		});
		const rechecked = capture();
		witness.before_confirm = rechecked;
		assert(
			verifyToolApproval(rechecked, args),
			"PIJ_NATIVE_UNEXPECTED_APPROVAL: dialog changed before confirmation",
		);
		Object.assign(witness, { decision: "approve-once", keys: [HUMAN_KEYS.approveOnce] });
		tmux(["send-keys", "-t", expected.pane, HUMAN_KEYS.approveOnce]);
		witness.status = "confirmation-sent";
		witness.confirmation_sent = true;
		const afterInput = capture();
		witness.after_input = afterInput;
		verifyToolApproval(afterInput, args);
		await until("one-time native tool approval dismissed", timeout, () => {
			const terminal = capture();
			witness.after = terminal;
			return verifyToolApproval(terminal, args) ? undefined : true;
		});
		witness.status = "dismissed";
	} catch (error) {
		if (!witness.decision) witness.decision = "withhold";
		witness.status = "failed";
		witness.error = String(error);
		throw error;
	}
}

/** Read only the actual bottom composer; quoted transcript text is never a control surface. */
export function nativeComposer(terminal: string): string | undefined {
	const lines = terminal.split("\n").map((line) => line.trim());
	assert(!lines.some((line) => /^╭─+╮$/.test(line)), "PIJ_NATIVE_UNEXPECTED_LIFECYCLE_DIALOG");
	let top = -1;
	for (let index = lines.length - 1; index >= 0; index--) {
		if (/^╻▄+$/.test(lines[index] ?? "")) {
			top = index;
			break;
		}
	}
	if (top < 0) return undefined;
	const bottom = lines.findIndex((line, index) => index > top && /^╹▀+$/.test(line));
	if (bottom < 0) return undefined;
	const text = lines.slice(top + 1, bottom).map((line) => {
		assert(line.startsWith("┃"), "PIJ_NATIVE_AMBIGUOUS_COMPOSER");
		return line.slice(1).trim();
	});
	return text.join("\n");
}

/** Stage only a documented lifecycle command; an optional hook proves a queue hold before submit. */
export async function driveSmokeLifecycleCommand(
	tmux: (args: string[]) => string,
	expected: { pane: string; action: "newSession" | "exit" },
	timeout: number,
	witness: Record<string, unknown>,
	whileStaged?: () => Promise<void>,
): Promise<void> {
	const capture = () => tmux(["capture-pane", "-p", "-J", "-t", expected.pane]);
	const command = HUMAN_KEYS[expected.action];
	Object.assign(witness, {
		kind: "native-lifecycle-human-control",
		...expected,
		command,
		status: "waiting",
	});
	try {
		await until("empty native lifecycle composer", timeout, () => {
			const terminal = capture();
			witness.before = terminal;
			const composer = nativeComposer(terminal);
			if (composer === undefined) return undefined;
			assert.equal(composer, "", "PIJ_NATIVE_HUMAN_DRAFT: refusing to overwrite composer");
			return true;
		});
		tmux(["send-keys", "-t", expected.pane, "-l", "--", command]);
		await until("exact native lifecycle command staged", timeout, () => {
			const terminal = capture();
			witness.staged = terminal;
			return nativeComposer(terminal) === command ? true : undefined;
		});
		if (whileStaged) await whileStaged();
		const terminal = capture();
		witness.before_submit = terminal;
		assert.equal(nativeComposer(terminal), command, "PIJ_NATIVE_LIFECYCLE_COMMAND_CHANGED");
		witness.submit_keys = [HUMAN_KEYS.submitCommand];
		tmux(["send-keys", "-t", expected.pane, HUMAN_KEYS.submitCommand]);
		witness.command_submitted = true;
		// /exit can remove the owned pane before capture; actual host death is proved separately.
		try {
			witness.after = capture();
		} catch (error) {
			witness.after_capture_error = String(error);
		}
		if (typeof witness.after === "string") nativeComposer(witness.after);
		witness.status = "submitted-not-yet-lifecycle-proven";
	} catch (error) {
		witness.status = "failed";
		witness.error = String(error);
		throw error;
	}
}

export function verifyNativeLifecycleIdentity(
	previous: Seat,
	current: Seat,
	action: "new" | "resume",
): void {
	assert.equal(current.harness, "copilot");
	assert.equal(current.native_extension_delivery, true);
	assert(/^[0-9a-f-]{36}$/i.test(current.session), "native lifecycle requires a real session UUID");
	assert(
		current.proc.pid > 0 && current.proc.proc_start > 0,
		"native lifecycle requires a real host tuple",
	);
	if (action === "new") {
		assert.notEqual(current.session, previous.session, "/new must change native conversation");
		assert.notEqual(current.id, previous.id, "/new must not retain old-context Pij address");
		assert.equal(current.pane, previous.pane, "/new remains in the actual existing pane");
		assert.deepEqual(current.proc, previous.proc, "/new remains in the actual existing host");
	} else {
		assert.equal(current.session, previous.session, "--resume must preserve native conversation");
		assert.equal(
			current.id,
			previous.id,
			"--resume must preserve Pij address after proven owner death",
		);
		assert.notDeepEqual(
			current.proc,
			previous.proc,
			"--resume must use a fresh real host incarnation",
		);
	}
}

export function verifyNativeContextHeld(
	expected: { seat: string; session: string; nonce: string; msgId: string },
	snapshot: {
		jobs: Record<string, unknown>[];
		acknowledgements: Record<string, unknown>[];
		predecessorEvents: NativeEvent[];
		successorEvents: NativeEvent[];
		successorJobs: Record<string, unknown>[];
	},
): void {
	assert.equal(snapshot.jobs.length, 1, "old-context job must remain durable");
	const job = snapshot.jobs[0];
	assert(
		job && ["pending", "running"].includes(String(job.state)),
		"old-context job must remain live",
	);
	const payload = object(JSON.parse(String(job.payload)));
	assert.equal(payload.to, expected.seat, "old-context recipient must not migrate");
	assert.equal(
		payload.native_target_session,
		expected.session,
		"old-context native stamp must survive",
	);
	assert.equal(payload.msg_id, expected.msgId);
	assert.equal(payload.body, expected.nonce);
	assert.equal(snapshot.acknowledgements.length, 0, "old-context job must not be acknowledged");
	assert.equal(
		nativeMessages(snapshot.predecessorEvents, expected.nonce).length,
		0,
		"old consumer must not drain held work",
	);
	assert.equal(
		nativeMessages(snapshot.successorEvents, expected.nonce).length,
		0,
		"old context must not enter successor conversation",
	);
	assert.equal(
		snapshot.successorJobs.length,
		0,
		"old-context work must not migrate to successor queue",
	);
}

export async function runSmoke(options: Options): Promise<{ code: number; output: string }> {
	if (options.output)
		assert(!existsSync(options.output), `refusing to overwrite receipt ${options.output}`);
	const run = mkdtempSync(join(tmpdir(), "pij-copilot-native-"));
	const output = options.output ?? join(run, "receipt.json");
	assert(!existsSync(output), `refusing to overwrite receipt ${output}`);
	const secrets = new Set<string>();
	for (const key of ["COPILOT_GITHUB_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"]) {
		if (process.env[key]) secrets.add(process.env[key] as string);
	}
	const receipt: Record<string, unknown> = {
		status: "running",
		provider:
			options.provider === "local"
				? "deterministic-local-fixture-not-real-inference"
				: "real-model",
		mode: options.mode,
		run,
		started: new Date().toISOString(),
		witnesses: [],
	};
	const witnesses = receipt.witnesses as Record<string, unknown>[];
	let daemon: ChildProcess | undefined;
	let fixture: Awaited<ReturnType<typeof startFixtureProvider>> | undefined;
	let env: NodeJS.ProcessEnv | undefined;
	let socketCreated = false;
	let code = 1;
	const socket = join(run, "tmux.sock");
	const tmux = (args: string[]) => command("tmux", ["-S", socket, ...args], env);
	let daemonLog = "";
	try {
		if (!existsSync(options.pijBin))
			throw new Error(
				"PIJ_NATIVE_PREREQUISITE_BINARY: build the composed tree with CARGO_TARGET_DIR=$PWD/target cargo build -p pij-cli --bin pij-rs",
			);
		for (const module of ["extension.mjs", "store.mjs"]) {
			if (!existsSync(join(ROOT, ".copilot/extensions/pij", module)))
				throw new Error(
					`PIJ_NATIVE_PREREQUISITE_SOURCE: composed .copilot/extensions/pij/${module} missing; no shipping fixture substitutes`,
				);
		}
		if (options.provider === "real" && (!options.model || secrets.size === 0)) {
			throw new Error(
				"PIJ_NATIVE_PREREQUISITE_AUTH: --provider real requires --model and an inherited COPILOT_GITHUB_TOKEN, GH_TOKEN or GITHUB_TOKEN; never copy global auth files",
			);
		}
		const copilotBin = isAbsolute(options.copilotBin)
			? realpathSync(options.copilotBin)
			: realpathSync(command("which", [options.copilotBin]));
		const home = join(run, "home");
		const copilotHome = join(home, ".copilot");
		const state = join(run, "daemon");
		const cwd = join(run, "workspace");
		for (const path of [home, state, cwd]) mkdirSync(path, { recursive: true, mode: 0o700 });
		const addr = `127.0.0.1:${await freePort()}`;
		env = smokeEnvironment(process.env, home, copilotHome, state, addr, options.provider);
		if (options.provider === "local") {
			fixture = await startFixtureProvider();
			Object.assign(env, {
				COPILOT_PROVIDER_BASE_URL: fixture.url,
				COPILOT_PROVIDER_TYPE: "openai",
				COPILOT_PROVIDER_WIRE_API: "completions",
				COPILOT_MODEL: "pij-native-fixture",
			});
		} else env.COPILOT_MODEL = options.model;
		// Native remembered trust lives in config.json, not user settings.json.
		const trustedFolders = options.workspaceTrust === "seeded" ? [realpathSync(cwd)] : [];
		mkdirSync(copilotHome, { recursive: true, mode: 0o700 });
		if (trustedFolders.length) {
			writeFileSync(join(copilotHome, "config.json"), `${JSON.stringify({ trustedFolders })}\n`, {
				flag: "wx",
				mode: 0o600,
			});
		}
		const installLog: string[] = [];
		assert.equal(
			manageCopilotExtension({
				pijRoot: ROOT,
				home,
				copilotHome,
				args: [],
				stdout: (line) => installLog.push(line),
				stderr: (line) => installLog.push(line),
			}).skipped,
			0,
			installLog.join("\n"),
		);
		assert.equal(
			manageCopilotExtension({
				pijRoot: ROOT,
				home,
				copilotHome,
				args: ["--doctor-copilot"],
				stdout: (line) => installLog.push(line),
				stderr: (line) => installLog.push(line),
			}).skipped,
			0,
		);
		receipt.identity = {
			source_commit: command("git", ["-C", ROOT, "rev-parse", "HEAD"]),
			node: process.version,
			copilot: command(copilotBin, ["--version"], env),
			copilot_binary: copilotBin,
			copilot_sha256: sha(copilotBin),
			pij_binary: realpathSync(options.pijBin),
			pij_sha256: sha(options.pijBin),
			pij_version: command(options.pijBin, ["--version"], env),
			tmux: command("tmux", ["-V"]),
			source_modules: Object.fromEntries(
				["extension.mjs", "store.mjs"].map((name) => [
					name,
					sha(join(ROOT, ".copilot/extensions/pij", name)),
				]),
			),
			model: env.COPILOT_MODEL,
		};
		receipt.install = installLog;
		receipt.isolation = {
			home,
			copilotHome,
			state,
			addr,
			socket,
			workspace: realpathSync(cwd),
			workspace_trust: options.workspaceTrust,
			trusted_folders: trustedFolders,
			trust_config_before: existsSync(join(copilotHome, "config.json"))
				? readFileSync(join(copilotHome, "config.json"), "utf8")
				: null,
			manual_identity_env_keys: Object.keys(env).filter(
				(key) => key.startsWith("PIJ_") && !["PIJ_RS_ADDR", "PIJ_RS_STATE_DIR"].includes(key),
			),
			auth: options.provider === "real" ? "inherited-in-memory-only" : "none",
		};
		// A new socket and an empty tmux config prevent use of, or changes to, the live fleet.
		tmux([
			"-f",
			"/dev/null",
			"new-session",
			"-d",
			"-s",
			"native-smoke",
			"-x",
			"160",
			"-y",
			"48",
			"-c",
			cwd,
			"/bin/sleep",
			"600",
		]);
		socketCreated = true;
		env.TMUX = tmux(["display-message", "-p", "#{socket_path},#{pid},0"]);
		const common = [
			"--no-custom-instructions",
			"--disable-builtin-mcps",
			"--no-remote",
			"--no-auto-update",
			"--allow-tool=pij_send",
		];
		const key = () => {
			const value = readFileSync(join(state, "daemon.key"), "utf8").trim();
			assert(value, "isolated daemon key must not be empty");
			secrets.add(value);
			return value;
		};
		const api = async (path: string, body?: unknown): Promise<unknown> => {
			const response = await fetch(`http://${addr}${path}`, {
				method: body === undefined ? "GET" : "POST",
				headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
				signal: AbortSignal.timeout(10_000),
			});
			const raw = await response.text();
			let envelope: Record<string, unknown>;
			try {
				envelope = object(JSON.parse(raw));
			} catch {
				throw new Error(`HTTP ${response.status} ${path}: ${raw.slice(0, 2048)}`);
			}
			if (!response.ok || envelope.ok !== true)
				throw new Error(`HTTP ${response.status} ${path}: ${raw.slice(0, 2048)}`);
			return envelope.data;
		};
		const bootDaemon = async () => {
			daemon = spawn(options.pijBin, ["--state-dir", state, "daemon", "--bind", addr], {
				env,
				cwd,
				stdio: ["ignore", "pipe", "pipe"],
			});
			daemon.stdout?.on("data", (chunk: Buffer) => {
				daemonLog += chunk.toString();
			});
			daemon.stderr?.on("data", (chunk: Buffer) => {
				daemonLog += chunk.toString();
			});
			let launchError: Error | undefined;
			daemon.once("error", (error) => {
				launchError = error;
			});
			const health = await until("isolated Rust daemon readiness", options.timeoutMs, async () => {
				if (launchError) throw launchError;
				if (daemon?.exitCode !== null)
					throw new Error(`isolated daemon exited: ${daemonLog.slice(-2048)}`);
				if (!existsSync(join(state, "daemon.key"))) return undefined;
				try {
					return await api("/health");
				} catch {
					return undefined;
				}
			});
			assert.equal(
				object(health).offline,
				false,
				"native smoke requires real Rust adapters, never offline fakes",
			);
			witnesses.push({ kind: "isolated-daemon-health", pid: daemon.pid, health });
		};
		// Before daemon/key creation, prove Pij failure does not break ordinary native use.
		const ordinaryNonce = `PIJ_ORDINARY_${randomUUID()}`;
		const ordinaryPane = tmux([
			"new-window",
			"-d",
			"-P",
			"-F",
			"#{pane_id}",
			"-t",
			"native-smoke",
			"-c",
			cwd,
			copilotBin,
			...common,
			"-i",
			`Ordinary Copilot smoke ${ordinaryNonce}. Reply exactly PIJ_NATIVE_OBSERVED. Do not call tools.`,
		]);
		assert.equal(
			existsSync(join(state, "daemon.key")),
			false,
			"daemon key must actually be absent",
		);
		const ordinaryEvents = await until(
			"ordinary native user/assistant while daemon absent",
			options.timeoutMs,
			() => {
				const stateRoot = join(copilotHome, "session-state");
				if (!existsSync(stateRoot)) return undefined;
				const matching = readdirSync(stateRoot, { withFileTypes: true })
					.filter((entry) => entry.isDirectory())
					.map((entry) => ({
						session: entry.name,
						events: readNativeEvents(join(stateRoot, entry.name, "events.jsonl")),
					}))
					.filter((row) => nativeMessages(row.events, ordinaryNonce).length === 1);
				assert(
					matching.length <= 1,
					"ordinary session identity must be unique by nonce, never newest-by-mtime",
				);
				return matching.find((row) =>
					row.events.some(
						(event) =>
							event.type === "assistant.message" && event.data.content === "PIJ_NATIVE_OBSERVED",
					),
				);
			},
		);
		const unavailablePrefix = "[pij native] unavailable:";
		await until("one actionable native unavailable diagnostic", options.timeoutMs, () =>
			tmux(["capture-pane", "-p", "-J", "-S", "-2000", "-t", ordinaryPane]).includes(
				unavailablePrefix,
			)
				? true
				: undefined,
		);
		await delay(2000);
		const ordinaryTerminal = tmux(["capture-pane", "-p", "-J", "-S", "-2000", "-t", ordinaryPane]);
		verifyOrdinaryUsability(ordinaryEvents.events, ordinaryNonce, ordinaryTerminal);
		assert.equal(existsSync(join(state, "daemon.key")), false);
		witnesses.push({
			kind: "daemon-key-absent-ordinary-use",
			nonce: ordinaryNonce,
			...ordinaryEvents,
			terminal: ordinaryTerminal,
			diagnostic_count: 1,
			daemon_started: false,
			key_present: false,
		});
		tmux(["kill-pane", "-t", ordinaryPane]);
		await bootDaemon();
		const rows = (sql: string, ...params: string[]): Record<string, unknown>[] => {
			const db = new DatabaseSync(join(state, "pij.sqlite"), { readOnly: true });
			try {
				return db.prepare(sql).all(...params);
			} finally {
				db.close();
			}
		};
		const delivered = (seat: Seat, msgId: string) =>
			rows(
				"SELECT recipient, msg_id, origin, delivered_at FROM delivered_messages WHERE recipient = ? AND msg_id = ?",
				seat.id,
				msgId,
			);
		const jobs = (seat: Seat, msgId: string) =>
			rows(
				"SELECT id, state, payload FROM jobs WHERE serial_key = ? AND dedupe_key = ?",
				seat.id,
				msgId,
			);
		const seats = async (): Promise<Seat[]> => {
			const data = await api("/v1/seats");
			const list = Array.isArray(data) ? data : object(data).seats;
			assert(Array.isArray(list), "roster must be array or seats envelope");
			return list as Seat[];
		};
		const events = (seat: Seat) =>
			readNativeEvents(join(copilotHome, "session-state", seat.session, "events.jsonl"));
		const capture = (seat: Seat) => tmux(["capture-pane", "-p", "-J", "-t", seat.pane]);
		// Spawn still uses the real daemon launch/prebind path; exec preserves actual host identity.
		const wrapper = join(run, "copilot-smoke");
		writeFileSync(
			wrapper,
			`#!/bin/sh\nexec ${[copilotBin, ...common].map(quote).join(" ")} "$@"\n`,
			{ mode: 0o700 },
		);
		const prebindSends = new Map<string, unknown>();
		const launch = async (
			mode: "manual" | "spawned",
			disabled = false,
			initial?: { from: Seat; body: string; msgId: string },
			resume?: Seat,
		): Promise<Seat> => {
			if (resume)
				assert(mode === "manual" && !disabled, "resume proof must be a native manual launch");
			let pane: string;
			let spawnReceipt: Record<string, unknown> | undefined;
			if (mode === "manual") {
				pane = tmux([
					"new-window",
					"-d",
					"-P",
					"-F",
					"#{pane_id}",
					"-t",
					"native-smoke",
					"-c",
					cwd,
					copilotBin,
					...common,
					...(disabled ? ["--no-experimental"] : []),
					...(resume ? [`--resume=${resume.session}`] : []),
				]);
			} else {
				spawnReceipt = object(
					JSON.parse(
						command(
							options.pijBin,
							[
								"--json",
								"--addr",
								addr,
								"--state-dir",
								state,
								"spawn",
								"--harness",
								"copilot",
								"--bin",
								wrapper,
								"--cwd",
								cwd,
								"--session",
								"native-smoke",
								"--no-wait",
							],
							env,
						),
					),
				);
				spawnReceipt = object(spawnReceipt.data);
				assert.equal(spawnReceipt.dispatched, true);
				pane = String(spawnReceipt.pane);
				if (initial) {
					const first = await api("/v1/send", {
						from: initial.from.id,
						to: { seat: spawnReceipt.id },
						body: initial.body,
						msg_id: initial.msgId,
					});
					prebindSends.set(String(spawnReceipt.id), first);
					witnesses.push({
						kind: "spawned-initial-task-before-bind-wait",
						prebind: spawnReceipt,
						msgId: initial.msgId,
						receipt: first,
					});
				}
			}
			assert(/^%\d+$/.test(pane), "actual tmux pane id required");
			if (disabled) {
				await until("disabled CLI composer ready", options.timeoutMs, () =>
					/❯|>/.test(tmux(["capture-pane", "-p", "-t", pane])) ? true : undefined,
				);
				command(
					options.pijBin,
					["--json", "--addr", addr, "--state-dir", state, "adopt", pane, "--harness", "copilot"],
					env,
				);
			}
			const seat = await until("truthful native registration", options.timeoutMs, async () =>
				(await seats()).find(
					(row) =>
						row.pane === pane &&
						row.harness === "copilot" &&
						row.proc?.pid &&
						(disabled || row.native_extension_delivery === true),
				),
			);
			if (spawnReceipt)
				assert.equal(
					seat.id,
					spawnReceipt.id,
					"spawn preallocation must bind exactly the same seat",
				);
			assert.equal(
				(await seats()).filter((row) => row.pane === pane && row.proc?.pid === seat.proc.pid)
					.length,
				1,
				"one registered seat per host/pane",
			);
			if (!disabled) assert(/^[0-9a-f-]{36}$/i.test(seat.session), "native session UUID required");
			const processProof = command("ps", [
				"-p",
				String(seat.proc.pid),
				"-o",
				"pid=,ppid=,lstart=,command=",
			]);
			assert(!/--ui-server|--port(?:\s|=)/.test(processProof), "obsolete RPC args forbidden");
			witnesses.push({
				kind: disabled ? "missing-consumer-start" : `${mode}-registration`,
				seat,
				process: processProof,
				spawn: spawnReceipt,
				pane: capture(seat),
				resume_of: resume,
			});
			return seat;
		};
		const send = (from: Seat, to: Seat, body: string, msgId: string) =>
			api("/v1/send", { from: from.id, to: { seat: to.id }, body, msg_id: msgId });
		const waitDelivery = async (seat: Seat, nonce: string, msgId: string) => {
			const native = await until(
				"native user message with exact nonce",
				options.timeoutMs,
				() => nativeMessages(events(seat), nonce)[0],
			);
			assert.equal(
				typeof native.data.messageId,
				"string",
				"native messageId is distinct from native event id",
			);
			const ack = await until("daemon reader-read acknowledgement", options.timeoutMs, () =>
				delivered(seat, msgId).find((row) => row.origin === "reader-read"),
			);
			assert.equal(nativeMessages(events(seat), nonce).length, 1, "native duplicate injection");
			return {
				native,
				acknowledgement: ack,
				jobs: jobs(seat, msgId),
				grade: "native-accepted-not-model-complete",
			};
		};
		const waitTurnEnd = (seat: Seat, nonce: string) =>
			until("native turn ended and lifecycle composer ready", options.timeoutMs, () => {
				const native = events(seat);
				const message = nativeMessages(native, nonce)[0];
				const index = native.findIndex((event) => event.id === message?.id);
				if (index < 0) return undefined;
				const ended = native.find(
					(event, offset) => offset > index && event.type === "assistant.turn_end",
				);
				return ended && nativeComposer(capture(seat)) === "" ? ended : undefined;
			});
		for (const mode of options.mode === "both"
			? (["manual", "spawned"] as const)
			: [options.mode]) {
			const sender = await launch(mode);
			const nonce = `PIJ_NATIVE_${randomUUID()}`;
			const msgId = randomUUID();
			const body = sendPrompt(sender.id, nonce);
			const target = await launch(mode, false, { from: sender, body, msgId });
			const initial =
				mode === "spawned" ? prebindSends.get(target.id) : await send(sender, target, body, msgId);
			const accepted = await waitDelivery(target, nonce, msgId);
			const approval: Record<string, unknown> = { mode };
			witnesses.push(approval);
			await confirmSmokeToolInvocation(
				tmux,
				{ pane: target.pane, to: sender.id, message: nonce },
				options.timeoutMs,
				approval,
			);
			const reply = await until(
				"native pij_send reply arrives at original sender",
				options.timeoutMs,
				() => nativeMessages(events(sender), nonce)[0],
			);
			const tool = await until("actual native outgoing tool event", options.timeoutMs, () =>
				events(target).find(
					(event) =>
						JSON.stringify(event.data).includes("pij_send") &&
						["assistant.message", "tool.execution_start"].includes(event.type),
				),
			);
			const outbound = await until(
				"durable outgoing Pij job with exact source identity",
				options.timeoutMs,
				() =>
					rows("SELECT id, state, payload FROM jobs WHERE serial_key = ?", sender.id).find(
						(row) => {
							const message = object(JSON.parse(String(row.payload)));
							return message.from === target.id && message.body === nonce;
						},
					),
			);
			const completion = await until("separate model completion canary", options.timeoutMs, () =>
				events(target).find(
					(event) =>
						event.type === "assistant.message" &&
						typeof event.data.content === "string" &&
						event.data.content.includes("PIJ_NATIVE_DONE"),
				),
			);
			const duplicate = await send(sender, target, body, msgId);
			await delay(1500);
			assert.equal(
				nativeMessages(events(target), nonce).length,
				1,
				"accepted duplicate must not reinject",
			);
			assert.equal(
				nativeMessages(events(sender), nonce).length,
				1,
				"outgoing tool reply must not repeat",
			);
			witnesses.push({
				kind: `${mode}-roundtrip`,
				nonce,
				msgId,
				initial,
				accepted,
				reply,
				tool,
				outbound,
				completion,
				duplicate,
				target_events: events(target),
				sender_events: events(sender),
				note: "native IDs and reader-read are acceptance; assistant completion/idle events are separate",
			});
			const draft = `HUMAN_DRAFT_${randomUUID()}`;
			tmux(["send-keys", "-t", target.pane, "-l", "--", draft]);
			await until("human draft visible", options.timeoutMs, () =>
				capture(target).includes(draft) ? true : undefined,
			);
			const heldNonce = `PIJ_HELD_${randomUUID()}`;
			const heldId = randomUUID();
			const held = await send(sender, target, heldNonce, heldId);
			await delay(2000);
			const heldPane = capture(target);
			assert(heldPane.includes(draft), "human draft must survive native delivery veto");
			assert.equal(nativeMessages(events(target), heldNonce).length, 0);
			assert.equal(delivered(target, heldId).length, 0);
			const pending = jobs(target, heldId);
			assert(
				pending.some((row) => row.state === "pending" || row.state === "running"),
				"hold must retain a durable live job",
			);
			witnesses.push({
				kind: `${mode}-typing-held`,
				draft,
				nonce: heldNonce,
				msgId: heldId,
				receipt: held,
				pending,
				pane: heldPane,
			});
			tmux(["send-keys", "-t", target.pane, HUMAN_KEYS.clearDraft]);
			await until("human draft cleared by fixture human control", options.timeoutMs, () =>
				!capture(target).includes(draft) ? true : undefined,
			);
			witnesses.push({
				kind: `${mode}-typing-admitted`,
				...(await waitDelivery(target, heldNonce, heldId)),
			});
			const disabled = await launch("manual", true);
			const absentNonce = `PIJ_ABSENT_${randomUUID()}`;
			const absentId = randomUUID();
			const refused = await send(sender, disabled, absentNonce, absentId);
			await delay(2000);
			assert.equal(
				delivered(disabled, absentId).length,
				0,
				"disabled extension must not be delivered by fallback",
			);
			assert(
				!capture(disabled).includes(absentNonce),
				"disabled extension must never receive tmux text",
			);
			const outcome = object(object(refused).outcome).outcome;
			assert(
				["queued", "held", "refused"].includes(String(outcome)),
				"absence requires explicit queued/held/refused outcome",
			);
			witnesses.push({
				kind: `${mode}-missing-consumer`,
				nonce: absentNonce,
				msgId: absentId,
				receipt: refused,
				jobs: jobs(disabled, absentId),
				pane: capture(disabled),
			});
			assert(daemon);
			await stopOwned(daemon);
			key(); // Remember old credential solely for output redaction.
			writeFileSync(join(state, "daemon.key"), `${randomUUID()}${randomUUID()}\n`, { mode: 0o600 });
			await bootDaemon();
			await until(
				"same native session reattested after isolated key rotation",
				options.timeoutMs,
				async () =>
					(await seats()).find(
						(row) =>
							row.id === target.id &&
							row.session === target.session &&
							row.proc?.pid === target.proc.pid &&
							row.native_extension_delivery === true,
					),
			);
			const reconnectNonce = `PIJ_RECONNECT_${randomUUID()}`;
			const reconnectId = randomUUID();
			await send(sender, target, reconnectNonce, reconnectId);
			witnesses.push({
				kind: `${mode}-reconnect-key-rotation`,
				nonce: reconnectNonce,
				msgId: reconnectId,
				...(await waitDelivery(target, reconnectNonce, reconnectId)),
			});
			const oldNonce = `PIJ_OLD_CONTEXT_${randomUUID()}`;
			const oldMsgId = randomUUID();
			const oldExpected = {
				seat: target.id,
				session: target.session,
				nonce: oldNonce,
				msgId: oldMsgId,
			};
			const rollover: Record<string, unknown> = {
				kind: `${mode}-native-rollover`,
				before: target,
				old_expected: oldExpected,
			};
			witnesses.push(rollover);
			rollover.previous_turn_end = await waitTurnEnd(target, reconnectNonce);
			const oldContextSnapshot = (successor?: Seat) => ({
				jobs: jobs(target, oldMsgId),
				acknowledgements: rows(
					"SELECT recipient, msg_id, origin, delivered_at FROM delivered_messages WHERE msg_id = ?",
					oldMsgId,
				),
				predecessorEvents: events(target),
				successorEvents: successor ? events(successor) : [],
				successorJobs: successor ? jobs(successor, oldMsgId) : [],
			});
			const newControl: Record<string, unknown> = {};
			rollover.human_control = newControl;
			await driveSmokeLifecycleCommand(
				tmux,
				{ pane: target.pane, action: "newSession" },
				options.timeoutMs,
				newControl,
				async () => {
					rollover.old_send = await send(sender, target, oldNonce, oldMsgId);
					await delay(2000);
					const held = oldContextSnapshot();
					rollover.held_before_new = held;
					verifyNativeContextHeld(oldExpected, held);
				},
			);
			const successor = await until(
				"truthful native /new registration",
				options.timeoutMs,
				async () => {
					const terminal = capture(target);
					newControl.after = terminal;
					nativeComposer(terminal); // An unexpected modal is not a new consent policy.
					const roster = await seats();
					rollover.roster_after = roster;
					return roster.find(
						(row) =>
							row.pane === target.pane &&
							row.session !== target.session &&
							row.native_extension_delivery === true,
					);
				},
			);
			rollover.after = successor;
			verifyNativeLifecycleIdentity(target, successor, "new");
			if (mode === "spawned") {
				assert.equal(typeof target.spawn_id, "string", "spawned source correlation required");
				assert.equal(
					successor.spawn_id,
					target.spawn_id,
					"spawned /new must preserve verified spawn correlation",
				);
			}
			const retired = (await seats()).find((row) => row.id === target.id);
			rollover.retired_predecessor = retired;
			assert(retired, "superseded native predecessor must remain observable");
			assert.equal(retired.native_extension_delivery, false);
			assert(Number(object(retired).tombstoned_at) > 0);
			assert(String(object(retired).tombstone_reason).includes(successor.id));
			const oldQuery = new URLSearchParams({
				seat: target.id,
				wait: "false",
				native_session: target.session,
				pid: String(target.proc.pid),
				proc_start: String(target.proc.proc_start),
			});
			const staleClaim = await fetch(`http://${addr}/v1/inbox?${oldQuery}`, {
				headers: { Authorization: `Bearer ${key()}` },
				signal: AbortSignal.timeout(10_000),
			});
			const staleBody = object(await staleClaim.json());
			rollover.old_consumer_refusal = {
				status: staleClaim.status,
				body: staleBody,
				tuple: target.proc,
				session: target.session,
			};
			assert.equal(staleClaim.status, 400, "retired native consumer must be refused");
			assert.equal(staleBody.ok, false);
			assert.equal(staleBody.error, "refused");
			assert(
				String(staleBody.meta).includes(
					"native-extension-unavailable: Copilot requires current native registration",
				),
			);
			const freshNonce = `PIJ_NEW_CONTEXT_${randomUUID()}`;
			const freshId = randomUUID();
			rollover.fresh_send = await send(sender, successor, freshNonce, freshId);
			rollover.fresh_delivery = await waitDelivery(successor, freshNonce, freshId);
			rollover.fresh_turn_end = await waitTurnEnd(successor, freshNonce);
			assert.equal(nativeMessages(events(successor), freshNonce).length, 1);
			assert.equal(delivered(successor, freshId).length, 1);
			const isolated = oldContextSnapshot(successor);
			rollover.held_after_new = isolated;
			verifyNativeContextHeld(oldExpected, isolated);
			rollover.grade =
				"native-accepted; old binding revoked and claims refused; private abort signal not observed";
			let activeTarget = successor;
			if (mode === "manual") {
				const resume: Record<string, unknown> = {
					kind: "manual-native-dead-host-resume",
					before: successor,
				};
				witnesses.push(resume);
				resume.process_before_exit = command("ps", [
					"-p",
					String(successor.proc.pid),
					"-o",
					"pid=,ppid=,lstart=,command=",
				]);
				const exitControl: Record<string, unknown> = {};
				resume.human_control = exitControl;
				await driveSmokeLifecycleCommand(
					tmux,
					{ pane: successor.pane, action: "exit" },
					options.timeoutMs,
					exitControl,
				);
				resume.host_death = await until(
					"actual native host exits before resume",
					options.timeoutMs,
					() => {
						try {
							process.kill(successor.proc.pid, 0);
							return undefined;
						} catch (error) {
							if (object(error).code !== "ESRCH") throw error;
							return {
								...successor.proc,
								observed_at: new Date().toISOString(),
								evidence: "kill(pid, 0): ESRCH",
							};
						}
					},
				);
				const identityKeys: string[] = Object.keys(env).filter(
					(name) => name.startsWith("PIJ_") && !["PIJ_RS_ADDR", "PIJ_RS_STATE_DIR"].includes(name),
				);
				resume.identity_environment_keys = identityKeys;
				assert.deepEqual(identityKeys, [], "manual resume must not inherit Pij preallocation");
				resume.launch_args = [...common, `--resume=${successor.session}`];
				activeTarget = await launch("manual", false, undefined, successor);
				resume.after = activeTarget;
				verifyNativeLifecycleIdentity(successor, activeTarget, "resume");
				const resumedNonce = `PIJ_RESUMED_${randomUUID()}`;
				const resumedId = randomUUID();
				resume.send = await send(sender, activeTarget, resumedNonce, resumedId);
				resume.delivery = await waitDelivery(activeTarget, resumedNonce, resumedId);
				resume.turn_end = await waitTurnEnd(activeTarget, resumedNonce);
				resume.native_events = events(activeTarget);
				resume.roster = await seats();
				resume.terminal = capture(activeTarget);
				assert.equal(nativeMessages(events(activeTarget), resumedNonce).length, 1);
				assert.equal(delivered(activeTarget, resumedId).length, 1);
				const stillIsolated = oldContextSnapshot(activeTarget);
				resume.old_context_exclusion = stillIsolated;
				verifyNativeContextHeld(oldExpected, stillIsolated);
				resume.grade =
					"native-accepted-not-model-complete; real host death observed before fresh manual resume";
			}
			for (const seat of [sender, activeTarget, disabled]) tmux(["kill-pane", "-t", seat.pane]);
		}
		receipt.status = "passed";
		code = 0;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		receipt.status = message.includes("PIJ_NATIVE_PREREQUISITE_")
			? "prerequisite-missing"
			: "failed";
		receipt.error = message;
		code = receipt.status === "prerequisite-missing" ? 2 : 1;
	} finally {
		if (socketCreated) {
			try {
				const final = captureSmokePanes(tmux);
				receipt.final_panes = final.panes;
				receipt.final_pane_captures = final.captures;
			} catch (error) {
				receipt.final_capture_error = String(error);
			}
			try {
				tmux(["kill-server"]);
			} catch (error) {
				receipt.tmux_cleanup_error = String(error);
				code = 1;
			}
		}
		if (daemon) await stopOwned(daemon);
		if (fixture) {
			receipt.fixture_requests = fixture.requests;
			await fixture.close();
		}
		receipt.daemon_log = daemonLog;
		if (code === 1) receipt.status = "failed";
		receipt.finished = new Date().toISOString();
		let serialized = `${JSON.stringify(receipt, null, 2)}\n`;
		for (const secret of secrets) serialized = serialized.replaceAll(secret, "[redacted]");
		mkdirSync(dirname(output), { recursive: true });
		writeFileSync(output, serialized, { flag: "wx", mode: 0o600 });
	}
	return { code, output };
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined;
if (entry === import.meta.url) {
	if (process.argv.includes("--help")) {
		console.log(
			"copilot-native-smoke --mode manual|spawned|both --provider local|real [--workspace-trust seeded|prompt] [--model MODEL] [--pij-bin PATH] [--copilot-bin PATH] [--output RECEIPT.json] [--timeout-seconds 90]\nUses isolated HOME/COPILOT_HOME, dedicated tmux socket and owned real Rust daemon. Real provider requires inherited token; never copies auth. Exit 0 passed, 1 failed, 2 prerequisite missing. No global setup or restart. Workspace trust defaults to seeded; prompt is a negative control expected to time out before provider activity.",
		);
	} else {
		try {
			const result = await runSmoke(parseSmokeArgs(process.argv.slice(2)));
			console.log(JSON.stringify(result));
			process.exitCode = result.code;
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 2;
		}
	}
}
