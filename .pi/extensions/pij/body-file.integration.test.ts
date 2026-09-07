// The literal text boundary through the real CLI and shipped generation adapter.
// A private HTTP fixture observes argv/body_literal; daemon grammar remains daemon-owned.
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs } from "./core/cli.js";

const TSX = createRequire(import.meta.url).resolve("tsx/cli");
const CLI = join(import.meta.dirname, "cli.ts");
const HOSTILE_BODY = [
	"--wait 500 this line must arrive as TEXT, not as a flag value",
	// biome-ignore lint/suspicious/noTemplateCurlyInString: shell-expansion fixture, not a JS template
	"backticks: `echo pwned` and substitution: $(echo pwned) and ${HOME}",
	`quotes: 'single' "double" and a semicolon ; here`,
	"--json is also not a flag when it lives in the body",
	"trailing spaces follow this arrow →   ",
	"",
	"",
].join("\n");
const SUCCESS =
	' { "ok":true, "command":"send", "v":2, "data":{"msg_id":"fixture","outcome":"queued"}, "details":{"retained":true} }\n';
const REFUSAL =
	'{"ok":false,"command":"send","v":2,"error":"refused","meta":"daemon rejected the body","details":{"code":"E-EMPTY","original":true}}\n';

interface CliRun {
	code: number;
	stdout: string;
	stderr: string;
}
interface Received {
	path: string;
	method: string;
	authorization: string | undefined;
	body: string;
}
let root: string;
let home: string;
let legacyHome: string;
let stateDir: string;
let addr: string;
let server: Server;
let received: Received[];
let responseBody: string;
let responseStatus: number;
const children = new Set<ChildProcessWithoutNullStreams>();

beforeEach(async () => {
	root = realpathSync(mkdtempSync(join(tmpdir(), "pij-bodyfile-rs-")));
	home = join(root, "home");
	legacyHome = join(home, ".pij");
	stateDir = join(root, "rs");
	mkdirSync(home);
	mkdirSync(stateDir);
	writeFileSync(join(stateDir, "daemon.key"), "body-file-private-key");
	received = [];
	responseBody = SUCCESS;
	responseStatus = 200;
	server = createServer((request, response) => {
		void (async () => {
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			const record = {
				path: request.url ?? "",
				method: request.method ?? "",
				authorization: request.headers.authorization,
				body: Buffer.concat(chunks).toString("utf8"),
			};
			received.push(record);
			response.writeHead(record.path === "/health" ? 200 : responseStatus, {
				"Content-Type": "application/json",
			});
			response.end(
				record.path === "/health"
					? JSON.stringify({
							ok: true,
							command: "health",
							v: 2,
							data: { status: "ok", build: "fixture", offline: true, machine: "private" },
						})
					: responseBody,
			);
		})().catch((error: Error) => response.destroy(error));
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (address === null || typeof address === "string")
		throw new Error("fixture did not bind a private TCP port");
	addr = `127.0.0.1:${address.port}`;
});

afterEach(async () => {
	await Promise.all(
		[...children].map(
			(child) =>
				new Promise<void>((resolve) => {
					child.once("close", () => resolve());
					child.kill("SIGKILL");
				}),
		),
	);
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
		server.closeAllConnections();
	});
	rmSync(root, { recursive: true, force: true });
});

function runPij(argv: readonly string[], stdin = ""): Promise<CliRun> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [TSX, CLI, ...argv], {
			cwd: root,
			env: {
				PATH: process.env.PATH,
				HOME: home,
				USERPROFILE: home,
				TMPDIR: root,
				PIJ_HOME: legacyHome,
				PIJ_RS_ADDR: addr,
				PIJ_RS_STATE_DIR: stateDir,
				NODE_NO_WARNINGS: "1",
				PIJ_SESSION_ID: "body-file-caller",
				TMUX_PANE: "%501",
			},
			stdio: "pipe",
			timeout: 20_000,
			killSignal: "SIGKILL",
		});
		children.add(child);
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.once("error", reject);
		child.stdin.once("error", reject);
		child.once("close", (code, signal) => {
			children.delete(child);
			if (signal !== null) {
				reject(new Error(`CLI terminated by ${signal}`));
				return;
			}
			resolve({
				code: code ?? 1,
				stdout: Buffer.concat(stdout).toString("utf8"),
				stderr: Buffer.concat(stderr).toString("utf8"),
			});
		});
		child.stdin.end(stdin);
	});
}

