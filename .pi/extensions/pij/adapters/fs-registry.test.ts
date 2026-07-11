import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reattachIdentity, resolveStableIdentity } from "../core/binding.js";
import { deriveHarnessPijId } from "../core/discovery.js";
import type { SessionDescriptor } from "../core/types.js";
import { FsRegistry } from "./fs-registry.js";

function descriptor(id: string): SessionDescriptor {
	return {
		id,
		role: "worker",
		folder: "/proj",
		dataDir: `/home/.pij/${id}`,
		eventsPath: `/home/.pij/${id}/events.ndjson`,
		pid: 4242,
		startedAt: "2026-06-16T00:00:00.000Z",
	};
}

describe("FsRegistry", () => {
	let home: string;
	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-reg-"));
	});
	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("write → read/list returns the descriptor", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("alice"));
		expect(reg.read("alice")?.id).toBe("alice");
		expect(reg.list().map((d) => d.id)).toEqual(["alice"]);
	});

	it("claim creates once and returns the existing descriptor to concurrent claimers", () => {
		const first = new FsRegistry(home).claim(descriptor("stable"));
		expect(first).toMatchObject({ ok: true, value: { kind: "claimed" } });

		const competing = { ...descriptor("stable"), pid: 9999 };
		const second = new FsRegistry(home).claim(competing);
		expect(second).toMatchObject({
			ok: true,
			value: { kind: "exists", descriptor: { id: "stable", pid: 4242 } },
		});
		expect(new FsRegistry(home).list().map((d) => d.id)).toEqual(["stable"]);
	});

	it("fresh registry instances re-attach an external native session to the same pij id", () => {
		const original: SessionDescriptor = {
			...descriptor("pij-original"),
			harness: "claude",
			harnessSessionId: "native-session",
			paneId: "%1",
			pid: 10,
			lifecycle: "bound",
			lastEventAt: "2026-07-10T00:00:00.000Z",
		};
		new FsRegistry(home).write(original);

		// Simulate a full restart: discard every object, then reconstruct from disk.
		const afterRestart = new FsRegistry(home);
		const resolved = resolveStableIdentity(
			afterRestart.list(),
			"claude",
			"native-session",
			deriveHarnessPijId("claude", "native-session"),
		);
		expect(resolved).toMatchObject({
			ok: true,
			value: { kind: "reuse", descriptor: { id: "pij-original" } },
		});
		if (!resolved.ok || resolved.value.kind !== "reuse") throw new Error("expected reuse");
		afterRestart.write(
			reattachIdentity(resolved.value.descriptor, {
				harness: "claude",
				harnessSessionId: "native-session",
				folder: "/repo-after-restart",
				pid: 99,
				paneId: "%9",
			}),
		);

		const verified = new FsRegistry(home).read("pij-original");
		expect(verified).toMatchObject({
			id: "pij-original",
			dataDir: "/home/.pij/pij-original",
			eventsPath: "/home/.pij/pij-original/events.ndjson",
			lastEventAt: "2026-07-10T00:00:00.000Z",
			folder: "/repo-after-restart",
			pid: 99,
			paneId: "%9",
			lifecycle: "bound",
		});
		expect(new FsRegistry(home).list()).toHaveLength(1);
	});

	it("a first bound-descriptor write automatically claims durable identity", () => {
		new FsRegistry(home).write({
			...descriptor("spawned-claude"),
			harness: "claude",
			harnessSessionId: "spawn-native",
			lifecycle: "bound",
		});
		new FsRegistry(home).remove("spawned-claude");
		expect(new FsRegistry(home).resolveIdentity("claude", "spawn-native")).toEqual({
			ok: true,
			value: "spawned-claude",
		});
	});

	it("a conflicting first bound write fails before replacing the live descriptor", () => {
		const registry = new FsRegistry(home);
		registry.write({
			...descriptor("shared"),
			harness: "claude",
			harnessSessionId: "native-a",
			lifecycle: "bound",
		});
		expect(() =>
			registry.write({
				...descriptor("shared"),
				harness: "claude",
				harnessSessionId: "native-b",
				lifecycle: "bound",
			}),
		).toThrow(/already owned|identity/i);
		expect(registry.read("shared")?.harnessSessionId).toBe("native-a");
	});

	it("rolls back provisional identity when a live descriptor claim is incompatible", () => {
		const registry = new FsRegistry(home);
		registry.write({
			...descriptor("pending-peer"),
			harness: "claude",
			lifecycle: "pending",
		});
		const failed = registry.claim({
			...descriptor("pending-peer"),
			harness: "claude",
			harnessSessionId: "wrong-native",
			lifecycle: "bound",
		});
		expect(failed).toMatchObject({ ok: false, code: "E-AMBIG" });
		expect(registry.resolveIdentity("claude", "wrong-native")).toEqual({
			ok: true,
			value: undefined,
		});
		// The pending peer can still bind to its real native identity.
		expect(() =>
			registry.write({
				...descriptor("pending-peer"),
				harness: "claude",
				harnessSessionId: "real-native",
				lifecycle: "bound",
			}),
		).not.toThrow();
	});

	it("durable native-identity bindings survive descriptor removal and adapter restart", () => {
		const first = new FsRegistry(home).claimIdentity("pi", "pi-native", "pij-original");
		expect(first).toEqual({
			ok: true,
			value: { kind: "claimed", id: "pij-original" },
		});
		new FsRegistry(home).write({
			...descriptor("pij-original"),
			role: "parent",
			harness: "pi",
			harnessSessionId: "pi-native",
			spawnedBy: "pij-creator",
			boundModel: "model-before-restart",
		});
		new FsRegistry(home).remove("pij-original");

		expect(new FsRegistry(home).resolveIdentity("pi", "pi-native")).toEqual({
			ok: true,
			value: "pij-original",
		});
		expect(new FsRegistry(home).resolveIdentitySnapshot("pi", "pi-native")).toMatchObject({
			ok: true,
			value: {
				id: "pij-original",
				role: "parent",
				spawnedBy: "pij-creator",
				boundModel: "model-before-restart",
			},
		});
	});

	it("a second id cannot claim an already-owned native tuple", () => {
		new FsRegistry(home).claimIdentity("claude", "native", "pij-first");
		expect(new FsRegistry(home).claimIdentity("claude", "native", "pij-second")).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("distinct native tuples cannot claim the same pij id", () => {
		new FsRegistry(home).claimIdentity("claude", "native-a", "pij-shared");
		expect(new FsRegistry(home).claimIdentity("claude", "native-b", "pij-shared")).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("rejects a concrete collision from the legacy 32-bit candidate derivation", () => {
		const nativeA = "1bhrg2q-45e";
		const nativeB = "1f04tud-e0v";
		const candidate = deriveHarnessPijId("claude", nativeA);
		expect(deriveHarnessPijId("claude", nativeB)).toBe(candidate);
		new FsRegistry(home).claimIdentity("claude", nativeA, candidate);
		expect(new FsRegistry(home).claimIdentity("claude", nativeB, candidate)).toMatchObject({
			ok: false,
			code: "E-AMBIG",
		});
	});

	it("repeating the same tuple and pij id is idempotent", () => {
		new FsRegistry(home).claimIdentity("claude", "native", "pij-first");
		expect(new FsRegistry(home).claimIdentity("claude", "native", "pij-first")).toEqual({
			ok: true,
			value: { kind: "exists", id: "pij-first" },
		});
	});

	it("remove deletes the descriptor (idempotent)", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("bob"));
		reg.remove("bob");
		expect(reg.read("bob")).toBeNull();
		expect(() => reg.remove("bob")).not.toThrow();
	});

	it("read of an absent id is null; list of an empty home is []", () => {
		const reg = new FsRegistry(join(home, "nope"));
		expect(reg.read("ghost")).toBeNull();
		expect(reg.list()).toEqual([]);
	});

	it("skips a malformed descriptor file instead of throwing", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("good"));
		writeFileSync(join(home, "bad.json"), "{ not json");
		expect(reg.list().map((d) => d.id)).toEqual(["good"]);
	});

	it("ignores per-session <id>/ subdirectories", () => {
		const reg = new FsRegistry(home);
		reg.write(descriptor("alice"));
		mkdirSync(join(home, "alice"), { recursive: true }); // the data dir
		expect(reg.list().map((d) => d.id)).toEqual(["alice"]);
	});

	it("a fresh adapter over the same home reads prior writes", () => {
		new FsRegistry(home).write(descriptor("carol"));
		expect(new FsRegistry(home).read("carol")?.id).toBe("carol");
	});

	// ─── Plan 019: new control-plane fields round-trip; old files still parse ──

	it("round-trips the control-plane fields (harness/harnessSessionId/initInjectedAt/lifecycle)", () => {
		const reg = new FsRegistry(home);
		const d: SessionDescriptor = {
			...descriptor("dave"),
			harness: "claude",
			harnessSessionId: "8f3a-uuid",
			initInjectedAt: "2026-06-27T00:00:01.000Z",
			lifecycle: "bound",
		};
		reg.write(d);
		expect(reg.read("dave")).toMatchObject({
			harness: "claude",
			harnessSessionId: "8f3a-uuid",
			initInjectedAt: "2026-06-27T00:00:01.000Z",
			lifecycle: "bound",
		});
	});

	it("an OLD descriptor without the new fields still parses (migration-safe)", () => {
		const reg = new FsRegistry(home);
		// A pre-Plan-019 descriptor literally has none of the new keys.
		writeFileSync(
			join(home, "legacy.json"),
			JSON.stringify({
				id: "legacy",
				folder: "/proj",
				dataDir: "/home/.pij/legacy",
				eventsPath: "/home/.pij/legacy/events.ndjson",
				pid: 7,
				startedAt: "2026-06-16T00:00:00.000Z",
			}),
		);
		const read = reg.read("legacy");
		expect(read?.id).toBe("legacy");
		expect(read?.harness).toBeUndefined();
		expect(read?.lifecycle).toBeUndefined();
	});
});
