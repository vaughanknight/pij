import { describe, expect, it } from "vitest";
import { FakeRegistry } from "../../adapters/fakes.js";
import type { DescriptorWriter } from "../registry-write.js";
import type { SessionDescriptor } from "../types.js";
import { PrimeService } from "./prime.js";

function descriptor(id: string, over: Partial<SessionDescriptor> = {}): SessionDescriptor {
	return {
		id,
		folder: "/repo",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-07-11T00:00:00.000Z",
		state: "working",
		...over,
	};
}

class CountingRegistry extends FakeRegistry {
	writes = 0;

	// Forwards `writer` — a double that drops it silently disarms the write law
	// for everything under test (plan 071 review §1.2).
	override write(value: SessionDescriptor, writer?: DescriptorWriter): void {
		this.writes += 1;
		super.write(value, writer);
	}
}

describe("PrimeService", () => {
	it("sets current prime, clears old-prime, and preserves unrelated descriptor fields", () => {
		const registry = new CountingRegistry([
			descriptor("pij-a", {
				prime: false,
				oldPrime: true,
				parentId: null,
				gitCommonDir: "/repo/.git",
				spawnedBy: "pij-owner",
			}),
		]);
		const result = new PrimeService(registry).set("pij-a");
		expect(result).toEqual({
			ok: true,
			value: { id: "pij-a", prime: true, oldPrime: false, changed: true },
		});
		expect(registry.read("pij-a")).toMatchObject({
			id: "pij-a",
			prime: true,
			oldPrime: false,
			state: "working",
			folder: "/repo",
			parentId: null,
			gitCommonDir: "/repo/.git",
			spawnedBy: "pij-owner",
		});
		expect(registry.writes).toBe(1);
	});

	it("retires current prime into old-prime", () => {
		const registry = new CountingRegistry([descriptor("pij-a", { prime: true, oldPrime: false })]);
		const result = new PrimeService(registry).retire("pij-a");
		expect(result).toEqual({
			ok: true,
			value: { id: "pij-a", prime: false, oldPrime: true, changed: true },
		});
		expect(registry.read("pij-a")).toMatchObject({
			id: "pij-a",
			prime: false,
			oldPrime: true,
			state: "working",
		});
		expect(registry.writes).toBe(1);
	});

	it("unsets both current and old-prime markers", () => {
		const registry = new CountingRegistry([descriptor("pij-a", { prime: true, oldPrime: true })]);
		const result = new PrimeService(registry).unset("pij-a");
		expect(result).toEqual({
			ok: true,
			value: { id: "pij-a", prime: false, oldPrime: false, changed: true },
		});
		expect(registry.read("pij-a")).toMatchObject({
			id: "pij-a",
			prime: false,
			oldPrime: false,
			state: "working",
		});
	});

	it.each([
		["set", true, false],
		["retire", false, true],
		["unset", false, false],
	] as const)("%s is idempotent when both markers already match", (verb, prime, oldPrime) => {
		const registry = new CountingRegistry([descriptor("pij-a", { prime, oldPrime })]);
		const result = new PrimeService(registry)[verb]("pij-a");
		expect(result).toEqual({
			ok: true,
			value: { id: "pij-a", prime, oldPrime, changed: false },
		});
		expect(registry.writes).toBe(0);
	});

	it("allows multiple current primes without clearing another session", () => {
		const registry = new CountingRegistry([
			descriptor("pij-a", { prime: true }),
			descriptor("pij-b", { oldPrime: true }),
		]);
		const result = new PrimeService(registry).set("pij-b");
		expect(result).toMatchObject({ ok: true, value: { changed: true } });
		expect(registry.read("pij-a")?.prime).toBe(true);
		expect(registry.read("pij-b")).toMatchObject({ prime: true, oldPrime: false });
	});

	it.each([
		"set",
		"retire",
		"unset",
	] as const)("%s returns E-NOID and performs no write for an unknown target", (verb) => {
		const registry = new CountingRegistry();
		const result = new PrimeService(registry)[verb]("missing");
		expect(result).toMatchObject({ ok: false, code: "E-NOID" });
		expect(registry.writes).toBe(0);
	});
});
