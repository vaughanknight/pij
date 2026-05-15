// Adapter: invokes the package-vetter minih agent and parses its
// Verdict JSON output. Real LLM calls happen in the spawned subprocess;
// nothing here makes HTTP requests directly.
//
// Skip mechanism: set PIJ_VET_SKIP_AGENT=1 to short-circuit the agent
// (returns an `info` finding noting the skip). Useful for fast iteration
// or CI where live LLM calls aren't desired.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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

	// minih run uses `-p key=value` repeatables for input. Slug resolved
	// relative to cwd's agents/ dir, so we cwd into PIJ_ROOT. Stdout of
	// `minih run` is a streaming/pretty envelope — the canonical Verdict
	// lives in the run's output/report.json, addressable via `minih last-run`.
	const runResult = spawnSync(
		"minih",
		["run", "package-vetter", "-p", `packagePath=${packagePath}`, "-p", `source=${source}`],
		{
			encoding: "utf8",
			timeout: 600_000,
			cwd: PIJ_ROOT,
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	// The report.json is the canonical Verdict regardless of minih's exit code
	// (transient validation conflicts can flag the run as degraded even when
	// the agent's output is correct). We always try the last-run path first and
	// fall back to the run-error only when no report exists.
	const lastRun = spawnSync("minih", ["last-run", "package-vetter"], {
		encoding: "utf8",
		cwd: PIJ_ROOT,
		stdio: ["ignore", "pipe", "pipe"],
	});
	let reportPath = "";
	try {
		const env = JSON.parse(lastRun.stdout) as { data?: { reportPath?: string } };
		reportPath = env.data?.reportPath ?? "";
	} catch {
		reportPath = "";
	}
	if (!reportPath || !existsSync(reportPath)) {
		if (runResult.error || runResult.status !== 0) {
			return {
				vetter: "agent",
				score: 0,
				level: "warn",
				findings: [
					{
						rule: "vetter:meta",
						msg: `agent invocation failed (exit ${runResult.status}): ${(runResult.stderr ?? "").toString().slice(0, 200)}`,
						severity: "warn",
					},
				],
				scannedFiles: 0,
				durationMs: Date.now() - start,
			};
		}
		return {
			vetter: "agent",
			score: 0,
			level: "warn",
			findings: [
				{
					rule: "vetter:meta",
					msg: `agent ran but report.json not found via last-run`,
					severity: "warn",
				},
			],
			scannedFiles: 0,
			durationMs: Date.now() - start,
		};
	}
	let parsed: Verdict;
	try {
		parsed = JSON.parse(readFileSync(reportPath, "utf8")) as Verdict;
	} catch (err) {
		return {
			vetter: "agent",
			score: 0,
			level: "warn",
			findings: [
				{
					rule: "vetter:meta",
					msg: `report.json not valid JSON: ${(err as Error).message.slice(0, 160)}`,
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
