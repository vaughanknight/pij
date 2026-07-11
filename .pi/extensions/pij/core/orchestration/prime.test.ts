import { describe, expect, it } from "vitest";
import { FakeRegistry } from "../../adapters/fakes.js";
import type { SessionDescriptor } from "../types.js";
import { PrimeService } from "./prime.js";

function descriptor(id: string, prime?: boolean): SessionDescriptor {
	return {
		id,
		folder: "/repo",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 100,
		startedAt: "2026-07-11T00:00:00.000Z",
		state: "working",
		...(prime === undefined ? {} : { prime }),
	};
}

class CountingRegistry extends FakeRegistry {
	writes = 0;

	override write(value: SessionDescriptor): void {
		this.writes += 1;
		super.write(value);
	}
}

describe("PrimeService", () => {
	it("sets a session prime while preserving unrelated descriptor fields", () => {
		const registry = new CountingRegistry([descriptor("pij-a")]);
		const result = new PrimeService(registry).set("pij-a");
		expect(result).toEqual({
			ok: true,
			value: { id: "pij-a", prime: true, changed: true },
		});
		expect(registry.read("pij-a")).toMatchObject({
			id: "pij-a",
			prime: true,
			state: "working",
			folder: "/repo",
		});
		expect(registry.writes).toBe(1);
	});

	it("unsets with an explicit false marker and preserves the descriptor", () => {
		const registry = new CountingRegistry([descriptor("pij-a", true)]);
		const result = new PrimeService(registry).unset("pij-a");
		expect(result).toEqual({
			ok: true,
			value: { id: "pij-a", prime: false, changed: true },
		});
		expect(registry.read("pij-a")).toMatchObject({
			id: "pij-a",
			prime: false,
			state: "working",
		});
	});

	it.each([
		["set", true],
		["unset", false],
	] as const)("%s is idempotent when the value already matches", (verb, prime) => {
		const registry = new CountingRegistry([descriptor("pij-a", prime)]);
		const result = new PrimeService(registry)[verb]("pij-a");
		expect(result).toEqual({
			ok: true,
			value: { id: "pij-a", prime, changed: false },
		});
		expect(registry.writes).toBe(0);
	});

	it("returns E-NOID and performs no write for an unknown target", () => {
		const registry = new CountingRegistry();
		const result = new PrimeService(registry).set("missing");
		expect(result).toMatchObject({ ok: false, code: "E-NOID" });
		expect(registry.writes).toBe(0);
	});
});
