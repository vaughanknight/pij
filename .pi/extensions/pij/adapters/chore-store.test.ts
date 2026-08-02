import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertTempPijHome } from "../core/chores/test-home.js";
import type { ChoreRoster, ChoreState } from "../core/chores/types.js";
import { FsChoreStore } from "./chore-store.js";

let root: string;
let pijHome: string;
let repoRoot: string;
let previousPijHome: string | undefined;

beforeEach(() => {
	previousPijHome = process.env.PIJ_HOME;
	root = mkdtempSync(join(tmpdir(), "pij-chore-store-"));
	pijHome = join(root, "home");
	repoRoot = join(root, "repo");
	process.env.PIJ_HOME = pijHome;
	assertTempPijHome();
});

afterEach(() => {
	if (previousPijHome === undefined) {
		delete process.env.PIJ_HOME;
	} else {
		process.env.PIJ_HOME = previousPijHome;
	}
	rmSync(root, { recursive: true, force: true });
});

function roster(scope: "seat" | "repo" | "fleet"): ChoreRoster {
	return {
		version: 1,
		chores: [
			{
				scope,
				name: `${scope}-probe`,
				probe: "printf ok",
				timeoutMs: 30_000,
			},
		],
		removals: [],
	};
}

describe("FsChoreStore", () => {
	it("resolves the fleet roster under a subdirectory, never ~/.pij/*.json", () => {
		const store = new FsChoreStore({ pijHome, seatId: "seat-a", repoRoot });

		expect(store.rosterPath("fleet")).toBe(join(pijHome, "pij-chores", "chores.json"));
		expect(store.rosterPath("fleet")).not.toBe(join(pijHome, "chores.json"));
	});

	it("resolves seat, repo, and per-seat state paths exactly", () => {
		const store = new FsChoreStore({ pijHome, seatId: "seat-a", repoRoot });

		expect(store.rosterPath("seat")).toBe(join(pijHome, "seat-a", "chores.json"));
		expect(store.rosterPath("repo")).toBe(join(repoRoot, ".pij", "chores.json"));
		expect(store.statePath()).toBe(join(pijHome, "seat-a", "chore-state.json"));
	});

	it("atomically round-trips a validated roster without leftover temp files", () => {
		const store = new FsChoreStore({ pijHome, seatId: "seat-a", repoRoot });
		store.writeRoster("fleet", roster("fleet"));

		expect(store.readRoster("fleet")).toEqual(roster("fleet"));
		expect(store.rosterStatus("fleet")).toBe("ok");
		const names = readdirSync(join(pijHome, "pij-chores"));
		expect(names).toEqual(["chores.json"]);
		expect(readFileSync(store.rosterPath("fleet"), "utf8")).toBe(JSON.stringify(roster("fleet")));
	});

	it("degrades malformed roster JSON to undefined while identifying the scope as malformed", () => {
		const store = new FsChoreStore({ pijHome, seatId: "seat-a", repoRoot });
		store.writeRoster("repo", roster("repo"));
		writeFileSync(store.rosterPath("repo"), JSON.stringify({ version: 1, chores: "not-an-array" }));

		expect(store.readRoster("repo")).toBeUndefined();
		expect(store.rosterStatus("repo")).toBe("malformed");
		expect(store.readRoster("fleet")).toBeUndefined();
		expect(store.rosterStatus("fleet")).toBe("missing");
	});

	it("round-trips baselines and pending deltas only in the current seat state file", () => {
		const store = new FsChoreStore({ pijHome, seatId: "seat-a", repoRoot });
		const state: ChoreState = {
			version: 1,
			entries: {
				"repo:shared@/repo/worktree": {
					baseline: "aaaaaaaaaaaa",
					pending: { old: "aaaaaaaaaaaa", new: "bbbbbbbbbbbb" },
					runsSinceFull: 2,
				},
			},
		};

		store.writeState(state);

		expect(store.readState()).toEqual(state);
		expect(existsSync(join(pijHome, "seat-b", "chore-state.json"))).toBe(false);
	});
});
