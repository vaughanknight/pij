import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSpawnExpectation } from "../core/spawn-expectation.js";
import { FsSpawnExpectationStore } from "./spawn-expectation-store.js";

let home: string | undefined;
afterEach(() => {
	if (home) rmSync(home, { recursive: true, force: true });
	home = undefined;
});

describe("FsSpawnExpectationStore", () => {
	it("persists an expectation by spawn id before any descriptor exists", () => {
		home = mkdtempSync(join(tmpdir(), "pij-expectation-"));
		const store = new FsSpawnExpectationStore(home);
		const expectation = createSpawnExpectation({
			spawnId: "s-123",
			creatorId: "pij-parent",
			requestedHarness: "pi",
			requestedAt: "2026-07-20T00:00:00.000Z",
		});
		store.write(expectation);
		expect(store.read("s-123")).toEqual(expectation);
		expect(new FsSpawnExpectationStore(home).list()).toEqual([expectation]);
	});
});
