import { describe, expect, it } from "vitest";
import { canonicalFenceJson } from "./fence.js";
import { type Fence, isFence } from "./types.js";

const TS = "2026-07-20T10:00:00.000Z";

const BASE: Fence = {
	schema_version: 1,
	id: "fence-alloc-s061-team-scaffold",
	allocation: "alloc-s061-team-scaffold",
	touchSet: [".pi/extensions/pij/core/platform/**", ".pi/extensions/pij/core/stream.ts"],
	shared: [".pi/extensions/pij/core/cli.ts"],
	class: "notify-only",
	updated: { actor: "pij-shy-justine", ts: TS },
};

describe("Fence record — AC-03/AC-08", () => {
	it("round-trips through isFence and rejects enforcing/invalid shapes", () => {
		expect(isFence(BASE)).toBe(true);
		expect(isFence({ ...BASE, class: "exclusive" })).toBe(false);
		expect(isFence({ ...BASE, touchSet: [".pi/**", 42] })).toBe(false);
		expect(isFence({ ...BASE, shared: "cli.ts" })).toBe(false);
	});

	it("serializes the contract field order as compact canonical JSON", () => {
		expect(canonicalFenceJson(BASE)).toBe(
			`{"schema_version":1,"id":"fence-alloc-s061-team-scaffold",` +
				`"allocation":"alloc-s061-team-scaffold",` +
				`"touchSet":[".pi/extensions/pij/core/platform/**",".pi/extensions/pij/core/stream.ts"],` +
				`"shared":[".pi/extensions/pij/core/cli.ts"],"class":"notify-only",` +
				`"updated":{"actor":"pij-shy-justine","ts":"${TS}"}}`,
		);
	});

	it("canonicalizes the same bytes regardless of disk key order", () => {
		const scrambled = JSON.parse(
			`{"updated":{"ts":"${TS}","actor":"pij-shy-justine"},"class":"notify-only",` +
				`"shared":[".pi/extensions/pij/core/cli.ts"],` +
				`"touchSet":[".pi/extensions/pij/core/platform/**",".pi/extensions/pij/core/stream.ts"],` +
				`"allocation":"alloc-s061-team-scaffold","id":"fence-alloc-s061-team-scaffold",` +
				`"schema_version":1}`,
		) as Fence;
		expect(canonicalFenceJson(scrambled)).toBe(canonicalFenceJson(BASE));
	});
});
