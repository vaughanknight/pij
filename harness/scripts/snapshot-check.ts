#!/usr/bin/env tsx
// FX001-4: snapshot staleness alarm.
//
// Wired into self-check. Compares briefing.md's current SHA-256 against the
// SHA recorded in agents/package-vetter/__snapshots__/_meta.json. If they
// differ — rubric has changed but snapshots are older — print a warning.
// Exit 0 either way (soft alarm; doesn't block self-check).

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const PIJ_ROOT = resolve(import.meta.dirname, "..", "..");
const PACK_DIR = resolve(PIJ_ROOT, "agents", "package-vetter");
const BRIEFING = resolve(PACK_DIR, "briefing.md");
const META = resolve(PACK_DIR, "__snapshots__", "_meta.json");

function sha256(path: string): string {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main(): void {
	if (!existsSync(BRIEFING)) {
		console.log("snapshot-check: briefing.md not found — skipping");
		return;
	}
	const currentSha = sha256(BRIEFING);
	if (!existsSync(META)) {
		console.log(
			`⚠ snapshot-check: no _meta.json at ${META} — run \`npm run snapshots:refresh\` to generate AC-05 evidence`,
		);
		return;
	}
	const meta = JSON.parse(readFileSync(META, "utf8")) as {
		briefingSha?: string;
		regeneratedAt?: string;
	};
	if (meta.briefingSha === currentSha) {
		console.log(
			`✓ snapshot-check: briefing.md SHA matches snapshots (${currentSha.slice(0, 12)}...)`,
		);
		return;
	}
	console.log(
		`⚠ snapshot-check: briefing.md has changed since snapshots were generated\n  · current SHA: ${currentSha.slice(0, 12)}...\n  · snapshot SHA: ${(meta.briefingSha ?? "<missing>").slice(0, 12)}...\n  · regenerated: ${meta.regeneratedAt ?? "<unknown>"}\n  · run \`npm run snapshots:refresh\` to refresh AC-05 evidence`,
	);
}

main();
