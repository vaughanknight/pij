// atomic-file — fsyncDirBestEffort contract (audit F2): best-effort means it
// NEVER throws, on any input, on any platform; and the durability hop must not
// disturb writeJsonAtomic's round-trip. The power-loss guarantee itself is not
// unit-testable — these pin the fail-soft envelope around it.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fsyncDirBestEffort, writeJsonAtomic } from "./atomic-file.js";

describe("fsyncDirBestEffort", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-atomic-file-"));
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("fsyncs a real directory without throwing", () => {
		expect(() => fsyncDirBestEffort(home)).not.toThrow();
	});

	it("swallows a missing path and a regular file (platform-dependent dir-fsync support)", () => {
		expect(() => fsyncDirBestEffort(join(home, "never-created"))).not.toThrow();
		const file = join(home, "regular.json");
		writeFileSync(file, "{}");
		expect(() => fsyncDirBestEffort(file)).not.toThrow();
	});

	it("writeJsonAtomic still round-trips with the directory-durability hop in place", () => {
		const path = join(home, "nested", "record.json");
		writeJsonAtomic(path, { schema_version: 1, slug: "alpha" });
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ schema_version: 1, slug: "alpha" });
	});
});