function sendRequest(): { argv: string[]; body_literal?: string; caller: Record<string, unknown> } {
	const sent = received.filter((request) => request.path !== "/health");
	expect(sent).toHaveLength(1);
	const request = sent[0] as Received;
	expect(request).toMatchObject({
		path: "/v1/shim/send",
		method: "POST",
		authorization: "Bearer body-file-private-key",
	});
	return JSON.parse(request.body);
}

describe("pij send --body-file through the shipped rs adapter", () => {
	it.each([
		HOSTILE_BODY,
		"   hello   \n\n",
		"",
		"  \n\n",
	])("forwards file text literally, leaving body admission to the daemon: %j", async (body) => {
		const path = join(root, "literal body ; not a shell.txt");
		writeFileSync(path, body);
		const args = ["send", "pij-target", "--body-file", path, "--json"];
		expect(await runPij(args)).toEqual({ code: 0, stdout: SUCCESS, stderr: "" });
		expect(sendRequest()).toMatchObject({
			argv: args,
			body_literal: body,
			caller: { pijSessionId: "body-file-caller", tmuxPane: "%501", cwd: root },
		});
		expect(sendRequest().argv).not.toContain(body);
		expect(existsSync(legacyHome)).toBe(false);
	});

	it("reads stdin as one literal body, preserving hostile text and final newlines", async () => {
		const args = ["send", "pij-target", "--body-file", "-", "--json"];
		expect(await runPij(args, HOSTILE_BODY)).toEqual({ code: 0, stdout: SUCCESS, stderr: "" });
		expect(sendRequest()).toMatchObject({ argv: args, body_literal: HOSTILE_BODY });
		expect(existsSync(legacyHome)).toBe(false);
	});

	it("reads relative body paths from the actual invocation cwd", async () => {
		writeFileSync(join(root, "relative.txt"), HOSTILE_BODY);
		const args = ["send", "pij-target", "--body-file", "relative.txt", "--json"];
		expect((await runPij(args)).code).toBe(0);
		expect(sendRequest()).toMatchObject({ argv: args, body_literal: HOSTILE_BODY });
	});

	it.each([
		["send", "pij-target", "--wait", "1"],
		["send", "pij-target", "--wait"],
		["send", "--to", "pij-first", "--to", "pij-second"],
	])("does not re-lex body text or mirror flag valence for %j", async (...prefix) => {
		const path = join(root, "body.txt");
		writeFileSync(path, HOSTILE_BODY);
		const args = [...prefix, "--body-file", path, "--json"];
		expect((await runPij(args)).code).toBe(0);
		expect(sendRequest()).toMatchObject({ argv: args, body_literal: HOSTILE_BODY });
	});

	it.each([
		["send", "pij-target", "inline body"],
		["send", "pij-target", "--command", "compact"],
		["send", "pij-target", "--command=compact"],
	])("preserves daemon refusal for body conflicts rather than adding a CLI parser: %j", async (...prefix) => {
		const path = join(root, "body.txt");
		writeFileSync(path, HOSTILE_BODY);
		responseStatus = 400;
		responseBody = REFUSAL;
		const args = [...prefix, "--body-file", path, "--json"];
		expect(await runPij(args)).toEqual({ code: 4, stdout: REFUSAL, stderr: "" });
		expect(sendRequest()).toMatchObject({ argv: args, body_literal: HOSTILE_BODY });
		expect(existsSync(legacyHome)).toBe(false);
	});

	it.each([
		false,
		true,
	])("preserves daemon empty-body refusal for broadcast=%s without legacy writes", async (broadcast) => {
		const path = join(root, "blank.txt");
		writeFileSync(path, "  \n\n");
		responseStatus = 422;
		responseBody = REFUSAL;
		const args = [
			"send",
			...(broadcast ? ["--to", "pij-first", "--to", "pij-second"] : ["pij-target"]),
			"--body-file",
			path,
			"--json",
		];
		expect(await runPij(args)).toEqual({ code: 4, stdout: REFUSAL, stderr: "" });
		expect(sendRequest()).toMatchObject({ argv: args, body_literal: "  \n\n" });
		expect(existsSync(legacyHome)).toBe(false);
	});

	it.each([
		["--body-file"],
		["--body-file", "--json"],
		["--body-file", "missing-file.txt"],
	])("refuses unreadable or missing body-file values before sending: %j", async (...flags) => {
		const result = await runPij(["send", "pij-target", ...flags, "--json"]);
		expect(result.code).not.toBe(0);
		expect(JSON.parse(result.stdout)).toMatchObject({
			ok: false,
			v: 2,
			error: "refused",
			details: { code: "E-RS-REQUEST" },
		});
		expect(JSON.parse(result.stdout).meta).toContain("--body-file");
		expect(received.filter((request) => request.path !== "/health")).toEqual([]);
		expect(existsSync(legacyHome)).toBe(false);
	});

	it("leaves inline message bodies in argv and does not invent body_literal", async () => {
		const args = ["send", "pij-target", HOSTILE_BODY, "--json"];
		expect((await runPij(args)).code).toBe(0);
		expect(sendRequest().argv).toEqual(args);
		expect(sendRequest()).not.toHaveProperty("body_literal");
	});

	it("shows literal-body safety on the actual send help surface without requiring a daemon", async () => {
		const result = await runPij(["send", "--help"]);
		expect(result).toMatchObject({ code: 0, stderr: "" });
		for (const text of [
			"pij send <id>",
			"--body-file",
			"substitute in YOUR shell",
			"UNSAFE",
			"--file <path>",
			"<<'PIJ'",
		])
			expect(result.stdout).toContain(text);
		expect(result.stdout).not.toContain("pij spawn");
		expect(received).toEqual([]);
		expect(existsSync(legacyHome)).toBe(false);
	});
});

