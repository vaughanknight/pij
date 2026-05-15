// Wraps `npx lockfile-lint` for registry-host + HTTPS policy on
// package-lock.json. No lockfile → ok with info.

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { deriveLevel, deriveScore, type Finding, type Verdict, type Vetter } from "./types.js";

export async function vet(packagePath: string, _source: string): Promise<Verdict> {
	const start = Date.now();
	const lockPath = resolve(packagePath, "package-lock.json");
	const findings: Finding[] = [];

	if (!existsSync(lockPath)) {
		return {
			vetter: "lockfile-lint",
			score: 100,
			level: "ok",
			findings: [
				{
					rule: "lockfile-lint:no-lockfile",
					msg: "no package-lock.json — skipping lockfile-lint",
					severity: "info",
				},
			],
			scannedFiles: 0,
			durationMs: Date.now() - start,
		};
	}

	try {
		execFileSync(
			"npx",
			[
				"--yes",
				"lockfile-lint",
				"--path",
				lockPath,
				"--type",
				"npm",
				"--allowed-hosts",
				"npm",
				"--validate-https",
			],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
	} catch (err: unknown) {
		const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
		const out = [
			e.stdout ? (typeof e.stdout === "string" ? e.stdout : e.stdout.toString()) : "",
			e.stderr ? (typeof e.stderr === "string" ? e.stderr : e.stderr.toString()) : "",
		]
			.filter(Boolean)
			.join("\n");
		const lines = out
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0 && !l.startsWith("npm "));
		for (const line of lines.slice(0, 10)) {
			findings.push({
				rule: "lockfile-lint:policy",
				msg: line.slice(0, 200),
				severity: "warn",
			});
		}
		if (findings.length === 0) {
			findings.push({
				rule: "lockfile-lint:nonzero-exit",
				msg: "lockfile-lint exited non-zero with no output",
				severity: "warn",
			});
		}
	}

	return {
		vetter: "lockfile-lint",
		score: deriveScore(findings),
		level: deriveLevel(findings),
		findings,
		scannedFiles: 1,
		durationMs: Date.now() - start,
	};
}

export const lockfileLintVetter: Vetter = { name: "lockfile-lint", vet };
