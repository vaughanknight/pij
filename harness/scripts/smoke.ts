#!/usr/bin/env tsx
// npm run smoke -- [name] — runs each .pi/extensions/<name>/smoke.ts via the Driver SDK.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { FsDispatchStore } from "../../.pi/extensions/pij/adapters/dispatch-store.js";
import { FsRegistry } from "../../.pi/extensions/pij/adapters/fs-registry.js";
import type { SessionDescriptor } from "../../.pi/extensions/pij/core/types.js";
import { loadScenario, runScenario, type Scenario } from "../driver/index.js";

const PIJ_ROOT = join(import.meta.dirname, "..", "..");
const EXTENSIONS_ROOT = join(PIJ_ROOT, ".pi", "extensions");
const WATCHDOG_PROOF = join(
	PIJ_ROOT,
	"docs",
	"plans",
	"055-pij-watchdog",
	"proofs",
	"run-proofs.ts",
);
const TSX_CLI = createRequire(import.meta.url).resolve("tsx/cli");
const PIJ_CLI = join(PIJ_ROOT, ".pi", "extensions", "pij", "cli.ts");

function findTopLevelFiles(root: string, filename: string, filter?: string): string[] {
	const found: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		return found; // D-013: .pi/extensions/ missing on fresh clone is fine
	}
	for (const entry of entries) {
		if (filter && entry !== filter) continue;
		const file = join(root, entry, filename);
		try {
			if (statSync(file).isFile()) found.push(file);
		} catch {
			/* none */
		}
	}
	return found.sort();
}

function findScenarios(filter?: string): string[] {
	return findTopLevelFiles(EXTENSIONS_ROOT, "smoke.ts", filter);
}

export function findProjectExtensionEntries(root: string): string[] {
	return findTopLevelFiles(root, "index.ts");
}

