import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Fence } from "../core/platform/types.js";
import { ok } from "../core/types.js";
import { FsFenceStore } from "./fence-store.js";
import { FsRegistry } from "./fs-registry.js";

const TS = "2026-07-20T10:00:00.000Z";

function fence(id: string, allocation: string): Fence {
	return {
		schema_version: 1,
		id,
		allocation,
		touchSet: [".pi/extensions/pij/core/**"],
		shared: [".pi/extensions/pij/core/cli.ts"],
		class: "notify-only",
		updated: { actor: "stream-owner", ts: TS },
	};
}

describe("FsFenceStore — AC-03/AC-08", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-fence-"));
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("writes fences/<id>.json and read/list round-trip sorted by id", () => {
		const store = new FsFenceStore(home);
		const zeta = fence("fence-zeta", "alloc-zeta");
		const alpha = fence("fence-alpha", "alloc-alpha");
		expect(store.write(zeta)).toEqual(ok(undefined));
		expect(store.write(alpha)).toEqual(ok(undefined));
		expect(store.read(alpha.id)).toEqual(alpha);
		expect(store.list()).toEqual([alpha, zeta]);
		const path = join(home, "fences", `${alpha.id}.json`);
		expect(existsSync(path)).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(alpha);
	});

	it("updates the same fence id atomically", () => {
		const store = new FsFenceStore(home);
		const initial = fence("fence-alpha", "alloc-alpha");
		expect(store.write(initial)).toEqual(ok(undefined));
		const updated: Fence = { ...initial, touchSet: ["docs/**"], shared: [] };
		expect(store.write(updated)).toEqual(ok(undefined));
		expect(store.read(initial.id)).toEqual(updated);
		expect(readdirSync(join(home, "fences"))).toEqual([`${initial.id}.json`]);
	});

	it("rejects unsafe ids and never escapes the fences/ subdirectory", () => {
		const store = new FsFenceStore(home);
		expect(store.write(fence("../peer", "alloc-alpha"))).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(store.read("../peer")).toBeNull();
		expect(readdirSync(home)).toEqual([]);
	});

	it("phantom-peer guard: fence records never surface in FsRegistry.list()", () => {
		const store = new FsFenceStore(home);
		expect(store.write(fence("fence-alpha", "alloc-alpha"))).toEqual(ok(undefined));
		expect(readdirSync(home)).toEqual(["fences"]);
		expect(new FsRegistry(home).list()).toEqual([]);
	});
});
