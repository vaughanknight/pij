// Adapter: invokes the package-vetter minih agent and parses its
// Verdict JSON output. Real LLM calls happen in the spawned subprocess;
// nothing here makes HTTP requests directly.
//
// Skip mechanism: set PIJ_VET_SKIP_AGENT=1 to short-circuit the agent
// (returns an `info` finding noting the skip). Useful for fast iteration
// or CI where live LLM calls aren't desired.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { deriveLevel, deriveScore, type Verdict, type Vetter } from "./types.js";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const AGENT_PACK = resolve(PIJ_ROOT, "agents", "package-vetter");

function skipVerdict(reason: string, durationMs: number): Verdict {
	return {
		vetter: "agent",
		score: 100,
		level: "ok",
		findings: [
			{
				rule: "vetter:meta",
				msg: `agent skipped: ${reason}`,
				severity: "info",
			},
		],
		scannedFiles: 0,
		durationMs,
	};
}

function minihAvailable(): boolean {
	try {
		execFileSync("minih", ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

export async function vet(packagePath: string, source: string): Promise<Verdict> {
	const start = Date.now();

	if (process.env.PIJ_VET_SKIP_AGENT === "1") {
		return skipVerdict("PIJ_VET_SKIP_AGENT=1", Date.now() - start);
	}
	if (!existsSync(AGENT_PACK)) {
		return skipVerdict(`agent pack not found at ${AGENT_PACK}`, Date.now() - start);
	}
	if (!minihAvailable()) {
		return skipVerdict("minih binary not on PATH", Date.now() - start);
	}
	if (!existsSync(packagePath)) {
		return {
			vetter: "agent",
			score: 0,
			level: "fail",
			findings: [
				{
					rule: "vetter:bad-input",
					msg: `packagePath does not exist: ${packagePath}`,
					severity: "fail",
				},
			],
			scannedFiles: 0,
			durationMs: Date.now() - start,
		};
	}

	const input = JSON.stringify({ packagePath, source });
	const result = spawnSync("minih", ["run", AGENT_PACK, "--input", input], {
		encoding: "utf8",
		timeout: 600_000,
		stdio: ["ignore", "pipe", "pipe"],
	});

	if (result.error || result.status !== 0) {
		return {
			vetter: "agent",
			score: 0,
			level: "warn",
			findings: [
				{
					rule: "vetter:meta",
					msg: `agent invocation failed (exit ${result.status}): ${(result.stderr ?? "").toString().slice(0, 200)}`,
					severity: "warn",
				},
			],
			scannedFiles: 0,
			durationMs: Date.now() - start,
		};
	}

	let parsed: Verdict;
	try {
		parsed = JSON.parse(result.stdout) as Verdict;
	} catch (err) {
		return {
			vetter: "agent",
			score: 0,
			level: "warn",
			findings: [
				{
					rule: "vetter:meta",
					msg: `agent stdout not valid JSON: ${(err as Error).message.slice(0, 160)}`,
					severity: "warn",
				},
			],
			scannedFiles: 0,
			durationMs: Date.now() - start,
		};
	}

	// Force vetter name + recompute level/score for safety
	parsed.vetter = "agent";
	parsed.level = deriveLevel(parsed.findings ?? []);
	parsed.score = deriveScore(parsed.findings ?? []);
	parsed.durationMs = parsed.durationMs ?? Date.now() - start;
	parsed.scannedFiles = parsed.scannedFiles ?? 0;
	return parsed;
}

export const agentVetter: Vetter = { name: "agent", vet };

// alias for external callers per plan
export const vetWithAgent = vet;
