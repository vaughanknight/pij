#!/usr/bin/env tsx
// npm run new -- <name>
//
// Scaffolds .pi/extensions/<name>/ from harness/templates/extension/.
// All paths absolute via import.meta.dirname so it works from any cwd.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TEMPLATE_DIR = join(import.meta.dirname, "..", "templates", "extension");
const TARGET_ROOT = join(import.meta.dirname, "..", "..", ".pi", "extensions");

function toClassName(name: string): string {
	return name
		.split(/[-_]/)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join("");
}

function fillTemplate(source: string, subs: Record<string, string>): string {
	return source.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
		if (!(key in subs)) throw new Error(`unknown placeholder {{${key}}}`);
		const value = subs[key];
		if (value === undefined) throw new Error(`unknown placeholder {{${key}}}`);
		return value;
	});
}

function main(): void {
	const name = process.argv[2];
	if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
		console.error("usage: npm run new -- <name>");
		console.error("  <name> must match /^[a-z][a-z0-9-]*$/");
		process.exit(1);
	}

	const targetDir = join(TARGET_ROOT, name);
	if (existsSync(targetDir)) {
		console.error(`error: ${targetDir} already exists`);
		process.exit(1);
	}

	const subs = {
		name,
		ClassName: toClassName(name),
	};

	mkdirSync(targetDir, { recursive: true });

	for (const tplFile of readdirSync(TEMPLATE_DIR)) {
		if (!tplFile.endsWith(".template")) continue;
		const outFile = tplFile.replace(/\.template$/, "");
		const tpl = readFileSync(join(TEMPLATE_DIR, tplFile), "utf8");
		writeFileSync(join(targetDir, outFile), fillTemplate(tpl, subs));
	}

	// Plan T017 amendment: write a `.generated` marker so T035 teardown can
	// confirm the directory was created by this session before running rm -rf.
	writeFileSync(join(targetDir, ".generated"), `${new Date().toISOString()}\n`);

	console.log(`✓ Created .pi/extensions/${name}/`);
	console.log("");
	console.log("Next:");
	console.log("  npm test                       # verify scaffold compiles");
	console.log("  cd pij && pi                   # auto-loads the extension");
	console.log(`  /${name}                       # in the TUI`);
	console.log(`  npm run smoke -- ${name}        # end-to-end smoke`);
}

main();
