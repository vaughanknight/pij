#!/usr/bin/env tsx
// npm run smoke -- [name]
//
// Without a name: runs every smoke.ts scenario found under .pi/extensions/.
// With a name: runs that one only.

import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

interface SmokeStep {
	send: string;
	expect?: string | RegExp;
	delay?: number;
}

interface SmokeScenario {
	name: string;
	bootSeconds?: number;
	steps: SmokeStep[];
}

const PIJ_ROOT = join(import.meta.dirname, "..", "..");
const SESSION = "pij-smoke";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tmux(...args: string[]): string {
	return execSync(["tmux", ...args].join(" "), { encoding: "utf8" });
}

function tmuxSafe(...args: string[]): void {
	try {
		tmux(...args);
	} catch {
		/* swallow */
	}
}

async function runScenario(scenario: SmokeScenario): Promise<void> {
	tmuxSafe("kill-session", "-t", SESSION);
	tmux("new-session", "-d", "-s", SESSION, "-x", "120", "-y", "40");
	tmux("send-keys", "-t", SESSION, `"cd ${PIJ_ROOT} && pi"`, "Enter");
	await sleep((scenario.bootSeconds ?? 3) * 1000);

	for (const step of scenario.steps) {
		tmux("send-keys", "-t", SESSION, `"${step.send}"`, "Enter");
		await sleep(step.delay ?? 1500);

		if (step.expect != null) {
			const out = tmux("capture-pane", "-t", SESSION, "-p");
			const re = step.expect instanceof RegExp ? step.expect : new RegExp(step.expect);
			if (!re.test(out)) {
				tmuxSafe("kill-session", "-t", SESSION);
				const tail = out.slice(-800);
				throw new Error(
					`smoke[${scenario.name}]: step "${step.send}" expected /${re.source}/\n--- pane tail ---\n${tail}`,
				);
			}
		}
	}

	tmuxSafe("kill-session", "-t", SESSION);
}

function findScenarios(filter?: string): string[] {
	const root = join(PIJ_ROOT, ".pi", "extensions");
	const found: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		// .pi/extensions/ may be missing on a true fresh clone (git
		// doesn't preserve empty dirs). Treat as no scenarios — same
		// behaviour as an empty directory. Companion finding F014/F007.
		return found;
	}
	for (const entry of entries) {
		if (filter && entry !== filter) continue;
		const file = join(root, entry, "smoke.ts");
		try {
			if (statSync(file).isFile()) found.push(file);
		} catch {
			/* none */
		}
	}
	return found;
}

async function main(): Promise<void> {
	const filter = process.argv[2];
	const files = findScenarios(filter);
	if (files.length === 0) {
		console.log(filter ? `no smoke.ts in ${filter}` : "no smoke scenarios");
		process.exit(0);
	}

	for (const file of files) {
		const mod = (await import(pathToFileURL(file).href)) as {
			default: SmokeScenario;
		};
		const scenario = mod.default;
		process.stdout.write(`smoke: ${scenario.name} ... `);
		await runScenario(scenario);
		console.log("✓");
	}
}

main().catch((err: Error) => {
	console.error(err.message);
	process.exit(1);
});
