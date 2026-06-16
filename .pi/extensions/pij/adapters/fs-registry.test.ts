import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SessionDescriptor } from "../core/types.js";
import { FsRegistry } from "./fs-registry.js";

function descriptor(id: string): SessionDescriptor {
	return {
		id,
		role: "worker",
		folder: "/proj",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 4242,
		startedAt: "2026-06-16T00:00:00.000Z",
	};
}

describe("FsRegistry", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-reg-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("write → read/list returns the descriptor", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("alice"));
		expect(reg.read("alice")?.id).toBe("alice");
		expect(reg.list().map((d) => d.id)).toEqual(["alice"]);
	});

	it("remove deletes the descriptor (idempotent)", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("bob"));
		reg.remove("bob");
		expect(reg.read("bob")).toBeNull();
		expect(() => reg.remove("bob")).not.toThrow();
	});

	it("read of an absent id is null; list of an empty home is []", () => {
		const reg = new FsRegistry(join(home, "nope"));
		expect(reg.read("ghost")).toBeNull();
		expect(reg.list()).toEqual([]);
	});

	it("skips a malformed descriptor file instead of throwing", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("good"));
		writeFileSync(join(home, "bad.json"), "{ not json");
		expect(reg.list().map((d) => d.id)).toEqual(["good"]);
	});

	it("ignores per-session <id>/ subdirectories", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("alice"));
		mkdirSync(join(home, "alice"), { recursive: true }); // the data dir
		expect(reg.list().map((d) => d.id)).toEqual(["alice"]);
	});

	it("a fresh adapter over the same home reads prior writes", () => {
		new FsRegistry(home).write(descriptor("carol"));
		expect(new FsRegistry(home).read("carol")?.id).toBe("carol");
	});
});
