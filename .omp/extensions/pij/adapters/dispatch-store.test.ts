import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Dispatch } from "../core/platform/types.js";
import { ok } from "../core/types.js";
import { FsDispatchStore } from "./dispatch-store.js";
import { FsRegistry } from "./fs-registry.js";

const TS = "2026-07-20T12:00:00.000Z";

function dispatch(id: string, state: Dispatch["state"] = "undelivered"): Dispatch {
	const base: Dispatch = {
		schema_version: 1,
		id,
		packetPath: `/repo/${id}.md`,
		packetSha256: "a".repeat(64),
		from: "pij-parent",
		to: "pij-worker",
		state: "undelivered",
		created: { actor: "pij-parent", ts: TS },
		updated: { actor: "pij-parent", ts: TS },
	};
	if (state === "undelivered") return base;
	const delivered: Dispatch = {
		...base,
		messageId: `msg-${id}`,
		deliveryState: "delivered",
		state: "delivered-unacked",
	};
	if (state === "delivered-unacked") return delivered;
	return {
		...delivered,
		state: "acked",
		ack: {
			schema_version: 1,
			kind: "brief-ack",
			messageId: delivered.messageId,
			packetId: id,
			packetSha256: base.packetSha256,
			declaredRuntime: { model: "default", effort: "default", source: "self-report" },
			seat: base.to,
			ts: TS,
		},
	};
}

describe("FsDispatchStore — AC-05/AC-08", () => {
	let home: string;

	beforeEach(() => {
		home = mkdtempSync(join(tmpdir(), "pij-dispatch-"));
	});

	afterEach(() => {
		rmSync(home, { recursive: true, force: true });
	});

	it("round-trips all three distinguishable states below dispatches/ sorted by id", () => {
		const store = new FsDispatchStore(home);
		const records = [
			dispatch("dispatch-zeta", "acked"),
			dispatch("dispatch-alpha", "undelivered"),
			dispatch("dispatch-mid", "delivered-unacked"),
		];
		for (const record of records) expect(store.write(record)).toEqual(ok(undefined));
		expect(store.read("dispatch-mid")).toEqual(records[2]);
		expect(store.list().map(({ id, state }) => ({ id, state }))).toEqual([
			{ id: "dispatch-alpha", state: "undelivered" },
			{ id: "dispatch-mid", state: "delivered-unacked" },
			{ id: "dispatch-zeta", state: "acked" },
		]);
		const path = join(home, "dispatches", "dispatch-mid.json");
		expect(existsSync(path)).toBe(true);
		expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(records[2]);
	});

	it("atomically replaces one dispatch as delivery and ack evidence arrives", () => {
		const store = new FsDispatchStore(home);
		const queued = dispatch("dispatch-one", "undelivered");
		const delivered = dispatch("dispatch-one", "delivered-unacked");
		const acked = dispatch("dispatch-one", "acked");
		expect(store.write(queued)).toEqual(ok(undefined));
		expect(store.write(delivered)).toEqual(ok(undefined));
		expect(store.write(acked)).toEqual(ok(undefined));
		expect(store.read(acked.id)).toEqual(acked);
		expect(readdirSync(join(home, "dispatches"))).toEqual(["dispatch-one.json"]);
	});

	it("refuses unsafe ids and obeys the phantom-peer subdirectory law", () => {
		const store = new FsDispatchStore(home);
		expect(store.write(dispatch("../peer"))).toMatchObject({ ok: false, code: "E-ARG" });
		expect(store.read("../peer")).toBeNull();
		expect(readdirSync(home)).toEqual([]);
		expect(store.write(dispatch("dispatch-safe"))).toEqual(ok(undefined));
		expect(readdirSync(home)).toEqual(["dispatches"]);
		expect(new FsRegistry(home).list()).toEqual([]);
	});
});
