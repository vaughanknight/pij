import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Allocation } from "../core/platform/types.js";
import { ok } from "../core/types.js";
import { FsAllocationStore } from "./allocation-store.js";
import { FsRegistry } from "./fs-registry.js";

const TS = "2026-07-20T10:00:00.000Z";

function allocation(id: string, ordinal: number): Allocation {
	return {
		schema_version: 1,
		id,
		project: "team-scaffold",
		ordinal,
		slug: id.replace(/^alloc-s\d+-/, ""),
		worktree: `/repo-worktrees/s${String(ordinal).padStart(3, "0")}`,
		branch: `s${String(ordinal).padStart(3, "0")}/stream`,
		baseSha: "0123456789abcdef",
		state: "created",
		steps: [],
		created: { actor: "prime", ts: TS },
	};
}

describe("FsAllocationStore — AC-01/AC-08", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-allocation-"));
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("writes allocations/<id>.json and read/list round-trip sorted by ordinal", () => {
		const store = new FsAllocationStore(home);
		const second = allocation("alloc-s062-second", 62);
		const first = allocation("alloc-s061-first", 61);
		expect(store.write(second)).toEqual(ok(undefined));
		expect(store.write(first)).toEqual(ok(undefined));
		expect(store.read(first.id)).toEqual(first);
		expect(store.list()).toEqual([first, second]);
		const path = join(home, "allocations", `${first.id}.json`);
		expect(existsSync(path)).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(first);
	});

	it("updates the same allocation id atomically, including steps[]", () => {
		const store = new FsAllocationStore(home);
		const initial = allocation("alloc-s061-first", 61);
		expect(store.write(initial)).toEqual(ok(undefined));
		const updated: Allocation = {
			...initial,
			steps: [{ name: "worktree-created", ok: true, evidence: initial.worktree, ts: TS }],
		};
		expect(store.write(updated)).toEqual(ok(undefined));
		expect(store.read(initial.id)).toEqual(updated);
		expect(readdirSync(join(home, "allocations"))).toEqual([`${initial.id}.json`]);
	});

	it("rejects unsafe ids and never escapes the allocations/ subdirectory", () => {
		const store = new FsAllocationStore(home);
		expect(store.write(allocation("../peer", 61))).toMatchObject({
			ok: false,
			code: "E-ARG",
		});
		expect(store.read("../peer")).toBeNull();
		expect(readdirSync(home)).toEqual([]);
	});

	it("phantom-peer guard: allocation records never surface in FsRegistry.list()", () => {
		const store = new FsAllocationStore(home);
		expect(store.write(allocation("alloc-s061-first", 61))).toEqual(ok(undefined));
		expect(readdirSync(home)).toEqual(["allocations"]);
		expect(new FsRegistry(home).list()).toEqual([]);
	});
});