// Independent legacy library parser proofs remain valid. The rs-only executable
// no longer mirrors these tables or uses this parser for body-file requests.
describe("core send parser flag valence", () => {
	const SENTINEL = "pij-valence-sentinel";
	const parseSend = (argv: readonly string[]) => {
		const parsed = parseArgs(argv);
		if (!parsed.ok)
			throw new Error(`expected a successful parse, got ${parsed.code}: ${parsed.message}`);
		if (parsed.value.verb !== "send")
			throw new Error(`expected verb "send", got "${parsed.value.verb}"`);
		return parsed.value;
	};
	it("--json is BOOLEAN: it consumes nothing, so the sentinel becomes the body", () => {
		const cmd = parseSend(["send", "tgt", "--json", SENTINEL]);
		expect(cmd.json).toBe(true);
		expect(cmd.text).toBe(SENTINEL);
	});
	it("--to is VALUED: both targets land in targets, the sentinel stays the body", () => {
		const cmd = parseSend(["send", "--to", "pij-valence-a", "--to", "pij-valence-b", SENTINEL]);
		expect(cmd.targets).toEqual(["pij-valence-a", "pij-valence-b"]);
		expect(cmd.broadcast).toBe(true);
		expect(cmd.text).toBe(SENTINEL);
	});
	it("--command is VALUED: the name lands in command", () => {
		const cmd = parseSend(["send", "tgt", "--command", "compact"]);
		expect(cmd.command).toBe("compact");
		expect(cmd.text).toBeUndefined();
	});
	it("--file and --caption are VALUED: the path and sentinel land in their own slots", () => {
		const path = "/tmp/pij-valence-fixture.txt";
		const cmd = parseSend(["send", "tgt", "--file", path, "--caption", SENTINEL]);
		expect(cmd.file).toBe(path);
		expect(cmd.caption).toBe(SENTINEL);
		expect(cmd.caption).not.toBe(cmd.file);
		expect(cmd.text).toBeUndefined();
	});
	it("--wait is VALUED: milliseconds land in waitMs, not in body", () => {
		const cmd = parseSend(["send", "tgt", SENTINEL, "--wait", "500"]);
		expect(cmd.wait).toBe(true);
		expect(cmd.waitMs).toBe(500);
		expect(cmd.text).toBe(SENTINEL);
	});
});
