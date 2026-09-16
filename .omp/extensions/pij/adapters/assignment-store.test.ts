// pij platform — FsAssignmentStore adapter specs (plan 054, T005 — RED first).
//
// Pins the coder-seat surface before the implementation lands (T006): layout
// `<pijHome>/assignments/<id>.json`, atomic create-or-replace `write`,
// guard-validated `read` (null on missing/corrupt/foreign/unversioned),
// id-sorted `list`, exact-match `listByNode`, and the phantom-peer law:
// nothing this store writes may surface as a top-level PIJ_HOME peer
// descriptor (FsRegistry.list globs top-level *.json with a string `id`).
// Every test runs against a mkdtempSync temp home passed to the CONSTRUCTOR;
// the real ~/.pij is never touched and process.env is never mutated.

import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Assignment, generalAssignmentId, type Project } from "../core/platform/types.js";
import { ok } from "../core/types.js";
import { FsAssignmentStore } from "./assignment-store.js";
import { FsRegistry } from "./fs-registry.js";

const TS = "2026-07-16T00:00:00.000Z";
const TS_CLOSE = "2026-07-16T01:00:00.000Z";

function asg(over: Partial<Assignment> & { id: string; nodeId: string }): Assignment {
	return {
		schema_version: 1,
		task: `task for ${over.id}`,
		states: [1],
		opened: { actor: "tester", ts: TS },
		...over,
	};
}

