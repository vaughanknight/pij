// pij platform — FsProjectStore adapter specs (plan 054, T005 — RED first).
//
// Pins the coder-seat contract before the adapter exists: layout
// <pijHome>/projects/<slug>/project.json; first-writer-wins create
// (publishNoReplace semantics — second create reports "exists" and the
// original bytes survive); atomic update (writeJsonAtomic semantics,
// E-NOREG on missing); guard-validated reads (focus-store pattern: null on
// missing/corrupt/foreign/unversioned); slug-sorted list that skips invalid
// entries; and the phantom-peer law: nothing lands at the pijHome top level,
// so FsRegistry.list() never mistakes a project for a live peer.

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
import type { Assignment, Project } from "../core/platform/types.js";
import { ok } from "../core/types.js";
import { FsRegistry } from "./fs-registry.js";
import { FsProjectStore } from "./project-store.js";

const TS = "2026-07-16T00:00:00.000Z";

function project(slug: string, over: Partial<Project> = {}): Project {
	return {
		schema_version: 1,
		slug,
		description: `project ${slug}`,
		created: { actor: "prime-1", ts: TS },
		...over,
	};
}

/** A valid Assignment — a FOREIGN record when planted inside project.json. */
function foreignAssignment(id: string): Assignment {
	return {
		schema_version: 1,
		id,
		nodeId: "node-1",
		task: "hold general work",
		states: [],
		opened: { actor: "prime-1", ts: TS },
	};
}

function projectFile(home: string, slug: string): string {
	return join(home, "projects", slug, "project.json");
}

/** Hand-plant raw bytes at the exact layout path (corrupt/foreign fixtures). */
function plantRaw(home: string, slug: string, contents: string): void {
	mkdirSync(join(home, "projects", slug), { recursive: true });
	writeFileSync(projectFile(home, slug), contents);
}

describe("FsProjectStore", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-plat-"));
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("create claims projects/<slug>/project.json and read round-trips", () => {
		const store = new FsProjectStore(home);
		const alpha = project("alpha", { repo: "git@example:alpha.git" });
		expect(store.create(alpha)).toEqual(ok("claimed"));
		const path = projectFile(home, "alpha");
		expect(existsSync(path)).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(alpha);
		expect(store.read("alpha")).toEqual(alpha);
	});

	it("second create for the same slug is 'exists' and preserves the original bytes", () => {
		const store = new FsProjectStore(home);
		expect(store.create(project("alpha"))).toEqual(ok("claimed"));
		const originalBytes = readFileSync(projectFile(home, "alpha"), "utf8");
		expect(store.create(project("alpha", { description: "usurper" }))).toEqual(ok("exists"));
		expect(readFileSync(projectFile(home, "alpha"), "utf8")).toBe(originalBytes);
		expect(store.read("alpha")?.description).toBe("project alpha");
	});

	it("update atomically replaces an existing record", () => {
		const store = new FsProjectStore(home);
		store.create(project("alpha"));
		const updated = project("alpha", {
			description: "rewritten",
			planPath: "docs/plans/054-pij-grown-up/plan.md",
		});
		expect(store.update(updated)).toEqual(ok(undefined));
		expect(store.read("alpha")).toEqual(updated);
		expect(JSON.parse(readFileSync(projectFile(home, "alpha"), "utf8"))).toEqual(updated);
	});

	it("update on a missing slug is E-NOREG and creates nothing", () => {
		const store = new FsProjectStore(home);
		expect(store.update(project("ghost"))).toMatchObject({ ok: false, code: "E-NOREG" });
		expect(existsSync(projectFile(home, "ghost"))).toBe(false);
	});

	it("read is null on missing, corrupt, foreign, and unversioned records", () => {
		const store = new FsProjectStore(home);
		expect(store.read("missing")).toBeNull();

		plantRaw(home, "corrupt", "{ not json");
		expect(store.read("corrupt")).toBeNull();

		plantRaw(home, "foreign", JSON.stringify(foreignAssignment("asg-general-node-1")));
		expect(store.read("foreign")).toBeNull();

		// Unversioned: right shape but `version` instead of `schema_version` (WS-4).
		plantRaw(
			home,
			"legacy",
			JSON.stringify({
				version: 1,
				slug: "legacy",
				description: "pre-platform record",
				created: { actor: "prime-1", ts: TS },
			}),
		);
		expect(store.read("legacy")).toBeNull();
	});

	it("list skips corrupt and foreign entries and sorts by slug", () => {
		const store = new FsProjectStore(home);
		const zeta = project("zeta");
		const alpha = project("alpha");
		const mid = project("mid");
		store.create(zeta);
		store.create(alpha);
		store.create(mid);
		plantRaw(home, "corrupt", "{ not json");
		plantRaw(home, "foreign", JSON.stringify(foreignAssignment("asg-general-node-2")));
		expect(store.list()).toEqual([alpha, mid, zeta]);
	});

	it("list is empty on a fresh home", () => {
		expect(new FsProjectStore(home).list()).toEqual([]);
	});

	it("leaves no temp or partial files beside project.json after create + update + duplicate create", () => {
		const store = new FsProjectStore(home);
		store.create(project("alpha"));
		store.update(project("alpha", { description: "second write" }));
		// 'exists' path: publishNoReplace stages its claim temp INSIDE
		// projects/alpha/, so the EEXIST branch must clean it up there too.
		expect(store.create(project("alpha", { description: "usurper" }))).toEqual(ok("exists"));
		expect(readdirSync(join(home, "projects", "alpha"))).toEqual(["project.json"]);
	});

	it("writes nothing at the pijHome top level except projects/", () => {
		const store = new FsProjectStore(home);
		store.create(project("alpha"));
		store.update(project("alpha", { description: "second write" }));
		store.create(project("alpha")); // 'exists' path must not stage top-level temps either
		expect(readdirSync(home)).toEqual(["projects"]);
	});

	it("phantom-peer regression: created projects never surface in FsRegistry.list()", () => {
		const store = new FsProjectStore(home);
		store.create(project("alpha"));
		store.create(project("zeta"));
		expect(new FsRegistry(home).list()).toEqual([]);
	});
});
