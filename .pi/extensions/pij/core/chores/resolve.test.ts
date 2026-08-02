import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { choreKey, resolveChoreReference, resolveChores, stateKey } from "./resolve.js";
import { assertTempPijHome } from "./test-home.js";
import type { Chore, ChoreScopeSource } from "./types.js";

let pijHome: string;
let previousPijHome: string | undefined;

beforeEach(() => {
	previousPijHome = process.env.PIJ_HOME;
	pijHome = mkdtempSync(join(tmpdir(), "pij-chore-resolve-"));
	process.env.PIJ_HOME = pijHome;
	assertTempPijHome();
});

afterEach(() => {
	if (previousPijHome === undefined) {
		delete process.env.PIJ_HOME;
	} else {
		process.env.PIJ_HOME = previousPijHome;
	}
	rmSync(pijHome, { recursive: true, force: true });
});

function chore(scope: Chore["scope"], name: string): Chore {
	return {
		scope,
		name,
		probe: `printf '${scope}-${name}'`,
		timeoutMs: 30_000,
	};
}

function source(scope: Chore["scope"], chores: Chore[]): ChoreScopeSource {
	return { scope, status: "ok", chores };
}

describe("chore scope resolver", () => {
	it("unions all three scopes instead of shadowing duplicate names", () => {
		const resolved = resolveChores([
			source("seat", [chore("seat", "shared"), chore("seat", "seat-only")]),
			source("repo", [chore("repo", "shared"), chore("repo", "repo-only")]),
			source("fleet", [chore("fleet", "shared"), chore("fleet", "fleet-only")]),
		]);

		expect(resolved.issues).toEqual([]);
		expect(resolved.chores.map(choreKey)).toEqual([
			"seat:seat-only",
			"seat:shared",
			"repo:repo-only",
			"repo:shared",
			"fleet:fleet-only",
			"fleet:shared",
		]);
		expect(resolved.chores.filter((entry) => entry.name === "shared")).toHaveLength(3);
	});

	it("retains malformed-scope diagnostics while other scopes remain usable", () => {
		const resolved = resolveChores([
			{ scope: "seat", status: "malformed", chores: [] },
			source("repo", [chore("repo", "healthy")]),
			{ scope: "fleet", status: "missing", chores: [] },
		]);

		expect(resolved.chores.map(choreKey)).toEqual(["repo:healthy"]);
		expect(resolved.issues).toEqual([
			{ scope: "seat", name: "<roster>", reason: "malformed roster" },
		]);
	});

	it("requires scope qualification only when a bare name is ambiguous", () => {
		const chores = [chore("seat", "shared"), chore("repo", "shared"), chore("fleet", "unique")];

		expect(resolveChoreReference("unique", chores)).toEqual({
			ok: true,
			chore: chores[2],
		});
		expect(resolveChoreReference("repo:shared", chores)).toEqual({
			ok: true,
			chore: chores[1],
		});
		expect(resolveChoreReference("shared", chores)).toEqual({
			ok: false,
			code: "E-AMBIG",
			message: "chore 'shared' is ambiguous: repo:shared, seat:shared",
		});
	});

	it("keys repo state by worktree while seat and fleet keep their scope key", () => {
		expect(stateKey(chore("seat", "x"), "/repo/worktree")).toBe("seat:x");
		expect(stateKey(chore("fleet", "x"), "/repo/worktree")).toBe("fleet:x");
		expect(stateKey(chore("repo", "x"), "/repo/worktree")).toBe("repo:x@/repo/worktree");
	});
});
