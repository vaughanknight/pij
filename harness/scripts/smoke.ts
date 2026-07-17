#!/usr/bin/env tsx
// npm run smoke -- [name] — runs each .pi/extensions/<name>/smoke.ts via the Driver SDK.

import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

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

interface WatchdogSmokeResult {
	readonly verdict: "PASS" | "SKIP" | "FAIL";
	readonly reason?: string;
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
	if (files.length === 0 && !includeWatchdog) {
		console.log(filter ? `no smoke.ts in ${filter}` : "no smoke scenarios");
		process.exit(0);
	}
	const extensionEntries = findProjectExtensionEntries(EXTENSIONS_ROOT);
	let failed = 0;
	if (includeWatchdog) {
		process.stdout.write("smoke: pij-watchdog ... ");
		const watchdog = runWatchdogSmoke();
		if (watchdog.verdict === "PASS") console.log("✓");
		else if (watchdog.verdict === "SKIP") console.log(`↷ (${watchdog.reason ?? "skipped"})`);
		else {
			failed++;
			console.log("✗");
			console.error(watchdog.reason ?? "watchdog smoke failed");
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
