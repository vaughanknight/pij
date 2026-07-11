import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BatonDefinition, BatonLease, BatonLogEntry } from "../core/orchestration/baton.js";
import { FsBatonStore } from "./baton-store.js";

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "pij-baton-store-"));
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

function definition(resource = "shared git index"): BatonDefinition {
	return {
		name: "git-index",
		resource,
		repo: "/repo",
		createdBy: "pij-prime",
		createdAt: "2026-07-11T09:00:00.000Z",
		queue: [],
	};
}

function lease(id: string, holder: string): BatonLease {
	return {
		leaseId: id,
		holder,
		purpose: `work by ${holder}`,
		grantedBy: "pij-prime",
		requestedAt: "2026-07-11T09:00:00.000Z",
		grantedAt: "2026-07-11T09:01:00.000Z",
	};
}

describe("FsBatonStore", () => {
	it("publishes exactly one lease when two writers claim the same baton", () => {
		const first = new FsBatonStore(home);
		const second = new FsBatonStore(home);

		const outcomes = [
			first.claimLease("git-index", lease("lease-a", "pij-a")),
			second.claimLease("git-index", lease("lease-b", "pij-b")),
		];

		expect(outcomes.filter((result) => result.ok && result.value === "claimed")).toHaveLength(1);
		expect(outcomes.filter((result) => result.ok && result.value === "held")).toHaveLength(1);
		const persisted = first.readLease("git-index");
		expect(persisted.ok).toBe(true);
		if (!persisted.ok) return;
		expect(["lease-a", "lease-b"]).toContain(persisted.value?.leaseId);
		expect(
			readdirSync(join(home, "orchestration", "batons")).some((name) => name.includes(".claim-")),
		).toBe(false);
	});

	it("writes definitions through a tmp+rename swap", () => {
		const store = new FsBatonStore(home);
		expect(store.writeDefinition(definition()).ok).toBe(true);
		expect(store.writeDefinition(definition("updated resource")).ok).toBe(true);

		const read = store.readDefinition("git-index");
		expect(read.ok).toBe(true);
		if (!read.ok) return;
		expect(read.value?.resource).toBe("updated resource");
		expect(readdirSync(join(home, "orchestration", "batons"))).toEqual(["git-index.json"]);
	});

	it("appends one NDJSON machine line per action", () => {
		const store = new FsBatonStore(home);
		const first: BatonLogEntry = {
			timestamp: "2026-07-11T09:00:00.000Z",
			baton: "git-index",
			actor: "pij-a",
			verb: "request",
			requestId: "request-a",
			purpose: "land changes",
		};
		const second: BatonLogEntry = {
			timestamp: "2026-07-11T09:01:00.000Z",
			baton: "git-index",
			actor: "pij-prime",
			verb: "grant",
			leaseId: "lease-a",
			blockedTimeMs: 60_000,
		};

		expect(store.appendLog(first).ok).toBe(true);
		expect(store.appendLog(second).ok).toBe(true);
		const lines = readFileSync(join(home, "orchestration", "log.ndjson"), "utf8")
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as BatonLogEntry);
		expect(lines).toEqual([first, second]);
	});

	it("tolerates corrupt definition and lease files without throwing", () => {
		const store = new FsBatonStore(home);
		expect(store.writeDefinition(definition()).ok).toBe(true);
		writeFileSync(store.definitionPath("git-index"), "{broken");
		writeFileSync(store.leasePath("git-index"), "{broken");

		expect(store.readDefinition("git-index")).toEqual({ ok: true, value: null });
		expect(store.readLease("git-index")).toEqual({ ok: true, value: null });
		expect(store.listDefinitions()).toEqual({ ok: true, value: [] });
	});

	it("releases only the lease id the caller observed", () => {
		const store = new FsBatonStore(home);
		expect(store.claimLease("git-index", lease("lease-a", "pij-a"))).toMatchObject({
			ok: true,
			value: "claimed",
		});
		expect(store.releaseLease("git-index", "lease-b")).toEqual({
			ok: true,
			value: "mismatch",
		});
		expect(store.releaseLease("git-index", "lease-a")).toEqual({
			ok: true,
			value: "released",
		});
		expect(store.readLease("git-index")).toEqual({ ok: true, value: null });
	});
});
