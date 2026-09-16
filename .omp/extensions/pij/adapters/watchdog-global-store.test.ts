import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsRegistry } from "./fs-registry.js";
import { FsWatchdogGlobalStore } from "./watchdog-store.js";

describe("FsWatchdogGlobalStore (Plan 056 — machine-wide switch)", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-wd-global-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("defaults to enabled (absent file ⇒ not disabled)", () => {
		expect(new FsWatchdogGlobalStore(home).disabled()).toBe(false);
	});

	it("round-trips disable and enable", () => {
		const store = new FsWatchdogGlobalStore(home);
		store.setEnabled(false);
		expect(store.disabled()).toBe(true);
		store.setEnabled(true);
		expect(store.disabled()).toBe(false);
	});

	it("fails safe on a malformed global file (defaults to enabled)", () => {
		const store = new FsWatchdogGlobalStore(home);
		store.setEnabled(false);
		// Corrupt whatever file the store actually wrote — a broken switch must
		// never silently disable the fleet. Discover the path, don't hardcode it.
		const globalFile = findGlobalJson(home);
		expect(globalFile).not.toBeNull();
		writeFileSync(globalFile as string, "{not json");
		expect(store.disabled()).toBe(false);
	});

	it("writes NO top-level *.json — stays out of the registry's directory scan", () => {
		// FsRegistry.list() does readdirSync(pijHome) and reads every top-level
		// *.json. It ignores files without a string `id`, so this {enabled} file
		// would be filtered anyway — but nesting it under pij-watchdog/ is the
		// structural guarantee: no top-level *.json exists to scan at all, so the
		// switch can never regress into a phantom peer regardless of future
		// registry parsing. Assert the structure directly.
		new FsWatchdogGlobalStore(home).setEnabled(false);
		const topLevelJson = readdirSync(home).filter((n) => n.endsWith(".json"));
		expect(topLevelJson).toEqual([]);
		expect(new FsRegistry(home).list()).toEqual([]);
	});
});

/** Recursively find the single global.json the store wrote (path-agnostic). */
function findGlobalJson(dir: string): string | null {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) {
			const nested = findGlobalJson(full);
			if (nested) return nested;
		} else if (name === "global.json") {
			return full;
		}
	}
	return null;
}
