import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FocusManifest } from "../core/types.js";
import { FsFocusStore } from "./focus-store.js";
import { FsRegistry } from "./fs-registry.js";

describe("FsFocusStore", () => {
	let pijHome: string;
	let previousPijHome: string | undefined;

	beforeEach(() => {
		pijHome = mkdtempSync(join(tmpdir(), "pij-focus-store-"));
		previousPijHome = process.env.PIJ_HOME;
		process.env.PIJ_HOME = pijHome;
	});

	afterEach(() => {
		if (previousPijHome === undefined) delete process.env.PIJ_HOME;
		else process.env.PIJ_HOME = previousPijHome;
		rmSync(pijHome, { recursive: true, force: true });
	});

	it("round-trips a focus manifest under PIJ_HOME/focus/<name>/manifest.json", () => {
		const manifest: FocusManifest = {
			version: 1,
			name: "golden-reviewer",
			harness: "claude",
			harnessSessionId: "native-session-1",
			model: "claude-sonnet-5",
			effort: "high",
			originCwd: "/repo",
			sha256: "a".repeat(64),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "native-session-1",
			},
		};

		const store = new FsFocusStore();
		store.write(manifest);

		const manifestPath = join(pijHome, "focus", manifest.name, "manifest.json");
		expect(existsSync(manifestPath)).toBe(true);
		expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toEqual(manifest);
		expect(store.read(manifest.name)).toEqual(manifest);
		expect(store.list()).toEqual([manifest]);
	});

	it("never creates a top-level registry descriptor for a saved focus", () => {
		const registry = new FsRegistry(pijHome);
		const before = registry.list();
		const manifest: FocusManifest = {
			version: 1,
			name: "golden-reviewer",
			harness: "pi",
			harnessSessionId: "native-session-2",
			originCwd: "/repo",
			sha256: "b".repeat(64),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "native-session-2",
			},
		};

		new FsFocusStore().write(manifest);

		expect(registry.list()).toEqual(before);
		expect(readdirSync(pijHome).filter((name) => name.endsWith(".json"))).toEqual([]);
	});

	it("rejects names that could escape the focus subdirectory", () => {
		const manifest: FocusManifest = {
			version: 1,
			name: "../rogue",
			harness: "pi",
			harnessSessionId: "native-session-3",
			originCwd: "/repo",
			sha256: "c".repeat(64),
			createdAt: "2026-07-15T00:00:00.000Z",
			lineage: {
				sourcePijId: "pij-source",
				sourceHarnessSessionId: "native-session-3",
			},
		};

		expect(() => new FsFocusStore().write(manifest)).toThrow(/invalid focus name/i);
	});
});