describe("FsAssignmentStore", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-plat-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("write lands at assignments/<id>.json and round-trips every field", () => {
		const store = new FsAssignmentStore(home);
		const full = asg({
			id: "asg-full",
			nodeId: "w1",
			projectSlug: "demo-project",
			states: [3, 7],
			closed: { actor: "closer", ts: TS_CLOSE, reason: "done" },
		});
		expect(store.write(full)).toEqual(ok(undefined));
		const path = join(home, "assignments", "asg-full.json");
		expect(existsSync(path)).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(full);
		expect(store.read("asg-full")).toEqual(full);
	});

	it("an open record's file bytes omit absent optionals (no closed/projectSlug keys)", () => {
		const store = new FsAssignmentStore(home);
		const open = asg({ id: "asg-open", nodeId: "w1" });
		expect(store.write(open)).toEqual(ok(undefined));
		const raw = JSON.parse(readFileSync(join(home, "assignments", "asg-open.json"), "utf8"));
		expect(Object.keys(raw)).not.toContain("closed");
		expect(Object.keys(raw)).not.toContain("projectSlug");
		expect(store.read("asg-open")).toEqual(open);
	});

	it("write is create-or-replace: a second write for the same id replaces the record", () => {
		const store = new FsAssignmentStore(home);
		const v1 = asg({ id: "asg-r", nodeId: "w1", task: "first draft" });
		const v2 = asg({ id: "asg-r", nodeId: "w1", task: "revised", states: [4, 5] });
		expect(store.write(v1)).toEqual(ok(undefined));
		expect(store.write(v2)).toEqual(ok(undefined));
		expect(store.read("asg-r")).toEqual(v2);
		expect(store.list()).toEqual([v2]);
		// Atomic replace stages no leftover temp/partial files beside the record.
		expect(readdirSync(join(home, "assignments"))).toEqual(["asg-r.json"]);
	});

	it("read returns null for a missing id", () => {
		expect(new FsAssignmentStore(home).read("asg-ghost")).toBeNull();
	});

	it("read returns null for corrupt JSON", () => {
		mkdirSync(join(home, "assignments"), { recursive: true });
		writeFileSync(join(home, "assignments", "asg-bad.json"), "{ not json");
		expect(new FsAssignmentStore(home).read("asg-bad")).toBeNull();
	});

	it("read returns null for a foreign record (valid Project bytes)", () => {
		const project: Project = {
			schema_version: 1,
			slug: "demo-project",
			description: "a valid project record in the wrong store",
			created: { actor: "tester", ts: TS },
		};
		mkdirSync(join(home, "assignments"), { recursive: true });
		writeFileSync(join(home, "assignments", "asg-foreign.json"), JSON.stringify(project));
		expect(new FsAssignmentStore(home).read("asg-foreign")).toBeNull();
	});

	it("read returns null for an unversioned record", () => {
		mkdirSync(join(home, "assignments"), { recursive: true });
		writeFileSync(
			join(home, "assignments", "asg-unversioned.json"),
			JSON.stringify({
				id: "asg-unversioned",
				nodeId: "w9",
				task: "no schema_version",
				states: [],
				opened: { actor: "tester", ts: TS },
			}),
		);
		expect(new FsAssignmentStore(home).read("asg-unversioned")).toBeNull();
	});

	it("list returns only valid records, sorted by id", () => {
		const store = new FsAssignmentStore(home);
		expect(store.list()).toEqual([]); // fresh home: empty, never a throw
		const b = asg({ id: "asg-b", nodeId: "w2" });
		const a = asg({ id: "asg-a", nodeId: "w1" });
		const c = asg({ id: "asg-c", nodeId: "w1" });
		for (const record of [b, a, c]) expect(store.write(record)).toEqual(ok(undefined));
		// Planted invalid entries are skipped silently, wherever they sort.
		writeFileSync(join(home, "assignments", "aa-corrupt.json"), "{ not json");
		writeFileSync(
			join(home, "assignments", "zz-foreign.json"),
			JSON.stringify({
				schema_version: 1,
				slug: "zz",
				description: "project bytes in the assignments dir",
				created: { actor: "tester", ts: TS },
			}),
		);
		expect(store.list()).toEqual([a, b, c]);
	});

	it("listByNode matches nodeId exactly — 'w1' never matches 'w10'", () => {
		const store = new FsAssignmentStore(home);
		const a = asg({ id: "asg-a", nodeId: "w1" });
		const b = asg({ id: "asg-b", nodeId: "w10" });
		const c = asg({ id: "asg-c", nodeId: "w1" });
		const d = asg({ id: "asg-d", nodeId: "w2" });
		for (const record of [a, b, c, d]) expect(store.write(record)).toEqual(ok(undefined));
		expect(store.listByNode("w1")).toEqual([a, c]);
		expect(store.listByNode("w10")).toEqual([b]);
		expect(store.listByNode("w3")).toEqual([]);
	});

	it("general assignment id round-trips as the filename", () => {
		const store = new FsAssignmentStore(home);
		const id = generalAssignmentId("w7");
		expect(id).toBe("asg-general-w7");
		const general = asg({ id, nodeId: "w7" });
		expect(store.write(general)).toEqual(ok(undefined));
		expect(existsSync(join(home, "assignments", "asg-general-w7.json"))).toBe(true);
		expect(store.read(id)).toEqual(general);
	});

	it("writes stay below assignments/ — no top-level pijHome files", () => {
		const store = new FsAssignmentStore(home);
		expect(store.write(asg({ id: "asg-a", nodeId: "w1" }))).toEqual(ok(undefined));
		expect(
			store.write(
				asg({
					id: "asg-b",
					nodeId: "w1",
					closed: { actor: "closer", ts: TS_CLOSE, reason: "cancelled" },
				}),
			),
		).toEqual(ok(undefined));
		expect(readdirSync(home)).toEqual(["assignments"]);
		// And inside assignments/: exactly the two records, no staged temps.
		expect(readdirSync(join(home, "assignments")).sort()).toEqual(["asg-a.json", "asg-b.json"]);
	});

	it("phantom-peer regression: FsRegistry.list() over the same home sees no assignments", () => {
		const store = new FsAssignmentStore(home);
		expect(store.write(asg({ id: "asg-a", nodeId: "w1" }))).toEqual(ok(undefined));
		expect(store.write(asg({ id: "asg-general-w1", nodeId: "w1" }))).toEqual(ok(undefined));
		expect(new FsRegistry(home).list()).toEqual([]);
	});
});
