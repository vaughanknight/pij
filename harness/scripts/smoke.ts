#!/usr/bin/env tsx
// npm run smoke -- [name] — runs each .pi/extensions/<name>/smoke.ts via the Driver SDK.

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { loadScenario, runScenario } from "../driver/index.js";

const PIJ_ROOT = join(import.meta.dirname, "..", "..");

function findScenarios(filter?: string): string[] {
	const root = join(PIJ_ROOT, ".pi", "extensions");
	const found: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(root);
	} catch {
		return found; // D-013: .pi/extensions/ missing on fresh clone is fine
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
	let failed = 0;
	for (const file of files) {
		const scenario = await loadScenario(file);
		process.stdout.write(`smoke: ${scenario.name} ... `);
		const report = await runScenario(scenario, { cwd: PIJ_ROOT });
		if (report.ok) console.log("✓");
		else {
			failed++;
			console.log("✗");
			console.error(JSON.stringify(report.failure, null, 2));
		}
	}
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: Error) => {
	console.error(err.message);
	process.exit(2);
});