function quoteShellArg(value: string): string {
	return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

export function resolveSmokeCommand(
	scenario: Pick<Scenario, "cmd">,
	extensionEntries: readonly string[],
): string {
	if (scenario.cmd !== undefined) return scenario.cmd;
	const extensions = [...extensionEntries]
		.sort()
		.map((extension) => ` --extension ${quoteShellArg(extension)}`)
		.join("");
	return `pi --approve --no-extensions${extensions}`;
}

export interface WatchdogSmokeResult {
	readonly verdict: "PASS" | "SKIP" | "FAIL";
	readonly reason?: string;
}

const WATCHDOG_BASELINE_RED_LINES = [
	"baseline-red[pwsh]: harness/scripts/release-age-policy.test.ts requires pwsh",
	"baseline-red[OSC]: .pi/extensions/pij/producers/osc-7337-producer.ts has existing Biome findings",
] as const;

export function renderWatchdogSmokeLines(result: WatchdogSmokeResult): readonly string[] {
	const reason = (result.reason ?? result.verdict.toLowerCase()).replace(/\s+/g, " ").trim();
	const verdict =
		result.verdict === "PASS" ? "watchdog-smoke: green" : `watchdog-smoke: red — ${reason}`;
	return [verdict, ...WATCHDOG_BASELINE_RED_LINES];
}

interface TeamScaffoldSmokeResult {
	readonly verdict: "PASS" | "FAIL";
	readonly reason?: string;
}

function smokeDescriptor(
	home: string,
	repo: string,
	over: Partial<SessionDescriptor> & { readonly id: string },
): SessionDescriptor {
	return {
		folder: repo,
		dataDir: join(home, over.id),
		eventsPath: join(home, over.id, "events.ndjson"),
		pid: process.pid,
		startedAt: new Date().toISOString(),
		state: "idle",
		lifecycle: "bound",
		deliveryMode: "pull",
		...over,
	};
}

function runPij(
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): { readonly stdout: string; readonly stderr: string } {
	const result = spawnSync(process.execPath, [TSX_CLI, PIJ_CLI, ...args], {
		cwd,
		env,
		encoding: "utf8",
		timeout: 15_000,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || `pij exited ${result.status}`);
	}
	return { stdout: result.stdout, stderr: result.stderr };
}

function collectPij(
	args: readonly string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
): Promise<{ readonly status: number | null; readonly stdout: string; readonly stderr: string }> {
	const child = spawn(process.execPath, [TSX_CLI, PIJ_CLI, ...args], {
		cwd,
		env,
		stdio: ["ignore", "pipe", "pipe"],
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
	return new Promise((done) => {
		child.on("close", (status) => done({ status, stdout, stderr }));
	});
}

async function waitForCanaryDispatch(store: FsDispatchStore): Promise<string> {
	const deadline = Date.now() + 5_000;
	while (Date.now() < deadline) {
		const record = store
			.list()
			.find(
				(candidate) =>
					candidate.packetPath.includes("/canary-packets/") &&
					candidate.state === "delivered-unacked",
			);
		if (record) return record.id;
		await new Promise((done) => setTimeout(done, 20));
	}
	throw new Error("canary dispatch did not appear");
}

export async function runTeamScaffoldSmoke(): Promise<TeamScaffoldSmokeResult> {
	const root = mkdtempSync(join(tmpdir(), "pij-team-scaffold-smoke-"));
	const home = join(root, "home");
	const repo = join(root, "repo");
	try {
		mkdirSync(home, { recursive: true });
		mkdirSync(join(repo, "government", "briefs"), { recursive: true });
		mkdirSync(join(repo, "src", "api"), { recursive: true });
		writeFileSync(join(repo, "README.md"), "team scaffold smoke\n");
		writeFileSync(join(repo, "src", "api", "index.ts"), "export const ready = true;\n");
		writeFileSync(join(repo, "government", "briefs", "s061.md"), "# Stream brief\n");
		const fakeBin = join(root, "bin");
		mkdirSync(fakeBin, { recursive: true });
		const fakeTmux = join(fakeBin, "tmux");
		writeFileSync(
			fakeTmux,
			'#!/usr/bin/env node\nprocess.stdout.write("GPT-5.6 Sol · 1.1M context\\n");\n',
		);
		chmodSync(fakeTmux, 0o755);
		for (const args of [
			["init", "--quiet", repo],
			["-C", repo, "config", "user.email", "pij@example.test"],
			["-C", repo, "config", "user.name", "pij smoke"],
			["-C", repo, "add", "README.md", "src/api/index.ts", "government/briefs/s061.md"],
			["-C", repo, "commit", "--quiet", "-m", "initial"],
		] as const) {
			const git = spawnSync("git", args, { encoding: "utf8" });
			if (git.status !== 0) throw new Error(git.stderr.trim() || `git ${args.join(" ")} failed`);
		}

		const registry = new FsRegistry(home);
		registry.write(
			smokeDescriptor(home, repo, {
				id: "pij-parent",
				paneId: "%61",
				harnessSessionId: "native-parent",
			}),
		);
		registry.write(
			smokeDescriptor(home, repo, {
				id: "pij-worker",
				paneId: "%62",
				harnessSessionId: "native-worker",
				boundModel: "github-copilot/gpt-5.6-sol",
				effort: "high",
			}),
		);
		const parentEnv = {
			...process.env,
			PIJ_HOME: home,
			PIJ_SESSION_ID: "pij-parent",
			PIJ_TEST_NO_FSYNC: "1",
			COPILOT_AGENT_SESSION_ID: "",
			CLAUDE_CODE_SESSION_ID: "",
			CODEX_THREAD_ID: "",
			TMUX_PANE: "",
			PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
		};
		const workerEnv = { ...parentEnv, PIJ_SESSION_ID: "pij-worker" };

		runPij(
			[
				"project",
				"create",
				"Team scaffold demo",
				"--slug",
				"team-scaffold-demo",
				"--actor",
				"pij-prime",
			],
			repo,
			parentEnv,
		);
		runPij(
			[
				"stream",
				"create",
				"--project",
				"team-scaffold-demo",
				"--slug",
				"api-rework",
				"--ordinal",
				"61",
				"--actor",
				"pij-prime",
			],
			repo,
			parentEnv,
		);
		runPij(
			["fence", "set", "api-rework", "--paths", "src/api/**", "--actor", "pij-prime"],
			repo,
			parentEnv,
		);

		const dispatched = JSON.parse(
			runPij(
				["dispatch", "pij-worker", "--packet", "government/briefs/s061.md", "--json"],
				repo,
				parentEnv,
			).stdout,
		) as { readonly id: string; readonly packetSha256: string };
		runPij(["ack", dispatched.id, "--packet-sha", dispatched.packetSha256], repo, workerEnv);

		const store = new FsDispatchStore(home);
		const canary = collectPij(
			["canary", "pij-worker", "--expect-model", "github-copilot/gpt-5.6-sol", "--wait=5000"],
			repo,
			parentEnv,
		);
		const canaryId = await waitForCanaryDispatch(store);
		const canaryRecord = store.read(canaryId);
		if (!canaryRecord) throw new Error("canary dispatch vanished");
		const canarySha = createHash("sha256")
			.update(readFileSync(canaryRecord.packetPath))
			.digest("hex");
		runPij(["ack", canaryId, "--packet-sha", canarySha], repo, workerEnv);
		const canaryResult = await canary;
		if (canaryResult.status !== 0) {
			throw new Error(canaryResult.stderr.trim() || canaryResult.stdout.trim());
		}
		if (store.read(canaryId)?.canary === undefined) {
			throw new Error("canary pass did not attach a CanaryRecord");
		}

		const anomalies = JSON.parse(
			runPij(["anomalies", "--json"], repo, parentEnv).stdout,
		) as unknown[];
		if (anomalies.length !== 0) {
			throw new Error(`clean walkthrough produced anomalies: ${JSON.stringify(anomalies)}`);
		}
		runPij(["stream", "close", "alloc-s061-api-rework", "--actor", "pij-prime"], repo, parentEnv);
		return { verdict: "PASS" };
	} catch (error) {
		return {
			verdict: "FAIL",
			reason: error instanceof Error ? error.message : String(error),
		};
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

export function runWatchdogSmoke(): WatchdogSmokeResult {
	const result = spawnSync(process.execPath, [TSX_CLI, WATCHDOG_PROOF, "--smoke"], {
		cwd: PIJ_ROOT,
		encoding: "utf8",
		timeout: 60_000,
	});
	if (result.error) return { verdict: "FAIL", reason: result.error.message };
	if (result.status !== 0) {
		return {
			verdict: "FAIL",
			reason: result.stderr.trim() || result.stdout.trim() || `exit ${result.status ?? 1}`,
		};
	}
	try {
		const parsed = JSON.parse(result.stdout) as unknown;
		if (!parsed || typeof parsed !== "object" || !("verdict" in parsed)) {
			return { verdict: "FAIL", reason: "watchdog smoke emitted no verdict" };
		}
		const verdict = (parsed as { readonly verdict?: unknown }).verdict;
		if (verdict === "PASS" || verdict === "SKIP" || verdict === "FAIL") {
			const reason = (parsed as { readonly reason?: unknown }).reason;
			return {
				verdict,
				...(typeof reason === "string" ? { reason } : {}),
			};
		}
		return { verdict: "FAIL", reason: "watchdog smoke emitted an invalid verdict" };
	} catch (error) {
		return {
			verdict: "FAIL",
			reason: `watchdog smoke emitted invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

async function main(): Promise<void> {
	const filter = process.argv[2];
	const files = findScenarios(filter);
	const includeWatchdog = filter === undefined || filter === "pij" || filter === "watchdog";
	const includeTeamScaffold =
		filter === undefined || filter === "pij" || filter === "team-scaffold";
	if (files.length === 0 && !includeWatchdog && !includeTeamScaffold) {
		console.log(filter ? `no smoke.ts in ${filter}` : "no smoke scenarios");
		process.exit(0);
	}
	const extensionEntries = findProjectExtensionEntries(EXTENSIONS_ROOT);
	let failed = 0;
	if (includeTeamScaffold) {
		process.stdout.write("smoke: pij-team-scaffold ... ");
		const teamScaffold = await runTeamScaffoldSmoke();
		if (teamScaffold.verdict === "PASS") console.log("✓");
		else {
			failed++;
			console.log("✗");
			console.error(teamScaffold.reason ?? "team-scaffold smoke failed");
		}
	}
	for (const file of files) {
		const scenario = await loadScenario(file);
		process.stdout.write(`smoke: ${scenario.name} ... `);
		const report = await runScenario(scenario, {
			cwd: PIJ_ROOT,
			cmd: resolveSmokeCommand(scenario, extensionEntries),
		});
		if (report.ok) console.log("✓");
		else {
			failed++;
			console.log("✗");
			console.error(JSON.stringify(report.failure, null, 2));
		}
	}
	if (includeWatchdog) {
		const watchdog = runWatchdogSmoke();
		if (watchdog.verdict === "FAIL") failed++;
		const output = failed > 0 ? process.stderr : process.stdout;
		for (const line of renderWatchdogSmokeLines(watchdog)) output.write(`${line}\n`);
	}
	process.exit(failed > 0 ? 1 : 0);
}

const isMainModule =
	process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (isMainModule) {
	main().catch((err: Error) => {
		console.error(err.message);
		process.exit(2);
	});
}
